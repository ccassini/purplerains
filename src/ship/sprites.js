/**
 * Procedural pixel sprites, drawn once per variant and cached.
 *
 * No external art: every sprite here is built from rectangles at draw time and
 * kept in an offscreen canvas, so a variant costs one blit per frame afterwards.
 * The cache key encodes every trait that changes a pixel.
 *
 * The cast is an embarkation fleet — hoplites with crested helmets, round
 * shields and spears, boarding oared triremes. Deliberately not the cats and
 * tugboats of the scene this idea came from.
 */
import { PAL } from './pixel'
import { seedFrom, mulberry32 } from './rng'

export const HOPLITE_W = 11
export const HOPLITE_H = 17
/** Native pixel art — procedural hull is drawn at this resolution. */
export const SHIP_NATIVE_W = 54
export const SHIP_NATIVE_H = 26
/** Drawn / layout scale over the native art (fleet size before the 25% shrink). */
export const SHIP_SCALE = 1.2
/** Collision and berth footprint after SHIP_SCALE. */
export const SHIP_W = Math.round(SHIP_NATIVE_W * SHIP_SCALE)
export const SHIP_H = Math.round(SHIP_NATIVE_H * SHIP_SCALE)
/** Deck line inside the native sprite: where a hoplite's feet land. */
export const DECK_Y = 16
/** Deck line in world pixels (top of ship bbox → gunwale). */
export const DECK_Y_WORLD = Math.round(DECK_Y * SHIP_SCALE)
/**
 * Seats per deck row. Lives here with the rest of the deck geometry because
 * the engine's seating and the renderer's occlusion cull must agree exactly.
 */
export const DECK_COLS = 4

/**
 * After-deck seat grid in *native* ship pixels (matches the procedural hull).
 * World placement multiplies by depthScale(y) * SHIP_SCALE from the keel.
 */
export const DECK_X0 = 22
export const DECK_COL_STEP = 5
export const DECK_ROW_STEP = 2

/**
 * Native-pixel seat offset for soldier `index` on a deck of `load` seats.
 * @param {number} load
 * @param {number} index
 */
export function seatOffsetNative(load, index) {
  const rows = Math.max(1, Math.ceil(load / DECK_COLS))
  const row = Math.max(0, rows - 1 - Math.floor(index / DECK_COLS))
  const col = index % DECK_COLS
  return {
    dx: DECK_X0 + col * DECK_COL_STEP,
    dy: DECK_Y - HOPLITE_H + 1 - row * DECK_ROW_STEP,
  }
}

/** Hull depth below the deck. Bigger blocks ride lower. */
export const hullDepth = (size) => 6 + size
/** Oars are animated, so they are drawn by the scene rather than baked in. */
export const OAR_COUNT = 6
export const OAR_X0 = 10
export const OAR_STEP = 5

/**
 * Cloak / aspis colours — dark, heavy dyes that read as armour on a violet
 * dusk sea. Pastel cyan, orchid and cream washed out against the water; these
 * stay dense at eleven pixels.
 *
 * Each dye is a triple: [cloak, cloakLit, cloakSignal]. The first two paint
 * sprite pixels; `cloakSignal` never touches the canvas — it is the same dye
 * lifted until it reads as TEXT on the inspector plaque (every value verified
 * >= 4.5:1 against the panel). Piping the raw cloak into the DOM rendered
 * card titles at ~1.2:1 — functionally invisible.
 */
const CLOAKS = [
  ['#6b1f28', '#8f2e3a', '#e8697a'], // blood wine
  ['#1e3a4a', '#2d5568', '#7fc0dd'], // deep sea
  ['#2a3d28', '#3d5a38', '#9dba63'], // olive drab
  ['#3b2a18', '#5a4024', '#d9a05f'], // burnt umber
  ['#2c2438', '#43365a', '#a78bfa'], // night iron
  ['#4a2818', '#6b3a22', '#e08a54'], // bronze rust
  ['#1a2e3c', '#274058', '#8fb8d8'], // slate navy
  ['#4a1e2e', '#6a2e42', '#d1568c'], // dark madder
]

