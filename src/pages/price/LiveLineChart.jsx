import React, { useCallback, useEffect, useRef } from 'react'
import { LINE_SMOOTH_ALPHA, LINE_TICK_MS, SNAKE_POINTS } from './constants'
import { drawLiveLine } from './drawLiveLine'
import './chart.css'

const PHASE_STEP = (LINE_TICK_MS / 1000) * 2.4
const MAX_DPR = 2

/**
 * The realtime price line.
 *
 * This component owns the only hot loop on the page: every `LINE_TICK_MS` it
 * samples `priceRef` (written synchronously by each websocket message), eases
 * the rendered value toward it, and repaints the canvas. Nothing here goes
 * through React state, so tick cadence is independent of render pressure.
 *
 * @param {{ priceRef: React.MutableRefObject<number | null>, watermark?: string }} props
 */
export default function LiveLineChart({ priceRef, watermark = 'MON' }) {
  const shellRef = useRef(null)
  const canvasRef = useRef(null)
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const valuesRef = useRef([])
  const smoothedRef = useRef(null)
  const phaseRef = useRef(0)
  const logoRef = useRef(null)
  const visibleRef = useRef(false)

  const paint = useCallback(() => {
    if (!visibleRef.current || document.hidden) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { w, h, dpr } = sizeRef.current
    drawLiveLine(ctx, {
      values: valuesRef.current,
      w,
      h,
      dpr,
      phase: phaseRef.current,
      logo: logoRef.current,
    })
  }, [])

  const syncSize = useCallback(() => {
    const canvas = canvasRef.current
    const shell = shellRef.current
    if (!canvas || !shell) return false
    const w = shell.clientWidth
    const h = shell.clientHeight
    visibleRef.current = w > 0 && h > 0
    if (!w || !h) return false

    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
    sizeRef.current = { w, h, dpr }
    canvas.width = Math.max(1, Math.floor(w * dpr))
    canvas.height = Math.max(1, Math.floor(h * dpr))
    return true
  }, [])

  useEffect(() => {
    syncSize()
    paint()
    const shell = shellRef.current
    if (!shell || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      if (syncSize()) paint()
    })
    observer.observe(shell)
    return () => observer.disconnect()
  }, [paint, syncSize])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden && syncSize()) paint()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [paint, syncSize])

  useEffect(() => {
    const img = new Image()
    img.src = '/monad_logo.png'
    img.onload = () => {
      logoRef.current = img
      paint()
    }
    img.onerror = () => { logoRef.current = null }
  }, [paint])

  // The hot loop. Advances on its own clock so the line keeps moving even in a
  // quiet market, always tracking the newest known price. Sampling continues
  // while the mobile chart tab is hidden; paint skips invisible canvases.
  useEffect(() => {
    let cancelled = false

    const tick = () => {
      if (cancelled) return
      const target = priceRef.current
      if (!Number.isFinite(target)) return

      if (!Number.isFinite(smoothedRef.current)) {
        smoothedRef.current = target
      } else {
        smoothedRef.current += (target - smoothedRef.current) * LINE_SMOOTH_ALPHA
      }

      const next = smoothedRef.current
      const values = valuesRef.current
      if (!values.length) {
        valuesRef.current = Array.from({ length: SNAKE_POINTS }, () => next)
      } else {
        values.push(next)
        if (values.length > SNAKE_POINTS) values.shift()
      }

      phaseRef.current += PHASE_STEP
      paint()
    }

    const timer = window.setInterval(tick, LINE_TICK_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [paint, priceRef])

  return (
    <div ref={shellRef} className="pr-chart-shell">
      <div className="pr-chart-watermark" aria-hidden="true">
        <span className="pr-chart-watermark__pair">{watermark}</span>
        <span className="pr-chart-watermark__sub">/ USD</span>
      </div>
      <canvas ref={canvasRef} className="pr-chart-canvas" aria-hidden="true" />
    </div>
  )
}
