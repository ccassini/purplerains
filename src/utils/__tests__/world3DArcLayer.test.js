import { describe, expect, test } from 'vitest'
import { Group } from 'three'
import { createWorld3DArcLayer } from '../world3DArcLayer'

const nodes = [
  { id: 1, lat: 0, lon: 0 },
  { id: 2, lat: 0, lon: 90 },
  { id: 3, lat: 90, lon: 0 },
]
const timing = number => ({ number, travel: 210, total: 285.6 })
const active = layer => layer.group.children.filter(mesh => mesh.visible)

describe('persistent World 3D arcs', () => {
  test('allocates three burst slots sharing one fixed geometry for all validators', () => {
    const layer = createWorld3DArcLayer(nodes, 100)
    expect(layer.group.children).toHaveLength(3)
    expect(active(layer)).toHaveLength(0)
    expect(new Set(layer.group.children.map(mesh => mesh.geometry)).size).toBe(1)
    expect(new Set(layer.group.children.map(mesh => mesh.material)).size).toBe(3)
    for (const mesh of layer.group.children) {
      expect(mesh.geometry.isInstancedBufferGeometry).toBe(true)
      expect(mesh.geometry.instanceCount).toBe(nodes.length)
      expect(mesh.frustumCulled).toBe(false)
      expect(mesh.material.depthTest).toBe(true)
      expect(mesh.material.depthWrite).toBe(false)
    }
    layer.dispose()
  })

  test('uses globe-compatible source directions and displaced marker coordinates', () => {
    const layer = createWorld3DArcLayer([
      ...nodes,
      { id: 4, lat: 30, lon: 20, renderLat: 0, renderLon: 180 },
    ], 100)
    const directions = layer.group.children[0]?.geometry.attributes.sourceDirection
    expect(directions?.count).toBe(4)
    expect(directions.getX(0)).toBeCloseTo(0)
    expect(directions.getZ(0)).toBeCloseTo(1)
    expect(directions.getX(1)).toBeCloseTo(1)
    expect(directions.getY(2)).toBeCloseTo(1)
    expect(directions.getZ(3)).toBeCloseTo(-1)
    layer.dispose()
  })

  test('starts on the current block immediately while an earlier flight finishes', () => {
    const layer = createWorld3DArcLayer(nodes)
    expect(layer.start(nodes[0], timing(100), 1000)).toBe(true)
    expect(layer.start(nodes[1], timing(101), 1060)).toBe(true)
    expect(active(layer)).toHaveLength(2)
    layer.update(1120)
    const [first, second] = active(layer)
    expect(first.material.uniforms.uProgress.value).toBeCloseTo(120 / 210)
    expect(second.material.uniforms.uProgress.value).toBeCloseTo(60 / 210)
    expect(first.material.uniforms.uProposerIndex.value).toBe(0)
    expect(second.material.uniforms.uProposerIndex.value).toBe(1)
    layer.update(1286)
    expect(active(layer)).toHaveLength(1)
    layer.update(1346)
    expect(active(layer)).toHaveLength(0)
    layer.update(5000)
    expect(active(layer)).toHaveLength(0)
    layer.dispose()
  })

  test('reuses the exact GPU resources across 1200 verified blocks', () => {
    const layer = createWorld3DArcLayer(nodes)
    const geometry = layer.group.children[0]?.geometry
    const materials = layer.group.children.map(mesh => mesh.material)
    expect(geometry).toBeDefined()
    for (let number = 0; number < 1200; number += 1) {
      expect(layer.start(nodes[number % nodes.length], timing(number), number * 300)).toBe(true)
      layer.update(number * 300 + 120)
      expect(active(layer)).toHaveLength(1)
      expect(layer.group.children.every(mesh => mesh.geometry === geometry)).toBe(true)
      expect(layer.group.children.map(mesh => mesh.material)).toEqual(materials)
    }
    layer.dispose()
  })

  test('a consecutive block from the same proposer starts a new phase immediately', () => {
    const layer = createWorld3DArcLayer(nodes)
    layer.start(nodes[0], timing(100), 0)
    layer.update(100)
    expect(active(layer)[0].material.uniforms.uProgress.value).toBeCloseTo(100 / 210)
    expect(layer.start(nodes[0], timing(101), 120)).toBe(true)
    expect(active(layer)).toHaveLength(2)
    expect(active(layer)[0].material.uniforms.uProgress.value).toBeCloseTo(120 / 210)
    expect(active(layer)[1].material.uniforms.uProgress.value).toBe(0)
    layer.dispose()
  })

  test('replaces only the oldest slot during a four-block arrival burst', () => {
    const layer = createWorld3DArcLayer(nodes)
    layer.start(nodes[0], timing(100), 0)
    layer.start(nodes[1], timing(101), 10)
    layer.start(nodes[2], timing(102), 20)
    layer.start(nodes[1], timing(103), 30)
    layer.update(40)
    expect(active(layer)).toHaveLength(3)
    expect(active(layer).map(mesh => mesh.material.uniforms.uProgress.value))
      .toEqual([10 / 210, 30 / 210, 20 / 210])
    layer.dispose()
  })

  test('does not replay duplicate, old, unknown-proposer, or invalid blocks', () => {
    const layer = createWorld3DArcLayer(nodes)
    expect(layer.start(nodes[0], timing(100), 0)).toBe(true)
    expect(layer.start(nodes[1], timing(100), 10)).toBe(false)
    expect(layer.start(nodes[1], timing(99), 20)).toBe(false)
    expect(layer.start({ id: 999, lat: 0, lon: 0 }, timing(101), 30)).toBe(false)
    expect(layer.start(nodes[1], { number: 101, travel: 0, total: 1 }, 40)).toBe(false)
    layer.clear()
    expect(active(layer)).toHaveLength(0)
    expect(layer.start(nodes[0], timing(100), 50)).toBe(false)
    expect(layer.start(nodes[2], timing(101), 60)).toBe(true)
    layer.dispose()
  })

  test('disposes shared geometry once, each material once, and detaches the group', () => {
    const layer = createWorld3DArcLayer(nodes)
    const scene = new Group()
    scene.add(layer.group)
    let geometryDisposals = 0
    let materialDisposals = 0
    layer.group.children[0]?.geometry.addEventListener('dispose', () => { geometryDisposals += 1 })
    layer.group.children.forEach(mesh => mesh.material.addEventListener('dispose', () => { materialDisposals += 1 }))
    layer.dispose()
    layer.dispose()
    expect(geometryDisposals).toBe(1)
    expect(materialDisposals).toBe(3)
    expect(layer.group.parent).toBeNull()
    expect(scene.children).toHaveLength(0)
    expect(layer.start(nodes[0], timing(102), 1000)).toBe(false)
  })
})
