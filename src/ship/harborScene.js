/**
 * Draws the Odyssey harbour. Pure rendering — every function takes state and
 * paints, so the simulation in engine.js stays independent of how it looks.
 *
 * Troy-wide panorama: a deep buffer, the quay held high so a vast band of
 * water opens below, and traffic stacked by depth (horizon fleet → berths →
 * fairway → outbound) so hulls can fill the sea from the back without
 * crowding into a single line.
 */
import {
  PAL, BASE_H, surface, bandGradient, drawPixelText, measurePixelText, formatHullTail,
} from './pixel'
import {
  getSprite,
  shipSprite, farShipSprite, templeSprite, altarSprite, amphoraSprite,
  cloudSprite, hullDepth,
  HOPLITE_W, HOPLITE_H, SHIP_W, SHIP_H, SHIP_NATIVE_W, SHIP_NATIVE_H, SHIP_SCALE,
  DECK_Y, DECK_Y_WORLD, OAR_COUNT, OAR_X0, OAR_STEP,
} from './sprites'

/** Quay surface — high in frame so the sea below reads as an open theatre. */
export const PIER_Y = Math.round(BASE_H * 0.30)
/**
 * Horizon well above the quay: open water behind the pier, room for a distant
 * fleet, then the berths and the foreground lanes.
 */
export const SEA_Y = PIER_Y - 42
/** Sprite top of a trireme lying alongside the quay. */
export const BERTH_Y = PIER_Y + 8
/**
 * Sprite top of the inbound fairway. Arrivals run down it to their berth, so a
 * ship bound for the far berth passes in front of the ones already alongside.
 */
export const TRANSIT_Y = Math.round(BASE_H * 0.52)
/** Deep fleet lane — pass-through hulls that linger in mid water. */
export const FLEET_Y = Math.round(BASE_H * 0.62)
/** Mid water — faster pass-through blocks. */
export const PASS_Y = Math.round(BASE_H * 0.72)
/**
 * Foreground outbound lane. Departures drop here so they do not meet the next
 * arrival head-on in the fairway.
 */
export const OUTBOUND_Y = Math.round(BASE_H * 0.86)
/** Open-water lanes — four depths so the sea can carry a denser fleet. */
export const LANES = [TRANSIT_Y, FLEET_Y, PASS_Y, OUTBOUND_Y]

/**
 * Nine berths in a single front row — side by side along the quay edge.
 * Relief still stacks behind each hull on the fairway; the apron itself
 * always reads as a line of nine.
 */
export const BERTH_COUNT = 9
export const BERTH_COLS = 9
export const BERTH_ROWS = 1
/** Unused with a single row; kept for berthY math. */
export const BERTH_ROW_GAP = 0

export const HARBOUR_NAME = 'MONAD ODYSSEY'
/** Right edge of the queue — keep a little air before the Pharos, not a long march. */
export const QUEUE_RIGHT_PAD = 28

/** Where a hoplite's sprite sits when standing on the quay. */
export const QUAY_FEET_Y = PIER_Y - HOPLITE_H + 1

export const berthCol = (i) => ((i % BERTH_COLS) + BERTH_COLS) % BERTH_COLS
export const berthRow = (i) => Math.floor(i / BERTH_COLS)

/**
 * Column pitch — nine hulls abreast span nearly the full quay width.
 */
const berthPitch = (w) =>
  Math.max(SHIP_W + 4, Math.min(SHIP_W + 14, Math.round((w * 0.94) / BERTH_COLS)))

export const berthX = (w, i) => Math.round(w * 0.03) + berthCol(i) * berthPitch(w)
/** Sprite top for berth `i` — single front row on the quay edge. */
export const berthY = (i) => BERTH_Y + berthRow(i) * BERTH_ROW_GAP
/** Gangplank head on the quay — one per berth. */
export const rampTopX = (w, i) => berthX(w, berthCol(i)) + SHIP_W + 8
/** Foot of the gangplank, on the ship's after deck. */
export const rampFootX = (w, i) => berthX(w, i) + SHIP_W - 6
/**
 * Muster starts just abaft the leftmost plank; with nine abreast the line
 * hugs the ships rather than stretching past the apron.
 */
