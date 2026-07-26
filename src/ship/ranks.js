/**
 * Rank of a torchbearer, and the choice of who boards next.
 *
 * Rank is DERIVED, never rolled. Every tier falls out of signals the
 * transaction already carries (value, gas price against the live percentiles),
 * so appearance always encodes chain data — which is the premise of the whole
 * visualiser. No `rnd()` is consumed here, so adding ranks cannot disturb the
 * deterministic per-hash sprite stream in `hopliteFromTx`.
 *
 * Pure module: imports nothing, touches no canvas, and is type-checked by
 * `npm run typecheck`.
 *
 * @typedef {object} RankTraits
 * @property {boolean} [whale]    value >= 100 MON, or gas at/above the p99 sample
 * @property {boolean} [priority] not a whale, but gas at/above the p90 sample
 * @property {boolean} [heavy]    value >= 100 MON
 * @property {boolean} [urgent]   gas at/above the p99 sample
 *
 * @typedef {object} QueuedLike
 * @property {string} state
 * @property {string} hash
 * @property {number} [rank]
 */

export const RANK_UNLIT = 0
export const RANK_EMBER = 1
export const RANK_KINDLER = 2
export const RANK_BEARER = 3
export const RANK_ARCHON = 4

/** Display names, indexed by rank. */
export const RANK_NAMES = Object.freeze([
  'Unlit', 'Ember', 'Kindler', 'Bearer', 'Archon',
])

/**
 * Rank for a soldier.
 *
 * Archon is strictly nested inside whale (heavy AND urgent implies whale), so
 * anything keyed off `traits.whale` — the gold body, the laurel, the inspector
 * tag — keeps working untouched.
 *
 * @param {RankTraits} traits
 * @param {boolean} [synthetic] deck filler the sampler never saw
 * @returns {number}
 */
export function rankFor(traits, synthetic = false) {
  if (synthetic) return RANK_UNLIT
  if (traits.heavy && traits.urgent) return RANK_ARCHON
  if (traits.whale) return RANK_BEARER
  if (traits.priority) return RANK_KINDLER
  return RANK_EMBER
}

/**
 * Choose the next soldier to board.
 *
 * THE RULE, absolute: a soldier boards only the ship whose block contains its
 * transaction. There is deliberately NO fallback to unrelated queued soldiers —
 * that fallback existed once and quietly put transactions on ships that never
 * sealed them. Among the block's own soldiers, the highest rank goes first,
 * oldest first on ties.
 *
 * Load-bearing property (tested): returns non-null iff an ELIGIBLE soldier
 * whose hash is in the manifest exists. It selects WHO, never WHETHER beyond
 * that rule, and can never change HOW MANY — capacity.js owns the count.
 *
 * @param {ReadonlyArray<QueuedLike>} hoplites
 * @param {{has: (hash: string) => boolean}} manifest
 * @param {(q: QueuedLike) => boolean} [isEligible] extra gate, e.g. close
 *   enough to the plank to make the leap
 * @returns {QueuedLike | null}
 */
export function pickQueued(hoplites, manifest, isEligible) {
  /** @type {QueuedLike | null} */
  let best = null
  for (const q of hoplites) {
    if (q.state !== 'queued') continue
    if (!manifest.has(q.hash)) continue
    if (isEligible && !isEligible(q)) continue
    // Strict `>` keeps the oldest soldier of equal rank at the front.
    if (!best || (q.rank || 0) > (best.rank || 0)) best = q
  }
  return best
}
