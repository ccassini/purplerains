import { describe, expect, test } from 'vitest'
import {
  compareValidators,
  feePercentiles,
  netApyBps,
  projectRewards,
  stakeSharePct,
  toMon,
} from '../stakingMath'

describe('netApyBps', () => {
  test('returns the base APY untouched when the validator takes no commission', () => {
    expect(netApyBps(1698, 0)).toBe(1698)
  })

  test('subtracts the commission share from the base APY', () => {
    // 16.98% base, 15% fee -> 16.98 * 0.85 = 14.433% -> 1443 bps
    expect(netApyBps(1698, 1500)).toBe(1443)
  })

  test('returns zero when the validator takes everything', () => {
    expect(netApyBps(1698, 10_000)).toBe(0)
  })

  test('clamps commission outside the 0–10000 bps range instead of going negative', () => {
    expect(netApyBps(1698, 20_000)).toBe(0)
    expect(netApyBps(1698, -500)).toBe(1698)
  })

  test('returns zero for a missing or non-finite base APY', () => {
    expect(netApyBps(0, 500)).toBe(0)
    expect(netApyBps(NaN, 500)).toBe(0)
    expect(netApyBps(undefined, 500)).toBe(0)
  })
})

describe('projectRewards', () => {
  test('splits an annual yield into day, month and year buckets', () => {
    // 1000 MON at 20% -> 200/yr
    const p = projectRewards(1000, 2000)
    expect(p.year).toBeCloseTo(200, 6)
    expect(p.month).toBeCloseTo(200 / 12, 6)
    expect(p.day).toBeCloseTo(200 / 365, 6)
  })

  test('scales linearly with the staked amount', () => {
    const one = projectRewards(1, 1500)
    const hundred = projectRewards(100, 1500)
    expect(hundred.year).toBeCloseTo(one.year * 100, 6)
  })

  test('returns zeros rather than NaN for junk input', () => {
    for (const bad of [projectRewards(NaN, 1500), projectRewards(100, NaN), projectRewards(-5, 1500)]) {
      expect(bad).toMatchObject({ day: 0, month: 0, year: 0 })
      expect(bad.yearUsd).toBeNull()
    }
  })

  test('converts to USD only when a price is supplied', () => {
    expect(projectRewards(1000, 2000, 0.02).yearUsd).toBeCloseTo(4, 6)
    expect(projectRewards(1000, 2000).yearUsd).toBeNull()
    expect(projectRewards(1000, 2000, 0).yearUsd).toBeNull()
  })
})

describe('feePercentiles', () => {
  test('reports the median fee across validators', () => {
    expect(feePercentiles([0, 500, 1000, 1500, 2000]).median).toBe(1000)
  })

  test('averages the two middle values on an even-sized set', () => {
    expect(feePercentiles([0, 1000, 2000, 4000]).median).toBe(1500)
  })

  test('ignores validators with no fee data', () => {
    expect(feePercentiles([500, null, undefined, 1500, NaN]).median).toBe(1000)
  })

  test('returns nulls for an empty set instead of throwing', () => {
    expect(feePercentiles([])).toEqual({ median: null, min: null, max: null })
  })

  test('reports the cheapest and dearest fee', () => {
    const p = feePercentiles([300, 1500, 0, 900])
    expect(p.min).toBe(0)
    expect(p.max).toBe(1500)
  })
})

describe('stakeSharePct', () => {
  test('expresses a validator stake as a percentage of the network', () => {
    expect(stakeSharePct(10n ** 18n, 4n * 10n ** 18n)).toBeCloseTo(25, 6)
  })

  test('returns null when the network total is zero or missing', () => {
    expect(stakeSharePct(10n ** 18n, 0n)).toBeNull()
    expect(stakeSharePct(10n ** 18n, null)).toBeNull()
  })

  test('keeps precision on shares far below one percent', () => {
    // 1 in 10 million should not round to zero
    const share = stakeSharePct(10n ** 18n, 10_000_000n * 10n ** 18n)
    expect(share).toBeGreaterThan(0)
    expect(share).toBeCloseTo(0.00001, 9)
  })
})

describe('toMon', () => {
  test('converts wei to a MON float', () => {
    expect(toMon(1_500_000_000_000_000_000n)).toBeCloseTo(1.5, 9)
  })

  test('treats missing values as zero', () => {
    expect(toMon(null)).toBe(0)
    expect(toMon(undefined)).toBe(0)
  })

  test('survives very large balances without losing the magnitude', () => {
    expect(toMon(15_000_000_000n * 10n ** 18n)).toBeCloseTo(15_000_000_000, 0)
  })
})

describe('compareValidators', () => {
  const withStake = (id, stake, fee) => ({
    id,
    name: `V${id}`,
    totalStakeWei: stake,
    commissionBps: fee,
  })

  test('sorts by stake descending', () => {
    const list = [withStake(1, 10n, 0), withStake(2, 30n, 0), withStake(3, 20n, 0)]
    expect(list.sort(compareValidators('stake', 1698)).map(v => v.id)).toEqual([2, 3, 1])
  })

  test('sorts by net APY descending, so the cheapest fee leads', () => {
    const list = [withStake(1, 0n, 1500), withStake(2, 0n, 0), withStake(3, 0n, 500)]
    expect(list.sort(compareValidators('apy', 1698)).map(v => v.id)).toEqual([2, 3, 1])
  })

  test('sorts by name alphabetically', () => {
    const list = [{ id: 1, name: 'Zeta' }, { id: 2, name: 'alpha' }, { id: 3, name: 'Mid' }]
    expect(list.sort(compareValidators('name', 1698)).map(v => v.id)).toEqual([2, 3, 1])
  })

  test('pushes validators with no stake data to the bottom rather than the top', () => {
    const list = [
      { id: 1, name: 'A' },
      withStake(2, 5n, 0),
      { id: 3, name: 'C', totalStakeWei: null },
    ]
    expect(list.sort(compareValidators('stake', 1698))[0].id).toBe(2)
    expect(list.sort(compareValidators('stake', 1698)).map(v => v.id).slice(1).sort()).toEqual([1, 3])
  })
})