export const queueStartX = (w) => rampTopX(w, 0) + 2
/** Queue ends soon after the last plank. */
export const queueEndX = (w) =>
  Math.min(w - (w >= 560 ? QUEUE_RIGHT_PAD : 12), rampTopX(w, BERTH_COLS - 1) + 36)

/**
 * Perspective scale from horizon (small) to foreground (full). Wider range so
 * the sea reads deeper and can hold more hulls without looking like one line.
 */
export function depthScale(y) {
  if (y < BERTH_Y) {
    const t = (y - SEA_Y) / Math.max(1, BERTH_Y - SEA_Y)
    return 0.26 + 0.52 * Math.max(0, Math.min(1, t))
  }
  const t = (y - BERTH_Y) / Math.max(1, OUTBOUND_Y - BERTH_Y)
  return 0.78 + 0.22 * Math.max(0, Math.min(1, t))
}

/**
 * Figure scale for a hull (and anyone standing on its deck): depth × ship scale.
 * @param {number} y
 */
export function shipFigureScale(y) {
  return depthScale(y) * SHIP_SCALE
}

const SKY_STOPS = [
  [0, PAL.skyVault],
  [0.14, PAL.skyTop],
  [0.30, PAL.skyDeep],
  [0.46, PAL.skyMid],
  [0.60, PAL.skyDusk],
  [0.72, PAL.skyLow],
  [0.84, PAL.skyEmber],
  [0.93, PAL.skyHorizon],
]

const SEA_STOPS = [
  [0, PAL.seaHorizon],
  [0.16, PAL.seaFar],
  [0.42, PAL.seaMid],
  [0.64, PAL.seaDeep],
  [0.82, PAL.seaNear],
  [0.94, PAL.seaWine],
]

const R = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h) }

/**
 * Fixed star field. Generated once from a hashed sequence rather than
 * Math.random so the sky does not reshuffle on every resize.
 */
const STARS = (() => {
  const out = []
  let s = 0x9e3779b9
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  for (let i = 0; i < 70; i++) {
    out.push({
      // Stored as a 0..1 fraction of width so the field stretches with the buffer.
      fx: next(),
      y: 2 + Math.floor(next() * (SEA_Y - 50)),
      phase: next() * Math.PI * 2,
      bright: next(),
    })
  }
  return out
})()

export function drawSky(ctx, w, t) {
  bandGradient(ctx, 0, 0, w, SEA_Y, SKY_STOPS, 9)

  // Stars: they thin out toward the lit horizon, so fade them by height.
  for (const st of STARS) {
    const fade = 1 - st.y / (SEA_Y - 34)
    if (fade <= 0.05) continue
    const tw = (Math.sin(t * 1.4 + st.phase) + 1) / 2
    ctx.globalAlpha = Math.max(0, Math.min(1, fade * (0.25 + tw * 0.75)))
    R(ctx, Math.round(st.fx * w), st.y, 1, 1, st.bright > 0.72 ? PAL.star : PAL.starDim)
  }
  ctx.globalAlpha = 1

  drawSun(ctx, w)

  // Drifting clouds: three parallax rows, wrapped by modulo.
  for (let row = 0; row < 3; row++) {
    const speed = 4 + row * 2.5
    const y = 10 + row * 20
    const span = w + 60
    for (let i = 0; i < 3; i++) {
      const base = (i * span) / 3
      const x = Math.round(((base - t * speed) % span + span) % span) - 30
      ctx.drawImage(cloudSprite((row + i) % 3), x, y)
    }
  }

  drawHeadlands(ctx, w)
  drawBirds(ctx, w, t)
}

/** Horizontal position of the setting sun, as a fraction of the buffer width. */
const SUN_FX = 0.24
const SUN_R = 13

export const sunX = (w) => Math.round(w * SUN_FX)

/**
 * A half-set sun: a pixel disc clipped at the waterline, sliced by horizontal
 * gaps that widen toward the bottom. Sitting it *on* the horizon rather than
 * floating above it is what stops it reading as a stray rectangle in the sky.
 */
