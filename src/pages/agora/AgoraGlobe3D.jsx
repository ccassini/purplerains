import { useEffect, useRef } from 'react'
import { ACESFilmicToneMapping, AmbientLight, Color, DirectionalLight, HemisphereLight, SRGBColorSpace, TextureLoader } from 'three'
import { createAgora3DArcLayer } from '../../utils/agora3DArcLayer'

const EARTH_ASSETS = 'https://unpkg.com/three-globe/example/img/'
const DEFAULT_VIEW = { lat: 20, lng: 15, altitude: 2.1 }

function validNode(node) {
  return node?.id != null && Number.isFinite(node.lat) && Number.isFinite(node.lon) && Math.abs(node.lat) <= 90 && Math.abs(node.lon) <= 180
}

function markerElement(node, callbacks, elements) {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'ag-node'
  const location = [node.city, node.country].filter(Boolean).join(', ') || String(node.id)
  element.title = location
  element.setAttribute('aria-label', `Select ${location}`)
  element.setAttribute('aria-pressed', String(String(callbacks.current.selectedNodeId) === String(node.id)))
  element.classList.toggle('is-selected', String(callbacks.current.selectedNodeId) === String(node.id))
  const image = document.createElement('img')
  image.src = node.logo || '/ausd.png'
  image.alt = ''
  image.draggable = false
  image.decoding = 'async'
  image.addEventListener('error', () => {
    image.remove()
    const fallback = document.createElement('span')
    fallback.textContent = String(node.city || 'A').slice(0, 1)
    element.appendChild(fallback)
  }, { once: true })
  element.appendChild(image)
  // Native click covers keyboard activation; a marker never starts globe drag.
  element.addEventListener('pointerdown', (event) => event.stopPropagation())
  element.addEventListener('click', (event) => {
    event.stopPropagation()
    callbacks.current.onSelectNode?.(node)
  })
  elements.set(String(node.id), element)
  return element
}

function markerVisibility(element, visible) {
  const next = visible ? 'true' : 'false'
  if (element.dataset.front === next) return
  element.dataset.front = next
  element.style.visibility = visible ? 'visible' : 'hidden'
  element.style.pointerEvents = visible ? 'auto' : 'none'
  element.tabIndex = visible ? 0 : -1
  element.setAttribute('aria-hidden', String(!visible))
}

// globe.gl clears its data layers but leaves the scene shell and host renderer.
function disposeSceneShell(scene) {
  const geometries = new Set()
  const materials = new Set()
  const textures = new Set()
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue
      materials.add(material)
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
      for (const uniform of Object.values(material.uniforms || {})) if (uniform?.value?.isTexture) textures.add(uniform.value)
    }
  })
  for (const geometry of geometries) geometry.dispose()
  for (const texture of textures) texture.dispose()
  for (const material of materials) material.dispose()
  scene.clear()
}

