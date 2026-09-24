import { describe, expect, test } from 'vitest'
import { geckoNetworkPath, isMonadNetworkId, isMonadPair } from '../chainLock'
import { parseSizeInput } from '../marketMath'
import { normalizeDexPair, normalizeGeckoPool } from '../poolNormalize'

describe('Monad mainnet lock', () => {
  test('accepts only chain 143 / monad slugs', () => {
    expect(isMonadNetworkId(143)).toBe(true)
    expect(isMonadNetworkId('monad')).toBe(true)
    expect(isMonadNetworkId('monad_0xabc')).toBe(true)
    expect(isMonadNetworkId('uniswap-v4-monad')).toBe(true)
    expect(isMonadNetworkId('ethereum')).toBe(false)
    expect(isMonadNetworkId(1)).toBe(false)
    expect(isMonadNetworkId('robinhood')).toBe(false)
    expect(isMonadNetworkId(4663)).toBe(false)
  })

  test('Gecko paths are /networks/monad/…', () => {
    expect(geckoNetworkPath('/pools')).toBe('/networks/monad/pools')
    expect(geckoNetworkPath('dexes')).toBe('/networks/monad/dexes')
  })

  test('DexScreener pairs from other chains are dropped', () => {
    expect(isMonadPair({ chainId: 'monad' })).toBe(true)
    expect(isMonadPair({ chainId: 'ethereum' })).toBe(false)
    expect(
      normalizeDexPair({
        chainId: 'ethereum',
        pairAddress: '0xabc',
        baseToken: { symbol: 'ETH' },
        quoteToken: { symbol: 'USDC' },
      }),
    ).toBeNull()
  })

  test('Gecko resources from another network id are dropped', () => {
    expect(
      normalizeGeckoPool(
        { id: 'eth_0xabc', attributes: { name: 'WETH / USDC 0.3%', address: '0xabc' }, relationships: {} },
        [],
        'h24',
      ),
    ).toBeNull()
  })
})

describe('parseSizeInput', () => {
  test('reads 1k / 2.5k style filters', () => {
    expect(parseSizeInput('1k')).toBe(1000)
    expect(parseSizeInput('$2.5k')).toBe(2500)
    expect(parseSizeInput('')).toBeNull()
  })
})