function drawSun(ctx, w) {
  const cx = sunX(w)
  // High enough that the headlands cut across the lower third of the disc
  // rather than swallowing it whole.
  const cy = SEA_Y - 20
  for (let dy = -SUN_R; dy <= SUN_R; dy++) {
    const y = cy + dy
    if (y >= SEA_Y) break
    const dx = Math.floor(Math.sqrt(SUN_R * SUN_R - dy * dy))
    if (dx <= 0) continue
    // Slice gaps: none near the top, thickening as the disc meets the sea.
    const depth = (dy + SUN_R) / (SUN_R * 2)
    if (depth > 0.52 && (y % 4 === 0 || (depth > 0.8 && y % 2 === 0))) continue
    R(ctx, cx - dx, y, dx * 2 + 1, 1, dy < -3 ? PAL.sunCore : PAL.sun)
  }
}

/**
 * Two silhouette ridges on the horizon, giving the water somewhere to go.
 * The profile never animates, so it is baked into a strip once per width
 * instead of costing a fillRect per column every frame.
 */
const RIDGE_H = 14
let ridgeStrip = null

function buildRidges(w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = RIDGE_H
  const g = c.getContext('2d')
  g.imageSmoothingEnabled = false

  const ridge = (color, height, offset, step) => {
    for (let x = 0; x < w; x++) {
      const n =
        Math.sin((x + offset) * 0.031) * 0.6 +
        Math.sin((x + offset) * 0.011) * 0.4 +
        Math.sin((x + offset) * 0.07) * 0.15
      // Quantise the profile so the ridge keeps a blocky, hand-placed look.
      const h = Math.max(0, Math.round((((n + 1) / 2) * height) / step) * step)
      if (h > 0) R(g, x, RIDGE_H - h, 1, h, color)
    }
  }
  ridge(PAL.islandFar, 12, 40, 2)
  ridge(PAL.islandNear, 7, 320, 2)
  // Waterline lip so the ridges sit in the sea rather than float over it.
  R(g, 0, RIDGE_H - 1, w, 1, PAL.islandNear)
  return c
}

function drawHeadlands(ctx, w) {
  if (!ridgeStrip || ridgeStrip.width !== w) ridgeStrip = buildRidges(w)
  ctx.drawImage(ridgeStrip, 0, SEA_Y - RIDGE_H)
}

function drawBirds(ctx, w, t) {
  for (let i = 0; i < 3; i++) {
    const span = w + 80
    const x = Math.round(((-t * (9 + i * 3) + i * 140) % span + span) % span) - 40
    const y = 18 + i * 9 + Math.round(Math.sin(t * 0.9 + i) * 3)
    // Two-frame flap: a shallow V and a flat line.
    const up = Math.sin(t * 6 + i * 2) > 0
    if (up) {
      R(ctx, x, y, 2, 1, PAL.bird)
      R(ctx, x + 2, y + 1, 1, 1, PAL.bird)
      R(ctx, x + 3, y, 2, 1, PAL.bird)
    } else {
      R(ctx, x, y + 1, 2, 1, PAL.bird)
      R(ctx, x + 2, y, 1, 1, PAL.bird)
      R(ctx, x + 3, y + 1, 2, 1, PAL.bird)
    }
  }
}

export function drawSea(ctx, w, t) {
  bandGradient(ctx, 0, SEA_Y, w, BASE_H - SEA_Y, SEA_STOPS, 8)

  // Sun path: broken dashes fanning out under the sun, brightest at the
  // horizon and breaking up into single flecks as the water gets closer.
  const sx = sunX(w)
  R(ctx, sx - 12, SEA_Y, 25, 1, PAL.sunSea)
  for (let y = SEA_Y + 2; y < BASE_H; y += 3) {
    const depth = (y - SEA_Y) / (BASE_H - SEA_Y)
    // Thin the path out with distance so it does not cut the whole scene in
    // half — near the ships it should be flecks, not a solid column.
    if (depth > 0.35 && y % 9 > 2) continue
    const spread = Math.round(9 * (1.1 - depth))
    const dashes = depth < 0.2 ? 2 : 1
    for (let i = 0; i < dashes; i++) {
      const off = Math.round(Math.sin(t * 1.3 + y * 0.55 + i * 2.2) * spread)
      const len = Math.max(2, Math.round((1 - depth) * 7))
      R(ctx, sx + off - (len >> 1), y, len, 1, depth < 0.28 ? PAL.sunSea : PAL.sunSeaDim)
    }
  }

  // Wave dashes, scrolling slowly to give the water direction. Rows further
  // down move faster and sit further apart, which is the cheapest way to buy
  // perspective in a flat pixel scene.
  for (let row = 0; row < 22; row++) {
    const y = SEA_Y + 5 + row * 14
    if (y >= BASE_H) break
    const speed = 4 + row * 1.35
    const gap = 28 + row * 5
    const offset = Math.round(((-t * speed) % gap + gap) % gap)
    for (let x = -gap + offset; x < w + gap; x += gap) {
      R(ctx, x, y, 3, 1, PAL.seaFoam)
      R(ctx, x + 6, y, 2, 1, PAL.seaFoam)
    }
  }
}

