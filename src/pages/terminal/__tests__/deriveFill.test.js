import { describe, expect, test } from 'vitest'
import { fillFromChainTx, fillFromGeckoTrade } from '../deriveFill'

describe('fillFromGeckoTrade', () => {
  const buy = {
    id: 'monad_1_0xabc_27_1',
    attributes: {
      block_number: 10,
      tx_hash: '0xabc',
      tx_from_address: '0xAAA',
      from_token_amount: '100',
      to_token_amount: '50',
      price_to_in_usd: '2',
      volume_in_usd: '100',
      block_timestamp: '2026-09-17T00:00:00Z',
      kind: 'buy',
      from_token_address: '0x754704bc059f8c67012fed69bc8a327a5aafb603',
      to_token_address: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a',
    },
  }

  test('maps a gecko buy onto the asset token with indexer USD', () => {
    const fill = fillFromGeckoTrade(buy, { pair: 'WMON / USDC', proto: 'v4' })
    expect(fill.side).toBe('buy')
    expect(fill.kind).toBe('swap')
    expect(fill.usd).toBe(100)
    expect(fill.amount).toBe(50)
    expect(fill.token).toBe('0x3bd359c1119da7da1d913d1c4d2b7c461115433a')
    expect(fill.wallet).toBe('0xaaa')
    expect(fill.priced).toBe('gecko')
  })

  test('drops a trade with no kind rather than inventing a side', () => {
    expect(fillFromGeckoTrade({ attributes: { tx_hash: '0x1', kind: 'x' } })).toBeNull()
  })
})

describe('fillFromChainTx', () => {
  test('a stable → token swap is a buy sized by the cash leg', () => {
    const fill = fillFromChainTx({
      hash: '0x1',
      baseDecimals: 6, baseDecimalsVerified: true, quoteDecimals: 18, quoteDecimalsVerified: true,
      from: '0xabc',
      baseAmount: 20,
      baseSymbol: 'USDC',
      quoteAmount: 1000,
      quoteSymbol: 'CHOG',
      timestamp: 1_000,
    })
    expect(fill.side).toBe('buy')
    expect(fill.symbol).toBe('CHOG')
    expect(fill.usd).toBe(20)
    expect(fill.priced).toBe('cash_leg')
  })

  test('a token → stable swap is a sell', () => {
    const fill = fillFromChainTx({
      hash: '0x2',
      baseDecimals: 18, baseDecimalsVerified: true, quoteDecimals: 6, quoteDecimalsVerified: true,
      from: '0xabc',
      baseAmount: 1000,
      baseSymbol: 'CHOG',
      quoteAmount: 15,
      quoteSymbol: 'USDC',
    })
    expect(fill.side).toBe('sell')
    expect(fill.usd).toBe(15)
  })

  test('does not invent USD when neither leg is a stable and no mark is supplied', () => {
    const fill = fillFromChainTx({
      hash: '0x3',
      baseDecimals: 18, baseDecimalsVerified: true, quoteDecimals: 18, quoteDecimalsVerified: true,
      from: '0xabc',
      baseAmount: 1,
      baseSymbol: 'FOO',
      quoteAmount: 2,
      quoteSymbol: 'BAR',
    })
    expect(fill.usd).toBeNull()
    expect(fill.priced).toBeNull()
  })

  test('prices a MON quote from the WMON mark instead of guessing', () => {
    const fill = fillFromChainTx(
      {
        hash: '0x4',
        baseDecimals: 18, baseDecimalsVerified: true, quoteDecimals: 18, quoteDecimalsVerified: true,
        from: '0xabc',
        baseAmount: 10,
        baseSymbol: 'MON',
        quoteAmount: 100,
        quoteSymbol: 'MEME',
      },
      { '0x3bd359c1119da7da1d913d1c4d2b7c461115433a': { usd: 0.5 } },
    )
    expect(fill.side).toBe('buy')
    expect(fill.usd).toBe(5)
    expect(fill.priced).toBe('mon_mark')
  })

  test('addLiquidity signatures become LP adds, not swaps', () => {
    const fill = fillFromChainTx({
      hash: '0x5',
      baseDecimals: 6, baseDecimalsVerified: true, quoteDecimals: 18, quoteDecimalsVerified: true,
      from: '0xabc',
      input: '0xe8e33700deadbeef',
      baseAmount: 1,
      baseSymbol: 'USDC',
      quoteAmount: 2,
      quoteSymbol: 'WMON',
    })
    expect(fill.kind).toBe('add')
  })
})

