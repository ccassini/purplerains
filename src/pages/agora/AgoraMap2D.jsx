import { useEffect, useRef } from 'react'
import { unwrapArcLongitudes, visibleWorldCopies } from './agoraMapGeometry'

const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const FLIGHT_LIMIT = 128
const FLIGHT_DURATION = 1000
const COLORS = { transfer: '#d8b66c', mint: '#e7d99d', burn: '#d99871' }
const validPosition = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90
const mercatorLatitude = lat => Math.max(-85.051129, Math.min(85.051129, lat))
const worldZoom = width => Math.max(-1.2, Math.min(1.55, Math.log2(Math.max(240, width) / 580)))

function applyTheme(map) {
  for (const layer of map.getStyle()?.layers || []) {
    const name = `${layer.id} ${layer['source-layer'] || ''}`.toLowerCase()
    const set = (property, value) => {
      try { map.setPaintProperty(layer.id, property, value) } catch { /* Optional basemap layer. */ }
    }
    if (layer.type === 'background') set('background-color', '#16140f')
    if (layer.type === 'fill' && /water/.test(name)) set('fill-color', '#0b0d0c')
    else if (layer.type === 'fill' && /land|park|cover/.test(name)) set('fill-color', '#1c1a14')
    if (layer.type === 'line' && /boundary/.test(name)) {
      set('line-color', '#685d40')
      set('line-opacity', 0.46)
    } else if (layer.type === 'line' && /road/.test(name)) {
      set('line-color', '#393326')
      set('line-opacity', 0.3)
    }
    if (layer.type === 'symbol') {
      set('text-color', '#a39470')
      set('text-halo-color', '#12110e')
      set('text-halo-width', 1)
      set('text-opacity', ['interpolate', ['linear'], ['zoom'], 1.5, 0, 3, 0.85])
    }
  }
}

