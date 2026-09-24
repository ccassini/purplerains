import React from 'react'
import { formatUsdCompact } from '../../utils/formatters'
import { formatPrice } from './priceFormatters'

/**
 * BTC is a macro reference, so whole dollars are enough — and the grouping is
 * pinned to en-US so it cannot render as `64.850,10` next to the en-US-formatted
 * MON quote on a European locale.
 */
function formatBtc(value) {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function Stat({ label, hint, tone = '', children, footer }) {
  return (
    <div className={`pr-stat ${tone ? `pr-stat--${tone}` : ''}`}>
      <div className="pr-stat__head">
        <span className="pr-stat__label">{label}</span>
        {hint && <span className="pr-stat__hint">{hint}</span>}
      </div>
      <div className="pr-stat__value">{children}</div>
      {footer}
    </div>
  )
}

/**
 * Market context strip. Each cell answers a distinct question — how much is
 * trading, how far has it travelled this session, how much do venues disagree,
 * and what is the macro doing — rather than repeating the headline quote.
 */
export default function PriceStats({ volume, sessionRange, spread, btc }) {
  const btcUp = Number.isFinite(btc.change) && btc.change >= 0

  return (
    <div className="pr-stats">
      <Stat label="24h volume" hint="all venues" tone="accent">
        {Number.isFinite(volume) ? `$${formatUsdCompact(volume)}` : '—'}
      </Stat>

      <Stat
        label="session range"
        hint="since open"
        footer={sessionRange && (
          <div className="pr-range">
            <span className="pr-range__edge">${formatPrice(sessionRange.low)}</span>
            {/* Position is carried as a 0–1 fraction and applied with scaleX /
                translateX, so the marker glide never triggers layout. */}
            <span className="pr-range__track" style={{ '--f': sessionRange.pos / 100 }}>
              <span className="pr-range__fill" />
              <span className="pr-range__cursor">
                <span className="pr-range__dot" />
              </span>
            </span>
            <span className="pr-range__edge">${formatPrice(sessionRange.high)}</span>
          </div>
        )}
      >
        {sessionRange
          ? `${(((sessionRange.high - sessionRange.low) / sessionRange.low) * 100).toFixed(2)}%`
          : '—'}
      </Stat>

      <Stat
        label="venue spread"
        hint={spread ? `${spread.count} quoted` : null}
        footer={spread && (
          <div className="pr-spread">
            <span className="pr-spread__leg">
              <span className="pr-spread__tag">low</span>
              {spread.minVenue}
            </span>
            <span className="pr-spread__leg">
              <span className="pr-spread__tag">high</span>
              {spread.maxVenue}
            </span>
          </div>
        )}
      >
        {spread ? `${spread.pct.toFixed(3)}%` : '—'}
      </Stat>

      <Stat label="BTC" hint="macro" tone="amber">
        <span className="pr-stat__btc">
          {Number.isFinite(btc.price) ? `$${formatBtc(btc.price)}` : '—'}
          {Number.isFinite(btc.change) && (
            <span className={`pr-delta pr-delta--${btcUp ? 'pos' : 'neg'}`}>
              {`${btcUp ? '+' : ''}${btc.change.toFixed(2)}%`}
            </span>
          )}
        </span>
      </Stat>
    </div>
  )
}
