/**
 * The bridge pod: dolphins, orcas and whales carrying value into Monad.
 *
 * A bridge inflow is a creature crossing the open water above the mole, its
 * species chosen by how much USD landed. Same rule as the fleet — one arrival,
 * one animal, nothing invented.
 *
 * ON THE THRESHOLDS. Cut against 1000 consecutive LI.FI transfers into Monad
 * (2026-07-26), of which 624 were genuine cross-chain inflows: median $50,
 * p90 $5.0k, p99 $100k, max $2.11M — 2 above $500k and 1 above $1M. So the
 * brief's own figures hold: a dolphin is the everyday arrival, an orca is
 * roughly one in three hundred, and a whale is the rarest thing on the water.
 * An earlier Relay-only sample topped out at $4.5k and made these look
 * impossible; the aggregator feed is what sees the institutional flow.
 */
import { PAL, surface, R } from './pixel'
import { getSprite } from './sprites'

/** Upper bound of each tier, in USD. Above the last entry is a whale. */
export const TIER_USD = { dolphin: 500_000, orca: 1_000_000 }

export const SPECIES = /** @type {const} */ (['dolphin', 'orca', 'whale'])

/** Sprite footprints, by species. */
export const SEA_LIFE_SIZE = {
  dolphin: { w: 26, h: 12 },
  orca: { w: 28, h: 13 },
  whale: { w: 40, h: 17 },
}

/**
 * Species for an inflow. Pure and total: any non-finite or negative amount
 * reads as the smallest creature rather than throwing.
 *
 * @param {number} usd
 * @returns {'dolphin' | 'orca' | 'whale'}
 */
export function speciesFor(usd) {
  const v = Number(usd)
  if (!Number.isFinite(v) || v < TIER_USD.dolphin) return 'dolphin'
  if (v < TIER_USD.orca) return 'orca'
  return 'whale'
}

/** English label for the inspector card. */
export const SPECIES_LABEL = {
  dolphin: 'DOLPHIN',
  orca: 'ORCA',
  whale: 'WHALE',
}

/**
 * Hold every creature clear astern of the ones it would otherwise swim through.
 *
 * Two things push the pod into a single overlapping clump if nothing stops
 * them: a poll hands over a whole batch of settled transfers at once, and the
 * species travel at different speeds, so a dolphin closes on any whale sharing
 * its water. Both end as two animals inside one silhouette.
 *
 * Only ever pushes a creature back (to larger x), so the leader of a group
 * keeps its own speed and the followers fall in behind it.
 *
 * @param {Array<{x: number, y: number, w: number, h: number}>} pod
 * @param {number} gap clear water to keep between two overlapping swim lines
 */
export function separatePod(pod, gap) {
  const ordered = [...pod].sort((p, q) => p.x - q.x)
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i]
    for (let j = 0; j < i; j++) {
      const ahead = ordered[j]
      // Different swim lines never contend, however close their columns are.
      if (a.y + a.h <= ahead.y || ahead.y + ahead.h <= a.y) continue
      a.x = Math.max(a.x, ahead.x + ahead.w + gap)
    }
  }
  return pod
}

/**
 * Back and belly line of the dolphin, one entry per body column.
 *
 * The silhouette lives here rather than in overlapping rectangles, because
 * boxes cannot describe a lens. Four things have to survive in these numbers or
 * the animal reads as a fish: a thin rostrum, a fast melon rise, the deepest
 * point just behind the flipper, and one even taper into the peduncle. Neither
 * line may ever move more than one row per column.
 */
const DOLPHIN_BACK = [8, 7, 6, 5, 5, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 6]
const DOLPHIN_BELLY = [8, 8, 8, 9, 9, 10, 10, 10, 10, 10, 10, 9, 9, 9, 8, 8, 8, 7, 7, 7, 7]

/**
 * The fluke on the up-beat, as spans of `[column, top, bottom]`.
 *
 * A dolphin's fluke is HORIZONTAL, so side-on it is one blade raked aft. The
 * symmetric vertical fork belongs to fish, and drawing it here turns the whole
 * silhouette into a shark whatever the head does. The down-beat is these same
 * spans mirrored about the peduncle, so the pair reads as one stroke rather
 * than two unrelated poses.
 */
