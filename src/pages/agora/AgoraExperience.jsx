import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, Check, ChevronRight, Copy, ExternalLink, Globe2, Home, LocateFixed, Map, Minus, Pause, Play, Plus, RefreshCw, RotateCcw, X } from 'lucide-react'
import { AGORA_LOGO, connectionSummary, exactAmount, explorerLink, filterTransfers, formatAmount, shortAddress, summarizeTransfers } from './agoraModel'
import { refreshAgoraFeed, useAgoraFeed } from './useAgoraFeed'
import './AgoraExperience.css'

const AgoraMap2D = lazy(() => import('./AgoraMap2D'))
const AgoraGlobe3D = lazy(() => import('./AgoraGlobe3D'))
const KIND_LABELS = { transfer: 'Transfer', mint: 'Mint', burn: 'Burn' }

function IconButton({ label, children, ...props }) {
  return <button type="button" className="ag-icon-button" aria-label={label} title={label} {...props}>{children}</button>
}

function TransactionDetail({ row, chain, onClose, onFocus }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const timer = useRef()
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => { setCopied(false); setCopyError(false) }, [row.id])
  const url = explorerLink(chain, 'tx', row.txHash)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(row.txHash)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1800)
    } catch { setCopyError(true) }
  }
  return <section className="ag-detail" aria-label="Transfer details">
    <div className="ag-panel-heading"><span>TRANSFER DETAILS</span><IconButton label="Close transfer details" onClick={onClose}><X size={16} /></IconButton></div>
    <div className={`ag-kind ag-kind--${row.kind}`}>{KIND_LABELS[row.kind]} · {row.chainName}</div>
    <h2 className="ag-detail-amount">{exactAmount(row.amountDisplay)} <span>AUSD</span></h2>
    <dl className="ag-detail-fields">
      <div><dt>From</dt><dd><code title={row.from}>{row.from}</code></dd></div>
      <div><dt>To</dt><dd><code title={row.to}>{row.to}</code></dd></div>
      <div><dt>Block / log</dt><dd>{row.blockNumber?.toLocaleString('en-US')} / {row.logIndex}</dd></div>
      <div><dt>Observed</dt><dd>{new Date(row.receivedAt).toLocaleTimeString()}</dd></div>
      {row.historical && <div><dt>Source</dt><dd>Recent block history loaded at connection</dd></div>}
    </dl>
    <div className="ag-hash"><code>{shortAddress(row.txHash)}</code><button type="button" onClick={copy} aria-label={copied ? 'Transaction hash copied' : 'Copy transaction hash'}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy hash'}</button></div>
    {copyError && <p role="status" className="ag-copy-error">Copy unavailable. Open the explorer to copy the full hash.</p>}
    <div className="ag-detail-actions"><button type="button" onClick={() => onFocus(row.fromNode)}><LocateFixed size={14} /> Show visual anchor</button>{url && <a href={url} target="_blank" rel="noreferrer">Explorer <ExternalLink size={14} /></a>}</div>
  </section>
}

