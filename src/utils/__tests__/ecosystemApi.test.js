import { describe, it, expect } from 'vitest'
import {
  formatTvlCompact,
  formatTvlFull,
  formatChangePct,
  computeMovers,
} from '../ecosystemApi.js'

describe('formatTvlCompact', () => {
  it('formats billions with two decimals in financial notation', () => {
    expect(formatTvlCompact(1_534_210_000)).toBe('$1.53B')
    expect(formatTvlCompact(1_511_893_689.81)).toBe('$1.51B')
  })

  it('formats millions and thousands with one decimal', () => {
    expect(formatTvlCompact(412_700_000)).toBe('$412.7M')
    expect(formatTvlCompact(88_400)).toBe('$88.4K')
    expect(formatTvlCompact(9_300_000)).toBe('$9.3M')
  })

  it('formats trillions with two decimals', () => {
    expect(formatTvlCompact(2_400_000_000_000)).toBe('$2.40T')
  })

  it('promotes to the next unit when rounding crosses the boundary', () => {
    // 999.96M would render as "$1000.0M" without promotion.
    expect(formatTvlCompact(999_960_000)).toBe('$1.00B')
    expect(formatTvlCompact(999_960)).toBe('$1.0M')
  })

  it('uses whole dollars with separators below one thousand', () => {
    expect(formatTvlCompact(512)).toBe('$512')
    expect(formatTvlCompact(999.6)).toBe('$1,000')
  })

  it('returns null for zero, negative and non-numeric input', () => {
    expect(formatTvlCompact(0)).toBeNull()
    expect(formatTvlCompact(-5)).toBeNull()
    expect(formatTvlCompact('nope')).toBeNull()
    expect(formatTvlCompact(null)).toBeNull()
    expect(formatTvlCompact(Infinity)).toBeNull()
  })
})

describe('formatTvlFull', () => {
  it('renders full dollars with thousands separators', () => {
    expect(formatTvlFull(1_534_210_000)).toBe('$1,534,210,000')
    expect(formatTvlFull(252_298_096.3)).toBe('$252,298,096')
  })

  it('rounds fractional dollars', () => {
    expect(formatTvlFull(88_412.6)).toBe('$88,413')
  })

  it('returns null for zero, negative and non-numeric input', () => {
    expect(formatTvlFull(0)).toBeNull()
    expect(formatTvlFull(-1)).toBeNull()
    expect(formatTvlFull(undefined)).toBeNull()
  })
})

describe('formatChangePct', () => {
  it('signs positive and negative changes', () => {
    expect(formatChangePct(2.34)).toBe('+2.3%')
    expect(formatChangePct(-11.02)).toBe('-11.0%')
    expect(formatChangePct(0.09897)).toBe('+0.1%')
  })

  it('never renders a signed zero', () => {
    expect(formatChangePct(0)).toBe('0.0%')
    expect(formatChangePct(-0.04)).toBe('0.0%')
    expect(formatChangePct(0.04)).toBe('0.0%')
  })

  it('returns null when DefiLlama has no figure', () => {
    expect(formatChangePct(null)).toBeNull()
    expect(formatChangePct(undefined)).toBeNull()
    expect(formatChangePct('n/a')).toBeNull()
  })
})

describe('computeMovers', () => {
  const projects = [
    { name: 'Alpha', tvl: 5_000_000, change1d: 4.2 },
    { name: 'Beta', tvl: 2_000_000, change1d: -6.1 },
    { name: 'Gamma', tvl: 900_000, change1d: 1.1 },
    { name: 'Delta', tvl: 800_000, change1d: -0.4 },
    { name: 'Flat', tvl: 700_000, change1d: 0 },
    { name: 'NoChange', tvl: 600_000, change1d: null },
    { name: 'Dust', tvl: 12, change1d: 900 }, // below the noise floor
    { name: 'Directory', tvl: null, change1d: null },
  ]

  it('counts gainers and losers among protocols above the noise floor', () => {
    const m = computeMovers(projects)
    expect(m.up).toBe(2)
    expect(m.down).toBe(2)
  })

  it('picks the largest gainer and loser', () => {
    const m = computeMovers(projects)
    expect(m.topGainer?.name).toBe('Alpha')
    expect(m.topLoser?.name).toBe('Beta')
  })

  it('ignores dust protocols so tiny pools cannot headline', () => {
    const m = computeMovers(projects)
    expect(m.topGainer?.name).not.toBe('Dust')
  })

  it('returns an empty summary for empty or delta-free input', () => {
    expect(computeMovers([])).toEqual({ up: 0, down: 0, topGainer: null, topLoser: null })
    expect(computeMovers([{ name: 'A', tvl: 1_000_000, change1d: null }])).toEqual({
      up: 0,
      down: 0,
      topGainer: null,
      topLoser: null,
    })
  })
})
