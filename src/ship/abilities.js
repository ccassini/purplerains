/**
 * The Torchbearers' abilities, as data.
 *
 * An ability is a trigger, a paint op and a budget — nothing else. There is
 * deliberately no offensive/defensive/utility taxonomy: those labels would be
 * doing rhetorical work rather than driving code. `minRank`/`maxRank`, `hooks`
 * and `budget` are the fields the renderer actually reads.
 *
 * Adding an ability means appending one object literal here. The renderer
 * iterates the registry and needs no change.
 *
 * HARD RULE: abilities are PURELY presentational. They receive a read-only
 * view and must never write to it, and nothing here may influence how many
 * soldiers board — that is `capacity.js` alone.
 *
 * @typedef {object} SoldierView Read-only. Abilities MUST NOT mutate it.
 * @property {number} x buffer-space sprite left, already rounded
 * @property {number} y buffer-space sprite top, pose offset already applied
 * @property {number} rank 0..4
 * @property {string} state 'queued'|'leaping'|'marching'|'aboard'|'leaving'
 * @property {boolean} called hash is in a moored hull's manifest
 * @property {boolean} guttering torch is burning down
 * @property {number} alpha
 * @property {number} dist
 * @property {number} pathLen
 * @property {ReadonlyArray<{x: number, y: number}>|null} path
 * @property {number} targetX
 * @property {{bob: number, rate: number}} traits
 *
 * @typedef {'ground'|'over'} AbilityLayer
 *   'ground' paints before every sprite blit (light on stone, wake behind)
 *   'over'   paints after every sprite blit
 *
 * @typedef {object} Ability
 * @property {string} id stable, kebab-case
 * @property {string} name shown on the inspector card
 * @property {string} blurb one line, shown on the inspector card
 * @property {number} minRank inclusive
 * @property {number} maxRank inclusive
 * @property {AbilityLayer} layer
 * @property {number} budget worst-case primitives drawn per soldier per frame
 * @property {(h: SoldierView) => boolean} when
 * @property {(ctx: CanvasRenderingContext2D, h: SoldierView, t: number) => void} [paint]
 */
import { PAL } from './pixel'
import { RANK_UNLIT, RANK_KINDLER, RANK_ARCHON, RANK_EMBER, RANK_NAMES } from './ranks'
import { emitMote, RAMP_LASTLIGHT } from './motes'

/** Leapers that may draw a wake in one frame; beyond this it is skipped. */
export const MAX_WAKE_LEAPERS = 24
/** Samples read back along the leap path. */
const WAKE_SAMPLES = 5
const WAKE_SPACING = 6

/** Reused so wake sampling never allocates. */
const SCRATCH = { x: 0, y: 0 }

/**
 * Last Light emission phase per soldier. Kept OUTSIDE the SoldierView so the
 * read-only contract holds: abilities never write to the view. WeakMap entries
 * die with the soldier object, so nothing leaks when crews are dropped.
 * @type {WeakMap<object, number>}
 */
const lastMotePhase = new WeakMap()

/**
 * Position along a polyline at arc length `d`, written into `out`.
 * The engine's own `pointAt` allocates a fresh object and must not be used in
 * a per-frame, per-sample path like this one.
 *
 * @param {ReadonlyArray<{x: number, y: number}>} path
 * @param {number} d
 * @param {{x: number, y: number}} out
 */
export function pointAtInto(path, d, out) {
  let left = d
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const seg = Math.hypot(b.x - a.x, b.y - a.y)
    if (left <= seg || i === path.length - 1) {
      const k = seg > 0 ? Math.min(1, left / seg) : 1
      out.x = a.x + (b.x - a.x) * k
      out.y = a.y + (b.y - a.y) * k
      return out
    }
    left -= seg
  }
  const last = path[path.length - 1]
  out.x = last.x
  out.y = last.y
  return out
}

const WAKE_RAMP = [PAL.seaFoam, PAL.seaFoam, PAL.seaGlint, PAL.seaGlint, PAL.starDim]

/**
 * The registry.
 * @type {ReadonlyArray<Ability>}
 */
