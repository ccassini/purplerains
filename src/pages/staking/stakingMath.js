/**
 * Pure staking arithmetic.
 *
 * Kept free of React and of wei/BigInt plumbing at the edges so the yield
 * numbers shown next to a "Delegate" button are unit-testable — see
 * `__tests__/stakingMath.test.js`.
 */

const BPS = 10_000
const WEI_PER_MON = 10n ** 18n
const DAYS_PER_YEAR = 365
const MONTHS_PER_YEAR = 12

/**
 * A delegator's share of the base APY after the validator's commission.
 *
 * @param {number} baseApyBps network base APY in basis points
 * @param {number} commissionBps validator commission in basis points
 * @returns {number} net APY in basis points
 */
export function netApyBps(baseApyBps, commissionBps) {
  if (!Number.isFinite(baseApyBps) || baseApyBps <= 0) return 0
  const fee = Number.isFinite(commissionBps) ? Math.max(0, Math.min(BPS, commissionBps)) : 0
  return Math.round((baseApyBps * (BPS - fee)) / BPS)
}

/**
 * Straight-line reward projection for an amount at a given net APY.
 *
 * Deliberately simple interest: the precompile does not auto-compound, so
 * quoting a compounded figure next to the stake button would overstate it.
 *
 * @param {number} amountMon
 * @param {number} apyBps net APY in basis points
 * @param {number} [monUsd] optional MON price for the USD columns
 * @returns {{ day: number, month: number, year: number, dayUsd: number|null,
 *   monthUsd: number|null, yearUsd: number|null }}
 */
export function projectRewards(amountMon, apyBps, monUsd) {
  const amount = Number(amountMon)
  const apy = Number(apyBps)
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(apy) || apy <= 0) {
    return { day: 0, month: 0, year: 0, dayUsd: null, monthUsd: null, yearUsd: null }
  }

  const year = amount * (apy / BPS)
  const month = year / MONTHS_PER_YEAR
  const day = year / DAYS_PER_YEAR
  const price = Number.isFinite(monUsd) && monUsd > 0 ? monUsd : null

  return {
    day,
    month,
    year,
    dayUsd: price === null ? null : day * price,
    monthUsd: price === null ? null : month * price,
    yearUsd: price === null ? null : year * price,
  }
}

/**
 * Fee distribution across the validator set, used to tell a delegator whether
 * the validator they picked is cheap or expensive relative to the field.
 *
 * @param {Array<number|null|undefined>} commissionBpsList
 * @returns {{ median: number|null, min: number|null, max: number|null }}
 */
export function feePercentiles(commissionBpsList) {
  const fees = (commissionBpsList || []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (!fees.length) return { median: null, min: null, max: null }

  const mid = Math.floor(fees.length / 2)
  const median = fees.length % 2 === 0 ? (fees[mid - 1] + fees[mid]) / 2 : fees[mid]

  return { median, min: fees[0], max: fees[fees.length - 1] }
}

/**
 * A validator's share of total network stake, as a percentage.
 *
 * Scales by 1e6 before converting to Number so shares well under a basis point
 * survive the BigInt division instead of truncating to zero.
 *
 * @param {bigint} stakeWei
 * @param {bigint} networkWei
 * @returns {number|null}
 */
export function stakeSharePct(stakeWei, networkWei) {
  try {
    const stake = typeof stakeWei === 'bigint' ? stakeWei : BigInt(stakeWei ?? 0)
    const total = typeof networkWei === 'bigint' ? networkWei : BigInt(networkWei ?? 0)
    if (total <= 0n) return null
    const SCALE = 1_000_000n
    return Number((stake * 100n * SCALE) / total) / Number(SCALE)
  } catch {
    return null
  }
}

/**
 * wei -> MON as a float, for display and projection only.
 *
 * @param {bigint|string|number|null} wei
 * @returns {number}
 */
export function toMon(wei) {
  try {
    const x = typeof wei === 'bigint' ? wei : BigInt(wei ?? 0)
    const whole = x / WEI_PER_MON
    const frac = x % WEI_PER_MON
    return Number(whole) + Number(frac) / 1e18
  } catch {
    return 0
  }
}

/**
 * Comparator factory for the validator list.
 *
 * Rows whose on-chain stats have not loaded yet sort last on every numeric key,
 * so a half-loaded list never puts unknown validators at the top.
 *
 * @param {'stake'|'apy'|'name'} key
 * @param {number} baseApyBps
 * @returns {(a: object, b: object) => number}
 */
export function compareValidators(key, baseApyBps) {
  if (key === 'name') {
    return (a, b) => String(a?.name ?? '').localeCompare(String(b?.name ?? ''), undefined, { sensitivity: 'base' })
  }

  if (key === 'apy') {
    return (a, b) => {
      const aHas = Number.isFinite(a?.commissionBps)
      const bHas = Number.isFinite(b?.commissionBps)
      if (!aHas && !bHas) return 0
      if (!aHas) return 1
      if (!bHas) return -1
      return netApyBps(baseApyBps, b.commissionBps) - netApyBps(baseApyBps, a.commissionBps)
    }
  }

  return (a, b) => {
    const sa = a?.totalStakeWei
    const sb = b?.totalStakeWei
    const aMissing = sa === undefined || sa === null
    const bMissing = sb === undefined || sb === null
    if (aMissing && bMissing) return 0
    if (aMissing) return 1
    if (bMissing) return -1
    if (sa === sb) return 0
    return sa > sb ? -1 : 1
  }
}
