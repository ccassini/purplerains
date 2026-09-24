import React from 'react'
import { formatApyFromBps, formatMonCompactFromWei } from '../../utils/formatters'
import { stakeSharePct } from './stakingMath'

function feeVerdict(fee, median) {
  if (!Number.isFinite(fee) || !Number.isFinite(median)) return null
  if (fee === 0) return { tone: 'good', text: 'no fee' }
  if (fee < median) return { tone: 'good', text: 'below median' }
  if (fee === median) return { tone: 'neutral', text: 'at median' }
  return { tone: 'warn', text: 'above median' }
}

function concentrationVerdict(sharePct) {
  if (!Number.isFinite(sharePct)) return null
  if (sharePct >= 10) return { tone: 'warn', text: 'large' }
  if (sharePct >= 3) return { tone: 'neutral', text: 'sizeable' }
  return { tone: 'good', text: 'small' }
}

/**
 * Context for the selected validator.
 *
 * The list already shows stake, APY and fee in isolation; those numbers only
 * become decisions when compared against the field, so this states where the
 * validator sits — fee against the network median, stake share, and rank.
 *
 * @param {{ validator: object, rank: number|null, total: number, networkStakeWei: bigint, fees: { median: number|null } }} props
 */
export default function ValidatorInsight({ validator, rank, total, networkStakeWei, fees }) {
  if (!validator) return null

  const share = stakeSharePct(validator.totalStakeWei ?? 0n, networkStakeWei)
  const fee = validator.commissionBps
  const fv = feeVerdict(fee, fees?.median)
  const cv = concentrationVerdict(share)

  return (
    <div className="sk-insight">
      <div className="sk-insight__row">
        <span className="sk-insight__label">Fee</span>
        <span className="sk-insight__value">
          {Number.isFinite(fee) ? formatApyFromBps(fee) : '—'}
          {fv && <span className={`sk-tag is-${fv.tone}`}>{fv.text}</span>}
        </span>
      </div>

      <div className="sk-insight__row">
        <span className="sk-insight__label">Network share</span>
        <span className="sk-insight__value">
          {Number.isFinite(share) ? `${share < 0.01 ? '<0.01' : share.toFixed(2)}%` : '—'}
          {cv && <span className={`sk-tag is-${cv.tone}`}>{cv.text}</span>}
        </span>
      </div>

      <div className="sk-insight__row">
        <span className="sk-insight__label">Total stake</span>
        <span className="sk-insight__value">
          {validator.totalStakeWei != null ? `${formatMonCompactFromWei(validator.totalStakeWei)} MON` : '—'}
        </span>
      </div>

      <div className="sk-insight__row">
        <span className="sk-insight__label">Rank by stake</span>
        <span className="sk-insight__value">
          {rank ? `#${rank}` : '—'}
          {rank && total ? <span className="sk-insight__muted">of {total}</span> : null}
        </span>
      </div>
    </div>
  )
}
