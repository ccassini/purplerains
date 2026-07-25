import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMonad } from '../contexts/MonadContext'
import { fetchWorldValidators } from '../utils/gmonadsApi'
import { fetchValidatorPerformance } from '../utils/validatorPerformanceApi'
import { updateNowProposer, pushProposerTick } from '../utils/proposerTicker'
import './MonadWorld3DPage.css'

const ARC_COLORS = ['rgba(168, 85, 247, 0.35)', 'rgba(233, 213, 255, 0.98)', 'rgba(192, 132, 252, 0.45)']

const MOON_TEXTURE_URL = 'https://threejs.org/examples/textures/planets/moon_1024.jpg'

/** Moon in globe.gl scene (Earth at origin). */
async function createCelestialDecor(globe, aliveRef, globeRef) {
  const three = await import('three')
  const { CSS2DObject } = await import('three/examples/jsm/renderers/CSS2DRenderer.js')
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
  const vDir = new three.Vector3()
  const raycaster = new three.Raycaster()
  const occlEps = Math.max(R * 0.04, 2)

  const applyMoonOcclusionToHtmlMarkers = () => {
    const g = globeRef.current
    if (!g) return
    const cam = g.camera()
    cam.getWorldPosition(vCam)
    moonMesh.updateMatrixWorld(true)
    scene.traverse((obj) => {
      if (!(obj instanceof CSS2DObject) || !obj.element) return
      obj.getWorldPosition(vMark)
      const dist = vCam.distanceTo(vMark)
      if (dist < 1e-4) return
      vDir.copy(vMark).sub(vCam).normalize()
      raycaster.set(vCam, vDir)
      const hits = raycaster.intersectObject(moonMesh, false)
      const blocked = hits.length > 0 && hits[0].distance < dist - occlEps
      const el = obj.element
      const front = el.dataset.mw3GlobeFront !== '0'
      if (blocked) {
        el.style.opacity = '0'
        el.style.visibility = 'hidden'
        el.style.pointerEvents = 'none'
      } else {
        el.style.opacity = front ? '1' : '0'
        el.style.visibility = front ? 'visible' : 'hidden'
        el.style.pointerEvents = front ? 'auto' : 'none'
      }
    })
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
    applyMoonOcclusionToHtmlMarkers()
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
    scene.remove(moonOrbitPivot)
    moonMesh.geometry.dispose()
    moonMesh.material.dispose()
  }

  return { start, stop, dispose }
}

function formatStakeMon(stake) {
  const n = Number(stake || 0)
  if (!Number.isFinite(n)) return '—'
  return `${n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : n.toLocaleString()} MON`
}

function formatCommission(commissionBps) {
  const bps = Number(commissionBps || 0)
  if (!Number.isFinite(bps)) return '—'
  return `${(bps / 100).toFixed(2)}%`
}

