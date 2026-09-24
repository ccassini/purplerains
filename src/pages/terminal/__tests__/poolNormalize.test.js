import { describe, expect, test } from 'vitest'
import { marksFromPools, mergePools, normalizeDexPair, normalizeGeckoPool, sortPools } from '../poolNormalize'
import { computeDislocations } from '../marketMath'

const geckoPool = {
  id: 'monad_0xabc',
  attributes: {
    address: '0xABC',
    name: 'WMON / USDC 0.3%',
    base_token_price_usd: '0.5',
    reserve_in_usd: '1000',
    fdv_usd: '2000',
    pool_created_at: '2026-01-01T00:00:00Z',
    volume_usd: { h1: '10', h24: '100' },
    price_change_percentage: { h1: '1', h24: '3.04' },
    transactions: { h24: { buys: 2, sells: 3 } },
  },
  relationships: {
    base_token: { data: { id: 'monad_0xbase', type: 'token' } },
    quote_token: { data: { id: 'monad_0xquote', type: 'token' } },
    dex: { data: { id: 'uniswap-v4-monad', type: 'dex' } },
  },
}

const included = [
  { id: 'monad_0xbase', type: 'token', attributes: { address: '0xbase', symbol: 'WMON', name: 'WMON' } },
  { id: 'monad_0xquote', type: 'token', attributes: { address: '0xquote', symbol: 'USDC', name: 'USDC' } },
  { id: 'uniswap-v4-monad', type: 'dex', attributes: { name: 'Uniswap V4 (Monad)' } },
]

describe('normalizeGeckoPool', () => {
  test('keeps protocol, fee and 24h stats without turning missing LP counts into zero', () => {
    const row = normalizeGeckoPool(geckoPool, included, 'h24')
    expect(row.proto).toBe('v4')
    expect(row.feePct).toBe(0.3)
    expect(row.tvl).toBe(1000)
    expect(row.volume).toBe(100)
    expect(row.fees).toBeCloseTo(0.3, 8)
    expect(row.swaps).toBe(5)
    expect(row.lpCount).toBeNull()
    expect(row.netFlow).toBeNull()
    expect(row.base.symbol).toBe('WMON')
    expect(row.address).toBe('0xabc')
  })

  test('a missing reserve stays null rather than $0 TVL', () => {
    const row = normalizeGeckoPool(
      { ...geckoPool, attributes: { ...geckoPool.attributes, reserve_in_usd: null } },
      included,
      'h24',
    )
    expect(row.tvl).toBeNull()
  })

  test('retains snapshot provenance, actual quote price, and market cap separately from FDV', () => {
    const row = normalizeGeckoPool({ ...geckoPool, attributes: { ...geckoPool.attributes, quote_token_price_usd: '0.98', market_cap_usd: '900' } }, included, 'h24', { fetchedAt: 1234, fromCache: true })
    expect(row).toMatchObject({ source: 'gecko', provider: 'GeckoTerminal', fetchedAt: 1234, fromCache: true, quotePrice: 0.98, marketCap: 900, fdv: 2000, mcap: 900, mcapBasis: 'market_cap' })
    const fallback = normalizeGeckoPool(geckoPool, included)
    expect(fallback).toMatchObject({ marketCap: null, fdv: 2000, mcap: 2000, mcapBasis: 'fdv', fetchedAt: null, quotePrice: null })
  })

  test('does not turn missing transaction counts into zero or a partial total', () => {
    for (const counts of [{}, { buys: 3 }, { buys: null, sells: 2 }]) {
      const row = normalizeGeckoPool({ ...geckoPool, attributes: { ...geckoPool.attributes, transactions: { h24: counts } } }, included)
      expect(row.swaps).toBeNull()
    }
    expect(normalizeGeckoPool({ ...geckoPool, attributes: { ...geckoPool.attributes, transactions: { h24: { buys: 0, sells: 0 } } } }, included).swaps).toBe(0)
  })

  test('does not attach invalid timestamps or turn absent provenance into a fresh response', () => {
    expect(normalizeGeckoPool(geckoPool, included, 'h24', { fetchedAt: Infinity })).toMatchObject({ fetchedAt: null, fromCache: false })
    expect(normalizeGeckoPool(geckoPool, included, 'h24', { fetchedAt: -1 })).toMatchObject({ fetchedAt: null })
  })
})

describe('normalizeDexPair', () => {
  const pair = { chainId: 'monad', pairAddress: '0xabc', baseToken: { address: '0xbase', symbol: 'MON' }, quoteToken: { address: '0xquote', symbol: 'USDC' }, priceUsd: '4', priceNative: '2', marketCap: 0, fdv: 2000 }
  test('retains provider provenance and a known zero market cap', () => {
    expect(normalizeDexPair(pair, 'h1', { fetchedAt: 2345, fromCache: false })).toMatchObject({ provider: 'DEX Screener', source: 'dexscreener', fetchedAt: 2345, fromCache: false, marketCap: 0, fdv: 2000, mcap: 0, mcapBasis: 'market_cap' })
  })
  test('does not infer a quote USD price from undocumented priceNative denomination', () => {
    expect(normalizeDexPair(pair).quotePrice).toBeNull()
  })
  test('keeps incomplete buy/sell totals unknown', () => {
    expect(normalizeDexPair({ ...pair, txns: { h24: { buys: 5 } } }).swaps).toBeNull()
    expect(normalizeDexPair({ ...pair, txns: { h24: { buys: 5, sells: 0 } } }).swaps).toBe(5)
  })
})

