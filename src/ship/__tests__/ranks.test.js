import { describe, expect, test } from 'vitest'
import {
  RANK_UNLIT, RANK_EMBER, RANK_KINDLER, RANK_BEARER, RANK_ARCHON,
  RANK_NAMES, rankFor, pickQueued,
} from '../ranks'

describe('rankFor', () => {
  test('synthetic deck filler is always unlit, whatever its traits', () => {
    expect(rankFor({ whale: true, heavy: true, urgent: true }, true)).toBe(RANK_UNLIT)
  })

  test('a plain transaction is an ember', () => {
    expect(rankFor({}, false)).toBe(RANK_EMBER)
  })

  test('priority gas alone is a kindler', () => {
    expect(rankFor({ priority: true }, false)).toBe(RANK_KINDLER)
  })

  test('either whale axis alone is a bearer', () => {
    expect(rankFor({ whale: true, heavy: true, urgent: false }, false)).toBe(RANK_BEARER)
    expect(rankFor({ whale: true, heavy: false, urgent: true }, false)).toBe(RANK_BEARER)
  })

  test('both whale axes at once is an archon', () => {
    expect(rankFor({ whale: true, heavy: true, urgent: true }, false)).toBe(RANK_ARCHON)
  })

  test('archon is nested inside whale, so whale-keyed visuals still fire', () => {
    // The gold body and laurel key off traits.whale, not off rank.
    const archon = { whale: true, heavy: true, urgent: true }
    expect(rankFor(archon, false)).toBe(RANK_ARCHON)
    expect(archon.whale).toBe(true)
  })

  test('every rank has a name', () => {
    expect(RANK_NAMES).toHaveLength(5)
    for (const r of [0, 1, 2, 3, 4]) expect(typeof RANK_NAMES[r]).toBe('string')
  })
})

/** Deterministic pseudo-random so the property test is reproducible. */
function makeRng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const STATES = ['queued', 'leaping', 'aboard', 'leaving', 'gone']

describe('pickQueued — the law of the manifest', () => {
  test('never returns a soldier whose hash is outside the manifest', () => {
    const list = [
      { state: 'queued', hash: 'stranger', rank: RANK_ARCHON },
      { state: 'queued', hash: 'crew', rank: RANK_EMBER },
    ]
    expect(pickQueued(list, new Set(['crew'])).hash).toBe('crew')
    expect(pickQueued(list, new Set(['nobody']))).toBeNull()
  })

  test('among the block\'s own soldiers, highest rank first, oldest on ties', () => {
    const list = [
      { state: 'queued', hash: 'a', rank: RANK_EMBER },
      { state: 'queued', hash: 'b', rank: RANK_BEARER },
      { state: 'queued', hash: 'c', rank: RANK_BEARER },
    ]
    expect(pickQueued(list, new Set(['a', 'b', 'c'])).hash).toBe('b')
  })

  test('a manifest hit still has to be eligible', () => {
    const list = [
      { state: 'queued', hash: 'far', rank: RANK_ARCHON, x: 900 },
      { state: 'queued', hash: 'near', rank: RANK_EMBER, x: 10 },
    ]
    expect(pickQueued(list, new Set(['far', 'near']), (q) => q.x < 100).hash).toBe('near')
    expect(pickQueued(list, new Set(['far']), (q) => q.x < 100)).toBeNull()
  })

  test('ignores everyone who is not queued', () => {
    const list = [
      { state: 'aboard', hash: 'a', rank: RANK_ARCHON },
      { state: 'gone', hash: 'b', rank: RANK_ARCHON },
    ]
    expect(pickQueued(list, new Set(['a', 'b']))).toBeNull()
  })

  /**
   * The load-bearing property, 5000 randomized rosters: non-null exactly when
   * an eligible MANIFEST soldier exists, and the result is always one of them.
   * This is the user-facing rule — a transaction only ever sails on the block
   * that sealed it — enforced at the selection layer forever.
   */
  test('returns a manifest soldier exactly when one is eligible', () => {
    const rnd = makeRng(20260725)
    for (let iter = 0; iter < 5000; iter++) {
      const n = Math.floor(rnd() * 8)
      const list = []
      for (let i = 0; i < n; i++) {
        list.push({
          state: STATES[Math.floor(rnd() * STATES.length)],
          hash: `h${i}`,
          rank: Math.floor(rnd() * 5),
          x: Math.floor(rnd() * 200),
        })
      }
      const manifest = new Set(list.filter(() => rnd() < 0.4).map((h) => h.hash))
      const gate = rnd() < 0.5 ? undefined : (q) => q.x < 100

      const eligible = list.filter(
        (h) => h.state === 'queued' && manifest.has(h.hash) && (!gate || gate(h)),
      )
      const picked = pickQueued(list, manifest, gate)

      expect(picked === null).toBe(eligible.length === 0)
      if (picked) {
        expect(eligible).toContain(picked)
        expect(manifest.has(picked.hash)).toBe(true)
      }
    }
  })
})
