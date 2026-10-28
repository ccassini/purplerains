import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMonad } from '../contexts/MonadContext'
import { fetchWorldValidators } from '../utils/gmonadsApi'
import { fetchValidatorPerformance } from '../utils/validatorPerformanceApi'
import { updateNowProposer, pushProposerTick } from '../utils/proposerTicker'
import { formatStakeMon, formatCommission, normalizeHexId } from '../utils/worldShared'
import { createWorld3DDiagnostics } from '../utils/world3DDiagnostics'
import { createWorld3DArcLayer } from '../utils/world3DArcLayer'
import { createWorld3DMarkerCache, isSphereOccludingMarker, updateWorld3DMarkerVisibility } from '../utils/world3DOcclusion'
import {
  createWorldArcClock,
  getWorldArcTiming,
  selectWorldBlock,
  WORLD_BLOCK_CADENCE_MS,
} from '../utils/worldArcTiming'
import './MonadWorld3DPage.css'

const MOON_TEXTURE_URL = 'https://threejs.org/examples/textures/planets/moon_1024.jpg'

/** Moon in globe.gl scene (Earth at origin). */
async function createCelestialDecor(globe, aliveRef, globeRef, diagnostics) {
  const three = await import('three')
  if (!aliveRef.current || globeRef.current !== globe) return null
  const scene = globe.scene()
  const R = globe.getGlobeRadius()

  const moonOrbitPivot = new three.Group()
  scene.add(moonOrbitPivot)

  const moonTex = new three.TextureLoader().load(MOON_TEXTURE_URL, (tex) => {
    tex.colorSpace = three.SRGBColorSpace
  })
  const moonMesh = new three.Mesh(
    new three.SphereGeometry(R * 0.27, 40, 40),
    new three.MeshPhongMaterial({ map: moonTex, shininess: 6 })
  )
  moonMesh.position.set(R * 3.45, R * 0.35, 0)
  moonOrbitPivot.add(moonMesh)

  const vCam = new three.Vector3()
  const vMark = new three.Vector3()
  const vMoon = new three.Vector3()
  const markerCache = createWorld3DMarkerCache(scene)
  const moonRadius = R * 0.27
  const occlEps = Math.max(R * 0.04, 2)

  const applyMoonOcclusionToHtmlMarkers = () => {
    const g = globeRef.current
    if (!g) return
    const cam = g.camera()
    cam.getWorldPosition(vCam)
    // Include the pivot's current orbit rotation, before the next scene render.
    moonMesh.getWorldPosition(vMoon)
    for (const obj of markerCache.get(g.htmlElementsData())) {
      obj.getWorldPosition(vMark)
      updateWorld3DMarkerVisibility(obj.element, {
        moonOccluded: isSphereOccludingMarker(vCam, vMark, vMoon, moonRadius, occlEps),
      })
    }
  }

  let raf = 0
  let lastT = performance.now()
  const frame = (now) => {
    raf = requestAnimationFrame(frame)
    if (!aliveRef.current || !globeRef.current) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    const dt = Math.min(0.07, (now - lastT) / 1000)
    lastT = now
    moonOrbitPivot.rotation.y += dt * 0.016
    const started = performance.now()
    applyMoonOcclusionToHtmlMarkers()
    diagnostics?.moon(performance.now() - started)
  }

  const start = () => {
    if (raf) return
    lastT = performance.now()
    raf = requestAnimationFrame(frame)
  }
  const stop = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  const dispose = () => {
    stop()
    markerCache.dispose()
    scene.remove(moonOrbitPivot)
    moonMesh.geometry.dispose()
    moonMesh.material.dispose()
    moonTex.dispose()
  }

  return { start, stop, dispose }
}