/**
 * The Monad mark, 7x7. The straight downscale rounds the diamond into a
 * donut at this size, so the mask is cut by hand from the property that
 * survives smallness: the diamond lives in its POINTS. Four sharp cardinal
 * tips, a ring one to two pixels thick, a diamond void — device-sized, the
 * way a standard carries a blazon.
 */
const MONAD_MARK = [
  '...#...',
  '..###..',
  '.##.##.',
  '##...##',
  '.##.##.',
  '..###..',
  '...#...',
]

/** Crest silhouette doubles as the transaction-kind marker. */
const CRESTS = ['tall', 'low', 'twin']
const BLAZONS = ['none', 'boss', 'bars', 'ring']

/** Whale dye: antique gold, not pale cream. Signal matches the gold token. */
const WHALE_CLOAK = ['#b8860b', '#d4a017', '#fcd34d']

const cache = new Map()

function surface(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = false
  return { c, ctx }
}

const R = (ctx, x, y, w, h, color) => {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

/**
 * Derive a hoplite from a transaction hash. Same hash, same soldier, always.
 * @param {string} hash
 * @param {{category?: string, value?: number|string, gasPrice?: number|string,
 *          gasHigh?: number, gasTop?: number}} meta
 */
export function hopliteFromTx(hash, meta = {}) {
  const rnd = mulberry32(seedFrom(hash))
  const value = Number(meta.value) || 0
  const gas = Number(meta.gasPrice) || 0
  const category = meta.category || 'other'

  // Gas thresholds are relative to what the chain is actually charging right
  // now. A fixed gwei number turns every transaction gold on a chain whose
  // base fee sits above it, which is exactly what a rare-trait marker must not
  // do. The fallbacks only apply before enough samples have been collected.
  const gasTop = Number(meta.gasTop) || 400
  const gasHigh = Number(meta.gasHigh) || 120
  // Split into the two axes the rank ladder needs. `whale` keeps its exact
  // old meaning (either axis alone), so everything keyed off it is unchanged;
  // an Archon is the rare case where both are true at once. No `rnd()` is
  // consumed here, so the deterministic sprite stream below is untouched.
  const heavy = value >= 100
  const urgent = gas > 0 && gas >= gasTop
  const whale = heavy || urgent
  const priority = !whale && gas > 0 && gas >= gasHigh

  // Category nudges the crest so transaction kind is readable in silhouette.
  let crest = CRESTS[Math.floor(rnd() * CRESTS.length)]
  if (category === 'nft') crest = 'twin'
  else if (category === 'contractDeploy' || category === 'contractCall') crest = 'tall'
  else if (category === 'transfer') crest = 'low'

  const [cloak, cloakLit, cloakSignal] = whale ? WHALE_CLOAK : CLOAKS[Math.floor(rnd() * CLOAKS.length)]

  return {
    hash,
    category,
    cloak,
    cloakLit,
    cloakSignal,
    crest,
    crestColor: whale ? '#e8c547' : cloakLit,
    blazon: BLAZONS[Math.floor(rnd() * BLAZONS.length)],
    whale,
    priority,
    heavy,
    urgent,
    bob: rnd() * Math.PI * 2,
    rate: 0.8 + rnd() * 0.7,
    name: hopliteName(rnd),
  }
}

const NAME_A = [
  'Nyx', 'Vela', 'Orin', 'Lykos', 'Kite', 'Echo', 'Nova', 'Rune', 'Ivy', 'Thal',
  'Halo', 'Mira', 'Onyx', 'Cinder', 'Dorea', 'Xanth', 'Peleus', 'Iros',
]
const NAME_B = ['of Ilion', 'the Oarsman', 'Shieldwright', 'the Swift', 'Spearhand', 'of Pylos', 'the Bronze']
function hopliteName(rnd) {
  return `${NAME_A[Math.floor(rnd() * NAME_A.length)]} ${NAME_B[Math.floor(rnd() * NAME_B.length)]}`
}

/**
 * Body identity. `priority` is deliberately NOT in the key — its tell moved to
 * the torch, which halves the reachable body variants from 204 to 108 and is
 * what pays for the pose system.
 */
export function hopliteBodyKey(h) {
  return `body:${h.cloak}:${h.crest}:${h.blazon}:${h.whale ? 1 : 0}`
}

/**
 * One hoplite, facing left toward the ships.
 *
 * Built around the aspis rather than the body: at eleven pixels the round
 * shield is the only element with enough area to carry a colour, so it holds
 * the figure's identity while the bronze helmet and spear make the silhouette
 * read as a soldier from across the Odyssey. The body behind it is mostly
 * hidden, which is also how the thing was actually carried.
 */
function buildBody(h) {
  const dark = PAL.black
  const bronze = h.whale ? PAL.gold : PAL.bronze
  const bronzeLit = h.whale ? '#fff3c4' : PAL.bronzeLit
  const bronzeDark = h.whale ? '#9a6f14' : PAL.bronzeDark
  const { c, ctx } = surface(HOPLITE_W, HOPLITE_H)

  // Spear in the trailing hand. Ash-pale rather than timber-dark: a brown
  // shaft one pixel wide simply vanishes against the water behind it.
  R(ctx, 10, 1, 1, 14, PAL.marbleShade)
  R(ctx, 10, 15, 1, 1, bronzeDark)
  R(ctx, 9, 9, 1, 1, PAL.skin)
  // The old priority tell lived here as two pale pixels on the spear tip. At an
  // 8px queue pitch col 10 keeps 7 of 16 pixels behind its neighbour, and on
  // deck it is buried entirely — it was unreadable by construction. Priority is
  // now carried by the torch, which stands in the clear.
  R(ctx, 10, 0, 1, 1, bronzeLit)

  // Torch socket at the shoulder. The flame is blitted over this.
  R(ctx, 1, 3, 1, 1, bronzeDark)

  // Crest. Its shape is the transaction-kind tell, so the three read as three
  // different silhouettes rather than three shades of the same tuft.
  if (h.crest === 'tall') {
    R(ctx, 4, 0, 3, 3, h.crestColor)
    R(ctx, 7, 1, 2, 2, h.crestColor)
  } else if (h.crest === 'low') {
    R(ctx, 3, 2, 6, 1, h.crestColor)
    R(ctx, 8, 1, 1, 1, h.crestColor)
  } else {
    R(ctx, 3, 1, 2, 2, h.crestColor)
    R(ctx, 6, 1, 2, 2, h.crestColor)
  }

  // Corinthian helmet: domed cap, eye slit, nose guard down the leading edge.
  R(ctx, 4, 3, 4, 1, bronzeLit)
  R(ctx, 3, 4, 5, 3, bronze)
  R(ctx, 2, 4, 1, 3, dark)
  R(ctx, 3, 5, 2, 1, dark)
  R(ctx, 8, 4, 1, 3, bronzeDark)

  // Body behind the shield: only the spear arm, the hem and the legs show.
  // The legs are mid-stride, which is what stops a rank of these reading as a
  // row of standing jars.
  R(ctx, 4, 7, 6, 6, h.cloakLit)
  R(ctx, 4, 12, 6, 1, h.cloak)
  // Legs deliberately absent: they are a separate cached strip so that six
  // poses cost 12 canvases instead of multiplying every body variant by six.
  // See poses.js.

  // Aspis, chin to knee, which is how the thing was actually carried. It is
  // drawn last so it covers the body, and its leading edge is inked: the men
  // stand shoulder to shoulder, so without that the rank is one long smear of
  // overlapping bronze rims.
  const disc = [[2, 4], [1, 6], [0, 8], [0, 8], [0, 8], [1, 6], [2, 4]]
  disc.forEach(([x, w], i) => {
    R(ctx, x, 6 + i, w, 1, bronze)
    R(ctx, x, 6 + i, 1, 1, dark)
  })
  const face = [[2, 4], [1, 6], [1, 6], [1, 6], [2, 4]]
  face.forEach(([x, w], i) => R(ctx, x, 7 + i, w, 1, h.cloak))
  if (h.blazon === 'bars') {
    R(ctx, 1, 9, 6, 1, bronzeDark)
    R(ctx, 1, 11, 6, 1, bronzeDark)
  } else if (h.blazon === 'ring') {
    R(ctx, 2, 8, 4, 1, bronzeDark)
    R(ctx, 1, 9, 1, 2, bronzeDark)
    R(ctx, 6, 9, 1, 2, bronzeDark)
    R(ctx, 2, 11, 4, 1, bronzeDark)
  } else if (h.blazon === 'boss') {
    R(ctx, 3, 9, 2, 2, bronzeLit)
  } else {
    R(ctx, 2, 9, 4, 1, bronzeLit)
  }

  // A laurel marks the whales.
  if (h.whale) {
    R(ctx, 2, 3, 1, 1, PAL.laurel)
    R(ctx, 8, 3, 1, 1, PAL.laurel)
  }

  return c
}

export function shipKey(v) {
  // `pennant` deliberately absent: the fleet's colours are constant now, so it
  // no longer changes a pixel and would only quadruple the cached variants.
  return `ship:${v.sail}:${v.hull}:${v.size}:${v.stripe}`
}

/**
 * Traits for a block's trireme. `size` is supplied by the caller (from the
 * capacity plan) so hull size and deck load always come from the same figure;
 * the old tx-only thresholds here could disagree with the boarding count.
 */
export function shipFromBlock(block, size = 0) {
  const rnd = mulberry32(seedFrom(block.hash || String(block.number)))
  const tx = Number(block.transactionCount) || 0
  return {
    number: block.number,
    hash: block.hash,
    txCount: tx,
    sail: rnd() < 0.5 ? PAL.sailA : PAL.sailB,
    stripe: [PAL.crimson, '#8b5cf6', '#3f7f8f', PAL.laurel][Math.floor(rnd() * 4)],
    hull: [PAL.hullMid, PAL.hullLit, '#5b3a22'][Math.floor(rnd() * 3)],
    // Three size steps so a fat block rides visibly lower in the water.
    size: size === 2 || size === 1 ? size : 0,
  }
}

/**
 * A trireme: bronze ram at the bow, painted eye, curled stern post and a
 * striped square sail.
 *
 * The mast is stepped *forward* rather than amidships. Everything aft of it is
 * reserved: the gangplank lands on the after deck and the boarding column
 * stands there, and a sail in the middle of the ship would be crossed by both.
 */
function buildShip(v) {
  const { c, ctx } = surface(SHIP_NATIVE_W, SHIP_NATIVE_H)
  const hullH = hullDepth(v.size)
  const hullY = DECK_Y + 1
  const keel = hullY + hullH - 1

  // ── rig ────────────────────────────────────────────────────────────────
  // Stepped well forward; everything abaft the mast belongs to the boarding
  // deck. The sail is a clean professional standard: one field of cloth, one
  // small device, nothing else — the trims and swallowtails of earlier cuts
  // read as clutter at Odyssey distance.
  R(ctx, 12, 2, 1, 14, PAL.hullMid)
  R(ctx, 12, 2, 1, 5, PAL.hullLit)          // lit face, upper-left, one sun
  R(ctx, 12, 1, 1, 1, PAL.gold)             // gilded masthead truck
  R(ctx, 6, 3, 15, 1, PAL.hullMid)          // yard
  R(ctx, 6, 3, 8, 1, PAL.hullLit)

  // The cloth: 13x9, head in the sun, foot in shadow.
  R(ctx, 7, 4, 13, 1, PAL.linen)
  R(ctx, 7, 5, 13, 7, v.sail)
  R(ctx, 7, 12, 13, 1, PAL.bronzeDark)

  // The device, centred: 7x7 of true logo geometry.
  for (let my = 0; my < 7; my++) {
    const row = MONAD_MARK[my]
    for (let mx = 0; mx < 7; mx++) {
      if (row[mx] === '#') R(ctx, 10 + mx, 5 + my, 1, 1, PAL.monad)
    }
  }

  // One short pennant tongue at the truck — a breath of colour, not a banner.
  R(ctx, 13, 1, 4, 1, PAL.monad)
  R(ctx, 16, 2, 2, 1, PAL.monadLit)

  // ── the crescent ───────────────────────────────────────────────────────
  // A galley is a lens, not a slab: the sheer lifts toward both ends AND the
  // bottom lifts with it, so the hull keeps roughly one thickness the whole way
  // and reads as a curve. Raising only the sheer — the obvious mistake — builds
  // a wall at the bow instead of a prow.
  //
  // Both curves stay flat across x 16..44, which is exactly where the engine
  // seats its rowers, so the sheer can never tilt a soldier.
  const sheer = (x) => {
    if (x <= 6 || x >= 50) return DECK_Y - 2
    if (x <= 10 || x >= 47) return DECK_Y - 1
    return DECK_Y
  }
  // One row at a time. A two-row jump anywhere in here reads as a dent in the
  // planking, which is exactly what the first cut of this hull looked like.
  const rocker = (x) => {
    if (x <= 6) return 3
    if (x <= 8) return 2
    if (x <= 10) return 1
    if (x >= 51) return 3
    if (x >= 49) return 2
    if (x >= 47) return 1
    return 0
  }

  // ── hull ───────────────────────────────────────────────────────────────
  // Column by column: gunwale cap, an inked line under it so the deck reads as
  // a deck, the planked side, then the underbody in shadow.
  for (let x = 5; x <= 52; x++) {
    const top = sheer(x)
    const bottom = keel - rocker(x)
    if (bottom < top + 2) continue
    R(ctx, x, top, 1, 1, PAL.deck)                  // gunwale cap, catching the sun
    R(ctx, x, top + 1, 1, 1, PAL.hullDark)          // shadow under the cap
    R(ctx, x, top + 2, 1, bottom - top - 1, v.hull) // planking
    R(ctx, x, bottom, 1, 1, PAL.hullDark)           // underbody, in shadow
  }
  // The wale: one bright strake running the length, catching the low sun.
  for (let x = 4; x <= 50; x++) R(ctx, x, sheer(x) + 2, 1, 1, PAL.hullLit)

  // The chain's purple along the sheer strake: sparse single ticks, the way a
  // painted ornament band actually reads — the first cut used 2px dashes on a
  // 4px pitch and lit the hull like strip lighting.
  for (let x = 12; x <= 42; x += 6) R(ctx, x, hullY + 1, 1, 1, PAL.monad)

  // Oar ports, forward and aft of the block numeral the scene paints across
  // the hull's middle. Nothing else says "trireme" this cheaply.
  for (let x = 10; x <= 19; x += 3) R(ctx, x, hullY + 3, 1, 1, PAL.hullDark)
  for (let x = 41; x <= 47; x += 3) R(ctx, x, hullY + 3, 1, 1, PAL.hullDark)

  // ── the ram ────────────────────────────────────────────────────────────
  // Bronze, three courses, driven forward at the waterline: this ship can act.
  // A block changes state, it does not carry cargo.
  // A wedge, not a bar: three courses tapering to a point at the waterline.
  const ram = keel - 3
  R(ctx, 2, ram, 4, 1, PAL.bronzeLit)
  R(ctx, 0, ram + 1, 6, 1, PAL.bronze)
  R(ctx, 1, ram + 2, 5, 1, PAL.bronzeDark)
  // The prow. Not a post stuck on the front — a filled rake that carries the
  // planking forward and down into the ram, so bow, stem and ram read as one
  // continuous line. Drawn as columns because that is how the hull is built.
  for (let i = 1; i <= 4; i++) {
    const x = 5 - i
    const top = DECK_Y - 2 + i
    if (top > ram) break
    R(ctx, x, top, 1, ram - top + 1, v.hull)
    R(ctx, x, top, 1, 1, PAL.hullLit)   // lit edge, upper-left: one sun
  }

  // The painted eye — with a monad-purple iris. A block validates; it is not
  // blind cargo, and what it watches the water with is the chain itself.
  R(ctx, 7, hullY + 1, 3, 2, PAL.marble)
  R(ctx, 8, hullY + 1, 1, 2, PAL.monad)
  R(ctx, 8, hullY + 1, 1, 1, PAL.black)

  // ── the aphlaston ──────────────────────────────────────────────────────
  // The stern curls up and over the helmsman, fanned like a bird's tail. This
  // is the silhouette that reads at a hundred pixels away.
  R(ctx, 49, DECK_Y - 8, 2, 7, PAL.hullLit)
  R(ctx, 50, DECK_Y - 10, 2, 3, PAL.hullLit)
  R(ctx, 51, DECK_Y - 12, 2, 3, PAL.hullMid)
  R(ctx, 52, DECK_Y - 11, 1, 2, PAL.hullLit)
  R(ctx, 50, DECK_Y - 13, 2, 1, PAL.hullMid)
  R(ctx, 49, DECK_Y - 8, 1, 4, PAL.deck)  // lit inner face
  R(ctx, 51, DECK_Y - 13, 1, 1, PAL.gold) // gilded finial catching the last sun
  // Steering oar, shipped over the quarter.
  R(ctx, 48, hullY + 2, 5, 1, PAL.hullMid)
  R(ctx, 51, hullY + 3, 2, 3, PAL.hullMid)
  R(ctx, 51, hullY + 3, 1, 3, PAL.hullLit)

  // ── the after deck ─────────────────────────────────────────────────────
  // Flat, and deliberately bare. The benches line up pixel-for-pixel with the
  // engine's seat grid (DECK_X0 22, DECK_COL_STEP 5), so an unfilled bench is
  // literally an unfilled seat — the visible difference between what this block
  // could have carried and what it did. Never fill them decoratively.
  R(ctx, 15, DECK_Y, 34, 1, PAL.deck)
  for (let i = 0; i < 4; i++) {
    const bx = 22 + i * 5
    R(ctx, bx, DECK_Y - 1, 4, 1, PAL.hullDark)
  }

  return c
}

/**
 * Two maps, deliberately.
 *
 * Eviction here is FIFO and never promotes on use, so a hot entry can be
 * dropped for a cold one the moment a map is over its bound. Ships and scenery
 * reach 299 keys and figures reach 120; sharing one 400-bound map put them at
 * 419 combined and a full-screen hull could be evicted in favour of a soldier
 * variant seen once. Split, each map keeps >= 35% headroom and neither can
 * evict the other's hot entries.
 */
const figCache = new Map()

function bounded(map, key, build, limit) {
  let hit = map.get(key)
  if (!hit) {
    hit = build()
    map.set(key, hit)
    if (map.size > limit) {
      const oldest = map.keys().next().value
      if (oldest !== key) map.delete(oldest)
    }
  }
  return hit
}

/** Ships and scenery. */
export function getSprite(key, build) {
  return bounded(cache, key, build, 400)
}

/** Soldier bodies and leg strips. */
export function getFigSprite(key, build) {
  return bounded(figCache, key, build, 192)
}

export function hopliteBodySprite(h) {
  return getFigSprite(hopliteBodyKey(h), () => buildBody(h))
}

export function shipSprite(v) {
  return getSprite(shipKey(v), () => buildShip(v))
}

/** Distant hull on the horizon: a silhouette, no detail at that range. */
export function farShipSprite(variant) {
  return getSprite(`far:${variant}`, () => {
    const W = 22
    const H = 9
    const { c, ctx } = surface(W, H)
    // Lighter than the headlands: silhouetted against near-black water, a hull
    // in the same violet as the sea simply is not there.
    const ink = PAL.islandFar
    R(ctx, 2, 6, 18, 2, ink)
    R(ctx, 0, 7, 22, 1, ink)
    R(ctx, 10, 1, 1, 5, ink)
    if (variant === 0) R(ctx, 6, 2, 9, 4, ink)
    else if (variant === 1) R(ctx, 7, 3, 7, 3, ink)
    else R(ctx, 5, 2, 11, 3, ink)
    return c
  })
}

/** The Pharos: a stepped tower with a fire bowl instead of a glass lamp. */
/**
 * A temple on the headland, with the altar fire burning before it.
 *
 * This replaces a stepped Pharos lighthouse, which was an anachronism: the
 * Pharos is a 3rd-century-BC Ptolemaic building and has no business in a
 * Homeric Odyssey. A temple and a burning altar are period-correct, and they
 * give the Torchbearers' fire an honest source — every torch on the quay is lit
 * from this altar.
 */
/**
 * The sanctuary on the headland: a Doric temple on its own rocky podium.
 *
 * Redesigned from the 30px toy: the columns now stand in front of a genuinely
 * dark cella, which is what gives a colonnade depth at any scale; the pediment
 * carries a recessed tympanum and acroteria; and the whole building sits on a
 * crag of rough courses instead of floating on the quay. Body colours stay in
 * the muted stone ramp so the ships keep the stage — marble is spent only on
 * the sun-facing edges, and the altar fire remains the focal point.
 */
export function templeSprite() {
  return getSprite('temple', () => {
    const W = 64
    const H = 54
    const { c, ctx } = surface(W, H)
    const mid = 32

    // Acroterion at the apex, and at both eaves.
    R(ctx, mid - 1, 0, 2, 2, PAL.marbleShade)
    R(ctx, 2, 9, 2, 2, PAL.marbleShade)
    R(ctx, W - 4, 9, 2, 2, PAL.marbleShade)

    // Pediment: raking cornice over a recessed tympanum.
    for (let r = 0; r <= 8; r++) {
      const half = Math.round(2 + r * 3.6)
      R(ctx, mid - half, 2 + r, half * 2, 1, PAL.stoneFar)        // tympanum
      // Runs of 5 against a 3.6px/row slope overlap row-to-row, so the rake
      // reads as one continuous diagonal instead of a dotted line.
      R(ctx, mid - half, 2 + r, 5, 1, PAL.marble)                 // lit rake, sun side
      R(ctx, mid + half - 5, 2 + r, 5, 1, PAL.marbleShade)        // far rake
    }

    // Horizontal cornice, then the frieze with its triglyph beat.
    R(ctx, 1, 11, W - 2, 1, PAL.marble)
    R(ctx, 1, 12, W - 2, 1, PAL.bronzeShade)
    R(ctx, 2, 13, W - 4, 3, PAL.stoneFarLit)
    for (let x = 4; x < W - 4; x += 6) R(ctx, x, 13, 2, 3, PAL.stoneFar)
    R(ctx, 2, 16, W - 4, 2, PAL.stoneFar)
    R(ctx, 2, 16, W - 4, 1, PAL.stoneFarLit)

    // The cella: darkness behind the colonnade. This recess is what makes the
    // columns read as standing bodies rather than stripes.
    R(ctx, 3, 18, W - 6, 16, PAL.shadeCool)
    R(ctx, 3, 18, W - 6, 2, '#1b1235')

    // Six Doric columns: abacus, shaft with one lit flute, base.
    for (let i = 0; i < 6; i++) {
      const x = 5 + Math.round(i * 10.6)
      R(ctx, x - 1, 18, 5, 1, PAL.marble)          // abacus
      R(ctx, x, 19, 1, 1, PAL.marbleShade)         // echinus
      R(ctx, x, 19, 3, 14, PAL.stoneFarLit)        // shaft
      R(ctx, x, 19, 1, 14, PAL.marbleShade)        // lit flute, upper-left sun
      R(ctx, x + 2, 19, 1, 14, PAL.stoneFar)       // shade side
      R(ctx, x - 1, 33, 5, 1, PAL.stoneFarLit)     // base
    }

    // Stylobate: three steps, each course wider than the one above.
    R(ctx, 2, 34, W - 4, 1, PAL.marble)
    R(ctx, 2, 35, W - 4, 2, PAL.stoneFarLit)
    R(ctx, 1, 37, W - 2, 2, PAL.stoneFar)
    R(ctx, 0, 39, W, 2, PAL.wallFar)

    // The crag: rough retaining courses down to the quay, edges broken so it
    // reads as living rock dressed with masonry, not a floating box.
    for (let r = 0; r < 13; r++) {
      const y = 41 + r
      const inset = (r % 3 === 0) ? 1 : 0
      R(ctx, inset, y, W - inset * 2, 1, r % 4 < 2 ? PAL.wallFar : PAL.stoneFar)
    }
    for (let x = 4; x < W; x += 11) R(ctx, x, 44, 1, 7, PAL.shadeCool)
    R(ctx, 0, 41, W, 1, PAL.stoneFarLit)

    return c
  })
}

/**
 * The Great Altar before the temple: a stepped stone base, a carved table with
 * a bronze band, and a broad tripod fire-bowl. The fire itself is animated by
 * the scene — height and smoke scale with the MON each block burns.
 */
export function altarSprite() {
  return getSprite('altar', () => {
    const W = 18
    const H = 22
    const { c, ctx } = surface(W, H)

    // Fire-bowl: a rounded bronze cauldron on a stem, not a table. The belly
    // narrows row by row and the rim alone is lit, so it reads as a vessel.
    R(ctx, 5, 5, 8, 1, PAL.bronzeLit)    // rim, catching the fire
    R(ctx, 4, 6, 10, 1, PAL.bronze)      // shoulder, widest course
    R(ctx, 5, 7, 8, 1, PAL.bronze)
    R(ctx, 6, 8, 6, 1, PAL.bronzeDark)   // belly turning away
    R(ctx, 8, 9, 2, 2, PAL.bronzeShade)  // stem
    R(ctx, 7, 10, 4, 1, PAL.bronzeDark)  // foot

    // Altar table: shaded slab with a single continuous bronze inlay.
    R(ctx, 2, 11, 14, 1, PAL.marbleShade)
    R(ctx, 2, 11, 5, 1, PAL.marble)      // sun catches the left of the slab
    R(ctx, 2, 12, 14, 4, PAL.stoneFarLit)
    R(ctx, 2, 12, 1, 4, PAL.marbleShade)
    R(ctx, 3, 13, 12, 1, PAL.bronzeDark)
    R(ctx, 2, 15, 14, 1, PAL.stoneFar)

    // Steps.
    R(ctx, 1, 16, 16, 2, PAL.stoneFar)
    R(ctx, 1, 16, 16, 1, PAL.stoneFarLit)
    R(ctx, 0, 18, 18, 2, PAL.wallFar)
    R(ctx, 0, 20, 18, 2, PAL.shadeCool)

    return c
  })
}

/** Amphorae stacked on the quay. */
export function amphoraSprite(variant) {
  return getSprite(`amphora:${variant}`, () => {
    const W = 7
    const H = 11
    const { c, ctx } = surface(W, H)
    const clay = variant === 0 ? '#8a4b2e' : variant === 1 ? '#a35c33' : '#6f3c25'
    R(ctx, 3, 0, 1, 2, clay)
    R(ctx, 2, 2, 3, 1, clay)
    R(ctx, 1, 3, 5, 5, clay)
    R(ctx, 2, 8, 3, 2, clay)
    R(ctx, 3, 10, 1, 1, clay)
    R(ctx, 1, 4, 1, 3, PAL.bronzeLit)
    R(ctx, 0, 4, 1, 2, clay)
    R(ctx, 6, 4, 1, 2, clay)
    R(ctx, 2, 5, 3, 1, PAL.linen)
    return c
  })
}

/** A ruined colonnade at the head of the quay. */
export function colonnadeSprite() {
  return getSprite('colonnade', () => {
    const W = 34
    const H = 26
    const { c, ctx } = surface(W, H)
    // Architrave, broken away on the right.
    R(ctx, 0, 2, 24, 3, PAL.marble)
    R(ctx, 0, 5, 24, 1, PAL.marbleShade)
    R(ctx, 0, 0, 22, 2, PAL.marbleShade)
    // Columns: three standing, one snapped off.
    for (const [x, top] of [[2, 6], [11, 6], [20, 6], [29, 14]]) {
      R(ctx, x, top, 4, H - top - 1, PAL.marble)
      R(ctx, x + 3, top, 1, H - top - 1, PAL.marbleShade)
      // Fluting.
      for (let y = top + 1; y < H - 1; y += 3) R(ctx, x + 1, y, 1, 1, PAL.marbleShade)
      R(ctx, x - 1, top, 6, 1, PAL.marble)
    }
    R(ctx, 0, H - 1, W, 1, PAL.marbleShade)
    return c
  })
}

export function cloudSprite(variant) {
  return getSprite(`cloud:${variant}`, () => {
    const W = 30
    const H = 8
    const { c, ctx } = surface(W, H)
    const lumps = variant === 0 ? [[2, 4, 10, 3], [8, 2, 12, 4], [18, 3, 9, 3]]
      : variant === 1 ? [[0, 3, 14, 4], [10, 1, 10, 4]]
        : [[4, 3, 8, 3], [10, 2, 14, 4], [20, 4, 8, 2]]
    for (const [x, y, w, h] of lumps) R(ctx, x, y, w, h, PAL.cloud)
    for (const [x, y, w] of lumps) R(ctx, x + 1, y, w - 2, 1, PAL.cloudLit)
    return c
  })
}

export function clearSpriteCache() {
  figCache.clear()
  cache.clear()
}