export default function AgoraExperience({ mode = '3d' }) {
  const feed = useAgoraFeed()
  const [params, setParams] = useSearchParams()
  const chainFilter = params.get('chain') || 'all'
  const kindFilter = params.get('kind') || 'all'
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [autoRotate, setAutoRotate] = useState(false)
  const [selectedNode, setSelectedNode] = useState(null)
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [ready, setReady] = useState(false)
  const [sceneError, setSceneError] = useState('')
  const [sceneKey, setSceneKey] = useState(0)
  const [clock, setClock] = useState(Date.now())
  const controlsRef = useRef(null)
  const is3D = mode === '3d'
  const Renderer = is3D ? AgoraGlobe3D : AgoraMap2D
  const handleReady = useCallback(() => { setReady(true); setSceneError('') }, [])
  const handleError = useCallback(() => { setSceneError('This view could not load. Retry or switch views.'); setReady(false) }, [])
  const handleSelectNode = useCallback((node) => { setSelectedNode(node); setSelectedTransaction(null) }, [])

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 10_000)
    const onVisible = () => { if (!document.hidden) setClock(Date.now()) }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])
  useEffect(() => { controlsRef.current?.clear() }, [chainFilter, kindFilter, selectedNode?.id])
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') { setSelectedNode(null); setSelectedTransaction(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const rows = useMemo(() => filterTransfers(feed.history, chainFilter, kindFilter, selectedNode?.id), [feed.history, chainFilter, kindFilter, selectedNode])
  const batch = useMemo(() => ({ ...feed.batch, transfers: filterTransfers(feed.batch.transfers, chainFilter, kindFilter, selectedNode?.id) }), [feed.batch, chainFilter, kindFilter, selectedNode])
  const stats = useMemo(() => summarizeTransfers(rows), [rows])
  const coverage = connectionSummary(feed.chainStatus, clock)
  const selectedChain = feed.chains.find((chain) => String(chain.chainId) === chainFilter)
  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value === 'all') next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
    setSelectedTransaction(null)
  }
  const focusNode = (node) => controlsRef.current?.focus(node)
  const resetView = () => { setSelectedNode(null); setSelectedTransaction(null); controlsRef.current?.reset() }
  const retryScene = () => { setSceneError(''); setReady(false); setSceneKey((key) => key + 1) }
  const suffix = params.size ? `?${params.toString()}` : ''

  return <div className={`ag-experience ag-experience--${mode}`}>
    <header className="ag-header">
      <div className="ag-brand"><img src={AGORA_LOGO} alt="" /><div><div className="ag-wordmark">AGORA <span>ATLAS</span></div><p>AUSD across networks</p></div></div>
      <div className="ag-header-actions">
        <details className="ag-coverage">
          <summary><span className={`ag-status-dot ${coverage.live ? 'is-live' : ''}`} /><span>{coverage.label}</span><b>{coverage.connected}/{coverage.total || '—'}</b></summary>
          <div className="ag-coverage-popover"><strong>Network coverage</strong><p>Public RPC availability. Transfers are observed when each network responds.</p>{feed.chainStatus.map((status) => <div className="ag-network-status" key={status.chainId}><span>{status.chainName}</span><span className={status.status === 'live' ? 'is-live' : ''}>{status.status === 'live' && clock - (status.lastSuccessAt || 0) >= 30000 ? 'stale' : status.status}</span></div>)}<button type="button" onClick={refreshAgoraFeed}><RefreshCw size={13} /> Retry connections</button></div>
        </details>
        <nav className="ag-view-switch" aria-label="AGORA view"><Link to={`/agora-world${suffix}`} aria-current={!is3D ? 'page' : undefined}><Map size={15} />2D</Link><Link to={`/agora-world-3d${suffix}`} aria-current={is3D ? 'page' : undefined}><Globe2 size={15} />3D</Link></nav>
        <Link className="ag-home" to="/" aria-label="Home" title="Home"><Home size={17} /></Link>
      </div>
    </header>

    <nav className="ag-chain-bar" aria-label="Filter AUSD networks"><span className="ag-chain-label">NETWORK</span><button type="button" aria-pressed={chainFilter === 'all'} onClick={() => setFilter('chain', 'all')}>All networks <span>{feed.chains.length}</span></button>{feed.chains.map((chain) => <button type="button" key={chain.chainId} aria-pressed={chainFilter === String(chain.chainId)} onClick={() => setFilter('chain', String(chain.chainId))}>{chain.chainName}</button>)}</nav>

    <div className="ag-workspace">
      <section className="ag-visual" aria-label={is3D ? 'AUSD interactive globe' : 'AUSD interactive map'}>
        {feed.nodes.length > 0 && <Suspense fallback={null}><Renderer key={sceneKey} nodes={feed.nodes} batch={batch} paused={paused} autoRotate={autoRotate} selectedNodeId={selectedNode?.id} onSelectNode={handleSelectNode} onReady={handleReady} onError={handleError} controlsRef={controlsRef} /></Suspense>}
        <div className="ag-scene-title"><span className="ag-eyebrow">THE AUSD NETWORK</span><h1>Money in<br /><em>motion.</em></h1><p>{selectedChain?.chainName || 'One dollar. Many networks.'}</p></div>
        {(!ready || sceneError) && <div className="ag-scene-loading" role="status">{sceneError ? <><p>{sceneError}</p><button type="button" onClick={retryScene}>Reload view</button></> : <><span className="ag-loading-ring" /><span>Preparing {is3D ? 'globe' : 'map'}…</span></>}</div>}
        {selectedNode && <div className="ag-anchor-card"><div><span className="ag-eyebrow">VISUAL ANCHOR</span><h2>{selectedNode.city}</h2><p>{selectedNode.country} · {rows.length} matching events</p></div><IconButton label={`Focus ${selectedNode.city}`} onClick={() => focusNode(selectedNode)}><LocateFixed size={17} /></IconButton><IconButton label="Clear city selection" onClick={() => setSelectedNode(null)}><X size={17} /></IconButton></div>}
        <div className="ag-map-controls" aria-label="Map controls"><IconButton label="Zoom in" onClick={() => controlsRef.current?.zoomIn()}><Plus size={18} /></IconButton><IconButton label="Zoom out" onClick={() => controlsRef.current?.zoomOut()}><Minus size={18} /></IconButton><IconButton label="Reset view" onClick={resetView}><LocateFixed size={18} /></IconButton><span className="ag-control-divider" /><IconButton label={paused ? 'Resume motion' : 'Pause motion'} aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? <Play size={16} /> : <Pause size={16} />}</IconButton>{is3D && <IconButton label={autoRotate ? 'Stop globe rotation' : 'Rotate globe'} aria-pressed={autoRotate} onClick={() => setAutoRotate((value) => !value)}><RotateCcw size={16} /></IconButton>}</div>
        <div className="ag-scene-caption"><span className="ag-gold-line" />{paused ? 'Motion paused · feed stays live' : 'Recent AUSD transfers'}<span className="ag-scene-hint">{is3D ? 'Drag to orbit' : 'Drag to explore'} · scroll to zoom</span></div>
      </section>

      <aside className="ag-activity" aria-label="AUSD activity">
        {selectedTransaction ? <TransactionDetail row={selectedTransaction} chain={feed.chains.find((chain) => chain.chainId === selectedTransaction.chainId)} onClose={() => setSelectedTransaction(null)} onFocus={focusNode} /> : <>
          <div className="ag-activity-heading"><div><span className="ag-eyebrow">ON-CHAIN ACTIVITY</span><h2>The latest moves<span className={`ag-status-dot ${coverage.live ? 'is-live' : ''}`} /></h2></div><IconButton label="Refresh activity" onClick={refreshAgoraFeed}><RefreshCw size={15} /></IconButton></div>
          <div className="ag-observed-stats"><div><strong>{stats.count}</strong><span>Recent events</span></div><div><strong>{formatAmount(stats.volume, true)} <small>AUSD</small></strong><span>Value in this list</span></div></div>
          <div className="ag-feed-filters"><label htmlFor="ag-kind">Activity</label><select id="ag-kind" value={kindFilter} onChange={(event) => setFilter('kind', event.target.value)}><option value="all">All transfers</option><option value="transfer">Transfers</option><option value="mint">Mints</option><option value="burn">Burns</option></select>{selectedNode && <button type="button" onClick={() => setSelectedNode(null)} title="Clear city filter">{selectedNode.city}<X size={12} /></button>}</div>
          {(feed.error || (feed.chainStatus.length > 0 && !coverage.live && coverage.label !== 'Connecting')) && <div className="ag-feed-warning" role="status">{feed.error || 'Waiting for network responses. Connections retry automatically.'}</div>}
          <ol className="ag-feed-list" aria-label="Recent AUSD transfers">{rows.map((row) => <li key={row.id}><button type="button" className="ag-transfer" onClick={() => setSelectedTransaction(row)} aria-label={`${KIND_LABELS[row.kind]} ${formatAmount(row.amount)} AUSD on ${row.chainName}. View transaction details.`}><span className={`ag-transfer-icon ag-kind--${row.kind}`}>{row.kind === 'mint' ? <Plus size={15} /> : row.kind === 'burn' ? <Minus size={15} /> : <ArrowUpRight size={16} />}</span><span className="ag-transfer-main"><strong>{formatAmount(row.amount, true)} <small>AUSD</small></strong><span>{row.chainName}<i />{KIND_LABELS[row.kind]}</span></span><span className="ag-transfer-end"><time dateTime={new Date(row.receivedAt).toISOString()}>{new Date(row.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</time><code>{shortAddress(row.txHash)}</code></span><ChevronRight size={13} /></button></li>)}</ol>
          {!rows.length && <div className="ag-empty"><ArrowDownLeft size={24} /><strong>{feed.loading || coverage.label === 'Connecting' ? 'Connecting to AUSD networks' : 'Waiting for matching transfers'}</strong><p>{selectedNode ? `New events anchored to ${selectedNode.city} will appear here.` : 'Real transfers will appear as they are observed. Try another network or activity filter.'}</p></div>}
          <div className="ag-feed-footer"><span>Latest 150 events · includes recent history</span><span>Inspect <ArrowUpRight size={11} /></span></div>
        </>}
      </aside>
    </div>
    <footer className="ag-footer"><p><span>ILLUSTRATIVE GEOGRAPHY</span> Cities represent addresses, not real transfer locations.</p><a href="https://docs.agora.finance/developer/contract-deployments" target="_blank" rel="noreferrer">Verified AUSD contracts <ExternalLink size={11} /></a></footer>
  </div>
}