describe('verified chain quantity and USD unit-price provenance', () => {
  const sell = {
    hash: '0xcbtc', baseSymbol: 'cbBTC', baseTokenAddress: '0x1111111111111111111111111111111111111111',
    quoteSymbol: 'USDC', quoteTokenAddress: '0x754704bc059f8c67012fed69bc8a327a5aafb603',
    quoteAmount: 415.71, quoteDecimals: 6, quoteDecimalsVerified: true,
    usdValue: 415.71, price: 8.3142e14,
  }

  test('keeps verified cash proceeds but hides quantity and price after a guessed 18-decimal BTC decode', () => {
    const result = fillFromChainTx({ ...sell, baseAmount: 5e-13, baseDecimals: 18, baseDecimalsVerified: false })
    expect(result).toMatchObject({ side: 'sell', symbol: 'cbBTC', usd: 415.71, amount: null, price: null })
  })

  test('prices an actual verified 8-decimal BTC quantity from the verified cash proceeds', () => {
    const result = fillFromChainTx({ ...sell, baseAmount: 0.005, baseDecimals: 8, baseDecimalsVerified: true })
    expect(result.amount).toBe(0.005)
    expect(result.price).toBeCloseTo(83142)
  })

  test('does not trust a legacy decimals number without evidence that its lookup succeeded', () => {
    const result = fillFromChainTx({ ...sell, baseAmount: 5e-13, baseDecimals: 18 })
    expect(result.amount).toBeNull()
    expect(result.price).toBeNull()
  })

  test('accepts verified zero-decimal quantities', () => {
    const result = fillFromChainTx({ ...sell, baseSymbol: 'SHARD', baseAmount: 10, baseDecimals: 0, baseDecimalsVerified: true })
    expect(result.amount).toBe(10)
    expect(result.price).toBeCloseTo(41.571)
  })

  test('does not use a token/token exchange ratio as a dollar unit price without a USD mark', () => {
    const result = fillFromChainTx({
      hash: '0xratio', baseSymbol: 'WMON', baseAmount: 3, baseDecimals: 18, baseDecimalsVerified: true,
      quoteSymbol: 'MEME', quoteAmount: 9, quoteDecimals: 18, quoteDecimalsVerified: true, price: 3,
    })
    expect(result).toMatchObject({ amount: 9, usd: null, price: null })
  })

  test('does not reuse upstream USD derived from an unverified cash-leg amount', () => {
    const result = fillFromChainTx({
      ...sell, baseAmount: 0.005, baseDecimals: 8, baseDecimalsVerified: true,
      quoteTokenAddress: '0x2222222222222222222222222222222222222222',
      quoteDecimalsVerified: false, usdValueVerified: false,
    })
    expect(result).toMatchObject({ amount: 0.005, usd: null, price: null })
  })
})

