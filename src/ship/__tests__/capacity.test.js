import { describe, expect, test } from 'vitest'
import {
  TIER_CAPACITY,
  blockUtilization,
  normalizeFill,
  planShipLoad,
  sanitizeTxCount,
  sizeForUtilization,
} from '../capacity'

describe('normalizeFill', () => {
  test('treats values above 1 as percent', () => {
    expect(normalizeFill(6)).toBeCloseTo(0.06)
    expect(normalizeFill(100)).toBe(1)
  })

  test('treats values at or below 1 as fractions', () => {
    expect(normalizeFill(0.5)).toBe(0.5)
    expect(normalizeFill(1)).toBe(1)
  })

  test('collapses NaN, negatives and overflow safely', () => {
    expect(normalizeFill(NaN)).toBe(0)
    expect(normalizeFill(-4)).toBe(0)
    expect(normalizeFill(null)).toBe(0)
    expect(normalizeFill(250)).toBe(1)
  })
})

describe('sanitizeTxCount', () => {
  test('floors and clamps to non-negative integers', () => {
    expect(sanitizeTxCount(12.9)).toBe(12)
    expect(sanitizeTxCount(-3)).toBe(0)
    expect(sanitizeTxCount(undefined)).toBe(0)
  })
})

describe('planShipLoad', () => {
  test('an empty block sails empty', () => {
    const plan = planShipLoad({ transactionCount: 0, fillPct: 0 })
    expect(plan.load).toBe(0)
    expect(plan.size).toBe(0)
  })

  test('below the muster floor, one soldier per transaction', () => {
    for (const n of [1, 3, 5, 9]) {
      expect(planShipLoad({ transactionCount: n, fillPct: 1 }).load).toBe(n)
    }
  })

  test('the honor guard scales by log decade: 10→10, 100→15, 1000→20', () => {
    expect(planShipLoad({ transactionCount: 10, fillPct: 1 }).load).toBe(10)
    expect(planShipLoad({ transactionCount: 100, fillPct: 1 }).load).toBe(15)
    expect(planShipLoad({ transactionCount: 1000, fillPct: 1 }).load).toBe(20)
  })

  test('saturates at a full guard of twenty for any giant block', () => {
    for (const n of [1000, 5000, 10000, 250000]) {
      expect(planShipLoad({ transactionCount: n, fillPct: 1 }).load).toBe(20)
    }
  })

  test('monotonic in txCount and never above min(capacity, txCount)', () => {
    let prev = 0
    for (const n of [0, 1, 4, 9, 10, 25, 60, 150, 400, 1000, 9000]) {
      const plan = planShipLoad({ transactionCount: n, fillPct: 2 })
      expect(plan.load).toBeGreaterThanOrEqual(prev)
      expect(plan.load).toBeLessThanOrEqual(Math.min(plan.capacity, Math.max(n, 0)))
      prev = plan.load
    }
  })

  test('hull size still derives from the utilization blend', () => {
    const input = { transactionCount: 180, fillPct: 60 }
    const plan = planShipLoad(input)
    expect(plan.size).toBe(sizeForUtilization(blockUtilization(input)))
    expect(plan.capacity).toBe(TIER_CAPACITY[plan.size])
  })
})
