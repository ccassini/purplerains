import { parseStakingAmount } from './stakingAmounts'
import { STAKING_PROJECTION_LIMITS } from './stakingProjection'

/** The calculator consumes the staking page's verified snapshot, without reads. */
export function calculatorNetworkSnapshot(network = {}) {
  const apr = network.networkStats?.grossApr
  const usable = Number.isFinite(apr) && apr >= 0 && apr <= STAKING_PROJECTION_LIMITS.grossApr
  return {
    status: usable ? network.dataError ? 'stale' : 'ready' : network.loading ? 'loading' : 'unavailable',
    grossApr: usable ? apr : null,
    activeStaked: network.networkStats?.activeStaked ?? null,
    fetchedAt: network.lastUpdated ?? null,
    sourceUpdatedAt: network.sourceUpdatedAt ?? null,
    updating: Boolean(network.updating),
    refresh: network.refresh,
  }
}

export function calculatorCommission(validator) {
  const bps = validator?.commissionBps
  return validator?.hasChainData && Number.isInteger(bps) && bps >= 0 && bps <= 10_000 ? String(bps / 100) : null
}

export function calculatorStakeAmount(value) {
  const parsed = parseStakingAmount(value)
  if (parsed === null || parsed <= 0n || parsed > BigInt(STAKING_PROJECTION_LIMITS.amount) * 10n ** 18n) return null
  return String(value).trim()
}