/** Hulls on the open water behind the quay — a Troy fleet on a wide buffer. */
export function drawFarShips(ctx, w, t) {
  const count = w > 1200 ? 9 : w > 900 ? 7 : w > 640 ? 5 : 4
  for (let i = 0; i < count; i++) {
    const span = w + 100
    const band = i % 3
    const x = Math.round(((-t * (1.6 + i * 0.85) + i * 150) % span + span) % span) - 50
    const y = SEA_Y + 1 + band * 7 + Math.round(Math.sin(t * 0.45 + i * 1.4) * 0.6)
    const sc = 0.55 + band * 0.12
    const spr = farShipSprite(i % 3)
    const dw = Math.round(spr.width * sc)
    const dh = Math.round(spr.height * sc)
    ctx.drawImage(spr, x, y, dw, dh)
  }
}

/**
 * The mole: a monumental ashlar breakwater, not a plank walkway.
 *
 * Two courses of dressed stone under a marble coping, the Monad-purple kerb
 * line kept as the one violet flourish, bronze mooring bollards along the
 * seaward edge, and massive stone piers running down into the water where thin
 * wooden pilings used to be. Everything hangs DOWNWARD from PIER_Y: the
 * walking surface, the soldiers' feet and the berth line are untouched.
 *
 * The repeating masonry is baked once into a 90px tile (the berth pitch, so
 * the pattern breathes with the harbour's own rhythm) and blitted across —
 * thirteen drawImages instead of a few hundred fillRects per frame.
 */
/**
 * THE MOLE, rebuilt to sit inside the scene instead of on top of it.
 *
 * Reads from the top down: marble coping catching the low sun, the Monad kerb
 * (the one violet flourish), then ashlar courses that DARKEN with depth until
 * they meet their own shadow at the waterline — the same value ramp the sea
 * behind them uses, which is what makes wall and water feel lit by one sky.
 * One bay per berth: a capital-topped pier at every berth boundary, a bronze
 * mooring ring on the face of each bay, and the wine-dark water lapping the
 * foot. The repeating masonry is baked into one tile and blitted.
 */
const QUAY_TILE_W = 64
const QUAY_TILE_H = 26
function quayTileSprite() {
  return getSprite('quay-tile', () => {
    const { c, ctx } = surface(QUAY_TILE_W, QUAY_TILE_H)
    const W = QUAY_TILE_W
    // Row 0: marble coping edge. Row 1: the Monad kerb. Rows 2..25: courses.
    R(ctx, 0, 0, W, 1, PAL.marble)
    R(ctx, 0, 1, W, 1, PAL.pierGlow)
    // Courses, darkening with depth — the wall shares the sea's value ramp.
    R(ctx, 0, 2, W, 6, PAL.pierKerb)
    R(ctx, 0, 8, W, 7, PAL.pierTop)
    R(ctx, 0, 15, W, 7, PAL.pierFace)
    R(ctx, 0, 22, W, 4, PAL.pierLeg)
    // Staggered joints, one shadow pixel each, offset per course.
    for (let x = 0; x < W; x += 16) {
      R(ctx, x, 2, 1, 6, PAL.pierFace)
      R(ctx, (x + 8) % W, 8, 1, 7, PAL.pierLeg)
      R(ctx, x, 15, 1, 7, PAL.pierLeg)
    }
    // Course shadow lines: each course sits IN the wall, not painted on it.
    R(ctx, 0, 8, W, 1, PAL.pierLeg)
    R(ctx, 0, 15, W, 1, PAL.pierLeg)
    // A few weathered blocks, slightly lighter — stone that has seen weather.
    R(ctx, 20, 4, 8, 2, PAL.pierTop)
    R(ctx, 44, 10, 8, 2, PAL.pierKerb)
    R(ctx, 6, 17, 10, 2, PAL.pierTop)
    return c
  })
}

