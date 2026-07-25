import React, { useEffect, useRef } from 'react'
import './MeteorShower.css'

// Lightweight canvas-based meteor shower that burns up before reaching the orbiting logos
const randomRange = (min, max) => min + Math.random() * (max - min)

function MeteorShower({
  burnRadiusRatio = 0.44, // fraction of the smallest dimension where meteors fully burn
  spawnInterval = 400, // fixed ms between spawns
  maxMeteors = 16
}) {
  const canvasRef = useRef(null)
  const animationRef = useRef(null)
  const lastTimeRef = useRef(0)
  const sizeRef = useRef({ width: 0, height: 0 })
  const meteorsRef = useRef([])
  const spawnTimerRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })

    const dpr = window.devicePixelRatio || 1

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      sizeRef.current = { width: rect.width, height: rect.height }

      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas.parentElement)

    const spawnMeteor = () => {
      const { width, height } = sizeRef.current
      if (!width || !height) return
      if (meteorsRef.current.length >= maxMeteors) return

      const minDim = Math.min(width, height)
      const cx = width / 2
      const cy = height / 2
      const margin = minDim * 0.08

      // Choose a random spawn edge (slightly offscreen)
      const edges = ['top', 'right', 'bottom', 'left']
      const edge = edges[Math.floor(Math.random() * edges.length)]

      let x
      let y
      switch (edge) {
        case 'top':
          x = randomRange(-margin, width + margin)
          y = -margin * 1.5
          break
        case 'right':
          x = width + margin * 1.5
          y = randomRange(-margin, height + margin)
          break
        case 'bottom':
          x = randomRange(-margin, width + margin)
          y = height + margin * 1.5
          break
        default:
          x = -margin * 1.5
          y = randomRange(-margin, height + margin)
          break
      }

      // Aim roughly toward the center but allow drift so they graze the outer rings
      const jitter = minDim * 0.08 * (Math.random() - 0.5)
      const angle = Math.atan2(cy - y + jitter, cx - x + jitter)

      const depth = randomRange(0.65, 1.15) // <1 is further, >1 is nearer
      const speed = randomRange(minDim * 0.32, minDim * 0.52) * (0.75 + depth * 0.35) // px per second
      const length = randomRange(minDim * 0.07, minDim * 0.11) * (0.7 + depth * 0.45)
      const thickness = randomRange(2, 3.4) * (0.8 + depth * 0.35)

      const fadeDistance = Math.min(width, height) * burnRadiusRatio * randomRange(0.94, 1.06)

      meteorsRef.current.push({
        x,
        y,
        angle,
        speed,
        length,
        thickness,
        opacity: 1,
        burning: false,
        fadeDistance,
        hueShift: randomRange(-8, 12),
        depth,
        tail: []
      })
    }

    const update = (deltaMs) => {
      const { width, height } = sizeRef.current
      const cx = width / 2
      const cy = height / 2
      const burnRadius = Math.min(width, height) * burnRadiusRatio

      // Spawn control
      spawnTimerRef.current += deltaMs
      while (spawnTimerRef.current >= spawnInterval) {
        spawnTimerRef.current -= spawnInterval
        spawnMeteor()
      }

      const nextMeteors = []

      for (const m of meteorsRef.current) {
        const dt = deltaMs / 1000
        m.x += Math.cos(m.angle) * m.speed * dt
        m.y += Math.sin(m.angle) * m.speed * dt
        m.tail.push({ x: m.x, y: m.y })
        if (m.tail.length > 6) m.tail.shift()

        const distToCenter = Math.hypot(m.x - cx, m.y - cy)

        if (!m.burning && distToCenter <= m.fadeDistance) {
          m.burning = true
        }

        if (m.burning) {
          m.opacity -= deltaMs * 0.0018
          m.speed *= 0.984
          m.length *= 0.97
        }

        const offscreen =
          m.opacity <= 0 ||
          distToCenter <= burnRadius * 0.88 ||
          m.x < -width * 0.25 ||
          m.x > width * 1.25 ||
          m.y < -height * 0.25 ||
          m.y > height * 1.25

        if (!offscreen) nextMeteors.push(m)
      }

      meteorsRef.current = nextMeteors
    }

    // Cache the atmosphere ring gradient (recreated only on resize)
    let ringGradCache = null
    let lastRingWidth = 0
    let lastRingHeight = 0

    const draw = () => {
      const { width, height } = sizeRef.current
      ctx.clearRect(0, 0, width, height)

      const ringRadius = Math.min(width, height) * burnRadiusRatio

      // Reuse ring gradient unless dimensions changed
      if (!ringGradCache || width !== lastRingWidth || height !== lastRingHeight) {
        ringGradCache = ctx.createRadialGradient(
          width / 2, height / 2, ringRadius * 0.9,
          width / 2, height / 2, ringRadius * 1.1
        )
        ringGradCache.addColorStop(0, 'rgba(130, 90, 255, 0)')
        ringGradCache.addColorStop(0.7, 'rgba(130, 90, 255, 0.06)')
        ringGradCache.addColorStop(1, 'rgba(30, 20, 60, 0)')
        lastRingWidth = width
        lastRingHeight = height
      }

      ctx.fillStyle = ringGradCache
      ctx.beginPath()
      ctx.arc(width / 2, height / 2, ringRadius * 1.1, 0, Math.PI * 2)
      ctx.fill()

      for (const m of meteorsRef.current) {
        const tailOpacity = Math.max(0, m.opacity)

        if (m.tail && m.tail.length > 1) {
          ctx.save()
          ctx.globalCompositeOperation = 'lighter'
          ctx.lineWidth = m.thickness * (0.85 + m.depth * 0.35)
          const oldest = m.tail[0]
          const newest = m.tail[m.tail.length - 1]
          const trail = ctx.createLinearGradient(oldest.x, oldest.y, newest.x, newest.y)
          trail.addColorStop(0, `rgba(90, 150, 255, 0)`)
          trail.addColorStop(0.55, `rgba(140, 190, 255, ${0.2 * tailOpacity})`)
          trail.addColorStop(1, `rgba(255, 200, 180, ${0.65 * tailOpacity})`)
          ctx.strokeStyle = trail
          ctx.beginPath()
          ctx.moveTo(oldest.x, oldest.y)
          for (const p of m.tail) ctx.lineTo(p.x, p.y)
          ctx.stroke()
          ctx.restore()
        }

        ctx.save()
        ctx.translate(m.x, m.y)
        ctx.rotate(m.angle)

        // Pre-compute blur once per meteor depth (avoid changing ctx.filter every frame)
        const blurPx = Math.max(0, (1.5 - m.depth) * 1.1)
        if (blurPx > 0.1) {
          ctx.filter = `blur(${blurPx.toFixed(1)}px)`
        }

        const length = Math.max(18, m.length)
        const headRadius = Math.max(3, m.thickness * 1.6)

        const tail = ctx.createLinearGradient(-length, 0, headRadius * 1.4, 0)
        tail.addColorStop(0, `rgba(105, 165, 255, 0)`)
        tail.addColorStop(0.5, `rgba(120, 210, 255, ${0.22 * tailOpacity})`)
        tail.addColorStop(1, `rgba(255, 195, 170, ${0.95 * tailOpacity})`)

        ctx.lineWidth = m.thickness
        ctx.strokeStyle = tail
        ctx.beginPath()
        ctx.moveTo(-length, 0)
        ctx.lineTo(headRadius * 1.2, 0)
        ctx.stroke()

        const head = ctx.createRadialGradient(0, 0, headRadius * 0.4, 0, 0, headRadius * 1.6)
        const burnTint = m.burning ? '255, 184, 122' : '170, 140, 255'
        head.addColorStop(0, `rgba(${burnTint}, ${0.95 * tailOpacity})`)
        head.addColorStop(0.55, `rgba(${burnTint}, ${0.6 * tailOpacity})`)
        head.addColorStop(1, 'rgba(255, 255, 255, 0)')

        ctx.fillStyle = head
        ctx.beginPath()
        ctx.arc(0, 0, headRadius, 0, Math.PI * 2)
        ctx.fill()

        ctx.restore()
      }
    }

    const loop = (timestamp) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const delta = Math.min(48, timestamp - lastTimeRef.current)
      lastTimeRef.current = timestamp

      update(delta)
      draw()

      animationRef.current = window.requestAnimationFrame(loop)
    }

    animationRef.current = window.requestAnimationFrame(loop)

    return () => {
      window.cancelAnimationFrame(animationRef.current)
      observer.disconnect()
      meteorsRef.current = []
    }
  }, [burnRadiusRatio, maxMeteors, spawnInterval])

  return <canvas ref={canvasRef} className="meteor-shower-canvas" aria-hidden="true" />
}

export default MeteorShower
