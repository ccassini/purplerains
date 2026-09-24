import {
  BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three'
import { WORLD_ARC_DASH_LENGTH, WORLD_ARC_MAX_DELAY } from './worldArcTiming.js'

const BURST_SLOTS = 3
const CURVE_SEGMENTS = 24
const RADIAL_SEGMENTS = 3
const TO_RAD = Math.PI / 180

const VERTEX_SHADER = `
  #include <common>
  #include <logdepthbuf_pars_vertex>

  attribute vec3 sourceDirection;
  attribute vec2 sourceLocation;
  attribute float sourceIndex;
  uniform vec3 uTargetDirection;
  uniform vec2 uTargetLocation;
  uniform float uProposerIndex;
  uniform float uRadius;
  uniform float uMaxDelay;
  varying float vDistance;
  varying float vDelay;
  varying float vEnabled;

  vec3 perpendicular(vec3 direction) {
    vec3 axis = abs(direction.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    return normalize(cross(axis, direction));
  }

  vec3 greatCirclePoint(vec3 start, vec3 end, float t) {
    float cosine = clamp(dot(start, end), -1.0, 1.0);
    if (cosine > 0.9995) return normalize(mix(start, end, t));
    vec3 tangent = end - start * cosine;
    float tangentLength = length(tangent);
    tangent = tangentLength > 0.0001 ? tangent / tangentLength : perpendicular(start);
    float angle = acos(cosine) * t;
    return start * cos(angle) + tangent * sin(angle);
  }

  void main() {
    float t = position.x;
    float u = 1.0 - t;
    float distanceScale = min(1.0, length(uTargetLocation - sourceLocation) / 140.0);
    float altitude = 0.22 + distanceScale * 0.1;
    float controlRadius = uRadius * (1.0 + 1.5 * altitude);
    vec3 p0 = sourceDirection * uRadius;
    vec3 p1 = greatCirclePoint(sourceDirection, uTargetDirection, 0.25) * controlRadius;
    vec3 p2 = greatCirclePoint(sourceDirection, uTargetDirection, 0.75) * controlRadius;
    vec3 p3 = uTargetDirection * uRadius;

    // Same cubic control points as globe.gl's raised great-circle arcs.
    vec3 center = u*u*u*p0 + 3.0*u*u*t*p1 + 3.0*u*t*t*p2 + t*t*t*p3;
    vec3 derivative = 3.0*u*u*(p1-p0) + 6.0*u*t*(p2-p1) + 3.0*t*t*(p3-p2);
    float tangentLength = length(derivative);
    vec3 tangent = tangentLength > 0.0001 ? derivative / tangentLength : perpendicular(sourceDirection);
    vec3 normal = cross(normalize(center), tangent);
    float normalLength = length(normal);
    normal = normalLength > 0.0001 ? normal / normalLength : perpendicular(tangent);
    vec3 binormal = cross(tangent, normal);
    float tubeRadius = (0.8 + distanceScale * 0.7) * 0.5;
    vec3 worldPosition = center + tubeRadius * (normal * position.y + binormal * position.z);

    vDistance = t;
    vDelay = distanceScale * uMaxDelay;
    vEnabled = abs(sourceIndex - uProposerIndex) < 0.5 ? 0.0 : 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPosition, 1.0);
    #include <logdepthbuf_vertex>
  }
`

const FRAGMENT_SHADER = `
  #include <logdepthbuf_pars_fragment>
  uniform float uProgress;
  uniform float uDashLength;
  varying float vDistance;
  varying float vDelay;
  varying float vEnabled;

  void main() {
    float head = uProgress - vDelay;
    if (vEnabled < 0.5 || vDistance > head || vDistance < head - uDashLength) discard;
    vec4 startColor = vec4(168.0/255.0, 85.0/255.0, 247.0/255.0, 0.35);
    vec4 middleColor = vec4(233.0/255.0, 213.0/255.0, 1.0, 0.98);
    vec4 endColor = vec4(192.0/255.0, 132.0/255.0, 252.0/255.0, 0.45);
    gl_FragColor = vDistance < 0.5
      ? mix(startColor, middleColor, vDistance * 2.0)
      : mix(middleColor, endColor, (vDistance - 0.5) * 2.0);
    #include <logdepthbuf_fragment>
  }
`

function nodeLocation(node) {
  const lat = Number.isFinite(node.renderLat) ? node.renderLat : node.lat
  const lon = Number.isFinite(node.renderLon) ? node.renderLon : node.lon
  return { lat, lon }
}

function createGeometry(nodes) {
  const geometry = new InstancedBufferGeometry()
  const verticesPerRing = RADIAL_SEGMENTS + 1
  const positions = new Float32Array((CURVE_SEGMENTS + 1) * verticesPerRing * 3)
  const indices = new Uint16Array(CURVE_SEGMENTS * RADIAL_SEGMENTS * 6)
  let offset = 0
  for (let segment = 0; segment <= CURVE_SEGMENTS; segment += 1) {
    for (let radial = 0; radial <= RADIAL_SEGMENTS; radial += 1) {
      const angle = radial / RADIAL_SEGMENTS * Math.PI * 2
      positions[offset++] = segment / CURVE_SEGMENTS
      positions[offset++] = Math.cos(angle)
      positions[offset++] = Math.sin(angle)
    }
  }
  offset = 0
  for (let segment = 0; segment < CURVE_SEGMENTS; segment += 1) {
    for (let radial = 0; radial < RADIAL_SEGMENTS; radial += 1) {
      const a = segment * verticesPerRing + radial
      const b = a + verticesPerRing
      const c = b + 1
      const d = a + 1
      indices.set([a, d, b, b, d, c], offset)
      offset += 6
    }
  }

  const directions = new Float32Array(nodes.length * 3)
  const locations = new Float32Array(nodes.length * 2)
  const sourceIndices = new Float32Array(nodes.length)
  nodes.forEach((node, index) => {
    const { lat, lon } = nodeLocation(node)
    const phi = lat * TO_RAD
    const theta = lon * TO_RAD
    directions[index * 3] = Math.cos(phi) * Math.sin(theta)
    directions[index * 3 + 1] = Math.sin(phi)
    directions[index * 3 + 2] = Math.cos(phi) * Math.cos(theta)
    locations[index * 2] = lat
    locations[index * 2 + 1] = lon
    sourceIndices[index] = index
  })

  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('sourceDirection', new InstancedBufferAttribute(directions, 3))
  geometry.setAttribute('sourceLocation', new InstancedBufferAttribute(locations, 2))
  geometry.setAttribute('sourceIndex', new InstancedBufferAttribute(sourceIndices, 1))
  geometry.instanceCount = nodes.length
  return geometry
}

/**
 * One persistent GPU batch per active block, with no timers or playback queue.
 * Scene owners call update(now) before rendering and dispose() on unmount.
 */
export function createWorld3DArcLayer(validators, radius = 100) {
  const nodes = validators.filter(node => {
    const { lat, lon } = nodeLocation(node)
    return node.id != null && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  })
  const byId = new Map(nodes.map((node, index) => [String(node.id), index]))
  const geometry = createGeometry(nodes)
  const group = new Group()
  group.name = 'world-live-arc-bursts'
  let disposed = false
  let lastBlock = null
  const slots = Array.from({ length: BURST_SLOTS }, (_, index) => {
    const material = new ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uTargetDirection: { value: new Vector3(0, 0, 1) },
        uTargetLocation: { value: new Vector2() },
        uProposerIndex: { value: -1 },
        uRadius: { value: radius },
        uMaxDelay: { value: WORLD_ARC_MAX_DELAY },
        uDashLength: { value: WORLD_ARC_DASH_LENGTH },
        uProgress: { value: 0 },
      },
    })
    const mesh = new Mesh(geometry, material)
    mesh.name = `world-arc-burst-${index}`
    mesh.frustumCulled = false
    mesh.visible = false
    group.add(mesh)
    return { mesh, startedAt: -Infinity, expiresAt: -Infinity, travel: 1 }
  })

  const clear = () => {
    for (const slot of slots) slot.mesh.visible = false
  }

  const update = now => {
    if (disposed || !Number.isFinite(now)) return
    for (const slot of slots) {
      if (!slot.mesh.visible) continue
      if (now >= slot.expiresAt) slot.mesh.visible = false
      else slot.mesh.material.uniforms.uProgress.value = Math.max(0, (now - slot.startedAt) / slot.travel)
    }
  }

  return {
    group,
    start(proposer, timing, now) {
      if (disposed || !Number.isFinite(now) || !Number.isSafeInteger(timing?.number) || timing.number < 0) return false
      if (!Number.isFinite(timing.travel) || timing.travel <= 0 || !Number.isFinite(timing.total) || timing.total < timing.travel) return false
      if (lastBlock != null && timing.number <= lastBlock) return false
      const index = byId.get(String(proposer?.id))
      if (index == null) return false

      update(now)
      const slot = slots.find(entry => !entry.mesh.visible)
        || slots.reduce((oldest, entry) => entry.startedAt < oldest.startedAt ? entry : oldest)
      const uniforms = slot.mesh.material.uniforms
      uniforms.uTargetDirection.value.fromBufferAttribute(geometry.attributes.sourceDirection, index)
      uniforms.uTargetLocation.value.fromBufferAttribute(geometry.attributes.sourceLocation, index)
      uniforms.uProposerIndex.value = index
      uniforms.uProgress.value = 0
      slot.startedAt = now
      slot.expiresAt = now + timing.total
      slot.travel = timing.travel
      slot.mesh.visible = true
      lastBlock = timing.number
      return true
    },
    update,
    clear,
    dispose() {
      if (disposed) return
      disposed = true
      clear()
      group.removeFromParent()
      geometry.dispose()
      for (const slot of slots) slot.mesh.material.dispose()
      group.clear()
    },
  }
}
