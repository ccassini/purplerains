import { memo } from 'react'
import { ArrowUpRight, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { asNum, formatAmount, formatClock, formatNum, formatPct, signedClass, txUrl } from './format'
import { paginateRows } from './terminalView'
import './TerminalPerpl.css'

const PERPL_APP = 'https://app.perpl.xyz/'
const HASH = /^0x[\da-f]{64}$/i
const STATUS_LABELS = { connecting: 'Connecting', live: 'Live', reconnecting: 'Reconnecting', error: 'Unavailable', paused: 'Paused', idle: 'Waiting', stale: 'Delayed', partial: 'Partial feed' }
const decimalFormatters = new Map()
function marketDecimal(value, decimals) {
  const number = typeof value === 'boolean' ? null : asNum(value)
  if (number == null) return '—'
  const requested = typeof decimals === 'boolean' ? null : asNum(decimals)
  // Twenty fraction digits works across supported Intl implementations. Keeping
  // notation standard avoids scientific notation for small, valid lot sizes.
  const digits = Number.isInteger(requested) && requested >= 0 ? Math.min(20, requested) : 20
  if (!decimalFormatters.has(digits)) decimalFormatters.set(digits, new Intl.NumberFormat('en-US', { notation: 'standard', minimumFractionDigits: 0, maximumFractionDigits: digits }))
  return decimalFormatters.get(digits).format(number)
}
const price = (value, market) => marketDecimal(value, market?.priceDecimals)
const size = (value, market) => marketDecimal(value, market?.sizeDecimals)
const priceAusd = (value, market) => { const formatted = price(value, market); return formatted === '—' ? '—' : `${formatted} AUSD` }
const ausd = (value) => asNum(value) == null ? '—' : `${formatAmount(value)} AUSD`
const list = (value) => Array.isArray(value) ? value : []
const marketName = (market) => market?.symbol || market?.name || (market?.id != null ? `Market ${market.id}` : '—')
const knownTime = (value) => Number.isFinite(value) && Number.isFinite(new Date(value).getTime())
const timeTitle = (value) => knownTime(value) ? new Date(value).toISOString().replace('T', ' ').replace('Z', ' UTC') : 'Time unavailable'

function intervalLabel(seconds) {
  const value = asNum(seconds)
  if (!(value > 0)) return 'Interval unavailable'
  if (value % 3600 === 0) return `${value / 3600}h`
  if (value % 60 === 0) return `${value / 60}m`
  return `${formatNum(value)}s`
}

function PerplLogo() {
  return <img className="term-perpl-logo" src="/ecosystem/Perpl.avif" alt="" width="14" height="14" />
}

function FeedStatus({ status }) {
  const key = Object.hasOwn(STATUS_LABELS, status) ? status : 'connecting'
  return <span className={`term-perpl-status term-perpl-status--${key}`}><i aria-hidden="true" />{STATUS_LABELS[key]}</span>
}

export const PerplMarkets = memo(function PerplMarkets({ markets, selectedMarketId, onSelect, status }) {
  const rows = list(markets)
  return <div className="term-perpl-markets">
    <div className="term-perpl-heading"><span><PerplLogo />PERPL</span><FeedStatus status={status} /></div>
    <div className="term-table-scroll">
      {!rows.length ? <div className="term-empty" role="status"><h3>{status === 'error' ? 'Perpl markets unavailable' : 'Loading Perpl markets…'}</h3><p>Verified market snapshots will appear when the feed connects.</p></div> : <table className="term-table term-perpl-market-table">
        <caption className="term-sr-only">Perpl perpetual markets. Prices in AUSD.</caption>
        <thead><tr><th scope="col">Market</th><th scope="col" className="term-numeric">Price AUSD</th><th scope="col" className="term-numeric">24h Δ</th></tr></thead>
        <tbody>{rows.map((market) => {
          const selected = selectedMarketId != null && String(selectedMarketId) === String(market.id)
          return <tr key={market.id} className={selected ? 'is-selected' : undefined}><td><button type="button" className="term-identity" aria-pressed={selected} title={market.name || marketName(market)} disabled={!onSelect} onClick={() => onSelect?.(market.id)}><strong>{marketName(market)}</strong><small>{market.collateralSymbol || 'AUSD'} collateral{market.isOpen === false ? ' · closed' : ''}</small></button></td><td className="term-numeric">{price(market.lastPrice, market)}</td><td className={`term-numeric ${signedClass(market.change24hPct)}`}>{formatPct(market.change24hPct)}</td></tr>
        })}</tbody>
      </table>}
    </div>
    <p className="term-perpl-market-note">Perpetual markets · quoted in AUSD</p>
  </div>
})

export const PerplTradeTable = memo(function PerplTradeTable({ rows, page = 1, onPage, markets, onSelectMarket, emptyTitle, emptyDescription }) {
  const slice = paginateRows(list(rows), Number.isFinite(page) ? Math.trunc(page) : 1)
  const byId = new Map(list(markets).map((market) => [String(market.id), market]))
  return <>
    <div className="term-table-scroll" key={`perpl:${slice.page}`}>
      {!slice.total ? <div className="term-empty" role="status"><span className="term-empty-prompt" aria-hidden="true">_</span><h3>{emptyTitle || 'Waiting for Perpl trades…'}</h3><p>{emptyDescription || 'Observed perpetual trades will appear here. Prices and values are quoted in AUSD.'}</p></div> : <table className="term-table term-perpl-tape">
        <caption className="term-sr-only">Observed Perpl trades · UTC times · prices and values in AUSD · page {slice.page} of {slice.pages}</caption>
        <thead><tr><th scope="col" className="term-perpl-time">UTC</th><th scope="col">Market</th><th scope="col">Side</th><th scope="col" className="term-numeric">Price AUSD</th><th scope="col" className="term-numeric">Size</th><th scope="col" className="term-numeric">Value AUSD</th><th scope="col" className="term-perpl-tx"><span className="term-sr-only">Transaction</span></th></tr></thead>
        <tbody>{slice.rows.map((row) => {
          const market = byId.get(String(row.marketId))
          const name = row.symbol || marketName(market)
          const side = row.side === 'buy' || row.side === 'sell' ? row.side : null
          const href = typeof row.hash === 'string' && HASH.test(row.hash) ? txUrl(row.hash) : null
          return <tr key={row.id} data-flow-id={row.id}>
            <td className="term-perpl-time" title={timeTitle(row.ts)}>{formatClock(row.ts)}</td>
            <td><button className="term-perpl-market-button" type="button" title={name} disabled={row.marketId == null || !onSelectMarket} onClick={() => onSelectMarket?.(row.marketId)}>{name}</button></td>
            <td><span className={`term-side${side ? ` term-side--${side}` : ''}`}>{side || '—'}</span></td>
            <td className="term-numeric" title={row.price == null ? 'Price unavailable' : priceAusd(row.price, market)}>{price(row.price, market)}</td>
            <td className="term-numeric" title={row.size == null ? 'Size unavailable' : `${size(row.size, market)} ${name}`}>{size(row.size, market)}</td>
            <td className="term-numeric term-value" title={ausd(row.notional)}>{formatAmount(row.notional)}</td>
            <td className="term-perpl-tx">{href ? <a className="term-explorer" href={href} target="_blank" rel="noopener noreferrer" aria-label={`View transaction ${row.hash}`}><ArrowUpRight size={12} /></a> : <span className="term-perpl-unknown">—</span>}</td>
          </tr>
        })}</tbody>
      </table>}
    </div>
    <div className="term-pagination" aria-label="Perpl trades pagination"><span>{slice.start}–{slice.end} <em>/ {slice.total}</em></span><div><button type="button" aria-label="Perpl trades previous page" disabled={slice.page === 1 || !onPage} onClick={() => onPage?.(slice.page - 1)}><ChevronLeft size={13} /></button><span>{slice.page}/{slice.pages}</span><button type="button" aria-label="Perpl trades next page" disabled={slice.page === slice.pages || !onPage} onClick={() => onPage?.(slice.page + 1)}><ChevronRight size={13} /></button></div></div>
  </>
})

export const PerplMarketContext = memo(function PerplMarketContext({ market, status, lastMessageAt, error, onRetry }) {
  const interval = intervalLabel(market?.fundingIntervalSeconds)
  const fundingKnown = asNum(market?.fundingRatePct) != null
  return <div className="term-session-context term-perpl-context">
    <div className="term-perpl-context-heading"><span><PerplLogo />PERPL MARKET</span><FeedStatus status={status} /></div>
    {market ? <>
      <div className="term-perpl-market-name"><strong>{marketName(market)}</strong><span>{market.name && market.name !== market.symbol ? market.name : 'Perpetual market'}</span></div>
      <dl className="term-session-facts term-perpl-facts">
        <div><dt>Last price</dt><dd>{priceAusd(market.lastPrice, market)}</dd></div>
        <div><dt>Mark price</dt><dd>{priceAusd(market.markPrice, market)}</dd></div>
        <div><dt>Index price</dt><dd>{priceAusd(market.indexPrice, market)}</dd></div>
        <div><dt>Best bid</dt><dd>{priceAusd(market.bid, market)}</dd></div>
        <div><dt>Best ask</dt><dd>{priceAusd(market.ask, market)}</dd></div>
        <div><dt>24h change</dt><dd className={signedClass(market.change24hPct)}>{formatPct(market.change24hPct)}</dd></div>
        <div><dt>24h volume</dt><dd>{ausd(market.volume24h)}</dd></div>
        <div><dt>24h base volume</dt><dd>{size(market.volume24hBase, market)}</dd></div>
        <div><dt>Open interest, base</dt><dd>{size(market.openInterestBase, market)}</dd></div>
        <div><dt>Open interest, value</dt><dd>{ausd(market.openInterestNotional)}</dd></div>
        <div><dt>TVL</dt><dd>{ausd(market.tvl)}</dd></div>
        <div><dt>Funding rate</dt><dd>{fundingKnown ? `${formatPct(market.fundingRatePct, 4)} / ${interval}` : '—'}</dd></div>
        <div><dt>Funding interval</dt><dd title={market.fundingIntervalSeconds > 0 ? `${market.fundingIntervalSeconds} seconds` : undefined}>{market.fundingIntervalSeconds > 0 ? interval : '—'}</dd></div>
        <div><dt>Market state</dt><dd>{market.isOpen === true ? 'Open' : market.isOpen === false ? 'Closed' : '—'}</dd></div>
        <div><dt>Snapshot UTC</dt><dd title={timeTitle(market.updatedAt)}>{knownTime(market.updatedAt) ? formatClock(market.updatedAt) : '—'}</dd></div>
        <div><dt>Funding UTC</dt><dd title={timeTitle(market.fundingAt)}>{knownTime(market.fundingAt) ? formatClock(market.fundingAt) : '—'}</dd></div>
      </dl>
    </> : <p className="term-perpl-context-empty">Select a Perpl market to inspect its prices, liquidity, open interest and funding.</p>}
    <div className="term-perpl-feed-time"><span>Last message UTC</span><time title={timeTitle(lastMessageAt)}>{knownTime(lastMessageAt) ? formatClock(lastMessageAt) : '—'}</time></div>
    {error && <div className="term-perpl-error" role="status"><p>{error}</p>{onRetry && <button type="button" onClick={onRetry}><RefreshCw size={11} />Retry feed</button>}</div>}
    <p className="term-context-hint">Prices, notional values and TVL are denominated in AUSD. Funding is shown for the reported interval.</p>
    <a className="term-perpl-visit" href={PERPL_APP} target="_blank" rel="noopener noreferrer">Visit Perpl<ArrowUpRight size={12} /></a>
  </div>
})
