import { useEffect, useRef, useState } from 'react'

/**
 * Minimum gap between flash restarts. Trades arrive far faster than the 600ms
 * flash animation, so restarting per trade meant the animation never played —
 * the price just sat tinted. Sampling the direction over a window makes each
 * flash legible and cuts one re-render per trade.
 */
const FLASH_SAMPLE_MS = 140
const FLASH_CLEAR_MS = 700

/**
 * Derived display state for the live price: flash direction and session extent.
 *
 * @param {number | null} price
 * @returns {{ flash: { dir: string, n: number }, sessionRange: { high: number, low: number, pos: number } | null }}
 */
export function usePriceTelemetry(price) {
  const [flash, setFlash] = useState({ dir: '', n: 0 })
  const [range, setRange] = useState(null)

  const windowOpenPriceRef = useRef(null)
  const sampleTimerRef = useRef(null)
  const clearTimerRef = useRef(null)

  useEffect(() => {
    if (!Number.isFinite(price)) return

    // Session high/low — only re-renders on an actual new extreme.
    setRange((prev) => {
      if (!prev) return { high: price, low: price }
      if (price > prev.high) return { high: price, low: prev.low }
      if (price < prev.low) return { high: prev.high, low: price }
      return prev
    })

    if (!Number.isFinite(windowOpenPriceRef.current)) {
      windowOpenPriceRef.current = price
      return
    }
    if (sampleTimerRef.current) return

    sampleTimerRef.current = window.setTimeout(() => {
      sampleTimerRef.current = null
      const open = windowOpenPriceRef.current
      const close = price
      windowOpenPriceRef.current = close
      if (!Number.isFinite(open) || open === close) return

      setFlash((p) => ({ dir: close > open ? 'up' : 'down', n: p.n + 1 }))
      if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current)
      clearTimerRef.current = window.setTimeout(
        () => setFlash((p) => ({ ...p, dir: '' })),
        FLASH_CLEAR_MS,
      )
    }, FLASH_SAMPLE_MS)
  }, [price])

  useEffect(() => () => {
    if (sampleTimerRef.current) window.clearTimeout(sampleTimerRef.current)
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current)
  }, [])

  const sessionRange = range && Number.isFinite(price) && range.high > range.low
    ? {
      high: range.high,
      low: range.low,
      pos: Math.max(0, Math.min(100, ((price - range.low) / (range.high - range.low)) * 100)),
    }
    : null

  return { flash, sessionRange }
}
