/**
 * The plain of Ilion: backdrop for the /odysseyVS siege.
 *
 * Left edge: the wine-dark sea and Monad's beached hulls — soldiers land from
 * ships. Right edge: the fortress of Troy, whose gate pours out the coalition.
 * Between them: the plain where the two block-space armies meet.
 *
 * Same pixel law as the harbour: PAL colors only, hard edges, nothing blurs.
 */
import { PAL, R, bandGradient } from '../ship/pixel'

/** Where Monad's landing party steps ashore. */
export const SHORE_X = 86
/** The fortress gate mouth — the coalition's spawn line. */
export const GATE_INSET = 96
/** The battle band on the plain (world y). */
export const FIELD_TOP = 216
export const FIELD_BOTTOM = 330
/** Horizon of the plain. */
const PLAIN_Y = 200
const SEA_W = 64

export const gateX = (w) => w - GATE_INSET

/** Deterministic tiny hash for scatter patterns. */
const scatter = (i, k) => {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function drawSky(ctx, w) {
  bandGradient(ctx, 0, 0, w, PLAIN_Y, [
    PAL.skyTop, PAL.skyDeep, PAL.skyMid, PAL.skyDusk,
    PAL.skyLow, PAL.skyEmber, PAL.skyHorizon,
  ], 14)
  // War stars: sparse, high, still.
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(scatter(i, 1) * w)
    const y = Math.floor(scatter(i, 2) * 80)
    R(ctx, x, y, 1, 1, i % 5 ? PAL.starDim : PAL.star)
  }
  // Siege smoke rising off the horizon toward the citadel.
  for (let i = 0; i < 5; i++) {
    const x = w - 150 - i * 38
    const hgt = 26 + Math.floor(scatter(i, 3) * 22)
    R(ctx, x, PLAIN_Y - 46 - hgt, 3, hgt, PAL.cloud)
    R(ctx, x + 1, PLAIN_Y - 52 - hgt, 2, 8, PAL.cloudLit)
  }
}

function drawSea(ctx) {
  bandGradient(ctx, 0, PLAIN_Y - 4, SEA_W, FIELD_BOTTOM + 18 - (PLAIN_Y - 4), [
    PAL.seaHorizon, PAL.seaFar, PAL.seaMid, PAL.seaDeep, PAL.seaNear, PAL.seaWine,
  ], 12)
  // Foam kerb where the plain meets the water.
  for (let y = PLAIN_Y + 6; y < FIELD_BOTTOM + 12; y += 9) {
    const wob = Math.floor(scatter(y, 4) * 4)
    R(ctx, SEA_W - 3 + wob, y, 2, 1, PAL.seaFoam)
  }
}

/** A beached hull, bow up the strand: the landing craft the army walks off. */
function drawBeachedShip(ctx, x, y, big) {
  const hw = big ? 46 : 36
  const hh = big ? 11 : 9
  R(ctx, x, y, hw, hh, PAL.hullMid)
  R(ctx, x, y, hw, 2, PAL.hullLit)
  R(ctx, x, y + hh - 2, hw - 6, 2, PAL.hullDark)
  R(ctx, x + hw - 4, y - 4, 3, 6, PAL.hullLit) // raised prow
  R(ctx, x + 4, y - 3, 2, 3, PAL.hullWorn)
  // Furled mast and the Monad streamer.
  R(ctx, x + Math.floor(hw / 2), y - 12, 2, 12, PAL.hullDark)
  R(ctx, x + Math.floor(hw / 2) + 2, y - 12, 6, 3, PAL.pierGlow)
  // Boarding plank down to the sand.
  R(ctx, x + hw - 10, y + hh - 1, 10, 2, PAL.deck)
}

/** Monad's shore camp: hulls ashore, a standard planted in the sand. */
function drawCamp(ctx, t, monadImg) {
  drawBeachedShip(ctx, 18, 236, true)
  drawBeachedShip(ctx, 8, 286, false)
  // The planted standard: bronze pole, purple field, the diamond void.
  const sx = SHORE_X - 6
  R(ctx, sx, 206, 2, 34, PAL.bronzeDark)
  R(ctx, sx + 2, 206, 13, 11, PAL.pierGlow)
  R(ctx, sx + 2, 206, 13, 1, '#a78bfa')
  if (monadImg && monadImg.complete && monadImg.naturalWidth) {
    ctx.drawImage(monadImg, sx + 4, 208, 9, 9)
  } else {
    R(ctx, sx + 7, 208, 3, 1, '#0b0718')
    R(ctx, sx + 6, 209, 5, 3, '#0b0718')
    R(ctx, sx + 7, 212, 3, 1, '#0b0718')
    R(ctx, sx + 8, 210, 1, 1, PAL.pierGlow) // the void at the diamond's heart
  }
  // Watchfire on the strand.
  const f = Math.floor(t * 6) & 1
  R(ctx, sx - 14, 238, 6, 2, PAL.bronzeShade)
  R(ctx, sx - 13, 234 + f, 4, 4 - f, PAL.gold)
  R(ctx, sx - 12, 233 + f, 2, 2, PAL.sunCore)
}

/**
 * The fortress: courses of far-stone, two towers, the gate of Ilion, and one
 * banner course carrying the colors of every chain on the field.
 */
