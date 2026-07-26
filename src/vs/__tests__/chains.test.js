/**
 * Registry integrity: the war roster is measured data, and it must stay
 * internally consistent — the law of the field depends on these numbers.
 */
import { describe, expect, test } from 'vitest'
import {
  CHAIN_REGISTRY, MONAD_CHAIN, SOLDIER_GAS, FIGURES_PER,
  chainByKey, soldiersPerBlock, soldiersPerSec,
} from '../chains'

describe('the war roster', () => {
  test('monad is measured, purple, and ~500M gas/s', () => {
    expect(MONAD_CHAIN.key).toBe('monad')
    expect(MONAD_CHAIN.method).toBe('rpc-measured')
    expect(MONAD_CHAIN.gasLimit).toBe(150_000_000)
    expect(MONAD_CHAIN.blockTimeMs).toBeGreaterThanOrEqual(250)
    expect(MONAD_CHAIN.blockTimeMs).toBeLessThanOrEqual(400)
    expect(MONAD_CHAIN.gasPerSecM).toBeGreaterThan(300)
    expect(MONAD_CHAIN.color).toBe('#836ef9')
  })

  test('the coalition bench is broad and hyperliquid is on it', () => {
    expect(CHAIN_REGISTRY.length).toBeGreaterThanOrEqual(40)
    const hype = chainByKey('hyperevm')
    expect(hype).toBeTruthy()
    expect(hype.rpcs[0]).toContain('hyperliquid')
  })

  test('keys are unique and monad never sits on the enemy bench', () => {
    const keys = CHAIN_REGISTRY.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).not.toContain('monad')
  })

  test('every entry is internally consistent measured data', () => {
    for (const c of [MONAD_CHAIN, ...CHAIN_REGISTRY]) {
      expect(c.key, c.key).toMatch(/^[a-z0-9]+$/)
      expect(c.name.length).toBeGreaterThan(1)
      expect(c.chainId).toBeGreaterThan(0)
      expect(['L1', 'L2']).toContain(c.kind)
      expect(c.rpcs.length).toBeGreaterThan(0)
      expect(c.gasLimit).toBeGreaterThanOrEqual(1_000_000)
      expect(c.blockTimeMs).toBeGreaterThanOrEqual(50)
      // Demand-paced chains (Metis measured at ~22.7s) legitimately idle slow.
      expect(c.blockTimeMs).toBeLessThanOrEqual(30_000)
      expect(['rpc-measured', 'docs']).toContain(c.method)
      expect(c.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(c.color).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(c.tag.length).toBeGreaterThanOrEqual(2)
      // The capacity figure must BE gasLimit / blockTime — no editorializing.
      const derived = c.gasLimit / c.blockTimeMs / 1000
      expect(Math.abs(derived - c.gasPerSecM) / c.gasPerSecM, c.key).toBeLessThan(0.05)
    }
  })

  test('soldier math follows the law of the field exactly', () => {
    expect(soldiersPerBlock(MONAD_CHAIN)).toBe(MONAD_CHAIN.gasLimit / SOLDIER_GAS)
    expect(soldiersPerSec(MONAD_CHAIN)).toBe(MONAD_CHAIN.gasPerSecM)
    expect(FIGURES_PER).toBeGreaterThan(0)
  })

  test('chainByKey resolves both sides and rejects strangers', () => {
    expect(chainByKey('monad')).toBe(MONAD_CHAIN)
    expect(chainByKey('eth')?.chainId).toBe(1)
    expect(chainByKey('atlantis')).toBeNull()
  })
})