const OVERLAP_GRID_DEG = 0.32
const OVERLAP_BASE_DEG = 0.24
const OVERLAP_STEP_DEG = 0.2
const OVERLAP_MAX_DEG = 2.2
const OVERLAP_MIN_SEP_DEG = 0.24
const OVERLAP_RELAX_ROUNDS = 8
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const BASE_NODE_ALT = 0.012
const NODE_ALT_STEP = 0.0036
const NODE_ALT_MAX_EXTRA = 0.055

function clampLat(lat) {
  return Math.max(-89.8, Math.min(89.8, lat))
}

function wrapLon(lon) {
  let x = lon
  while (x > 180) x -= 360
  while (x < -180) x += 360
  return x
}

function capRadius(point, maxRadius) {
  const r = Math.hypot(point.x, point.y)
  if (r <= maxRadius || r <= 1e-6) return
  const scale = maxRadius / r
  point.x *= scale
  point.y *= scale
}

function relaxCluster(points, minSep, maxRadius, basePhase) {
  for (let pass = 0; pass < OVERLAP_RELAX_ROUNDS; pass += 1) {
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i]
        const b = points[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dist = Math.hypot(dx, dy)
        if (dist >= minSep) continue
        if (dist < 1e-5) {
          const angle = basePhase + (i + j + pass) * GOLDEN_ANGLE
          dx = Math.cos(angle) * 1e-3
          dy = Math.sin(angle) * 1e-3
          dist = Math.hypot(dx, dy)
        }
        const push = (minSep - dist) * 0.5
        const ux = dx / dist
        const uy = dy / dist
        a.x -= ux * push
        a.y -= uy * push
        b.x += ux * push
        b.y += uy * push
      }
    }
    for (const p of points) capRadius(p, maxRadius)
  }
}