const DOLPHIN_FLUKE = [
  [21, 5, 7],
  [22, 4, 7],
  [23, 3, 6],
  [24, 2, 5],
  [25, 2, 4],
]

/**
 * A dolphin: the everyday arrival, and the one seen most, so it earns the
 * detail.
 *
 * All three of the pod face LEFT, the direction every moving thing in this
 * Odyssey travels, and all three are LIGHTER than the water they cross. The
 * far sea band is seaFar/seaHorizon (#2a1c52..#3a2668); anything darker reads
 * as a hole punched in the sea rather than an animal on it.
 */
function buildDolphin(frame) {
  const { c, ctx } = surface(26, 12)
  const lit = '#eaf3fd'
  const back = '#6f86b2'
  const body = '#93aad0'
  const belly = '#c6d6ea'
  const ink = '#3e4d73'

  // Pectoral first: the body's own keel line then paints over its root, so only
  // the blade shows below the belly and the silhouette keeps one clean edge.
  R(ctx, 7, 10, 4, 2, back)
  R(ctx, 9, 11, 2, 1, ink)

  // The body, column by column: dark cape over a pale ventral, ramped so a
  // curved flank shades instead of banding. No bright rim along the spine — a
  // lit top row against a pale belly reads as two stripes with a body trapped
  // between them rather than as one rounded animal.
  for (let x = 0; x < DOLPHIN_BACK.length; x++) {
    const top = DOLPHIN_BACK[x]
    const depth = DOLPHIN_BELLY[x] - top + 1
    for (let i = 0; i < depth; i++) {
      const f = depth > 1 ? i / (depth - 1) : 1
      let tone
      if (depth === 1 || i === depth - 1) tone = ink
      else if (f < 0.30) tone = back
      else if (f < 0.62) tone = body
      else tone = belly
      R(ctx, x, top + i, 1, 1, tone)
    }
  }

  // The one sun, spent where it counts: a short specular over the melon and the
  // shoulder, the only place a rounded body would actually catch it. Ventral
  // tone for the sweep and a single bright pixel at the crown, because a
  // near-white patch any larger than this reads as a hat rather than as light.
  R(ctx, 3, 5, 2, 1, belly)
  R(ctx, 5, 4, 3, 1, belly)
  R(ctx, 6, 4, 1, 1, lit)

  // Falcate dorsal: swept aft off a broad base, never a vertical spike.
  R(ctx, 9, 3, 3, 1, back)
  R(ctx, 10, 2, 2, 1, back)
  R(ctx, 11, 1, 1, 1, back)
  R(ctx, 9, 3, 1, 1, body)

  // The smile, carried aft off the rostrum, and the eye set above and behind it.
  R(ctx, 3, 8, 2, 1, ink)
  R(ctx, 5, 6, 1, 1, PAL.black)

  // The fluke is the only thing the two frames disagree about.
  for (const [fx, a, b] of DOLPHIN_FLUKE) {
    const top = frame === 0 ? a : 13 - b
    const bot = frame === 0 ? b : 13 - a
    R(ctx, fx, top, 1, bot - top + 1, body)
    R(ctx, fx, top, 1, 1, back)
    R(ctx, fx, bot, 1, 1, ink)
  }
  return c
}

/**
 * An orca: the unmistakable one, and the hard one.
 *
 * A real orca is black, but black on a violet sea is invisible — the first cut
 * of this sprite vanished into the water and left its white belly floating
 * alone. So the body is a dark slate that still sits ABOVE the sea in value,
 * and it carries a lit rim along the back plus the two markings that make an
 * orca an orca at any size: the eye patch and the flank blaze.
 */