function drawFortress(ctx, w, t, banners) {
  const x0 = w - GATE_INSET
  const wallW = GATE_INSET
  // Inner keep rising behind the curtain wall.
  R(ctx, x0 + 24, 96, wallW - 24, 40, PAL.stoneFar)
  R(ctx, x0 + 24, 96, wallW - 24, 3, PAL.stoneFarLit)
  R(ctx, x0 + 40, 78, 26, 22, PAL.wallFar)
  R(ctx, x0 + 40, 78, 26, 2, PAL.wallFarLit)
  // Curtain wall over the whole battle band.
  R(ctx, x0, 136, wallW, FIELD_BOTTOM + 14 - 136, PAL.wallFar)
  R(ctx, x0, 136, wallW, 4, PAL.wallFarLit)
  // Stone courses: staggered joints, cut not blurred.
  for (let y = 148; y < FIELD_BOTTOM; y += 12) {
    R(ctx, x0, y, wallW, 1, PAL.stoneFar)
    const off = ((y / 12) & 1) ? 9 : 2
    for (let jx = x0 + off; jx < w - 3; jx += 17) {
      R(ctx, jx, y + 1, 1, 11, PAL.stoneFar)
    }
  }
  // Crenellations.
  for (let cx = x0 + 2; cx < w - 6; cx += 12) {
    R(ctx, cx, 128, 7, 8, PAL.wallFar)
    R(ctx, cx, 128, 7, 2, PAL.wallFarLit)
  }
  // Flanking towers.
  for (const tx of [x0 - 12, w - 26]) {
    R(ctx, tx, 108, 22, FIELD_BOTTOM + 14 - 108, PAL.stoneFar)
    R(ctx, tx, 108, 22, 3, PAL.stoneFarLit)
    R(ctx, tx - 2, 100, 26, 8, PAL.wallFar)
    R(ctx, tx - 2, 100, 26, 2, PAL.wallFarLit)
    for (let cy = 118; cy < FIELD_BOTTOM; cy += 22) {
      R(ctx, tx + 9, cy, 4, 6, PAL.skyVault) // arrow slit
    }
  }
  // The Skaian gate: a bronze-doored arch pouring the coalition onto the plain.
  const gx = x0 + Math.floor((wallW - 34) / 2)
  R(ctx, gx - 3, 234, 40, FIELD_BOTTOM + 14 - 234, PAL.stoneFar)
  R(ctx, gx, 242, 34, FIELD_BOTTOM + 14 - 242, PAL.hullDark)
  R(ctx, gx + 2, 246, 30, FIELD_BOTTOM + 12 - 246, PAL.bronzeShade)
  R(ctx, gx + 4, 246, 2, FIELD_BOTTOM + 10 - 246, PAL.bronzeDark)
  R(ctx, gx + 28, 246, 2, FIELD_BOTTOM + 10 - 246, PAL.bronzeDark)
  // Torch sconces either side of the gate, alive.
  const f = Math.floor(t * 5 + 1) & 1
  for (const sx of [gx - 8, gx + 40]) {
    R(ctx, sx, 250, 2, 8, PAL.bronzeDark)
    R(ctx, sx - 1, 246 + f, 4, 4 - f, PAL.gold)
  }
  // The banner course: every chain on the field flies its color AND its mark.
  let bx = x0 + 4
  for (const b of banners.slice(0, 6)) {
    R(ctx, bx, 138, 2, 20, PAL.bronzeDark)
    R(ctx, bx + 2, 138, 12, 13, b.color)
    R(ctx, bx + 2, 151, 10, 2, b.color)
    R(ctx, bx + 2, 138, 12, 1, PAL.marbleShade)
    if (b.img && b.img.complete && b.img.naturalWidth) {
      ctx.drawImage(b.img, bx + 4, 140, 9, 9)
    }
    bx += 16
  }
}

function drawPlain(ctx, w) {
  bandGradient(ctx, 0, PLAIN_Y, w, FIELD_BOTTOM + 18 - PLAIN_Y, [
    '#3d2b50', '#352544', '#2d203a', '#261b31', '#1f1628',
  ], 10)
  // Scrub, stones and old wheel-ruts — no two rows repeat.
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(scatter(i, 7) * w)
    const y = PLAIN_Y + 8 + Math.floor(scatter(i, 8) * (FIELD_BOTTOM - PLAIN_Y))
    if (x < SEA_W + 8 || x > w - GATE_INSET - 8) continue
    const kind = i % 7
    if (kind === 0) R(ctx, x, y, 2, 1, '#5a4468')
    else if (kind === 1) R(ctx, x, y, 1, 2, '#241a30')
    else R(ctx, x, y, 1, 1, kind & 1 ? '#514060' : '#2e2338')
  }
}

/**
 * The front line: a strip of churned earth under the melee, drawn beneath the
 * figures. Position comes from the sim; nothing decorative moves it.
 */
function drawFront(ctx, frontX, t) {
  for (let y = FIELD_TOP - 2; y < FIELD_BOTTOM + 6; y += 3) {
    const wob = Math.floor(scatter(y, 9) * 5) - 2
    R(ctx, Math.round(frontX) + wob, y, 2, 2, '#241a30')
  }
  // Dust of the press, breathing with the clock.
  const puff = Math.floor(t * 4) % 3
  R(ctx, Math.round(frontX) - 4, FIELD_TOP - 8 - puff, 3, 2, '#5a4468')
  R(ctx, Math.round(frontX) + 3, FIELD_TOP - 13 + puff, 2, 2, '#4a3560')
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w world width
 * @param {number} t elapsed seconds
 * @param {{frontX: number, banners: Array<{color: string, img?: object}>,
 *          monadImg?: object}} opts
 */
export function drawWarScene(ctx, w, t, opts) {
  drawSky(ctx, w)
  drawPlain(ctx, w)
  drawSea(ctx)
  drawFortress(ctx, w, t, opts.banners || [])
  drawCamp(ctx, t, opts.monadImg)
  drawFront(ctx, opts.frontX, t)
}
