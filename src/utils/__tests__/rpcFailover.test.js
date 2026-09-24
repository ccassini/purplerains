import { describe, expect, it } from 'vitest'
import { HttpRequestError, createTransport } from 'viem'
import { createMonadRpcFailover } from '../rpcFailover'

function setup(handlers) {
  let clock = 0
  const calls = []
  const failover = createMonadRpcFailover(Object.keys(handlers), {
    chainId: 143,
    now: () => clock,
    transportFactory: (url) => () => createTransport({
      key: url, name: url, type: 'http', retryCount: 0,
      request: async (args) => {
        calls.push([url, args.method])
        return handlers[url](args)
      },
    }),
  })
  return { ...failover, request: failover.transport({}).request, calls, setTime: (time) => { clock = time } }
}

const rateLimit = (retryAfter) => new HttpRequestError({
  url: 'https://primary.example', status: 429,
  headers: retryAfter == null ? undefined : new Headers({ 'Retry-After': retryAfter }),
})
const respond = ({ method }) => method === 'eth_chainId' ? '0x8f' : 'verified result'

describe('Monad runtime RPC failover', () => {
  it('moves a receipt off a 429 provider and shares cooldown with token and block reads', async () => {
    const rpc = setup({ primary: (args) => { if (args.method === 'eth_chainId') return '0x8f'; throw rateLimit() }, backup: respond })
    expect(await rpc.request({ method: 'eth_getTransactionReceipt' })).toBe('verified result')
    expect(await rpc.request({ method: 'eth_call' })).toBe('verified result')
    expect(await rpc.request({ method: 'eth_blockNumber' })).toBe('verified result')
    expect(rpc.calls.filter(([url]) => url === 'primary')).toEqual([['primary', 'eth_chainId'], ['primary', 'eth_getTransactionReceipt']])
    expect(rpc.getEndpoint()).toBe('backup')
  })

  it('verifies every fallback chain before returning its data and permanently excludes wrong chains', async () => {
    const rpc = setup({ wrong: () => '0x1', backup: respond })
    expect(await rpc.request({ method: 'eth_blockNumber' })).toBe('verified result')
    await rpc.request({ method: 'eth_call' })
    expect(rpc.calls.filter(([url]) => url === 'wrong')).toEqual([['wrong', 'eth_chainId']])
  })

  it('coalesces chain verification across concurrent requests', async () => {
    let verify
    const rpc = setup({ primary: ({ method }) => method === 'eth_chainId' ? new Promise((resolve) => { verify = resolve }) : 'ok' })
    const first = rpc.request({ method: 'eth_call' })
    const second = rpc.request({ method: 'eth_getTransactionReceipt' })
    await Promise.resolve()
    verify('0x8f')
    expect(await Promise.all([first, second])).toEqual(['ok', 'ok'])
    expect(rpc.calls.filter(([, method]) => method === 'eth_chainId')).toHaveLength(1)
  })

  it('attempts each endpoint once without retry storms and makes no calls while all are cooling', async () => {
    const unavailable = ({ method }) => { if (method === 'eth_chainId') return '0x8f'; throw rateLimit() }
    const rpc = setup({ first: unavailable, second: unavailable })
    await expect(rpc.request({ method: 'eth_call' })).rejects.toThrow()
    const calls = rpc.calls.length
    expect(calls).toBe(4)
    await expect(rpc.request({ method: 'eth_getTransactionReceipt' })).rejects.toThrow()
    expect(rpc.calls).toHaveLength(calls)
  })

  it('honors Retry-After and recovers after cooldown', async () => {
    let failed = true
    const rpc = setup({ primary: (args) => { if (args.method === 'eth_chainId') return '0x8f'; if (failed) throw rateLimit('45'); return 'recovered' }, backup: respond })
    await rpc.request({ method: 'eth_call' })
    failed = false
    rpc.setTime(44_999)
    expect(await rpc.request({ method: 'eth_call' })).toBe('verified result')
    rpc.setTime(45_000)
    expect(await rpc.request({ method: 'eth_call' })).toBe('recovered')
    failed = true
    await rpc.request({ method: 'eth_call' })
    expect(rpc.getEndpoint()).toBe('backup')
  })

  it.each([['0', 15_000], ['99999', 120_000], [new Date(45_000).toUTCString(), 45_000]])('bounds Retry-After %s at %i ms', async (header, delay) => {
    let failed = true
    const rpc = setup({ primary: (args) => { if (args.method === 'eth_chainId') return '0x8f'; if (failed) throw rateLimit(header); return 'recovered' }, backup: respond })
    await rpc.request({ method: 'eth_call' })
    failed = false
    rpc.setTime(delay - 1)
    expect(await rpc.request({ method: 'eth_call' })).toBe('verified result')
    rpc.setTime(delay)
    expect(await rpc.request({ method: 'eth_call' })).toBe('recovered')
  })

  it('applies the same cooldown to JSON-RPC rate-limit responses', async () => {
    const rpc = setup({ primary: ({ method }) => { if (method === 'eth_chainId') return '0x8f'; throw Object.assign(new Error('RPC limit exceeded'), { code: -32005 }) }, backup: respond })
    await rpc.request({ method: 'eth_call' })
    await rpc.request({ method: 'eth_getTransactionReceipt' })
    expect(rpc.calls.filter(([url]) => url === 'primary')).toHaveLength(2)
  })

  it('backs off transport failures, without clearing cooldown for an older successful in-flight call', async () => {
    let resolveOld
    let fail = false
    const rpc = setup({ primary: ({ method }) => {
      if (method === 'eth_chainId') return '0x8f'
      if (fail) throw new TypeError('Failed to fetch')
      return new Promise((resolve) => { resolveOld = resolve })
    }, backup: respond })
    await rpc.request({ method: 'eth_chainId' })
    const old = rpc.request({ method: 'eth_call' })
    await Promise.resolve()
    fail = true
    await rpc.request({ method: 'eth_getTransactionReceipt' })
    resolveOld('old success')
    await old
    const priorCalls = rpc.calls.filter(([url]) => url === 'primary').length
    await rpc.request({ method: 'eth_blockNumber' })
    expect(rpc.calls.filter(([url]) => url === 'primary')).toHaveLength(priorCalls)
  })

  it('does not fan out execution reverts or quarantine a healthy provider for contract errors', async () => {
    let revert = true
    const rpc = setup({ primary: (args) => { if (args.method === 'eth_chainId') return '0x8f'; if (revert) throw Object.assign(new Error('execution reverted'), { code: 3 }); return 'ok' }, backup: respond })
    await expect(rpc.request({ method: 'eth_call' })).rejects.toThrow()
    expect(rpc.calls.some(([url]) => url === 'backup')).toBe(false)
    revert = false
    expect(await rpc.request({ method: 'eth_blockNumber' })).toBe('ok')
  })
})
