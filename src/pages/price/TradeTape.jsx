import React from 'react'
import { formatUsdCompact } from '../../utils/formatters'
import { formatPrice } from './priceFormatters'
import { venueLabel } from './venueBranding'
import VenueMark from './VenueMark'

/** Notional thresholds that earn a row extra visual weight. */
const TIERS = [
  { min: 1_000_000, tier: 4 },
  { min: 250_000, tier: 3 },
  { min: 100_000, tier: 2 },
  { min: 25_000, tier: 1 },
]

function notionalTier(notional) {
  if (!Number.isFinite(notional)) return 0
  return TIERS.find((t) => notional >= t.min)?.tier ?? 0
}

function relativeAge(nowMs, t) {
  const secs = Math.max(0, Math.floor((nowMs - Number(t)) / 1000))
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`
}

/**
 * Live trade tape.
 *
 * Columns are split so price, size and venue each get their own alignment —
 * the previous single cell mashed them into one ellipsised string. Size drives
 * the row's emphasis so a whale print is visible without reading the number.
 */
export default function TradeTape({ trades, nowMs }) {
  return (
    <section className="pr-panel pr-tape" aria-labelledby="pr-tape-title">
      <div className="pr-panel__head">
        <h2 className="pr-panel__title" id="pr-tape-title">Tape</h2>
        <span className="pr-panel__sub">
          {trades.length ? `${trades.length} prints` : 'listening'}
        </span>
      </div>

      <div className="pr-tape__cols" aria-hidden="true">
        <span>Side</span>
        <span>Price</span>
        <span>Size</span>
        <span />
        <span>Age</span>
      </div>

      <ol className="pr-tape__list">
        {trades.length === 0 ? (
          <li className="pr-tape__empty">Waiting for trades…</li>
        ) : (
          trades.map((tr, idx) => {
            const notional = Number(tr.p) * Number(tr.q)
            const tier = notionalTier(notional)
            const isBuy = tr.side === 'BUY'
            return (
              <li
                key={`${tr.t}-${tr.venue}-${idx}`}
                className={`pr-tape__row is-${isBuy ? 'buy' : 'sell'} tier-${tier}`}
                title={`${tr.side} ${formatUsdCompact(notional)} on ${venueLabel(tr.venue)}`}
              >
                <span className="pr-tape__side">{isBuy ? 'BUY' : 'SELL'}</span>
                <span className="pr-tape__price">${formatPrice(tr.p)}</span>
                <span className="pr-tape__size">${formatUsdCompact(notional)}</span>
                <span className="pr-tape__venue">
                  <VenueMark venueKey={tr.venue} size={15} />
                </span>
                <span className="pr-tape__age">{relativeAge(nowMs, tr.t)}</span>
              </li>
            )
          })
        )}
      </ol>
    </section>
  )
}
