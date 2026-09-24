import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPriceFeedSockets } from '../priceFeedSockets'

const controllers = []

function setup(overrides = {}) {
  const sockets = []
  const updateSource = vi.fn()
  const pushTrade = vi.fn()
  const venue = {
    key: 'exchange',
    buildStream: symbol => `wss://exchange.example/${symbol}`,
    parseTrade: msg => msg.trade,
    ...overrides,
  }
  const createWebSocket = vi.fn((url) => {
    const socket = {
      url,
      send: vi.fn(),
      close: vi.fn(function () { this.onclose?.() }),
    }
    sockets.push(socket)
    return socket
  })
  const feed = createPriceFeedSockets({ venues: [venue], symbol: 'MONUSDT', createWebSocket, updateSource, pushTrade })
  controllers.push(feed)
  return { feed, sockets, updateSource, pushTrade }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  controllers.splice(0).forEach(feed => feed.dispose())
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('Price venue connection lifecycle', () => {
  it('does not reconnect when disposing fires a socket close event', async () => {
    const { feed, sockets } = setup()
    feed.dispose()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(sockets).toHaveLength(1)
    expect(sockets[0].close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears a pending retry on disposal and ignores already queued socket handlers', async () => {
    const { feed, sockets, updateSource, pushTrade } = setup()
    const old = { open: sockets[0].onopen, close: sockets[0].onclose, message: sockets[0].onmessage, error: sockets[0].onerror }
    old.close()
    expect(vi.getTimerCount()).toBe(1)
    feed.dispose()
    updateSource.mockClear()
    old.open()
    old.error()
    old.message({ data: JSON.stringify({ trade: { price: 1, qty: 2 } }) })
    old.close()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(sockets).toHaveLength(1)
    expect(updateSource).not.toHaveBeenCalled()
    expect(pushTrade).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('drops asynchronous parser results after the page has unmounted', () => {
    let complete
    const { feed, sockets, pushTrade, updateSource } = setup({ parseEventData: (_data, callback) => { complete = callback } })
    sockets[0].onmessage({ data: new Uint8Array([1]) })
    feed.dispose()
    updateSource.mockClear()
    complete({ trade: { price: 2, qty: 3, time: 10, side: 'buy' } })
    expect(pushTrade).not.toHaveBeenCalled()
    expect(updateSource).not.toHaveBeenCalled()
  })

  it('drops asynchronous results from a replaced socket while accepting the replacement', async () => {
    const completions = []
    const { feed, sockets, pushTrade } = setup({ parseEventData: (_data, callback) => { completions.push(callback) } })
    sockets[0].onmessage({ data: 'old' })
    feed.reconnectAll()
    await vi.advanceTimersByTimeAsync(500)
    expect(sockets).toHaveLength(2)
    sockets[1].onmessage({ data: 'new' })
    const trade = { price: 2, qty: 3, time: 10, side: 'buy' }
    completions[0]({ trade })
    completions[1]({ trade: { ...trade, price: 4 } })
    expect(pushTrade).toHaveBeenCalledTimes(1)
    expect(pushTrade).toHaveBeenCalledWith('exchange', 4, 3, 10, 'buy', true)
  })

  it('retries a network close once, then resets its delay after an open', async () => {
    const { sockets } = setup()
    const close = sockets[0].onclose
    close(); close()
    await vi.advanceTimersByTimeAsync(399)
    expect(sockets).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(sockets).toHaveLength(2)
    sockets[1].onclose()
    await vi.advanceTimersByTimeAsync(799)
    expect(sockets).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(sockets).toHaveLength(3)
    sockets[2].onopen()
    sockets[2].onclose()
    await vi.advanceTimersByTimeAsync(400)
    expect(sockets).toHaveLength(4)
  })

  it('manual reconnect cannot revive a disposed controller', async () => {
    const { feed, sockets } = setup()
    feed.dispose()
    feed.reconnectAll()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(sockets).toHaveLength(1)
  })

  it('keeps subscriptions and venue ping responses working', () => {
    const subscribe = vi.fn((socket, symbol) => socket.send(`subscribe:${symbol}`))
    const { sockets } = setup({ key: 'lbank', buildStream: () => ({ url: 'wss://exchange.example', subscribe }), binaryType: 'arraybuffer' })
    sockets[0].onopen()
    expect(subscribe).toHaveBeenCalledWith(sockets[0], 'MONUSDT')
    expect(sockets[0].binaryType).toBe('arraybuffer')
    sockets[0].onmessage({ data: '{"action":"ping","ping":123}' })
    expect(sockets[0].send).toHaveBeenCalledWith('{"action":"pong","pong":123}')
  })
})
