import { describe, expect, it } from 'vitest'
import { prependTransactionBatch, patchTransactionEnrichment } from '../transactionPublication'

describe('raw transaction publication and late enrichment', () => {
  it('publishes raw rows without needing receipt fields and keeps batch order', () => {
    const transfer = Object.freeze({ hash: '0xa', category: 'transfer', value: '1' })
    const swap = Object.freeze({ hash: '0xb', category: 'defi', value: '2' })
    const previous = Object.freeze([{ hash: '0xc' }])
    expect(prependTransactionBatch(previous, [transfer, swap])).toEqual([transfer, swap, previous[0]])
    expect(previous).toHaveLength(1)
  })

  it('patches a late receipt in its existing position without moving old rows ahead of new ones', () => {
    const old = Object.freeze({ hash: '0xa', category: 'defi', value: '1' })
    const newest = Object.freeze({ hash: '0xb', category: 'transfer', value: '2' })
    const previous = Object.freeze([newest, old])
    const next = patchTransactionEnrichment(previous, [{ ...old, baseAmount: 10, baseDecimalsVerified: true }])
    expect(next.map((tx) => tx.hash)).toEqual(['0xb', '0xa'])
    expect(next[0]).toBe(newest)
    expect(next[1]).toMatchObject({ hash: '0xa', baseAmount: 10, baseDecimalsVerified: true })
    expect(next[1]).not.toBe(old)
    expect(old.baseAmount).toBeUndefined()
  })

  it('does not resurrect rows evicted before their receipt resolves', () => {
    const old = { hash: '0xa', category: 'defi' }
    const rows = prependTransactionBatch([old], [{ hash: '0xb' }, { hash: '0xc' }], 2)
    expect(rows.map((tx) => tx.hash)).toEqual(['0xb', '0xc'])
    expect(patchTransactionEnrichment(rows, [{ ...old, baseAmount: 100 }])).toBe(rows)
  })

  it('preserves verified enrichment when a duplicate raw block response arrives', () => {
    const known = { hash: '0xAB', baseAmount: 10, baseDecimalsVerified: true, category: 'defi', value: '1' }
    const next = prependTransactionBatch([known, { hash: '0xc' }], [{ hash: '0xab', category: 'defi', value: '1' }, { hash: '0xab', category: 'defi', value: '1' }])
    expect(next).toHaveLength(2)
    expect(next[0]).toMatchObject({ hash: '0xab', baseAmount: 10, baseDecimalsVerified: true })
  })

  it('keeps the bounded newest raw rows when an incoming batch exceeds capacity', () => {
    const batch = Array.from({ length: 600 }, (_, i) => ({ hash: `0x${i}` }))
    const next = prependTransactionBatch([{ hash: 'older' }], batch)
    expect(next).toHaveLength(500)
    expect(next[0]).toBe(batch[0])
    expect(next[499]).toBe(batch[499])
  })

  it('returns the original array for identical enrichment or missing identifiers', () => {
    const tx = { hash: '0xa', baseAmount: 10 }
    const previous = [tx]
    expect(patchTransactionEnrichment(previous, [{ ...tx }, { baseAmount: 20 }])).toBe(previous)
    expect(prependTransactionBatch(previous, [null, { value: '1' }])).toBe(previous)
  })
})