describe('mergePools / sortPools', () => {
  test('dedupes by pool id and keeps the richer TVL snapshot', () => {
    const a = normalizeGeckoPool(geckoPool, included, 'h24')
    const b = { ...a, tvl: 50, volume: 9 }
    const merged = mergePools([b, a])
    expect(merged).toHaveLength(1)
    expect(merged[0].tvl).toBe(1000)
  })

  test('a newer lower-liquidity snapshot wins without mixing older values into it', () => {
    const old = { id: 'pool', fetchedAt: 100, tvl: 1000, volume: 200, price: 2, source: 'gecko', oldOnly: 'stale' }
    const recent = { id: 'pool', fetchedAt: 200, tvl: 100, volume: null, price: 1, source: 'dexscreener' }
    expect(mergePools([old, recent])).toEqual([recent])
    expect(mergePools([recent, old])).toEqual([recent])
  })

  test('known snapshot age wins over unknown age and Gecko breaks equal-time provider ties', () => {
    const known = { id: 'pool', source: 'gecko', fetchedAt: 200, tvl: 100 }
    expect(mergePools([{ id: 'pool', tvl: 10000 }, known])).toEqual([known])
    expect(mergePools([known, { id: 'pool', tvl: 10000 }])).toEqual([known])
    expect(mergePools([known, { id: 'pool', source: 'dexscreener', fetchedAt: 200, tvl: 10000 }])).toEqual([known])
    expect(mergePools([{ id: 'pool', source: 'dexscreener', fetchedAt: 200, tvl: 10000 }, known])).toEqual([known])
  })

  test('sorts fees descending with nulls last', () => {
    const sorted = sortPools(
      [
        { id: 'a', fees: 1, tvl: 1 },
        { id: 'b', fees: 5, tvl: 1 },
        { id: 'c', fees: null, tvl: 9 },
      ],
      'fees',
      'desc',
    )
    expect(sorted.map((r) => r.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('marksFromPools', () => {
  test('uses actual quote USD price and never infers a dollar peg from its symbol', () => {
    const unknown = marksFromPools([{ base: { address: 'base' }, quote: { address: 'quote', symbol: 'FAKEUSD' }, price: 2, mcap: 500, tvl: 100 }])
    expect(unknown.quote.usd).toBeNull()
    expect(unknown.quote.mcap).toBeUndefined()
    const quoted = marksFromPools([{ base: { address: 'base' }, quote: { address: 'quote', symbol: 'USDC' }, price: 2, quotePrice: 0.98, mcap: 500, tvl: 100 }])
    expect(quoted.quote.usd).toBe(0.98)
    expect(quoted.quote.mcap).toBeUndefined()
    expect(quoted.base.mcap).toBe(500)
  })

  test('an unpriced liquid candidate cannot overwrite an evidenced token price', () => {
    const priced = { base: { address: 'token', symbol: 'TOK' }, quote: { address: 'a' }, price: 4, mcap: 50, tvl: 10 }
    const unpriced = { base: { address: 'b' }, quote: { address: 'token', symbol: 'TOK' }, price: 20, mcap: 999, tvl: 1000 }
    for (const pools of [[priced, unpriced], [unpriced, priced]]) {
      const mark = marksFromPools(pools).token
      expect(mark).toMatchObject({ usd: 4, mcap: 50, liquidity: 10 })
    }
  })

  test('prefers greater liquidity among priced candidates and never borrows another base token market cap', () => {
    const pools = [
      { base: { address: 'token' }, price: 4, mcap: 50, tvl: 10 },
      { base: { address: 'other' }, quote: { address: 'token' }, price: 100, quotePrice: 5, mcap: 999, tvl: 100 },
    ]
    for (const order of [pools, pools.slice().reverse()]) {
      expect(marksFromPools(order).token).toMatchObject({ usd: 5, liquidity: 100, mcap: 50 })
    }
  })

  test('ignores invalid prices rather than poisoning finite marks', () => {
    const mark = marksFromPools([
      { base: { address: 'token' }, price: 0, tvl: 10 },
      { base: { address: 'token' }, price: Infinity, tvl: 1000 },
      { base: { address: 'token' }, price: -2, tvl: 2000 },
    ]).token
    expect(mark.usd).toBe(0)
  })
})

describe('computeDislocations', () => {
  test('reports the percent spread between venues of the same pair', () => {
    const rows = computeDislocations([
      { pairKey: 'USDC/WMON', pair: 'USDC/WMON', base: { address: '0xusdc' }, quote: { address: '0xwmon' }, price: 1.0, dexName: 'uni', tvl: 100, fees: 1, address: '0x1', proto: 'v4' },
      { pairKey: 'USDC/WMON', pair: 'USDC/WMON', base: { address: '0xusdc' }, quote: { address: '0xwmon' }, price: 1.1, dexName: 'cake', tvl: 80, fees: 1, address: '0x2', proto: 'v3' },
      { pairKey: 'CHOG/MON', price: 2, dexName: 'solo', tvl: 10, address: '0x3', proto: 'v2' },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].pools).toBe(2)
    expect(rows[0].spreadPct).toBeCloseTo((0.1 / 1.05) * 100, 6)
    expect(rows[0].buyAt).toBe('uni')
    expect(rows[0].sellAt).toBe('cake')
  })
})