export const ABILITIES = [
  {
    id: 'emberwake',
    name: 'Emberwake',
    blurb: 'the muster\'s fire — height and hue are your rank',
    minRank: RANK_UNLIT,
    maxRank: RANK_ARCHON,
    // Painted inside the figure pass as the third blit, not as a layer.
    layer: 'over',
    budget: 1,
    when: () => false, // handled by the figure pass; listed here for the card
  },
  {
    id: 'quickstep',
    name: 'Quickstep',
    blurb: 'priority gas, made visible as impatience',
    minRank: RANK_KINDLER,
    maxRank: RANK_ARCHON,
    layer: 'over',
    budget: 2,
    when: (h) => h.state === 'queued' && Math.abs(h.targetX - h.x) > 0.6,
    paint: (ctx, h, t) => {
      // Bright stone dust scuffed off the kerb, trailing the back foot.
      ctx.fillStyle = PAL.marble
      const back = (Math.floor(t * 12 + h.traits.bob) & 1)
      ctx.fillRect(h.x + 8, h.y + 16, 1, 1)
      ctx.fillRect(h.x + 9, h.y + (back ? 15 : 16), 1, 1)
    },
  },
  {
    id: 'called',
    name: 'Called to the Plank',
    blurb: 'your transaction is in the hull now loading',
    minRank: RANK_UNLIT,
    maxRank: RANK_ARCHON,
    layer: 'over',
    budget: 0,
    // Expressed entirely through the pose system: a step toward the water, the
    // brace stance and a doubled flicker. Foreknowledge for zero primitives.
    when: () => false,
  },
  {
    id: 'wake',
    name: 'Wake of the Crossing',
    blurb: 'a seam of light where a torchbearer crossed',
    minRank: RANK_KINDLER,
    maxRank: RANK_ARCHON,
    layer: 'ground',
    budget: WAKE_SAMPLES,
    when: (h) => (h.state === 'leaping' || h.state === 'marching') && !!h.path,
    paint: (ctx, h) => {
      // Stateless: recomputed from the path each frame, so nothing is stored
      // and nothing leaks when a leap is cut short by a seal.
      for (let k = 1; k <= WAKE_SAMPLES; k++) {
        const d = h.dist - WAKE_SPACING * k
        if (d <= 0) break
        pointAtInto(h.path, d, SCRATCH)
        ctx.fillStyle = WAKE_RAMP[k - 1]
        ctx.fillRect(SCRATCH.x + 5, SCRATCH.y + 8, 1, 1)
      }
    },
  },
  {
    id: 'lastlight',
    name: 'Last Light',
    blurb: 'the ones who missed the last ship give the fire back',
    minRank: RANK_EMBER,
    maxRank: RANK_ARCHON,
    layer: 'over',
    budget: 0,
    when: (h) => h.state === 'leaving',
    paint: (_ctx, h, t) => {
      // One ember every 0.15s from the torch head. They outlive the body: the
      // sparks are still rising after the figure has faded out.
      const phase = Math.floor(t / 0.15)
      if (phase === lastMotePhase.get(h)) return
      lastMotePhase.set(h, phase)
      emitMote(h.x + 5, h.y - 1, ((phase & 1) ? 6 : -6), -14, 0.9, RAMP_LASTLIGHT)
    },
  },
  {
    id: 'hearthglow',
    name: 'Hearthglow',
    blurb: 'beacon-fire lights the stone an Archon stands on',
    minRank: RANK_ARCHON,
    maxRank: RANK_ARCHON,
    layer: 'ground',
    budget: 1,
    when: (h) => h.rank === RANK_ARCHON && (h.state === 'queued' || h.state === 'leaving'),
    paint: (ctx, h, t) => {
      // Warm light on the marble, breathing. An Archon gets more fire on the
      // stone rather than a shadow — nothing else in this harbour casts one.
      const k = (Math.sin((t / 1.4) * Math.PI * 2 + h.traits.bob) + 1) * 0.5
      ctx.fillStyle = k > 0.5 ? PAL.bronze : PAL.bronzeDark
      ctx.fillRect(h.x + 2, h.y + 16, 7, 1)
    },
  },
]

export const GROUND_ABILITIES = ABILITIES.filter((a) => a.layer === 'ground' && a.paint)
export const OVER_ABILITIES = ABILITIES.filter((a) => a.layer === 'over' && a.paint)

/**
 * Ability names a rank carries, for the inspector card. Frozen and shared, so
 * reading it allocates nothing.
 * @type {ReadonlyArray<ReadonlyArray<string>>}
 */
export const ABILITY_NAMES_BY_RANK = Object.freeze(
  RANK_NAMES.map((_name, rank) =>
    Object.freeze(ABILITIES.filter((a) => rank >= a.minRank && rank <= a.maxRank).map((a) => a.name))),
)

/**
 * Ability blurbs a rank carries, paired with names for the card.
 * @type {ReadonlyArray<ReadonlyArray<{name: string, blurb: string}>>}
 */
export const ABILITY_CARDS_BY_RANK = Object.freeze(
  RANK_NAMES.map((_name, rank) =>
    Object.freeze(ABILITIES
      .filter((a) => rank >= a.minRank && rank <= a.maxRank)
      .map((a) => Object.freeze({ name: a.name, blurb: a.blurb })))),
)
