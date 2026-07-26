/**
 * Bounded ember pool.
 *
 * Fixed-size, pre-allocated, allocation-free, and with zero `globalAlpha`
 * writes — a mote fades by stepping along a colour ramp instead, which is the
 * house idiom for this scene and strictly cheaper than alpha state changes.
 *
 * Overflow recycles the oldest slot rather than growing: the failure mode is a
 * slightly shorter ember trail, never a dropped frame.
 */
import { PAL } from './pixel'

/** Hard ceiling on live motes. */
const POOL = 128
/** Emissions accepted per frame, so a burst of leavers cannot spike. */
const SPAWNS_PER_FRAME = 6
/** Steps in every ramp; also the number of fillStyle writes per ramp. */
const STEPS = 3

const px = new Float32Array(POOL)
const py = new Float32Array(POOL)
const vx = new Float32Array(POOL)
const vy = new Float32Array(POOL)
const life = new Float32Array(POOL)
const ttl = new Float32Array(POOL)
const ramp = new Uint8Array(POOL)

let cursor = 0
let spawnsLeft = SPAWNS_PER_FRAME

/**
 * Colour ramps, oldest step last. A new effect is a data edit here.
 * @type {ReadonlyArray<ReadonlyArray<string>>}
 */
const RAMPS = [
  [PAL.beacon, PAL.beaconBand, PAL.islandFar], // 0: lastlight
]

export const RAMP_LASTLIGHT = 0

/**
 * Emit one mote. Silently declines past the per-frame budget.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} dx px/s
 * @param {number} dy px/s, negative rises
 * @param {number} seconds
 * @param {number} rampId
 */
export function emitMote(x, y, dx, dy, seconds, rampId) {
  if (spawnsLeft <= 0) return
  spawnsLeft--
  const i = cursor
  cursor = (cursor + 1) % POOL
  px[i] = x
  py[i] = y
  vx[i] = dx
  vy[i] = dy
  life[i] = seconds
  ttl[i] = seconds
  ramp[i] = rampId
}

/**
 * Advance every live mote. One flat loop, no allocation.
 * @param {number} dt
 */
export function updateMotes(dt) {
  spawnsLeft = SPAWNS_PER_FRAME
  for (let i = 0; i < POOL; i++) {
    if (life[i] <= 0) continue
    life[i] -= dt
    px[i] += vx[i] * dt
    py[i] += vy[i] * dt
  }
}

/**
 * Draw every live mote, ramp-step outermost so `fillStyle` is written at most
 * RAMPS.length * STEPS times per frame however many motes are alive.
 *
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawMotes(ctx) {
  for (let r = 0; r < RAMPS.length; r++) {
    for (let s = 0; s < STEPS; s++) {
      let wrote = false
      for (let i = 0; i < POOL; i++) {
        if (life[i] <= 0 || ramp[i] !== r) continue
        const age = ttl[i] > 0 ? 1 - life[i] / ttl[i] : 1
        const step = Math.min(STEPS - 1, (age * STEPS) | 0)
        if (step !== s) continue
        if (!wrote) { ctx.fillStyle = RAMPS[r][s]; wrote = true }
        ctx.fillRect(px[i] | 0, py[i] | 0, 1, 1)
      }
    }
  }
}

/** Drop every mote. Used when the engine stops. */
export function clearMotes() {
  life.fill(0)
  cursor = 0
  spawnsLeft = SPAWNS_PER_FRAME
}

/** Live mote count. Diagnostics and tests only. */
export function liveMoteCount() {
  let n = 0
  for (let i = 0; i < POOL; i++) if (life[i] > 0) n++
  return n
}

export { POOL as MOTE_POOL }
