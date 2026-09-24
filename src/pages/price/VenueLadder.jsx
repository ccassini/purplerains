import React, { useMemo } from 'react'
import { formatUsdCompact } from '../../utils/formatters'
import { formatPrice } from './priceFormatters'
import { venueDisplay } from './venueBranding'
import { VENUES } from './venues'
import VenueMark from './VenueMark'

const STATUS_ORDER = { live: 0, connecting: 1, fallback: 2 }

/**
 * Per-venue quote board.
 *
 * The page already streams ten independent sources; previously they surfaced
 * only as a row of unlabelled status dots. This lists each one with its own
 * quote, 24h move, volume and basis against the aggregate — so cross-venue
 * dislocation is readable at a glance.
 */
export default function VenueLadder({ sources, reference }) {
  const rows = useMemo(() => {
    const list = VENUES.map((v) => {
      const src = sources[v.key] || {}
      const basis = Number.isFinite(src.last) && Number.isFinite(reference) && reference > 0
        ? ((src.last - reference) / reference) * 100
        : null
      return {
        key: v.key,
        label: v.label,
        ...venueDisplay(v.key),
        status: src.status || 'connecting',
        last: Number.isFinite(src.last) ? src.last : null,
        change: Number.isFinite(src.change) ? src.change : null,
        volume: Number.isFinite(src.volume) ? src.volume : null,
        basis,
      }
    })

    return list.sort((a, b) => {
      const byStatus = (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)
      if (byStatus !== 0) return byStatus
      const quoted = Number(b.last !== null) - Number(a.last !== null)
      if (quoted !== 0) return quoted
      return (b.volume ?? -1) - (a.volume ?? -1)
    })
  }, [sources, reference])

  return (
    <section className="pr-panel pr-ladder" aria-labelledby="pr-ladder-title">
      <div className="pr-panel__head">
        <h2 className="pr-panel__title" id="pr-ladder-title">Venues</h2>
        <span className="pr-panel__sub">{rows.filter((r) => r.status === 'live').length} streaming</span>
      </div>

      <div className="pr-ladder__cols" aria-hidden="true">
        <span>Source</span>
        <span>Price</span>
        <span>24h</span>
        <span>Vol</span>
      </div>

      <ul className="pr-ladder__list">
        {rows.map((row) => {
          const up = Number.isFinite(row.change) && row.change >= 0
          return (
            <li key={row.key} className={`pr-ladder__row is-${row.status}`} title={row.label}>
              <span className="pr-ladder__source">
                <VenueMark venueKey={row.key} size={16} />
                <span className="pr-ladder__name">{row.name}</span>
                {row.tag && <span className="pr-ladder__tag">{row.tag}</span>}
              </span>

              <span className="pr-ladder__price">
                {row.last === null ? <span className="pr-muted">—</span> : `$${formatPrice(row.last)}`}
                {Number.isFinite(row.basis) && Math.abs(row.basis) >= 0.01 && (
                  <span className={`pr-ladder__basis ${row.basis >= 0 ? 'is-pos' : 'is-neg'}`}>
                    {`${row.basis >= 0 ? '+' : ''}${row.basis.toFixed(2)}%`}
                  </span>
                )}
              </span>

              <span className={`pr-ladder__chg ${Number.isFinite(row.change) ? (up ? 'is-pos' : 'is-neg') : 'pr-muted'}`}>
                {Number.isFinite(row.change) ? `${up ? '+' : ''}${row.change.toFixed(2)}%` : '—'}
              </span>

              <span className="pr-ladder__vol">
                {Number.isFinite(row.volume) ? formatUsdCompact(row.volume) : <span className="pr-muted">—</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