function spreadOverlappingNodes(nodes) {
  const groups = new Map()
  for (const node of nodes) {
    const latKey = Math.round(node.lat / OVERLAP_GRID_DEG)
    const lonKey = Math.round(node.lon / OVERLAP_GRID_DEG)
    const key = `${latKey}:${lonKey}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(node)
  }

  const spread = []
  for (const [key, group] of groups) {
    if (group.length === 1) {
      const v = group[0]
      spread.push({
        ...v,
        renderLat: v.lat,
        renderLon: v.lon,
        renderAltitude: BASE_NODE_ALT,
        overlapCount: 1,
        overlapRank: 0,
      })
      continue
    }

    const sorted = [...group].sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
    const centerLat = sorted.reduce((sum, v) => sum + v.lat, 0) / sorted.length
    const centerLon = sorted.reduce((sum, v) => sum + v.lon, 0) / sorted.length
    const [kLat, kLon] = key.split(':').map(Number)
    const hash = kLat * 73856093 + kLon * 19349663
    const basePhase = ((hash % 360) * Math.PI) / 180
    const cosLat = Math.max(0.2, Math.cos((centerLat * Math.PI) / 180))
    const clusterScale = 1 + Math.min(1.8, (sorted.length - 2) * 0.14)
    const baseRadius = OVERLAP_BASE_DEG * clusterScale
    const stepRadius = OVERLAP_STEP_DEG * clusterScale
    const maxRadius = Math.min(
      OVERLAP_MAX_DEG,
      baseRadius + Math.ceil(Math.sqrt(sorted.length)) * stepRadius * 1.9
    )

    const points = sorted.map((_, idx) => {
      const radius = Math.min(maxRadius, baseRadius + Math.sqrt(idx + 1) * stepRadius)
      const angle = basePhase + idx * GOLDEN_ANGLE
      return { idx, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
    })

    relaxCluster(points, OVERLAP_MIN_SEP_DEG * clusterScale, maxRadius, basePhase)

    points.forEach((p) => {
      const v = sorted[p.idx]
      const lat = clampLat(centerLat + p.y)
      const lon = wrapLon(centerLon + p.x / cosLat)
      const altExtra = Math.min(
        NODE_ALT_MAX_EXTRA,
        NODE_ALT_STEP * (p.idx + 1) + Math.sqrt(p.idx + 1) * 0.0016
      )
      spread.push({
        ...v,
        renderLat: lat,
        renderLon: lon,
        renderAltitude: BASE_NODE_ALT + altExtra,
        overlapCount: sorted.length,
        overlapRank: p.idx,
      })
    })
  }

  return spread
}

function createNodeEl(v, onHover, onSelect) {
  const el = document.createElement('div')
  el.className = 'mw3-node'
  el.style.pointerEvents = 'auto'

  const img = document.createElement('img')
  img.className = 'mw3-node-img'
  img.src = v.localLogo || v.logo || `/validators/${v.id}.png`
  img.alt = ''
  img.draggable = false
  img.loading = 'lazy'
  img.decoding = 'async'
  img.onerror = () => {
    if (img.src !== v.logo && v.logo) {
      img.src = v.logo
      return
    }
    img.remove()
    const fb = document.createElement('span')
    fb.className = 'mw3-node-fb'
    fb.textContent = (v.name || '?')[0].toUpperCase()
    el.appendChild(fb)
  }

  el.appendChild(img)
  el.addEventListener('mouseenter', () => onHover(v))
  el.addEventListener('mouseleave', () => onHover(null))

  // Globe drag can swallow click events; detect tap/click with movement threshold.
  let downX = 0
  let downY = 0
  let downAt = 0
  el.addEventListener('pointerdown', (e) => {
    downX = e.clientX
    downY = e.clientY
    downAt = performance.now()
  })
  el.addEventListener('pointerup', (e) => {
    const dx = e.clientX - downX
    const dy = e.clientY - downY
    const dist = Math.hypot(dx, dy)
    const dt = performance.now() - downAt
    if (dist <= 6 && dt <= 450) {
      e.stopPropagation()
      onSelect(v)
    }
  })
  return el
}

export default function MonadWorld3DPage() {
  const navigate = useNavigate()
  const { latestHead, latestBlock } = useMonad()
  const liveBlock = selectWorldBlock(latestHead, latestBlock)
  const containerRef = useRef(null)
  const globeRef = useRef(null)
  const validatorsRef = useRef([])
  const byIdRef = useRef(new Map())
  const aliveRef = useRef(true)
  const arcLayerRef = useRef(null)
  const blockValRef = useRef(null)
  const nowRootRef = useRef(null)
  const nowImgRef = useRef(null)
  const nowNameRef = useRef(null)
  const nowLocRef = useRef(null)
  const tickerElRef = useRef(null)
  const lastTickerAtRef = useRef(0)
  const perfReqRef = useRef(0)
  const arcClockRef = useRef(createWorldArcClock())
  const diagnosticsRef = useRef(null)

  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [hovered, setHovered] = useState(null)
  const [count, setCount] = useState(0)
  const [blockNum, setBlockNum] = useState(null)
  const [selectedValidator, setSelectedValidator] = useState(null)
  const [validatorPerf, setValidatorPerf] = useState(null)
  const [perfLoading, setPerfLoading] = useState(false)
  const [perfError, setPerfError] = useState(null)

  // Premium chrome typography — loaded only on this route (not app-wide) so
  // other pages keep their existing font budget.
  useEffect(() => {
    const id = 'mw3-premium-fonts'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap'
    document.head.appendChild(link)
  }, [])

  const openValidator = (v) => {
    if (!v) return
    setSelectedValidator(v)
    setValidatorPerf(null)
    setPerfError(null)
    const idCandidates = [v.nodeId, v.secp, v.authAddress]
      .map(normalizeHexId)
      .filter(Boolean)
    if (!idCandidates.length) return
    setPerfLoading(true)
    const reqId = ++perfReqRef.current
    fetchValidatorPerformance(idCandidates)
      .then((data) => {
        if (perfReqRef.current !== reqId) return
        if (data) {
          setValidatorPerf(data)
        } else {
          setPerfError('Uptime/performance data is not available right now')
        }
      })
      .catch((err) => {
        if (perfReqRef.current !== reqId) return
        setPerfError(err?.message || 'Unable to load validator performance')
      })
      .finally(() => {
        if (perfReqRef.current === reqId) setPerfLoading(false)
      })
  }

  const startArcAnimation = useCallback(({ proposer, timing }) => {
    const layer = arcLayerRef.current
    if (!layer || !aliveRef.current || document.visibilityState === 'hidden') return
    const started = performance.now()
    // Follow each verified block immediately. Independent flights can finish
    // together when network deliveries bunch up; no playback queue adds lag.
    const flight = { ...timing, ...getWorldArcTiming(WORLD_BLOCK_CADENCE_MS) }
    if (!layer.start(proposer, flight, started)) return
    diagnosticsRef.current?.burst(flight, performance.now() - started)
    if (import.meta.env.DEV && containerRef.current) {
      containerRef.current.dataset.block = String(flight.number)
      containerRef.current.dataset.burstDurationMs = flight.total.toFixed(1)
      containerRef.current.dataset.receiptToStartMs = String(Math.max(0, Date.now() - flight.receivedAt))
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    aliveRef.current = true
    // A shared alive ref becomes true again during StrictMode's second setup.
    // Keep async imports and decor tied to this particular scene's lifetime.
    const lifetime = { current: true }
    let globeInstance = null
    let diagnostics = null
    let arcLayer = null
    let restoreBeforeRender = () => {}

    const boot = async () => {
      try {
        const [globeMod, validators] = await Promise.all([
          import('globe.gl'),
          fetchWorldValidators(),
        ])
        if (!lifetime.current || !containerRef.current) return

        const validNodes = validators.filter(v =>
          Number.isFinite(v.lon) &&
          Number.isFinite(v.lat) &&
          Math.abs(v.lon) <= 180 &&
          Math.abs(v.lat) <= 90
        )
        const spreadNodes = spreadOverlappingNodes(validNodes)
        validatorsRef.current = spreadNodes
        byIdRef.current = new Map(spreadNodes.map((v) => [v.id, v]))
        setCount(spreadNodes.length)

        const Globe = globeMod.default || globeMod
        const globe = new Globe(containerRef.current, {
          animateIn: false,
          rendererConfig: {
            logarithmicDepthBuffer: true,
            powerPreference: 'high-performance',
            antialias: true,
          },
        })
          .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg')
          .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
          .atmosphereColor('#6d28d9')
          .atmosphereAltitude(0.2)
          .htmlAltitude(d => (Number.isFinite(d.renderAltitude) ? d.renderAltitude : BASE_NODE_ALT))
          .htmlTransitionDuration(0)
          .htmlElementsData(spreadNodes)
          .htmlLat(d => (Number.isFinite(d.renderLat) ? d.renderLat : d.lat))
          .htmlLng(d => (Number.isFinite(d.renderLon) ? d.renderLon : d.lon))
          .htmlElement(d => createNodeEl(d, setHovered, openValidator))
          .htmlElementVisibilityModifier((el, isVisible) => {
            updateWorld3DMarkerVisibility(el, { globeFront: isVisible })
          })
          .enablePointerInteraction(false)

        globeInstance = globe
        globeRef.current = globe
        arcLayer = createWorld3DArcLayer(spreadNodes, globe.getGlobeRadius())
        arcLayerRef.current = arcLayer
        const scene = globe.scene()
        scene.add(arcLayer.group)
        const previousBeforeRender = scene.onBeforeRender
        scene.onBeforeRender = function (...args) {
          previousBeforeRender.apply(this, args)
          arcLayer.update(performance.now())
        }
        restoreBeforeRender = () => { scene.onBeforeRender = previousBeforeRender }
        // Warm the persistent shader once during loading, before live flights.
        // Synchronous setup avoids leaving Three's async compile poll attached
        // to disposed materials if the user leaves during scene initialization.
        globe.renderer().compile(scene, globe.camera())
        if (import.meta.env.DEV) {
          diagnostics = createWorld3DDiagnostics(containerRef.current, globe.renderer())
          diagnosticsRef.current = diagnostics
        }

        // Clamp DPR — full retina (2x) pixel load causes jank with per-block
        // arc bursts; 1.5 is visually indistinguishable on this scene.
        try {
          globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
        } catch { /* globe may be torn down or not expose this call */ }

        const controls = globe.controls()
        controls.autoRotate = true
        controls.autoRotateSpeed = 0.35
        controls.enablePan = false
        controls.minDistance = 140
        controls.maxDistance = 1260
        // OrbitControls stops feeling "alive" after drag unless we keep autoRotate on.
        controls.addEventListener('start', () => {
          controls.autoRotate = false
        })
        controls.addEventListener('end', () => {
          controls.autoRotate = true
          try { globe.resumeAnimation() } catch { /* globe may be torn down or not expose this call */ }
        })

        let celestial = { start() {}, stop() {}, dispose() {} }
        try {
          const decor = await createCelestialDecor(globe, lifetime, globeRef, diagnostics)
          if (decor) celestial = decor
          if (!lifetime.current) {
            celestial.dispose()
            return
          }
          celestial.start()
        } catch {
          // Optional decor — globe still works without moon
        }
        if (!lifetime.current) return

        const resize = () => {
          if (!containerRef.current || !globeRef.current) return
          globeRef.current
            .width(containerRef.current.clientWidth)
            .height(containerRef.current.clientHeight)
        }
        resize()
        window.addEventListener('resize', resize)
        const onVisibilityChange = () => {
          if (!globeRef.current) return
          if (document.visibilityState === 'hidden') {
            arcLayer.clear()
            globeRef.current.pauseAnimation()
            celestial.stop()
          } else {
            globeRef.current.resumeAnimation()
            celestial.start()
          }
        }
        document.addEventListener('visibilitychange', onVisibilityChange)
        onVisibilityChange()

        if (!lifetime.current) return
        setReady(true)

        return () => {
          window.removeEventListener('resize', resize)
          document.removeEventListener('visibilitychange', onVisibilityChange)
          celestial.dispose()
        }
      } catch (e) {
        if (!lifetime.current) return
        setError(e?.message || '3D globe failed to load')
      }
    }

    let cleanup
    boot().then(c => {
      if (!lifetime.current) c?.()
      else cleanup = c
    })
    return () => {
      lifetime.current = false
      aliveRef.current = false
      if (cleanup) cleanup()
      diagnostics?.dispose()
      if (diagnosticsRef.current === diagnostics) diagnosticsRef.current = null
      restoreBeforeRender()
      arcLayer?.dispose()
      if (arcLayerRef.current === arcLayer) arcLayerRef.current = null
      globeInstance?._destructor?.()
      // globe.gl clears its data layers but does not dispose the host renderer.
      globeInstance?.controls().dispose()
      globeInstance?.renderer().dispose()
      if (globeRef.current === globeInstance) globeRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!liveBlock || !globeRef.current || !ready) return
    const tickTs = performance.now()
    const timing = arcClockRef.current(liveBlock, tickTs)
    if (!timing) return
    const proposer = liveBlock.proposerValidator
    const num = timing.number
    const p = byIdRef.current.get(proposer.id)

    // Begin at block receipt; a separate cadence timer adds up to one whole
    // block of latency and can overwrite pending blocks before they are drawn.
    if (p) startArcAnimation({ proposerId: proposer.id, proposer: p, timing })
    if (blockValRef.current) {
      blockValRef.current.textContent = `#${Number(num).toLocaleString()}`
    }
    setBlockNum((prev) => (prev == null ? num : prev))

    const name = p?.name || proposer.name || `Validator #${proposer.id}`
    const logo = p?.localLogo || p?.logo || proposer.localLogo || proposer.logo || ''
    const loc = [p?.city || proposer.city, p?.country || proposer.country].filter(Boolean).join(', ')
    updateNowProposer(
      {
        root: nowRootRef.current,
        img: nowImgRef.current,
        name: nowNameRef.current,
        loc: nowLocRef.current,
        block: blockValRef.current,
      },
      { id: proposer.id, name, logo, loc, block: num },
    )

    if (tickTs - lastTickerAtRef.current >= 450) {
      lastTickerAtRef.current = tickTs
      pushProposerTick(tickerElRef.current, {
        id: proposer.id,
        name,
        logo,
        block: num,
        max: 8,
        showBlock: false,
        tickClass: 'mw3-tick',
        imgClass: 'mw3-tick-img',
        nameClass: 'mw3-tick-name',
        blockClass: 'mw3-tick-block',
      })
    }
  }, [liveBlock, ready, startArcAnimation])

  const zoomIntervalRef = useRef(0)

  const zoom = (delta) => {
    if (!globeRef.current) return
    const pov = globeRef.current.pointOfView()
    const alt = Math.min(12, Math.max(0.2, (pov.altitude || 1.8) + delta))
    globeRef.current.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: alt }, 120)
  }

  const startZoom = (delta) => {
    if (zoomIntervalRef.current) return
    zoom(delta)
    zoomIntervalRef.current = window.setInterval(() => zoom(delta), 80)
  }

  const stopZoom = () => {
    if (zoomIntervalRef.current) {
      window.clearInterval(zoomIntervalRef.current)
      zoomIntervalRef.current = 0
    }
  }

  useEffect(() => {
    return () => {
      if (zoomIntervalRef.current) {
        window.clearInterval(zoomIntervalRef.current)
      }
    }
  }, [])

  const resetView = () => {
    if (!globeRef.current) return
    globeRef.current.pointOfView({ lat: 18, lng: 20, altitude: 1.8 }, 800)
  }

  if (error) {
    return (
      <div className="mw3">
        <div className="mw3-loading">
          <span className="mw3-err" role="alert">{error}</span>
          <button type="button" className="mw3-retry" onClick={() => window.location.reload()}>Retry</button>
          <div className="mw3-err-links">
            <button type="button" onClick={() => navigate('/world')}>2D view</button>
            <button type="button" onClick={() => navigate('/')}>Home</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mw3">
      <div className="mw3-globe" ref={containerRef} />

      {!ready && (
        <div className="mw3-loading">
          <div className="mw3-spinner" />
          <span>Loading 3D Monad World...</span>
        </div>
      )}

      <header className="mw3-bar">
        <div className="mw3-bar-left">
          <div className="mw3-logo-wrap">
            <img src="/monad_logo.png" alt="" className="mw3-logo" />
          </div>
          <div className="mw3-title-group">
            <span className="mw3-title">MONAD WORLD · 3D</span>
            <span className="mw3-subtitle">The validator set, on a living globe</span>
          </div>
        </div>
        <div className="mw3-now" ref={nowRootRef} aria-label="Current block producer">
          <img ref={nowImgRef} className="mw3-now-img" alt="" decoding="async" />
          <div className="mw3-now-text">
            <span className="mw3-now-name" ref={nowNameRef}>Waiting…</span>
            <span className="mw3-now-loc" ref={nowLocRef} hidden />
          </div>
          <span className="mw3-now-block" ref={blockValRef}>
            {blockNum != null ? `#${blockNum.toLocaleString()}` : '#—'}
          </span>
        </div>
        <div className="mw3-ticker-wrap">
          <div className="mw3-ticker" ref={tickerElRef} aria-label="Recent block producers" />
        </div>
        <div className="mw3-bar-right">
          <div className="mw3-chip mw3-chip-live"><span className="mw3-live-dot" /><span>Mainnet</span></div>
          <div className="mw3-chip"><span className="mw3-chip-label">Validators</span><span className="mw3-chip-val">{count}</span></div>
        </div>
      </header>

      <div className="mw3-zoom">
        <button 
          className="mw3-zoom-btn" 
          aria-label="Zoom in" 
          onPointerDown={() => startZoom(-0.12)}
          onPointerUp={stopZoom}
          onPointerLeave={stopZoom}
        >+</button>
        <button 
          className="mw3-zoom-btn" 
          aria-label="Zoom out" 
          onPointerDown={() => startZoom(0.12)}
          onPointerUp={stopZoom}
          onPointerLeave={stopZoom}
        >-</button>
        <button className="mw3-zoom-btn" aria-label="Reset view" onClick={resetView}>◉</button>
        <div className="mw3-zoom-sep" />
        <button className="mw3-zoom-btn" aria-label="Switch to 2D"
          onMouseEnter={() => { import('./MonadWorldPage').catch(() => {}) }}
          onFocus={() => { import('./MonadWorldPage').catch(() => {}) }}
          onClick={() => navigate('/world')}>2D</button>
        <button className="mw3-zoom-btn" aria-label="Go to homepage" onClick={() => navigate('/')}>⌂</button>
      </div>

      {hovered && (
        <div className="mw3-tooltip">
          {(hovered.localLogo || hovered.logo) && (
            <img
              src={hovered.localLogo || hovered.logo}
              alt=""
              className="mw3-tt-img"
              onError={(e) => { e.target.style.display = 'none' }}
            />
          )}
          <div className="mw3-tt-text">
            <span className="mw3-tt-id">#{hovered.id}</span>
            <span className="mw3-tt-name">{hovered.name}</span>
            {hovered.city && <span className="mw3-tt-loc">{hovered.city}, {hovered.country}</span>}
          </div>
        </div>
      )}

      {selectedValidator && (
        <aside className="mw3-validator-card">
          <button className="mw3-validator-close" onClick={() => setSelectedValidator(null)} aria-label="Close validator details">×</button>
          <div className="mw3-validator-head">
            {(selectedValidator.localLogo || selectedValidator.logo) && (
              <img
                src={selectedValidator.localLogo || selectedValidator.logo}
                alt=""
                className="mw3-validator-logo"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            )}
            <div>
              <div className="mw3-validator-name">{selectedValidator.name || `Validator #${selectedValidator.id}`}</div>
              <div className="mw3-validator-sub">#{selectedValidator.id} • {selectedValidator.city}, {selectedValidator.country}</div>
            </div>
          </div>

          <div className="mw3-validator-grid">
            <div><span>Stake</span><strong>{formatStakeMon(selectedValidator.stake)}</strong></div>
            <div><span>Commission</span><strong>{formatCommission(selectedValidator.commission)}</strong></div>
            <div><span>Status</span><strong>{selectedValidator.connected ? 'Online' : 'Offline'}</strong></div>
            <div><span>24h Uptime</span><strong>{validatorPerf?.uptime24 || '—'}</strong></div>
            <div><span>Commits</span><strong>{validatorPerf?.commitsText || '—'}</strong></div>
            <div><span>Timeouts</span><strong>{validatorPerf?.timeoutsText || '—'}</strong></div>
          </div>

          {perfLoading && <div className="mw3-validator-meta">Loading performance metrics…</div>}
          {perfError && <div className="mw3-validator-meta mw3-validator-meta-err">{perfError}</div>}
          {normalizeHexId(selectedValidator.nodeId || selectedValidator.secp || selectedValidator.authAddress) && (
            <a
              href={`https://monad-space.itrocket.net/validators/${normalizeHexId(selectedValidator.nodeId || selectedValidator.secp || selectedValidator.authAddress) || ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mw3-validator-link"
            >
              Open full validator profile
            </a>
          )}
        </aside>
      )}
    </div>
  )
}
