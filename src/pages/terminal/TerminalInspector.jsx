import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight, Check, Copy, ExternalLink, X } from 'lucide-react'
import { DEXSCREENER_URL } from './constants'
import { addressUrl, formatAmount, formatClock, formatHold, formatNum, formatPct, formatPrice, formatUsd, shortAddr } from './format'
import { summarizeWalletTransfers } from './terminalView'
import { mergePools } from './poolNormalize'
import './TerminalInspector.css'

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
const sameAddress = (a, b) => Boolean(a && b && String(a).toLowerCase() === String(b).toLowerCase())
const validAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(value || '')
const pnlTone = (value) => value == null || value === 0 ? '' : value > 0 ? 'positive' : 'negative'

function Metric({ label, value, tone = '' }) {
  return <div className="term-inspector-metric"><dt>{label}</dt><dd className={tone ? `term-inspector-${tone}` : undefined}>{value}</dd></div>
}

function External({ href, children }) {
  return <a className="term-inspector-link" href={href} target="_blank" rel="noreferrer">{children}<ExternalLink size={14} aria-hidden="true" /></a>
}

function FetchedTime({ value }) {
  const time = Number.isFinite(value) && value >= 0 ? new Date(value) : null
  if (!time || !Number.isFinite(time.getTime())) return 'Unavailable'
  const iso = time.toISOString()
  return <time dateTime={iso}>{iso.slice(0, 10)} {formatClock(value)} UTC</time>
}

function MetadataError({ coverage, onRetry }) {
  if (!coverage?.metadataError) return null
  return <p className="term-inspector-note term-inspector-negative" role="status"><strong>Metadata update failed.</strong> {String(coverage.metadataError)}{onRetry && !coverage.error && <button type="button" onClick={onRetry} disabled={coverage.loading}>Retry metadata</button>}</p>
}

function TokenLookup({ coverage, onRetry }) {
  if (coverage.poolId) return <PoolSnapshot coverage={coverage} onRetry={onRetry} samplePoolId={coverage.poolId} />
  return <section className="term-inspector-quality" aria-label="Token pool lookup">
    <dl><div><dt>Pool lookup</dt><dd role="status">{coverage.loading ? 'Finding pool…' : coverage.error ? 'Lookup failed' : 'Waiting'}{coverage.error && onRetry && <button type="button" onClick={onRetry}>Retry</button>}</dd></div></dl>
    {coverage.error && <p className="term-inspector-note term-inspector-negative">{String(coverage.error)}</p>}
  </section>
}

function PoolSnapshot({ pool, coverage, onRetry, samplePoolId }) {
  return <section className="term-inspector-quality" aria-label="Pool data sources">
    {samplePoolId && <dl><div><dt>Sample pool</dt><dd><code title={samplePoolId}>{shortAddr(samplePoolId)}</code></dd></div></dl>}
    {pool && <dl>
      <div><dt>Market source</dt><dd>{pool.provider || (pool.source === 'gecko' ? 'GeckoTerminal' : pool.source === 'dexscreener' ? 'DEX Screener' : 'Unavailable')}{pool.fromCache && <span> · cached</span>}</dd></div>
      <div><dt>Fetched</dt><dd><FetchedTime value={pool.fetchedAt} /></dd></div>
    </dl>}
    <MetadataError coverage={coverage} onRetry={onRetry} />
    {coverage && <>
      <dl className="term-inspector-coverage">
        <div><dt>Recent sample</dt><dd>{coverage.tradeCount == null ? 'Unavailable' : `${formatNum(coverage.tradeCount)} trades`}</dd></div>
        <div><dt>Sample fetched</dt><dd><FetchedTime value={coverage.fetchedAt} /></dd></div>
        <div><dt>Sample status</dt><dd role="status">{coverage.loading ? 'Updating…' : coverage.error ? 'Update failed' : coverage.fetchedAt != null ? 'Available' : 'Waiting'}{coverage.error && onRetry && <button type="button" onClick={onRetry}>Retry</button>}</dd></div>
      </dl>
      {coverage.error && <p className="term-inspector-note term-inspector-negative">{String(coverage.error)}</p>}
      <p className="term-inspector-note">GeckoTerminal recent trade sample, not full pool history.</p>
    </>}
  </section>
}

