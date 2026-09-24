import { describe, expect, test, vi } from 'vitest'
import { createAgora3DArcLayer, AGORA_ARC_LIFETIME_MS } from '../agora3DArcLayer'

const transfer = (id, values = {}) => ({ id, startLat: 40.7, startLng: -74, endLat: 35.7, endLng: 139.7, kind: 'transfer', ...values })

describe('persistent Agora transfer arcs', () => {
  test('starts all new transfers at the supplied time with no playback queue', () => {
    const layer = createAgora3DArcLayer()
    expect(layer.addBatch([transfer('a'), transfer('b')], 100)).toBe(2)
    const mesh = layer.group.children[0]
    expect(layer.activeCount).toBe(2)
    expect(mesh.visible).toBe(true)
    expect(mesh.geometry.attributes.arcTiming.getX(0)).toBe(0)
    expect(mesh.geometry.attributes.arcTiming.getX(1)).toBe(0)
    layer.update(650)
    expect(mesh.material.uniforms.uTime.value).toBeCloseTo(0.55)
    layer.dispose()
  })

  test('expires each flight once, independent of newer transfers', () => {
    const layer = createAgora3DArcLayer()
    layer.addBatch([transfer('first')], 0)
    layer.addBatch([transfer('second')], 500)
    layer.update(AGORA_ARC_LIFETIME_MS)
    expect(layer.activeCount).toBe(1)
    layer.update(AGORA_ARC_LIFETIME_MS + 500)
    expect(layer.activeCount).toBe(0)
    expect(layer.group.children[0].visible).toBe(false)
    layer.update(100_000)
    expect(layer.activeCount).toBe(0)
    expect(layer.addBatch([transfer('first')], 100_001)).toBe(0)
    layer.dispose()
  })

  test('bounds active work and replaces oldest arrivals even when timestamps match', () => {
    const layer = createAgora3DArcLayer({ capacity: 4 })
    layer.addBatch(Array.from({ length: 4 }, (_, index) => transfer(`a${index}`)), 0)
    layer.addBatch(Array.from({ length: 4 }, (_, index) => transfer(`b${index}`, { startLat: index * 10 })), 0)
    expect(layer.activeCount).toBe(4)
    const source = layer.group.children[0].geometry.attributes.sourceDirection
    for (let index = 0; index < 4; index += 1) expect(source.getY(index)).toBeCloseTo(Math.sin(index * 10 * Math.PI / 180), 6)
    layer.dispose()
  })

  test('keeps one geometry, material, and typed attribute buffer through thousands of events', () => {
    const layer = createAgora3DArcLayer()
    const mesh = layer.group.children[0]
    const geometry = mesh.geometry
    const material = mesh.material
    const buffers = Object.values(geometry.attributes).map((attribute) => attribute.array)
    for (let batch = 0; batch < 1000; batch += 1) {
      layer.addBatch(Array.from({ length: 64 }, (_, index) => transfer(`${batch}-${index}`)), batch * 50)
      layer.update(batch * 50 + 16)
      expect(layer.activeCount).toBeLessThanOrEqual(128)
    }
    expect(layer.group.children).toHaveLength(1)
    expect(mesh.geometry).toBe(geometry)
    expect(mesh.material).toBe(material)
    Object.values(geometry.attributes).forEach((attribute, index) => expect(attribute.array).toBe(buffers[index]))
    layer.dispose()
  })

  test('rejects missing identifiers, invalid coordinates, and nonfinite clocks', () => {
    const layer = createAgora3DArcLayer()
    expect(layer.addBatch([transfer(null), transfer('bad', { startLat: NaN }), transfer('range', { endLng: 181 })], 0)).toBe(0)
    expect(layer.addBatch([transfer('time')], Infinity)).toBe(0)
    expect(layer.addBatch(null, 0)).toBe(0)
    expect(layer.activeCount).toBe(0)
    layer.dispose()
  })

  test('same-anchor transfers use one finite local loop with the same expiry and dedupe', () => {
    const layer = createAgora3DArcLayer()
    expect(layer.addBatch([transfer('local', { endLat: 40.7, endLng: -74 })], 0)).toBe(1)
    const { sourceDirection, tangentDirection, arcStyle } = layer.group.children[0].geometry.attributes
    expect(arcStyle.getX(0)).toBe(0)
    expect(Math.hypot(tangentDirection.getX(0), tangentDirection.getY(0), tangentDirection.getZ(0))).toBeCloseTo(1, 6)
    expect(sourceDirection.getY(0)).toBeCloseTo(Math.sin(40.7 * Math.PI / 180), 6)
    layer.update(AGORA_ARC_LIFETIME_MS)
    expect(layer.activeCount).toBe(0)
    expect(layer.addBatch([transfer('local', { endLat: 40.7, endLng: -74 })], 2000)).toBe(0)
    layer.dispose()
  })

  test('great circle bases remain finite at poles, near-coincident points, and antipodes', () => {
    const routes = [
      [0, 0, 0, 180], [90, 0, -90, 0], [0, 0, 0.00001, 0.00001],
      [89.999, 179.999, -89.999, -0.001], [40, 170, 40, -170],
    ]
    const layer = createAgora3DArcLayer()
    layer.addBatch(routes.map(([startLat, startLng, endLat, endLng], index) => transfer(index, { startLat, startLng, endLat, endLng })), 0)
    const { sourceDirection, tangentDirection, arcStyle } = layer.group.children[0].geometry.attributes
    routes.forEach((route, index) => {
      const source = [sourceDirection.getX(index), sourceDirection.getY(index), sourceDirection.getZ(index)]
      const tangent = [tangentDirection.getX(index), tangentDirection.getY(index), tangentDirection.getZ(index)]
      const angle = arcStyle.getX(index)
      const altitude = arcStyle.getY(index)
      for (let step = 0; step <= 100; step += 1) {
        const t = step / 100
        const direction = source.map((value, axis) => value * Math.cos(angle * t) + tangent[axis] * Math.sin(angle * t))
        expect(direction.every(Number.isFinite)).toBe(true)
        expect(Math.hypot(...direction)).toBeCloseTo(1, 5)
        expect(100 * (1 + altitude * Math.sin(Math.PI * t))).toBeGreaterThanOrEqual(100)
      }
      const endLat = route[2] * Math.PI / 180
      const endLng = route[3] * Math.PI / 180
      const expected = [Math.cos(endLat) * Math.sin(endLng), Math.sin(endLat), Math.cos(endLat) * Math.cos(endLng)]
      expected.forEach((value, axis) => expect(source[axis] * Math.cos(angle) + tangent[axis] * Math.sin(angle)).toBeCloseTo(value, 5))
    })
    layer.dispose()
  })

  test('clear removes flights while retaining dedupe, and dispose releases resources once', () => {
    const layer = createAgora3DArcLayer()
    const mesh = layer.group.children[0]
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose')
    const materialDispose = vi.spyOn(mesh.material, 'dispose')
    layer.addBatch([transfer('a')], 0)
    layer.clear()
    expect(layer.activeCount).toBe(0)
    expect(layer.addBatch([transfer('a')], 500)).toBe(0)
    expect(layer.addBatch([transfer('b')], 500)).toBe(1)
    layer.dispose()
    layer.dispose()
    expect(geometryDispose).toHaveBeenCalledTimes(1)
    expect(materialDispose).toHaveBeenCalledTimes(1)
    expect(layer.addBatch([transfer('c')], 1000)).toBe(0)
  })

  test('rebases a long-running scene clock without changing active flight ages', () => {
    const layer = createAgora3DArcLayer()
    layer.addBatch([transfer('a')], 0)
    layer.update(1_800_000)
    layer.addBatch([transfer('b')], 1_800_050)
    layer.update(1_800_100)
    const mesh = layer.group.children[0]
    const elapsed = mesh.material.uniforms.uTime.value - mesh.geometry.attributes.arcTiming.getX(0)
    expect(elapsed).toBeCloseTo(0.05, 5)
    expect(mesh.material.uniforms.uTime.value).toBeLessThan(1800)
    layer.dispose()
  })
})
