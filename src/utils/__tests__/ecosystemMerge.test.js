import { describe, it, expect } from 'vitest'
import {
  normalizeName,
  monadTvlOf,
  isMonadProtocol,
  mergeEcosystem,
  computeStats,
} from '../ecosystemMerge.js'

describe('normalizeName', () => {
  it('collapses protocol versions onto the same key', () => {
    expect(normalizeName('Uniswap V4')).toBe(normalizeName('Uniswap'))
    expect(normalizeName('BrownFi V2')).toBe(normalizeName('brownfi'))
  })

  it('ignores punctuation, casing and corporate suffixes', () => {
    expect(normalizeName('Covenant Finance')).toBe(normalizeName('covenant'))
    expect(normalizeName('Euclid Protocol')).toBe(normalizeName('Euclid'))
    expect(normalizeName('a-Priori')).toBe(normalizeName('aPriori'))
  })

  it('does not collapse genuinely different names', () => {
    expect(normalizeName('Kuru')).not.toBe(normalizeName('Kintsu'))
  })
})

describe('monadTvlOf', () => {
  it('uses the Monad-scoped TVL, not the cross-chain total', () => {
    expect(monadTvlOf({ tvl: 900, chainTvls: { Monad: 100 }, chains: ['Monad', 'Base'] })).toBe(100)
  })

  it('falls back to total TVL only for Monad-only protocols', () => {
    expect(monadTvlOf({ tvl: 42, chains: ['Monad'] })).toBe(42)
    expect(monadTvlOf({ tvl: 42, chains: ['Monad', 'Base'] })).toBe(0)
  })

  it('returns 0 rather than NaN for malformed input', () => {
    expect(monadTvlOf(null)).toBe(0)
    expect(monadTvlOf({})).toBe(0)
  })
})

describe('isMonadProtocol', () => {
  it('matches case-insensitively and tolerates missing chains', () => {
    expect(isMonadProtocol({ chains: ['monad'] })).toBe(true)
    expect(isMonadProtocol({ chains: ['Base'] })).toBe(false)
    expect(isMonadProtocol({})).toBe(false)
  })
})

describe('mergeEcosystem', () => {
  const protocols = [
    { name: 'Uniswap V3', slug: 'uniswap-v3', category: 'Dexs', tvl: 10, url: 'https://uni.org', logo: 'L1' },
    { name: 'Uniswap V4', slug: 'uniswap-v4', category: 'Dexs', tvl: 30, url: 'https://uni.org', logo: 'L2' },
    { name: 'Aave V3', slug: 'aave-v3', category: 'Lending', tvl: 252, url: 'https://aave.com', logo: 'L3' },
  ]

  it('keeps the curated logo and sums TVL across protocol versions', () => {
    const merged = mergeEcosystem([{ filename: 'Uniswap.png', name: 'Uniswap', website: 'https://x' }], protocols)
    const uni = merged.find((p) => p.name === 'Uniswap')
    expect(uni.logo).toBe('/ecosystem/Uniswap.png')
    expect(uni.tvl).toBe(40)
    expect(uni.category).toBe('Dexs')
    expect(uni.variants).toEqual(['Uniswap V3', 'Uniswap V4'])
  })

  it('adds DefiLlama protocols the curated list is missing', () => {
    const merged = mergeEcosystem([{ filename: 'Uniswap.png', name: 'Uniswap' }], protocols)
    const aave = merged.find((p) => p.name === 'Aave V3')
    expect(aave).toBeTruthy()
    expect(aave.tvl).toBe(252)
    expect(aave.logo).toBe('L3')
  })

  it('percent-encodes logo filenames that contain spaces', () => {
    const merged = mergeEcosystem([{ filename: 'AI Jarvis .png', name: 'AI Jarvis' }], [])
    expect(merged[0].logo).toBe('/ecosystem/AI%20Jarvis%20.png')
  })

  it('marks non-DeFi projects as having no live TVL instead of zero', () => {
    const merged = mergeEcosystem([{ filename: 'Wallet.png', name: 'Some Wallet' }], protocols)
    const wallet = merged.find((p) => p.name === 'Some Wallet')
    expect(wallet.hasLiveTvl).toBe(false)
    expect(wallet.tvl).toBeNull()
  })

  it('prefers the curated website but falls back to DefiLlama', () => {
    const merged = mergeEcosystem([{ filename: 'U.png', name: 'Uniswap' }], protocols)
    expect(merged.find((p) => p.name === 'Uniswap').website).toBe('https://uni.org')
  })

  it('skips malformed entries without throwing', () => {
    expect(() => mergeEcosystem([null, {}, { filename: '' }], protocols)).not.toThrow()
  })
})

describe('computeStats', () => {
  it('counts only projects with positive TVL toward the DeFi total', () => {
    const stats = computeStats([
      { tvl: 100, category: 'Dexs' },
      { tvl: 0, category: 'Dexs' },
      { tvl: null, category: null },
    ])
    expect(stats.total).toBe(3)
    expect(stats.defiCount).toBe(1)
    expect(stats.totalTvl).toBe(100)
    expect(stats.categories.find((c) => c.name === 'Other').count).toBe(1)
  })
})
