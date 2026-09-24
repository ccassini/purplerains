import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createPerplContextLoader, createPerplStreamHandler, perplSubscriptions } from '../../../api/_lib/perplRelay'

const context = { chain: { chain_id: 143 }, tokens: [], instances: [], markets: [{ id: 1, config: { is_open: true } }, { id: 10, config: { is_open: true } }, { id: 80, config: { is_open: false } }] }
const response = () => Object.assign(new EventEmitter(), { setHeader: vi.fn(), flushHeaders: vi.fn(), write: vi.fn(() => true), end: vi.fn(), destroyed: false, writableEnded: false })
afterEach(() => vi.useRealTimers())

describe('Perpl public relay', () => {
  test('subscribes only to public configured mainnet markets within the 16 subscription limit', () => {
    const frame = perplSubscriptions(context)
    expect(frame).toEqual({ mt: 5, subs: ['market-state@143', 'funding@143', 'trades@1', 'trades@10'].map(stream => ({ stream, subscribe: true })) })
    expect(() => perplSubscriptions({ ...context, chain: { chain_id: 1 } })).toThrow()
    expect(() => perplSubscriptions({ ...context, markets: Array.from({ length: 15 }, (_, i) => ({ id: i + 1 })) })).toThrow()
  })
  test('coalesces and briefly caches public context without returning unrelated profile fields', async () => {
    let now = 0
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ ...context, private: 'not relayed' }) }))
    const load = createPerplContextLoader({ fetchFn, now: () => now })
    const [a, b] = await Promise.all([load(), load()])
    expect(a).toEqual(context); expect(b).toBe(a); expect(fetchFn).toHaveBeenCalledTimes(1)
    await load(); expect(fetchFn).toHaveBeenCalledTimes(1)
    now = 31_000; await load(); expect(fetchFn).toHaveBeenCalledTimes(2)
  })
  test('forwards valid frames, renews before the function deadline and cleans up on disconnect', async () => {
    vi.useFakeTimers()
    const socket = Object.assign(new EventEmitter(), { send: vi.fn(), terminate: vi.fn(), pause: vi.fn(), resume: vi.fn() })
    const res = response()
    const handler = createPerplStreamHandler({ loadContext: async () => context, socketFactory: () => socket, lifetimeMs: 1000 })
    const running = handler({ method: 'GET' }, res)
    await Promise.resolve(); socket.emit('open')
    expect(JSON.parse(socket.send.mock.calls[0][0])).toEqual(perplSubscriptions(context))
    socket.emit('message', JSON.stringify({ mt: 18, d: [] }), false)
    socket.emit('message', 'malformed', false)
    expect(res.write.mock.calls.some(([s]) => s.includes('data: {"mt":18'))).toBe(true)
    await vi.advanceTimersByTimeAsync(1000); await running
    expect(socket.terminate).toHaveBeenCalledOnce(); expect(res.end).toHaveBeenCalledOnce()
    expect(socket.listenerCount('message')).toBe(0); expect(vi.getTimerCount()).toBe(0)
  })
  test('a slow client pauses upstream until drain; client close releases the socket', async () => {
    vi.useFakeTimers()
    const socket = Object.assign(new EventEmitter(), { send: vi.fn(), terminate: vi.fn(), pause: vi.fn(), resume: vi.fn() })
    const res = response()
    const running = createPerplStreamHandler({ loadContext: async () => context, socketFactory: () => socket })({ method: 'GET' }, res)
    await Promise.resolve()
    res.write.mockReturnValueOnce(false)
    socket.emit('message', '{"mt":18}', false)
    expect(socket.pause).toHaveBeenCalledOnce()
    res.emit('drain'); expect(socket.resume).toHaveBeenCalledOnce()
    res.emit('close'); await running
    expect(socket.terminate).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
  })
  test('rejects mutation requests without opening a socket', async () => {
    const factory = vi.fn()
    const res = response()
    await createPerplStreamHandler({ socketFactory: factory })({ method: 'POST' }, res)
    expect(res.statusCode).toBe(405); expect(factory).not.toHaveBeenCalled()
  })
  test('keeps transient context errors retryable for EventSource', async () => {
    const factory = vi.fn()
    const res = response()
    await createPerplStreamHandler({ loadContext: async () => { throw new Error('timeout') }, socketFactory: factory })({ method: 'GET' }, res)
    expect(res.statusCode).toBe(200)
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream; charset=utf-8')
    expect(res.write).toHaveBeenCalledWith('retry: 3000\n\n')
    expect(res.end.mock.calls[0][0]).toContain('event: relay-status')
    expect(factory).not.toHaveBeenCalled()
  })
})
