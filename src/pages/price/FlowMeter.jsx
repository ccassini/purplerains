import React, { useMemo } from 'react'
import { formatUsdCompact } from '../../utils/formatters'
import { FLOW_WINDOW_MS } from './constants'

/**
 * Buy/sell pressure over the trailing window.
 *
 * Derived entirely from the tape buffer already in memory — no extra requests —
 * and recomputed on the shared 1s clock rather than per trade.
 *
 * @param {{ trades: Array<{ t: number, p: number, q: number, side: string }>, nowMs: number }} props
 */
export default function FlowMeter({ trades, nowMs }) {
  const flow = useMemo(() => {
    const cutoff = nowMs - FLOW_WINDOW_MS
    let buy = 0
    let sell = 0
    let count = 0
    for (const tr of trades) {
      if (tr.t < cutoff) break // newest-first, so the rest are older
      const notional = tr.p * tr.q
      if (!Number.isFinite(notional)) continue
      if (tr.side === 'BUY') buy += notional
      else sell += notional
      count += 1
    }
    const total = buy + sell
    return { buy, sell, count, total, buyPct: total > 0 ? (buy / total) * 100 : 50 }
  }, [trades, nowMs])

  const seconds = Math.round(FLOW_WINDOW_MS / 1000)
  const dominant = flow.total === 0 ? 'flat' : flow.buy >= flow.sell ? 'buy' : 'sell'

  return (
    <div className={`pr-flow is-${dominant}`}>
      <div className="pr-flow__head">
        <span className="pr-flow__label">Order flow</span>
        <span className="pr-flow__window">{`last ${seconds}s · ${flow.count} trades`}</span>
      </div>
      {/* Sell is the track, buy is a scaleX overlay — one compositor-only
          transform instead of two animated widths. */}
      <div
        className="pr-flow__bar"
        style={{ '--f': flow.buyPct / 100 }}
        role="img"
        aria-label={`Buy pressure ${flow.buyPct.toFixed(0)} percent`}
      >
        <span className="pr-flow__buy" />
        <span className="pr-flow__mid" aria-hidden="true" />
      </div>
      <div className="pr-flow__legs">
        <span className="pr-flow__leg is-buy">
          <span className="pr-flow__leg-tag">buy</span>
          {flow.total === 0 ? '—' : `$${formatUsdCompact(flow.buy)}`}
        </span>
        <span className="pr-flow__ratio">{flow.total === 0 ? '·' : `${flow.buyPct.toFixed(0)}%`}</span>
        <span className="pr-flow__leg is-sell">
          {flow.total === 0 ? '—' : `$${formatUsdCompact(flow.sell)}`}
          <span className="pr-flow__leg-tag">sell</span>
        </span>
      </div>
    </div>
  )
}