function normalizeHexId(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  let hex = raw.toLowerCase()
  if (!hex.startsWith('0x')) hex = `0x${hex}`
  if (!/^0x[a-f0-9]{40,160}$/.test(hex)) return null
  return hex
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
  // Baseline matches Monad's live block time (~0.3s). The cadence adapts to the
  // real inter-block interval but is capped at 300ms so bursts never run slower
  // than 0.3s (it can go faster when blocks arrive faster).
  const BLOCK_CADENCE_MS = 280
  const ARC_MIN_CADENCE_MS = 170
  const ARC_MAX_CADENCE_MS = 300
  const ARC_TRAVEL_MS = 170

  const navigate = useNavigate()
  const { latestBlock } = useMonad()
  const containerRef = useRef(null)
  const globeRef = useRef(null)
  const validatorsRef = useRef([])
  const byIdRef = useRef(new Map())
  const aliveRef = useRef(true)
  const arcTemplateCacheRef = useRef(new Map())
  const pendingPayloadRef = useRef(null)
  const cadenceTimerRef = useRef(0)
  const blockValRef = useRef(null)
  const nowRootRef = useRef(null)
  const nowImgRef = useRef(null)
  const nowNameRef = useRef(null)
  const nowLocRef = useRef(null)
  const tickerElRef = useRef(null)
  const lastTickerAtRef = useRef(0)
  const perfReqRef = useRef(0)
  const liveCadenceRef = useRef(BLOCK_CADENCE_MS)
  const lastBlockAtRef = useRef(0)
  const lastBlockNumRef = useRef(null)

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

  const clearArcTimers = () => {
    if (cadenceTimerRef.current) window.clearTimeout(cadenceTimerRef.current)
    cadenceTimerRef.current = 0
  }

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

  const buildArcTemplate = useCallback((proposerId, proposer) => {
    const cached = arcTemplateCacheRef.current.get(proposerId)
    if (cached) return cached
    const arcs = []

    // One arc per validator (every validator → proposer). Tube geometry is
    // kept cheap via low arcCurveResolution/arcCircularResolution on the globe
    // itself so rebuilding the full set on each arcsData() swap (~every 0.3s)
    // doesn't jank, instead of dropping validators from the burst.
    const all = validatorsRef.current

    for (let i = 0; i < all.length; i += 1) {
      const v = all[i]
      if (v.id === proposerId) continue
      const startLat = Number.isFinite(v.renderLat) ? v.renderLat : v.lat
      const startLng = Number.isFinite(v.renderLon) ? v.renderLon : v.lon
      const endLat = Number.isFinite(proposer.renderLat) ? proposer.renderLat : proposer.lat
      const endLng = Number.isFinite(proposer.renderLon) ? proposer.renderLon : proposer.lon
      const dLat = endLat - startLat
      const dLon = endLng - startLng
      const dist = Math.sqrt(dLat * dLat + dLon * dLon)
      const n = Math.min(1, dist / 140)
      arcs.push({
        startLat,
        startLng,
        endLat,
        endLng,
        delay: n * 0.12,
        altitude: 0.22 + n * 0.1,
        stroke: 0.8 + n * 0.7,
      })
    }
    
    arcTemplateCacheRef.current.set(proposerId, arcs)
    return arcs
  }, [])

  const startArcAnimation = useCallback((payload) => {
    if (!globeRef.current || !aliveRef.current) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    const { proposerId, proposer, block } = payload
    const template = buildArcTemplate(proposerId, proposer)
    globeRef.current.arcsData(template)
  }, [buildArcTemplate])

  useEffect(() => {
    if (!containerRef.current) return
    aliveRef.current = true

    const boot = async () => {
      try {
        const [globeMod, validators] = await Promise.all([
          import('globe.gl'),
          fetchWorldValidators(),
        ])
        if (!aliveRef.current || !containerRef.current) return

        const validNodes = validators.filter(v =>
          Number.isFinite(v.lon) &&
          Number.isFinite(v.lat) &&
          Math.abs(v.lon) <= 180 &&
          Math.abs(v.lat) <= 90
        )
        const spreadNodes = spreadOverlappingNodes(validNodes)
        validatorsRef.current = spreadNodes
        byIdRef.current = new Map(spreadNodes.map((v) => [v.id, v]))
        arcTemplateCacheRef.current.clear()
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
            el.dataset.mw3GlobeFront = isVisible ? '1' : '0'
            el.style.opacity = isVisible ? '1' : '0'
            el.style.visibility = isVisible ? 'visible' : 'hidden'
            el.style.pointerEvents = isVisible ? 'auto' : 'none'
          })
          // Keep accessors stable; only data/style params update per block.
          .arcStartLat(d => d.startLat)
          .arcStartLng(d => d.startLng)
          .arcEndLat(d => d.endLat)
          .arcEndLng(d => d.endLng)
          .arcColor(() => ARC_COLORS)
          .arcStroke(d => d.stroke)
          .arcAltitude(d => d.altitude)
          .arcDashLength(0.24)
          .arcDashGap(0.92)
          .arcDashInitialGap(d => 1 + d.delay)
          .arcDashAnimateTime(ARC_TRAVEL_MS)
          .arcsTransitionDuration(0)
          // Low-poly tubes: full per-validator arc bursts (~200/block) stay cheap
          // to rebuild every ~0.3s only if each tube's geometry is minimal.
          .arcCurveResolution(10)
          .arcCircularResolution(3)
          .enablePointerInteraction(false)

        globeRef.current = globe

        // Clamp DPR — full retina (2x) pixel load causes jank with per-block
        // arc bursts; 1.5 is visually indistinguishable on this scene.
        try {
          globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
        } catch {}

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
          try { globe.resumeAnimation() } catch {}
        })

        let celestial = { start() {}, stop() {}, dispose() {} }
        try {
          celestial = await createCelestialDecor(globe, aliveRef, globeRef)
          celestial.start()
        } catch {
          // Optional decor — globe still works without moon
        }

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
            globeRef.current.pauseAnimation()
            celestial.stop()
          } else {
            globeRef.current.resumeAnimation()
            celestial.start()
          }
        }
        document.addEventListener('visibilitychange', onVisibilityChange)
        onVisibilityChange()

        if (!aliveRef.current) return
        setReady(true)

        return () => {
          window.removeEventListener('resize', resize)
          document.removeEventListener('visibilitychange', onVisibilityChange)
          celestial.dispose()
        }
      } catch (e) {
        setError(e?.message || '3D globe failed to load')
      }
    }

    let cleanup
    boot().then(c => { cleanup = c })
    return () => {
      aliveRef.current = false
      if (cleanup) cleanup()
      clearArcTimers()
      if (globeRef.current && globeRef.current._destructor) globeRef.current._destructor()
      globeRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!ready || !globeRef.current) return
    if (cadenceTimerRef.current) window.clearTimeout(cadenceTimerRef.current)
    let stopped = false

    // Self-adjusting loop: each tick fires at the live block cadence (measured
    // from real blocks), so the arc bursts stay in lock-step with Monad's speed.
    const runTick = () => {
      if (stopped) return
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
      const payload = pendingPayloadRef.current
      if (!hidden && payload && globeRef.current && aliveRef.current) {
        pendingPayloadRef.current = null
        // Keep the arc flight just under the cadence so bursts never overlap.
        const travel = Math.max(120, Math.min(liveCadenceRef.current - 60, 180))
        try { globeRef.current.arcDashAnimateTime(travel) } catch {}
        startArcAnimation(payload)
      }
      cadenceTimerRef.current = window.setTimeout(runTick, liveCadenceRef.current)
    }

    cadenceTimerRef.current = window.setTimeout(runTick, liveCadenceRef.current)
    return () => {
      stopped = true
      if (cadenceTimerRef.current) window.clearTimeout(cadenceTimerRef.current)
      cadenceTimerRef.current = 0
    }
  }, [ready, startArcAnimation])

  useEffect(() => {
    if (!latestBlock || !globeRef.current || !ready) return
    const proposer = latestBlock.proposerValidator
    if (!proposer?.id) return

    const num = typeof latestBlock.number === 'string'
      ? parseInt(latestBlock.number, 16)
      : latestBlock.number
    if (blockValRef.current) {
      blockValRef.current.textContent = `#${Number(num).toLocaleString()}`
    }
    setBlockNum((prev) => (prev == null ? num : prev))

    const p = byIdRef.current.get(proposer.id)
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

    const tickTs = performance.now()
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

    // Measure the real inter-block interval and smooth it into the live cadence,
    // so the arc bursts track Monad's actual block speed (~0.3s) instead of a
    // fixed number — if the chain speeds up or slows down, the arcs follow.
    const nowTs = performance.now()
    if (lastBlockNumRef.current != null && num > lastBlockNumRef.current && lastBlockAtRef.current) {
      const perBlock = (nowTs - lastBlockAtRef.current) / (num - lastBlockNumRef.current)
      if (perBlock > 60 && perBlock < 5000) {
        const ema = liveCadenceRef.current * 0.7 + perBlock * 0.3
        liveCadenceRef.current = Math.max(ARC_MIN_CADENCE_MS, Math.min(ARC_MAX_CADENCE_MS, ema))
      }
    }
    lastBlockAtRef.current = nowTs
    lastBlockNumRef.current = num

    if (!p) return

    // Keep only the latest block; it's drawn on the next live-cadence tick.
    pendingPayloadRef.current = { proposerId: proposer.id, proposer: p, block: num }
  }, [latestBlock, ready])

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
          <span className="mw3-err">{error}</span>
          <button className="mw3-retry" onClick={() => window.location.reload()}>Retry</button>
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
