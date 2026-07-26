/**
 * Pixel-art rendering surface and palette.
 *
 * Everything is drawn once into a small offscreen canvas (a few hundred pixels
 * tall) and then blitted to the visible canvas with smoothing disabled. That is
 * what makes the art read as real pixel art rather than as small vector shapes,
 * and it also means the per-frame fill cost is tiny no matter how large the
 * window is.
 */

/** Internal vertical resolution — tall enough for a deep sea band under the quay. */
export const BASE_H = 380
/** Floor / ceiling for the internal width — Troy-wide harbour, not a cropped dock. */
export const MIN_BASE_W = 720
export const MAX_BASE_W = 1760

/**
 * Monad Odyssey palette: a bronze-age embarkation at dusk. Violet water and
 * skies keep the Monad identity, while bronze, marble and linen carry the
 * Aegean theme. The harbour this idea came from is a warm daylight scene with
 * a cartoon palette, so the two never read alike.
 */
export const PAL = {
  // ── NYX · sky, zenith → waterline
  skyVault:   '#0d0726',
  skyTop:     '#170e36',
  skyDeep:    '#200052', // Monad blue, exact
  skyMid:     '#3b1f5e',
  skyDusk:    '#5c2a6b',
  skyLow:     '#7a3a72',
  skyEmber:   '#a44f7d',
  skyHorizon: '#c76a86',

  // ── HELIOS
  sun:     '#ffd9a0',
  sunCore: '#fff3d6',

  // ── CLOUD / STARS / DISTANCE
  cloud:      '#54306e',
  cloudLit:   '#8b5a94',
  star:       '#efe6ff',
  starDim:    '#a78bfa',
  islandFar:  '#4a2a72',
  islandNear: '#301c52',
  bird:       '#2a1a44',
  // Distant hulls were inked in islandFar at 1.20:1 against the water — all
  // but invisible. This lifts the far fleet to 1.80:1.
  hullFar:     '#6b4890',
  wallFar:     '#543271',
  wallFarLit:  '#71427e',
  stoneFar:    '#3f2760',
  stoneFarLit: '#57376f',
  haze:        '#b06a8e',

  // ── AEGEAN · the sea ramp now ends in wine, not neutral black
  seaHorizon: '#3a2668',
  seaFar:     '#2a1c52',
  seaMid:     '#20194a',
  seaDeep:    '#1b1240',
  seaNear:    '#1a0e30',
  seaWine:    '#1d0a26',

  seaFoam:   '#7c6bff',
  seaGlint:  '#a78bfa',
  seaCrest:  '#dcd6ff',
  wineLit:   '#a0055d', // Monad berry, exact
  wineHot:   '#d1568c',
  sunSea:    '#e8899b',
  sunSeaDim: '#9c5c86',

  // ── THE MOLE · quay
  pierGlow: '#836ef9', // Monad purple on the 1px kerb — the most brand-legible row in the scene
  pierKerb: '#7c6e96',
  pierTop:  '#4a3570',
  pierFace: '#33254f',
  pierLeg:  '#241a3c',

  // ── WEATHERED WOOD
  hullDark: '#2a1a10',
  hullMid:  '#4a2f1d',
  hullLit:  '#7a5230',
  deck:     '#a1743f',
  hullWorn: '#5b3a22',

  // ── LINEN
  sailA: '#efe3c8',
  sailB: '#e0c9a0',
  linen: '#efe3c8',

  // ── BRONZE, a six-step ramp. A hoplite must carry one pixel from the top of
  // this ramp and one from the bottom, or the silhouette dissolves.
  bronzeShade: '#3a2412',
  bronzeDark:  '#6e4a20',
  bronze:      '#c98b3f',
  bronzeLit:   '#f0c27b',
  bronzeHot:   '#f5c97a',
  shadeCool:   '#2b1d4d',

  // ── MARBLE / GOLD / STATUS
  marble:      '#e8e0f5',
  marbleShade: '#a396c4',
  gold:        '#fcd34d',
  crimson:     '#d94a5a',
  crimsonLit:  '#e8697a',
  laurel:      '#8fae5a',
  laurelLit:   '#9dba63',
  skin:        '#c9927a',

  // ── PLATE / BEACON / INK
  plate:      '#0f0a24',
  plateText:  '#d8ceff',
  beacon:     '#e9d5ff',
  beaconLamp: '#fcd34d',
  beaconBand: '#836ef9', // Monad purple, exact
  // Rationed to a handful of pixels a frame: the Archon's flame cap only.
  white: '#fbfaf9',      // Monad off-white, exact
  black: '#0b0718',
  abyss: '#050310',

  /* Monad brand purple, sampled from public/monad_logo.png. The fleet's own
     colours — the mark on the sail and the masthead streamer. */
  monad:    '#836ef9',
  monadLit: '#a394ff',
}

