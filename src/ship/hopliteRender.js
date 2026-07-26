/**
 * Drawing the Torchbearers.
 *
 * Three passes per frame so that light on the stone sits under the figures and
 * sparks sit over them:
 *   1. ground  — wake, hearthglow
 *   2. figures — legs, body, flame (three small blits)
 *   3. over    — quickstep, lastlight emission, the mote pool
 *
 * Two culls keep the worst case flat on a full deck. A soldier aboard who is
 * not in the frontmost occupied rank has its legs and its flame skipped: the
 * rank in front covers rows 4-16 (DECK_ROW_STEP 4 against HOPLITE_H 17), so
 * the legs are provably invisible, and same-column seats are exactly 4px
 * apart, so 4px flames would otherwise tile into one continuous fire bar.
 *
 * Aboard figures are drawn inside the same keel transform as their hull so they
 * shrink with SHIP_SCALE and depthScale — deck crew stays proportional.
 */
import {
  hopliteBodySprite, DECK_COLS, seatOffsetNative,
  SHIP_NATIVE_W, SHIP_NATIVE_H, SHIP_W, SHIP_H, SHIP_SCALE, HOPLITE_W, HOPLITE_H,
} from './sprites'
import { legsSprite, poseFor } from './poses'
import { flameSprite } from './flames'
import { RANK_UNLIT, RANK_EMBER } from './ranks'
import { GROUND_ABILITIES, OVER_ABILITIES, MAX_WAKE_LEAPERS } from './abilities'
import { drawMotes } from './motes'
import { depthScale } from './odysseyScene'

function figureScale(y) {
  return depthScale(y) * SHIP_SCALE
}

/** Flame flicker rate, doubled once a soldier has been called to a plank. */
const FLICKER_HZ = 7.5
/** Below this much torch life left, even an Ember reads as going out. */
const GUTTER_OUT = 0.35

/**
 * True when this soldier is buried behind a later deck rank.
 * @param {{state: string, seat?: number, ship?: {passengers: {length: number}}|null}} h
 */
function buried(h) {
  if (h.state !== 'aboard' || !h.ship) return false
  return (h.seat || 0) < h.ship.passengers.length - DECK_COLS
}

/**
 * Effective rank for the flame: a guttering torch drops to an Ember and then
 * goes out entirely. Burndown only ever fires when the Odyssey genuinely has
 * no berth wanting crew, which is the only way it can be truthful.
 *
 * @param {{rank: number, guttering?: boolean, gutterLeft?: number}} h
 */
function flameRank(h) {
  if (!h.guttering) return h.rank
  return (h.gutterLeft || 0) < GUTTER_OUT ? RANK_UNLIT : RANK_EMBER
}

/**
 * Paint one figure at native pixel size (quay / leap / leave).
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} h
 * @param {string} pose
 * @param {number} x
 * @param {number} y
 * @param {number} t
 * @param {boolean} hidden
 */
function paintFigure(ctx, h, pose, x, y, t, hidden) {
  if (!hidden) ctx.drawImage(legsSprite(pose, h.traits.whale), x, y)
  ctx.drawImage(hopliteBodySprite(h.traits), x, y)

  if (!hidden) {
    const rank = flameRank(h)
    if (rank !== RANK_UNLIT) {
      const hz = h.called ? FLICKER_HZ * 2 : FLICKER_HZ
      const flame = flameSprite(rank, Math.floor(t * hz + h.traits.bob) & 3)
      if (flame) ctx.drawImage(flame, x, y - 1)
    }
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<object>} hoplites
 * @param {number} t
 */
export function drawHoplites(ctx, hoplites, t) {
  // ── pass 1: ground ───────────────────────────────────────────────────
  let wakeLeft = MAX_WAKE_LEAPERS
  for (const h of hoplites) {
    if (h.state === 'gone') continue
    for (const ability of GROUND_ABILITIES) {
      if (h.rank < ability.minRank || h.rank > ability.maxRank) continue
      if (ability.id === 'wake') {
        if (wakeLeft <= 0) continue
        if (!ability.when(h)) continue
        wakeLeft--
        ability.paint(ctx, h, t)
        continue
      }
      if (ability.when(h)) ability.paint(ctx, h, t)
    }
  }

  // ── pass 2: figures ──────────────────────────────────────────────────
  for (const h of hoplites) {
    if (h.state === 'gone') continue
    const { pose, dx, dy } = poseFor(h, t)
    const bob = h.state === 'queued' && pose === 'stand'
      ? Math.round(Math.sin(t * h.traits.rate + h.traits.bob))
      : 0

    const fading = h.alpha < 1
    if (fading) ctx.globalAlpha = Math.max(0, h.alpha)
    else if (h.synthetic) ctx.globalAlpha = 0.82

    const hidden = buried(h)

    // Deck crew: same keel transform as the hull so they stay proportional.
    if (h.state === 'aboard' && h.ship) {
      const ship = h.ship
      const sc = figureScale(ship.y)
      const seat = seatOffsetNative(ship.load, h.seat || 0)
      ctx.save()
      ctx.translate(ship.x + SHIP_W / 2, ship.y + SHIP_H)
      ctx.scale(sc, sc)
      ctx.translate(-SHIP_NATIVE_W / 2, -SHIP_NATIVE_H)
      paintFigure(ctx, h, pose, seat.dx + dx, seat.dy + dy, t, hidden)
      ctx.restore()
    } else {
      const x = Math.round(h.x) + dx
      const y = Math.round(h.y) + dy + bob
      // Mid-leap: ease toward the destination hull's scale so the jump lands
      // on a matching size rather than snapping at touchdown.
      if ((h.state === 'leaping' || h.state === 'marching') && h.ship && h.pathLen > 0) {
        const k = Math.max(0, Math.min(1, h.dist / h.pathLen))
        const sc = 1 + (figureScale(h.ship.y) - 1) * k
        if (Math.abs(sc - 1) > 0.02) {
          ctx.save()
          ctx.translate(x + HOPLITE_W / 2, y + HOPLITE_H)
          ctx.scale(sc, sc)
          ctx.translate(-HOPLITE_W / 2, -HOPLITE_H)
          paintFigure(ctx, h, pose, 0, 0, t, hidden)
          ctx.restore()
        } else {
          paintFigure(ctx, h, pose, x, y, t, hidden)
        }
      } else {
        paintFigure(ctx, h, pose, x, y, t, hidden)
      }
    }

    if (fading || h.synthetic) ctx.globalAlpha = 1
  }

  // ── pass 3: over ─────────────────────────────────────────────────────
  for (const h of hoplites) {
    if (h.state === 'gone') continue
    for (const ability of OVER_ABILITIES) {
      if (h.rank < ability.minRank || h.rank > ability.maxRank) continue
      if (ability.when(h)) ability.paint(ctx, h, t)
    }
  }
  drawMotes(ctx)
}