export function drawQuay(ctx, w) {
  const tile = quayTileSprite()
  for (let x = 0; x < w; x += QUAY_TILE_W) ctx.drawImage(tile, x, PIER_Y - 2)

  // One pier per berth boundary, so every berth reads as its own bay. The
  // pier carries the wall down into the water with a lit west face.
  for (let c = 0; c <= BERTH_COLS; c++) {
    const px = (c < BERTH_COLS ? rampTopX(w, c) : rampTopX(w, BERTH_COLS - 1) + 76) - 26
    if (px < -14 || px > w + 4) continue
    R(ctx, px - 2, PIER_Y + 22, 14, 3, PAL.pierFace)   // capital
    R(ctx, px - 2, PIER_Y + 22, 14, 1, PAL.pierKerb)
    R(ctx, px, PIER_Y + 25, 10, 34, PAL.pierLeg)       // shaft into the water
    R(ctx, px, PIER_Y + 25, 2, 34, PAL.pierFace)       // lit west face — one sun
    // Its reflection, broken by the swell.
    R(ctx, px + 2, PIER_Y + 61, 6, 1, PAL.seaDeep)
  }

  // Bronze mooring rings on the face of each bay.
  for (let c = 0; c < BERTH_COLS; c++) {
    const bx = rampTopX(w, c) + 14
    R(ctx, bx, PIER_Y + 10, 3, 1, PAL.bronzeDark)
    R(ctx, bx, PIER_Y + 11, 1, 2, PAL.bronze)
    R(ctx, bx + 2, PIER_Y + 11, 1, 2, PAL.bronzeDark)
    R(ctx, bx, PIER_Y + 13, 3, 1, PAL.bronzeDark)
  }

  // The waterline: a shadow where wall meets sea, and wine-dark glints where
  // the swell laps the stone.
  R(ctx, 0, PIER_Y + 24, w, 1, PAL.pierLeg)
  R(ctx, 0, PIER_Y + 25, w, 1, PAL.seaDeep)
  for (let x = 9; x < w; x += 46) {
    R(ctx, x, PIER_Y + 25, 5, 1, PAL.wineLit)
    R(ctx, x + 23, PIER_Y + 26, 3, 1, PAL.seaGlint)
  }
}

export function drawQuayProps(ctx, w) {
  const y = PIER_Y

  ctx.drawImage(amphoraSprite(0), w - 42, y - 11)
  ctx.drawImage(amphoraSprite(2), w - 36, y - 10)

  // One bollard per berth along the front row.
  for (let c = 0; c < BERTH_COLS; c++) {
    const px = rampTopX(w, c) + 2
    R(ctx, px, y - 5, 3, 5, PAL.marbleShade)
    R(ctx, px, y - 6, 3, 1, PAL.bronze)
  }
}

/**
 * The temple and its altar fire at the left end of the quay — every torch in
 * the muster is lit from this flame.
 */
export function drawTemple(ctx, w, t, burnGlow = 0) {
  const temple = templeSprite()
  // The sanctuary holds the LEFT headland — the muster and berths keep the
  // east quay, so the colonnade never stands inside the soldiers.
  const x = 6
  const y = PIER_Y - temple.height + 2
  ctx.drawImage(temple, x, y)

  // The Great Altar stands on the sacred way before the temple (toward the berths).
  const altar = altarSprite()
  const ax = x + temple.width + 10
  const ay = PIER_Y - altar.height + 1
  ctx.drawImage(altar, ax, ay)

  // Firelight pooled on the stone — the altar is the quay's one warm light.
  R(ctx, ax - 2, PIER_Y - 1, altar.width + 4, 1, PAL.bronzeDark)

  // The standing fire: never out, guttering like a fire and not a lamp.
  const cx = ax + 8
  const rim = ay + 4
  const flare = (Math.sin(t * 3.1) + Math.sin(t * 1.7)) / 2
  R(ctx, cx - 1, rim - 2, 4, 2, PAL.beaconLamp)
  R(ctx, cx, rim - 3, 2, 1, PAL.sunCore)
  if (flare > 0) {
    ctx.globalAlpha = 0.3 + flare * 0.4
    R(ctx, cx, rim - 5, 2, 2, PAL.beaconLamp)
    R(ctx, cx + (flare > 0.5 ? 1 : 0), rim - 6, 1, 1, PAL.sunCore)
    ctx.globalAlpha = 1
  }

  // The burnt offering: each block's destroyed MON feeds the column. Taller
  // and hotter with the burn, smoke stepping leeward — pixels, not gradients.
  if (burnGlow > 0.05) {
    const h2 = Math.round(2 + burnGlow * 8)
    ctx.globalAlpha = 0.4 + burnGlow * 0.5
    R(ctx, cx - 1, rim - 4 - h2, 4, h2, PAL.beaconLamp)
    R(ctx, cx, rim - 5 - h2, 2, Math.max(2, h2 - 2), PAL.sunCore)
    ctx.globalAlpha = 0.16 + burnGlow * 0.3
    R(ctx, cx - 3, rim - 8 - h2, 3, 2, PAL.marbleShade)
    R(ctx, cx - 7, rim - 11 - h2, 4, 2, PAL.marbleShade)
    R(ctx, cx - 12, rim - 13 - h2, 4, 1, PAL.marbleShade)
    ctx.globalAlpha = 1
  }
}