/** 3x5 bitmap font — digits, uppercase and the punctuation the scene uses. */
const GLYPHS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  A: ['111', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['111', '100', '100', '100', '111'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '111', '100', '111'],
  F: ['111', '100', '111', '100', '100'],
  G: ['111', '100', '101', '101', '111'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '111'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['110', '101', '101', '101', '101'],
  O: ['111', '101', '101', '101', '111'],
  P: ['111', '101', '111', '100', '100'],
  Q: ['111', '101', '101', '111', '001'],
  R: ['111', '101', '111', '110', '101'],
  S: ['111', '100', '111', '001', '111'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
  '#': ['101', '111', '101', '111', '101'],
  '.': ['000', '000', '000', '000', '010'],
  ',': ['000', '000', '000', '010', '010'],
  '-': ['000', '000', '111', '000', '000'],
  ':': ['000', '010', '000', '010', '000'],
  '/': ['001', '001', '010', '100', '100'],
  '+': ['000', '010', '111', '010', '000'],
  '·': ['000', '000', '010', '000', '000'],
  ' ': ['000', '000', '000', '000', '000'],
}

export const GLYPH_W = 3
export const GLYPH_H = 5

/** Width in pixels of `text` rendered with drawPixelText (1px letter spacing). */
export function measurePixelText(text) {
  const s = String(text)
  return s.length * (GLYPH_W + 1) - 1
}

/**
 * Draw text using the bitmap font. Unknown characters are skipped so a stray
 * label never throws mid-frame.
 */
export function drawPixelText(ctx, text, x, y, color) {
  ctx.fillStyle = color
  let cx = x
  // The font is uppercase-only, so fold rather than dropping lowercase input.
  for (const ch of String(text).toUpperCase()) {
    const rows = GLYPHS[ch]
    if (rows) {
      for (let r = 0; r < GLYPH_H; r++) {
        const row = rows[r]
        for (let c = 0; c < GLYPH_W; c++) {
          if (row[c] === '1') ctx.fillRect(cx + c, y + r, 1, 1)
        }
      }
    }
    cx += GLYPH_W + 1
  }
}

/** Thousands-separated block number, matching the harbour's label style. */
export function formatBlockLabel(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '#0'
  return `#${Math.floor(v).toLocaleString('de-DE')}`
}

/**
 * Block number painted on a hull: the full height, separated so it stays
 * readable at four pixels per digit. No leading '#' — at three pixels wide that
 * glyph is indistinguishable from an 'A', and it would cost four more pixels
 * the hull does not have.
 */
export function formatHullLabel(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0'
  return Math.floor(v).toLocaleString('de-DE')
}

/**
 * The last four digits of a block height — what a hull can actually carry.
 *
 * A full Monad height is ten characters ("90.310.315"), which at four pixels
 * per glyph is 39px of a 54px hull: unreadable at 1x however it is drawn. Four
 * digits fit with room to breathe, and the full height is one glance away in
 * the HUD and the berth gauge.
 *
 * @param {number | string} n
 * @returns {string}
 */
export function formatHullTail(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0000'
  return String(Math.floor(v)).slice(-4).padStart(4, '0')
}

/**
 * Fill one axis-aligned block of pixels. The whole scene is built from this.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {string} color
 */
export const R = (ctx, x, y, w, h, color) => {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

/**
 * A small offscreen canvas with smoothing off, for building a cached sprite.
 *
 * @param {number} w
 * @param {number} h
 */
export function surface(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = false
  return { c, ctx }
}

/**
 * Creates the low-res draw surface plus the blit-to-screen step.
 *
 * @param {HTMLCanvasElement} target visible canvas
 */
export function createPixelSurface(target) {
  const view = target.getContext('2d')
  const buffer = document.createElement('canvas')
  const ctx = buffer.getContext('2d')

  let baseW = MIN_BASE_W
  let scale = 1

  function resize() {
    const cssW = target.clientWidth || 1
    const cssH = target.clientHeight || 1

    // Keep pixels square: the internal height is fixed and the width follows
    // the viewport's aspect, clamped so ultrawide windows do not explode it.
    const aspect = cssW / cssH
    baseW = Math.max(MIN_BASE_W, Math.min(MAX_BASE_W, Math.round(BASE_H * aspect)))

    if (buffer.width !== baseW || buffer.height !== BASE_H) {
      buffer.width = baseW
      buffer.height = BASE_H
    }

    // Integer scaling wherever possible keeps every art pixel the same size;
    // the remainder is covered by a fractional stretch on the long axis.
    scale = Math.max(1, Math.min(cssW / baseW, cssH / BASE_H))

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const nextW = Math.round(cssW * dpr)
    const nextH = Math.round(cssH * dpr)
    if (target.width !== nextW || target.height !== nextH) {
      target.width = nextW
      target.height = nextH
    }
    view.setTransform(dpr, 0, 0, dpr, 0, 0)
    view.imageSmoothingEnabled = false
    ctx.imageSmoothingEnabled = false
    return { baseW, baseH: BASE_H, scale, cssW, cssH }
  }

  function present() {
    const cssW = target.clientWidth || 1
    const cssH = target.clientHeight || 1
    view.imageSmoothingEnabled = false
    view.clearRect(0, 0, cssW, cssH)
    // Cover the viewport; the scene is composed so the edges are safe to crop.
    const s = Math.max(cssW / baseW, cssH / BASE_H)
    const w = baseW * s
    const h = BASE_H * s
    view.drawImage(buffer, Math.round((cssW - w) / 2), Math.round((cssH - h) / 2), w, h)
  }

  return {
    ctx,
    present,
    resize,
    get width() { return baseW },
    get height() { return BASE_H },
    /** Map a client point into buffer space, for hit testing. */
    toBuffer(clientX, clientY, rect) {
      const cssW = rect.width || 1
      const cssH = rect.height || 1
      const s = Math.max(cssW / baseW, cssH / BASE_H)
      const offX = (cssW - baseW * s) / 2
      const offY = (cssH - BASE_H * s) / 2
      return {
        x: (clientX - rect.left - offX) / s,
        y: (clientY - rect.top - offY) / s,
      }
    },
  }
}

/** Fill a vertical gradient as hard bands so it stays in the pixel idiom. */
export function bandGradient(ctx, x, y, w, h, stops, bands = 10) {
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1 || 1)
    ctx.fillStyle = pickStop(stops, t)
    const y0 = Math.round(y + (h * i) / bands)
    const y1 = Math.round(y + (h * (i + 1)) / bands)
    ctx.fillRect(x, y0, w, y1 - y0)
  }
}

function pickStop(stops, t) {
  // stops: [[0, color], [1, color], ...] — nearest-below wins, no interpolation,
  // which is what gives the banded retro sky.
  let color = stops[0][1]
  for (const [pos, c] of stops) {
    if (t >= pos) color = c
  }
  return color
}
