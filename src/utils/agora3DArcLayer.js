import { BufferAttribute, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial } from 'three'

const TRAVEL_MS = 1100
const DASH_LENGTH = 0.26
const SEGMENTS = 32
const RADIAL_SEGMENTS = 3
const CLOCK_REBASE_MS = 1_800_000
const MAX_SEEN_IDS = 4096
export const AGORA_ARC_LIFETIME_MS = TRAVEL_MS * (1 + DASH_LENGTH)

const VERTEX_SHADER = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec3 sourceDirection;
  attribute vec3 tangentDirection;
  attribute vec3 arcStyle;
  attribute vec2 arcTiming;
  uniform float uRadius;
  uniform float uTime;
  uniform float uTravel;
  varying float vDistance;
  varying float vHead;
  varying float vEnabled;
  varying float vKind;
  void main() {
    float t = position.x;
    float angle = arcStyle.x;
    float altitude = arcStyle.y;
    float a = angle * t;
    vec3 direction = sourceDirection * cos(a) + tangentDirection * sin(a);
    vec3 directionDerivative = angle * (-sourceDirection * sin(a) + tangentDirection * cos(a));
    float radial = uRadius * (1.002 + altitude * sin(PI * t));
    float radialDerivative = uRadius * altitude * PI * cos(PI * t);
    vec3 normal = normalize(cross(sourceDirection, tangentDirection));
    vec3 center = direction * radial;
    vec3 derivative = directionDerivative * radial + direction * radialDerivative;
    if (angle == 0.0) {
      // A same-anchor transfer makes one local loop and returns to its node.
      // Its data endpoints remain identical; no second city is invented.
      float phase = 2.0 * PI * t;
      float reach = uRadius * 0.065;
      center = sourceDirection * uRadius * (1.004 + 0.025 * sin(PI * t))
        + reach * (tangentDirection * sin(phase) + normal * (1.0 - cos(phase)));
      derivative = sourceDirection * uRadius * 0.025 * PI * cos(PI * t)
        + reach * 2.0 * PI * (tangentDirection * cos(phase) + normal * sin(phase));
      normal = normalize(cross(sourceDirection, derivative));
    }
    vec3 tangent = normalize(derivative);
    vec3 binormal = cross(tangent, normal);
    float width = 0.20 + 0.12 * angle / PI;
    vec3 displaced = center + width * (normal * position.y + binormal * position.z);
    vDistance = t;
    vHead = (uTime - arcTiming.x) / uTravel;
    vEnabled = arcTiming.y;
    vKind = arcStyle.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
    #include <logdepthbuf_vertex>
  }
`

const FRAGMENT_SHADER = `
  #include <logdepthbuf_pars_fragment>
  uniform float uDashLength;
  varying float vDistance;
  varying float vHead;
  varying float vEnabled;
  varying float vKind;
  void main() {
    float behindHead = vHead - vDistance;
    if (vEnabled < 0.5 || behindHead < 0.0 || behindHead > uDashLength) discard;
    float brightness = 1.0 - behindHead / uDashLength;
    vec3 tail = vec3(0.64, 0.41, 0.12);
    vec3 head = vKind > 1.5 ? vec3(1.0, 0.70, 0.34)
      : vKind > 0.5 ? vec3(1.0, 0.96, 0.76) : vec3(1.0, 0.85, 0.48);
    gl_FragColor = vec4(mix(tail, head, brightness), 0.16 + 0.84 * brightness);
    #include <logdepthbuf_fragment>
  }
