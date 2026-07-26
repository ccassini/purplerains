import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { ABILITIES, GROUND_ABILITIES, OVER_ABILITIES } from '../abilities'

/**
 * Structural guard for the SoldierView read-only contract.
 *
 * Abilities and the render pass receive the engine's live soldier objects.
 * The HARD RULE in abilities.js says they must never write to them — the one
 * historical violation was `h.__lastMote` bookkeeping, since moved to a
 * WeakMap. These checks read the module source so a reintroduced write fails
 * in CI instead of silently corrupting engine state.
 */
const src = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

/** Any `h.__name` access — dunder bookkeeping stashed on the view. */
const DUNDER_ON_VIEW = /\bh\.__/
/** Any plain or compound assignment to a property of `h` (not ==, <=, >=, !=). */
const ASSIGN_TO_VIEW = /\bh\.[$\w]+(?:\.[$\w]+)*\s*(?:[-+*/%&|^]|\*\*|<<|>>>?)?=(?!=)/

describe('abilities.js structural contract', () => {
  const abilitiesSrc = src('../abilities.js')

  test('contains no h.__ property writes or reads', () => {
    expect(abilitiesSrc).not.toMatch(DUNDER_ON_VIEW)
  })

  test('never assigns to a property of the soldier view', () => {
    expect(abilitiesSrc).not.toMatch(ASSIGN_TO_VIEW)
  })

  test('hopliteRender.js never assigns to a property of the soldier view', () => {
    const renderSrc = src('../hopliteRender.js')
    expect(renderSrc).not.toMatch(DUNDER_ON_VIEW)
    expect(renderSrc).not.toMatch(ASSIGN_TO_VIEW)
  })
})

describe('ability registry shape', () => {
  test('every ground/over ability in the split lists has a paint fn', () => {
    for (const a of [...GROUND_ABILITIES, ...OVER_ABILITIES]) {
      expect(typeof a.paint).toBe('function')
    }
  })

  test('ranks are a sane inclusive range and budgets are non-negative', () => {
    for (const a of ABILITIES) {
      expect(a.minRank).toBeLessThanOrEqual(a.maxRank)
      expect(a.budget).toBeGreaterThanOrEqual(0)
    }
  })
})
