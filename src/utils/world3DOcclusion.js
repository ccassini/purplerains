/** Test the camera-to-marker segment against the moon's front surface. */
export function isSphereOccludingMarker(camera, marker, center, radius, clearance = 0) {
  const dx = marker.x - camera.x
  const dy = marker.y - camera.y
  const dz = marker.z - camera.z
  const mx = camera.x - center.x
  const my = camera.y - center.y
  const mz = camera.z - center.z
  const lengthSquared = dx * dx + dy * dy + dz * dz
  if (lengthSquared < 1e-8) return false

  const outside = mx * mx + my * my + mz * mz - radius * radius
  // The moon uses FrontSide: a camera inside it cannot see an exit face.
  if (outside < 0) return false
  const projection = mx * dx + my * dy + mz * dz
  if (projection >= 0) return false
  const discriminant = projection * projection - lengthSquared * outside
  if (discriminant < 0) return false

  const entry = (-projection - Math.sqrt(discriminant)) / lengthSquared
  return entry >= 0 && entry < 1 - clearance / Math.sqrt(lengthSquared)
}

/** Globe-facing and moon visibility share one writer, in either callback order. */
export function updateWorld3DMarkerVisibility(element, { globeFront, moonOccluded } = {}) {
  if (globeFront !== undefined) {
    const value = globeFront ? '1' : '0'
    if (element.dataset.mw3GlobeFront !== value) element.dataset.mw3GlobeFront = value
  }
  if (moonOccluded !== undefined) {
    const value = moonOccluded ? '1' : '0'
    if (element.dataset.mw3MoonOccluded !== value) element.dataset.mw3MoonOccluded = value
  }
  const visible = element.dataset.mw3GlobeFront !== '0' && element.dataset.mw3MoonOccluded !== '1'
  const value = visible ? '1' : '0'
  if (element.dataset.mw3Visible === value) return
  element.dataset.mw3Visible = value
  element.style.opacity = value
  element.style.visibility = visible ? 'visible' : 'hidden'
  element.style.pointerEvents = visible ? 'auto' : 'none'
}

/** Discover async HTML objects until mounted, then reuse them between frames. */
export function createWorld3DMarkerCache(scene) {
  let markers = []
  let data = null
  let dirty = true
  const invalidate = () => { dirty = true }
  const release = () => {
    for (const marker of markers) marker.removeEventListener('removed', invalidate)
    markers = []
  }
  return {
    get(nextData) {
      if (!dirty && data === nextData && markers.length === nextData.length) return markers
      release()
      scene.traverse(object => {
        if (!object.isCSS2DObject || !object.element) return
        markers.push(object)
        object.addEventListener('removed', invalidate)
      })
      data = nextData
      dirty = markers.length !== nextData.length
      return markers
    },
    dispose() {
      release()
      data = null
      dirty = true
    },
  }
}
