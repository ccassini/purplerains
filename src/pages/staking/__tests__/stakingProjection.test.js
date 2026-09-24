import { describe, expect, test } from 'vitest'
import { projectStakingScenario } from '../stakingProjection'

const base = { amount: 10_000, days: 365, grossApr: 10, commission: 10, reinvest: 'none' }

describe('staking projections', () => {
  test('commission is a share of rewards, not a percentage point deduction or a principal fee', () => {
    const result = projectStakingScenario(base)
    expect(result.valid).toBe(true)
    expect(result.netApr).toBeCloseTo(9, 12)
    expect(result.rewards).toBeCloseTo(900, 10)
    expect(result.total).toBeCloseTo(10_900, 10)
    expect(result.annualYieldPercent).toBeCloseTo(9, 12)
  })

  test('simple interest uses a 365-day year and exact selected days', () => {
    const result = projectStakingScenario({ ...base, days: 90 })
    expect(result.rewards).toBeCloseTo(900 * 90 / 365, 10)
    expect(result.periods.day).toBeCloseTo(900 / 365, 10)
    expect(result.periods.month).toBeCloseTo(900 * 30 / 365, 10)
    expect(result.periods.year).toBeCloseTo(900, 10)
    expect(result.reinvestmentGain).toBe(0)
  })

  test('monthly reinvestment applies the net rate and reports annual compounded yield separately', () => {
    const result = projectStakingScenario({ ...base, reinvest: 'monthly' })
    const growth = Math.pow(1 + 0.09 / 12, 12) - 1
    expect(result.rewards).toBeCloseTo(10_000 * growth, 8)
    expect(result.annualYieldPercent).toBeCloseTo(growth * 100, 10)
    expect(result.netApr).toBeCloseTo(9, 12)
    expect(result.reinvestmentGain).toBeCloseTo(result.rewards - 900, 10)
  })

  test('monthly scenario does not reinvest before its first complete model month', () => {
    const result = projectStakingScenario({ ...base, days: 30, reinvest: 'monthly' })
    expect(result.rewards).toBeCloseTo(900 * 30 / 365, 10)
    expect(result.reinvestmentGain).toBeCloseTo(0, 10)
  })

  test('accrues a partial model month simply after the completed reinvestment periods', () => {
    const result = projectStakingScenario({ ...base, days: 45, reinvest: 'monthly' })
    const monthDays = 365 / 12
    const expected = 10_000 * (1 + 0.09 / 12) * (1 + 0.09 * (45 - monthDays) / 365)
    expect(result.total).toBeCloseTo(expected, 8)
  })

  test.each(['none', 'monthly'])('handles zero principal, zero APR, and 100%% commission in %s mode', (reinvest) => {
    for (const overrides of [{ amount: 0 }, { grossApr: 0 }, { commission: 100 }]) {
      const result = projectStakingScenario({ ...base, reinvest, ...overrides })
      expect(result.valid).toBe(true)
      expect(result.rewards).toBe(0)
      expect(result.total).toBe(overrides.amount ?? base.amount)
      expect(result.points.every((point) => point.rewards === 0 && point.simpleRewards === 0)).toBe(true)
    }
  })

  test('accepts decimal input strings without truncating partially invalid values', () => {
    expect(projectStakingScenario({ ...base, amount: '1000.25', commission: '2.5' }).valid).toBe(true)
    for (const amount of ['', '   ', '100MON', '0x10', null, true, [], {}, NaN, Infinity, '1e309']) {
      const result = projectStakingScenario({ ...base, amount })
      expect(result.valid, String(amount)).toBe(false)
      expect(result.errors.amount).toBeTruthy()
      expect(result.rewards).toBeUndefined()
    }
  })

  test('rejects negative values, unsupported modes, fractional days, and unsafe ranges', () => {
    for (const overrides of [
      { amount: -1 }, { amount: 1e13 }, { days: 0 }, { days: 1.5 }, { days: 3651 },
      { grossApr: -1 }, { grossApr: 1001 }, { grossApr: Infinity },
      { commission: -1 }, { commission: 100.1 }, { commission: NaN },
      { reinvest: 'daily' },
    ]) {
      const result = projectStakingScenario({ ...base, ...overrides })
      expect(result.valid, JSON.stringify(overrides)).toBe(false)
      expect(Object.keys(result.errors).length).toBeGreaterThan(0)
    }
  })

  test('chart points preserve principal, remain monotonic, and match exact ending values', () => {
    const result = projectStakingScenario({ ...base, days: 730, reinvest: 'monthly' })
    expect(result.points[0]).toMatchObject({ day: 0, rewards: 0, simpleRewards: 0 })
    expect(result.points.at(-1).day).toBe(730)
    expect(result.points.at(-1).rewards).toBe(result.rewards)
    expect(result.points.at(-1).simpleRewards).toBe(result.withoutReinvestment)
    result.points.forEach((point, index) => {
      expect(Number.isFinite(point.rewards)).toBe(true)
      if (index > 0) expect(point.rewards).toBeGreaterThanOrEqual(result.points[index - 1].rewards)
    })
  })

  test('maximum supported inputs produce finite values without unbounded chart work', () => {
    const result = projectStakingScenario({ ...base, amount: 1e12, days: 3650, grossApr: 1000, commission: 0, reinvest: 'monthly' })
    expect(result.valid).toBe(true)
    for (const value of [result.total, result.rewards, result.annualYieldPercent, ...Object.values(result.periods)]) {
      expect(Number.isFinite(value)).toBe(true)
    }
    expect(result.points.length).toBeLessThanOrEqual(61)
  })

  test('retains small positive rewards without floating point cancellation', () => {
    const result = projectStakingScenario({ ...base, amount: 1, grossApr: 0.000000001, commission: 0, reinvest: 'monthly' })
    expect(result.rewards).toBeGreaterThan(0)
    expect(result.rewards).toBeCloseTo(1e-11, 20)
  })
})