/** Harbour name board, standing on the quay beside the colonnade. */
export function drawSignpost(ctx, label = HARBOUR_NAME) {
  const boardW = measurePixelText(label) + 12
  // East of the sanctuary: temple + altar own the first ~110px of the quay.
  const x = 116
  const top = PIER_Y - 27

  R(ctx, x + 3, top + 13, 2, 14, PAL.marbleShade)
  R(ctx, x + boardW - 5, top + 13, 2, 14, PAL.marbleShade)

  R(ctx, x, top, boardW, 13, PAL.plate)
  R(ctx, x, top, boardW, 1, PAL.bronze)
  R(ctx, x, top + 12, boardW, 1, PAL.black)
  R(ctx, x, top, 1, 13, PAL.bronze)
  R(ctx, x + boardW - 1, top, 1, 13, PAL.black)
  drawPixelText(ctx, label, x + 6, top + 4, PAL.plateText)
}

/**
 * Oars, drawn per frame so they can pull. A moored ship ships its oars: they
 * stand upright against the hull instead of sweeping.
 */
function drawOars(ctx, ship, x, y, t) {
  const top = y + DECK_Y + 1 + hullDepth(ship.traits.size)
  for (let i = 0; i < OAR_COUNT; i++) {
    const bx = x + OAR_X0 + i * OAR_STEP
    if (!ship.rowing) {
      R(ctx, bx, top - 9, 1, 8, PAL.hullMid)
      continue
    }
    // A stroke cycle offset along the bank reads as a wave running aft.
    const reach = Math.round(Math.sin(t * 4.4 + ship.phase + i * 0.34) * 4)
    for (let k = 0; k < 7; k++) {
      R(ctx, bx + Math.round((reach * k) / 6), top + k, 1, 1, k > 4 ? PAL.seaGlint : PAL.hullMid)
    }
  }
}

/**
 * Pre-rendered hull nameboards, keyed by the 4-digit block tail. Boards repeat
 * only every 10,000 blocks, so a small ring comfortably covers every hull on
 * screen; the oldest board is evicted once the ring fills. One drawImage per
 * hull replaces ~85 per-frame glyph fills.
 */
const LABEL_RING_MAX = 32
const labelRing = new Map()

/** Board margin around the text: 2px each side, text sits at (2, 2). */
const LABEL_PAD = 2
const LABEL_BOARD_H = 9

function hullLabelSprite(label) {
  const cached = labelRing.get(label)
  if (cached) return cached
  const tw = measurePixelText(label)
  const { c, ctx } = surface(tw + LABEL_PAD * 2, LABEL_BOARD_H)
  // A hull nameboard: near-black ground with a lit upper edge, so it reads
  // as a painted plank rather than a hole cut in the strake.
  R(ctx, 0, 0, tw + LABEL_PAD * 2, LABEL_BOARD_H, PAL.black)
  R(ctx, 0, 0, tw + LABEL_PAD * 2, 1, PAL.hullMid)
  drawPixelText(ctx, label, LABEL_PAD, LABEL_PAD, PAL.linen)
  if (labelRing.size >= LABEL_RING_MAX) {
    labelRing.delete(labelRing.keys().next().value)
  }
  labelRing.set(label, c)
  return c
}

