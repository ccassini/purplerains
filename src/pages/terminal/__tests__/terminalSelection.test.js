import { describe, expect, it, vi } from 'vitest'
import { loadTerminalSelection } from '../terminalSelection'

const POOL = `0x${'1'.repeat(40)}`
const OTHER_POOL = `0x${'2'.repeat(40)}`
const TOKEN = `0x${'a'.repeat(40)}`
const QUOTE = `0x${'b'.repeat(40)}`
const UNKNOWN = `0x${'c'.repeat(40)}`
const pair = (pool = POOL, base = TOKEN, tvl = 1000) => ({ chainId: 'monad', pairAddress: pool, baseToken: { address: base, symbol: 'BASE' }, quoteToken: { address: QUOTE, symbol: 'QUOTE' }, liquidity: { usd: tvl }, priceUsd: '2', volume: { h24: 100, h1: 10 } })
const dexPayload = (pairs = [pair()]) => ({ pairs, fetchedAt: 500, fromCache: false })
const geckoPayload = (pool = POOL, token = TOKEN) => ({
  data: { id: `monad_${pool}`, type: 'pool', attributes: { address: pool, name: 'BASE / QUOTE', reserve_in_usd: '2000', base_token_price_usd: '3', volume_usd: { h24: '200', h1: '20' } }, relationships: { base_token: { data: { id: `monad_${token}` } }, quote_token: { data: { id: `monad_${QUOTE}` } } } },
  included: [{ id: `monad_${token}`, type: 'token', attributes: { address: token, symbol: 'BASE' } }, { id: `monad_${QUOTE}`, type: 'token', attributes: { address: QUOTE, symbol: 'QUOTE' } }], fetchedAt: 1000, fromCache: false,
})
const knownPool = (address = POOL, token = TOKEN, tvl = 50) => ({ id: address, address, base: { address: token }, quote: { address: QUOTE }, tvl })
const makeApis = (overrides = {}) => ({
  fetchGeckoPool: vi.fn(async (pool) => geckoPayload(pool)),
  fetchGeckoTrades: vi.fn(async () => ({ data: [{ id: 'trade' }], fetchedAt: 1000, fromCache: false })),
  fetchMonadTokenPairs: vi.fn(async () => dexPayload()),
  fetchMonadPairs: vi.fn(async (ids) => dexPayload([pair(ids[0])])),
  ...overrides,
})
const errorOf = (promise) => promise.then(() => null, (error) => error)