export default function AgoraMap2D({ nodes, batch, paused, selectedNodeId, onSelectNode, onReady, onError, controlsRef }) {
  const containerRef = useRef(null)
  const engineRef = useRef(null)
  const propsRef = useRef(null)
  propsRef.current = { nodes, batch, paused, selectedNodeId, onSelectNode, onReady, onError, controlsRef }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    let alive = true
    let failed = false
    let ready = false
    let map = null
    let canvas = null
    let context = null
    let observer = null
    let timeout = 0
    let frame = 0
    let width = 0
    let height = 0
    let pixelRatio = 1
    let revision = 0
    let worldWidth = 0
    let centerLng = 0
    let projectionRevision = -1
    let cursor = 0
    let activeCount = 0
    let lastBatchId = null
    let markers = []
    let markerData = null
    let markerClass = null
    let publishedControls = null
    let controlsOwner = null
    const slots = Array.from({ length: FLIGHT_LIMIT }, () => ({ active: false, revision: -1 }))
    const seen = new Set()
    const motionDuration = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400

    const clear = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      activeCount = 0
      for (const slot of slots) slot.active = false
      context?.clearRect(0, 0, width, height)
    }

    const wake = () => {
      if (!frame && alive && ready && activeCount && !propsRef.current.paused && document.visibilityState !== 'hidden') {
        frame = requestAnimationFrame(draw)
      }
    }

    const invalidateProjection = () => { revision += 1; wake() }

    function project(slot) {
      if (projectionRevision !== revision) {
        centerLng = map.getCenter().lng
        const origin = map.project([centerLng, 0])
        worldWidth = Math.abs(map.project([centerLng + 360, 0]).x - origin.x)
        projectionRevision = revision
      }
      const [fromLng, toLng] = unwrapArcLongitudes(slot.startLng, slot.endLng, centerLng)
      const source = map.project([fromLng, mercatorLatitude(slot.startLat)])
      const target = map.project([toLng, mercatorLatitude(slot.endLat)])
      const dx = target.x - source.x
      const dy = target.y - source.y
      const distance = Math.hypot(dx, dy)
      const lift = Math.min(120, Math.max(16, distance * 0.22))
      slot.x = source.x
      slot.y = source.y
      slot.endX = target.x
      slot.endY = target.y
      slot.pulse = distance < 4
      slot.cx = (source.x + target.x) / 2 + dy / Math.max(1, distance) * lift
      slot.cy = (source.y + target.y) / 2 - Math.abs(dx) / Math.max(1, distance) * lift
      slot.ax = source.x - 2 * slot.cx + target.x
      slot.ay = source.y - 2 * slot.cy + target.y
      slot.bx = 2 * (slot.cx - source.x)
      slot.by = 2 * (slot.cy - source.y)
      const copies = visibleWorldCopies(Math.min(source.x, slot.cx, target.x), Math.max(source.x, slot.cx, target.x), worldWidth, width)
      slot.firstCopy = copies[0]
      slot.lastCopy = copies[1]
      slot.revision = revision
    }

    function draw(now) {
      frame = 0
      if (!alive || !context || !ready) return
      if (propsRef.current.paused || document.visibilityState === 'hidden') { clear(); return }
      context.clearRect(0, 0, width, height)
      context.lineCap = 'round'
      for (const slot of slots) {
        if (!slot.active) continue
        const progress = (now - slot.startedAt) / FLIGHT_DURATION
        if (progress >= 1) { slot.active = false; activeCount -= 1; continue }
        if (slot.revision !== revision) project(slot)
        const head = Math.min(1, progress / 0.84)
        const tail = Math.max(0, head - 0.3)
        const fade = Math.min(1, progress / 0.08) * Math.min(1, (1 - progress) / 0.16)
        const hx = (slot.ax * head + slot.bx) * head + slot.x
        const hy = (slot.ay * head + slot.by) * head + slot.y
        const tx = (slot.ax * tail + slot.bx) * tail + slot.x
        const ty = (slot.ay * tail + slot.by) * tail + slot.y
        const cx = tx + (head - tail) * (slot.ax * tail + slot.bx / 2)
        const cy = ty + (head - tail) * (slot.ay * tail + slot.by / 2)
        context.strokeStyle = slot.color
        context.fillStyle = slot.color
        for (let copy = slot.firstCopy; copy <= slot.lastCopy; copy += 1) {
          const offset = copy * worldWidth
          if (slot.pulse) {
            context.globalAlpha = fade * (1 - progress) * 0.85
            context.lineWidth = 1.4
            context.beginPath()
            context.arc(slot.x + offset, slot.y, 5 + progress * 20, 0, Math.PI * 2)
            context.stroke()
            continue
          }
          context.globalAlpha = fade * 0.13
          context.lineWidth = 1
          context.beginPath()
          context.moveTo(slot.x + offset, slot.y)
          context.quadraticCurveTo(slot.cx + offset, slot.cy, slot.endX + offset, slot.endY)
          context.stroke()
          context.globalAlpha = fade * 0.9
          context.lineWidth = 1.7
          context.beginPath()
          context.moveTo(tx + offset, ty)
          context.quadraticCurveTo(cx + offset, cy, hx + offset, hy)
          context.stroke()
          context.beginPath()
          context.arc(hx + offset, hy, 2.2, 0, Math.PI * 2)
          context.fill()
        }
      }
      context.globalAlpha = 1
      wake()
    }

    const submit = value => {
      if (!value || value.id === lastBatchId) return
      lastBatchId = value.id
      if (!ready || propsRef.current.paused || document.visibilityState === 'hidden') return
      const now = performance.now()
      for (const transfer of (value.transfers || []).slice(-FLIGHT_LIMIT)) {
        if (!validPosition(transfer.startLat, transfer.startLng) || !validPosition(transfer.endLat, transfer.endLng)) continue
        if (seen.has(transfer.id)) continue
        seen.add(transfer.id)
        if (seen.size > 512) seen.delete(seen.values().next().value)
        const slot = slots[cursor]
        cursor = (cursor + 1) % FLIGHT_LIMIT
        if (!slot.active) activeCount += 1
        Object.assign(slot, {
          active: true, revision: -1, startedAt: now,
          startLat: transfer.startLat, startLng: transfer.startLng,
          endLat: transfer.endLat, endLng: transfer.endLng,
          color: COLORS[transfer.kind] || COLORS.transfer,
        })
      }
      wake()
    }

    const select = () => {
      for (const { node, element } of markers) {
        const selected = String(node.id) === String(propsRef.current.selectedNodeId)
        element.setAttribute('aria-pressed', String(selected))
        element.classList.toggle('is-selected', selected)
      }
    }

    const setNodes = values => {
      if (!ready || values === markerData) return
      markerData = values
      for (const entry of markers) { entry.element.removeEventListener('click', entry.click); entry.marker.remove() }
      markers = []
      for (const node of values || []) {
        if (!validPosition(node.lat, node.lon)) continue
        const element = document.createElement('button')
        element.type = 'button'
        element.className = 'ag-node'
        element.title = [node.city, node.country].filter(Boolean).join(', ')
        element.setAttribute('aria-label', `Select ${element.title || 'Agora location'}`)
        element.dataset.nodeId = String(node.id)
        if (node.logo) {
          const image = document.createElement('img')
          image.src = node.logo
          image.alt = ''
          image.draggable = false
          image.decoding = 'async'
          image.addEventListener('error', () => { image.remove(); element.textContent = 'A' }, { once: true })
          element.appendChild(image)
        } else element.textContent = 'A'
        const click = event => { event.stopPropagation(); propsRef.current.onSelectNode?.(node) }
        element.addEventListener('click', click)
        const marker = new markerClass({ element, anchor: 'center' }).setLngLat([node.lon, mercatorLatitude(node.lat)]).addTo(map)
        markers.push({ node, element, marker, click })
      }
      select()
    }

    const resize = () => {
      if (!alive || !canvas || !map) return
      const nextWidth = container.clientWidth
      const nextHeight = container.clientHeight
      const nextRatio = Math.min(2, window.devicePixelRatio || 1)
      if (width === nextWidth && height === nextHeight && pixelRatio === nextRatio) return
      width = nextWidth; height = nextHeight; pixelRatio = nextRatio
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      if (map.getPixelRatio() !== pixelRatio) map.setPixelRatio(pixelRatio)
      else map.resize()
      invalidateProjection()
    }

    const visibility = () => {
      clear()
      lastBatchId = propsRef.current.batch?.id ?? lastBatchId
      if (document.visibilityState === 'hidden') map?.stop()
      else resize()
    }
    const api = { submit, clear, select, setNodes }
    const release = () => {
      clear()
      window.clearTimeout(timeout)
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', visibility)
      for (const entry of markers) { entry.element.removeEventListener('click', entry.click); entry.marker.remove() }
      markers = []
      if (map) { map.off('move', invalidateProjection); map.off('load', loaded); map.off('error', mapError); map.remove(); map = null }
      canvas?.remove()
      if (engineRef.current === api) engineRef.current = null
      if (controlsOwner?.current === publishedControls) controlsOwner.current = null
    }
    const fail = error => {
      if (!alive || failed) return
      failed = true
      release()
      propsRef.current.onError?.(error instanceof Error ? error : new Error('The Agora map could not load.'))
    }
    const mapError = event => { if (!ready) fail(event.error) }
    function loaded() {
      if (!alive || failed) return
      window.clearTimeout(timeout)
      applyTheme(map)
      ready = true
      setNodes(propsRef.current.nodes)
      resize()
      // Loading is not a playback queue. Start with the next fresh batch.
      lastBatchId = propsRef.current.batch?.id ?? null
      propsRef.current.onReady?.()
    }

    async function boot() {
      try {
        const [module] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')])
        if (!alive) return
        const ml = module.default || module
        markerClass = ml.Marker
        map = new ml.Map({
          container, style: STYLE_URL, center: [16, 18], zoom: worldZoom(container.clientWidth),
          minZoom: -1.2, maxZoom: 7.8, attributionControl: { compact: false },
          pixelRatio: Math.min(2, window.devicePixelRatio || 1),
          fadeDuration: 0, pitchWithRotate: false, dragRotate: false, touchPitch: false,
          renderWorldCopies: true, boxZoom: false,
        })
        map.touchZoomRotate.disableRotation()
        map.keyboard.disableRotation()
        canvas = document.createElement('canvas')
        canvas.className = 'ag-flight-canvas'
        canvas.setAttribute('aria-hidden', 'true')
        Object.assign(canvas.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '2' })
        context = canvas.getContext('2d', { alpha: true })
        if (!context) throw new Error('Canvas rendering is unavailable.')
        container.appendChild(canvas)
        map.on('move', invalidateProjection)
        map.on('load', loaded)
        map.on('error', mapError)
        document.addEventListener('visibilitychange', visibility)
        window.addEventListener('resize', resize)
        if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(resize); observer.observe(container) }
        resize()
        engineRef.current = api
        controlsOwner = propsRef.current.controlsRef
        publishedControls = {
          zoomIn: () => map?.zoomIn({ duration: motionDuration() }),
          zoomOut: () => map?.zoomOut({ duration: motionDuration() }),
          reset: () => map?.easeTo({ center: [16, 18], zoom: worldZoom(container.clientWidth), bearing: 0, pitch: 0, duration: motionDuration() }),
          focus: node => { if (map && validPosition(node?.lat, node?.lon)) map.easeTo({ center: [node.lon, mercatorLatitude(node.lat)], zoom: Math.max(map.getZoom(), 3.2), duration: motionDuration() }) },
          clear,
        }
        if (controlsOwner) controlsOwner.current = publishedControls
        timeout = window.setTimeout(() => fail(new Error('The map took too long to load. Please retry.')), 20_000)
      } catch (error) { fail(error) }
    }
    boot()
    return () => { alive = false; release() }
  }, [])

  useEffect(() => { engineRef.current?.setNodes(nodes) }, [nodes])
  useEffect(() => { engineRef.current?.select() }, [selectedNodeId])
  useEffect(() => {
    if (paused) engineRef.current?.clear()
    engineRef.current?.submit(batch)
  }, [batch, paused])

  return <div ref={containerRef} className="ag-map" aria-label="Illustrative address anchors on a world map" />
}
