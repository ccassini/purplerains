/**
 * Poses: the legs strip, and the pure function that picks one.
 *
 * The one rule that makes this safe — the body layer and the legs layer are
 * NEVER offset from each other. A pose is an authored legs bitmap plus a
 * whole-figure (dx, dy) applied identically to both blits. Offsetting only the
 * upper half opens a transparent slit across the waist; offsetting the halves
 * in opposite directions severs the figure over open water. Silhouette change
 * is bought entirely from leg art plus whole-figure translation.
 *
 * Legs are cached separately from bodies, so six poses cost 12 canvases rather
 * than multiplying every body variant by six.
 */
import { PAL, surface, R } from './pixel'
import { HOPLITE_W, HOPLITE_H } from './sprites'

/** Fraction of the leap arc spent in each phase. */
const LEAP_LAUNCH = 0.12
const LEAP_LAND = 0.90
/** Queued soldiers within this many pixels of their target read as standing. */
const WALK_EPSILON = 0.6

/**
 * @typedef {object} Pose
 * @property {ReadonlyArray<[number, number, number, number, 'skin'|'greave']>} legs
 * @property {number} dx whole-figure x offset
 * @property {number} dy whole-figure y offset
 */

/**
 * Six poses. Leg rects are sprite-local; rows 13-16 only, so the strip is
 * transparent everywhere the body draws.
 * @type {Record<string, Pose>}
 */
export const POSES = {
  // At rest in the muster. Today's exact legs, mid-stride.
  stand: {
    legs: [[3, 13, 2, 3, 'skin'], [7, 14, 2, 2, 'skin'], [2, 16, 3, 1, 'greave'], [7, 16, 2, 1, 'greave']],
    dx: 0, dy: 0,
  },
  // Walking: feet apart, two separate greave stubs.
  stepA: {
    legs: [[2, 13, 2, 3, 'skin'], [8, 14, 2, 2, 'skin'], [1, 16, 3, 1, 'greave'], [8, 16, 2, 1, 'greave']],
    dx: 0, dy: 0,
  },
  // Walking: feet closed, one continuous greave run.
  stepB: {
    legs: [[4, 13, 2, 3, 'skin'], [6, 14, 2, 2, 'skin'], [4, 16, 5, 1, 'greave']],
    dx: 0, dy: 0,
  },
  // Coiled at the head of the queue or at the instant of launch. Row 13 empty
  // and the whole figure a pixel lower: a 16px silhouette reads as a crouch.
  brace: {
    legs: [[2, 14, 3, 3, 'skin'], [7, 14, 2, 3, 'skin'], [2, 16, 3, 1, 'greave'], [7, 16, 2, 1, 'greave']],
    dx: 0, dy: 1,
  },
  // Airborne, knees up. Rows 15-16 empty: the shortest silhouette at 15px.
  tuck: {
    legs: [[3, 13, 2, 2, 'skin'], [7, 13, 2, 2, 'skin'], [2, 14, 3, 1, 'greave'], [7, 14, 2, 1, 'greave']],
    dx: 0, dy: -1,
  },
  // Landed and standing the deck: widest stance, continuous greave course.
  planted: {
    legs: [[2, 13, 2, 4, 'skin'], [7, 13, 2, 4, 'skin'], [2, 16, 7, 1, 'greave']],
    dx: 0, dy: 0,
  },
  // The rite: identical art, lifted one pixel. Held on the seal frame.
  rite: {
    legs: [[2, 13, 2, 4, 'skin'], [7, 13, 2, 4, 'skin'], [2, 16, 7, 1, 'greave']],
    dx: 0, dy: -1,
  },
}

/** Held this long after a hull seals. */
export const RITE_SECONDS = 0.18

const legsCache = new Map()

/**
 * The legs strip for a pose. Greaves take the whale bronze ramp so a gold
 * body never sits on a bronze shin.
 *
 * @param {string} pose
 * @param {boolean} whale
 * @returns {HTMLCanvasElement}
 */
export function legsSprite(pose, whale) {
  const key = `${pose}:${whale ? 1 : 0}`
  let hit = legsCache.get(key)
  if (!hit) {
    const { c, ctx } = surface(HOPLITE_W, HOPLITE_H)
    const greave = whale ? '#9a6f14' : PAL.bronzeDark
    for (const [x, y, w, h, kind] of (POSES[pose] || POSES.stand).legs) {
      R(ctx, x, y, w, h, kind === 'skin' ? PAL.skin : greave)
    }
    hit = c
    legsCache.set(key, hit)
  }
  return hit
}

/**
 * Pick the pose for a soldier this frame. Pure: reads only the soldier's own
 * state and the clock, adds no engine field, and never mutates.
 *
 * @param {{state: string, dist?: number, pathLen?: number, targetX?: number,
 *          x: number, called?: boolean, seat?: number,
 *          ship?: {sealedAt?: number}|null,
 *          traits: {bob: number}}} h
 * @param {number} t elapsed seconds
 * @returns {{pose: string, dx: number, dy: number}}
 */
export function poseFor(h, t) {
  const state = h.state

  if (state === 'leaping' || state === 'marching') {
    const k = h.pathLen > 0 ? (h.dist || 0) / h.pathLen : 1
    if (k < LEAP_LAUNCH) return frame('brace', false)
    if (k < LEAP_LAND) return frame('tuck', false)
    return frame('planted', false)
  }

  if (state === 'aboard') {
    const sealedAt = h.ship && h.ship.sealedAt
    // Every passenger on a sealing hull snaps to the rite on the SAME frame —
    // no per-figure phase. Everything else in this scene is phase-offset, so
    // perfect synchrony is the loudest signal available for "one body".
    if (sealedAt && t - sealedAt < RITE_SECONDS) return frame('rite', false)
    return frame('planted', false)
  }

  if (state === 'queued') {
    const walking = Math.abs((h.targetX || 0) - h.x) > WALK_EPSILON
    if (h.called) return frame('brace', true)
    if (walking) return frame((Math.floor(t * 7 + h.traits.bob) & 1) ? 'stepB' : 'stepA', false)
    return frame('stand', false)
  }

  if (state === 'leaving') {
    // Half rate: they are not hurrying, and that composure is the point.
    return frame((Math.floor(t * 3.5 + h.traits.bob) & 1) ? 'stepB' : 'stand', false)
  }

  return frame('stand', false)
}

/**
 * `called` pulls the figure one pixel toward the water — foreknowledge, for
 * free, in a figure that cannot speak.
 *
 * @param {string} pose
 * @param {boolean} called
 */
function frame(pose, called) {
  const p = POSES[pose] || POSES.stand
  return { pose, dx: called ? p.dx - 1 : p.dx, dy: p.dy }
}
