import { describe, expect, test } from 'vitest'
import { Group, Mesh, MeshPhongMaterial, Raycaster, SphereGeometry, Vector3 } from 'three'
import { createWorld3DMarkerCache, isSphereOccludingMarker, updateWorld3DMarkerVisibility } from '../world3DOcclusion'

const point = (x, y = 0, z = 0) => ({ x, y, z })
const origin = point(0)

describe('World3D moon occlusion', () => {
  test.each([
    ['through center', point(-10), point(10), 0, true],
    ['behind the camera', point(10), point(20), 0, false],
    ['marker before the moon', point(-10), point(-3), 0, false],
    ['marker at the near surface', point(-10), point(-2), 0, false],
    ['marker inside the moon', point(-10), point(0), 0, true],
    ['within marker clearance', point(-10), point(-1), 2, false],
    ['beyond marker clearance', point(-10), point(1), 2, true],
    ['outside the silhouette', point(-10, 2.01), point(10, 2.01), 0, false],
    ['tangent to the sphere', point(-10, 2), point(10, 2), 0, true],
    ['camera inside a FrontSide moon', point(0), point(10), 0, false],
    ['surface camera looking away', point(2), point(10), 0, false],
    ['surface camera looking inward', point(-2), point(10), 0, true],
    ['coincident camera and marker', point(-10), point(-10), 0, false],
  ])('%s', (_, camera, marker, clearance, expected) => {
    expect(isSphereOccludingMarker(camera, marker, origin, 2, clearance)).toBe(expected)
  })

  test('agrees with the existing Three moon mesh across camera positions', () => {
    const moon = new Mesh(new SphereGeometry(27, 40, 40), new MeshPhongMaterial())
    moon.position.set(345, 35, 0)
    moon.updateMatrixWorld(true)
    const raycaster = new Raycaster()
    const direction = new Vector3()
    const cameras = [
      new Vector3(0, 0, 600),
      moon.position.clone().normalize().multiplyScalar(600),
      moon.position.clone(),
      moon.position.clone().normalize().multiplyScalar(-600),
    ]
    for (const camera of cameras) {
      for (let index = 0; index < 218; index += 1) {
        const y = 1 - 2 * (index + 0.5) / 218
        const angle = index * Math.PI * (3 - Math.sqrt(5))
        const spread = Math.sqrt(1 - y * y)
        const marker = new Vector3(101.2 * Math.cos(angle) * spread, 101.2 * y, 101.2 * Math.sin(angle) * spread)
        const distance = camera.distanceTo(marker)
        raycaster.set(camera, direction.copy(marker).sub(camera).normalize())
        const hits = raycaster.intersectObject(moon, false)
        const expected = hits.length > 0 && hits[0].distance < distance - 4
        expect(isSphereOccludingMarker(camera, marker, moon.position, 27, 4)).toBe(expected)
      }
    }
    moon.geometry.dispose()
    moon.material.dispose()
  })
})

describe('World3D marker cache', () => {
  function marker() {
    const object = new Group()
    object.isCSS2DObject = true
    object.element = {}
    return object
  }

  test('finds markers mounted after data arrives and reuses the finished cache', () => {
    const scene = new Group()
    const cache = createWorld3DMarkerCache(scene)
    const data = [{}]
    expect(cache.get(data)).toHaveLength(0)
    const object = marker()
    scene.add(object)
    const found = cache.get(data)
    expect(found).toEqual([object])
    expect(cache.get(data)).toBe(found)
    cache.dispose()
  })

  test('replaces a detached marker even if data length is unchanged', () => {
    const scene = new Group()
    const cache = createWorld3DMarkerCache(scene)
    const before = marker()
    scene.add(before)
    cache.get([{}])
    const nextData = [{}]
    cache.get(nextData) // The async renderer still has the previous object.
    scene.remove(before)
    const after = marker()
    scene.add(after)
    expect(cache.get(nextData)).toEqual([after])
    cache.dispose()
  })

  test('releases marker listeners when disposed', () => {
    const scene = new Group()
    const object = marker()
    scene.add(object)
    const cache = createWorld3DMarkerCache(scene)
    cache.get([{}])
    expect(object._listeners.removed).toHaveLength(1)
    cache.dispose()
    expect(object._listeners.removed).toHaveLength(0)
  })
})

describe('World3D marker visibility', () => {
  function element() {
    const writes = []
    return {
      dataset: {},
      style: new Proxy({}, {
        set(target, property, value) {
          writes.push([property, value])
          target[property] = value
          return true
        },
      }),
      writes,
    }
  }

  test('keeps moon occlusion when the globe reports the marker is in front', () => {
    const el = element()
    updateWorld3DMarkerVisibility(el, { globeFront: true })
    expect(el.style.visibility).toBe('visible')
    updateWorld3DMarkerVisibility(el, { moonOccluded: true })
    updateWorld3DMarkerVisibility(el, { globeFront: true })
    expect(el.style.visibility).toBe('hidden')
    expect(el.style.opacity).toBe('0')
    expect(el.style.pointerEvents).toBe('none')
  })

  test('keeps back-side markers hidden after the moon passes', () => {
    const el = element()
    updateWorld3DMarkerVisibility(el, { globeFront: false, moonOccluded: true })
    updateWorld3DMarkerVisibility(el, { moonOccluded: false })
    expect(el.style.visibility).toBe('hidden')
    updateWorld3DMarkerVisibility(el, { globeFront: true })
    expect(el.style.visibility).toBe('visible')
    expect(el.style.opacity).toBe('1')
    expect(el.style.pointerEvents).toBe('auto')
  })

  test('writes DOM styles only when combined visibility changes', () => {
    const el = element()
    updateWorld3DMarkerVisibility(el, { globeFront: true, moonOccluded: false })
    expect(el.writes).toHaveLength(3)
    updateWorld3DMarkerVisibility(el, { globeFront: true })
    updateWorld3DMarkerVisibility(el, { moonOccluded: false })
    expect(el.writes).toHaveLength(3)
    updateWorld3DMarkerVisibility(el, { moonOccluded: true })
    expect(el.writes).toHaveLength(6)
  })
})