function WalletPositions({ rows, closed = false }) {
  const bounded = rows.slice(0, 12)
  return <section className="term-inspector-section">
    <div className="term-inspector-section-heading"><h3>{closed ? 'Closed positions' : 'Open positions'}</h3><span>{formatNum(rows.length)}</span></div>
    {bounded.length ? <>
      <div className="term-inspector-table-wrap"><table className="term-inspector-table">
        <thead><tr><th scope="col">Token</th><th scope="col">Cost basis<small>{closed ? 'Proceeds' : 'Equity'}</small></th><th scope="col">{closed ? 'Realized P/L' : 'Open P/L'}{closed && <small>Return</small>}</th></tr></thead>
        <tbody>{bounded.map((position, index) => <tr key={`${position.token}:${position.closed_ts || position.opened_ts || index}`}>
          <th scope="row"><span>{position.symbol || shortAddr(position.token)}</span><small>{closed ? `${formatClock(position.closed_ts)} UTC · ${formatHold(position.hold_seconds)}` : `${formatAmount(position.qty)} tokens`}</small></th>
          <td>{formatUsd(closed ? position.paid_in : position.cost)}<small>{formatUsd(closed ? position.got_out : position.value)}</small></td>
          <td className={`term-inspector-${pnlTone(closed ? position.pnl_usd : position.unrealized) || 'neutral'}`}>{formatUsd(closed ? position.pnl_usd : position.unrealized, { signed: true })}{closed && <small>{formatPct(position.pnl_pct)}</small>}</td>
        </tr>)}</tbody>
      </table></div>
      {rows.length > 12 && <p className="term-inspector-note">Showing the first 12 of {formatNum(rows.length)} observed positions.</p>}
    </> : <p className="term-inspector-empty">{closed ? 'No closed positions are available in the observed window.' : 'No open inventory is available in the observed window.'}</p>}
  </section>
}

