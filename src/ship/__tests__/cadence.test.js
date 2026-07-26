/**
 * Cadence stress: the harbour must absorb Monad's live 300ms block rate.
 *
 * These tests measure the visible tip lag — the gap between the last pushed
 * block number (the HUD tip) and the newest hull actually lying at a berth —
 * under the delivery patterns the live feed really produces: a steady 300ms
 * drumbeat, WebSocket bursts, and a stall followed by a catch-up burst.
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

const block = (over = {}) => {
  const n = over.number ?? 1000
  const txCount = over.transactionCount ?? 40
  const recruits = over.recruits ?? Array.from(
    { length: Math.min(24, txCount) },
    (_, i) => ({ hash: `0xc${n}tx${i}`, value: 1, gasPrice: 50, category: 'transfer' }),
  )
  return {
    number: n,
    hash: over.hash ?? `0xc${n}`,
    transactionCount: txCount,
    fillPct: over.fillPct ?? 50,
    hashes: over.hashes ?? [],
    recruits,
    burnedMon: over.burnedMon ?? 0.1,
  }
}

/** Gap between the tip and the newest hull lying at a berth, if any is moored. */
function berthedLag(engine, tip) {
  const berthed = engine.getSnapshot().berths
    .filter(Boolean)
    .map((b) => Number(b.number))
  if (!berthed.length) return null
  return tip - Math.max(...berthed)
}

describe('the harbour keeps pace with live 300ms cadence', () => {
  test('sustained drumbeat: 200 blocks, lag stays within a hand of hulls', async () => {
    const engine = await makeEngine()
    const BASE = 30000
    // Warm up: fill the berths from a cold harbour.
    for (let i = 0; i < 12; i++) {
      engine.pushVessel(block({ number: BASE + i, transactionCount: 30 }))
      pump(0.3)
    }
    let worst = 0
    let worstQueue = 0
    for (let i = 12; i < 200; i++) {
      const tip = BASE + i
      engine.pushVessel(block({ number: tip, transactionCount: 30 }))
      pump(0.3)
      const lag = berthedLag(engine, tip)
      if (lag !== null) worst = Math.max(worst, lag)
      worstQueue = Math.max(worstQueue, engine.getSnapshot().stats.queueDepth)
    }
    const st = engine.getSnapshot().stats
    expect(st.fastForwarded).toBe(0)
    expect(worstQueue).toBeLessThanOrEqual(4)
    expect(worst).toBeLessThanOrEqual(5)
    engine.stop()
  })

  test('websocket bursts: trios every 900ms, same average rate, no folding', async () => {
    const engine = await makeEngine()
    const BASE = 40000
    let n = 0
    let worst = 0
    // 60 trios = 180 blocks at the true average rate of 3.33 blocks/s.
    for (let burst = 0; burst < 60; burst++) {
      for (let k = 0; k < 3; k++) {
        engine.pushVessel(block({ number: BASE + n, transactionCount: 30 }))
        n++
      }
      pump(0.9)
      const lag = berthedLag(engine, BASE + n - 1)
      if (lag !== null && burst > 4) worst = Math.max(worst, lag)
    }
    const st = engine.getSnapshot().stats
    expect(st.fastForwarded).toBe(0)
    expect(worst).toBeLessThanOrEqual(6)
    engine.stop()
  })

  test('throttled 4fps frames at live cadence: the clamp boundary holds wall time', async () => {
    const engine = await makeEngine()
    const BASE = 60000
    // 60s of live chain rendered at 250ms frames — the exact edge of the
    // fixed-step clamp, where sim time still equals wall time. Blocks keep
    // their true 300ms wall schedule, so arrivals and frames beat against
    // each other: five blocks land across every six frames.
    let n = 0
    let nextBlockAt = 0.3
    let wall = 0
    let worst = 0
    let worstQueue = 0
    for (let f = 0; f < 240; f++) {
      wall += 0.25
      while (nextBlockAt <= wall + 1e-9) {
        engine.pushVessel(block({ number: BASE + n, transactionCount: 30 }))
        n++
        nextBlockAt += 0.3
      }
      pump(0.25, 250)
      if (f > 40) {
        const lag = berthedLag(engine, BASE + n - 1)
        if (lag !== null) worst = Math.max(worst, lag)
        worstQueue = Math.max(worstQueue, engine.getSnapshot().stats.queueDepth)
      }
    }
    const st = engine.getSnapshot().stats
    expect(st.blocks).toBe(n)
    expect(st.fastForwarded).toBe(0)
    expect(worstQueue).toBeLessThanOrEqual(4)
    expect(worst).toBeLessThanOrEqual(6)
    engine.stop()
  })

  test('stall then catch-up burst: the harbour recovers within seconds', async () => {
    const engine = await makeEngine()
    const BASE = 50000
    for (let i = 0; i < 20; i++) {
      engine.pushVessel(block({ number: BASE + i, transactionCount: 30 }))
      pump(0.3)
    }
    // Feed hiccup: 2.4s of silence, then the 8 missed blocks land at once.
    pump(2.4)
    let n = 20
    for (let k = 0; k < 8; k++) {
      engine.pushVessel(block({ number: BASE + n, transactionCount: 30 }))
      n++
    }
    // Back to the live drumbeat; the backlog must drain, not persist.
    for (let i = 0; i < 30; i++) {
      engine.pushVessel(block({ number: BASE + n, transactionCount: 30 }))
      n++
      pump(0.3)
    }
    const tip = BASE + n - 1
    const lag = berthedLag(engine, tip)
    const st = engine.getSnapshot().stats
    expect(st.queueDepth).toBeLessThanOrEqual(2)
    expect(lag).not.toBeNull()
    expect(lag).toBeLessThanOrEqual(5)
    engine.stop()
  })
})
