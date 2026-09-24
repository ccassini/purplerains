import { lazy, Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Columns, Database, Maximize2, Minimize2, Pause, Play, RefreshCw, Search, SlidersHorizontal, Terminal, Volume2, VolumeX, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { WINDOWS } from './terminal/constants'
import { formatClock, formatNum, formatUsd } from './terminal/format'
import { matchesQuery, parseSizeInput } from './terminal/marketMath'
import { sortPools } from './terminal/poolNormalize'
import { activityFromSearch, filterChainRows, filterMarketRows, marketFromSearch, mergeSearchPools, selectionLabel } from './terminal/terminalView'
import { useKeyboard } from './terminal/useKeyboard'
import { useTerminal } from './terminal/useTerminal'
import { usePerplMarketData } from './terminal/usePerplMarketData'
import { useTerminalFlow } from './terminal/useTerminalFlow'
import { PerplMarkets, PerplTradeTable, PerplMarketContext } from './terminal/TerminalPerpl'
import TerminalTable from './terminal/TerminalTable'
import TerminalInspector from './terminal/TerminalInspector'
import TerminalChainTable, { TerminalBlockContext } from './terminal/TerminalChainTable'
const TerminalDefiOverview = lazy(() => import('./terminal/TerminalDefiOverview'))
import './TerminalPage.css'

const MARKET_MODES = [{ id: 'pools', label: 'Pools' }, { id: 'fresh', label: 'New' }, { id: 'wallets', label: 'Wallets' }, { id: 'tokens', label: 'Tokens' }, { id: 'compare', label: 'Spreads' }, { id: 'tvl', label: 'TVL' }]
const POOL_SORTS = [{ id: 'volume', label: 'Volume' }, { id: 'tvl', label: 'Liquidity' }, { id: 'change', label: 'Price change' }, { id: 'created', label: 'Newest' }, { id: 'swaps', label: 'Swaps' }, { id: 'fees', label: 'Est. fees' }, { id: 'fee', label: 'Fee rate' }]
const WALLET_SORTS = [{ id: 'volume', label: 'Volume' }, { id: 'fills', label: 'Trades' }, { id: 'last_ts', label: 'Last activity' }, { id: 'realized_pnl', label: 'Realized P/L' }, { id: 'unrealized_pnl', label: 'Open P/L' }, { id: 'net_pnl', label: 'Net P/L' }, { id: 'win_rate', label: 'Win rate' }]

function useCompactTerminal() {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 700px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)')
    const update = () => setCompact(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return compact
}

const SessionContext = memo(function SessionContext({ overview, tokens, onSelect }) {
  const count = overview.buys + overview.sells
  const buyShare = count ? overview.buys / count * 100 : 50
  return <div className="term-session-context">
    <div className="term-context-heading"><span>ORDER FLOW</span><small>Observed session</small></div>
    <div className="term-flow-values"><span className="up">{formatNum(overview.buys)} <small>BUYS</small></span><span className="down">{formatNum(overview.sells)} <small>SELLS</small></span></div>
    <div className="term-flow-bar" aria-label={`${overview.buys} observed buys and ${overview.sells} observed sells`}><span style={{ width: `${buyShare}%` }} /><i /></div>
    <dl className="term-session-facts"><div><dt>Buy volume</dt><dd className="up">{formatUsd(overview.bought)}</dd></div><div><dt>Sell volume</dt><dd className="down">{formatUsd(overview.sold)}</dd></div><div><dt>Active wallets</dt><dd>{formatNum(overview.active_traders)}</dd></div><div><dt>Tracked tokens</dt><dd>{formatNum(overview.tokens)}</dd></div></dl>
    <div className="term-context-heading"><span>TOKEN FLOW</span><small>Net USD</small></div>
    <div className="term-context-tokens">{tokens.slice(0, 5).map((token) => <button type="button" key={token.token} onClick={() => onSelect('token', token.token)}><span>{token.symbol}</span><strong className={token.net_usd >= 0 ? 'up' : 'down'}>{formatUsd(token.net_usd, { signed: true })}</strong></button>)}</div>
    <p className="term-context-hint">Select a pool, token or wallet to inspect it here. The live tape stays in view.</p>
  </div>
})

const TerminalWorkspace = memo(function TerminalWorkspace({ tm, embedded }) {
  const compact = useCompactTerminal()
  const [searchParams, setSearchParams] = useSearchParams()
  const activityMode = activityFromSearch(searchParams.toString())
  const isSwaps = activityMode === 'swaps'
  const isPerp = activityMode === 'perp'
  const perpl = usePerplMarketData({ active: isPerp })
  const [perplMarketId, setPerplMarketId] = useState(null)
  const [perplSide, setPerplSide] = useState('all')
  const perplMarket = perpl.markets.find((market) => market.id === perplMarketId) || perpl.markets[0] || null
  const marketMode = marketFromSearch(searchParams.toString())
  const [mobilePane, setMobilePane] = useState(!isPerp && marketMode === 'tvl' ? 'market' : 'tape')
  const previousMarketMode = useRef(marketMode)
  const [venue, setVenue] = useState('all')
  const [marketPage, setMarketPage] = useState(1)
  const [activityPages, setActivityPages] = useState({ swaps: 1, perp: 1, transfers: 1, blocks: 1 })
  const tapePage = activityPages[activityMode]
  const setTapePage = useCallback((page) => setActivityPages((pages) => ({ ...pages, [activityMode]: page })), [activityMode])
  const [advanced, setAdvanced] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [focusTape, setFocusTape] = useState(false)
  const [frozenFeed, setFrozenFeed] = useState(null)
  const { selected, select, clearSelection, setSelectedOnly, setFollow, setQuery, setSide, setMinUsdRaw, setMaxUsdRaw, setMinMcapRaw, setClean, poolSort, setPoolSort, setPoolDir } = tm
  const selectedKey = selected ? `${selected.type}:${selected.id}` : ''
  const filterKey = [tm.query, tm.side, tm.minUsdRaw, tm.maxUsdRaw, tm.minMcapRaw, tm.clean, tm.windowId, tm.tapeSource, tm.selectedOnly ? selectedKey : '', perplMarketId, perplSide].join('|')
  const selectedWallet = tm.selectedOnly && selected?.type === 'wallet' ? selected.id : null
  const transferRows = useMemo(() => filterChainRows(tm.chain.transfers, 'transfers', tm.query, selectedWallet), [tm.chain.transfers, tm.query, selectedWallet])
  const blockRows = useMemo(() => filterChainRows(tm.chain.blocks, 'blocks', tm.query), [tm.chain.blocks, tm.query])
  const perplRows = useMemo(() => perpl.trades.filter((row) => (perplMarketId == null || row.marketId === perplMarketId) && (perplSide === 'all' || row.side === perplSide) && matchesQuery(tm.query, row.symbol, row.hash, row.blockNumber)), [perpl.trades, perplMarketId, perplSide, tm.query])
  const activityRows = isSwaps ? tm.tape : isPerp ? perplRows : activityMode === 'transfers' ? transferRows : blockRows
  const tapeRef = useRef(activityRows)
  tapeRef.current = activityRows
  const canScopeSelection = Boolean(selected && (isSwaps || activityMode === 'transfers' && selected.type === 'wallet'))
  const changeActivity = useCallback((mode) => {
    setSearchParams((previous) => { const next = new URLSearchParams(previous); if (next.get('tab')?.toLowerCase() === 'tvl' && !next.has('market')) next.set('market', 'tvl'); next.set('tab', mode); return next }, { replace: true })
    if (mode === 'blocks') clearSelection()
    setMobilePane('tape')
  }, [setSearchParams, clearSelection])
  useEffect(() => {
    if (previousMarketMode.current !== marketMode && !isPerp && marketMode === 'tvl') setMobilePane('market')
    previousMarketMode.current = marketMode
  }, [marketMode, isPerp])
  const period = tm.win.gecko === 'h1' ? '1h' : '24h'
  const live = tm.isConnected && tm.status.lag_seconds != null && tm.status.lag_seconds < 8
  const streamLabel = live ? 'LIVE' : tm.isConnected ? 'CATCHING UP' : tm.connectionStatus === 'error' || tm.connectionStatus === 'reconnecting' ? 'RECONNECTING' : 'CONNECTING'

  const onSelect = useCallback((kind, id) => {
    if (!id) return
    setFocusTape(false)
    if (selected?.type !== kind || selected?.id !== id) select(kind, id)
    if (compact) setMobilePane('detail')
  }, [select, selected, compact])
  const closeInspector = useCallback(() => {
    if (isPerp) { setPerplMarketId(null); setPerplSide('all'); setQuery('') }
    else clearSelection()
    if (compact) setMobilePane('tape')
  }, [clearSelection, compact, isPerp, setQuery])
  const focusSearch = useCallback(() => tm.filterRef.current?.focus(), [tm.filterRef])
  useKeyboard({ setWindowId: tm.setWindowId, toggleSound: tm.toggleSound, toggleFollow: tm.toggleFollow, toggleClean: tm.toggleClean, focusFilter: focusSearch, clearSelection: closeInspector })

  useEffect(() => { setMarketPage(1) }, [marketMode, venue, tm.query, tm.windowId, tm.poolSort, tm.poolDir, tm.traderSort])
  useEffect(() => { setActivityPages({ swaps: 1, perp: 1, transfers: 1, blocks: 1 }) }, [filterKey])
  useEffect(() => {
    if (!tm.follow && tm.isFiltering) return
    setFrozenFeed(tm.follow ? null : { mode: activityMode, rows: tapeRef.current })
    if (tm.follow) setTapePage(1)
  }, [tm.follow, tm.isFiltering, filterKey, activityMode, setTapePage])

  const allPools = useMemo(() => mergeSearchPools(tm.pools, tm.remoteHits), [tm.pools, tm.remoteHits])
  const poolRows = useMemo(() => filterMarketRows(sortPools(allPools, tm.poolSort, tm.poolDir), tm.query, venue), [allPools, tm.poolSort, tm.poolDir, tm.query, venue])
  const freshRows = useMemo(() => filterMarketRows(sortPools(tm.fresh, tm.poolSort, tm.poolDir), tm.query, venue), [tm.fresh, tm.poolSort, tm.poolDir, tm.query, venue])
  const tokenRows = useMemo(() => filterMarketRows(tm.tokens, tm.query), [tm.tokens, tm.query])
  const walletRows = useMemo(() => tm.traders.filter((row) => matchesQuery(tm.query, row.address, ...(row.symbols || []))), [tm.traders, tm.query])
  const compareRows = useMemo(() => tm.dislocations.filter((row) => matchesQuery(tm.query, row.pair, row.buyAt, row.sellAt)), [tm.dislocations, tm.query])
  const venues = useMemo(() => [...new Map([...allPools, ...tm.fresh].filter((row) => row.dexId).map((row) => [row.dexId, row.dexName || row.dexId])).entries()], [allPools, tm.fresh])
  const marketRows = marketMode === 'fresh' ? freshRows : marketMode === 'wallets' ? walletRows : marketMode === 'tokens' ? tokenRows : marketMode === 'compare' ? compareRows : poolRows
  const tapeRows = !tm.follow && frozenFeed?.mode === activityMode ? frozenFeed.rows : activityRows
  const label = selectionLabel(selected, [...allPools, ...tm.fresh], tm.tokens)
  const onTapePage = useCallback((page) => { setFollow(false); setTapePage(page) }, [setFollow, setTapePage])
  const onSort = useCallback((key) => {
    if (poolSort === key) setPoolDir((value) => value === 'desc' ? 'asc' : 'desc')
    else { setPoolSort(key); setPoolDir('desc') }
  }, [poolSort, setPoolSort, setPoolDir])
  const clearFilters = useCallback(() => {
    setPerplMarketId(null); setPerplSide('all');
    setQuery(''); setSide('all'); setMinUsdRaw(''); setMaxUsdRaw(''); setMinMcapRaw(''); setClean(false); setSelectedOnly(false); setVenue('all')
  }, [setQuery, setSide, setMinUsdRaw, setMaxUsdRaw, setMinMcapRaw, setClean, setSelectedOnly])
  const pickMarket = (id) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      if (id === 'pools') next.delete('market')
      else next.set('market', id)
      if (next.get('tab')?.toLowerCase() === 'tvl') next.set('tab', 'swaps')
      return next
    }, { replace: true })
    setVenue('all'); setPoolSort(id === 'fresh' ? 'created' : 'volume'); setPoolDir('desc')
  }
  const remoteSearch = (event) => { event.preventDefault(); if (isPerp) return; setFocusTape(false); pickMarket('pools'); setMobilePane('market'); tm.runRemoteSearch() }
  const hasFilters = Boolean(tm.query || (isPerp ? perplMarketId != null || perplSide !== 'all' : isSwaps ? tm.side !== 'all' || tm.minUsdRaw || tm.maxUsdRaw || tm.minMcapRaw || tm.clean || tm.selectedOnly : selectedWallet))
  const invalidSize = [tm.minUsdRaw, tm.maxUsdRaw, tm.minMcapRaw].some((value) => value.trim() && (parseSizeInput(value) == null || parseSizeInput(value) < 0))
  const invalidRange = tm.minUsdRaw && tm.maxUsdRaw && parseSizeInput(tm.minUsdRaw) > parseSizeInput(tm.maxUsdRaw)
  const tapeFocused = focusTape && !compact
  const showMarket = !tapeFocused && (!compact || mobilePane === 'market')
  const showTape = !compact || mobilePane === 'tape'
  const showDetail = !tapeFocused && (!compact || mobilePane === 'detail')
  const flowRef = useTerminalFlow({ rows: tapeRows, enabled: tm.follow && tapePage === 1, active: showTape, resetKey: `${activityMode}|${filterKey}|${tapePage}|${expanded}` })
  const marketLoading = !tm.status.gecko_at && !tm.status.dex_at && !tm.status.gecko_errors?.length && !tm.status.dex_error
  const sourceWarning = Boolean(tm.status.gecko_errors?.length || tm.status.dex_error || tm.status.trade_error)
  const marketUnavailable = (marketMode === 'pools' || marketMode === 'fresh' || marketMode === 'compare') && !marketRows.length && !tm.query && venue === 'all' && (marketMode === 'fresh' ? tm.status.gecko_errors?.length > 0 : tm.status.gecko_errors?.length > 0 && Boolean(tm.status.dex_error))

  return <div className={`term-page term-home${embedded ? ' term-embedded' : ''}${tapeFocused ? ' is-tape-focused' : ''}`}>
    <header className="term-commandbar">
      <h1><Terminal size={17} /><span>TERMINAL</span><small>/ MONAD</small></h1>
      <form className="term-search" onSubmit={remoteSearch}>
        <Search size={13} /><input ref={tm.filterRef} value={tm.query} onChange={(event) => setQuery(event.target.value)} placeholder={isPerp ? "Search Perpl market or transaction…" : "Search token, wallet, block, transaction…"} aria-label="Search terminal" autoComplete="off" spellCheck="false" />
        {tm.query ? <><button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={12} /></button>{!isPerp && <button type="submit" className="term-search-go" disabled={tm.searching}>{tm.searching ? '…' : 'FIND POOLS'}</button>}</> : <kbd>/</kbd>}
      </form>
      <div className="term-command-actions">
        <details className="term-sources"><summary aria-label="Data sources and status" title="Data sources"><Database size={15} /></summary><div className="term-source-popover"><strong>DATA SOURCES</strong><p>Markets: GeckoTerminal + DEX Screener. Live RPC is the default activity source. Indexed trades are available separately; market snapshots never replace the RPC stream.</p><dl><div><dt>Gecko fetched · UTC</dt><dd>{formatClock(tm.status.gecko_at)}</dd></div><div><dt>DEX fetched · UTC</dt><dd>{formatClock(tm.status.dex_at)}</dd></div><div><dt>Pools sampled this session</dt><dd>{formatNum(tm.status.sampled_pools)}</dd></div><div><dt>Retained trades</dt><dd>{formatNum(tm.status.fills_indexed)}</dd></div></dl>{tm.status.gecko_errors?.length > 0 && <p className="term-warning">{[...new Set(tm.status.gecko_errors)].join(' · ')}</p>}{tm.status.dex_error && <p className="term-warning">DEX Screener: {tm.status.dex_error}</p>}{tm.status.trade_error && <p className="term-warning">Pool samples: {tm.status.trade_error}</p>}<p>Market snapshots refresh separately from the live chain. Selected pools include their most recent indexed trades.</p><p>Perp: public Perpl market and trade feed. Prices and values are quoted in AUSD.</p><p>Wallet P/L covers observed trades with known cost basis. It is not the wallet’s full history.</p></div></details>
        <button className="term-icon" type="button" aria-label="Refresh market data" title="Refresh data" onClick={isPerp ? perpl.retry : tm.refreshData} disabled={!isPerp && tm.refreshing}><RefreshCw size={14} /></button>
        <button className="term-icon" type="button" aria-label={tm.soundOn ? 'Mute trade sounds' : 'Enable trade sounds'} title="Sound · S" aria-pressed={tm.soundOn} onClick={tm.toggleSound}>{tm.soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}</button>
      </div>
    </header>

    <div className="term-readouts" aria-label="Terminal market and network status">
      <span className={`term-connection${live ? ' is-live' : ''}`}><i />{streamLabel}</span>
      <span><small>BLOCK</small><strong>{tm.status.last_block?.toLocaleString('en-US') || '—'}</strong></span>
      <span><small>TPS</small><strong>{formatNum(tm.status.tps)}</strong></span>
      <span><small>{isPerp ? 'DEX LIQUIDITY' : 'LIQUIDITY'}</small><strong>{formatUsd(tm.market.tvl)}</strong></span>
      <span><small>{period.toUpperCase()}{isPerp ? ' DEX VOL' : ' VOL'}</small><strong>{formatUsd(tm.market.volume)}</strong></span>
      <span><small>{isPerp ? 'DEX TRADES' : 'TRADES'}</small><strong>{formatNum(tm.overview.fills)}</strong></span>
      <span><small>{isPerp ? 'DEX WALLETS' : 'WALLETS'}</small><strong>{formatNum(tm.overview.active_traders)}</strong></span>
    </div>

    {compact && <nav className="term-mobile-nav" aria-label="Terminal panels">{[{ id: 'tape', name: 'Live activity' }, { id: 'market', name: 'Markets' }, { id: 'detail', name: isPerp ? 'Market details' : selected ? 'Inspector' : 'Session' }].map((pane) => <button type="button" key={pane.id} aria-pressed={mobilePane === pane.id} onClick={() => setMobilePane(pane.id)}>{pane.name}</button>)}</nav>}
    {tm.query && <div className="term-search-results" role="status"><span>{isPerp ? `SEARCH: ${perplRows.length} Perpl trades` : <>SEARCH: {poolRows.length} pools · {walletRows.length} wallets · {tokenRows.length} tokens · {tm.tape.length} trades · {transferRows.length} transfers · {blockRows.length} blocks</>}</span>{tm.searchError && <span className="term-warning">{tm.searchError}</span>}</div>}

    <div className="term-workspace">
      {showMarket && <section className="term-panel term-market-panel" aria-label="Market navigator">
        <div className="term-panel-heading"><h2><span className="term-panel-number">01</span>MARKET NAVIGATOR</h2><span className="term-panel-count">{isPerp ? perpl.markets.length : marketMode === 'tvl' ? 'MONAD' : marketRows.length}</span></div>
        {isPerp ? <><div className="term-market-tools term-perpl-tools"><button type="button" aria-pressed={perplMarketId == null} onClick={() => setPerplMarketId(null)}>All markets</button><span>{perplMarketId == null ? 'Live perpetuals' : perplMarket?.symbol}</span></div><PerplMarkets markets={perpl.markets} selectedMarketId={perplMarketId} status={perpl.status} onSelect={(id) => { setPerplMarketId(id); if (compact) setMobilePane('tape') }} /></> : <>
        <nav className="term-panel-tabs" aria-label="Market views">{MARKET_MODES.map((mode) => <button type="button" key={mode.id} aria-pressed={marketMode === mode.id} onClick={() => pickMarket(mode.id)}>{mode.label}</button>)}</nav>
        {(marketMode === 'pools' || marketMode === 'fresh') && <div className="term-market-tools"><select aria-label="Filter by venue" value={venue} onChange={(event) => setVenue(event.target.value)}><option value="all">All venues</option>{venues.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><select aria-label="Sort pools" value={tm.poolSort} onChange={(event) => setPoolSort(event.target.value)}>{POOL_SORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><button type="button" className="term-icon" aria-label={tm.poolDir === 'desc' ? 'Sort ascending' : 'Sort descending'} onClick={() => setPoolDir((value) => value === 'desc' ? 'asc' : 'desc')}>{tm.poolDir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}</button></div>}
        {marketMode === 'wallets' && <div className="term-market-tools"><span>Observed activity</span><select aria-label="Sort wallets" value={tm.traderSort} onChange={(event) => tm.setTraderSort(event.target.value)}>{WALLET_SORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>}
        {marketMode === 'compare' && <p className="term-panel-note">Snapshot gaps · execution costs excluded</p>}
        {marketMode === 'tvl' ? <Suspense fallback={<p className="term-panel-note">Loading DeFi overview…</p>}><TerminalDefiOverview /></Suspense> : <TerminalTable rows={marketRows} type={marketMode} page={marketPage} onPage={setMarketPage} onSelect={onSelect} sort={tm.poolSort} direction={tm.poolDir} onSort={onSort} period={period} walletSort={tm.traderSort} tokenImages={tm.tokenImages} selectedKey={selectedKey} emptyTitle={marketUnavailable ? 'Market source unavailable' : tm.query ? 'No matching results' : marketLoading ? 'Loading markets…' : 'No data in this view'} emptyDescription={marketUnavailable ? 'Retrying automatically. Live chain activity continues; Find pools can query another source.' : tm.query ? 'Change the search or use Find pools.' : 'Available market data will appear here.'} onReset={tm.query || venue !== 'all' ? clearFilters : null} />}
        </>}
      </section>}

      {showTape && <section ref={flowRef} className="term-panel term-tape-panel" aria-label="Live activity">
        <div className="term-panel-heading"><h2><span className="term-panel-number">02</span>LIVE ACTIVITY <i className={(isPerp ? perpl.status === 'live' : live) && tm.follow ? 'term-live-dot' : 'term-paused-dot'} /></h2><div className="term-tape-actions"><button type="button" className={`term-pause${tm.follow ? '' : ' is-paused'}`} title="Pause visible rows · F" onClick={tm.toggleFollow}>{tm.follow ? <Pause size={11} /> : <Play size={11} />}{tm.follow ? 'PAUSE' : 'RESUME'}</button>{!compact && <button className="term-icon" type="button" aria-label={focusTape ? 'Restore all panels' : 'Expand live activity'} onClick={() => setFocusTape((value) => !value)}>{focusTape ? <Minimize2 size={12} /> : <Maximize2 size={12} />}</button>}</div></div>
        <nav className="term-activity-tabs" aria-label="Activity views">{[{ id: 'swaps', label: 'Swaps', count: tm.overview.fills }, { id: 'perp', label: 'Perp', count: perpl.trades.length, logo: '/ecosystem/Perpl.avif' }, { id: 'transfers', label: 'Transfers', count: tm.chain.transfers.length }, { id: 'blocks', label: 'Blocks', count: tm.chain.blocks.length }].map((mode) => <button type="button" key={mode.id} aria-pressed={activityMode === mode.id} onClick={() => changeActivity(mode.id)}>{mode.logo && <img className="term-activity-logo" src={mode.logo} alt="Perpl" width="13" height="13" />}{mode.label}<span>{formatNum(mode.count)}</span></button>)}</nav>
        {isPerp ? <div className="term-tape-toolbar term-perpl-toolbar"><div className="term-side-tabs" aria-label="Perpl trade side">{[{ id: 'all', name: 'ALL' }, { id: 'buy', name: 'BUYS' }, { id: 'sell', name: 'SELLS' }].map((side) => <button type="button" key={side.id} aria-pressed={perplSide === side.id} onClick={() => setPerplSide(side.id)}>{side.name}</button>)}</div><select aria-label="Perpl market" value={perplMarketId ?? 'all'} onChange={(event) => setPerplMarketId(event.target.value === 'all' ? null : Number(event.target.value))}><option value="all">All Perpl markets</option>{perpl.markets.map((market) => <option key={market.id} value={market.id}>{market.symbol}</option>)}</select><span className={perpl.status === 'error' ? 'term-warning' : ''}>{perpl.status === 'live' ? 'PERPL LIVE' : perpl.status.toUpperCase()}</span></div> : isSwaps ? <div className="term-tape-toolbar"><div className="term-side-tabs" aria-label="Trade type">{[{ id: 'all', name: 'ALL' }, { id: 'buys', name: 'BUYS' }, { id: 'sells', name: 'SELLS' }, { id: 'lp', name: 'LP' }].map((side) => <button type="button" key={side.id} aria-pressed={tm.side === side.id} onClick={() => setSide(side.id)}>{side.name}</button>)}</div><select aria-label="Swap data source" value={tm.tapeSource} onChange={(event) => tm.setTapeSource(event.target.value)}><option value="chain">Live RPC</option><option value="gecko">Indexed trades</option><option value="all">All sources</option></select><select aria-label="Observation window" value={tm.windowId} onChange={(event) => tm.setWindowId(event.target.value)}>{WINDOWS.map((win) => <option key={win.id} value={win.id}>{win.id === 'all' ? 'Session' : win.label}</option>)}</select><button className="term-icon" type="button" aria-label="Trade filters" title="Amount filters" aria-expanded={advanced} aria-controls="terminal-filters" onClick={() => setAdvanced((value) => !value)}><SlidersHorizontal size={13} /></button><button className="term-icon" type="button" aria-label="Show additional trade columns" title="Price, quantity, market cap and source" aria-pressed={expanded} onClick={() => setExpanded((value) => !value)}><Columns size={13} /></button></div> : <div className="term-tape-toolbar term-chain-toolbar"><span>{activityMode === 'blocks' ? 'Recent blocks · observed on Monad' : 'MON transfers + contract value · live RPC'}</span>{activityMode === 'blocks' && <button className="term-icon" type="button" aria-label="Show block gas and burn" aria-pressed={expanded} onClick={() => setExpanded((value) => !value)}><Columns size={13} /></button>}</div>}
        {isSwaps && advanced && <div className="term-advanced" id="terminal-filters"><label>Min USD<input value={tm.minUsdRaw} onChange={(e) => setMinUsdRaw(e.target.value)} placeholder="0" inputMode="decimal" /></label><label>Max USD<input value={tm.maxUsdRaw} onChange={(e) => setMaxUsdRaw(e.target.value)} placeholder="Any" inputMode="decimal" /></label><label>Min mcap<input value={tm.minMcapRaw} onChange={(e) => setMinMcapRaw(e.target.value)} placeholder="e.g. 1m" inputMode="decimal" /></label><label className="term-check"><input type="checkbox" checked={tm.clean} onChange={tm.toggleClean} />Priced ≥ $1</label>{(invalidSize || invalidRange) && <p role="alert">{invalidSize ? 'Enter a positive amount (k, m, b accepted).' : 'Minimum must not exceed maximum.'}</p>}<button type="button" onClick={clearFilters}>Reset</button></div>}
        <div className="term-tape-scope"><span>{tm.follow ? 'LATEST OBSERVED' : 'PAUSED · COLLECTING'}{isPerp ? ` / PERPL / ${perplMarketId == null ? 'ALL MARKETS' : perplMarket?.symbol || 'MARKET'}` : tm.selectedOnly && canScopeSelection ? ` / ${label}` : isSwaps ? ` / ${tm.tapeSource === 'chain' ? 'LIVE RPC' : tm.tapeSource === 'gecko' ? 'INDEXED TRADES' : 'ALL SOURCES'}` : activityMode === 'blocks' ? ' / BLOCKS' : ' / ALL TRANSFERS'}</span>{canScopeSelection && <button type="button" aria-pressed={tm.selectedOnly} onClick={() => setSelectedOnly(!tm.selectedOnly)}>{tm.selectedOnly ? 'Clear scope ×' : 'Selected only'}</button>}</div>
        {isPerp ? <PerplTradeTable rows={tapeRows} page={tapePage} onPage={onTapePage} markets={perpl.markets} onSelectMarket={(id) => { setPerplMarketId(id); if (compact) setMobilePane('detail') }} emptyTitle={hasFilters ? 'No Perpl trades match this scope' : perpl.status === 'error' ? 'Perpl feed unavailable' : 'Connecting to Perpl…'} emptyDescription={hasFilters ? 'Select all markets, clear the search or change the side filter.' : perpl.error || 'Live perpetual trades will appear when the feed connects.'} /> : isSwaps ? <TerminalTable rows={tapeRows} type="feed" page={tapePage} onPage={onTapePage} onSelect={onSelect} expanded={expanded} tokenImages={tm.tokenImages} selectedKey={selectedKey} emptyTitle={hasFilters ? 'No trades match this scope' : 'Listening to Monad…'} emptyDescription={hasFilters ? 'Try all markets or change your filters.' : tm.tapeSource === 'gecko' ? 'Indexed pool trades will appear when the market source responds. Live RPC remains available separately.' : 'RPC token movements appear immediately; receipt details update the same row. One-sided movements are labeled DEX flow.'} onReset={hasFilters ? clearFilters : null} /> : <TerminalChainTable rows={tapeRows} type={activityMode} page={tapePage} onPage={onTapePage} onSelect={onSelect} expanded={expanded} explorer={tm.status.explorer} emptyTitle={hasFilters ? 'No matching activity' : `Waiting for ${activityMode}…`} emptyDescription={hasFilters ? 'Change the search or clear the wallet scope.' : 'Live chain observations will appear here.'} onReset={hasFilters ? clearFilters : null} />}
        {isPerp ? <div className="term-tape-summary"><span>{formatNum(perplRows.length)} matching trades</span><span>AUSD quotes · UTC times</span><span>{perpl.lastMessageAt ? `FEED ${formatClock(perpl.lastMessageAt)}` : 'Awaiting feed'}</span></div> : isSwaps ? <div className="term-tape-summary"><span><i className="up" />BUY <strong>{formatUsd(tm.overview.bought)}</strong></span><span><i className="down" />SELL <strong>{formatUsd(tm.overview.sold)}</strong></span><span>{formatNum(tm.overview.active_traders)} wallets</span></div> : <div className="term-tape-summary"><span>{formatNum(activityRows.length)} matching {activityMode}</span><span>{activityMode === 'blocks' ? 'Block timestamps · UTC' : 'MON amounts · native value'}</span><span>Observed session</span></div>}
      </section>}

      {showDetail && <aside className="term-panel term-detail-panel" aria-label="Inspector and session context">
        {isPerp ? <PerplMarketContext market={perplMarket} status={perpl.status} lastMessageAt={perpl.lastMessageAt} error={perpl.error} onRetry={perpl.retry} /> : selected ? <TerminalInspector tm={tm} embedded nativeTransfers={activityMode === 'transfers' ? tm.chain.transfers : null} relatedLabel={activityMode === 'transfers' && selected.type === 'wallet' ? 'View related transfers' : 'View related trades'} onClose={closeInspector} onShowTrades={() => { if (!(activityMode === 'transfers' && selected?.type === 'wallet')) changeActivity('swaps'); if (selected?.type === 'pool') tm.setTapeSource('all'); setSelectedOnly(true); setQuery(''); setMobilePane('tape'); setTapePage(1) }} /> : <><div className="term-panel-heading"><h2><span className="term-panel-number">03</span>SESSION INTELLIGENCE</h2></div>{activityMode === 'blocks' ? <TerminalBlockContext {...tm.chain} /> : <SessionContext overview={tm.overview} tokens={tm.tokens} onSelect={onSelect} />}</>}
      </aside>}
    </div>

    <footer className="term-footer"><span className={sourceWarning ? 'term-warning' : ''}><i />{sourceWarning ? 'SOURCE WARNING' : 'MONAD MAINNET'}<b>143</b></span><span title="Market snapshot fetch times in UTC">GT {formatClock(tm.status.gecko_at)} <b>·</b> DS {formatClock(tm.status.dex_at)}</span><span className="term-shortcuts">/ SEARCH <b>·</b> F PAUSE <b>·</b> ESC CLEAR</span><span>READ ONLY</span></footer>
  </div>
})

export default function TerminalPage({ embedded = false }) {
  const tm = useTerminal()
  return <TerminalWorkspace tm={tm} embedded={embedded} />
}
