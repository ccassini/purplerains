/**
 * Pure, deterministic mapping from a sealed block (tx count + gas fill) to the
 * trireme that carries it: hull size tier, deck capacity, and how many
 * soldiers actually board.
 *
 * Kept free of engine state so the whole formula is unit-testable and the
 * visual hull size can never drift from the logical deck load — both derive
 * from the same utilization number.
 *
 * Typed with JSDoc and checked by `npm run typecheck` (tsc in checkJs mode):
 * the repo's ESLint gate parses JS only, so JSDoc keeps the types real and
 * enforced without a second parser.
 *
 * @typedef {0 | 1 | 2} SizeTier
 *
 * @typedef {object} BlockLoadInput
 * @property {number | null} [transactionCount] Transactions sealed in the block.
 * @property {number | null} [fillPct] Gas utilization, as a 0–1 fraction or a 0–100 percent.
 *
 * @typedef {object} ShipLoadPlan
 * @property {SizeTier} size Hull size step: 0 small, 1 mid, 2 large. Drives sprite + draft.
 * @property {number} capacity Deck seats for this hull size.
 * @property {number} load Soldiers that board. 0 ≤ load ≤ min(capacity, txCount).
 * @property {number} utilization Normalized 0–1 utilization the size/load were derived from.
 * @property {number} txCount Sanitized tx count (non-negative integer).
 */

/** Deck seats per hull size — a fat block visibly carries a bigger crew. */
export const TIER_CAPACITY = /** @type {const} */ ([12, 16, 20])

/** The honor guard: floor and ceiling of a sealed block's muster. */
export const MUSTER_MIN = 10
export const MUSTER_MAX = 20

/** Tx count that reads as a "full" block when gas fill is unavailable. */
const TX_FULL = 200

/** Utilization thresholds for stepping up a hull size. */
const TIER_UP_1 = 0.25
const TIER_UP_2 = 0.7

/**
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * Normalize a fill reading to 0–1. Feeds disagree on units: some report a
 * fraction (0.06), some a percent (6). Values ≤ 1 are treated as fractions,
 * anything above as percent. NaN / negative → 0.
 *
 * @param {number | null | undefined} raw
 * @returns {number}
 */
export function normalizeFill(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0
  return clamp(n <= 1 ? n : n / 100, 0, 1)
}

/**
 * Non-negative integer tx count; NaN and negatives collapse to 0.
 *
 * @param {number | null | undefined} raw
 * @returns {number}
 */
export function sanitizeTxCount(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.floor(n)
}

/**
 * Blend gas fill with tx volume into one 0–1 utilization figure.
 *
 * max() rather than average: either signal alone should be enough to make the
 * ship ride low — a 90%-gas block with 3 txs is heavy, and so is a 500-tx
 * block of cheap transfers. sqrt on the tx ratio lifts the low end so busy
 * blocks under TX_FULL still register.
 *
 * @param {BlockLoadInput} input
 * @returns {number}
 */
export function blockUtilization(input) {
  const fill = normalizeFill(input.fillPct)
  const txRatio = clamp(sanitizeTxCount(input.transactionCount) / TX_FULL, 0, 1)
  return clamp(Math.max(fill, Math.sqrt(txRatio) * 0.85), 0, 1)
}

/**
 * Hull size tier from utilization — the same number the load comes from.
 *
 * @param {number} u
 * @returns {SizeTier}
 */
export function sizeForUtilization(u) {
  if (u >= TIER_UP_2) return 2
  if (u >= TIER_UP_1) return 1
  return 0
}

/**
 * Full plan for one block.
 *
 * `load` is REPRESENTATION, not gas fill: the deck musters an honor guard of
 * the block's own transactions, scaled logarithmically with how many the block
 * sealed. A 10k-tx block cannot show 10k soldiers; it shows a full guard of
 * twenty. Invariants:
 *  - 0 tx    → load 0 (an empty block sails empty)
 *  - 1..9 tx → load = txCount (never more soldiers than transactions)
 *  - >=10 tx → load in [10..20]: 10→10, 100→15, 1000→20, saturating
 *  - hull size still derives from the utilization blend, so a heavy block
 *    rides low even when its guard is capped
 *
 * @param {BlockLoadInput} input
 * @returns {ShipLoadPlan}
 */
export function planShipLoad(input) {
  const txCount = sanitizeTxCount(input.transactionCount)
  const utilization = blockUtilization(input)
  const size = sizeForUtilization(utilization)
  const capacity = TIER_CAPACITY[size]
  let load
  if (txCount === 0) {
    load = 0
  } else if (txCount < MUSTER_MIN) {
    load = txCount
  } else {
    // Log decades: one deck row per decade of transactions above ten.
    const scaled = MUSTER_MIN + (MUSTER_MAX - MUSTER_MIN) * ((Math.log10(txCount) - 1) / 2)
    load = clamp(Math.round(scaled), MUSTER_MIN, MUSTER_MAX)
  }
  // Structural today (TX_FULL keeps big musters on big hulls), but guaranteed
  // here so a future tier retune can never seat a guard beyond its deck.
  load = Math.min(load, capacity)
  return { size, capacity, load, utilization, txCount }
}