`

function createGeometry(capacity) {
  const geometry = new InstancedBufferGeometry()
  const ringSize = RADIAL_SEGMENTS + 1
  const positions = new Float32Array((SEGMENTS + 1) * ringSize * 3)
  const indices = new Uint16Array(SEGMENTS * RADIAL_SEGMENTS * 6)
  for (let segment = 0; segment <= SEGMENTS; segment += 1) {
    for (let radial = 0; radial <= RADIAL_SEGMENTS; radial += 1) {
      const offset = (segment * ringSize + radial) * 3
      const angle = radial / RADIAL_SEGMENTS * Math.PI * 2
      positions.set([segment / SEGMENTS, Math.cos(angle), Math.sin(angle)], offset)
      if (segment < SEGMENTS && radial < RADIAL_SEGMENTS) {
        const a = segment * ringSize + radial
        const b = a + ringSize
        indices.set([a, a + 1, b, b, a + 1, b + 1], (segment * RADIAL_SEGMENTS + radial) * 6)
      }
    }
  }
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  for (const [name, size] of [['sourceDirection', 3], ['tangentDirection', 3], ['arcStyle', 3], ['arcTiming', 2]]) {
    geometry.setAttribute(name, new InstancedBufferAttribute(new Float32Array(capacity * size), size).setUsage(DynamicDrawUsage))
  }
  // Disabled slots still run the vertex shader when another slot is visible.
  // Give them finite bases so normalize() never receives a zero vector.
  for (let index = 0; index < capacity; index += 1) {
    geometry.attributes.sourceDirection.setXYZ(index, 0, 0, 1)
    geometry.attributes.tangentDirection.setXYZ(index, 1, 0, 0)
    geometry.attributes.arcStyle.setXYZ(index, 1, 0.2, 0)
  }
  geometry.instanceCount = capacity
  return geometry
}

function routeBasis(transfer) {
  const { startLat, startLng, endLat, endLng } = transfer || {}
  if (![startLat, startLng, endLat, endLng].every(Number.isFinite) || Math.abs(startLat) > 90 || Math.abs(endLat) > 90 || Math.abs(startLng) > 180 || Math.abs(endLng) > 180) return null
  const radians = Math.PI / 180
  const unit = (lat, lon) => [Math.cos(lat * radians) * Math.sin(lon * radians), Math.sin(lat * radians), Math.cos(lat * radians) * Math.cos(lon * radians)]
  const source = unit(startLat, startLng)
  const target = unit(endLat, endLng)
  const difference = Math.hypot(...source.map((value, index) => value - target[index]))
  if (difference < 1e-9) {
    const perpendicular = Math.abs(source[1]) < 0.9 ? [source[2], 0, -source[0]] : [0, -source[2], source[1]]
    const length = Math.hypot(...perpendicular)
    return { source, tangent: perpendicular.map((value) => value / length), angle: 0, altitude: 0 }
  }
  const cosine = Math.max(-1, Math.min(1, source.reduce((sum, value, index) => sum + value * target[index], 0)))
  let tangent = target.map((value, index) => value - source[index] * cosine)
  let length = Math.hypot(...tangent)
  if (length < 1e-10) {
    // Exactly antipodal endpoints do not define a unique great-circle plane.
    tangent = Math.abs(source[1]) < 0.9 ? [source[2], 0, -source[0]] : [0, -source[2], source[1]]
    length = Math.hypot(...tangent)
  }
  tangent = tangent.map((value) => value / length)
  // atan2 keeps tiny but valid routes stable where acos(dot) rounds to zero.
  const angle = Math.atan2(Math.hypot(...target.map((value, index) => value - source[index] * cosine)), cosine)
  return { source, tangent, angle, altitude: 0.12 + 0.20 * angle / Math.PI }
}

/** A bounded pool of independently expiring transfers in one persistent GPU draw. */
export function createAgora3DArcLayer({ radius = 100, capacity = 128 } = {}) {
  const size = Number.isInteger(capacity) ? Math.max(1, Math.min(128, capacity)) : 128
  const geometry = createGeometry(size)
  const material = new ShaderMaterial({
    vertexShader: VERTEX_SHADER, fragmentShader: FRAGMENT_SHADER,
    transparent: true, depthTest: true, depthWrite: false, toneMapped: false,
    uniforms: {
      uRadius: { value: Number.isFinite(radius) && radius > 0 ? radius : 100 },
      uTime: { value: 0 }, uTravel: { value: TRAVEL_MS / 1000 }, uDashLength: { value: DASH_LENGTH },
    },
  })
  const mesh = new Mesh(geometry, material)
  mesh.name = 'agora-live-transfers'
  mesh.frustumCulled = false
  mesh.visible = false
  const group = new Group()
  group.name = 'agora-transfer-layer'
  group.add(mesh)
  const slots = Array.from({ length: size }, () => ({ active: false, startedAt: 0, order: 0 }))
  const seen = new Set()
  let origin = null
  let sequence = 0
  let activeCount = 0
  let disposed = false

  const update = (now) => {
    if (disposed || !Number.isFinite(now) || origin === null) return
    let changed = false
    if (now - origin >= CLOCK_REBASE_MS) {
      origin = now
      slots.forEach((slot, index) => { if (slot.active) geometry.attributes.arcTiming.setX(index, (slot.startedAt - origin) / 1000) })
      changed = true
    }
    material.uniforms.uTime.value = (now - origin) / 1000
    slots.forEach((slot, index) => {
      if (slot.active && now - slot.startedAt >= AGORA_ARC_LIFETIME_MS) {
        slot.active = false
        activeCount -= 1
        geometry.attributes.arcTiming.setY(index, 0)
        changed = true
      }
    })
    if (changed) geometry.attributes.arcTiming.needsUpdate = true
    mesh.visible = activeCount > 0
  }

  const clear = () => {
    for (const slot of slots) slot.active = false
    activeCount = 0
    geometry.attributes.arcTiming.array.fill(0)
    geometry.attributes.arcTiming.needsUpdate = true
    mesh.visible = false
  }

  return {
    group,
    get activeCount() { return activeCount },
    addBatch(transfers, now) {
      if (disposed || !Array.isArray(transfers) || !Number.isFinite(now)) return 0
      if (origin === null) origin = now
      update(now)
      let accepted = 0
      // A malformed oversized batch cannot create unbounded work or a backlog.
      for (let index = Math.max(0, transfers.length - size); index < transfers.length; index += 1) {
        const transfer = transfers[index]
        if (transfer?.id == null || String(transfer.id) === '') continue
        const id = String(transfer.id)
        if (seen.has(id)) continue
        const basis = routeBasis(transfer)
        if (!basis) continue
        seen.add(id)
        if (seen.size > MAX_SEEN_IDS) seen.delete(seen.values().next().value)
        let slotIndex = slots.findIndex((slot) => !slot.active)
        if (slotIndex < 0) slotIndex = slots.reduce((oldest, slot, current) => slot.order < slots[oldest].order ? current : oldest, 0)
        const slot = slots[slotIndex]
        if (!slot.active) activeCount += 1
        slot.active = true
        slot.startedAt = now
        slot.order = ++sequence
        geometry.attributes.sourceDirection.setXYZ(slotIndex, ...basis.source)
        geometry.attributes.tangentDirection.setXYZ(slotIndex, ...basis.tangent)
        geometry.attributes.arcStyle.setXYZ(slotIndex, basis.angle, basis.altitude, transfer.kind === 'mint' ? 1 : transfer.kind === 'burn' ? 2 : 0)
        geometry.attributes.arcTiming.setXY(slotIndex, (now - origin) / 1000, 1)
        accepted += 1
      }
      if (accepted) {
        for (const name of ['sourceDirection', 'tangentDirection', 'arcStyle', 'arcTiming']) geometry.attributes[name].needsUpdate = true
        mesh.visible = true
      }
      return accepted
    },
    update,
    clear,
    dispose() {
      if (disposed) return
      disposed = true
      clear()
      seen.clear()
      group.removeFromParent()
      group.clear()
      geometry.dispose()
      material.dispose()
    },
  }
}
