import { useCallback, useEffect, useRef, useState } from 'react'

const TIER_HZ = [
  { min: 1_000_000, hz: 880 },
  { min: 250_000, hz: 660 },
  { min: 100_000, hz: 440 },
]

/**
 * Optional audio ping for large trades. Returns a ref the (hot) trade path can
 * call without re-subscribing, so enabling sound never touches the feed wiring.
 *
 * @returns {{ enabled: boolean, toggle: () => void, playRef: React.MutableRefObject<((notional: number) => void) | null> }}
 */
export function useTradeSound() {
  const [enabled, setEnabled] = useState(false)
  const playRef = useRef(null)
  const audioCtxRef = useRef(null)

  const toggle = useCallback(() => setEnabled((s) => !s), [])

  useEffect(() => {
    if (!enabled) {
      playRef.current = null
      return undefined
    }

    let active = true
    playRef.current = (notional) => {
      if (!active) return
      const tier = TIER_HZ.find((t) => notional >= t.min)
      if (!tier) return
      try {
        if (!audioCtxRef.current) {
          const Ctx = window.AudioContext || window.webkitAudioContext
          audioCtxRef.current = new Ctx()
        }
        const ctx = audioCtxRef.current
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = tier.hz
        gain.gain.value = 0.05
        osc.start()
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
        osc.stop(ctx.currentTime + 0.12)
      } catch {
        // Audio is a nicety; never let it break the feed.
      }
    }

    return () => {
      active = false
      playRef.current = null
      const context = audioCtxRef.current
      audioCtxRef.current = null
      try { context?.close()?.catch(() => {}) } catch { /* already released */ }
    }
  }, [enabled])

  return { enabled, toggle, playRef }
}
