import { describe, expect, test } from 'vitest'
import {
  createWorldArcClock,
  getWorldArcTiming,
  instantiateWorldArcs,
  selectWorldBlock,
  WORLD_ARC_DASH_LENGTH,
  WORLD_ARC_MAX_DELAY,
} from '../worldArcTiming'

const block = (number, receivedAt, proposerId = 1) => ({
  number,
  receivedAt,
  proposerValidator: proposerId == null ? null : { id: proposerId },
})

describe('World live source selection', () => {
  test('uses the newer verified height even when it arrives from the full-block fallback', () => {
    const head = block(100, 1000)
    const full = block(101, 1300)
    expect(selectWorldBlock(head, full)).toBe(full)
  })

  test('uses full-block attribution for the same head while validator metadata catches up', () => {
    const head = block(100, 1000, null)
    const full = block(100, 1100)
    expect(selectWorldBlock(head, full)).toBe(full)
  })

  test('keeps a current head ahead of a slow full block', () => {
    const head = block(101, 1300)
    expect(selectWorldBlock(head, block(100, 1400))).toBe(head)
    expect(selectWorldBlock(head, block(101, 1400))).toBe(head)
  })

  test('keeps a confirmed proposer drawable while a newer full block awaits attribution', () => {
    const confirmed = block(100, 1000)
    const pending = block(101, 1300, null)
    expect(selectWorldBlock(confirmed, pending)).toBe(confirmed)
  })

  test('falls back when a head is unavailable or malformed', () => {
    const full = block(100, 1000)
    expect(selectWorldBlock(null, full)).toBe(full)
    expect(selectWorldBlock({ number: 'invalid' }, full)).toBe(full)
    expect(selectWorldBlock(null, null)).toBeNull()
  })
})

describe('live World arc cadence', () => {
  test('accepts a burst immediately for every 300ms block, including the same proposer', () => {
    const next = createWorldArcClock()
    const frames = [0, 300, 600, 900].map((at, i) => next(block(100 + i, at), at))
    expect(frames.map(frame => frame.number)).toEqual([100, 101, 102, 103])
    expect(frames.every(frame => frame.cadence === 300)).toBe(true)
  })

  test('does not restart the flight for a duplicate or an older block', () => {
    const next = createWorldArcClock()
    next(block(100, 1000), 1000)
    expect(next(block(100, 1000), 1120)).toBeNull()
    expect(next(block(99, 700), 1180)).toBeNull()
    expect(next(block(101, 1300), 1300).cadence).toBe(300)
  })

  test('measures block receipt cadence independently of delayed proposer resolution', () => {
    const next = createWorldArcClock()
    next(block(100, 1000), 1000)
    next(block(101, 1300), 1480)
    expect(next(block(102, 1600), 1600).cadence).toBe(300)
  })

  test('accepts a late proposer once and never animates older attribution', () => {
    const next = createWorldArcClock()
    expect(next(block(100, 1000, null), 1000)).toBeNull()
    expect(next(block(100, 1000), 1100)?.number).toBe(100)
    expect(next(block(101, 1300, null), 1300)).toBeNull()
    expect(next(block(100, 1000), 1400)).toBeNull()
    expect(next(block(101, 1300), 1420)?.number).toBe(101)
  })

  test('a newer unknown block cannot consume a confirmed block that has never drawn', () => {
    const next = createWorldArcClock()
    expect(next(block(101, 1300, null), 1450)).toBeNull()
    expect(next(block(100, 1000), 1500)?.number).toBe(100)
    expect(next(block(102, 1600), 1700)?.number).toBe(102)
    expect(next(block(101, 1300), 1750)).toBeNull()
  })

  test('sustains real bursts when pinned proposer replies trail fast bodies by more than one block', () => {
    const next = createWorldArcClock()
    const events = []
    // Bodies publish after the existing 120ms attribution race plus 30ms RPC.
    // Proposer fallback takes 500ms, while real headers arrive every 300ms.
    for (let index = 0; index < 6; index++) {
      const number = 100 + index
      const receivedAt = 1000 + index * 300
      events.push({ at: receivedAt + 150, source: 'full', value: block(number, receivedAt, null) })
      events.push({ at: receivedAt + 500, source: 'head', value: block(number, receivedAt) })
    }
    events.sort((a, b) => a.at - b.at)

    let head = null
    let full = null
    const bursts = []
    for (const event of events) {
      if (event.source === 'head') head = event.value
      else full = event.value
      const candidate = selectWorldBlock(head, full)
      const timing = candidate && next(candidate, event.at)
      if (timing) bursts.push({ number: timing.number, at: event.at })
    }

    expect(bursts).toEqual([
      { number: 100, at: 1500 },
      { number: 101, at: 1800 },
      { number: 102, at: 2100 },
      { number: 103, at: 2400 },
      { number: 104, at: 2700 },
      { number: 105, at: 3000 },
    ])
  })

  test('normalizes decimal and hex heights without inventing blocks', () => {
    const next = createWorldArcClock()
    expect(next(block('100', 1000), 1000)?.number).toBe(100)
    expect(next(block('0x65', 1300), 1300)?.number).toBe(101)
    expect(next(block('invalid', 1600), 1600)).toBeNull()
  })

  test('normalizes skipped heights to the per-block cadence', () => {
    const next = createWorldArcClock()
    next(block(100, 1000), 1000)
    expect(next(block(103, 1900), 1900).cadence).toBe(300)
  })

  test.each([160, 170, 280, 300])('lets the entire delayed dash finish within a %ims block window', cadence => {
    const timing = getWorldArcTiming(cadence)
    const tailExit = timing.travel * (1 + WORLD_ARC_MAX_DELAY + WORLD_ARC_DASH_LENGTH)
    expect(timing.total).toBeGreaterThanOrEqual(tailExit)
    expect(timing.total).toBeLessThanOrEqual(cadence - 8)
  })

  test('each block starts with fresh globe data so a reused proposer resets its dash phase', () => {
    const template = [{ startLat: 10, startLng: 20, endLat: 30, endLng: 40, delay: 0.1 }]
    const first = instantiateWorldArcs(template)
    first[0].__threeObjArc = { dashTranslate: 1.6 }
    const second = instantiateWorldArcs(template)
    expect(second).not.toBe(first)
    expect(second[0]).not.toBe(first[0])
    expect(second[0].__threeObjArc).toBeUndefined()
    expect(template[0].__threeObjArc).toBeUndefined()
  })
})