describe('indexed event identity and asset-specific metadata', () => {
  const base = '0x1111111111111111111111111111111111111111'
  const quote = '0x2222222222222222222222222222222222222222'
  const context = { poolAddress: 'pool-a', baseAddress: base, quoteAddress: quote, baseSymbol: 'BASE', quoteSymbol: 'QUOTE', mcap: 12345 }
  const trade = (id = 'provider_opaque_7_9', overrides = {}) => ({ id, attributes: {
    tx_hash: '0xsame', block_number: 100, block_timestamp: '2026-09-24T00:00:00Z',
    kind: 'buy', from_token_address: quote, to_token_address: base,
    from_token_amount: '20', to_token_amount: '10', volume_in_usd: '20', price_to_in_usd: '2', ...overrides,
  } })

  test('preserves opaque provider event IDs instead of guessing their suffix is a log index', () => {
    const first = fillFromGeckoTrade(trade('provider_swap_7_9'), context)
    const second = fillFromGeckoTrade(trade('provider_swap_7_10'), context)
    expect(first.id).not.toBe(second.id)
    expect(first.logIndex).toBeNull()
    expect(first.providerId).toBe('provider_swap_7_9')
    expect(first.quoteAmount).toBe(20)
  })

  test('keeps pool identity in fallback keys for events lacking a provider ID', () => {
    const first = fillFromGeckoTrade(trade(null, { log_index: 7 }), context)
    const second = fillFromGeckoTrade({ ...trade(undefined, { log_index: 7 }), id: null }, { ...context, poolAddress: 'pool-b' })
    expect(first.id).not.toBe(second.id)
    expect(second.logIndex).toBe(7)
  })

  test('the same provider event keeps its identity across contextual metadata refreshes', () => {
    const first = fillFromGeckoTrade(trade('actual-event'), context)
    const second = fillFromGeckoTrade(trade('actual-event'), { ...context, poolAddress: null })
    expect(first.id).toBe(second.id)
    const explicit = fillFromGeckoTrade(trade(null, { log_index: 7 }), context)
    const upgraded = fillFromGeckoTrade(trade(null, { log_index: 7, to_token_amount: '11' }), context)
    expect(explicit.id).toBe(upgraded.id)
  })

  test('uses quote metadata for a quote-asset trade without borrowing the base market cap', () => {
    const result = fillFromGeckoTrade(trade('quote-side', { from_token_address: base, to_token_address: quote }), context)
    expect(result).toMatchObject({ token: quote, symbol: 'QUOTE', quoteSymbol: 'BASE', mcap: null })
  })

  test('leaves unknown asset metadata absent instead of assigning the pool base symbol and cap', () => {
    const result = fillFromGeckoTrade(trade('unknown-side', { to_token_address: '0x3333333333333333333333333333333333333333' }), context)
    expect(result).toMatchObject({ symbol: null, mcap: null })
    expect(fillFromGeckoTrade(trade(), context)).toMatchObject({ symbol: 'BASE', quoteSymbol: 'QUOTE', mcap: 12345 })
  })
})

describe('restored RPC activity', () => {
  test('retains one-leg native DEX flow without inventing direction', () => {
    expect(fillFromChainTx({ hash: '0xflow', category: 'defi', value: '2.5', timestamp: 1000 }))
      .toMatchObject({ kind: 'flow', side: null, amount: 2.5, symbol: 'MON', sold: { amount: 2.5, symbol: 'MON' }, bought: null })
  })
  test('retains output-only flow and handles raw native wei', () => {
    expect(fillFromChainTx({ hash: '0xout', quoteSymbol: 'USDC', quoteAmount: 20, quoteDecimals: 6, quoteDecimalsVerified: true }))
      .toMatchObject({ kind: 'flow', side: null, sold: null, bought: { amount: 20, symbol: 'USDC' } })
    for (const value of [1000000000000000000n, '0xde0b6b3a7640000']) {
      expect(fillFromChainTx({ hash: '0xwei', value })).toMatchObject({ amount: 1, symbol: 'MON' })
    }
  })
  test('does not invent buy/sell for a pair without a reference token', () => {
    expect(fillFromChainTx({ hash: '0xneutral', baseSymbol: 'FOO', baseAmount: 1, baseDecimals: 18, baseDecimalsVerified: true, quoteSymbol: 'BAR', quoteAmount: 2, quoteDecimals: 18, quoteDecimalsVerified: true }))
      .toMatchObject({ kind: 'swap', side: null, sold: { symbol: 'FOO' }, bought: { symbol: 'BAR' } })
  })
  test('rejects simulated or reverted DEX observations', () => {
    for (const rejected of [{ isSimulated: true }, { status: 'reverted' }, { status: false }]) {
      expect(fillFromChainTx({ hash: '0xrejected', value: '2', ...rejected })).toBeNull()
    }
  })
})

test('indexed sold and bought legs preserve address-matched pool symbols in both directions', () => {
  for (const side of ['buy', 'sell']) {
    const result = fillFromGeckoTrade({ attributes: {
      tx_hash: '0xlegs', kind: side, from_token_address: '0xfrom', to_token_address: '0xto',
      from_token_amount: '3', to_token_amount: '9', block_timestamp: '2026-09-24T00:00:00Z',
    } }, { baseAddress: '0xfrom', quoteAddress: '0xto', baseSymbol: 'FROM', quoteSymbol: 'TO' })
    expect(result.sold).toMatchObject({ address: '0xfrom', symbol: 'FROM', amount: 3 })
    expect(result.bought).toMatchObject({ address: '0xto', symbol: 'TO', amount: 9 })
  }
})