/** Reused depth-sort buffer — no per-frame array allocation. */
const shipsByDepth = []

export function drawShips(ctx, ships, t) {
  // Nearer water last: a ship running down the fairway to the far berth has to
  // pass in front of the ones already alongside, not through them. Sorted into
  // a reused module buffer so the per-frame [...ships] copy never allocates.
  shipsByDepth.length = 0
  for (const s of ships) shipsByDepth.push(s)
  shipsByDepth.sort((a, b) => a.y - b.y)

  for (const s of shipsByDepth) {
    const sprite = shipSprite(s.traits)
    const bob = s.rowing ? Math.round(Math.sin(t * 1.1 + s.phase) * 1) : 0
    const x = Math.round(s.x)
    const y = Math.round(s.y) + bob
    const sc = depthScale(s.y)

    ctx.save()
    ctx.translate(x + SHIP_W / 2, y + SHIP_H)
    ctx.scale(sc * SHIP_SCALE, sc * SHIP_SCALE)
    ctx.translate(-SHIP_NATIVE_W / 2, -SHIP_NATIVE_H)

    drawOars(ctx, s, 0, 0, t)
    ctx.drawImage(sprite, 0, 0)

    // Wake trailing astern.
    if (s.rowing) {
      R(ctx, SHIP_NATIVE_W, DECK_Y + 5, 5, 1, PAL.seaFoam)
      R(ctx, SHIP_NATIVE_W + 6, DECK_Y + 6, 3, 1, PAL.seaGlint)
    }
    ctx.restore()

    // The block's 4-digit tail on the strake — blitted outside the ship
    // transform so the 3x5 font stays snapped to whole buffer pixels. The
    // full height is one glance away in the HUD.
    if (s.number) {
      const s2 = sc * SHIP_SCALE
      const board = hullLabelSprite(formatHullTail(s.number))
      // Native (SHIP_NATIVE_W/2, DECK_Y + 2) projected back into buffer space.
      const cx = Math.round(x + SHIP_W / 2)
      const ly = Math.round(y + SHIP_H - (SHIP_NATIVE_H - (DECK_Y + 2)) * s2)
      const lx = cx - Math.round((board.width - LABEL_PAD * 2) / 2)
      ctx.drawImage(board, lx - LABEL_PAD, ly - LABEL_PAD)
    }
  }
}

/**
 * The gangplank between quay and deck. `extend` runs 0..1 so it can be run out
 * as a ship moors and hauled in before it casts off.
 */
export function drawGangplank(ctx, ship, extend, w) {
  if (extend <= 0.01) return
  const slot = ship.slot || 0
  const x0 = rampTopX(w, slot)
  const y0 = PIER_Y + 1
  const x1 = rampFootX(w, slot) + Math.round(ship.x - berthX(w, slot))
  const y1 = Math.round(ship.y) + DECK_Y_WORLD

  const steps = Math.max(1, Math.abs(x0 - x1))
  const end = Math.round(steps * extend)
  for (let i = 0; i <= end; i++) {
    const k = i / steps
    const x = Math.round(x0 + (x1 - x0) * k)
    const y = Math.round(y0 + (y1 - y0) * k)
    R(ctx, x, y, 1, 3, PAL.hullLit)
    R(ctx, x, y, 1, 1, PAL.deck)
    // Cleats, so the plank does not read as a plain diagonal line.
    if (i % 5 === 0) R(ctx, x, y - 1, 1, 1, PAL.bronzeDark)
  }
}

/** Soft vignette — light on the sides so a Troy-wide sea keeps its edges. */
export function drawVignette(ctx, w) {
  ctx.globalAlpha = 0.1
  R(ctx, 0, 0, w, 18, PAL.black)
  R(ctx, 0, BASE_H - 14, w, 14, PAL.black)
  ctx.globalAlpha = 0.05
  R(ctx, 0, 0, 10, BASE_H, PAL.black)
  R(ctx, w - 10, 0, 10, BASE_H, PAL.black)
  ctx.globalAlpha = 1
}

export { HOPLITE_W, HOPLITE_H, SHIP_W, SHIP_H, SHIP_SCALE, DECK_Y, DECK_Y_WORLD }
