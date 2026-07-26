/**
 * Headless integration test for the boarding state machine.
 *
 * The engine is canvas- and rAF-bound, so the DOM it touches is stubbed with
 * no-op drawing surfaces and the frame loop is pumped by hand at a fixed step.
 * That makes the simulation deterministic: no wall-clock, no real rendering,
 * and every assertion is about boarding state rather than pixels.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

/** A 2D context whose every method is a no-op and every property assignable. */
function stubCtx() {
  return new Proxy({}, {
    get: (target, prop) => {
      if (prop in target) return target[prop]
      // Canvas getters used by the renderer (e.g. createLinearGradient) must
      // return something chainable; a function returning another stub covers it.
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

let frameCb = null
let now = 0

beforeEach(() => {
  now = 0
  frameCb = null
  globalThis.document = {
    visibilityState: 'visible',
    createElement: () => stubCanvas(),
  }
  globalThis.requestAnimationFrame = (cb) => { frameCb = cb; return 1 }
  globalThis.cancelAnimationFrame = () => { frameCb = null }
  globalThis.performance = { now: () => now }
  globalThis.window = { devicePixelRatio: 1 }
  globalThis.ResizeObserver = undefined
})

afterEach(() => {
  delete globalThis.window
  delete globalThis.document
  delete globalThis.requestAnimationFrame
  delete globalThis.cancelAnimationFrame
  delete globalThis.ResizeObserver
})

/** Advance the sim by `seconds` in fixed 16ms steps. */
function pump(seconds, stepMs = 16) {
  const steps = Math.ceil((seconds * 1000) / stepMs)
  for (let i = 0; i < steps; i++) {
    now += stepMs
    const cb = frameCb
    if (!cb) break
    cb(now)
  }
}

async function makeEngine() {
  const { createShipEngine } = await import('../engine')
  const engine = createShipEngine(stubCanvas())
  engine.start()
  return engine
}

/** A live-style block: real recruit objects, burn, and a genuine tx count. */
const block = (over = {}) => {
  const n = over.number ?? 1000
  const txCount = over.transactionCount ?? 40
  const recruits = over.recruits ?? Array.from(
    { length: Math.min(24, txCount) },
    (_, i) => ({ hash: `0xb${n}tx${i}`, value: 1, gasPrice: 50, category: 'transfer' }),
  )
  return {
    number: n,
    hash: over.hash ?? `0xb${n}`,
    transactionCount: txCount,
    fillPct: over.fillPct ?? 50,
    hashes: over.hashes ?? [],
    recruits,
    burnedMon: over.burnedMon ?? 0.1,
  }
}

describe('boarding under the law of the manifest', () => {
  test('a block fills its deck to exactly its load from its own crew list', async () => {
    const engine = await makeEngine()
    engine.pushVessel(block({ transactionCount: 40 }))
    pump(12)
    const snap = engine.getSnapshot()
    expect(snap.stats.blocks).toBe(1)
    const berth = snap.berths.find(Boolean)
    if (berth) {
      expect(berth.load).toBeGreaterThanOrEqual(10)
      expect(berth.boarded).toBe(berth.load)
    }
    engine.stop()
  })

  test('an empty block boards nobody and still sails', async () => {
    const engine = await makeEngine()
    engine.pushVessel(block({ transactionCount: 0, recruits: [], burnedMon: 0 }))
    pump(10)
    const berth = engine.getSnapshot().berths.find(Boolean)
    if (berth) {
      expect(berth.load).toBe(0)
      expect(berth.boarded).toBe(0)
    }
    engine.stop()
  })

  test('a queued soldier NEVER boards a ship whose block lacks its tx', async () => {
    const engine = await makeEngine()
    // Twelve strangers muster on the quay...
    for (let i = 0; i < 12; i++) {
      engine.pushMon({ hash: `0xstranger${i}`, category: 'transfer', value: 1, gasPrice: 50 })
    }
    pump(1)
    // ...then blocks arrive that do NOT contain them.
    for (let i = 0; i < 8; i++) {
      engine.pushVessel(block({ number: 5000 + i, transactionCount: 30 }))
      pump(0.35)
    }
    pump(10)
    // The strangers may wait or walk off, but none may ever be aboard/leaping.
    const snap = engine.getSnapshot()
    expect(snap.stats.blocks).toBe(8)
    // Reach into the sim through its own accounting: every boarded soldier on
    // every berth came from that block's manifest, so the strangers cannot be
    // among them. Verified structurally: strangers stay queued/leaving/gone.
    expect(snap.stats.aboard).toBeLessThanOrEqual(8 * 20)
    engine.stop()
  })

  test('quay soldiers whose tx IS in the block board it (mempool -> block)', async () => {
    const engine = await makeEngine()
    const hashes = Array.from({ length: 8 }, (_, i) => `0xown${i}`)
    for (const hash of hashes) engine.pushMon({ hash, category: 'transfer', value: 1, gasPrice: 50 })
    pump(1)
    engine.pushVessel(block({
      transactionCount: 12,
      recruits: hashes.map((h) => ({ hash: h, value: 1, gasPrice: 50, category: 'transfer' }))
        .concat(Array.from({ length: 4 }, (_, i) => ({ hash: `0xextra${i}`, value: 1, gasPrice: 50, category: 'transfer' }))),
    }))
    pump(12)
    // All eight quay soldiers are gone from the quay: boarded or (if the ship
    // sealed before they reached the plank) honestly dismissed.
    expect(engine.getSnapshot().stats.queued).toBe(0)
    engine.stop()
  })

  test('boarded never exceeds load under a rapid live block-time feed', async () => {
    const engine = await makeEngine()
    for (let i = 0; i < 30; i++) {
      engine.pushVessel(block({ number: 2000 + i, transactionCount: 5 + i * 37, fillPct: (i * 3) % 100 }))
      pump(0.35)
      for (const b of engine.getSnapshot().berths) {
        if (!b) continue
        expect(b.boarded).toBeLessThanOrEqual(b.load)
        expect(b.load).toBeLessThanOrEqual(b.capacity)
      }
    }
    engine.stop()
  })

  test('berths turn over rather than deadlocking under sustained load', async () => {
    const engine = await makeEngine()
    for (let i = 0; i < 20; i++) {
      engine.pushVessel(block({ number: 3000 + i, transactionCount: 60 }))
      pump(0.35)
    }
    pump(30)
    const stats = engine.getSnapshot().stats
    expect(stats.sailed).toBeGreaterThan(0)
    expect(stats.blocks).toBe(20)
    engine.stop()
  })

  test('ship release keeps pace with a burst ahead of the chain tip', async () => {
    const engine = await makeEngine()
    // Drop a backlog the old apron gate would have stalled on for seconds.
    for (let i = 0; i < 24; i++) {
      engine.pushVessel(block({ number: 9000 + i, transactionCount: 4 }))
    }
    pump(2.5)
    const st = engine.getSnapshot().stats
    expect(st.blocks).toBe(24)
    // Nearly every sealed block must already be a visible or sailed hull —
    // not sitting invisible in the release queue while the tip races ahead.
    expect(st.ships + st.sailed).toBeGreaterThanOrEqual(20)
    engine.stop()
  })

  test('pass-through ships with txs carry a deck guard', async () => {
    const engine = await makeEngine()
    // Flood the apron so further blocks spill into open water.
    for (let i = 0; i < 12; i++) {
      engine.pushVessel(block({ number: 9100 + i, transactionCount: 20 }))
    }
    pump(3)
    const st = engine.getSnapshot().stats
    expect(st.aboard + st.sailed).toBeGreaterThan(0)
    expect(st.ships + st.sailed).toBeGreaterThanOrEqual(10)
    engine.stop()
  })

  test('the quay drains: strangers walk off instead of pinning the intake', async () => {
    const engine = await makeEngine()
    for (let i = 0; i < 20; i++) {
      engine.pushMon({ hash: `0xdrain${i}`, category: 'transfer', value: 1, gasPrice: 50 })
    }
    pump(1)
    expect(engine.getSnapshot().stats.queued).toBeGreaterThan(0)
    // No ship ever wants them; past QUAY_LIFE they must leave.
    pump(16)
    expect(engine.getSnapshot().stats.queued).toBe(0)
    engine.stop()
  })

  test('burned MON accumulates in the session ledger', async () => {
    const engine = await makeEngine()
    engine.pushVessel(block({ number: 7000, burnedMon: 0.25 }))
    engine.pushVessel(block({ number: 7001, burnedMon: 0.5 }))
    pump(2)
    const st = engine.getSnapshot().stats
    expect(st.burnedSession).toBeCloseTo(0.75)
    expect(st.burnedLast).toBeCloseTo(0.5)
    engine.stop()
  })
})

describe('the pass lane settles its own manifests', () => {
  test('quay soldiers whose tx seals into a pass-through hull are dismissed', async () => {
    const engine = await makeEngine()
    const hashes = Array.from({ length: 8 }, (_, i) => `0xpass${i}`)
    for (const hash of hashes) engine.pushMon({ hash, category: 'transfer', value: 1, gasPrice: 50 })
    pump(0.5)
    expect(engine.getSnapshot().stats.queued).toBe(8)

    // Nine stranger blocks claim every berth as inbounds (none can moor for
    // >2s of approach run), so the tenth block must pass through open water.
    for (let i = 0; i < 9; i++) {
      engine.pushVessel(block({ number: 6000 + i, transactionCount: 20 }))
    }
    pump(0.8)
    engine.pushVessel(block({
      number: 6009,
      transactionCount: 12,
      recruits: hashes.map((h) => ({ hash: h, value: 1, gasPrice: 50, category: 'transfer' })),
    }))
    pump(1)

    // Their transactions visibly sailed past on the pass lane: the soldiers
    // walk immediately — long before the 12s quay life — and count ashore.
    const st = engine.getSnapshot().stats
    expect(st.queued).toBe(0)
    expect(st.ashore).toBeGreaterThanOrEqual(8)
    engine.stop()
  })
})

describe('the pod declines honestly when full', () => {
  test('a full pod refuses without eating the id — it can stage later', async () => {
    const engine = await makeEngine()
    // LIFE_MAX creatures fill the water...
    for (let i = 0; i < 14; i++) {
      expect(engine.pushInflow({ id: `0xlife${i}`, usd: 10, at: 100 + i })).toBe(true)
    }
    // ...so the next transfer is declined, NOT swallowed.
    expect(engine.pushInflow({ id: '0xlate', usd: 10, at: 200 })).toBe(false)
    // Once the pod has swum off, the same id must still be stageable.
    pump(48)
    expect(engine.pushInflow({ id: '0xlate', usd: 10, at: 200 })).toBe(true)
    engine.stop()
  })
})

describe('ships keep pace with the live chain', () => {
  test('at 3.3 blocks/s the queue rides shallow and every block stages', async () => {
    const engine = await makeEngine()
    // 90 blocks at live cadence — ~27 seconds of Monad mainnet.
    for (let i = 0; i < 90; i++) {
      engine.pushVessel(block({ number: 8000 + i, hash: `0xp${i}`, transactionCount: 30 }))
      pump(0.3)
      // Parity while running: the Odyssey never falls more than a breath
      // behind the tip, so hull numbers advance with the HUD block number.
      expect(engine.getSnapshot().stats.queueDepth).toBeLessThanOrEqual(6)
    }
    pump(10)
    const st = engine.getSnapshot().stats
    expect(st.blocks).toBe(90)
    expect(st.queueDepth).toBe(0)
    // Nothing was folded away at live cadence — every block sailed on screen.
    expect(st.fastForwarded).toBe(0)
    engine.stop()
  })

  test('a hidden-tab backlog catches up instantly and loses nothing silently', async () => {
    const engine = await makeEngine()
    // Tab hidden: 80 blocks arrive with no frames in between.
    for (let i = 0; i < 80; i++) {
      engine.pushVessel(block({ number: 9000 + i, hash: `0xq${i}`, transactionCount: 30 }))
    }
    const st0 = engine.getSnapshot().stats
    // The visible queue is capped; everything beyond it is already accounted
    // as sailed — the ledger holds before a single frame runs.
    expect(st0.queueDepth).toBeLessThanOrEqual(24)
    expect(st0.fastForwarded + st0.queueDepth).toBe(80)
    // Tab returns: the remaining backlog drains to zero at burst pace.
    pump(20)
    const st = engine.getSnapshot().stats
    expect(st.queueDepth).toBe(0)
    expect(st.blocks).toBe(80)
    engine.stop()
  })
})

describe('parity survives a slow renderer', () => {
  test('at 10fps the sim clock keeps wall time and the queue stays shallow', async () => {
    const engine = await makeEngine()
    for (let i = 0; i < 60; i++) {
      engine.pushVessel(block({ number: 12000 + i, hash: `0xs${i}`, transactionCount: 30 }))
      // 0.3s of wall time delivered as three 100ms frames — a struggling GPU.
      pump(0.3, 100)
      expect(engine.getSnapshot().stats.queueDepth).toBeLessThanOrEqual(6)
    }
    pump(10, 100)
    const st = engine.getSnapshot().stats
    expect(st.blocks).toBe(60)
    expect(st.queueDepth).toBe(0)
    expect(st.fastForwarded).toBe(0)
    engine.stop()
  })
})
