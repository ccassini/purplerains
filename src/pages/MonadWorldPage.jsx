import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMonad } from '../contexts/MonadContext'
import { fetchWorldValidators } from '../utils/gmonadsApi'
import { fetchValidatorPerformance } from '../utils/validatorPerformanceApi'
import { updateNowProposer, pushProposerTick } from '../utils/proposerTicker'
import { logger } from '../utils/logger'
import './MonadWorldPage.css'

const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

const STYLE_OVERRIDES = [
  ['water', 'fill-color', '#080614'],
  ['water', 'fill-opacity', 0.95],
  ['landcover', 'fill-color', '#0e0b1a'],
  ['landuse', 'fill-color', '#0f0c1d'],
  ['park', 'fill-color', '#100d1f'],
  ['building', 'fill-color', '#12101e'],
]

// Match MonadWorld3D: short dashed “comets” travel along each arc and exit —
// not a full growing network that holds on screen (that was the hitch + the
// visual mismatch with /world-3d).
const BLOCK_CADENCE_MS = 280
const ARC_MIN_CADENCE_MS = 160
const ARC_MAX_CADENCE_MS = 320
const DASH_LEN = 0.24
const MAX_ARC_DELAY = 0.12
const ARC_SEGMENTS = 8
const ARC_DPR_IDLE = 1

function travelMsForCadence(cadence) {
  // Finish inside the live block window (~0.3s) with a small gap before the next burst.
  return Math.max(110, Math.min(Math.round(cadence * 0.7), 210))
}

function pointOnQuad(p0x, p0y, cx, cy, p2x, p2y, t) {
  const u = 1 - t
  return [
    u * u * p0x + 2 * u * t * cx + t * t * p2x,
    u * u * p0y + 2 * u * t * cy + t * t * p2y,
  ]
}

const MERC_LAT_LIMIT = 85.051129
function mercX(lon) { return (lon + 180) / 360 }
function mercY(lat) {
  const clamped = Math.max(-MERC_LAT_LIMIT, Math.min(MERC_LAT_LIMIT, lat))
  const s = Math.sin((clamped * Math.PI) / 180)
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
}

const ARC_STREAK_COLOR = 'rgb(196,171,255)'
const ARC_CORE_COLOR = 'rgb(233,213,255)'
const TAU = Math.PI * 2

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

function createMarkerEl(v) {
  const el = document.createElement('div')
  el.className = 'vm'
  el.style.pointerEvents = 'auto'
  const img = document.createElement('img')
  img.className = 'vm-img'
  img.src = v.localLogo || v.logo || `/validators/${v.id}.png`
  img.alt = ''
  img.draggable = false
  img.loading = 'lazy'
  img.decoding = 'async'
  img.onerror = () => {
    if (img.src !== v.logo && v.logo) { img.src = v.logo; return }
    img.remove()
    const fb = document.createElement('span')
    fb.className = 'vm-fb'
    fb.textContent = (v.name || '?')[0].toUpperCase()
    el.appendChild(fb)
  }
  el.appendChild(img)
  return el
}

