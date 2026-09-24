import { describe, expect, test } from 'vitest'
import { formatMonAmount, formatMonFromWei, formatUsdSmall } from '../stakingFormat'

const MON = 10n ** 18n

describe('formatMonAmount', () => {
  test('abbreviates millions and thousands by default', () => {
    expect(formatMonAmount(2_500_000)).toBe('2.50M')
    expect(formatMonAmount(1_500)).toBe('1.50K')
  })

  test('keeps full magnitude when compact is off', () => {
    expect(formatMonAmount(2_500_000, { compact: false })).toBe('2500000.00')
  })

  test('honours the requested precision below a thousand', () => {
    expect(formatMonAmount(12.3456, { digits: 2 })).toBe('12.35')
    expect(formatMonAmount(12.3456, { digits: 4 })).toBe('12.3456')
  })

  test('falls back to four decimals for sub-unit amounts', () => {
    expect(formatMonAmount(0.4466)).toBe('0.4466')
  })

  test('uses exponential notation rather than printing 0.0000 for dust', () => {
    expect(formatMonAmount(0.00000123)).toBe('1.23e-6')
  })

  test('renders zero and junk as a plain zero', () => {
    expect(formatMonAmount(0)).toBe('0')
    expect(formatMonAmount(NaN)).toBe('0')
    expect(formatMonAmount(null)).toBe('0')
  })

  test('keeps the sign on negative amounts', () => {
    expect(formatMonAmount(-1_500)).toBe('-1.50K')
  })
})

describe('formatMonFromWei', () => {
  test('converts wei before formatting', () => {
    expect(formatMonFromWei(1_500n * MON)).toBe('1.50K')
    expect(formatMonFromWei(12n * MON, { compact: false, digits: 4 })).toBe('12.0000')
  })

  test('treats missing values as zero', () => {
    expect(formatMonFromWei(null)).toBe('0')
    expect(formatMonFromWei(0n)).toBe('0')
  })
})

describe('formatUsdSmall', () => {
  test('scales thousands and keeps cents above a dollar', () => {
    expect(formatUsdSmall(2_400)).toBe('$2.4K')
    expect(formatUsdSmall(3.47)).toBe('$3.47')
  })

  test('keeps four decimals for fractions of a cent', () => {
    expect(formatUsdSmall(0.0095)).toBe('$0.0095')
  })

  test('returns null when there is nothing worth showing', () => {
    expect(formatUsdSmall(0)).toBeNull()
    expect(formatUsdSmall(null)).toBeNull()
    expect(formatUsdSmall(NaN)).toBeNull()
  })
})
