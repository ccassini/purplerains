import { describe, expect, it } from 'vitest'
import { computeDislocations } from '../marketMath'

const pool = { address: 'pool1', pair: 'MON/AUSD', pairKey: 'AUSD/MON', price: 0.02, base: { address: '0xmon' }, quote: { address: '0xausd' }, dexName: 'Venue1' }

describe('pool quote comparisons', () => {
  it('does not compare the USD price of different base assets in reversed pairs', () => {
    expect(computeDislocations([pool, { ...pool, address: 'pool2', price: 1, base: pool.quote, quote: pool.base }])).toEqual([])
  })
  it('does not merge tokens sharing symbols but having different contracts', () => {
    expect(computeDislocations([pool, { ...pool, address: 'pool2', price: 1, base: { address: '0xother' } }])).toEqual([])
  })
  it('compares exact assets case-insensitively and preserves their quote orientation', () => {
    const [comparison] = computeDislocations([pool, { ...pool, address: 'pool2', price: 0.03, dexName: 'Venue2', base: { address: '0xMON' } }])
    expect(comparison).toMatchObject({ buyPool: 'pool1', sellPool: 'pool2', pair: 'MON/AUSD', id: '0xmon:0xausd' })
    expect(comparison.spreadPct).toBeCloseTo(40)
  })
  it('omits quotes with missing contract identity', () => {
    expect(computeDislocations([pool, { ...pool, address: 'pool2', price: 1, quote: {} }])).toEqual([])
  })
})