describe('selected market loading', () => {
  it('starts detail and trade requests together even for a pool outside the index', async () => {
    let finishDetail
    const apis = makeApis({ fetchGeckoPool: vi.fn(() => new Promise((resolve) => { finishDetail = resolve })) })
    const signal = new AbortController().signal
    const pending = loadTerminalSelection({ selected: { type: 'pool', id: POOL }, pools: [], window: 'h1', signal }, apis)
    expect(apis.fetchGeckoPool).toHaveBeenCalledWith(POOL, { signal })
    expect(apis.fetchGeckoTrades).toHaveBeenCalledWith(POOL, { signal })
    finishDetail(geckoPayload())
    const result = await pending
    expect(result).toMatchObject({ poolId: POOL, pool: { address: POOL, volume: 20, fetchedAt: 1000 }, trades: { data: [{ id: 'trade' }] }, tradeError: null, metadataError: null })
    expect(result.snapshots).toEqual([{ key: `pool:${POOL}:gecko`, kind: 'gecko', payload: geckoPayload() }])
    expect(apis.fetchMonadPairs).not.toHaveBeenCalled()
  })

  it('uses the highest-liquidity exact token pool already in the index', async () => {
    const apis = makeApis()
    const pools = [knownPool(POOL, TOKEN, 10), knownPool(OTHER_POOL, TOKEN, 100), knownPool(`0x${'3'.repeat(40)}`, UNKNOWN, 10000)]
    const result = await loadTerminalSelection({ selected: { type: 'token', id: TOKEN.toUpperCase() }, pools }, apis)
    expect(result.poolId).toBe(OTHER_POOL)
    expect(apis.fetchMonadTokenPairs).not.toHaveBeenCalled()
    expect(apis.fetchGeckoTrades).toHaveBeenCalledWith(OTHER_POOL, { signal: undefined })
  })

  it('discovers an unknown token and chooses an exact match over unrelated higher liquidity', async () => {
    const discovered = dexPayload([pair(OTHER_POOL, UNKNOWN, 10000), pair(POOL, TOKEN, 100)])
    const apis = makeApis({ fetchMonadTokenPairs: vi.fn(async () => discovered) })
    const result = await loadTerminalSelection({ selected: { type: 'token', id: TOKEN }, pools: [] }, apis)
    expect(result.poolId).toBe(POOL)
    expect(result.snapshots[0]).toEqual({ key: `token:${TOKEN}`, kind: 'dex', payload: discovered })
    expect(apis.fetchGeckoPool).toHaveBeenCalledWith(POOL, { signal: undefined })
  })

  it('falls back to exact DEX metadata without dropping successful trades', async () => {
    const apis = makeApis({ fetchGeckoPool: vi.fn(async () => { throw new Error('Gecko unavailable') }) })
    const result = await loadTerminalSelection({ selected: { type: 'pool', id: POOL }, pools: [] }, apis)
    expect(result.pool).toMatchObject({ address: POOL, source: 'dexscreener', fetchedAt: 500 })
    expect(result.trades.data).toHaveLength(1)
    expect(result.metadataError).toBe(null)
    expect(result.snapshots).toEqual([{ key: `pool:${POOL}:dex`, kind: 'dex', payload: dexPayload() }])
    expect(apis.fetchMonadPairs).toHaveBeenCalledWith([POOL], { signal: undefined })
  })

  it('returns successful metadata when the trade request fails', async () => {
    const apis = makeApis({ fetchGeckoTrades: vi.fn(async () => { throw new Error('Trades rate limited') }) })
    const result = await loadTerminalSelection({ selected: { type: 'pool', id: POOL } }, apis)
    expect(result.pool.address).toBe(POOL)
    expect(result.trades).toBe(null)
    expect(result.tradeError).toMatch(/Trades rate limited/)
    expect(result.metadataError).toBe(null)
  })

  it('retains known metadata and returns trades with a distinct metadata failure', async () => {
    const oldPool = knownPool()
    const apis = makeApis({ fetchGeckoPool: vi.fn(async () => { throw new Error('Gecko unavailable') }), fetchMonadPairs: vi.fn(async () => { throw new Error('DEX unavailable') }) })
    const result = await loadTerminalSelection({ selected: { type: 'pool', id: POOL }, pools: [oldPool] }, apis)
    expect(result.pool).toBe(oldPool)
    expect(result.trades.data).toHaveLength(1)
    expect(result.metadataError).toMatch(/Gecko unavailable.*DEX unavailable/)
    expect(result.snapshots).toEqual([])
    expect(result.tradeError).toBe(null)
  })

  it('rejects token discovery failure without treating the token address as a pool', async () => {
    const apis = makeApis({ fetchMonadTokenPairs: vi.fn(async () => { throw new Error('404 not found') }) })
    await expect(loadTerminalSelection({ selected: { type: 'token', id: TOKEN } }, apis)).rejects.toThrow(/token.*404|404.*token/i)
    expect(apis.fetchGeckoPool).not.toHaveBeenCalled()
    expect(apis.fetchGeckoTrades).not.toHaveBeenCalled()
  })

  it('rejects discovery with no matching token and never chooses a different token', async () => {
    const apis = makeApis({ fetchMonadTokenPairs: vi.fn(async () => dexPayload([pair(POOL, UNKNOWN)])) })
    await expect(loadTerminalSelection({ selected: { type: 'token', id: TOKEN } }, apis)).rejects.toThrow(/no.*pool.*token/i)
    expect(apis.fetchGeckoPool).not.toHaveBeenCalled()
    expect(apis.fetchGeckoTrades).not.toHaveBeenCalled()
  })

  it('rejects wrong-pool metadata from both providers without manufacturing a row', async () => {
    const apis = makeApis({ fetchGeckoPool: vi.fn(async () => geckoPayload(OTHER_POOL)), fetchMonadPairs: vi.fn(async () => dexPayload([pair(OTHER_POOL)])) })
    const result = await loadTerminalSelection({ selected: { type: 'pool', id: POOL } }, apis)
    expect(result.pool).toBe(null)
    expect(result.metadataError).toMatch(/matching|requested/i)
    expect(result.snapshots).toEqual([])
    expect(result.trades.data).toHaveLength(1)
  })

  it('does not accept changed pool metadata that no longer contains the selected token', async () => {
    const oldPool = knownPool()
    const apis = makeApis({ fetchGeckoPool: vi.fn(async () => geckoPayload(POOL, UNKNOWN)), fetchMonadPairs: vi.fn(async () => dexPayload([pair(POOL, UNKNOWN)])) })
    const result = await loadTerminalSelection({ selected: { type: 'token', id: TOKEN }, pools: [oldPool] }, apis)
    expect(result.pool).toBe(oldPool)
    expect(result.metadataError).toMatch(/matching|requested/i)
    expect(result.snapshots).toEqual([])
  })

  it.each(['resolve', 'reject'])('aborting a late DEX fallback prevents stale selection data when it will %s', async (outcome) => {
    let settle
    let fallbackStarted
    const started = new Promise((resolve) => { fallbackStarted = resolve })
    const apis = makeApis({
      fetchGeckoPool: vi.fn(async () => { throw new Error('Gecko unavailable') }),
      fetchMonadPairs: vi.fn(() => { fallbackStarted(); return new Promise((resolve, reject) => { settle = outcome === 'resolve' ? resolve : reject }) }),
    })
    const controller = new AbortController()
    const pending = errorOf(loadTerminalSelection({ selected: { type: 'pool', id: POOL }, signal: controller.signal }, apis))
    await started
    controller.abort()
    settle(outcome === 'resolve' ? dexPayload() : new Error('late failure'))
    expect((await pending).name).toBe('AbortError')
  })

  it('does not start fallback or trades when token discovery completes after cancellation', async () => {
    let finishDiscovery
    const apis = makeApis({ fetchMonadTokenPairs: vi.fn(() => new Promise((resolve) => { finishDiscovery = resolve })) })
    const controller = new AbortController()
    const pending = errorOf(loadTerminalSelection({ selected: { type: 'token', id: TOKEN }, signal: controller.signal }, apis))
    controller.abort()
    finishDiscovery(dexPayload())
    expect((await pending).name).toBe('AbortError')
    expect(apis.fetchGeckoPool).not.toHaveBeenCalled()
    expect(apis.fetchGeckoTrades).not.toHaveBeenCalled()
  })

  it('cancels before any request and rejects foreign/path-like identifiers locally', async () => {
    const apis = makeApis()
    const controller = new AbortController()
    controller.abort()
    await expect(loadTerminalSelection({ selected: { type: 'pool', id: POOL }, signal: controller.signal }, apis)).rejects.toMatchObject({ name: 'AbortError' })
    await expect(loadTerminalSelection({ selected: { type: 'pool', id: `eth_${POOL}` } }, apis)).rejects.toThrow(/invalid/i)
    expect(apis.fetchGeckoPool).not.toHaveBeenCalled()
    expect(apis.fetchGeckoTrades).not.toHaveBeenCalled()
  })
})