function buildOrca(frame) {
  const { c, ctx } = surface(28, 13)
  const body = '#2f3a55'
  const rim = '#6d7d9e'
  const white = '#eef3fa'
  const shade = '#1d2438'
  // Blunt head into a deep barrel body.
  R(ctx, 0, 7, 5, 3, body)
  R(ctx, 4, 5, 16, 6, body)
  // Backlit rim along the whole spine: the separation from the water.
  R(ctx, 4, 5, 16, 1, rim)
  R(ctx, 0, 7, 5, 1, rim)
  R(ctx, 5, 11, 13, 1, shade)
  // Eye patch and flank blaze — read before the silhouette does.
  R(ctx, 2, 7, 4, 1, white)
  R(ctx, 6, 9, 10, 2, white)
  R(ctx, 16, 7, 4, 1, rim)
  // Tall dorsal: a triangle with a broad base.
  R(ctx, 8, 3, 6, 2, body)
  R(ctx, 9, 1, 4, 2, body)
  R(ctx, 10, 0, 2, 1, body)
  R(ctx, 8, 3, 1, 2, rim)
  R(ctx, 9, 1, 1, 2, rim)
  // Pectoral.
  R(ctx, 7, 11, 4, 1, body)
  R(ctx, 8, 12, 2, 1, shade)
  // Tail stock and fluke.
  R(ctx, 20, 6, 4, 4, body)
  if (frame === 0) {
    R(ctx, 24, 3, 4, 3, body)
    R(ctx, 24, 3, 4, 1, rim)
  } else {
    R(ctx, 24, 9, 4, 3, body)
    R(ctx, 24, 11, 4, 1, shade)
  }
  R(ctx, 1, 7, 1, 1, PAL.black)
  return c
}

/**
 * A whale: mass first. Broad head, tiny dorsal set far back, deep body and a
 * wide fluke. The spout only appears on the surfacing frame, so a blowing
 * whale marks the moment a large bridge transfer landed.
 */
function buildWhale(frame) {
  const { c, ctx } = surface(40, 17)
  const body = '#56688f'
  const lit = '#8496b9'
  const belly = '#aab8d2'
  const dark = '#313d5c'
  // Rounded head into a deep body.
  R(ctx, 1, 6, 6, 6, body)
  R(ctx, 0, 7, 2, 4, body)
  R(ctx, 6, 4, 21, 9, body)
  // One sun: lit along the back, shaded under the belly.
  R(ctx, 5, 4, 22, 1, lit)
  R(ctx, 1, 6, 5, 1, lit)
  R(ctx, 6, 12, 20, 1, dark)
  // Pale throat — a soft field, not a row of portholes.
  R(ctx, 5, 11, 15, 1, belly)
  R(ctx, 7, 10, 10, 1, belly)
  // Small dorsal, set far back.
  R(ctx, 22, 2, 4, 2, body)
  R(ctx, 22, 2, 4, 1, lit)
  // Pectoral flipper.
  R(ctx, 10, 13, 6, 1, dark)
  R(ctx, 12, 14, 4, 1, dark)
  // Tail stock and broad fluke.
  R(ctx, 27, 6, 5, 5, body)
  R(ctx, 32, 3, 5, 4, body)
  R(ctx, 32, 10, 5, 4, body)
  R(ctx, 32, 3, 5, 1, lit)
  R(ctx, 36, 13, 4, 1, dark)
  // Blowhole, and the spout on the surfacing frame only.
  R(ctx, 5, 5, 1, 1, dark)
  if (frame === 0) {
    R(ctx, 5, 1, 1, 4, PAL.marbleShade)
    R(ctx, 4, 0, 1, 1, PAL.marble)
    R(ctx, 6, 0, 1, 1, PAL.marble)
  }
  R(ctx, 3, 9, 1, 1, PAL.black)
  return c
}

const BUILDERS = { dolphin: buildDolphin, orca: buildOrca, whale: buildWhale }

/**
 * Cached sprite for a species and swim frame. Six canvases total for the whole
 * pod, so a creature costs one blit per frame like everything else.
 *
 * @param {'dolphin' | 'orca' | 'whale'} species
 * @param {number} frame 0 or 1
 * @returns {HTMLCanvasElement}
 */
export function seaLifeSprite(species, frame) {
  const f = frame & 1
  const kind = BUILDERS[species] ? species : 'dolphin'
  return getSprite(`sea:${kind}:${f}`, () => BUILDERS[kind](f))
}
