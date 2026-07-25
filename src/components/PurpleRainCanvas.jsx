import React, {
  useEffect,
  useRef,
  useMemo,
  useCallback
} from 'react'
import { useMonad } from '../contexts/MonadContext'
import './PurpleRainCanvas.css'

// Global image cache to avoid re-loading drop sprites
const imageCache = new Map()
const imageLoadPromises = new Map()

const PurpleRainCanvas = () => {
  const { transactions, stats, isConnected, connectionStatus } = useMonad()

  const containerRef = useRef(null)
  const dropCounterRef = useRef(0)
  const activeDropsRef = useRef(new Set())
  const pendingDropsRef = useRef([])
  const processedTxHashesRef = useRef(new Set())
  const pendingTimersRef = useRef(new Set())

  const imagesPreloadedRef = useRef(false)
  const smoothedTpsRef = useRef(0)
  const spawnAccumulatorRef = useRef(0)

  // Keep latest values in refs so animation loop doesn't re-render
  const statsRef = useRef(stats)
  const isConnectedRef = useRef(isConnected)
  const connectionStatusRef = useRef(connectionStatus)

  useEffect(() => {
    statsRef.current = stats
    isConnectedRef.current = isConnected
    connectionStatusRef.current = connectionStatus
  }, [stats, isConnected, connectionStatus])

  // Category → sprite mapping
  const categoryImages = useMemo(
    () => ({
      defi: '/drops/defi.png',
      nft: '/drops/nft.png',
      transfer: '/drops/transfer.png',
      contractCall: '/drops/contract-call.png',
      contractDeploy: '/drops/contract-deploy.png',
      other: '/drops/other.png'
    }),
    []
  )

  const categoryColors = useMemo(
    () => ({
      defi: '#00FFCC',
      nft: '#FF6496',
      transfer: '#64C8FF',
      contractCall: '#9664FF',
      contractDeploy: '#64FF96',
      other: '#FFC864'
    }),
    []
  )

  const preloadImage = useCallback((src) => {
    if (imageCache.has(src)) {
      return Promise.resolve(imageCache.get(src))
    }

    if (imageLoadPromises.has(src)) {
      return imageLoadPromises.get(src)
    }

    const promise = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        imageCache.set(src, img)
        resolve(img)
      }
      img.onerror = () => resolve(null)
      img.src = src
    })

    imageLoadPromises.set(src, promise)
    return promise
  }, [])

  // Preload all sprites once
  useEffect(() => {
    if (imagesPreloadedRef.current) return

    const preloadAll = async () => {
      const promises = Object.values(categoryImages).map(preloadImage)
      await Promise.all(promises)
      imagesPreloadedRef.current = true
    }

    preloadAll()
  }, [categoryImages, preloadImage])

  const getImageForCategory = useCallback(
    (category) => categoryImages[category] || categoryImages.other,
    [categoryImages]
  )

  const getColorForCategory = useCallback(
    (category) => categoryColors[category] || '#8B5CF6',
    [categoryColors]
  )

  // Create a single transaction-based raindrop (with tiny random jitter)
  const createTransactionRainDrop = useCallback(
    (tx) => {
      if (!tx || !tx.hash) return

      const category = tx.category || 'other'
      const value = Number.parseFloat(tx.value || 0) || 0
      const gasPrice = Number.parseFloat(tx.gasPrice || 0) || 0

      // Value → size / glow / speed
      let sizeMultiplier = 1
      let glowIntensity = 2
      let speedMultiplier = 1.0
      let dropCount = 1

      if (value > 10) {
        sizeMultiplier = 1.6
        glowIntensity = 5
        speedMultiplier = 0.8
        dropCount = 2
      } else if (value > 5) {
        sizeMultiplier = 1.4
        glowIntensity = 4
        speedMultiplier = 0.9
        dropCount = 2
      } else if (value > 1) {
        sizeMultiplier = 1.2
        glowIntensity = 3
        speedMultiplier = 1.0
      }

      // Gas price → extra glow/size
      if (gasPrice > 50) {
        glowIntensity += 1
        sizeMultiplier += 0.1
      }

      // Category-specific flavour
      const categoryProps = {
        defi: { speedMultiplier: 0.9, glowBonus: 1 },
        nft: { speedMultiplier: 1.1, glowBonus: 0.5 },
        transfer: { speedMultiplier: 1.0, glowBonus: 0 },
        contractCall: { speedMultiplier: 0.8, glowBonus: 0.5 },
        contractDeploy: { speedMultiplier: 0.7, glowBonus: 2 },
        other: { speedMultiplier: 1.0, glowBonus: 0 }
      }

      const props = categoryProps[category] || categoryProps.other
      speedMultiplier *= props.speedMultiplier
      glowIntensity += props.glowBonus

      // Keep per-tx drops small for stability
      dropCount = Math.min(dropCount, 2)

      for (let i = 0; i < dropCount; i++) {
        const spawnDelay = Math.random() * 280 + i * 40

        const spawnTimer = window.setTimeout(() => {
          pendingTimersRef.current.delete(spawnTimer)
          const container = containerRef.current
          if (!container || !imagesPreloadedRef.current) return

          const smoothedTps =
            smoothedTpsRef.current || statsRef.current?.currentTps || 0
          const maxActiveDrops = Math.max(
            10,
            Math.min(90, Math.round((smoothedTps || 10) * 1.5))
          )
          if (activeDropsRef.current.size >= maxActiveDrops) return

          const dropId = `tx-drop-${tx.hash}-${i}-${dropCounterRef.current++}`
          const color = getColorForCategory(category)
          const imageSrc = getImageForCategory(category)

          const screenWidth =
            window.innerWidth ||
            document.documentElement.clientWidth ||
            1280

          const x =
            Math.random() * (screenWidth - 200) +
            100 +
            (i * 30 - (dropCount - 1) * 15)

          const startY = -80 - Math.random() * 40 - i * 20

          const baseSize = 12
          const size = Math.max(
            8,
            baseSize * sizeMultiplier + Math.random() * 4
          )

          const baseDuration = 1.8
          const duration =
            baseDuration / speedMultiplier + Math.random() * 0.6
          const animationDelay = Math.random() * 0.4

          const dropElement = document.createElement('img')
          const cachedImage = imageCache.get(imageSrc)
          dropElement.src = cachedImage ? cachedImage.src : imageSrc

          dropElement.className = 'html-raindrop-optimized'
          dropElement.loading = 'eager'
          dropElement.decoding = 'async'

          const glowSize =
            glowIntensity * (1 + Math.min(value / 10, 2))
          const glowOpacity = Math.min(
            0.9,
            0.3 + Math.min(value / 20, 0.6)
          )

          const alphaHex = Math.round(glowOpacity * 255)
            .toString(16)
            .padStart(2, '0')

          dropElement.style.cssText = `
            position:absolute;
            left:${x}px;
            top:${startY}px;
            width:${size}px;
            height:${size}px;
            filter:drop-shadow(0 0 ${glowSize}px ${color}${alphaHex});
            animation:rainFallUltra ${duration}s linear ${animationDelay.toFixed(
              3
            )}s forwards;
            will-change:transform;
            transform:translate3d(0,0,0);
            contain:layout style paint;
            z-index:${Math.floor(glowIntensity)};
          `

          container.appendChild(dropElement)
          activeDropsRef.current.add(dropId)

          const removeTimer = window.setTimeout(() => {
            pendingTimersRef.current.delete(removeTimer)
            if (dropElement.parentNode) {
              dropElement.parentNode.removeChild(dropElement)
              activeDropsRef.current.delete(dropId)
            }
          }, (duration + animationDelay) * 1000)
          pendingTimersRef.current.add(removeTimer)
        }, spawnDelay)
        pendingTimersRef.current.add(spawnTimer)
      }
    },
    [getImageForCategory, getColorForCategory]
  )

  // Periodic cleanup for any orphaned drops
  useEffect(() => {
    const cleanupInterval = window.setInterval(() => {
      const container = containerRef.current
      if (!container) return

      const drops = container.querySelectorAll('.html-raindrop-optimized')
      if (drops.length > 140) {
        const removeCount = Math.floor(drops.length * 0.25)
        for (let i = 0; i < removeCount; i++) {
          drops[i]?.remove()
        }
        activeDropsRef.current = new Set()
      }
    }, 3000)

    return () => {
      window.clearInterval(cleanupInterval)
      // Clear all pending spawn/remove timers on unmount
      for (const timerId of pendingTimersRef.current) {
        window.clearTimeout(timerId)
      }
      pendingTimersRef.current.clear()
      // Remove all remaining drop elements
      const container = containerRef.current
      if (container) {
        const remaining = container.querySelectorAll('.html-raindrop-optimized')
        remaining.forEach(el => el.remove())
      }
      activeDropsRef.current = new Set()
    }
  }, [])

  // Live transactions → pending queue (havuz)
  useEffect(() => {
    if (!isConnectedRef.current) return
    if (connectionStatusRef.current !== 'connected') return
    if (!transactions || !transactions.length) return

    transactions.forEach((tx) => {
      if (!tx || !tx.hash) return
      if (processedTxHashesRef.current.has(tx.hash)) return

      processedTxHashesRef.current.add(tx.hash)

      // Limit hash set size
      if (processedTxHashesRef.current.size > 1200) {
        const hashes = Array.from(processedTxHashesRef.current)
        const toDelete = hashes.slice(0, 600)
        toDelete.forEach((h) => processedTxHashesRef.current.delete(h))
      }

      pendingDropsRef.current.push(tx)

      // Cap pending queue size
      if (pendingDropsRef.current.length > 1200) {
        pendingDropsRef.current.splice(
          0,
          pendingDropsRef.current.length - 1200
        )
      }
    })
  }, [transactions])

  // Smooth, frame-based spawn loop tied to TPS
  useEffect(() => {
    let animationFrameId = null
    let lastTimestamp =
      typeof performance !== 'undefined' ? performance.now() : Date.now()

    const spawnLoop = (timestamp) => {
      const container = containerRef.current
      if (!container || !imagesPreloadedRef.current) {
        animationFrameId = window.requestAnimationFrame(spawnLoop)
        return
      }

      const now =
        typeof timestamp === 'number'
          ? timestamp
          : typeof performance !== 'undefined'
          ? performance.now()
          : Date.now()

      const deltaSeconds = Math.max(0, (now - lastTimestamp) / 1000)
      lastTimestamp = now

      // Soft TPS smoothing
      const rawTps = statsRef.current?.currentTps || 0
      const prevSmoothed = smoothedTpsRef.current || 0
      const alpha = 0.25
      const smoothed =
        prevSmoothed === 0 ? rawTps : prevSmoothed * (1 - alpha) + rawTps * alpha
      smoothedTpsRef.current = smoothed

      const queueSize = pendingDropsRef.current.length

      if (queueSize > 0) {
        let targetPerSecond = Math.max(2, smoothed || 5)
        const maxFromQueue =
          queueSize > 0 ? queueSize / 1.8 : targetPerSecond // ~1.8s buffer
        targetPerSecond = Math.min(targetPerSecond, maxFromQueue)

        const expectedThisFrame = targetPerSecond * deltaSeconds
        spawnAccumulatorRef.current += expectedThisFrame

        const maxActiveDrops = Math.max(
          10,
          Math.min(90, Math.round((smoothed || 10) * 1.5))
        )
        const activeCount = activeDropsRef.current.size
        const availableSlots = Math.max(0, maxActiveDrops - activeCount)

        let spawnCount = Math.floor(spawnAccumulatorRef.current)
        const perFrameCap = smoothed > 40 ? 3 : 2

        spawnCount = Math.min(
          spawnCount,
          availableSlots,
          pendingDropsRef.current.length,
          perFrameCap
        )

        if (spawnCount > 0) {
          spawnAccumulatorRef.current -= spawnCount

          for (let i = 0; i < spawnCount; i++) {
            const tx = pendingDropsRef.current.shift()
            if (tx) {
              createTransactionRainDrop(tx)
            }
          }
        }
      }

      animationFrameId = window.requestAnimationFrame(spawnLoop)
    }

    animationFrameId = window.requestAnimationFrame(spawnLoop)

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }
    }
  }, [createTransactionRainDrop])

  return (
    <div className="purple-rain-canvas">
      <div className="css-background">
        <div className="gradient-bg"></div>
        <div className="stars-bg"></div>
      </div>

      <div
        ref={containerRef}
        className="raindrops-container"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          pointerEvents: 'none'
        }}
      />
    </div>
  )
}

export default PurpleRainCanvas
