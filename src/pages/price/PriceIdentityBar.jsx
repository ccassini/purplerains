import React from 'react'
import {
  Bell,
  BellOff,
  Maximize2,
  Minimize2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { LINE_TICK_MS } from './constants'
import { formatPrice } from './priceFormatters'

/**
 * Masthead: pair identity, the live aggregated price, and feed health.
 *
 * This replaces the old split where the price was printed twice (once in a stat
 * tile, once in a chart hero) — one authoritative quote, stated large.
 */
export default function PriceIdentityBar({
  symbol,
  price,
  change,
  flash,
  feedRate,
  liveCount,
  venueCount,
  soundEnabled,
  onToggleSound,
  isFullscreen,
  onToggleFullscreen,
  onReconnect,
}) {
  const hasChange = Number.isFinite(change)
  const isUp = hasChange && change >= 0
  const feedState = liveCount === 0 ? 'down' : liveCount < venueCount / 2 ? 'partial' : 'live'
  const feedLabel = liveCount === 0 ? 'Offline' : `${liveCount}/${venueCount} venues`

  return (
    <header className="pr-identity">
      <div className="pr-identity__pair">
        <span className="pr-identity__mark" aria-hidden="true">
          <img src="/monad_logo.png" alt="" width={26} height={26} />
        </span>
        <span className="pr-identity__pair-text">
          <span className="pr-identity__symbol">MON / USD</span>
          <span className="pr-identity__venue">{symbol || 'resolving…'}</span>
        </span>
      </div>

      <div className="pr-identity__quote">
        <span className={`pr-identity__price pr-flash ${flash.dir}`} key={flash.n}>
          {Number.isFinite(price) ? `$${formatPrice(price)}` : '—'}
        </span>
        {hasChange && (
          <span className={`pr-chip pr-chip--${isUp ? 'pos' : 'neg'}`}>
            {isUp ? <TrendingUp size={14} strokeWidth={2.5} /> : <TrendingDown size={14} strokeWidth={2.5} />}
            {`${isUp ? '+' : ''}${change.toFixed(2)}%`}
            <span className="pr-chip__unit">24h</span>
          </span>
        )}
      </div>

      <div className="pr-identity__meta">
        <span className="pr-tick" title={`Chart repaints every ${LINE_TICK_MS}ms`}>
          <span className="pr-tick__dot" aria-hidden="true" />
          <span className="pr-tick__res">{LINE_TICK_MS}ms</span>
          <span className="pr-tick__sep" aria-hidden="true" />
          <span className="pr-tick__rate">{feedRate.tps.toFixed(1)} tps</span>
          {Number.isFinite(feedRate.lagMs) && (
            <>
              <span className="pr-tick__sep" aria-hidden="true" />
              <span className="pr-tick__lag">{feedRate.lagMs}ms lag</span>
            </>
          )}
        </span>

        <span className={`pr-feed pr-feed--${feedState}`} title={`${liveCount} of ${venueCount} sources streaming`}>
          <span className="pr-feed__dot" aria-hidden="true" />
          {feedLabel}
        </span>

        <div className="pr-actions">
          <button
            type="button"
            className={`pr-btn ${soundEnabled ? 'is-on' : ''}`}
            onClick={onToggleSound}
            aria-pressed={soundEnabled}
            title={soundEnabled ? 'Mute large-trade alerts' : 'Alert on trades over $100k'}
          >
            {soundEnabled ? <Bell size={15} /> : <BellOff size={15} />}
          </button>
          <button
            type="button"
            className={`pr-btn pr-btn--desktop ${isFullscreen ? 'is-on' : ''}`}
            onClick={onToggleFullscreen}
            aria-pressed={isFullscreen}
            title={isFullscreen ? 'Restore side panels' : 'Expand chart'}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button type="button" className="pr-btn pr-btn--reconnect" onClick={onReconnect} title="Reconnect all streams">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>
    </header>
  )
}
