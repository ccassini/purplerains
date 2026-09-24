import { describe, expect, test } from 'vitest'
import { unwrapArcLongitudes, visibleWorldCopies } from '../agoraMapGeometry'

describe('Agora map world wrapping', () => {
  test('crosses the antimeridian by the short route in either direction', () => {
    expect(unwrapArcLongitudes(170, -170, 0)).toEqual([170, 190])
    expect(unwrapArcLongitudes(-170, 170, 0)).toEqual([-170, -190])
  })

  test('keeps the arc near the camera after panning across multiple worlds', () => {
    expect(unwrapArcLongitudes(170, -170, 720)).toEqual([890, 910])
    expect(unwrapArcLongitudes(-170, 170, -720)).toEqual([-890, -910])
  })

  test('preserves ordinary paths and coincident endpoints', () => {
    expect(unwrapArcLongitudes(-74, 2, 0)).toEqual([-74, 2])
    expect(unwrapArcLongitudes(25, 25, 0)).toEqual([25, 25])
  })

  test('shows both clipped halves of a crossing on a one-world viewport', () => {
    expect(visibleWorldCopies(350, 370, 360, 360, 0)).toEqual([-1, 0])
  })

  test('covers repeated worlds without drawing copies outside the viewport', () => {
    const [first, last] = visibleWorldCopies(40, 100, 360, 1080, 0)
    expect([first, last]).toEqual([0, 2])
    for (let copy = first; copy <= last; copy += 1) {
      expect(100 + copy * 360).toBeGreaterThanOrEqual(0)
      expect(40 + copy * 360).toBeLessThanOrEqual(1080)
    }
  })

  test('does not draw while the viewport or projection has no size', () => {
    expect(visibleWorldCopies(0, 10, 0, 500)).toEqual([0, -1])
    expect(visibleWorldCopies(0, 10, 360, 0)).toEqual([0, -1])
  })
})