export default function MonadWorldPage() {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const mapObjRef = useRef(new Map())
  const aliveRef = useRef(true)
  const mlRef = useRef(null)
  const sizeTimerRef = useRef(0)
  const overlayRef = useRef(null)
  const ctxRef = useRef(null)
  const panFreezeRef = useRef(null)
  const rafRef = useRef(0)
  const allNodesRef = useRef([])
  const animRef = useRef(null)
  const drawFnRef = useRef(() => {})
  const cullFnRef = useRef(() => {})
  const projDirtyRef = useRef(true)
  const prevProposerRef = useRef(null)
  const perfReqRef = useRef(0)
  const canvasDirtyRef = useRef(false)
  const draggingRef = useRef(false)
  const mapDrivingRef = useRef(false)
  const lastMapDrawRef = useRef(0)
  const sizeRef = useRef({ w: 0, h: 0 })
  const lastBlockAtRef = useRef(0)
  const lastBlockNumRef = useRef(null)
  const blockValRef = useRef(null)
  const nowRootRef = useRef(null)
  const nowImgRef = useRef(null)
  const nowNameRef = useRef(null)
  const nowLocRef = useRef(null)
  const tickerElRef = useRef(null)
  const lastTickerAtRef = useRef(0)
  const loopAliveRef = useRef(false)
  const liveCadenceRef = useRef(BLOCK_CADENCE_MS)

  const navigate = useNavigate()
  const { latestBlock, isConnected, connectionStatus } = useMonad()
  const [blockNum, setBlockNum] = useState(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [count, setCount] = useState(0)
  const [hovered, setHovered] = useState(null)
  const [selectedValidator, setSelectedValidator] = useState(null)
  const [validatorPerf, setValidatorPerf] = useState(null)
  const [perfLoading, setPerfLoading] = useState(false)
  const [perfError, setPerfError] = useState(null)
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handle = () => setIsMobile(mq.matches)
    mq.addEventListener('change', handle)
    return () => mq.removeEventListener('change', handle)
  }, [])

  // Premium chrome typography — loaded only on this route (not app-wide) so
  // other pages keep their existing font budget.
  useEffect(() => {
    const id = 'mw-premium-fonts'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap'
    document.head.appendChild(link)
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    aliveRef.current = true
    let map = null

    const boot = async () => {
      try {
        const [mod, validators] = await Promise.all([
          import('maplibre-gl'),
          fetchWorldValidators(),
          import('maplibre-gl/dist/maplibre-gl.css'),
        ])

        const ml = mod.default || mod
        mlRef.current = ml
        if (!aliveRef.current || !containerRef.current) return

        map = new ml.Map({
          container: containerRef.current,
          style: STYLE_URL,
          center: [20, 20],
          zoom: isMobile ? 1.1 : 1.7,
          minZoom: 0.8,
          maxZoom: 8,
          attributionControl: false,
          fadeDuration: 0,
          pitchWithRotate: false,
          dragRotate: false,
          touchPitch: false,
          renderWorldCopies: false,
          boxZoom: false,
          maxTileCacheSize: isMobile ? 30 : 60,
          antialias: false,
          refreshExpiredTiles: false,
          crossSourceCollisions: false,
          preserveDrawingBuffer: false,
        })
        mapRef.current = map

        map.scrollZoom.setWheelZoomRate(1 / 300)
        map.scrollZoom.setZoomRate(1 / 300)
        map.on('error', (e) => logger.debug('Map error:', e.error?.message || e))

        await new Promise((res, rej) => {
          map.once('load', res)
          setTimeout(() => rej(new Error('Map timed out')), 20000)
        })
        if (!aliveRef.current) return

        STYLE_OVERRIDES.forEach(([layer, prop, val]) => {
          try { map.setPaintProperty(layer, prop, val) } catch {}
        })

        const style = map.getStyle()
        if (style?.layers) {
          for (const layer of style.layers) {
            if (layer.type === 'symbol') {
              try {
                map.setLayoutProperty(layer.id, 'visibility', 'visible')
                map.setLayerZoomRange(layer.id, 3.5, 22)
                map.setPaintProperty(layer.id, 'text-color', '#7c6fa0')
                map.setPaintProperty(layer.id, 'text-opacity', [
                  'interpolate', ['linear'], ['zoom'],
                  3.5, 0, 4.5, 0.5, 6, 0.75,
                ])
              } catch {}
            }
          }
        }

        setCount(validators.length)

        const validNodes = validators.filter(v =>
          isFinite(v.lon) && isFinite(v.lat) &&
          Math.abs(v.lon) <= 180 && Math.abs(v.lat) <= 90
        )
        allNodesRef.current = validNodes

        const applySize = () => {
          if (!containerRef.current || !map) return
          const z = map.getZoom()
          const s = Math.min(Math.max(z * 7 + 10, 14), 52)
          containerRef.current.style.setProperty('--vm-size', `${s}px`)
        }
        map.on('zoomend', () => {
          clearTimeout(sizeTimerRef.current)
          sizeTimerRef.current = setTimeout(applySize, 40)
        })
        applySize()

        const canvas = document.createElement('canvas')
        canvas.className = 'mw-arc-canvas'
        containerRef.current.appendChild(canvas)
        overlayRef.current = canvas
        ctxRef.current = canvas.getContext('2d', { alpha: true, desynchronized: true })

        projDirtyRef.current = true

        // Per-node: [x, y, cpX, cpY, sd, unused, visible] + polyline samples
        const N = validNodes.length
        const cache = new Float64Array(N * 7)
        const poly = new Float32Array(N * (ARC_SEGMENTS + 1) * 2)
        const mercXY = new Float64Array(N * 2)
        for (let i = 0; i < N; i++) {
          mercXY[i * 2] = mercX(validNodes[i].lon)
          mercXY[i * 2 + 1] = mercY(validNodes[i].lat)
        }
        let cachedTx = 0, cachedTy = 0

        const fillPoly = (i, px, py, cpx, cpy, tx, ty) => {
          const base = i * (ARC_SEGMENTS + 1) * 2
          for (let s = 0; s <= ARC_SEGMENTS; s++) {
            const [x, y] = pointOnQuad(px, py, cpx, cpy, tx, ty, s / ARC_SEGMENTS)
            poly[base + s * 2] = x
            poly[base + s * 2 + 1] = y
          }
        }

        const samplePoly = (i, t) => {
          const base = i * (ARC_SEGMENTS + 1) * 2
          const f = Math.max(0, Math.min(1, t)) * ARC_SEGMENTS
          const s0 = Math.floor(f)
          const s1 = Math.min(ARC_SEGMENTS, s0 + 1)
          const u = f - s0
          const x0 = poly[base + s0 * 2], y0 = poly[base + s0 * 2 + 1]
          const x1 = poly[base + s1 * 2], y1 = poly[base + s1 * 2 + 1]
          return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u]
        }

        /** Append dash segment along arc i for t in [t0, t1] into current path. */
        const appendDash = (ctx, i, t0, t1) => {
          if (t1 <= t0 + 0.002) return
          const base = i * (ARC_SEGMENTS + 1) * 2
          const [sx, sy] = samplePoly(i, t0)
          ctx.moveTo(sx, sy)
          const sStart = t0 * ARC_SEGMENTS
          const sEnd = t1 * ARC_SEGMENTS
          const first = Math.ceil(sStart)
          for (let s = first; s <= Math.floor(sEnd); s++) {
            if (s <= 0 || s > ARC_SEGMENTS) continue
            ctx.lineTo(poly[base + s * 2], poly[base + s * 2 + 1])
          }
          const [ex, ey] = samplePoly(i, t1)
          ctx.lineTo(ex, ey)
        }

        const reproject = () => {
          const anim = animRef.current
          if (!anim) return
          const pT = map.project(anim.proposerCoords)
          cachedTx = pT.x; cachedTy = pT.y
          const { w, h } = sizeRef.current
          const pad = 250

          let ax = 0, bx = 0, ay = 0, by = 0
          let affine = map.getBearing() === 0 && map.getPitch() === 0
          if (affine) {
            const p1 = map.project([0, 0])
            const p2 = map.project([90, 60])
            const mx2 = mercX(90), my2 = mercY(60)
            ax = (p2.x - p1.x) / (mx2 - 0.5)
            ay = (p2.y - p1.y) / (my2 - 0.5)
            bx = p1.x - ax * 0.5
            by = p1.y - ay * 0.5
            const ex = ax * mercX(anim.proposerCoords[0]) + bx
            const ey = ay * mercY(anim.proposerCoords[1]) + by
            affine = Number.isFinite(ax) && Number.isFinite(ay) &&
              Math.abs(pT.x - ex) < 0.75 && Math.abs(pT.y - ey) < 0.75
          }

          for (let i = 0; i < N; i++) {
            const off = i * 7
            const n = validNodes[i]
            if (n.id === anim.proposerId) { cache[off + 6] = 0; continue }

            let px, py
            if (affine) {
              px = ax * mercXY[i * 2] + bx
              py = ay * mercXY[i * 2 + 1] + by
            } else {
              const p = map.project([n.lon, n.lat])
              px = p.x; py = p.y
            }
            const dx = cachedTx - px, dy = cachedTy - py
            const sd = Math.sqrt(dx * dx + dy * dy)

            if (sd < 2 || (
              (px < -pad || px > w + pad || py < -pad || py > h + pad) &&
              (cachedTx < -pad || cachedTx > w + pad || cachedTy < -pad || cachedTy > h + pad)
            )) {
              cache[off + 6] = 0; continue
            }

            const bulge = sd * 0.16
            const mx = (px + cachedTx) * 0.5, my = (py + cachedTy) * 0.5
            const cpx = mx + (dy / sd) * bulge
            const cpy = my - (dx / sd) * bulge
            cache[off] = px
            cache[off + 1] = py
            cache[off + 2] = cpx
            cache[off + 3] = cpy
            cache[off + 4] = sd
            cache[off + 5] = 0
            cache[off + 6] = 1
            fillPoly(i, px, py, cpx, cpy, cachedTx, cachedTy)
          }
          projDirtyRef.current = false
        }

        const ensureSurface = (tw, th, dpr) => {
          const bw = Math.round(tw * dpr)
          const bh = Math.round(th * dpr)
          if (canvas.width !== bw || canvas.height !== bh) {
            canvas.width = bw
            canvas.height = bh
            canvas.style.width = tw + 'px'
            canvas.style.height = th + 'px'
          }
        }

        const draw = () => {
          if (!aliveRef.current || !map || !canvas || !ctxRef.current) return
          const anim = animRef.current
          const ctx = ctxRef.current

          if (!anim && !canvasDirtyRef.current) return

          let { w, h } = sizeRef.current
          if (!w || !h) {
            syncSize()
            ;({ w, h } = sizeRef.current)
            if (!w || !h) return
          }

          const dpr = Math.min(window.devicePixelRatio || 1, ARC_DPR_IDLE)
          ensureSurface(w, h, dpr)
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          ctx.clearRect(0, 0, w, h)
          canvasDirtyRef.current = false

          if (!anim) return
          const elapsed = performance.now() - anim.startTime
          if (elapsed > anim.total) {
            animRef.current = null
            return
          }

          if (projDirtyRef.current) reproject()

          // Linear dash progress like globe.gl arcDashAnimateTime (not ease-fill).
          const u = elapsed / anim.travel
          const delays = anim._delays
          const zoom = map.getZoom()
          const bw = Math.max(0.7, 0.55 + zoom * 0.12)
          const dotR = Math.max(1.3, 1.1 + zoom * 0.22)
          const tx = cachedTx, ty = cachedTy

          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'

          // Soft body of every traveling dash — one stroke for all arcs
          ctx.strokeStyle = ARC_STREAK_COLOR
          ctx.globalAlpha = 0.88
          ctx.lineWidth = bw * 1.3
          ctx.beginPath()
          let any = false
          for (let i = 0; i < N; i++) {
            if (cache[i * 7 + 6] < 1) continue
            const head = u - delays[i]
            if (head <= 0 || head - DASH_LEN >= 1) continue
            const t0 = Math.max(0, head - DASH_LEN)
            const t1 = Math.min(1, head)
            appendDash(ctx, i, t0, t1)
            any = true
          }
          if (any) ctx.stroke()

          // Brighter leading tip + core dots (single fill pass — no glow pass)
          ctx.strokeStyle = ARC_CORE_COLOR
          ctx.globalAlpha = 0.95
          ctx.lineWidth = bw
          ctx.beginPath()
          any = false
          for (let i = 0; i < N; i++) {
            if (cache[i * 7 + 6] < 1) continue
            const head = u - delays[i]
            if (head <= 0 || head - DASH_LEN >= 1) continue
            const t0 = Math.max(0, head - DASH_LEN * 0.35)
            const t1 = Math.min(1, head)
            if (t1 <= t0) continue
            appendDash(ctx, i, t0, t1)
            any = true
          }
          if (any) ctx.stroke()

          ctx.fillStyle = ARC_CORE_COLOR
          ctx.globalAlpha = 1
          ctx.beginPath()
          for (let i = 0; i < N; i++) {
            if (cache[i * 7 + 6] < 1) continue
            const head = u - delays[i]
            if (head <= 0.02 || head >= 1.02) continue
            const t = Math.min(1, head)
            const [hx, hy] = samplePoly(i, t)
            ctx.moveTo(hx + dotR, hy)
            ctx.arc(hx, hy, dotR, 0, TAU)
          }
          ctx.fill()

          if (u > 0.55 && u < 1.1) {
            const rp = Math.min(1, (u - 0.55) / 0.4)
            const radius = 8 + rp * 26
            const alpha = (1 - rp) * 0.25
            ctx.beginPath()
            ctx.arc(tx, ty, radius, 0, TAU)
            ctx.strokeStyle = `rgba(192,132,252,${alpha.toFixed(3)})`
            ctx.lineWidth = 1.4
            ctx.stroke()
          }

          ctx.globalAlpha = 1
          canvasDirtyRef.current = true
        }

        drawFnRef.current = draw

        // Viewport culling — hide markers outside the visible frame (+pad)
        // to cut browser compositing cost from ~218 nodes to ~30 at typical zoom.
        const cullMarkers = () => {
          if (!map || !containerRef.current) return
          const entries = mapObjRef.current
          if (!entries.size) return
          const { w, h } = sizeRef.current
          if (!w || !h) return
          const pad = 120
          entries.forEach((entry) => {
            const p = map.project(entry.coords)
            const visible = p.x > -pad && p.x < w + pad && p.y > -pad && p.y < h + pad
            const el = entry.el
            const hidden = el.dataset.mwHidden === '1'
            if (visible && hidden) { el.style.display = ''; el.dataset.mwHidden = '0' }
            else if (!visible && !hidden) { el.style.display = 'none'; el.dataset.mwHidden = '1' }
          })
        }
        cullFnRef.current = cullMarkers

        // The single place the container is measured. Everything on the draw
        // path reads this cache instead, so no frame forces a layout flush.
        const syncSize = () => {
          const el = containerRef.current
          if (!el) return
          sizeRef.current = { w: el.clientWidth, h: el.clientHeight }
        }
        syncSize()

        // Cull is cheap CSS toggling and doesn't need per-frame precision —
        // batch it to one rAF per drag gesture via its own local id (kept
        // separate from rafRef, which belongs to the arc animation loop).
        let cullRaf = 0
        const scheduleCull = () => {
          if (cullRaf) return
          cullRaf = requestAnimationFrame(() => { cullRaf = 0; cullMarkers() })
        }

        // Drag: disable marker hit-testing only. Keep arcs animating + reprojecting
        // so a click/pan never freezes the burst lines (old pan-freeze skipped draw).
        map.on('movestart', () => {
          draggingRef.current = true
          mapDrivingRef.current = true
          containerRef.current?.classList.add('mw-dragging')
        })
        map.on('zoomstart', () => {
          if (canvas) canvas.style.transform = ''
        })
        map.on('move', () => {
          if (animRef.current) projDirtyRef.current = true
          if (canvas) canvas.style.transform = ''
        })
        const endMapDrive = () => {
          draggingRef.current = false
          mapDrivingRef.current = false
          panFreezeRef.current = null
          containerRef.current?.classList.remove('mw-dragging')
          if (canvas) canvas.style.transform = ''
          if (animRef.current) projDirtyRef.current = true
          cullMarkers()
        }
        map.on('moveend', endMapDrive)
        map.on('dragend', endMapDrive)
        // Safety: click without a completed move can leave mapDriving stuck on some devices
        map.getCanvas().addEventListener('pointerup', () => {
          if (!mapDrivingRef.current) return
          // Defer so MapLibre can finish its own moveend first
          window.setTimeout(() => {
            if (mapDrivingRef.current && !map.isMoving()) endMapDrive()
          }, 0)
        })
        map.on('render', () => {
          if (!mapDrivingRef.current) return
          if (animRef.current) projDirtyRef.current = true
          lastMapDrawRef.current = performance.now()
        })
        map.on('move', scheduleCull)
        map.on('resize', () => {
          syncSize()
          if (animRef.current) {
            projDirtyRef.current = true
          }
          canvasDirtyRef.current = true
          draw()
          cullMarkers()
        })

        // Initial cull after markers mount (deferred below once validators added)

        validators.forEach((v) => {
          if (!isFinite(v.lon) || !isFinite(v.lat)) return
          const coords = [v.lon, v.lat]
          const el = createMarkerEl(v)

          el.addEventListener('mouseenter', () =>
            setHovered({ name: v.name, id: v.id, logo: v.localLogo || v.logo, city: v.city, country: v.country })
          )
          el.addEventListener('mouseleave', () => setHovered(null))
          el.addEventListener('click', () => {
            map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 3.5), duration: 450, essential: true })
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
          })

          const marker = new ml.Marker({ element: el, anchor: 'center' })
            .setLngLat(coords)
            .addTo(map)

          markersRef.current.push(marker)
          mapObjRef.current.set(v.id, { marker, el, coords, name: v.name, logo: v.localLogo || v.logo, validator: v })
        })

        cullFnRef.current()
        setReady(true)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[MonadWorld] Init failed:', err)
        setError(err.message || 'Failed to load map')
      }
    }

    boot()

    return () => {
      aliveRef.current = false
      clearTimeout(sizeTimerRef.current)
      cancelAnimationFrame(rafRef.current)
      if (overlayRef.current) { overlayRef.current.remove(); overlayRef.current = null }
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      mapObjRef.current.clear()
      if (map) { map.remove(); mapRef.current = null }
    }
  }, [])

  const triggerArcBurst = useCallback((payload) => {
    if (!aliveRef.current) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    const { entry, proposerId } = payload
    const nodes = allNodesRef.current
    const tLon = entry.coords[0], tLat = entry.coords[1]

    const delays = new Float32Array(nodes.length)
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === proposerId) { delays[i] = 0; continue }
      const dLat = tLat - nodes[i].lat
      const dLon = tLon - nodes[i].lon
      const dist = Math.sqrt(dLat * dLat + dLon * dLon)
      delays[i] = Math.min(1, dist / 140) * MAX_ARC_DELAY
    }

    const travel = travelMsForCadence(liveCadenceRef.current)
    // Keep burst lifetime ≤ live cadence so 0.3s blocks never stack overlapping draws.
    const total = Math.min(
      liveCadenceRef.current - 8,
      travel * (1 + MAX_ARC_DELAY + DASH_LEN),
    )

    projDirtyRef.current = true
    animRef.current = {
      proposerCoords: entry.coords,
      proposerId,
      startTime: performance.now(),
      travel,
      total: Math.max(travel, total),
      _delays: delays,
    }
  }, [])

  // Continuous rAF — arcs keep moving even while the user pans/zooms.
  useEffect(() => {
    if (!ready) return
    loopAliveRef.current = true
    const loop = () => {
      if (!loopAliveRef.current) return
      drawFnRef.current()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      loopAliveRef.current = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [ready])

  useEffect(() => {
    if (!latestBlock || !mapRef.current || !ready) return
    const v = latestBlock.proposerValidator
    if (!v?.id) return

    const num = typeof latestBlock.number === 'string'
      ? parseInt(latestBlock.number, 16) : latestBlock.number

    const entry = mapObjRef.current.get(v.id)

    if (prevProposerRef.current) prevProposerRef.current.classList.remove('vm-on')
    if (entry) { entry.el.classList.add('vm-on'); prevProposerRef.current = entry.el }

    // Reveal block chrome once (number itself is DOM-driven every block).
    setBlockNum((prev) => (prev == null ? num : prev))

    const nowTs = performance.now()
    if (lastBlockNumRef.current != null && num > lastBlockNumRef.current && lastBlockAtRef.current) {
      const perBlock = (nowTs - lastBlockAtRef.current) / (num - lastBlockNumRef.current)
      if (perBlock > 60 && perBlock < 5000) {
        const ema = liveCadenceRef.current * 0.55 + perBlock * 0.45
        liveCadenceRef.current = Math.max(ARC_MIN_CADENCE_MS, Math.min(ARC_MAX_CADENCE_MS, ema))
      }
    }
    lastBlockAtRef.current = nowTs
    lastBlockNumRef.current = num

    // Fire immediately on each block (replace in-flight) so arcs lock to ~0.3s.
    if (entry) {
      triggerArcBurst({ entry, proposerId: v.id })
    }

    const name = entry?.name || v.name || `Validator #${v.id}`
    const logo = entry?.logo || v.localLogo || v.logo || ''
    const loc = [entry?.validator?.city || v.city, entry?.validator?.country || v.country]
      .filter(Boolean)
      .join(', ')

    // Compact current producer + light history ticker (DOM-only)
    updateNowProposer(
      {
        root: nowRootRef.current,
        img: nowImgRef.current,
        name: nowNameRef.current,
        loc: nowLocRef.current,
        block: blockValRef.current,
      },
      { id: v.id, name, logo, loc, block: num },
    )

    if (nowTs - lastTickerAtRef.current >= 450) {
      lastTickerAtRef.current = nowTs
      pushProposerTick(tickerElRef.current, {
        id: v.id,
        name,
        logo,
        block: num,
        max: 8,
        showBlock: false,
      })
    }
  }, [latestBlock, ready, triggerArcBurst])

  if (error) {
    return (
      <div className="mw">
        <div className="mw-loading">
          <span className="mw-err">{error}</span>
          <button className="mw-retry" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="mw">
      <div className="mw-map" ref={containerRef} />

      {!ready && (
        <div className="mw-loading">
          <div className="mw-spinner" />
          <span>Loading Monad World…</span>
        </div>
      )}

      <header className="mw-bar">
        <div className="mw-bar-left">
          <div className="mw-logo-badge">
            <img src="/monad_logo.png" alt="" className="mw-logo" />
          </div>
          <div className="mw-brand-text">
            <span className="mw-title">MONAD WORLD</span>
            <span className="mw-subtitle">Validators, live around the globe</span>
          </div>
        </div>

        <div
          className="mw-now"
          ref={nowRootRef}
          aria-label="Current block producer"
        >
          <img ref={nowImgRef} className="mw-now-img" alt="" decoding="async" />
          <div className="mw-now-text">
            <span className="mw-now-name" ref={nowNameRef}>Waiting…</span>
            <span className="mw-now-loc" ref={nowLocRef} hidden />
          </div>
          <span className="mw-now-block" ref={blockValRef}>
            {blockNum != null ? `#${blockNum.toLocaleString()}` : '#—'}
          </span>
        </div>

        <div className="mw-ticker-wrap">
          <div className="mw-ticker" ref={tickerElRef} aria-label="Recent block producers" />
        </div>

        <div className="mw-bar-right">
          <div className={`mw-chip mw-chip-live${isConnected ? ' is-live' : ''}`}>
            <span className="mw-live-dot" />
            <span>{isConnected ? 'Mainnet' : connectionStatus === 'connecting' ? 'Connecting…' : 'Offline'}</span>
          </div>
          <div className="mw-chip">
            <span className="mw-chip-label">Validators</span>
            <span className="mw-chip-val">{count}</span>
          </div>
        </div>
      </header>

      <div className="mw-zoom">
        <button className="mw-zoom-btn" aria-label="Zoom in"
          onClick={() => mapRef.current?.zoomTo(mapRef.current.getZoom() + 1, { duration: 400 })}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
        <button className="mw-zoom-btn" aria-label="Zoom out"
          onClick={() => mapRef.current?.zoomTo(mapRef.current.getZoom() - 1, { duration: 400 })}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
        <button className="mw-zoom-btn" aria-label="Reset view"
          onClick={() => mapRef.current?.flyTo({ center: [20, 20], zoom: isMobile ? 1.1 : 1.7, duration: 800 })}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="9" cy="9" r="1.5" fill="currentColor"/></svg>
        </button>
        <div className="mw-zoom-sep" />
        <button className="mw-zoom-btn mw-home-btn" aria-label="Switch to 3D globe"
          onMouseEnter={() => { import('./MonadWorld3DPage').catch(() => {}) }}
          onFocus={() => { import('./MonadWorld3DPage').catch(() => {}) }}
          onClick={() => navigate('/world-3d')}>
          <span style={{ fontSize: 11, fontWeight: 700 }}>3D</span>
        </button>
        <button className="mw-zoom-btn mw-home-btn" aria-label="Go to homepage"
          onClick={() => navigate('/')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8.5l6-6 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M3.5 7v5.5a1 1 0 001 1h7a1 1 0 001-1V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      {hovered && (
        <div className="mw-tooltip">
          {hovered.logo && (
            <img src={hovered.logo} alt="" className="mw-tt-img"
              onError={(e) => { e.target.style.display = 'none' }} />
          )}
          <div className="mw-tt-text">
            <span className="mw-tt-id">#{hovered.id}</span>
            <span className="mw-tt-name">{hovered.name}</span>
            {hovered.city && (
              <span className="mw-tt-loc">{hovered.city}, {hovered.country}</span>
            )}
          </div>
        </div>
      )}

      {selectedValidator && (
        <aside className="mw-validator-card">
          <button className="mw-validator-close" onClick={() => setSelectedValidator(null)} aria-label="Close validator details">×</button>
          <div className="mw-validator-head">
            {(selectedValidator.localLogo || selectedValidator.logo) && (
              <img
                src={selectedValidator.localLogo || selectedValidator.logo}
                alt=""
                className="mw-validator-logo"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            )}
            <div className="mw-validator-head-text">
              <div className="mw-validator-name">{selectedValidator.name || `Validator #${selectedValidator.id}`}</div>
              <div className="mw-validator-sub">#{selectedValidator.id} • {selectedValidator.city}, {selectedValidator.country}</div>
            </div>
          </div>

          <div className="mw-validator-grid">
            <div className="mw-validator-item"><span>Stake</span><strong>{formatStakeMon(selectedValidator.stake)}</strong></div>
            <div className="mw-validator-item"><span>Commission</span><strong>{formatCommission(selectedValidator.commission)}</strong></div>
            <div className="mw-validator-item"><span>Set</span><strong>{selectedValidator.validatorSetType || '—'}</strong></div>
            <div className="mw-validator-item"><span>Status</span><strong>{selectedValidator.connected ? 'Online' : 'Offline'}</strong></div>
            <div className="mw-validator-item"><span>24h Uptime</span><strong>{validatorPerf?.uptime24 || '—'}</strong></div>
            <div className="mw-validator-item"><span>Success Rate</span><strong>{validatorPerf?.successRateText || '—'}</strong></div>
            <div className="mw-validator-item"><span>Commits</span><strong>{validatorPerf?.commitsText || '—'}</strong></div>
            <div className="mw-validator-item"><span>Timeouts</span><strong>{validatorPerf?.timeoutsText || '—'}</strong></div>
          </div>

          {perfLoading && <div className="mw-validator-meta">Loading performance metrics…</div>}
          {perfError && <div className="mw-validator-meta mw-validator-meta-err">{perfError}</div>}

          {normalizeHexId(selectedValidator.nodeId || selectedValidator.secp || selectedValidator.authAddress) && (
            <a
              href={`https://monad-space.itrocket.net/validators/${normalizeHexId(selectedValidator.nodeId || selectedValidator.secp || selectedValidator.authAddress) || ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mw-validator-link"
            >
              Open full validator profile
            </a>
          )}
        </aside>
      )}

      <div className="mw-watermark">DECENTRALIZATION</div>
    </div>
  )
}
