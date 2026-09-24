import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useMonad } from '../../contexts/MonadContext'
import { accountFills, overviewFromBooks, sortTraders } from './accounting'
import {
  CHAIN_ID,
  CHAIN_LABEL,
  CHAIN_NAME,
  CHAIN_SLUG,
  DEFAULT_WINDOW,
  FILL_STORE_CAP,
  TAPE_CAP,
  WINDOWS,
} from './constants'
import { searchMonadPairsSnapshot } from './dexSearch'
import { computeDislocations, parseSizeInput, poolMarketOverview, searchCorpus } from './marketMath'
import { marksFromPools, mergePools, normalizeDexPair, sortPools } from './poolNormalize'
import { useClickSound } from './useClickSound'
import { windowById } from './format'
import { filterTerminalSource, selectTerminalTape } from './terminalTape'
import { useTerminalChainData } from './useTerminalChainData'
import { useTerminalMarketData } from './useTerminalMarketData'
import { collectTerminalTransactions, createTerminalFillStore, createTerminalPublisher } from './terminalPerformance'

function isVisible() {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden'
}

function connectionSnapshot(monad) {
  return {
    isConnected: monad.isConnected,
    connectionStatus: monad.connectionStatus,
    blockNumber: monad.latestBlock?.number ?? null,
    blockTs: monad.latestBlock?.timestamp ?? null,
    tps: monad.stats?.currentTps ?? null,
    explorer: monad.config?.explorerUrl || 'https://monadvision.com',
    nowMs: Date.now(),
  }
}

