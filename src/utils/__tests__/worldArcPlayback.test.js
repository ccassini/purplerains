import { describe, expect, test } from 'vitest'
import { createWorldArcPlayback } from '../worldArcPlayback'

const payload = number => ({ timing: { number }, v: { id: number + 1 } })

function playStream(arrivals, endAt) {
  const playback = createWorldArcPlayback()
  const starts = []
  let cursor = 0
  for (let now = 0; now <= endAt; now += 1) {
    while (cursor < arrivals.length && arrivals[cursor] === now) {
      playback.submit(payload(cursor), now)
      cursor += 1
    }
    const next = playback.take(now)
    if (next) starts.push({ at: now, number: next.timing.number })
  }
  return starts
}

describe('World arc playback', () => {
  test('buffers the first real block for 120ms and never invents another pulse', () => {
    const playback = createWorldArcPlayback()
    const first = payload(100)
    expect(playback.submit(first, 1000)).toBe(true)
    expect(playback.take(1119)).toBeNull()
    expect(playback.take(1120)).toBe(first)
    expect(playback.take(1420)).toBeNull()
    expect(playback.take(5000)).toBeNull()
  })

  test('paces the observed 529ms/62ms arrival pairs without replaying a missing block', () => {
    const starts = playStream([0, 529, 591, 1120, 1182, 1711, 1773], 2200)
    // A 120ms buffer cannot cover the first 229ms source delay. Wait for real
    // data at 529ms, then keep the following arrivals on a 300ms phase.
    expect(starts.map(start => start.at)).toEqual([120, 529, 829, 1129, 1429, 1729, 2029])
    expect(starts.map(start => start.number)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  test('smooths repeated 500ms/100ms jitter once the next verified block arrives', () => {
    const starts = playStream([0, 500, 600, 1100, 1200, 1700, 1800], 2400)
    expect(starts.map(start => start.at)).toEqual([120, 500, 800, 1100, 1400, 1700, 2000])
    expect(starts).toHaveLength(7)
  })

  test('absorbs an isolated 500ms delay by replacing stale backlog with fresh data', () => {
    const starts = playStream([0, 300, 1100, 1101, 1200, 1500], 2500)
    expect(starts.map(start => start.at)).toEqual([120, 420, 1220, 1520])
    expect(starts.map(start => start.number)).toEqual([0, 1, 4, 5])
  })

  test('preserves phase across an 8ms late frame with at least 292ms between starts', () => {
    const playback = createWorldArcPlayback()
    playback.submit(payload(1), 0)
    expect(playback.take(120)?.timing.number).toBe(1)
    playback.submit(payload(2), 300)
    expect(playback.take(428)?.timing.number).toBe(2)
    playback.submit(payload(3), 600)
    expect(playback.take(719)).toBeNull()
    expect(playback.take(720)?.timing.number).toBe(3)
  })

  test('reanchors after a frame more than 20ms late instead of starting the next burst early', () => {
    const playback = createWorldArcPlayback()
    playback.submit(payload(1), 0)
    playback.take(120)
    playback.submit(payload(2), 300)
    expect(playback.take(450)?.timing.number).toBe(2)
    playback.submit(payload(3), 600)
    expect(playback.take(720)).toBeNull()
    expect(playback.take(741)).toBeNull()
    expect(playback.take(750)?.timing.number).toBe(3)
  })

  test('after a one-second pause takes the freshest queued block and reanchors once', () => {
    const playback = createWorldArcPlayback()
    playback.submit(payload(1), 0)
    playback.take(120)
    playback.submit(payload(2), 300)
    playback.submit(payload(3), 600)
    playback.submit(payload(4), 900)
    expect(playback.take(1120)?.timing.number).toBe(4)
    playback.submit(payload(5), 1200)
    expect(playback.take(1419)).toBeNull()
    expect(playback.take(1420)?.timing.number).toBe(5)
    expect(playback.take(1720)).toBeNull()
  })

  test('holds at most the three newest pending blocks and drops pending data older than 600ms', () => {
    const playback = createWorldArcPlayback()
    for (let number = 1; number <= 10; number += 1) playback.submit(payload(number), 0)
    expect(playback.take(120)?.timing.number).toBe(8)
    expect(playback.take(420)?.timing.number).toBe(9)
    expect(playback.take(720)).toBeNull()
  })

  test('buffers a fresh block after an outage and drops all obsolete pending data', () => {
    const playback = createWorldArcPlayback()
    playback.submit(payload(1), 0)
    expect(playback.take(700)).toBeNull()
    playback.submit(payload(2), 1000)
    expect(playback.take(1119)).toBeNull()
    expect(playback.take(1120)?.timing.number).toBe(2)
  })

  test('buffers fresh data when startup was paused before the first frame', () => {
    const playback = createWorldArcPlayback()
    playback.submit(payload(1), 0)
    playback.submit(payload(2), 1000)
    expect(playback.take(1119)).toBeNull()
    expect(playback.take(1120)?.timing.number).toBe(2)
  })

  test.each([60, 120])('keeps 400 regular blocks near 300ms on a jittering %ifps frame clock', fps => {
    const playback = createWorldArcPlayback()
    const starts = []
    const jitter = [0, 1.7, -0.8, 0.4, -1.2, 0.7, -0.8]
    let nextNumber = 0
    let now = 0
    let frame = 0
    while (now < 400 * 300 + 1000) {
      while (nextNumber < 400 && nextNumber * 300 <= now) {
        expect(playback.submit(payload(nextNumber), nextNumber * 300)).toBe(true)
        nextNumber += 1
      }
      const next = playback.take(now)
      if (next) starts.push({ at: now, number: next.timing.number })
      now += 1000 / fps + jitter[frame % jitter.length]
      frame += 1
    }
    expect(starts.map(start => start.number)).toEqual(Array.from({ length: 400 }, (_, i) => i))
    const intervals = starts.slice(1).map((start, i) => start.at - starts[i].at)
    expect(Math.min(...intervals)).toBeGreaterThanOrEqual(292)
    expect(intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length).toBeCloseTo(300, 0)
  })

  test('rejects duplicate, older, and invalid block heights', () => {
    const playback = createWorldArcPlayback()
    expect(playback.submit(payload(100), 0)).toBe(true)
    expect(playback.submit(payload(100), 10)).toBe(false)
    expect(playback.submit(payload(99), 20)).toBe(false)
    expect(playback.submit(payload(-1), 30)).toBe(false)
    expect(playback.submit(payload(1.5), 40)).toBe(false)
    expect(playback.submit({ timing: {} }, 50)).toBe(false)
    expect(playback.take(120)?.timing.number).toBe(100)
    expect(playback.take(420)).toBeNull()
  })

  test('clear drops hidden-tab backlog while preserving dedupe and minimum spacing', () => {
    const playback = createWorldArcPlayback()
    playback.submit(payload(1), 0)
    playback.take(120)
    playback.submit(payload(2), 150)
    playback.clear()
    expect(playback.take(200)).toBeNull()
    expect(playback.submit(payload(2), 200)).toBe(false)
    expect(playback.submit(payload(3), 200)).toBe(true)
    expect(playback.take(320)).toBeNull()
    expect(playback.take(411)).toBeNull()
    expect(playback.take(412)?.timing.number).toBe(3)
  })
})
