import { describe, expect, it } from 'vitest'
import { calculatorCommission, calculatorNetworkSnapshot, calculatorStakeAmount } from '../stakingCalculatorState'

describe('shared staking calculator inputs', () => {
  it('uses the same network APR and actual provider/fetch times', () => {
    expect(calculatorNetworkSnapshot({ networkStats: { grossApr: 5.25, activeStaked: 1e9 }, lastUpdated: 2000, sourceUpdatedAt: 1000 })).toMatchObject({ status: 'ready', grossApr: 5.25, activeStaked: 1e9, fetchedAt: 2000, sourceUpdatedAt: 1000 })
  })
  it('keeps an old verified rate explicitly stale and distinguishes missing data from zero', () => {
    expect(calculatorNetworkSnapshot({ networkStats: { grossApr: 5 }, dataError: 'unavailable' })).toMatchObject({ status: 'stale', grossApr: 5 })
    expect(calculatorNetworkSnapshot({ networkStats: { grossApr: 0 } })).toMatchObject({ status: 'ready', grossApr: 0 })
    expect(calculatorNetworkSnapshot({ loading: true })).toMatchObject({ status: 'loading', grossApr: null })
    expect(calculatorNetworkSnapshot({ networkStats: { grossApr: Infinity } })).toMatchObject({ status: 'unavailable', grossApr: null })
  })
  it('copies verified commission in percent including zero and 100%', () => {
    for (const [bps, percent] of [[0, '0'], [750, '7.5'], [10000, '100']]) expect(calculatorCommission({ hasChainData: true, commissionBps: bps })).toBe(percent)
    for (const validator of [null, { commissionBps: 1000 }, { hasChainData: true, commissionBps: null }, { hasChainData: true, commissionBps: 10001 }]) expect(calculatorCommission(validator)).toBeNull()
  })
  it('copies exact valid staking input without accepting invalid or excessive values', () => {
    expect(calculatorStakeAmount(' 123.456789012345678901 ')).toBe('123.456789012345678901')
    expect(calculatorStakeAmount('1000000000000')).toBe('1000000000000')
    for (const value of ['', 'NaN', '0', '-1', '1e3', '1000000000001', '1.1234567890123456789']) expect(calculatorStakeAmount(value)).toBeNull()
  })
})