export function useTerminal() {
  const monad = useMonad()
  const { transactions } = monad
  const chain = useTerminalChainData({ transactions, blocks: monad.blocks, validatorLeaderboard: monad.validatorLeaderboard })
  const connectionRef = useRef(null)
  connectionRef.current = connectionSnapshot(monad)
  const [connection, setConnection] = useState(() => connectionRef.current)
  const { isConnected, connectionStatus, nowMs } = connection
  const sound = useClickSound()

  const [windowId, setWindowId] = useState(DEFAULT_WINDOW)
  const [section, setSection] = useState('pools')
  const [query, setQuery] = useState('')
  const [minUsdRaw, setMinUsdRaw] = useState('')
  const [maxUsdRaw, setMaxUsdRaw] = useState('')
  const [minMcapRaw, setMinMcapRaw] = useState('')
  const [side, setSide] = useState('all')
  const [tapeSource, setTapeSource] = useState('chain')
  const [proto, setProto] = useState('all')
  const [follow, setFollow] = useState(true)
  const [clean, setClean] = useState(false)
  const [poolSort, setPoolSort] = useState('volume')
  const [poolDir, setPoolDir] = useState('desc')
  const [traderSort, setTraderSort] = useState('realized_pnl')
  const [selected, setSelected] = useState(null)
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [remoteHits, setRemoteHits] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)

  const [fills, setFills] = useState([])

  const fillStoreRef = useRef(null)
  if (!fillStoreRef.current) fillStoreRef.current = createTerminalFillStore({ capacity: FILL_STORE_CAP })
  const processedTxRef = useRef(new Set())
  const marksRef = useRef({})
  const publisherRef = useRef(null)
  const searchControllerRef = useRef(null)
  const [arrived, setArrived] = useState([])
  const [expirationAt, setExpirationAt] = useState(Date.now)
  const filterRef = useRef(null)

  const win = windowById(WINDOWS, windowId)
  const geckoWindow = win.gecko
  const deferredQuery = useDeferredValue(query)
  const searchScopeRef = useRef(null)
  searchScopeRef.current = { query: query.trim(), geckoWindow }

  useEffect(() => {
    const publisher = createTerminalPublisher(() => {
      const store = fillStoreRef.current
      if (store.dirty) {
        setFills(store.snapshot())
        setExpirationAt(Date.now())
        setArrived(store.takeArrived())
      }
      setConnection({ ...connectionRef.current, nowMs: Date.now() })
    }, { intervalMs: 250 })
    publisherRef.current = publisher
    publisher.setActive(isVisible())
    publisher.request()
    let expirationTimer = null
    const expire = () => setExpirationAt(Date.now())
    const visibility = () => {
      const active = isVisible()
      publisher.setActive(active)
      if (expirationTimer !== null) window.clearInterval(expirationTimer)
      expirationTimer = null
      if (active) {
        expire()
        expirationTimer = window.setInterval(expire, 15_000)
      }
    }
    visibility()
    document.addEventListener('visibilitychange', visibility)
    return () => {
      publisher.dispose()
      publisherRef.current = null
      if (expirationTimer !== null) window.clearInterval(expirationTimer)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])

  useEffect(() => {
    publisherRef.current?.request()
  }, [monad.latestBlock?.number, monad.latestBlock?.timestamp, monad.isConnected, monad.connectionStatus, monad.stats?.currentTps, monad.config?.explorerUrl])

  useEffect(() => {
    if (!arrived.length) return undefined
    const id = window.setTimeout(() => setArrived([]), 1100)
    return () => window.clearTimeout(id)
  }, [arrived])

  const ingest = useCallback((fill) => {
    if (!fillStoreRef.current.add(fill)) return
    if (isVisible() && (fillStoreRef.current.lastChange?.newEvents ?? 1) > 0) sound.playRef.current?.(fill.usd)
    publisherRef.current?.request()
  }, [sound.playRef])

  const prioritizePool = useCallback((poolId) => {
    if (fillStoreRef.current.setPriorityPool(poolId)) publisherRef.current?.request()
  }, [])
  const marketData = useTerminalMarketData({ window: geckoWindow, selected, remoteHits, onFill: ingest, onPriorityPool: prioritizePool })
  const { pools, fresh, geckoAt, geckoErrors, dexAt, dexError, tradeError, sampledPools, refreshing, poolCoverage, retrySelected } = marketData
  const refreshData = marketData.refresh
  const indexNote = geckoErrors.length || dexError ? 'index warn' : 'stream live'
  const marks = useMemo(() => marksFromPools(mergePools([...pools, ...fresh, ...remoteHits])), [pools, fresh, remoteHits])
  const tokenImages = useMemo(() => {
    const images = {}
    for (const pool of [...pools, ...fresh, ...remoteHits]) {
      for (const token of [pool.base, pool.quote]) {
        if (token?.address && token.image) images[token.address.toLowerCase()] = token.image
      }
    }
    return images
  }, [pools, fresh, remoteHits])
  marksRef.current = marks

  useEffect(() => {
    collectTerminalTransactions(transactions, {
      processed: processedTxRef.current,
      ingest,
      remove: (id) => { if (fillStoreRef.current.remove(id)) publisherRef.current?.request() },
      marks: marksRef.current,
      capacity: FILL_STORE_CAP,
    })
  }, [transactions, ingest])

  useEffect(() => setExpirationAt(Date.now()), [win.ms])

  const scopedFills = useMemo(() => {
    const cutoff = Number.isFinite(win.ms) ? expirationAt - win.ms : 0
    return filterTerminalSource(fills, tapeSource).filter((f) => Number.isFinite(f.ts) && f.ts >= cutoff)
  }, [fills, tapeSource, win.ms, expirationAt])

  const books = useMemo(
    () => accountFills(scopedFills, { nowMs: expirationAt, windowMs: win.ms, marks }),
    [scopedFills, win.ms, expirationAt, marks],
  )

  const traders = useMemo(() => sortTraders(books.traders, traderSort), [books.traders, traderSort])
  const tokens = useMemo(
    () => [...books.tokens].sort((a, b) => (b.usd_in || 0) - (a.usd_in || 0)),
    [books.tokens],
  )
  const overview = useMemo(
    () => overviewFromBooks({ fills: scopedFills, windowId, books, nowMs: expirationAt }),
    [scopedFills, windowId, books, expirationAt],
  )

  const minUsd = parseSizeInput(minUsdRaw)
  const maxUsd = parseSizeInput(maxUsdRaw)
  const minMcap = parseSizeInput(minMcapRaw)

  const observedTape = useMemo(() => scopedFills.slice(0, TAPE_CAP), [scopedFills])
  const tapeSelection = selectedOnly ? selected : null
  const tape = useMemo(
    () =>
      selectTerminalTape(scopedFills, {
        q: deferredQuery,
        side,
        proto,
        selected: tapeSelection,
        selectedOnly,
        minUsd,
        maxUsd,
        minMcap,
        clean,
      }),
    [scopedFills, deferredQuery, side, proto, tapeSelection, selectedOnly, minUsd, maxUsd, minMcap, clean],
  )

  const sortedPoolRows = useMemo(() => sortPools(pools, poolSort, poolDir), [pools, poolSort, poolDir])
  const dislocations = useMemo(() => computeDislocations(pools), [pools])
  const market = useMemo(() => poolMarketOverview(pools), [pools])
  const localHits = useMemo(
    () => searchCorpus({ q: deferredQuery, pools, traders, tape: scopedFills, tokens }),
    [deferredQuery, pools, traders, scopedFills, tokens],
  )

  useEffect(() => {
    searchControllerRef.current?.abort()
    setSearching(false)
    setSearchError(null)
    setRemoteHits([])
    return () => searchControllerRef.current?.abort()
  }, [query, geckoWindow])

  const runRemoteSearch = useCallback(async () => {
    searchControllerRef.current?.abort()
    const q = query.trim()
    if (!q) {
      setRemoteHits([])
      setSearching(false)
      return
    }
    const controller = new AbortController()
    searchControllerRef.current = controller
    const current = () => !controller.signal.aborted && searchControllerRef.current === controller
      && searchScopeRef.current.query === q && searchScopeRef.current.geckoWindow === geckoWindow
    setSearching(true)
    setSearchError(null)
    try {
      const snapshot = await searchMonadPairsSnapshot(q, { signal: controller.signal })
      if (current()) setRemoteHits(snapshot.pairs.map((p) => normalizeDexPair(p, geckoWindow, snapshot)).filter(Boolean))
    } catch (err) {
      if (current()) {
        setSearchError(err.message || String(err))
        setRemoteHits([])
      }
    } finally {
      if (current()) setSearching(false)
    }
  }, [query, geckoWindow])

  const toggleSound = sound.toggle
  const toggleFollow = useCallback(() => setFollow((v) => !v), [])
  const toggleClean = useCallback(() => setClean((v) => !v), [])
  const focusFilter = useCallback(() => {
    // The redesigned page keeps search in its shared toolbar.
    window.requestAnimationFrame(() => filterRef.current?.focus())
  }, [])
  const clearSelection = useCallback(() => {
    setSelected(null)
    setSelectedOnly(false)
  }, [])
  const select = useCallback((type, id) => {
    setSelected((prev) => (prev && prev.type === type && prev.id === id ? null : { type, id }))
  }, [])

  const status = useMemo(() => ({
    ok: connection.isConnected,
    chain: CHAIN_SLUG,
    chain_id: CHAIN_ID,
    chain_name: CHAIN_NAME,
    chain_label: CHAIN_LABEL,
    source: connection.isConnected ? 'websocket' : connection.connectionStatus,
    last_block: connection.blockNumber,
    lag_seconds: connection.blockTs ? Math.max(0, (Math.max(connection.nowMs, expirationAt) - connection.blockTs) / 1000) : null,
    tps: connection.tps,
    gecko_at: geckoAt,
    gecko_errors: geckoErrors,
    dex_at: dexAt,
    dex_error: dexError,
    trade_error: tradeError,
    sampled_pools: sampledPools,
    fills_indexed: fills.length,
    coverage:
      'Observed live Monad mainnet session plus GeckoTerminal/DexScreener snapshots. Not a full-history LP index.',
    explorer: connection.explorer,
    market_limited: win.marketLimited,
  }), [connection, expirationAt, geckoAt, geckoErrors, dexAt, dexError, tradeError, sampledPools, fills.length, win.marketLimited])

  const session = useMemo(() => ({
    ...fillStoreRef.current.session,
    ageS: Math.max(0, (Math.max(nowMs, expirationAt) - fillStoreRef.current.session.started) / 1000),
  }), [nowMs, expirationAt])

  const selectedWallet = selected?.type === 'wallet' ? selected.id : null
  const selectedPool = useMemo(() => selected?.type === 'pool'
    ? mergePools([...pools, ...fresh, ...remoteHits]).find((p) => p.address === selected.id || p.id === selected.id)
    : null, [selected, pools, fresh, remoteHits])
  const openForWallet = useMemo(() => selectedWallet
    ? books.openPositions.filter((p) => p.wallet === selectedWallet)
    : [], [selectedWallet, books.openPositions])
  const closedForWallet = useMemo(() => selectedWallet
    ? books.closed.filter((p) => p.wallet === selectedWallet)
    : [], [selectedWallet, books.closed])
  const traderDetail = useMemo(() => selectedWallet ? traders.find((t) => t.address === selectedWallet) : null,
    [selectedWallet, traders])

  return useMemo(() => ({
    chain,
    windowId,
    setWindowId,
    win,
    section,
    setSection,
    query,
    setQuery,
    minUsdRaw,
    setMinUsdRaw,
    maxUsdRaw,
    setMaxUsdRaw,
    minMcapRaw,
    setMinMcapRaw,
    side,
    setSide,
    tapeSource,
    setTapeSource,
    tokenImages,
    proto,
    setProto,
    follow,
    setFollow,
    clean,
    setClean,
    poolSort,
    setPoolSort,
    poolDir,
    setPoolDir,
    traderSort,
    setTraderSort,
    selected,
    selectedOnly,
    setSelectedOnly,
    select,
    clearSelection,
    soundOn: sound.enabled,
    toggleSound,
    toggleFollow,
    toggleClean,
    focusFilter,
    filterRef,
    runRemoteSearch,
    refreshData,
    refreshing,
    poolCoverage,
    retrySelected,
    isFiltering: query !== deferredQuery,
    searching,
    searchError,
    remoteHits,
    localHits,
    pools: sortedPoolRows,
    fresh,
    dislocations,
    market,
    tape,
    observedTape,
    traders,
    tokens,
    closed: closedForWallet,
    openPositions: openForWallet,
    overview,
    status,
    session,
    indexNote,
    arrived,
    selectedPool,
    traderDetail,
    isConnected,
    connectionStatus,
  }), [
    chain, windowId, win, section, query, minUsdRaw, maxUsdRaw, minMcapRaw, side, tapeSource, tokenImages, proto, follow, clean,
    poolSort, poolDir, traderSort, selected, selectedOnly, select, clearSelection, sound.enabled, toggleSound,
    toggleFollow, toggleClean, focusFilter, runRemoteSearch, refreshData, refreshing, poolCoverage, retrySelected, deferredQuery,
    searching, searchError, remoteHits, localHits, sortedPoolRows, fresh, dislocations, market, tape, observedTape,
    traders, tokens, closedForWallet, openForWallet, overview, status, session, indexNote, arrived,
    selectedPool, traderDetail, isConnected, connectionStatus,
  ])
}
