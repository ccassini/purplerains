import { toMon } from './stakingMath'

/**
 * Shared MON display formatting.
 *
 * Three components previously each carried their own `formatMon`, which drifted
 * apart on rounding and on whether the input was wei or MON.
 */

/**
 * @param {number} value amount in MON
 * @param {{ compact?: boolean, digits?: number }} [options]
 *   `compact` abbreviates millions/thousands; `digits` sets precision below 1000.
 * @returns {string}
 */
export function formatMonAmount(value, { compact = true, digits = 2 } = {}) {
  if (!Number.isFinite(value) || value === 0) return '0'
  const abs = Math.abs(value)

  if (compact) {
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
    if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}K`
  }
  if (abs >= 1) return value.toFixed(digits)
  if (abs >= 0.0001) return value.toFixed(4)
  return value.toExponential(2)
}

/**
 * @param {bigint|string|number|null} wei
 * @param {{ compact?: boolean, digits?: number }} [options]
 * @returns {string}
 */
export function formatMonFromWei(wei, options) {
  return formatMonAmount(toMon(wei), options)
}

/**
 * Small USD amounts beside the reward projection.
 *
 * @param {number|null} value
 * @returns {string|null} null when there is nothing meaningful to show
 */
export function formatUsdSmall(value) {
  if (!Number.isFinite(value) || value <= 0) return null
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  if (value >= 1) return `$${value.toFixed(2)}`
  return `$${value.toFixed(4)}`
}
