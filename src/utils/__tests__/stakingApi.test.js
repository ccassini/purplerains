import { describe, expect, it } from 'vitest'
import { computeStakingStatsFromGmonadsRows } from '../stakingApi'

describe('staking network estimate', () => {
  it('uses the current 18 MON reward and participating stake, without pretending to compound', () => {
    const stats = computeStakingStatsFromGmonadsRows([
      { val_index: 1, stake: '20000000000', validator_set_type: 'active' },
      { val_index: 2, stake: '10000000000', validator_set_type: 'standby' },
    ])
    expect(stats.totalStaked).toBe(30_000_000_000)
    expect(stats.activeStaked).toBe(20_000_000_000)
    expect(stats.grossApr).toBeCloseTo((18 * 365 * 86400 / 0.3) / 20_000_000_000 * 100)
  })

  it('does not quote an APR when participating stake is missing or partially invalid', () => {
    expect(computeStakingStatsFromGmonadsRows([]).grossApr).toBeNull()
    expect(computeStakingStatsFromGmonadsRows([{ stake: '123', validator_set_type: 'standby' }]).grossApr).toBeNull()
    expect(computeStakingStatsFromGmonadsRows([
      { stake: '20000000000', validator_set_type: 'active' },
      { stake: 'oops', validator_set_type: 'active' },
    ]).grossApr).toBeNull()
  })

  it('retains exact decimal MON input before converting display totals', () => {
    expect(computeStakingStatsFromGmonadsRows([
      { stake: '20000000000.5', validator_set_type: 'active' },
    ]).activeStaked).toBe(20_000_000_000.5)
  })
})
