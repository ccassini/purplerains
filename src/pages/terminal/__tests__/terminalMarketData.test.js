import { describe, expect, it } from 'vitest'
import { chooseTokenPool, createPoolSampler, geckoTradeContext, normalizeMarketSnapshots, retainMarketSnapshots } from '../terminalMarketData'

const gecko = (address, values = {}) => ({
  id: `monad_${address}`, type: 'pool',
  attributes: { address, name: 'MON / USDC', volume_usd: { h1: '10', h24: '240' }, ...values },
})
const snapshot = (data, fetchedAt) => ({ data: [data], included: [], fetchedAt })

describe('terminal market coverage', () => {
  it('retains last successful sources with their original age during partial failures', () => {
    const previous = { top: snapshot(gecko('0xa'), 100), fresh: snapshot(gecko('0xb'), 200) }
    const updated = snapshot(gecko('0xc'), 300)
    expect(retainMarketSnapshots(previous, { top: null, fresh: updated })).toEqual({ top: previous.top, fresh: updated })
    expect(retainMarketSnapshots(previous, { top: previous.top, fresh: null })).toBe(previous)
  })

  it('includes the second discovery page and focused pools, reprojects the requested window, and keeps newest data', () => {
    const snapshots = {
      gecko: { top: snapshot(gecko('0xa', { reserve_in_usd: '1000' }), 100), topNext: snapshot(gecko('0xb'), 100) },
      dex: null,
      focused: [{ kind: 'gecko', payload: snapshot(gecko('0xa', { reserve_in_usd: '500' }), 200) }, { kind: 'gecko', payload: snapshot(gecko('0xc'), 200) }],
    }
    const hourly = normalizeMarketSnapshots(snapshots, 'h1').pools
    expect(hourly.map((pool) => pool.address).sort()).toEqual(['0xa', '0xb', '0xc'])
    expect(hourly.find((pool) => pool.address === '0xa')).toMatchObject({ tvl: 500, fetchedAt: 200, volume: 10 })
    expect(normalizeMarketSnapshots(snapshots, 'h24').pools.every((pool) => pool.volume === 240)).toBe(true)
  })

  it('chooses a token pool by exact contract and liquidity, never by symbol', () => {
    const pools = [
      { address: 'fake', tvl: 999, base: { address: '0xfake', symbol: 'MON' } },
      { address: 'thin', tvl: 1, base: { address: '0xABC' } },
      { address: 'deep', tvl: 100, quote: { address: '0xabc' } },
    ]
    expect(chooseTokenPool(pools, '0xabc').address).toBe('deep')
    expect(chooseTokenPool(pools, 'missing')).toBeNull()
  })

  it('preserves fresh membership while sharing the newest price with the main pool view', () => {
    const result = normalizeMarketSnapshots({
      gecko: { top: snapshot(gecko('0xa', { base_token_price_usd: '2' }), 200), fresh: snapshot(gecko('0xa', { base_token_price_usd: '1' }), 100) },
      dex: null, focused: [],
    }, 'h24')
    expect(result.fresh).toEqual(result.pools)
    expect(result.fresh[0]).toMatchObject({ price: 2, fetchedAt: 200 })
  })

  it('combines complete DEX token-pool lists and keeps the failed discovery source at its original age', () => {
    const pair = (address) => ({ pairAddress: address, chainId: 'monad', baseToken: { address: '0xbase' } })
    const previous = { tokenA: { pairs: [pair('0xa'), pair('0xb')], fetchedAt: 100 }, tokenB: { pairs: [pair('0xc')], fetchedAt: 100 } }
    const next = retainMarketSnapshots(previous, { tokenA: { pairs: [pair('0xa'), pair('0xb')], fetchedAt: 200 } }, ['tokenA', 'tokenB'])
    expect(next.tokenB).toBe(previous.tokenB)
    const result = normalizeMarketSnapshots({ gecko: {}, dex: next, focused: [] }, 'h24').pools
    expect(result.map((pool) => [pool.address, pool.fetchedAt])).toEqual([['0xa', 200], ['0xb', 200], ['0xc', 100]])
    expect(retainMarketSnapshots(next, next, ['tokenA', 'tokenB'])).toBe(next)
  })

  it('rotates background pools fairly when volume ranks change and leaves the selection to its priority poll', () => {
    const sampler = createPoolSampler(3)
    const pools = [{ address: 'a', volume: 30 }, { address: 'b', volume: 20 }, { address: 'c', volume: 10 }]
    expect(sampler.next(pools).address).toBe('a')
    expect(sampler.next([...pools].reverse().map((pool, index) => ({ ...pool, volume: 100 - index }))).address).toBe('b')
    expect(sampler.next(pools).address).toBe('c')
    expect(sampler.next(pools, 'a').address).toBe('b')
    expect(sampler.next([], 'a')).toBeNull()
    expect(sampler.next([pools[0]], 'a').address).toBe('a')
  })

  it('passes token contracts with symbols so trade metadata cannot follow the wrong asset', () => {
    expect(geckoTradeContext({ address: 'pool', base: { address: '0xABC', symbol: 'MON' }, quote: { address: '0xDEF', symbol: 'USD' }, mcap: 10, mcapBasis: 'fdv' }))
      .toMatchObject({ poolAddress: 'pool', baseAddress: '0xABC', quoteAddress: '0xDEF', symbols: { '0xabc': 'MON', '0xdef': 'USD' }, mcapBasis: 'fdv' })
  })
})
