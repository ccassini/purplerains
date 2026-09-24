import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// This hook only registers one effect. Capture that boundary without a DOM renderer
// so the real audio creation/playback/cleanup closures run against a fake audio device.
const effects = vi.hoisted(() => [])
vi.mock('react', () => ({
  useCallback: fn => fn,
  useEffect: fn => { effects.push(fn) },
  useRef: current => ({ current }),
  useState: () => [true, vi.fn()],
}))
import { useTradeSound } from '../useTradeSound'

let contexts
let cleanup
beforeEach(() => {
  contexts = []
  vi.stubGlobal('window', { AudioContext: class {
    constructor() {
      this.close = vi.fn(async () => {})
      this.currentTime = 0
      contexts.push(this)
    }
    createOscillator() { return { connect() {}, frequency: {}, start() {}, stop() {} } }
    createGain() { return { connect() {}, gain: { exponentialRampToValueAtTime() {} } } }
  } })
})
afterEach(() => { cleanup?.(); cleanup = null; effects.length = 0; vi.unstubAllGlobals() })

it('closes the lazily created audio context when leaving the Price view', () => {
  const { playRef } = useTradeSound()
  cleanup = effects[0]()
  expect(contexts).toHaveLength(0)
  playRef.current(100_000)
  expect(contexts).toHaveLength(1)
  cleanup(); cleanup = null
  expect(playRef.current).toBeNull()
  expect(contexts[0].close).toHaveBeenCalledOnce()
})

it('prevents a retained playback callback from reopening audio after cleanup', () => {
  const { playRef } = useTradeSound()
  cleanup = effects[0]()
  const oldPlay = playRef.current
  cleanup(); cleanup = null
  oldPlay(100_000)
  expect(contexts).toHaveLength(0)
})
