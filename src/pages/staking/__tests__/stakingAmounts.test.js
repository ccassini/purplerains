import { describe, expect, it } from 'vitest'
import { amountError, amountPreset, GAS_RESERVE_WEI, parseStakingAmount } from '../stakingAmounts'

describe('staking amount entry', () => {
  it('preserves all 18 decimals without floating point rounding', () => {
    expect(parseStakingAmount('123456789.123456789123456789')).toBe(123456789123456789123456789n)
    expect(parseStakingAmount('.5')).toBe(500000000000000000n)
  })
  it('rejects exponent notation, negatives, separators, and overprecision', () => {
    for (const value of ['1e3', '-1', '1,000', 'Infinity', '1.0000000000000000001', '', '0x10']) expect(parseStakingAmount(value)).toBeNull()
  })
  it('enforces dust and available amounts, including the fee reserve', () => {
    expect(amountError('0.0000000001', 10n ** 18n)).toMatch(/minimum/)
    expect(amountError('0.000000001', 10n ** 18n)).toBeNull()
    expect(amountError('2', 10n ** 18n)).toMatch(/exceeds/)
    expect(amountError('1', 10n ** 18n, { reserve: GAS_RESERVE_WEI })).toMatch(/fees/)
    expect(amountError('0.99', 10n ** 18n, { reserve: GAS_RESERVE_WEI })).toBeNull()
  })
  it('keeps MAX exact and reserves the fee amount', () => {
    expect(amountPreset(123456789123456789123456789n, 100)).toBe('123456789.123456789123456789')
    expect(amountPreset(10n ** 18n, 100, GAS_RESERVE_WEI)).toBe('0.99')
    expect(amountPreset(1n, 100, GAS_RESERVE_WEI)).toBe('0')
  })
})