/** Presentation-only globe: batches already contain the application's real events. */
export default function AgoraGlobe3D({ nodes, batch, paused = false, autoRotate = true, selectedNodeId, onSelectNode, onReady, onError, controlsRef }) {
  const hostRef = useRef(null)
  const runtimeRef = useRef(null)
  const callbacks = useRef(null)
  callbacks.current = { nodes, batch, paused, autoRotate, selectedNodeId, onSelectNode, onReady, onError, controlsRef }
  const lastBatchId = useRef(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    let alive = true
    let globe = null
    let layer = null
    let observer = null
    let readyFrame = 0
    let dragging = false
    let ready = false
    let previousBeforeRender = null
    let publicControls = null
    const elements = new Map()
    const ownedTextures = new Set()
    const pendingLoads = new Set()
    const releases = []

    const notifyFailure = (error) => {
      if (!alive) return
      const notify = callbacks.current.onError
      cleanup()
      notify?.(error instanceof Error ? error : new Error('The 3D globe could not be initialized.'))
    }

    const loadTexture = (file, color = false) => new Promise((resolve, reject) => {
      let texture
      let settled = false
      const finish = (error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        pendingLoads.delete(cancel)
        if (error) {
          texture?.dispose()
          ownedTextures.delete(texture)
          reject(error)
        } else resolve(texture)
      }
      const cancel = () => finish(new Error('Globe texture loading cancelled'))
      const timeout = window.setTimeout(() => finish(new Error('Globe texture loading timed out')), 15_000)
      pendingLoads.add(cancel)
      texture = new TextureLoader().load(`${EARTH_ASSETS}${file}`, (loaded) => {
        if (!alive || settled) { loaded.dispose(); return }
        if (color) loaded.colorSpace = SRGBColorSpace
        loaded.anisotropy = Math.min(globe?.renderer().capabilities.getMaxAnisotropy() || 1, 4)
        finish()
      }, undefined, () => finish(new Error('The globe texture could not be loaded.')))
      ownedTextures.add(texture)
    })

    const syncMotion = () => {
      if (!alive || !globe) return
      const state = callbacks.current
      const hidden = document.visibilityState === 'hidden'
      globe.controls().autoRotate = Boolean(state.autoRotate && !state.paused && !hidden && !dragging)
      if (state.paused || hidden) layer?.clear()
      if (hidden) globe.pauseAnimation()
      else globe.resumeAnimation()
    }

    const updateSelection = () => {
      for (const [id, element] of elements) {
        const selected = String(callbacks.current.selectedNodeId) === id
        element.classList.toggle('is-selected', selected)
        element.setAttribute('aria-pressed', String(selected))
      }
    }

    const updateNodes = () => {
      if (!alive || !globe) return
      const valid = (callbacks.current.nodes || []).filter(validNode)
      const ids = new Set(valid.map((node) => String(node.id)))
      for (const id of elements.keys()) if (!ids.has(id)) elements.delete(id)
      globe.htmlElementsData(valid)
    }

    const receiveBatch = (incoming) => {
      if (!incoming || incoming.id == null || incoming.id === lastBatchId.current) return
      lastBatchId.current = incoming.id
      if (!ready || !alive || callbacks.current.paused || document.visibilityState === 'hidden') return
      const count = layer.addBatch(incoming.transfers, performance.now())
      if (import.meta.env.DEV) {
        host.dataset.batch = String(incoming.id)
        host.dataset.acceptedTransfers = String(count)
        host.dataset.activeArcs = String(layer.activeCount)
      }
    }

    function cleanup() {
      if (!alive) return
      alive = false
      ready = false
      window.cancelAnimationFrame(readyFrame)
      observer?.disconnect()
      releases.forEach((release) => release())
      for (const cancel of [...pendingLoads]) cancel()
      layer?.dispose()
      if (globe) {
        const scene = globe.scene()
        if (previousBeforeRender) scene.onBeforeRender = previousBeforeRender
        globe.pauseAnimation()
        globe._destructor?.()
        globe.controls().dispose()
        // The shell owns textures attached to its material; remove those from
        // this set so unattached, late-loading textures are the only leftovers.
        scene.traverse((object) => {
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (material) for (const value of Object.values(material)) if (value?.isTexture) ownedTextures.delete(value)
          }
        })
        disposeSceneShell(scene)
        globe.renderer().dispose()
        globe.renderer().forceContextLoss()
      }
      for (const texture of ownedTextures) texture.dispose()
      ownedTextures.clear()
      elements.clear()
      if (callbacks.current.controlsRef?.current === publicControls) callbacks.current.controlsRef.current = null
      if (runtimeRef.current?.receiveBatch === receiveBatch) runtimeRef.current = null
      host.replaceChildren()
    }

    async function boot() {
      try {
        const globeModule = await import('globe.gl')
        if (!alive || !host.isConnected) return
        const Globe = globeModule.default || globeModule
        globe = new Globe(host, {
          animateIn: false, waitForGlobeReady: false,
          rendererConfig: { antialias: true, alpha: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' },
        })
          .backgroundColor('rgba(0,0,0,0)')
          .atmosphereColor('#b99a63').atmosphereAltitude(0.12)
          .htmlLat((node) => node.lat).htmlLng((node) => node.lon).htmlAltitude(0.012)
          .htmlTransitionDuration(0)
          .htmlElement((node) => markerElement(node, callbacks, elements))
          .htmlElementVisibilityModifier(markerVisibility)
          .enablePointerInteraction(false)
        const renderer = globe.renderer()
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
        renderer.toneMapping = ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.15
        renderer.domElement.setAttribute('aria-label', 'Interactive globe of Agora transfer activity')
        const contextLost = (event) => { event.preventDefault(); notifyFailure(new Error('The 3D graphics context was interrupted. Please reload the globe.')) }
        renderer.domElement.addEventListener('webglcontextlost', contextLost)
        releases.push(() => renderer.domElement.removeEventListener('webglcontextlost', contextLost))

        const controls = globe.controls()
        controls.enablePan = false
        controls.autoRotateSpeed = 0.23
        controls.minDistance = 135
        controls.maxDistance = 650
        const startDrag = () => { dragging = true; syncMotion() }
        const endDrag = () => { dragging = false; syncMotion() }
        controls.addEventListener('start', startDrag)
        controls.addEventListener('end', endDrag)
        releases.push(() => { controls.removeEventListener('start', startDrag); controls.removeEventListener('end', endDrag) })
        globe.pointOfView(DEFAULT_VIEW, 0)

        const scene = globe.scene()
        const sun = new DirectionalLight(0xffe5b8, 1.3)
        sun.position.set(-160, 160, 250)
        const fill = new HemisphereLight(0xd6d9dd, 0x11131a, 0.65)
        const ambient = new AmbientLight(0xb1b6c9, 0.22)
        globe.lights([sun, fill, ambient])
        layer = createAgora3DArcLayer({ radius: globe.getGlobeRadius() })
        scene.add(layer.group)
        previousBeforeRender = scene.onBeforeRender
        scene.onBeforeRender = function (...args) {
          previousBeforeRender.apply(this, args)
          layer.update(performance.now())
          if (import.meta.env.DEV) host.dataset.activeArcs = String(layer.activeCount)
        }

        let lastWidth = 0
        let lastHeight = 0
        const resize = () => {
          if (!alive) return
          const width = Math.max(1, Math.round(host.clientWidth))
          const height = Math.max(1, Math.round(host.clientHeight))
          if (width === lastWidth && height === lastHeight) return
          lastWidth = width; lastHeight = height
          globe.width(width).height(height)
        }
        resize()
        observer = new ResizeObserver(resize)
        observer.observe(host)
        document.addEventListener('visibilitychange', syncMotion)
        releases.push(() => document.removeEventListener('visibilitychange', syncMotion))
        runtimeRef.current = { receiveBatch, syncMotion, updateNodes, updateSelection }
        updateNodes()
        syncMotion()

        const zoom = (delta) => {
          if (!alive || !ready) return
          const view = globe.pointOfView()
          globe.pointOfView({ ...view, altitude: Math.max(0.35, Math.min(5.5, view.altitude + delta)) }, 220)
        }
        publicControls = {
          zoomIn: () => zoom(-0.35), zoomOut: () => zoom(0.35),
          reset: () => { if (alive && ready) globe.pointOfView(DEFAULT_VIEW, 650) },
          focus: (node) => {
            const target = validNode(node) ? node : (callbacks.current.nodes || []).find((entry) => String(entry.id) === String(node))
            if (alive && ready && validNode(target)) globe.pointOfView({ lat: target.lat, lng: target.lon, altitude: 1.3 }, 650)
          },
          clear: () => layer?.clear(),
        }

        const [day, night, topology] = await Promise.allSettled([
          loadTexture('earth-blue-marble.jpg', true), loadTexture('earth-night.jpg', true), loadTexture('earth-topology.png'),
        ])
        if (!alive) return
        if (day.status !== 'fulfilled') throw day.reason
        const material = globe.globeMaterial()
        material.color = new Color(0xa6a8ab)
        material.map = day.value
        if (night.status === 'fulfilled') material.emissiveMap = night.value
        material.emissive = new Color(0xc9b58b)
        material.emissiveIntensity = 0.45
        if (topology.status === 'fulfilled') material.bumpMap = topology.value
        material.bumpScale = 0.09
        material.specular = new Color(0x1a202a)
        material.shininess = 5
        material.needsUpdate = true
        renderer.compile(scene, globe.camera())
        readyFrame = window.requestAnimationFrame(() => {
          if (!alive || !host.isConnected) return
          ready = true
          // Batches received while the scene was loading are deliberately not
          // replayed after initialization, pause, or a background-tab interval.
          if (callbacks.current.batch?.id != null) lastBatchId.current = callbacks.current.batch.id
          if (callbacks.current.controlsRef) callbacks.current.controlsRef.current = publicControls
          syncMotion()
          callbacks.current.onReady?.()
        })
      } catch (error) { notifyFailure(error) }
    }
    boot()
    return cleanup
  }, [])

  useEffect(() => { runtimeRef.current?.updateNodes() }, [nodes])
  useEffect(() => { runtimeRef.current?.updateSelection() }, [selectedNodeId])
  useEffect(() => { runtimeRef.current?.syncMotion() }, [paused, autoRotate])
  useEffect(() => {
    if (runtimeRef.current) runtimeRef.current.receiveBatch(batch)
    else if (batch?.id != null) lastBatchId.current = batch.id
  }, [batch])

  return <div className="ag-globe" ref={hostRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} />
}
