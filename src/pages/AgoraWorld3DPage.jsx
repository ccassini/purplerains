import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAgoraData, fetchAusdTransfersAllChains } from '../utils/agoraApi'
import './AgoraWorld3DPage.css'

function hashInt(input) {
  let h = 2166136261
  const s = String(input || '')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h >>> 0)
}

function jitterCoord(baseLat, baseLng, seedA, seedB, scale = 1) {
  // Tiny deterministic jitter so repeated routes do not overlap perfectly.
  const latJitter = ((seedA % 1000) / 1000 - 0.5) * 0.9 * scale
  const lngJitter = ((seedB % 1000) / 1000 - 0.5) * 1.2 * scale
  const lat = Math.max(-89.8, Math.min(89.8, baseLat + latJitter))
  let lng = baseLng + lngJitter
  if (lng > 180) lng -= 360
  if (lng < -180) lng += 360
  return { lat, lng }
}

function anchoredCoord(baseLat, baseLng, seed, laneIndex = 0, laneCount = 1, maxOffsetDeg = 0.18) {
  // Keep arc endpoints attached to node vicinity, not drifting around map.
  const safeLaneCount = Math.max(1, laneCount)
  const lanePhase = (laneIndex % safeLaneCount) / safeLaneCount
  const angle = (((seed % 360) + lanePhase * 360) * Math.PI) / 180
  const radius = (((seed >>> 6) % 1000) / 1000) * maxOffsetDeg
  const lat = Math.max(-89.8, Math.min(89.8, baseLat + Math.sin(angle) * radius))
  const cosLat = Math.max(0.25, Math.cos((baseLat * Math.PI) / 180))
  let lng = baseLng + (Math.cos(angle) * radius) / cosLat
  if (lng > 180) lng -= 360
  if (lng < -180) lng += 360
  return { lat, lng }
}

function continentByLatLng(lat, lng) {
  // Lightweight geo bucketing for visual routing only.
  if (lat > 35 && lng >= -10 && lng <= 60) return 'Europe'
  if (lat >= -35 && lat <= 38 && lng >= -20 && lng <= 55) return 'Africa'
  if (lat >= 5 && lng >= 55 && lng <= 180) return 'Asia'
  if (lat < -5 && lng >= 95 && lng <= 180) return 'Oceania'
  if (lng >= -92 && lng <= -30 && lat >= -55 && lat <= 15) return 'South America'
  if (lng >= -170 && lng <= -45 && lat >= 10) return 'North America'
  return 'Other'
}

