import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAgoraData, fetchAusdTransfersAllChains } from '../utils/agoraApi'
import { hashInt, jitterCoord, continentByLatLng } from '../utils/worldShared'
import './AgoraWorldPage.css'

const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const FEED_POLL_MS = 1200
const ARC_TICK_MS = 500
const ARC_BATCH_LIMIT = 6
// Live-data mandate: one real transfer spawns exactly one arc.
const TRANSFER_MULTIPLIER = 1
const MAX_QUEUE = 3500
const LED_TICKER_MAX = 42
const MAX_TX_PER_SOURCE_PER_TICK = 2
const INTERCONTINENTAL_BIAS_2D = 0.82
const CHAIN_LOGO_BY_ID = {
  1: '/agora/ethereum%20logo.jpeg',
  143: '/agora/monad%20logo.jpeg',
  43114: '/agora/avax%20logo.png',
  747474: '/agora/katana%20logo.png',
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3
}

function splitQuadratic(p0x, p0y, cpx, cpy, p1x, p1y, t) {
  const q0x = p0x + (cpx - p0x) * t
  const q0y = p0y + (cpy - p0y) * t
  const q1x = cpx + (p1x - cpx) * t
  const q1y = cpy + (p1y - cpy) * t
  return [q0x, q0y, q0x + (q1x - q0x) * t, q0y + (q1y - q0y) * t]
}

