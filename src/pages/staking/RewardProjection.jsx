import React, { useMemo } from 'react'
import { formatApyFromBps } from '../../utils/formatters'
import { formatMonAmount, formatUsdSmall } from './stakingFormat'
import { projectRewards } from './stakingMath'

/**
 * Yield estimate shown next to the amount field.
 *
 * Previously this lived only on the separate /staking-calculator page, which
 * meant the one number a delegator wants at the moment of deciding — "what does
 * this actually pay?" — required leaving the flow.
 *
 * @param {{ amount: string, netApyBps: number, monUsd: number|null }} props
 */
export default function RewardProjection({ amount, netApyBps, monUsd }) {
  const parsed = Number(String(amount).replace(',', '.'))
  const hasAmount = Number.isFinite(parsed) && parsed > 0
  const projection = useMemo(
    () => projectRewards(hasAmount ? parsed : 0, netApyBps, monUsd),
    [hasAmount, monUsd, netApyBps, parsed],
  )

  const buckets = [
    { key: 'day', label: 'Daily', mon: projection.day, usd: projection.dayUsd },
    { key: 'month', label: 'Monthly', mon: projection.month, usd: projection.monthUsd },
    { key: 'year', label: 'Yearly', mon: projection.year, usd: projection.yearUsd },
  ]

  return (
    <div className={`sk-projection ${hasAmount ? 'is-live' : 'is-idle'}`}>
      <div className="sk-projection__head">
        <span className="sk-projection__label">Estimated rewards</span>
        <span className="sk-projection__apy">
          {netApyBps > 0 ? `${formatApyFromBps(netApyBps)} net APY` : 'APY pending'}
        </span>
      </div>

      <div className="sk-projection__grid">
        {buckets.map((b) => (
          <div key={b.key} className="sk-projection__cell">
            <span className="sk-projection__cell-label">{b.label}</span>
            <span className="sk-projection__cell-value">
              {hasAmount ? formatMonAmount(b.mon) : '—'}
              <small>MON</small>
            </span>
            {hasAmount && formatUsdSmall(b.usd) && (
              <span className="sk-projection__cell-usd">{formatUsdSmall(b.usd)}</span>
            )}
          </div>
        ))}
      </div>

      <p className="sk-projection__note">
        Simple interest at the current network APY — rewards do not auto-compound,
        and the rate moves with total stake.
      </p>
    </div>
  )
}
