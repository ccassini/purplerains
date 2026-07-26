/**
 * Headless siege-math tests: the ledger is exact, the trade is 1:1, the front
 * moves only on genuine surplus. Canvas and rAF are stubbed as in the harbour
 * suite; the sim advances through the engine's own __step hook.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

function stubCtx() {
  return new Proxy({}, {
    get: (target, prop) => {
      if (prop in target) return target[prop]
      return (...args) => stubCtx(...args)
    },
    set: (target, prop, value) => { target[prop] = value; return true },
  })
}

function stubCanvas() {
  return {
    width: 1280,
    height: 380,
    style: {},
    getContext: () => stubCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 380 }),
    addEventListener() {},
    removeEventListener() {},
    clientWidth: 1280,
    clientHeight: 380,
  }
}

beforeEach(() => {
  globalThis.document = {
    visibilityState: 'visible',
    createElement: () => stubCanvas(),
  }
  globalThis.window = { devicePixelRatio: 1 }
  globalThis.performance = { now: () => 0 }
  globalThis.ResizeObserver = undefined
})

afterEach(() => {
  delete globalThis.window
  delete globalThis.document
  delete globalThis.performance
  delete globalThis.ResizeObserver
})

async function makeEngine() {
  const { createWarEngine } = await import('../warEngine')
  return createWarEngine(stubCanvas())
}

const total = (side) => side.fielded + side.fallen

describe('the law of the field', () => {
  test('a real monad block sorties exactly its gas limit worth of soldiers', async () => {
    const engine = await makeEngine()
    engine.setRoster([])
    engine.pushMonadBlock({ number: 1, gasLimit: 150_000_000 })
    engine.pushMonadBlock({ number: 2, gasLimit: 150_000_000 })
    const s = engine.snapshot()
    expect(s.monad.blocks).toBe(2)
    expect(total(s.monad)).toBe(300)
    expect(s.monad.live).toBe(true)
    engine.stop()
  })

  test('enemy chains sortie on their own measured cadence', async () => {
    const engine = await makeEngine()
    engine.setRoster(['eth'])
    // Hold the monad feed live-fresh so only eth's clock runs the plain.
    engine.pushMonadBlock({ number: 1, gasLimit: 150_000_000 })
    engine.__step(24.2) // two ethereum slots at 12s
    const s = engine.snapshot()
    const eth = s.troy.chains.find((c) => c.key === 'eth')
    expect(eth.blocks).toBeGreaterThanOrEqual(2)
    // 60M gas blocks: each sortie fields 60 soldiers.
    expect(eth.fielded + eth.fallen).toBeCloseTo(eth.blocks * 60, 0)
    engine.stop()
  })

  test('combat trades exactly 1:1 — no hidden multiplier for either side', async () => {
    const engine = await makeEngine()
    engine.setRoster(['base', 'arbitrum'])
    for (let i = 0; i < 40; i++) {
      engine.pushMonadBlock({ number: i, gasLimit: 150_000_000 })
      engine.__step(0.3)
    }
    const s = engine.snapshot()
    // Both sides fielded from t=0 and the melee kills equally, so the fallen
    // ledgers must match within the rounding the snapshot applies.
    expect(Math.abs(s.monad.fallen - s.troy.fallen)).toBeLessThanOrEqual(2)
    expect(s.monad.fallen).toBeGreaterThan(0)
    engine.stop()
  })

  test('nothing is created or destroyed outside spawn and melee', async () => {
    const engine = await makeEngine()
    engine.setRoster(['optimism'])
    for (let i = 0; i < 30; i++) {
      engine.pushMonadBlock({ number: i, gasLimit: 150_000_000 })
      engine.__step(0.3)
    }
    const s = engine.snapshot()
    expect(total(s.monad)).toBeCloseTo(30 * 150, 0)
    const op = s.troy.chains.find((c) => c.key === 'optimism')
    expect(op.fielded + op.fallen).toBeCloseTo(op.blocks * 40, 0)
    engine.stop()
  })

  test('monad out-fields a small garrison and reaches the walls', async () => {
    const engine = await makeEngine()
    engine.setRoster(['hyperevm']) // ~3 soldiers/s against ~486/s
    for (let i = 0; i < 120; i++) {
      engine.pushMonadBlock({ number: i, gasLimit: 150_000_000 })
      engine.__step(0.3)
    }
    const s = engine.snapshot()
    expect(s.frontPct).toBeGreaterThan(0.9)
    expect(s.state).toBe('walls')
    engine.stop()
  })

  test('a heavy coalition pushes monad back toward the ships', async () => {
    const engine = await makeEngine()
    // ~3.6B gas/s of coalition against monad's ~486M/s.
    engine.setRoster(['sonic', 'opbnb', 'abstract', 'linea', 'base'])
    for (let i = 0; i < 120; i++) {
      engine.pushMonadBlock({ number: i, gasLimit: 150_000_000 })
      engine.__step(0.3)
    }
    const s = engine.snapshot()
    expect(s.frontPct).toBeLessThan(0.2)
    expect(s.state).toBe('shore')
    engine.stop()
  })

  test('the front never leaves the plain', async () => {
    const engine = await makeEngine()
    engine.setRoster(['sonic'])
    for (let i = 0; i < 200; i++) {
      engine.__step(0.3)
      const s = engine.snapshot()
      expect(s.frontPct).toBeGreaterThanOrEqual(0)
      expect(s.frontPct).toBeLessThanOrEqual(1)
    }
    engine.stop()
  })

  test('removing a chain clears its muster and keeps the rest', async () => {
    const engine = await makeEngine()
    engine.setRoster(['eth', 'base'])
    engine.__step(5)
    engine.setRoster(['base'])
    const s = engine.snapshot()
    expect(s.troy.chains.map((c) => c.key)).toEqual(['base'])
    engine.stop()
  })

  test('two engines given the same war fight the same war', async () => {
    const a = await makeEngine()
    const b = await makeEngine()
    for (const e of [a, b]) {
      e.setRoster(['eth', 'base', 'hyperevm'])
      for (let i = 0; i < 20; i++) {
        e.pushMonadBlock({ number: i, gasLimit: 150_000_000 })
        e.__step(0.3)
      }
    }
    const sa = a.snapshot()
    const sb = b.snapshot()
    expect(sa.frontPct).toBeCloseTo(sb.frontPct, 10)
    expect(sa.monad.fallen).toBe(sb.monad.fallen)
    expect(sa.troy.fielded).toBe(sb.troy.fielded)
    a.stop(); b.stop()
  })
})
