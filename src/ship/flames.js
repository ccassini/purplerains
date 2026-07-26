/**
 * The torch each soldier carries. Rank is legible as fire: height, hue and
 * temperature, all readable from a single pixel across a crowded quay.
 *
 * The flames live in a fixed 5x4 table built once and never evicted, so rank
 * never enters an LRU cache key. Adding a rank costs four small canvases.
 */
import { PAL, surface, R } from './pixel'
import { RANK_UNLIT, RANK_EMBER, RANK_KINDLER, RANK_BEARER, RANK_ARCHON } from './ranks'

export const FLAME_W = 3
export const FLAME_H = 4

const PHASES = 4
const RANKS = 5

/**
 * Rects per rank per phase, in flame-canvas space (3 wide, 4 tall). The canvas
 * is blitted at (sprite.x, sprite.y - 1), so canvas row 3 lands on sprite row
 * 2 and canvas row 0 lands one pixel ABOVE the sprite box — which is how an
 * Archon becomes the literal high point of any rank.
 *
 * @type {ReadonlyArray<ReadonlyArray<ReadonlyArray<[number, number, number, number, string]>>>}
 */
const FLAME_ART = [
  // 0 Unlit — no fire at all. The socket on the body is the only tell.
  [[], [], [], []],
  // 1 Ember — a low warm bead that lifts one pixel on the up-beat.
  [
    [[1, 3, 1, 1, PAL.bronzeLit]],
    [[1, 2, 1, 2, PAL.bronzeLit]],
    [[1, 2, 1, 1, PAL.sun], [1, 3, 1, 1, PAL.bronzeLit]],
    [[1, 3, 1, 1, PAL.sun]],
  ],
  // 2 Kindler — taller, gold, and on phase 2 it leans aft: fire blown back by
  // the speed of someone who paid to move.
  [
    [[1, 2, 1, 2, PAL.beaconLamp]],
    [[1, 1, 1, 3, PAL.beaconLamp]],
    [[1, 2, 1, 2, PAL.beaconLamp], [2, 1, 1, 1, PAL.sun]],
    [[1, 1, 1, 3, PAL.beaconLamp], [1, 0, 1, 1, PAL.sun]],
  ],
  // 3 Bearer — a fat column with a white-hot core, guttering wide.
  [
    [[1, 1, 1, 3, PAL.beaconLamp], [1, 0, 1, 1, PAL.sunCore]],
    [[1, 1, 1, 3, PAL.beaconLamp], [0, 1, 1, 1, PAL.beaconLamp], [1, 0, 1, 1, PAL.sunCore]],
    [[1, 1, 1, 3, PAL.beaconLamp], [2, 1, 1, 1, PAL.beaconLamp], [1, 0, 1, 1, PAL.sunCore]],
    [[1, 1, 1, 3, PAL.beaconLamp], [1, 0, 1, 1, PAL.sun]],
  ],
  // 4 Archon — beacon-fire itself. The only pure white in the Odyssey, and on
  // phase 2 a pixel at canvas row 0 stands above every other silhouette.
  [
    [[1, 2, 1, 2, PAL.beaconBand], [1, 1, 1, 1, PAL.beacon]],
    [[1, 2, 1, 2, PAL.beaconBand], [1, 1, 1, 1, PAL.beacon], [2, 1, 1, 1, PAL.beacon]],
    [[1, 2, 1, 2, PAL.beaconBand], [1, 1, 1, 1, PAL.beacon], [1, 0, 1, 1, PAL.white]],
    [[1, 2, 1, 2, PAL.beaconBand], [0, 1, 1, 1, PAL.beacon], [1, 1, 1, 1, PAL.beacon], [1, 0, 1, 1, PAL.white]],
  ],
]

/** @type {Array<Array<HTMLCanvasElement|null>>} */
const FLAMES = Array.from({ length: RANKS }, () => new Array(PHASES).fill(null))

/**
 * One flame frame. Built on first use, then held forever — 20 canvases of
 * 3x4 is trivial, and keeping them out of the LRU means a hot flame can never
 * be evicted by a cold body variant.
 *
 * @param {number} rank
 * @param {number} phase
 * @returns {HTMLCanvasElement|null} null when the rank carries no fire
 */
export function flameSprite(rank, phase) {
  const r = rank < 0 ? 0 : rank > RANK_ARCHON ? RANK_ARCHON : rank
  const p = phase & 3
  if (r === RANK_UNLIT) return null
  let hit = FLAMES[r][p]
  if (!hit) {
    const { c, ctx } = surface(FLAME_W, FLAME_H)
    for (const [x, y, w, h, color] of FLAME_ART[r][p]) R(ctx, x, y, w, h, color)
    hit = c
    FLAMES[r][p] = c
  }
  return hit
}

export { RANK_UNLIT, RANK_EMBER, RANK_KINDLER, RANK_BEARER, RANK_ARCHON }