function formatAmountForUi(amountDisplay, fallbackAmount) {
  const raw = String(amountDisplay || '').trim()
  if (raw && raw !== '0') return raw
  const n = Number(fallbackAmount || 0)
  if (!Number.isFinite(n) || n <= 0) return '<0.000001'
  if (n < 0.000001) return '<0.000001'
  if (n < 1) return n.toFixed(6)
  if (n < 1000) return n.toFixed(3)
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

const CHAIN_LOGO_BY_ID = {
  1: '/agora/ethereum%20logo.jpeg',
  143: '/agora/monad%20logo.jpeg',
  43114: '/agora/avax%20logo.png',
  747474: '/agora/katana%20logo.png',
}

function chainLogoFromRow(row) {
  const id = Number(row?.chainId)
  if (CHAIN_LOGO_BY_ID[id]) return CHAIN_LOGO_BY_ID[id]
  const name = String(row?.chainName || '').toLowerCase()
  if (name.includes('monad')) return '/agora/monad%20logo.jpeg'
  if (name.includes('avalanche') || name.includes('avax')) return '/agora/avax%20logo.png'
  if (name.includes('katana')) return '/agora/katana%20logo.png'
  if (name.includes('ethereum')) return '/agora/ethereum%20logo.jpeg'
  return ''
}

function createNodeEl(node, onHover, onSelect, onBindEl) {
  const el = document.createElement('button')
  el.className = `aw3-node${node.chainCount > 0 ? ' aw3-node-active' : ''}`
  el.type = 'button'
  el.dataset.city = node.city || ''

  const img = document.createElement('img')
  img.className = 'aw3-node-img'
  img.src = node.logo
  img.alt = 'Agora'
  img.loading = 'lazy'
  img.decoding = 'async'
  img.draggable = false
  el.appendChild(img)

  let downX = 0
  let downY = 0
  let downAt = 0
  el.addEventListener('mouseenter', () => onHover(node))
  el.addEventListener('mouseleave', () => onHover(null))
  el.addEventListener('pointerdown', (e) => {
    downX = e.clientX
    downY = e.clientY
    downAt = performance.now()
  })
  el.addEventListener('pointerup', (e) => {
    const dist = Math.hypot(e.clientX - downX, e.clientY - downY)
    const dt = performance.now() - downAt
    if (dist <= 6 && dt <= 450) onSelect(node)
  })

  if (onBindEl) onBindEl(node.id, el)
  return el
}

export default function AgoraWorld3DPage() {
  const FEED_POLL_MS = 1200
  const ARC_TICK_MS = 400
  const UI_FEED_TICK_MS = 180
  const ARC_BATCH_LIMIT = 24
  const TRANSFER_MULTIPLIER = 18
  const MAX_ARCS_PER_SOURCE_PER_TICK = 3
  const MAX_UNIQUE_LANES_PER_TX = 5
  const FEED_APPEND_PER_TICK = 6
  const FEED_MAX_ROWS = 36
  const MAX_QUEUE = 4000
  const MAX_UI_QUEUE = 1200
  const FLOW_ROW_LIFETIME_MS = 15000
  const NODE_HIGHLIGHT_TICK_MS = 600
  const NODE_HIGHLIGHT_ON_MS = 550
  const INTERCONTINENTAL_BIAS = 0.92

  const navigate = useNavigate()
  const containerRef = useRef(null)
  const globeRef = useRef(null)
  const nodesRef = useRef([])
  const nodeByAddressRef = useRef(new Map())
  const nodeElsRef = useRef(new Map())
  const nodeHighlightQueueRef = useRef([])
  const nodeHighlightPendingSetRef = useRef(new Set())
  const lastHighlightedNodeIdRef = useRef('')
  const activeHighlightedNodeIdRef = useRef('')
  const activeHighlightedNodeTimeoutRef = useRef(0)
  const renderedArcsRef = useRef([])
  const nodeArcSampleRef = useRef(new Map())
  const queueRef = useRef([])
  const uiFeedQueueRef = useRef([])
  const seenTxRef = useRef(new Set())
  const feedContainerRef = useRef(null)
  const transfersTimerRef = useRef(0)
  const pollTimerRef = useRef(0)
  const uiFeedTimerRef = useRef(0)
  const sunTimerRef = useRef(0)
  const nodeHighlightTimerRef = useRef(0)
  const sourceRotationIndexRef = useRef(0)
  const continentRotationRef = useRef({})

  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [meta, setMeta] = useState({ name: 'Agora Dollar', symbol: 'AUSD', logo: '' })
  const [citiesCount, setCitiesCount] = useState(0)
  const [chainsCount, setChainsCount] = useState(0)
  const [feedInfo, setFeedInfo] = useState({ scannedChains: 0 })
  const [hovered, setHovered] = useState(null)
  const [selected, setSelected] = useState(null)
  const [onchainFeed, setOnchainFeed] = useState([])

  useEffect(() => {
    // Keep newest transfers visible at top.
    if (feedContainerRef.current) {
      feedContainerRef.current.scrollTop = 0
    }
  }, [onchainFeed])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now()
      setOnchainFeed((prev) => prev.filter((row) => (row.expiresAt || 0) > now))
    }, 400)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    let alive = true

    const clearTimers = () => {
      if (transfersTimerRef.current) window.clearInterval(transfersTimerRef.current)
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current)
      if (uiFeedTimerRef.current) window.clearInterval(uiFeedTimerRef.current)
      if (sunTimerRef.current) window.clearInterval(sunTimerRef.current)
      if (nodeHighlightTimerRef.current) window.clearInterval(nodeHighlightTimerRef.current)
      if (activeHighlightedNodeTimeoutRef.current) window.clearTimeout(activeHighlightedNodeTimeoutRef.current)
      if (activeHighlightedNodeIdRef.current) {
        const activeEl = nodeElsRef.current.get(activeHighlightedNodeIdRef.current)
        if (activeEl) activeEl.classList.remove('aw3-node-hot')
      }
      nodeHighlightQueueRef.current = []
      nodeHighlightPendingSetRef.current.clear()
      activeHighlightedNodeIdRef.current = ''
      renderedArcsRef.current = []
      nodeArcSampleRef.current.clear()
      transfersTimerRef.current = 0
      pollTimerRef.current = 0
      uiFeedTimerRef.current = 0
      sunTimerRef.current = 0
      nodeHighlightTimerRef.current = 0
      activeHighlightedNodeTimeoutRef.current = 0
    }

    const boot = async () => {
      try {
        const [globeMod, agora] = await Promise.all([import('globe.gl'), fetchAgoraData()])
        if (!alive || !containerRef.current) return

        setMeta({ name: agora.name, symbol: agora.symbol, logo: agora.logo })
        setCitiesCount(agora.cities.length)
        setChainsCount(agora.chains.length)

        const nodes = agora.cities.map((city, idx) => ({
          ...city,
          logo: agora.logo,
          chainCount: 0,
          chains: [],
          continent: continentByLatLng(city.lat, city.lon),
          id: `${city.id}-${idx}`,
        }))

        const used = new Set()
        for (const chain of agora.chains) {
          if (!nodes.length) break
          let idx = hashInt(`${chain.chainId}-${chain.platform}`) % nodes.length
          while (used.has(idx)) idx = (idx + 1) % nodes.length
          used.add(idx)
          nodes[idx].chains.push(chain)
          nodes[idx].chainCount = nodes[idx].chains.length
        }

        nodesRef.current = nodes
        nodeByAddressRef.current.clear()
        nodeElsRef.current.clear()
        nodeHighlightQueueRef.current = []
        nodeHighlightPendingSetRef.current.clear()
        lastHighlightedNodeIdRef.current = ''
        activeHighlightedNodeIdRef.current = ''
        renderedArcsRef.current = []
        nodeArcSampleRef.current.clear()
        const Globe = globeMod.default || globeMod
        const globe = new Globe(containerRef.current, {
          animateIn: false,
          rendererConfig: { logarithmicDepthBuffer: true },
        })
          .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
          .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
          .atmosphereColor('#7dd3fc')
          .atmosphereAltitude(0.18)
          .pointsData(nodes)
          .pointLat(d => d.lat)
          .pointLng(d => d.lon)
          .pointColor(d => (d.chainCount > 0 ? 'rgba(34,197,94,0.9)' : 'rgba(148,163,184,0.35)'))
          .pointAltitude(d => (d.chainCount > 0 ? 0.014 : 0.008))
          .pointRadius(d => (d.chainCount > 0 ? 0.2 : 0.12))
          .htmlElementsData(nodes)
          .htmlLat(d => d.lat)
          .htmlLng(d => d.lon)
          .htmlAltitude(d => (d.chainCount > 0 ? 0.013 : 0.01))
          .htmlElement(d => createNodeEl(d, setHovered, setSelected, (id, el) => {
            nodeElsRef.current.set(id, el)
          }))

        globeRef.current = globe
        const controls = globe.controls()
        controls.autoRotate = true
        controls.autoRotateSpeed = 0.25
        controls.enablePan = false
        controls.minDistance = 140
        controls.maxDistance = 1260

        try {
          const three = await import('three')
          const scene = globe.scene()
          const renderer = globe.renderer()
          const mat = globe.globeMaterial()
          const texLoader = new three.TextureLoader()
          const dayTex = texLoader.load('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
          const nightTex = texLoader.load('https://unpkg.com/three-globe/example/img/earth-night.jpg')
          const topoTex = texLoader.load('https://unpkg.com/three-globe/example/img/earth-topology.png')
          dayTex.colorSpace = three.SRGBColorSpace
          nightTex.colorSpace = three.SRGBColorSpace
          mat.map = dayTex
          mat.emissiveMap = nightTex
          mat.bumpMap = topoTex
          mat.bumpScale = 0.05
          mat.specularMap = null
          mat.specular = new three.Color(0x1b3a5b)
          mat.emissive = new three.Color(0xaec8ff)
          mat.emissiveIntensity = 0.36
          mat.shininess = 7
          mat.needsUpdate = true

          renderer.toneMapping = three.ACESFilmicToneMapping
          renderer.toneMappingExposure = 1.25

          const sun = new three.DirectionalLight(0xfff7e1, 1.05)
          const rim = new three.DirectionalLight(0x60a5fa, 0.2)
          const hemi = new three.HemisphereLight(0x8bc8ff, 0x0b1024, 0.22)
          const amb = new three.AmbientLight(0x102040, 0.22)
          scene.add(sun)
          scene.add(rim)
          scene.add(hemi)
          scene.add(amb)

          const cloudsTex = texLoader.load('https://unpkg.com/three-globe/example/img/earth-clouds.png')
          cloudsTex.colorSpace = three.SRGBColorSpace
          const clouds = new three.Mesh(
            new three.SphereGeometry(globe.getGlobeRadius() * 1.012, 80, 80),
            new three.MeshPhongMaterial({
              map: cloudsTex,
              transparent: true,
              opacity: 0.28,
              depthWrite: false,
            })
          )
          scene.add(clouds)

          const syncSun = () => {
            const t = Date.now() / 1000
            sun.position.set(Math.cos(t / 4200) * 320, Math.sin(t / 3800) * 120, Math.sin(t / 4200) * 320)
            rim.position.set(-sun.position.x * 0.58, 42, -sun.position.z * 0.58)
            clouds.rotation.y = t * 0.0065
          }
          syncSun()
          sunTimerRef.current = window.setInterval(syncSun, 16_000)
        } catch {
          // Keep running if advanced lighting fails.
        }

        const resize = () => {
          if (!containerRef.current || !globeRef.current) return
          globeRef.current.width(containerRef.current.clientWidth).height(containerRef.current.clientHeight)
        }
        resize()
        window.addEventListener('resize', resize)

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
        const continentBuckets = nodes.reduce((acc, n) => {
          const key = n.continent || 'Other'
          if (!acc[key]) acc[key] = []
          acc[key].push(n)
          return acc
        }, {})
        const pickSameContinentNode = (fromNode, seed) => {
          const fromContinent = fromNode.continent || 'Other'
          const bucket = continentBuckets[fromContinent] || []
          if (!bucket.length) return null
          return bucket[seed % bucket.length] || null
        }
        const pickCrossContinentNode = (fromNode, seed) => {
          const fromContinent = fromNode.continent || 'Other'
          const choices = Object.keys(continentBuckets).filter((c) => c !== fromContinent && continentBuckets[c]?.length)
          if (!choices.length) return null
          const continent = choices[seed % choices.length]
          const bucket = continentBuckets[continent]
          return bucket[(seed >>> 3) % bucket.length] || null
        }
        const renderArcBuffer = () => {
          if (!globeRef.current) return
          const now = Date.now()
          renderedArcsRef.current = renderedArcsRef.current.filter((a) => (a.expiresAt || 0) > now)
          globeRef.current
            .arcsData(renderedArcsRef.current)
            .arcStartLat(d => d.startLat)
            .arcStartLng(d => d.startLng)
            .arcEndLat(d => d.endLat)
            .arcEndLng(d => d.endLng)
            .arcColor(d => d.kind === 'swap'
              ? ['rgba(245,158,11,0.55)', 'rgba(251,191,36,1.0)', 'rgba(245,158,11,0.65)']
              : ['rgba(234,179,8,0.48)', 'rgba(250,204,21,1.0)', 'rgba(234,179,8,0.58)'])
            .arcStroke(d => d.stroke)
            .arcAltitude(d => d.altitude)
            .arcDashLength(d => d.dashLength)
            .arcDashGap(d => d.dashGap)
            .arcDashInitialGap(d => d.dashInitialGap)
            .arcDashAnimateTime(d => d.animateTime)
        }

        const refreshMonadFeed = async () => {
          const feed = await fetchAusdTransfersAllChains(agora.chains, {
            blockWindow: 600,
            maxLogsPerChain: 120,
            maxChainsPerPoll: 0,
          })
          if (!alive) return
          setFeedInfo({ scannedChains: feed.scannedChains || 0 })
          for (const tx of feed.transfers || []) {
            const key = `${tx.chainId || 'x'}-${tx.txHash || ''}`
            if (!tx?.txHash || seenTxRef.current.has(key)) continue
            seenTxRef.current.add(key)
            if (seenTxRef.current.size > 500) {
              const first = seenTxRef.current.values().next().value
              if (first) seenTxRef.current.delete(first)
            }
            queueRef.current.push(tx)
          }
          if (queueRef.current.length > MAX_QUEUE) {
            queueRef.current.length = MAX_QUEUE
          }
        }

        const pickRotatingSource = (txHash, multiplierIndex) => {
          if (!nodes.length) return null
          const continents = Object.keys(continentBuckets).filter((c) => continentBuckets[c]?.length > 0)
          if (!continents.length) return null
          
          const rotationKey = `${txHash}:${multiplierIndex}`
          const continentIdx = (hashInt(rotationKey) + sourceRotationIndexRef.current) % continents.length
          const continent = continents[continentIdx]
          const bucket = continentBuckets[continent] || []
          if (!bucket.length) return null
          
          const nodeIdx = hashInt(`${rotationKey}:node`) % bucket.length
          return bucket[nodeIdx]
        }

        const tickTransfers = () => {
          if (!globeRef.current) return
          if (!queueRef.current.length) {
            renderArcBuffer()
            return
          }
          
          sourceRotationIndexRef.current = (sourceRotationIndexRef.current + 1) % 100
          
          const out = []
          const sourceEmission = new Map()
          const hotSourceIds = new Set()
          const limit = Math.min(ARC_BATCH_LIMIT, queueRef.current.length)
          
          for (let i = 0; i < limit; i++) {
            const tx = queueRef.current.shift()
            if (!tx) continue
            
            const realSource = nodeForAddress(tx.from)
            const realTarget = nodeForAddress(tx.to)
            if (!realSource || !realTarget) continue
            
            for (let m = 0; m < TRANSFER_MULTIPLIER; m++) {
              const seed1 = hashInt(`${tx.txHash || ''}:${tx.logIndex || 0}:a:${m}`)
              const seed2 = hashInt(`${tx.txHash || ''}:${tx.logIndex || 0}:b:${m}`)
              
              const useRotating = ((seed1 + m * 7) % 100) < (INTERCONTINENTAL_BIAS * 100)
              let a = useRotating ? pickRotatingSource(tx.txHash, m) : realSource
              if (!a) a = realSource
              
              const emitted = sourceEmission.get(a.id) || 0
              if (emitted >= MAX_ARCS_PER_SOURCE_PER_TICK) {
                a = pickRotatingSource(`${tx.txHash}:alt:${m}`, m + i * 13)
                if (!a || sourceEmission.get(a.id) >= MAX_ARCS_PER_SOURCE_PER_TICK) continue
              }
              
              const laneTargets = []
              for (let lane = 0; lane < MAX_UNIQUE_LANES_PER_TX; lane++) {
                const isIntercontinental = ((seed2 + lane * 11) % 100) < (INTERCONTINENTAL_BIAS * 100)
                const target = isIntercontinental 
                  ? pickCrossContinentNode(a, seed2 + lane * 17)
                  : pickSameContinentNode(a, seed2 + lane * 23)
                if (target && target.id !== a.id && !laneTargets.some((t) => t.id === target.id)) {
                  laneTargets.push(target)
                }
              }
              if (!laneTargets.length) laneTargets.push(realTarget)
              
              const b = laneTargets[m % laneTargets.length]
              if (!b || a.id === b.id) continue
              
              sourceEmission.set(a.id, (sourceEmission.get(a.id) || 0) + 1)
              hotSourceIds.add(a.id)

              const laneIndex = m % laneTargets.length
              const fromJ = anchoredCoord(a.lat, a.lon, seed1, laneIndex, laneTargets.length, 0.12)
              const toBase = anchoredCoord(b.lat, b.lon, seed2, laneIndex, laneTargets.length, 0.14)
              const toJ = jitterCoord(toBase.lat, toBase.lng, seed2, seed1, 0.11 + (laneIndex % 3) * 0.025)
              const geoDist = Math.hypot(toJ.lat - fromJ.lat, toJ.lng - fromJ.lng)
              const distNorm = Math.min(1, geoDist / 140)
              const altitudeRaw = (tx.kind === 'swap' ? 0.35 : 0.32) + distNorm * 0.22 + laneIndex * 0.018
              const altitude = Math.max(0.28, Math.min(0.58, altitudeRaw))
              const stroke = (tx.kind === 'swap' ? 0.55 : 0.45) + distNorm * 0.18 + laneIndex * 0.012
              const dashGap = (tx.kind === 'swap' ? 0.5 : 0.6) + laneIndex * 0.022
              const dashLength = 0.48 + laneIndex * 0.032
              const animateTime = 1800 + laneIndex * 180 + (m % 5) * 50
              const arc = {
                sourceId: a.id,
                startLat: fromJ.lat,
                startLng: fromJ.lng,
                endLat: toJ.lat,
                endLng: toJ.lng,
                amount: tx.amount,
                amountDisplay: tx.amountDisplay,
                kind: tx.kind,
                txHash: tx.txHash,
                blockNumber: tx.blockNumber,
                chainId: tx.chainId,
                chainName: tx.chainName,
                logIndex: tx.logIndex,
                altitude,
                stroke,
                dashGap,
                dashLength,
                animateTime,
                dashInitialGap: 0.5 + ((seed1 % 100) / 100) * 1.2,
                from: `${a.city}, ${a.country}`,
                to: `${b.city}, ${b.country}`,
                expiresAt: Date.now() + Math.max(3200, animateTime + 1400),
              }
              out.push(arc)
              if (!nodeArcSampleRef.current.has(a.id)) {
                nodeArcSampleRef.current.set(a.id, {
                  sourceId: a.id,
                  startLat: fromJ.lat,
                  startLng: fromJ.lng,
                  endLat: toJ.lat,
                  endLng: toJ.lng,
                  kind: tx.kind,
                  txHash: tx.txHash,
                  altitude,
                  stroke,
                  dashGap,
                  dashLength,
                  animateTime,
                  dashInitialGap: 0.45,
                })
              }
            }
          }
          if (!out.length) {
            renderArcBuffer()
            return
          }

          // Highlight nodes that are currently emitting transfers.
          for (const id of hotSourceIds) {
            if (nodeHighlightPendingSetRef.current.has(id)) continue
            nodeHighlightPendingSetRef.current.add(id)
            nodeHighlightQueueRef.current.push(id)
          }
          if (nodeHighlightQueueRef.current.length > 1200) {
            const keep = nodeHighlightQueueRef.current.slice(-900)
            nodeHighlightQueueRef.current = keep
            nodeHighlightPendingSetRef.current = new Set(keep)
          }

          renderedArcsRef.current.push(...out)
          if (renderedArcsRef.current.length > 2600) {
            renderedArcsRef.current = renderedArcsRef.current.slice(-1800)
          }
          renderArcBuffer()

          const uniqueRows = []
          const seen = new Set()
          for (const entry of out) {
            const k = `${entry.chainId || 'na'}:${entry.txHash || ''}:${entry.logIndex || 0}`
            if (seen.has(k)) continue
            seen.add(k)
            uniqueRows.push({
              key: k,
              chainId: entry.chainId,
              kind: entry.kind,
              amount: entry.amount || 0,
              amountDisplay: entry.amountDisplay || '',
              chainName: entry.chainName || 'Chain',
              txHash: entry.txHash || '',
              ts: Date.now(),
              expiresAt: Date.now() + FLOW_ROW_LIFETIME_MS,
            })
            if (uniqueRows.length >= FEED_APPEND_PER_TICK) break
          }
          if (uniqueRows.length) {
            uiFeedQueueRef.current.push(...uniqueRows)
            if (uiFeedQueueRef.current.length > MAX_UI_QUEUE) {
              uiFeedQueueRef.current = uiFeedQueueRef.current.slice(0, MAX_UI_QUEUE)
            }
          }
        }

        if (alive) setReady(true)

        // Do not block initial render on RPC responses.
        refreshMonadFeed().then(tickTransfers).catch(() => {})
        transfersTimerRef.current = window.setInterval(tickTransfers, ARC_TICK_MS)
        pollTimerRef.current = window.setInterval(() => {
          refreshMonadFeed().catch(() => {})
        }, FEED_POLL_MS)
        nodeHighlightTimerRef.current = window.setInterval(() => {
          const queue = nodeHighlightQueueRef.current
          if (!queue.length) return
          const lastId = lastHighlightedNodeIdRef.current
          const idx = queue.findIndex((id) => id !== lastId)
          if (idx < 0) return
          const [nextId] = queue.splice(idx, 1)
          nodeHighlightPendingSetRef.current.delete(nextId)
          const nextEl = nodeElsRef.current.get(nextId)
          if (!nextEl) return

          if (activeHighlightedNodeIdRef.current) {
            const prevEl = nodeElsRef.current.get(activeHighlightedNodeIdRef.current)
            if (prevEl) prevEl.classList.remove('aw3-node-hot')
          }
          if (activeHighlightedNodeTimeoutRef.current) {
            window.clearTimeout(activeHighlightedNodeTimeoutRef.current)
            activeHighlightedNodeTimeoutRef.current = 0
          }

          const sample = nodeArcSampleRef.current.get(nextId)
          if (sample) {
            const seed = hashInt(`${sample.txHash || ''}:${Date.now()}:${nextId}`)
            renderedArcsRef.current.push({
              ...sample,
              dashInitialGap: 0.2 + ((seed % 100) / 100) * 0.8,
              stroke: (sample.stroke || 0.24) + 0.15,
              altitude: (sample.altitude || 0.2) + 0.06,
              animateTime: Math.max(1200, (sample.animateTime || 1800) - 200),
              expiresAt: Date.now() + Math.max(2400, NODE_HIGHLIGHT_ON_MS + 800),
            })
            if (renderedArcsRef.current.length > 2600) {
              renderedArcsRef.current = renderedArcsRef.current.slice(-1800)
            }
            renderArcBuffer()
          }

          nextEl.classList.add('aw3-node-hot')
          activeHighlightedNodeIdRef.current = nextId
          lastHighlightedNodeIdRef.current = nextId
          activeHighlightedNodeTimeoutRef.current = window.setTimeout(() => {
            const target = nodeElsRef.current.get(nextId)
            if (target) target.classList.remove('aw3-node-hot')
            if (activeHighlightedNodeIdRef.current === nextId) {
              activeHighlightedNodeIdRef.current = ''
            }
            activeHighlightedNodeTimeoutRef.current = 0
          }, NODE_HIGHLIGHT_ON_MS)
        }, NODE_HIGHLIGHT_TICK_MS)
        uiFeedTimerRef.current = window.setInterval(() => {
          const next = uiFeedQueueRef.current.shift()
          if (!next) return
          setOnchainFeed((prev) => {
            if (prev.some((row) => row.key === next.key)) return prev
            return [next, ...prev].slice(0, FEED_MAX_ROWS)
          })
        }, UI_FEED_TICK_MS)
        return () => {
          window.removeEventListener('resize', resize)
        }
      } catch (e) {
        setError(e?.message || 'Failed to load AGORA world')
      }
    }

    let cleanup
    boot().then(c => { cleanup = c })
    return () => {
      alive = false
      if (cleanup) cleanup()
      clearTimers()
      if (globeRef.current && globeRef.current._destructor) globeRef.current._destructor()
      globeRef.current = null
    }
  }, [])

  const zoomIntervalRef = useRef(0)

  const zoom = (direction) => {
    if (!globeRef.current) return
    const pov = globeRef.current.pointOfView()
    const currentAlt = pov.altitude || 1.8
    const factor = direction < 0 ? 0.88 : 1.12
    const alt = Math.min(12, Math.max(0.16, currentAlt * factor))
    globeRef.current.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: alt }, 100)
  }

  const startZoom = (direction) => {
    if (zoomIntervalRef.current) return
    zoom(direction)
    zoomIntervalRef.current = window.setInterval(() => zoom(direction), 70)
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

  const reset = () => {
    if (!globeRef.current) return
    globeRef.current.pointOfView({ lat: 18, lng: 20, altitude: 1.8 }, 700)
  }

  if (error) return <div className="aw3 aw3-center">{error}</div>

  return (
    <div className="aw3">
      <div className="aw3-globe" ref={containerRef} />
      {!ready && <div className="aw3-center">Loading AGORA World 3D...</div>}

      <header className="aw3-bar">
        <div className="aw3-title-wrap">
          {meta.logo && <img src={meta.logo} alt="" className="aw3-logo" />}
          <span className="aw3-title">AGORA Visualization 3D</span>
        </div>
      </header>

      <div className="aw3-zoom">
        <button 
          className="aw3-btn" 
          onPointerDown={() => startZoom(-1)}
          onPointerUp={stopZoom}
          onPointerLeave={stopZoom}
          aria-label="Zoom in"
        >+</button>
        <button 
          className="aw3-btn" 
          onPointerDown={() => startZoom(1)}
          onPointerUp={stopZoom}
          onPointerLeave={stopZoom}
          aria-label="Zoom out"
        >-</button>
        <button className="aw3-btn" onClick={reset} aria-label="Reset">◉</button>
        <button className="aw3-btn"
          onMouseEnter={() => { import('./AgoraWorldPage').catch(() => {}) }}
          onFocus={() => { import('./AgoraWorldPage').catch(() => {}) }}
          onClick={() => navigate('/agora-world')} aria-label="Switch to AGORA 2D">2D</button>
        <button className="aw3-btn" onClick={() => navigate('/')} aria-label="Home">⌂</button>
      </div>

      {hovered && (
        <div className="aw3-tooltip">
          <strong>{hovered.city}, {hovered.country}</strong>
          <span>{hovered.chainCount > 0 ? `${hovered.chainCount} chain mapping` : 'City node'}</span>
        </div>
      )}

      {selected && (
        <aside className="aw3-card">
          <button className="aw3-close" onClick={() => setSelected(null)} aria-label="Close">×</button>
          <h3>{selected.city}, {selected.country}</h3>
          <p>Live AUSD transfer/swap arcs are mapped to distributed city hubs.</p>
          <div className="aw3-links">
            <a href="https://www.coingecko.com/tr/coins/agora-dollar" target="_blank" rel="noreferrer">CoinGecko</a>
            <a href="https://www.agora.finance/" target="_blank" rel="noreferrer">Agora</a>
            <a href="https://defillama.com/stablecoin/agora-dollar" target="_blank" rel="noreferrer">DefiLlama</a>
            <a href="https://chainlist.org/" target="_blank" rel="noreferrer">ChainList</a>
          </div>
        </aside>
      )}

      <aside className="aw3-chainlist">
        <div className="aw3-chainlist-title">AUSD On-Chain Flow</div>
        <div className="aw3-chainlist-inner" ref={feedContainerRef}>
          {onchainFeed.map((row) => (
            <div className="aw3-chainfeed-row" key={row.key}>
              <span className={`aw3-kind ${row.kind === 'swap' ? 'aw3-kind-swap' : 'aw3-kind-transfer'}`}>
                {row.kind.toUpperCase()}
              </span>
              <span>{formatAmountForUi(row.amountDisplay, row.amount)} {meta.symbol}</span>
              {chainLogoFromRow(row) ? (
                <img
                  src={chainLogoFromRow(row)}
                  alt={row.chainName || 'Chain'}
                  className="aw3-chain-logo"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              ) : (
                <span className="aw3-chain-logo-fb">{(row.chainName || 'C').slice(0, 1).toUpperCase()}</span>
              )}
              <span className="aw3-hash">{row.txHash ? `${row.txHash.slice(0, 10)}...${row.txHash.slice(-8)}` : '—'}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