/** Read-only details for the selected address, with no additional network work. */
export default function TerminalInspector({ tm, onClose, onShowTrades, relatedLabel = 'View related trades', nativeTransfers = null, embedded = false }) {
  const headingId = useId()
  const descriptionId = useId()
  const overlayRef = useRef(null)
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const callbacks = useRef({ onClose })
  callbacks.current = { onClose }
  const copyTimer = useRef(null)
  const copyAttempt = useRef(0)
  const [copyState, setCopyState] = useState('')
  const selected = tm.selected
  const hasSelection = Boolean(selected)
  const type = selected?.type || 'wallet'
  const id = selected?.id || ''
  const allPools = mergePools([...(tm.pools || []), ...(tm.fresh || []), ...(tm.remoteHits || [])])
    .sort((a, b) => (b.fetchedAt ?? -1) - (a.fetchedAt ?? -1))
  const pool = type === 'pool' ? allPools.find((entry) => sameAddress(entry.address || entry.id, id)) : null
  const selectionCoverage = tm.poolCoverage?.selectionType === type && sameAddress(tm.poolCoverage.selectionId, id) ? tm.poolCoverage : null
  const poolCoverage = type === 'pool' && sameAddress(selectionCoverage?.poolId, pool?.address || id) ? selectionCoverage : null
  const wallet = type === 'wallet'
    ? [tm.traderDetail, ...(tm.traders || [])].find((entry) => sameAddress(entry?.address, id))
    : null
  const token = type === 'token' ? (tm.tokens || []).find((entry) => sameAddress(entry.token, id)) : null
  const tokenPool = type === 'token' ? allPools.find((entry) => sameAddress(entry.base?.address, id) || sameAddress(entry.quote?.address, id)) : null
  const tokenMeta = tokenPool ? sameAddress(tokenPool.base?.address, id) ? tokenPool.base : tokenPool.quote : null
  // A pool's USD price and market cap describe its base token, never its quote.
  const tokenBasePool = type === 'token' ? allPools.find((entry) => sameAddress(entry.base?.address, id)) : null
  const title = type === 'pool' ? pool?.pair || shortAddr(id)
    : type === 'token' ? token?.symbol || tokenMeta?.symbol || shortAddr(id) : shortAddr(id)
  const transferSummary = type === 'wallet' && nativeTransfers ? summarizeWalletTransfers(nativeTransfers, id) : null
  const hasMetadata = type === 'pool' ? Boolean(pool) : type === 'token' ? Boolean(token || tokenMeta) : Boolean(wallet || transferSummary?.count)
  const marketWindow = tm.win?.gecko === 'h1' ? '1h' : '24h'
  const marketPoolAddress = type === 'pool' ? pool?.address || id : tokenPool?.address
  const openPositions = (tm.openPositions || []).filter((position) => sameAddress(position.wallet, id))
  const closedPositions = (tm.closed || []).filter((position) => sameAddress(position.wallet, id))

  useEffect(() => {
    if (embedded || !hasSelection) return undefined
    const dialog = dialogRef.current
    const overlay = overlayRef.current
    if (!dialog || !overlay) return undefined
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    const outsideElements = [...document.body.children].filter((element) => element !== overlay && element instanceof HTMLElement)
    const previousInert = outsideElements.map((element) => [element, element.inert])
    for (const [element] of previousInert) element.inert = true
    document.body.style.overflow = 'hidden'
    const focusable = () => [...dialog.querySelectorAll(FOCUSABLE)].filter((element) => element.getClientRects().length > 0)
    const focusStart = () => (closeRef.current || dialog).focus({ preventScroll: true })
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        callbacks.current.onClose?.()
      } else if (event.key === 'Tab') {
        const targets = focusable()
        const first = targets[0] || dialog
        const last = targets[targets.length - 1] || dialog
        if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault()
          event.stopPropagation()
          ;(event.shiftKey ? last : first).focus()
        }
      }
    }
    const onFocus = (event) => { if (!dialog.contains(event.target)) focusStart() }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus)
    focusStart()
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocus)
      for (const [element, inert] of previousInert) element.inert = inert
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [embedded, hasSelection])

  useEffect(() => {
    setCopyState('')
    copyAttempt.current += 1
    return () => {
      copyAttempt.current += 1
      window.clearTimeout(copyTimer.current)
    }
  }, [id])

  const copyAddress = async () => {
    const attempt = ++copyAttempt.current
    window.clearTimeout(copyTimer.current)
    try {
      await navigator.clipboard.writeText(id)
      if (attempt !== copyAttempt.current) return
      setCopyState('copied')
      copyTimer.current = window.setTimeout(() => setCopyState(''), 1800)
    } catch {
      if (attempt === copyAttempt.current) setCopyState('error')
    }
  }

  if (!selected) return null

  const content = <section className={`term-inspector${embedded ? ' term-inspector--embedded' : ''}`} ref={dialogRef} role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : true} aria-labelledby={headingId} aria-describedby={descriptionId} tabIndex={embedded ? undefined : -1} onKeyDown={embedded ? undefined : (event) => event.stopPropagation()}>
      <header className="term-inspector-header">
        <div><span className="term-inspector-eyebrow">{embedded ? type.toUpperCase() : `MONAD · ${type === 'pool' ? 'LIQUIDITY POOL' : type === 'token' ? 'TOKEN' : 'WALLET'}`}</span><h2 id={headingId} title={title}>{title}</h2></div>
        <button className="term-inspector-close" type="button" aria-label={embedded ? 'Clear selection' : 'Close inspector'} onClick={onClose} ref={closeRef}><X size={embedded ? 14 : 20} aria-hidden="true" /></button>
      </header>
      <div className="term-inspector-body">
        <p className="term-inspector-intro" id={descriptionId}>{type === 'wallet' ? transferSummary ? 'Native MON transfers retained in this live session.' : 'Activity and positions recorded in this observed trading window.' : type === 'token' ? tokenMeta?.name || 'Token activity and available market metadata.' : pool ? [pool.dexName, pool.proto?.toUpperCase()].filter(Boolean).join(' · ') : 'Liquidity pool details from available market snapshots.'}</p>
        <div className="term-inspector-address"><code>{id}</code><button type="button" aria-label={copyState === 'copied' ? 'Address copied' : 'Copy address'} onClick={copyAddress}>{copyState === 'copied' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}</button></div>
        <p className={`term-inspector-copy-status${copyState === 'error' ? ' term-inspector-negative' : ''}`} role="status">{copyState === 'copied' ? 'Address copied.' : copyState === 'error' ? 'Copy unavailable. Select the address above to copy it manually.' : ''}</p>
        <div className="term-inspector-links">{validAddress(id) && <External href={addressUrl(id)}>View on explorer</External>}{validAddress(marketPoolAddress) && <External href={`${DEXSCREENER_URL}/${marketPoolAddress}`}>DexScreener</External>}</div>
        {!hasMetadata && <p className="term-inspector-empty">{type === 'wallet' ? 'No wallet statistics are available for this address in the observed window.' : type === 'pool' ? 'This pool is not present in the available market snapshots. Its address and related observed trades remain available.' : 'No token metadata is available for this address in the current snapshot.'}</p>}
        {type === 'pool' && (pool || poolCoverage) && <PoolSnapshot pool={pool} coverage={poolCoverage} onRetry={tm.retrySelected} />}
        {type === 'token' && selectionCoverage && <TokenLookup coverage={selectionCoverage} onRetry={tm.retrySelected} />}

        {type === 'wallet' && transferSummary && <>
          <dl className="term-inspector-metrics"><Metric label="Received MON" value={formatAmount(transferSummary.received)} /><Metric label="Sent MON" value={formatAmount(transferSummary.sent)} /><Metric label="Incoming transfers" value={formatNum(transferSummary.incoming)} /><Metric label="Outgoing transfers" value={formatNum(transferSummary.outgoing)} /><Metric label="Retained transfers" value={formatNum(transferSummary.count)} /><Metric label="Last transfer · UTC" value={formatClock(transferSummary.lastTs)} /></dl>
          <p className="term-inspector-note">Amounts cover the retained native-transfer sample. They do not represent this wallet’s balance or full transaction history.</p>
        </>}
        {type === 'wallet' && !transferSummary && <>
          {wallet && <dl className="term-inspector-metrics">
            <Metric label="Observed volume" value={formatUsd(wallet.volume)} /><Metric label="Recorded fills" value={formatNum(wallet.fills)} />
            <Metric label="Realized P/L" value={formatUsd(wallet.realized_pnl, { signed: true })} tone={pnlTone(wallet.realized_pnl)} /><Metric label="Open P/L" value={formatUsd(wallet.unrealized_pnl, { signed: true })} tone={pnlTone(wallet.unrealized_pnl)} />
            <Metric label="Observed net P/L" value={formatUsd(wallet.net_pnl, { signed: true })} tone={pnlTone(wallet.net_pnl)} /><Metric label="Closed-position win rate" value={wallet.win_rate == null ? '—' : `${(wallet.win_rate * 100).toFixed(1)}%`} />
          </dl>}
          <p className="term-inspector-note term-inspector-disclosure">P/L is estimated from the fills and price marks observed here. It is not this wallet’s total portfolio return. Missing token quantities, prices or prior inventory can leave results unavailable.</p>
          <WalletPositions rows={openPositions} /><WalletPositions rows={closedPositions} closed />
        </>}

        {type === 'pool' && pool && <>
          <dl className="term-inspector-metrics">
            <Metric label="Liquidity" value={formatUsd(pool.tvl)} /><Metric label={`${marketWindow} volume`} value={formatUsd(pool.volume)} />
            <Metric label={`${marketWindow} price change`} value={formatPct(pool.change)} tone={pnlTone(pool.change)} /><Metric label="Base token price" value={formatUsd(pool.price, { digits: 6 })} />
            <Metric label="Fee rate" value={pool.feePct == null ? '—' : `${pool.feePct}%`} /><Metric label={`${marketWindow} swaps`} value={formatNum(pool.swaps)} />
            <Metric label={`${marketWindow} estimated fees`} value={formatUsd(pool.fees)} />
          </dl>
          <section className="term-inspector-section"><h3>Pair assets</h3><dl className="term-inspector-assets">{[['Base', pool.base], ['Quote', pool.quote]].map(([label, asset]) => <div key={label}><dt>{label}</dt><dd><strong>{asset?.symbol || 'Unknown token'}</strong>{validAddress(asset?.address) ? <a href={addressUrl(asset.address)} target="_blank" rel="noreferrer">{shortAddr(asset.address)}<ExternalLink size={12} aria-hidden="true" /></a> : <span>Address unavailable</span>}</dd></div>)}</dl></section>
          <p className="term-inspector-note">Market values reflect the available {marketWindow} snapshot. Fees are a gross trading-fee estimate, not LP net earnings. Unavailable values are shown as a dash.</p>
        </>}

        {type === 'token' && hasMetadata && <>
          <dl className="term-inspector-metrics">
            <Metric label="USD price" value={formatPrice(token?.mark ?? tokenBasePool?.price ?? (sameAddress(tokenPool?.quote?.address, id) ? tokenPool?.quotePrice : null))} />
            {tokenBasePool ? <><Metric label="Market cap" value={formatUsd(tokenBasePool.marketCap)} /><Metric label="Fully diluted value" value={formatUsd(tokenBasePool.fdv)} /></> : <Metric label="Market cap / FDV" value={formatUsd(token?.mcap)} />}
            <Metric label="Observed buy volume" value={formatUsd(token?.usd_in)} /><Metric label="Observed sell volume" value={formatUsd(token?.usd_out)} />
            <Metric label="Observed net flow" value={formatUsd(token?.net_usd, { signed: true })} tone={pnlTone(token?.net_usd)} /><Metric label="Observed traders" value={formatNum(token?.traders_n)} />
          </dl>
          <p className="term-inspector-note">Flow covers recorded buys and sells in the selected window. It does not represent every transfer or all holders. {tokenBasePool ? 'Market cap and fully diluted value are separate provider estimates; unavailable values stay unknown.' : 'Capitalization basis is unavailable when no base-token pool metadata is present.'}</p>
        </>}
      </div>
      <footer className="term-inspector-footer"><button type="button" className="term-inspector-primary" onClick={onShowTrades}>{relatedLabel}<ArrowUpRight size={embedded ? 13 : 17} aria-hidden="true" /></button><span>{embedded ? 'Read-only' : 'Read-only · no wallet connection'}</span></footer>
    </section>
  if (embedded) return content
  return createPortal(<div className="term-inspector-overlay" ref={overlayRef} onClick={(event) => { if (event.target === event.currentTarget) onClose?.() }}>{content}</div>, document.body)
}