function formatLedAmount(amountDisplay, amountNum) {
  const raw = String(amountDisplay || '').trim()
  if (raw && raw !== '0') return raw
  const n = Number(amountNum || 0)
  if (!Number.isFinite(n) || n <= 0) return '<0.000001'
  if (n < 0.000001) return '<0.000001'
  if (n < 1) return n.toFixed(6)
  if (n < 1000) return n.toFixed(3)
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function chainLogoFromTx(chainId, chainName) {
  const id = Number(chainId)
  if (CHAIN_LOGO_BY_ID[id]) return CHAIN_LOGO_BY_ID[id]
  const name = String(chainName || '').toLowerCase()
  if (name.includes('monad')) return '/agora/monad%20logo.jpeg'
  if (name.includes('avalanche') || name.includes('avax')) return '/agora/avax%20logo.png'
  if (name.includes('katana')) return '/agora/katana%20logo.png'
  if (name.includes('ethereum')) return '/agora/ethereum%20logo.jpeg'
  return ''
}

function applyMapTheme(map) {
  const style = map.getStyle()
  if (!style?.layers) return

  for (const layer of style.layers) {
    const id = String(layer.id || '').toLowerCase()
    const sourceLayer = String(layer['source-layer'] || '').toLowerCase()
    const isWater = id.includes('water') || sourceLayer.includes('water')
    const isLand = id.includes('land') || sourceLayer.includes('land') || sourceLayer.includes('park') || sourceLayer.includes('landcover')
    const isBoundary = id.includes('boundary') || sourceLayer.includes('boundary')
    const isRoad = id.includes('road') || sourceLayer.includes('road')
    const isLabel = id.includes('label') || layer.type === 'symbol'
    const isBackground = layer.type === 'background' || id.includes('background')

    if (isBackground) {
      try { map.setPaintProperty(layer.id, 'background-color', '#02050a') } catch { /* basemap style may not define this layer/property */ }
    }
    if (isWater) {
      if (layer.type === 'fill') {
        try { map.setPaintProperty(layer.id, 'fill-color', '#04132b') } catch { /* basemap style may not define this layer/property */ }
        try { map.setPaintProperty(layer.id, 'fill-opacity', 0.985) } catch { /* basemap style may not define this layer/property */ }
      }
      if (layer.type === 'line') {
        try { map.setPaintProperty(layer.id, 'line-color', '#1b3b6b') } catch { /* basemap style may not define this layer/property */ }
        try { map.setPaintProperty(layer.id, 'line-opacity', 0.86) } catch { /* basemap style may not define this layer/property */ }
      }
    }
    if (isLand) {
      if (layer.type === 'fill') {
        try { map.setPaintProperty(layer.id, 'fill-color', '#050608') } catch { /* basemap style may not define this layer/property */ }
        try { map.setPaintProperty(layer.id, 'fill-opacity', 0.985) } catch { /* basemap style may not define this layer/property */ }
      }
    }
    if (isBoundary && layer.type === 'line') {
      try { map.setPaintProperty(layer.id, 'line-color', 'rgba(148,163,184,0.34)') } catch { /* basemap style may not define this layer/property */ }
      try { map.setPaintProperty(layer.id, 'line-opacity', 0.72) } catch { /* basemap style may not define this layer/property */ }
    }
    if (isRoad && layer.type === 'line') {
      try { map.setPaintProperty(layer.id, 'line-color', 'rgba(71,85,105,0.22)') } catch { /* basemap style may not define this layer/property */ }
      try { map.setPaintProperty(layer.id, 'line-opacity', 0.22) } catch { /* basemap style may not define this layer/property */ }
    }
    if (isLabel) {
      try { map.setPaintProperty(layer.id, 'text-color', '#8d7a38') } catch { /* basemap style may not define this layer/property */ }
      try { map.setPaintProperty(layer.id, 'text-halo-color', 'rgba(2,6,23,0.86)') } catch { /* basemap style may not define this layer/property */ }
      try { map.setPaintProperty(layer.id, 'text-halo-width', 0.6) } catch { /* basemap style may not define this layer/property */ }
      try { map.setLayerZoomRange(layer.id, 3.8, 22) } catch { /* basemap style may not define this layer/property */ }
    }
  }
}

function createNodeEl(node, onHover) {
  const el = document.createElement('button')
  el.className = 'aw2-node'
  el.type = 'button'
  el.title = `${node.city}, ${node.country}`
  el.dataset.city = node.city || ''

  const img = document.createElement('img')
  img.className = 'aw2-node-img'
  img.src = node.logo
  img.alt = 'Agora'
  img.loading = 'lazy'
  img.decoding = 'async'
  img.draggable = false
  el.appendChild(img)

  el.addEventListener('mouseenter', () => onHover(node))
  el.addEventListener('mouseleave', () => onHover(null))

  return el
}

export default function AgoraWorldPage() {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const nodeByAddressRef = useRef(new Map())
  const nodeElsRef = useRef(new Map())
  const nodesRef = useRef([])
  const queueRef = useRef([])
  const seenRef = useRef(new Set())
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const arcsRef = useRef([])
  const rafRef = useRef(0)
  const pollTimerRef = useRef(0)
  const tickTimerRef = useRef(0)
  const hotTimersRef = useRef(new Map())
  const aliveRef = useRef(true)
  const sourceRotationIndexRef = useRef(0)
  const continentBucketsRef = useRef({})
  const agoraDataRef = useRef(null)

  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [meta, setMeta] = useState({ logo: '', symbol: 'AUSD' })
  const [hovered, setHovered] = useState(null)
  const [ledRows, setLedRows] = useState([])
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  )
  const navigate = useNavigate()

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handle = () => setIsMobile(mq.matches)
    mq.addEventListener('change', handle)
    return () => mq.removeEventListener('change', handle)
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    aliveRef.current = true
    let map = null

    const clearAll = () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current)
      if (tickTimerRef.current) window.clearInterval(tickTimerRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      for (const timer of hotTimersRef.current.values()) window.clearTimeout(timer)
      hotTimersRef.current.clear()
      pollTimerRef.current = 0
      tickTimerRef.current = 0
      rafRef.current = 0
    }

    const draw = () => {
      if (!aliveRef.current || !ctxRef.current || !canvasRef.current || !mapRef.current || !containerRef.current) return
      const ctx = ctxRef.current
      const canvas = canvasRef.current
      const mapObj = mapRef.current
      const w = containerRef.current.clientWidth
      const h = containerRef.current.clientHeight
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const now = performance.now()
      const active = []
      ctx.lineCap = 'round'

      for (const arc of arcsRef.current) {
        const elapsed = now - arc.startAt
        if (elapsed < 0) {
          active.push(arc)
          continue
        }
        const p = Math.min(1, elapsed / arc.duration)
        if (p >= 1) continue

        const sp = mapObj.project([arc.startLng, arc.startLat])
        const ep = mapObj.project([arc.endLng, arc.endLat])
        const dx = ep.x - sp.x
        const dy = ep.y - sp.y
        const dist = Math.max(1, Math.hypot(dx, dy))
        const midX = (sp.x + ep.x) * 0.5
        const midY = (sp.y + ep.y) * 0.5
        const cpx = midX + (dy / dist) * arc.bulge
        const cpy = midY - (dx / dist) * arc.bulge
        const t = easeOutCubic(p)
        const [q0x, q0y, rx, ry] = splitQuadratic(sp.x, sp.y, cpx, cpy, ep.x, ep.y, t)

        const alpha = arc.kind === 'swap' ? 0.72 : 0.66
        const lead = arc.kind === 'swap' ? '245,197,77' : '232,184,67'
        const tail = arc.kind === 'swap' ? '176,124,30' : '152,111,33'
        const grad = ctx.createLinearGradient(sp.x, sp.y, rx, ry)
        grad.addColorStop(0, `rgba(${tail},${(0.05 * t).toFixed(3)})`)
        grad.addColorStop(0.55, `rgba(${lead},${(alpha * 0.65 * t).toFixed(3)})`)
        grad.addColorStop(1, `rgba(${lead},${(alpha * t).toFixed(3)})`)

        ctx.strokeStyle = `rgba(3,8,18,${(0.28 * t).toFixed(3)})`
        ctx.lineWidth = arc.stroke * 2.1
        ctx.beginPath()
        ctx.moveTo(sp.x, sp.y)
        ctx.quadraticCurveTo(q0x, q0y, rx, ry)
        ctx.stroke()

        ctx.strokeStyle = `rgba(${lead},${(0.12 * t).toFixed(3)})`
        ctx.lineWidth = arc.stroke * 1.55
        ctx.beginPath()
        ctx.moveTo(sp.x, sp.y)
        ctx.quadraticCurveTo(q0x, q0y, rx, ry)
        ctx.stroke()

        ctx.strokeStyle = grad
        ctx.lineWidth = arc.stroke * 0.98
        ctx.beginPath()
        ctx.moveTo(sp.x, sp.y)
        ctx.quadraticCurveTo(q0x, q0y, rx, ry)
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(rx, ry, Math.max(1.8, arc.stroke * 1.5), 0, Math.PI * 2)
        ctx.fillStyle = arc.kind === 'swap' ? 'rgba(245,197,77,0.2)' : 'rgba(232,184,67,0.16)'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(rx, ry, Math.max(1.15, arc.stroke * 1.05), 0, Math.PI * 2)
        ctx.fillStyle = arc.kind === 'swap' ? 'rgba(250,232,174,0.74)' : 'rgba(244,221,160,0.68)'
        ctx.fill()

        active.push(arc)
      }

      arcsRef.current = active
      rafRef.current = requestAnimationFrame(draw)
    }

    const boot = async () => {
      try {
        const [maplibreMod, _mapCss, agora] = await Promise.all([
          import('maplibre-gl'),
          import('maplibre-gl/dist/maplibre-gl.css'),
          fetchAgoraData(),
        ])
        if (!aliveRef.current || !containerRef.current) return

        agoraDataRef.current = agora
        setMeta({ logo: agora.logo, symbol: agora.symbol || 'AUSD' })
        const ml = maplibreMod.default || maplibreMod
        map = new ml.Map({
          container: containerRef.current,
          style: STYLE_URL,
          center: [16, 18],
          zoom: isMobile ? 1.05 : 1.55,
          minZoom: 0.75,
          maxZoom: 7.8,
          attributionControl: false,
          fadeDuration: 0,
          pitchWithRotate: false,
          dragRotate: false,
          touchPitch: false,
          renderWorldCopies: false,
          boxZoom: false,
        })
        mapRef.current = map

        await new Promise((res, rej) => {
          map.once('load', res)
          setTimeout(() => rej(new Error('Map timed out')), 20_000)
        })
        if (!aliveRef.current) return

        applyMapTheme(map)

        const nodes = agora.cities.map((city, idx) => ({
          ...city,
          logo: agora.logo,
          id: `${city.id}-${idx}`,
          continent: continentByLatLng(city.lat, city.lon),
        }))
        nodesRef.current = nodes
        nodeByAddressRef.current.clear()
        nodeElsRef.current.clear()
        
        continentBucketsRef.current = nodes.reduce((acc, n) => {
          const key = n.continent || 'Other'
          if (!acc[key]) acc[key] = []
          acc[key].push(n)
          return acc
        }, {})

        const canvas = document.createElement('canvas')
        canvas.className = 'aw2-arc-canvas'
        containerRef.current.appendChild(canvas)
        canvasRef.current = canvas
        ctxRef.current = canvas.getContext('2d', { alpha: true })

        nodes.forEach((node) => {
          if (!Number.isFinite(node.lon) || !Number.isFinite(node.lat)) return
          const el = createNodeEl(node, setHovered)
          const marker = new ml.Marker({ element: el, anchor: 'center' })
            .setLngLat([node.lon, node.lat])
            .addTo(map)
          markersRef.current.push(marker)
          nodeElsRef.current.set(node.id, el)
          el.addEventListener('click', () => {
            map.flyTo({
              center: [node.lon, node.lat],
              zoom: Math.max(map.getZoom(), 3.2),
              duration: 700,
              essential: true,
            })
          })
        })

        const nodeForAddress = (address) => {
          if (!address || !nodes.length) return null
          const key = String(address).toLowerCase()
          const cached = nodeByAddressRef.current.get(key)
          if (cached) return cached
          const idx = hashInt(key) % nodes.length
          const chosen = nodes[idx]
          nodeByAddressRef.current.set(key, chosen)
          return chosen
        }
        
        const pickSameContinentNode = (fromNode, seed) => {
          const fromContinent = fromNode.continent || 'Other'
          const bucket = continentBucketsRef.current[fromContinent] || []
          if (!bucket.length) return null
          return bucket[seed % bucket.length] || null
        }
        
        const pickCrossContinentNode = (fromNode, seed) => {
          const fromContinent = fromNode.continent || 'Other'
          const choices = Object.keys(continentBucketsRef.current).filter(
            (c) => c !== fromContinent && continentBucketsRef.current[c]?.length
          )
          if (!choices.length) return null
          const continent = choices[seed % choices.length]
          const bucket = continentBucketsRef.current[continent]
          return bucket[(seed >>> 3) % bucket.length] || null
        }
        
        const pickRotatingSource = (txHash, multiplierIndex) => {
          if (!nodes.length) return null
          const continents = Object.keys(continentBucketsRef.current).filter(
            (c) => continentBucketsRef.current[c]?.length > 0
          )
          if (!continents.length) return null
          
          const rotationKey = `${txHash}:${multiplierIndex}`
          const continentIdx = (hashInt(rotationKey) + sourceRotationIndexRef.current) % continents.length
          const continent = continents[continentIdx]
          const bucket = continentBucketsRef.current[continent] || []
          if (!bucket.length) return null
          
          const nodeIdx = hashInt(`${rotationKey}:node`) % bucket.length
          return bucket[nodeIdx]
        }

        const refreshFeed = async () => {
          const feed = await fetchAusdTransfersAllChains(agora.chains, {
            blockWindow: 600,
            maxLogsPerChain: 110,
            maxChainsPerPoll: 0,
          })
          if (!aliveRef.current) return
          for (const tx of feed.transfers || []) {
            const key = `${tx.chainId || 'x'}:${tx.txHash || ''}:${tx.logIndex || 0}`
            if (!tx?.txHash || seenRef.current.has(key)) continue
            seenRef.current.add(key)
            if (seenRef.current.size > 1200) {
              const first = seenRef.current.values().next().value
              if (first) seenRef.current.delete(first)
            }
            queueRef.current.push(tx)
          }
          if (queueRef.current.length > MAX_QUEUE) queueRef.current.length = MAX_QUEUE
        }

        const tickTransfers = () => {
          if (!queueRef.current.length || !nodes.length) return
          
          sourceRotationIndexRef.current = (sourceRotationIndexRef.current + 1) % 100
          
          const limit = Math.min(ARC_BATCH_LIMIT, queueRef.current.length)
          const now = performance.now()
          const ledBatch = []
          const sourceEmission = new Map()
          const currentSymbol = agoraDataRef.current?.symbol || 'AUSD'
          const markNodeHot = (nodeId) => {
            const hotEl = nodeElsRef.current.get(nodeId)
            if (!hotEl) return
            hotEl.classList.add('aw2-node-hot')
            const prevTimer = hotTimersRef.current.get(nodeId)
            if (prevTimer) window.clearTimeout(prevTimer)
            const t = window.setTimeout(() => {
              const target = nodeElsRef.current.get(nodeId)
              if (target) target.classList.remove('aw2-node-hot')
              hotTimersRef.current.delete(nodeId)
            }, 850)
            hotTimersRef.current.set(nodeId, t)
          }

          for (let i = 0; i < limit; i++) {
            const tx = queueRef.current.shift()
            if (!tx) continue
            const realSource = nodeForAddress(tx.from)
            const realTarget = nodeForAddress(tx.to)
            if (!realSource || !realTarget) continue

            ledBatch.push({
              key: `${tx.chainId || 'x'}:${tx.txHash || ''}:${tx.logIndex || 0}:${Date.now()}:${i}`,
              kind: tx.kind === 'swap' ? 'SWAP' : 'TRANSFER',
              amount: formatLedAmount(tx.amountDisplay, tx.amount),
              symbol: currentSymbol,
              chainId: tx.chainId,
              chainName: tx.chainName || 'Chain',
              hash: tx.txHash || '',
            })

            for (let m = 0; m < TRANSFER_MULTIPLIER; m++) {
              const seedA = hashInt(`${tx.txHash || ''}:${tx.logIndex || 0}:a:${m}`)
              const seedB = hashInt(`${tx.txHash || ''}:${tx.logIndex || 0}:b:${m}`)
              
              const useRotating = ((seedA + m * 7) % 100) < (INTERCONTINENTAL_BIAS_2D * 100)
              let a = useRotating ? pickRotatingSource(tx.txHash, m) : realSource
              if (!a) a = realSource
              
              const emitted = sourceEmission.get(a.id) || 0
              if (emitted >= MAX_TX_PER_SOURCE_PER_TICK) {
                a = pickRotatingSource(`${tx.txHash}:alt:${m}`, m + i * 13)
                if (!a || sourceEmission.get(a.id) >= MAX_TX_PER_SOURCE_PER_TICK) continue
              }
              
              const isIntercontinental = ((seedB + m * 11) % 100) < (INTERCONTINENTAL_BIAS_2D * 100)
              const b = isIntercontinental 
                ? pickCrossContinentNode(a, seedB + m * 17)
                : pickSameContinentNode(a, seedB + m * 23)
              
              if (!b || a.id === b.id) continue
              
              sourceEmission.set(a.id, (sourceEmission.get(a.id) || 0) + 1)
              
              markNodeHot(a.id)
              markNodeHot(b.id)

              const from = jitterCoord(a.lat, a.lon, seedA, seedB, 0.24 + (m % 3) * 0.09)
              const to = jitterCoord(b.lat, b.lon, seedB, seedA, 0.52 + (m % 4) * 0.15)
              const geoDist = Math.hypot(to.lat - from.lat, to.lng - from.lng)
              const distNorm = Math.min(1, geoDist / 170)

              arcsRef.current.push({
                startLat: from.lat,
                startLng: from.lng,
                endLat: to.lat,
                endLng: to.lng,
                kind: tx.kind,
                bulge: 28 + distNorm * 98 + (m % 5) * 8,
                stroke: (tx.kind === 'swap' ? 1.1 : 0.94) + distNorm * 0.38 + (m % 3) * 0.06,
                startAt: now + m * 12,
                duration: 540 + (m % 5) * 75,
              })
            }
          }

          if (arcsRef.current.length > 5000) {
            arcsRef.current = arcsRef.current.slice(-3200)
          }
          if (ledBatch.length) {
            setLedRows((prev) => [...ledBatch, ...prev].slice(0, LED_TICKER_MAX))
          }
        }

        setReady(true)
        refreshFeed().catch(() => {})
        pollTimerRef.current = window.setInterval(() => { refreshFeed().catch(() => {}) }, FEED_POLL_MS)
        tickTimerRef.current = window.setInterval(tickTransfers, ARC_TICK_MS)
        rafRef.current = requestAnimationFrame(draw)
      } catch (e) {
        setError(e?.message || 'Failed to load AGORA 2D map')
      }
    }

    boot()

    return () => {
      aliveRef.current = false
      clearAll()
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      nodeByAddressRef.current.clear()
      nodeElsRef.current.clear()
      arcsRef.current = []
      queueRef.current = []
      if (canvasRef.current) {
        canvasRef.current.remove()
        canvasRef.current = null
      }
      if (map) {
        map.remove()
        mapRef.current = null
      }
    }
  }, [isMobile])

  if (error) {
    return (
      <div className="aw2">
        <div className="aw2-loading">
          <span className="aw2-err">{error}</span>
          <button className="aw2-retry" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="aw2">
      <div className="aw2-map" ref={containerRef} />
      {!ready && (
        <div className="aw2-loading">
          <div className="aw2-spinner" />
          <span>Loading AGORA World 2D...</span>
        </div>
      )}

      <header className="aw2-bar">
        <div className="aw2-title-wrap">
          {meta.logo && <img src={meta.logo} alt="" className="aw2-logo" />}
          <span className="aw2-title">AGORA Visualization</span>
        </div>
        <div className="aw2-led-wrap">
          <div className="aw2-led-track">
            {[...ledRows, ...ledRows].map((row, idx) => (
              <span className="aw2-led-chip" key={`${row.key}-${idx}`}>
                <em className={`aw2-led-kind ${row.kind === 'SWAP' ? 'is-swap' : 'is-transfer'}`}>{row.kind}</em>
                <strong className="aw2-led-amount">{row.amount} {row.symbol}</strong>
                {chainLogoFromTx(row.chainId, row.chainName) ? (
                  <img
                    src={chainLogoFromTx(row.chainId, row.chainName)}
                    alt={row.chainName || 'Chain'}
                    className="aw2-led-chain-logo"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                ) : (
                  <span className="aw2-led-chain-fb">{(row.chainName || 'C').slice(0, 1).toUpperCase()}</span>
                )}
                <code className="aw2-led-hash">{row.hash ? `${row.hash.slice(0, 8)}...${row.hash.slice(-6)}` : '—'}</code>
              </span>
            ))}
          </div>
        </div>
      </header>

      <div className="aw2-zoom">
        <button className="aw2-btn" aria-label="Zoom in" onClick={() => mapRef.current?.zoomTo((mapRef.current.getZoom() || 0) + 1, { duration: 260 })}>+</button>
        <button className="aw2-btn" aria-label="Zoom out" onClick={() => mapRef.current?.zoomTo((mapRef.current.getZoom() || 0) - 1, { duration: 260 })}>-</button>
        <button className="aw2-btn" aria-label="Reset" onClick={() => mapRef.current?.flyTo({ center: [16, 18], zoom: isMobile ? 1.05 : 1.55, duration: 700 })}>◉</button>
        <button className="aw2-btn" aria-label="Switch to AGORA 3D"
          onMouseEnter={() => { import('./AgoraWorld3DPage').catch(() => {}) }}
          onFocus={() => { import('./AgoraWorld3DPage').catch(() => {}) }}
          onClick={() => navigate('/agora-world-3d')}>3D</button>
        <button className="aw2-btn" aria-label="Home" onClick={() => navigate('/')}>⌂</button>
      </div>

      {hovered && (
        <div className="aw2-tooltip">
          <strong>{hovered.city}, {hovered.country}</strong>
          <span>Live {meta.symbol} routes are distributed from this hub.</span>
        </div>
      )}
    </div>
  )
}
