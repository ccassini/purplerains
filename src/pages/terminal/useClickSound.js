import { useCallback, useEffect, useRef, useState } from 'react'
import { SOUND_TIERS } from './constants'

export function useClickSound() {
  const [enabled, setEnabled] = useState(false)
  const playRef = useRef(null)
  const audioCtxRef = useRef(null)

  const toggle = useCallback(() => setEnabled((s) => !s), [])

  useEffect(() => {
    if (!enabled) {
      playRef.current = null
      return undefined
    }

    playRef.current = (usd) => {
      const n = Number(usd)
      if (!Number.isFinite(n)) return
      const tier = SOUND_TIERS.find((t) => n >= t.min)
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
        // Sound is optional.
      }
    }

    return () => {
      playRef.current = null
    }
  }, [enabled])

  return { enabled, toggle, playRef }
}
