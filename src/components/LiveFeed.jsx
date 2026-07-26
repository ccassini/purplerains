import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowDownRight, 
  ArrowUpRight, 
  Activity, 
  EyeOff,
  Boxes,
  ExternalLink,
  Zap,
  ArrowRightLeft,
  Send,
  Pause,
  Play,
  User,
  Trophy,
  TrendingUp,
  DollarSign,
  Coins
} from 'lucide-react'
import { useMonad } from '../contexts/MonadContext'
import { fetchMonadTVL, formatTVL, formatChange } from '../utils/defillamaApi'
import { fetchMonTokenData, formatLargeNumber } from '../utils/coingeckoApi'
import { formatUsd, formatAmount, formatTimeAgo, formatNumber, isStablecoin, getUtilizationColor } from '../utils/formatters'
import { projectFor } from '../utils/monadContracts'
import { Link } from 'react-router-dom'
import { fetchMonadEcosystem, formatTvlCompact, formatChangePct } from '../utils/ecosystemApi'
import { logger } from '../utils/logger'
import './LiveFeed.css'

const MAX_ROWS = 100
const SWAP_TICK_MS = 50
const TRANSFER_TICK_MS = 150

// ============ TOKEN ICONS ============
/** Token icon files that actually ship in /public — never guess beyond this map. */
const TOKEN_ICON_SRC = {
  MON: '/monad_logo.png',
  WMON: '/monad_logo.png',
  USDC: '/usdc.avif',
  USDT0: '/usdt0.webp',
  AUSD: '/ausd.png',
  USD1: '/usd1.svg',
  LVUSD: '/lvusd.png'
}

/**
 * Icon path for a token symbol, or null when we don't ship one.
 * @param {string | null | undefined} symbol
 * @returns {string | null}
 */
export function tokenIcon(symbol) {
  if (!symbol) return null
  return TOKEN_ICON_SRC[String(symbol).toUpperCase()] || null
}

/** Small round token icon; unknown symbols get an obvious monogram fallback. */
const TokenIcon = ({ symbol }) => {
  const src = tokenIcon(symbol)
  const letter = String(symbol || '?').charAt(0).toUpperCase()
  return (
    <span className="token-icon" title={symbol || undefined}>
      {src ? (
        <img
          src={src}
          alt={symbol || ''}
          width="16"
          height="16"
          loading="lazy"
          onError={(e) => {
            e.target.style.display = 'none'
            if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex'
          }}
        />
      ) : null}
      <span className="token-icon-fallback" style={{ display: src ? 'none' : 'flex' }}>
        {letter}
      </span>
    </span>
  )
}

// ============ SWAP ROW DERIVATION ============
const MON_LIKE_SYMBOLS = new Set(['MON', 'WMON'])

/** @param {string | null | undefined} symbol */
const isMonSymbol = (symbol) => MON_LIKE_SYMBOLS.has(String(symbol || '').toUpperCase())

/**
 * Stable dedupe key: one tx (plus log index when the source provides one) is
 * exactly one feed row, no matter how many times the pipeline re-delivers it.
 * @param {{ hash: string, logIndex?: number | null }} tx
 */
const swapRowKey = (tx) =>
  tx.logIndex !== undefined && tx.logIndex !== null ? `${tx.hash}#${tx.logIndex}` : tx.hash

/**
 * Turn an analyzed/enriched DeFi tx into one honest feed row.
 *
 * - Two observed legs (decoded ERC-20 transfers, or native MON sent with the
 *   call) → a swap row. Direction is only stated when a reference leg
 *   (stablecoin or MON/WMON) makes it derivable; otherwise the row is a
 *   neutral "Swap".
 * - One observed leg → a "flow" row: a DEX interaction where only one token
 *   movement is known. Labeled as such, never dressed up as a pair.
 * - No token movement at all → null (a 0-value router call is not a trade).
 *
 * @param {Record<string, any>} tx
 * @returns {Record<string, any> | null}
 */
function deriveSwapRow(tx) {
  const decodedSold =
    typeof tx.baseAmount === 'number' && Number.isFinite(tx.baseAmount) && tx.baseAmount > 0 && tx.baseSymbol
      ? { amount: tx.baseAmount, symbol: tx.baseSymbol }
      : null
  const bought =
    typeof tx.quoteAmount === 'number' && Number.isFinite(tx.quoteAmount) && tx.quoteAmount > 0 && tx.quoteSymbol
      ? { amount: tx.quoteAmount, symbol: tx.quoteSymbol }
      : null

  // Native MON attached to the call is a real observed leg (tx.value).
  const nativeAmount = Number.parseFloat(tx.value || 0) || 0
  const sold = decodedSold || (nativeAmount > 0 ? { amount: nativeAmount, symbol: 'MON' } : null)

  if (!sold && !bought) return null

  const kind = sold && bought ? 'swap' : 'flow'

  let direction = null
  if (kind === 'swap') {
    const soldStable = isStablecoin(sold.symbol)
    const boughtStable = isStablecoin(bought.symbol)
    if (soldStable && !boughtStable) direction = 'Buy'
    else if (boughtStable && !soldStable) direction = 'Sell'
    else if (isMonSymbol(sold.symbol) && !isMonSymbol(bought.symbol)) direction = 'Buy'
    else if (isMonSymbol(bought.symbol) && !isMonSymbol(sold.symbol)) direction = 'Sell'
  }

  // Pair reads token-first / reference-second, matching the Buy/Sell verb.
  const pairSymbols =
    kind === 'swap'
      ? direction === 'Buy'
        ? [bought.symbol, sold.symbol]
        : [sold.symbol, bought.symbol]
      : [(sold || bought).symbol]

  let usdValue = null
  if (typeof tx.usdValue === 'number' && Number.isFinite(tx.usdValue) && tx.usdValue > 0) {
    usdValue = tx.usdValue
  } else if (sold && isStablecoin(sold.symbol)) {
    usdValue = sold.amount
  } else if (bought && isStablecoin(bought.symbol)) {
    usdValue = bought.amount
  }

  return {
    id: swapRowKey(tx),
    hash: tx.hash,
    kind,
    direction,
    usdValue,
    sold,
    bought,
    pairSymbols,
    pairLabel: pairSymbols.join('/'),
    from: tx.from,
    to: tx.to,
    createdAt: Date.now(),
    isConfirmedSwap: Boolean(tx.isConfirmedSwap)
  }
}

// ============ URL QUERY HELPERS ============
const getTabFromUrl = () => {
  if (typeof window === 'undefined') return 'swaps'
  const params = new URLSearchParams(window.location.search)
  const tab = params.get('tab')?.toLowerCase()
  if (['swaps', 'blocks', 'transfers', 'tvl'].includes(tab)) {
    return tab
  }
  return 'swaps'
}

const updateUrlTab = (tab) => {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.set('tab', tab)
  window.history.replaceState({}, '', url.toString())
}

// ============ MAIN COMPONENT ============
const LiveFeed = () => {
  const { transactions, blocks, validatorLeaderboard, stats, config } = useMonad()

  // Top protocols for the TVL tab — fetched lazily on first open, from the
  // same live DefiLlama-backed source the /ecosystem page uses.
  const [topProtocols, setTopProtocols] = useState([])
  const topProtocolsLoaded = useRef(false)

  const [isOpen, setIsOpen] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const [activeTab, setActiveTab] = useState(() => getTabFromUrl()) // Read from URL on mount
  const [swapRows, setSwapRows] = useState([])
  const [transferRows, setTransferRows] = useState([])
  const [now, setNow] = useState(Date.now())
  const [tvlData, setTvlData] = useState({
    totalTVL: null,
    stablecoinMcap: null,
    change24h: null,
    change7d: null,
    protocolCount: 0,
    loading: true,
  })
  const [monTokenData, setMonTokenData] = useState({
    price: null,
    marketCap: null,
    fdv: null,
    change24h: null,
    loading: true,
  })

  const swapQueueRef = useRef([])
  const transferQueueRef = useRef([])
  const processedSwapHashesRef = useRef(new Set())
  const processedTransferHashesRef = useRef(new Set())

  const explorerBaseUrl = config?.explorerUrl || 'https://monadvision.com'

  // ============ LIVE BLOCK LEADERBOARD (unbounded counters) ============
  const blockLeaderboard = useMemo(() => {
    const totalBlocks = validatorLeaderboard?.totalBlocks || 0
    const validatorsObj = validatorLeaderboard?.validators || {}
    const firstSeenAt = validatorLeaderboard?.firstSeenAt || 0
    const lastSeenAt = validatorLeaderboard?.lastSeenAt || 0

    if (!totalBlocks || Object.keys(validatorsObj).length === 0) {
      return {
        rows: [],
        totalBlocks: 0,
        uniqueValidators: 0,
        windowMs: 0
      }
    }

    const rowsAll = Object.values(validatorsObj).sort((a, b) => {
      if (b.blocks !== a.blocks) return b.blocks - a.blocks
      return (b.lastSeen || 0) - (a.lastSeen || 0)
    })

    const windowMs = firstSeenAt > 0 ? Math.max(1, (lastSeenAt || Date.now()) - firstSeenAt) : 0

    return {
      rows: rowsAll.slice(0, 12),
      totalBlocks,
      uniqueValidators: rowsAll.length,
      windowMs
    }
  }, [validatorLeaderboard])

  // Handle tab change and update URL
  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab)
    updateUrlTab(tab)
  }, [])

  // Update time every second - only when panel is visible
  useEffect(() => {
    if (!isOpen) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [isOpen])

  // Fetch TVL data
  useEffect(() => {
    const fetchTVL = async () => {
      setTvlData((prev) => ({ ...prev, loading: true }))
      try {
        const data = await fetchMonadTVL()
        setTvlData({
          totalTVL: data.totalTVL,
          stablecoinMcap: data.stablecoinMcap,
          change24h: data.change24h,
          change7d: data.change7d,
          protocolCount: data.protocolCount,
          loading: false,
        })
      } catch (error) {
        logger.error('Failed to fetch TVL:', error)
        setTvlData((prev) => ({ ...prev, loading: false }))
      }
    }

    fetchTVL()
    const interval = window.setInterval(fetchTVL, 60000) // Refresh every minute
    return () => window.clearInterval(interval)
  }, [])

  // Fetch MON token data
  useEffect(() => {
    const fetchMonData = async () => {
      setMonTokenData((prev) => ({ ...prev, loading: true }))
      try {
        const data = await fetchMonTokenData()
        setMonTokenData({
          price: data.price,
          marketCap: data.marketCap,
          fdv: data.fdv,
          change24h: data.change24h,
          loading: false,
        })
      } catch (error) {
        logger.error('Failed to fetch MON token data:', error)
        setMonTokenData((prev) => ({ ...prev, loading: false }))
      }
    }

    fetchMonData()
    const interval = window.setInterval(fetchMonData, 60000) // Refresh every minute
    return () => window.clearInterval(interval)
  }, [])

  // ============ SWAPS LOGIC (ULTRA FAST) ============
  const pushToSwapQueue = useCallback((swap) => {
    swapQueueRef.current.push(swap)
    if (swapQueueRef.current.length > 3000) {
      swapQueueRef.current.splice(0, swapQueueRef.current.length - 3000)
    }
  }, [])

  // ============ TRANSFERS LOGIC (NORMAL) ============
  const pushToTransferQueue = useCallback((transfer) => {
    transferQueueRef.current.push(transfer)
    if (transferQueueRef.current.length > 500) {
      transferQueueRef.current.splice(0, transferQueueRef.current.length - 500)
    }
  }, [])

  useEffect(() => {
    if (!transactions || !transactions.length) return

    transactions.forEach((tx) => {
      if (!tx || !tx.hash) return

      // Handle DeFi swaps — a tx is ONE row, keyed by hash (+ log index).
      if (tx.category === 'defi' || tx.isDexTx || tx.isConfirmedSwap) {
        // Legacy simulated txs (should not appear on live RPC path)
        if (tx.isSimulated) return

        const key = swapRowKey(tx)
        if (processedSwapHashesRef.current.has(key)) return
        processedSwapHashesRef.current.add(key)
        if (processedSwapHashesRef.current.size > 2000) {
          const keys = Array.from(processedSwapHashesRef.current)
          keys.slice(0, 1000).forEach((k) => processedSwapHashesRef.current.delete(k))
        }

        const row = deriveSwapRow(tx)
        if (row) pushToSwapQueue(row)
        // A swap-category tx never doubles as a transfer row.
        return
      }

      // Handle Transfers (native MON transfers only - filter out 0 value and contract calls)
      const isTransfer = tx.category === 'transfer' ||
        tx.type === 'transfer' ||
        tx.categoryDisplay === 'Transfer' ||
        (!tx.isDexTx && tx.category !== 'defi' && tx.category !== 'nft' && tx.category !== 'contractDeploy')

      if (isTransfer) {
        if (processedTransferHashesRef.current.has(tx.hash)) return
        processedTransferHashesRef.current.add(tx.hash)
        if (processedTransferHashesRef.current.size > 2000) {
          const hashes = Array.from(processedTransferHashesRef.current)
          hashes.slice(0, 1000).forEach((h) => processedTransferHashesRef.current.delete(h))
        }

        // Parse value - handle string, number, hex formats
        let amount = 0
        if (tx.value !== undefined && tx.value !== null) {
          if (typeof tx.value === 'string') {
            if (tx.value.startsWith('0x')) {
              amount = parseInt(tx.value, 16) / 1e18
            } else {
              amount = Number.parseFloat(tx.value) || 0
            }
          } else if (typeof tx.value === 'number') {
            amount = tx.value
          } else if (typeof tx.value === 'bigint') {
            amount = Number(tx.value) / 1e18
          }
        }

        // Skip if amount is 0 or very small (likely contract call, not real transfer)
        if (amount < 0.000001) return

        const symbol = tx.tokenSymbol || 'MON'

        pushToTransferQueue({
          id: tx.hash,
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          amount,
          symbol,
          createdAt: Date.now()
        })
      }
    })
  }, [transactions, pushToSwapQueue, pushToTransferQueue])

  // Process swap queue - ULTRA FAST but ONE BY ONE (light speed sequential)
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (isPaused) return // Skip processing when paused
      if (!swapQueueRef.current.length) return
      // Process 1 swap per tick - sequential but VERY fast
      const batch = swapQueueRef.current.splice(0, 1)
      if (!batch.length) return
      // Render-level dedupe: one tx key is one row, even if re-queued upstream.
      setSwapRows((prev) => [batch[0], ...prev.filter((r) => r.id !== batch[0].id)].slice(0, MAX_ROWS))
    }, SWAP_TICK_MS)
    return () => window.clearInterval(interval)
  }, [isPaused])

  // Process transfer queue - normal speed
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (isPaused) return // Skip processing when paused
      if (!transferQueueRef.current.length) return
      // Process 1 transfer per tick (original speed)
      const batch = transferQueueRef.current.splice(0, 1)
      if (!batch.length) return
      // Render-level dedupe: one tx hash is one row, even if re-queued upstream.
      setTransferRows((prev) => [batch[0], ...prev.filter((r) => r.id !== batch[0].id)].slice(0, MAX_ROWS))
    }, TRANSFER_TICK_MS)
    return () => window.clearInterval(interval)
  }, [isPaused])

  useEffect(() => {
    if (activeTab !== 'tvl' || topProtocolsLoaded.current) return
    topProtocolsLoaded.current = true
    // No cleanup-cancel here on purpose: under StrictMode's double-mount the
    // first run claims the once-flag and a cleanup-cancel would discard its
    // result while the second run early-returns on the flag — the strip then
    // stays empty forever. A late setState on this tiny payload is harmless.
    fetchMonadEcosystem()
      .then((data) => {
        const ranked = (data?.projects || [])
          .filter((pr) => Number.isFinite(pr?.tvl) && pr.tvl > 0)
          .sort((a, b) => b.tvl - a.tvl)
          .slice(0, 6)
        setTopProtocols(ranked)
      })
      .catch(() => { topProtocolsLoaded.current = false })
  }, [activeTab])

  const tps = typeof stats?.currentTps === 'number' && !Number.isNaN(stats.currentTps)
    ? Math.round(stats.currentTps) : 0

  // ============ TOGGLE BUTTON (closed state) ============
  if (!isOpen) {
    return (
      <motion.button
        className="live-feed-toggle"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 10, opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        onClick={() => setIsOpen(true)}
      >
        <Activity size={14} />
        <span>Show Live Feed</span>
      </motion.button>
    )
  }

  // ============ MAIN PANEL ============
  return (
    <motion.div
      className="live-feed-panel"
      initial={{ x: -320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut', delay: 0.4 }}
    >
      {/* Header with Tabs */}
      <div className="live-feed-header">
        <div className="live-feed-tabs">
          <button
            className={`live-feed-tab ${activeTab === 'swaps' ? 'active' : ''}`}
            onClick={() => handleTabChange('swaps')}
          >
            <Activity size={14} />
            <span>Swaps</span>
          </button>
          <button
            className={`live-feed-tab ${activeTab === 'transfers' ? 'active' : ''}`}
            onClick={() => handleTabChange('transfers')}
          >
            <ArrowRightLeft size={14} />
            <span>Transfers</span>
          </button>
          <button
            className={`live-feed-tab ${activeTab === 'blocks' ? 'active' : ''}`}
            onClick={() => handleTabChange('blocks')}
          >
            <Boxes size={14} />
            <span>Blocks</span>
          </button>
          <button
            className={`live-feed-tab ${activeTab === 'tvl' ? 'active' : ''}`}
            onClick={() => handleTabChange('tvl')}
          >
            <TrendingUp size={14} />
            <span>TVL</span>
          </button>
        </div>

        <div className="live-feed-actions">
          <div className="live-feed-meta">
            <button
              type="button"
              className={`live-feed-pause ${isPaused ? 'paused' : ''}`}
              onClick={() => setIsPaused(!isPaused)}
              title={isPaused ? 'Resume Feed' : 'Pause Feed'}
            >
              {isPaused ? <Play size={12} /> : <Pause size={12} />}
            </button>
            <span className="live-feed-badge">
              <Zap size={10} /> {tps} TPS
            </span>
          </div>
          <button
            type="button"
            className="live-feed-hide"
            onClick={() => setIsOpen(false)}
            title="Hide Panel"
          >
            <EyeOff size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="live-feed-content">
        <AnimatePresence mode="wait">
          {activeTab === 'swaps' && (
            <motion.div
              key="swaps"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="live-feed-table"
            >
              <div className="live-feed-header-row swaps-header">
                <span className="col-time">Time</span>
                <span className="col-side">Type</span>
                <span className="col-pair">Pair</span>
                <span className="col-project">Project</span>
                <span className="col-value">Value</span>
                <span className="col-amount">Amount</span>
                <span className="col-maker">Maker</span>
                <span className="col-txn">Txn</span>
              </div>

              <div className="live-feed-body">
                <AnimatePresence initial={false}>
                  {swapRows.map((row) => {
                    const secondsAgo = Math.max(0, Math.floor((now - row.createdAt) / 1000))
                    const isBuy = row.direction === 'Buy'
                    const isSell = row.direction === 'Sell'
                    const sideClass = isBuy ? 'swap-side-buy' : isSell ? 'swap-side-sell' : 'swap-side-neutral'
                    const sideLabel = row.direction || (row.kind === 'swap' ? 'Swap' : 'DEX')
                    const SideIcon = isBuy ? ArrowUpRight : isSell ? ArrowDownRight : ArrowRightLeft
                    const project = projectFor(row.to)
                    return (
                      <motion.div
                        key={row.id}
                        className="live-feed-row swap-row"
                        initial={{ y: -10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 10, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <span className="col-time">{formatTimeAgo(secondsAgo)}</span>
                        <span className="col-side">
                          <span className={`swap-side-pill ${sideClass}`}>
                            <SideIcon size={12} />
                            <span>{sideLabel}</span>
                          </span>
                        </span>
                        <span className="col-pair">
                          <span className="pair-icons">
                            {row.pairSymbols.map((symbol, i) => (
                              <TokenIcon key={`${row.id}-tk-${i}`} symbol={symbol} />
                            ))}
                          </span>
                          <span className="pair-text" title={row.pairLabel}>{row.pairLabel}</span>
                        </span>
                        <span className="col-project">
                          {project ? (
                            <span className="project-chip" title={project.name}>
                              {project.logo ? (
                                <img
                                  src={project.logo}
                                  alt=""
                                  width="14"
                                  height="14"
                                  loading="lazy"
                                  onError={(e) => { e.target.style.display = 'none' }}
                                />
                              ) : null}
                              <span className="project-chip-name">{project.name}</span>
                            </span>
                          ) : null}
                        </span>
                        <span className="col-value">
                          {Number.isFinite(row.usdValue) && row.usdValue > 0 ? (
                            <span className="value-usd">{formatUsd(row.usdValue)}</span>
                          ) : (
                            <span className="value-none" title="No stable leg in this swap — USD value unknown">—</span>
                          )}
                        </span>
                        <span className="col-amount">
                          {row.sold && row.bought
                            ? `${formatAmount(row.sold.amount, row.sold.symbol)} → ${formatAmount(row.bought.amount, row.bought.symbol)}`
                            : formatAmount((row.sold || row.bought).amount, (row.sold || row.bought).symbol)}
                        </span>
                        <span className="col-maker">{row.from ? `${row.from.slice(0, 6)}...${row.from.slice(-4)}` : '—'}</span>
                        <span className="col-txn">
                          {row.hash ? (
                            <a href={`${explorerBaseUrl}/tx/${row.hash}`} target="_blank" rel="noreferrer">View</a>
                          ) : '—'}
                        </span>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
                {!swapRows.length && <div className="live-feed-empty">Waiting for DeFi swaps...</div>}
              </div>
            </motion.div>
          )}

          {activeTab === 'blocks' && (
            <motion.div
              key="blocks"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="live-feed-table blocks-layout"
            >
              <div className="blocks-main">
                <div className="live-feed-header-row blocks-header">
                  <span className="col-time">Time</span>
                  <span className="col-block">Block</span>
                  <span className="col-validator">Validator</span>
                  <span className="col-reward">Burned</span>
                  <span className="col-txs">TXs</span>
                  <span className="col-fill">Fill %</span>
                  <span className="col-gas">Gas</span>
                  <span className="col-link">Explorer</span>
                </div>

                <div className="live-feed-body">
                  <AnimatePresence initial={false}>
                    {blocks.map((block) => {
                      const secondsAgo = Math.max(0, Math.floor((now - block.receivedAt) / 1000))
                      const utilization = block.networkUtilization || 0
                      const utilizationColor = getUtilizationColor(utilization)
                      return (
                        <motion.div
                          key={block.number}
                          className="live-feed-row block-row"
                          initial={{ y: -10, opacity: 0, scale: 0.98 }}
                          animate={{ y: 0, opacity: 1, scale: 1 }}
                          exit={{ y: 10, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                        >
                          <span className="col-time">{formatTimeAgo(secondsAgo)}</span>
                          <span className="col-block">
                            <span className="block-number">#{formatNumber(block.number)}</span>
                          </span>
                          <span className="col-validator">
                            {block.proposerValidator ? (
                              <div className="validator-cell">
                                <div className="validator-avatar-small">
                                  {block.proposerValidator.localLogo ? (
                                    <img
                                      src={block.proposerValidator.localLogo}
                                      alt={block.proposerValidator.name}
                                      onError={(e) => {
                                        e.target.style.display = 'none'
                                        if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex'
                                      }}
                                    />
                                  ) : null}
                                  <div
                                    className="validator-fallback-small"
                                    style={{ display: block.proposerValidator.localLogo ? 'none' : 'flex' }}
                                  >
                                    <User size={10} />
                                  </div>
                                </div>
                                <span className="validator-name-small" title={block.proposerValidator.name}>
                                  {block.proposerValidator.name?.length > 10
                                    ? block.proposerValidator.name.slice(0, 10) + '...'
                                    : block.proposerValidator.name}
                                </span>
                              </div>
                            ) : (
                              <span className="validator-unknown">—</span>
                            )}
                          </span>
                          <span className="col-reward">
                            <span
                              className="reward-value burn-value"
                              title="MON destroyed by this block (gasUsed x baseFee, EIP-1559)"
                            >
                              {(() => {
                                const burned = block.gasUsed && block.baseFeePerGas
                                  ? (block.gasUsed * block.baseFeePerGas) / 1e18
                                  : 0
                                if (burned <= 0) return '—'
                                return burned >= 1 ? `🔥 ${burned.toFixed(2)}` : `🔥 ${burned.toFixed(4)}`
                              })()}
                            </span>
                          </span>
                          <span className="col-txs">
                            <span className="tx-count">{block.transactionCount || 0}</span>
                          </span>
                          <span className="col-fill">
                            <div className="fill-bar-container">
                              <div
                                className="fill-bar"
                                style={{ width: `${Math.min(100, utilization)}%`, backgroundColor: utilizationColor }}
                              />
                              <span className="fill-percent" style={{ color: utilizationColor }}>
                                {utilization.toFixed(1)}%
                              </span>
                            </div>
                          </span>
                          <span className="col-gas">{block.gasUsed ? `${(block.gasUsed / 1_000_000).toFixed(2)}M` : '—'}</span>
                          <span className="col-link">
                            <a
                              href={`${explorerBaseUrl}/block/${block.number}`}
                              target="_blank"
                              rel="noreferrer"
                              className="block-link"
                            >
                              <ExternalLink size={12} />
                              View
                            </a>
                          </span>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                  {!blocks.length && <div className="live-feed-empty">Waiting for new blocks...</div>}
                </div>
              </div>

              <aside className="blocks-leaderboard" aria-label="Live validator leaderboard">
                <div className="blocks-leaderboard-header">
                  <div className="blocks-leaderboard-title">
                    <Trophy size={14} />
                    <span>Live Leaderboard</span>
                  </div>
                  <span className="blocks-leaderboard-badge" title="window = last received blocks in this panel">
                    {blockLeaderboard.totalBlocks} blocks
                  </span>
                </div>

                <div className="blocks-leaderboard-summary">
                  <span>{blockLeaderboard.uniqueValidators}</span>
                  <span>
                    {Number.isFinite(stats?.avgBlockTimeMs) && stats.avgBlockTimeMs > 0
                      ? `${Math.round(stats.avgBlockTimeMs)}ms block time`
                      : 'block time —'}
                  </span>
                  <span>
                    {blockLeaderboard.rows?.[0]?.blocks ? `Top ${blockLeaderboard.rows[0].blocks}` : '—'}
                  </span>
                </div>

                <div className="blocks-leaderboard-list">
                  {blockLeaderboard.rows.length === 0 ? (
                    <div className="blocks-leaderboard-empty">Waiting for blocks…</div>
                  ) : (
                    blockLeaderboard.rows.map((row, idx) => {
                      const lastSeenSec = row.lastSeen ? Math.max(0, Math.floor((now - row.lastSeen) / 1000)) : 0
                      const displayName = row.name || 'Unknown'
                      return (
                        <div key={row.key} className="blocks-leaderboard-row">
                          <div className="lb-rank">#{idx + 1}</div>
                          <div className="lb-avatar">
                            {row.logo ? (
                              <img
                                src={row.logo}
                                alt=""
                                onError={(e) => {
                                  e.target.style.display = 'none'
                                  if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex'
                                }}
                              />
                            ) : null}
                            <span style={{ display: row.logo ? 'none' : 'flex' }}>
                              {displayName.charAt(0)}
                            </span>
                          </div>
                          <div className="lb-info">
                            <div className="lb-name" title={displayName}>{displayName}</div>
                            <div className="lb-sub">{row.id !== null && row.id !== undefined ? `#${row.id}` : '—'}</div>
                          </div>
                          <div className="lb-count">{row.blocks}</div>
                          <div className="lb-last">{row.lastSeen ? formatTimeAgo(lastSeenSec) : '—'}</div>
                        </div>
                      )
                    })
                  )}
                </div>
              </aside>
            </motion.div>
          )}

          {activeTab === 'transfers' && (
            <motion.div
              key="transfers"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="live-feed-table"
            >
              <div className="live-feed-header-row transfers-header">
                <span className="col-time">Time</span>
                <span className="col-from">From</span>
                <span className="col-arrow"></span>
                <span className="col-to">To</span>
                <span className="col-transfer-amount">Amount</span>
                <span className="col-txn">Txn</span>
              </div>

              <div className="live-feed-body">
                <AnimatePresence initial={false}>
                  {transferRows.map((row) => {
                    const secondsAgo = Math.max(0, Math.floor((now - row.createdAt) / 1000))
                    return (
                      <motion.div
                        key={row.id}
                        className="live-feed-row transfer-row"
                        initial={{ y: -10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 10, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <span className="col-time">{formatTimeAgo(secondsAgo)}</span>
                        <span className="col-from">
                          {row.from ? `${row.from.slice(0, 6)}...${row.from.slice(-4)}` : '—'}
                        </span>
                        <span className="col-arrow">
                          <Send size={14} className="transfer-arrow" />
                        </span>
                        <span className="col-to">
                          {row.to ? `${row.to.slice(0, 6)}...${row.to.slice(-4)}` : '—'}
                        </span>
                        <span className="col-transfer-amount">
                          <span className="transfer-amount-value">{formatAmount(row.amount, row.symbol)}</span>
                        </span>
                        <span className="col-txn">
                          {row.hash ? (
                            <a href={`${explorerBaseUrl}/tx/${row.hash}`} target="_blank" rel="noreferrer">View</a>
                          ) : '—'}
                        </span>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
                {!transferRows.length && <div className="live-feed-empty">Waiting for transfers...</div>}
              </div>
            </motion.div>
          )}

          {activeTab === 'tvl' && (
            <motion.div
              key="tvl"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="live-feed-table tvl-layout"
            >
              <div className="tvl-main">
                <div className="tvl-header-section">
                  <div className="tvl-title">
                    <TrendingUp size={18} />
                    <span>Monad DeFi TVL</span>
                  </div>
                </div>

                <div className="tvl-metrics-grid">
                  <div className="tvl-metric-card">
                    <div className="tvl-metric-header">
                      <DollarSign size={16} />
                      <span className="tvl-metric-label">Total TVL</span>
                    </div>
                    <div className="tvl-metric-value">
                      {tvlData.loading ? (
                        <span className="loading-shimmer">Loading...</span>
                      ) : (
                        formatTVL(tvlData.totalTVL)
                      )}
                    </div>
                    <div className="tvl-metric-changes">
                      {tvlData.change24h !== null && (
                        <div className={`tvl-metric-change ${tvlData.change24h >= 0 ? 'positive' : 'negative'}`}>
                          {formatChange(tvlData.change24h)} 24h
                        </div>
                      )}
                      {tvlData.change7d !== null && (
                        <div className={`tvl-metric-change ${tvlData.change7d >= 0 ? 'positive' : 'negative'}`}>
                          {formatChange(tvlData.change7d)} 7d
                        </div>
                      )}
                    </div>
                    {tvlData.change7d !== null && (
                      <div className="tvl-metric-sub">
                        {tvlData.change7d >= 0 ? '↗ Growth' : '↘ Decline'}
                      </div>
                    )}
                  </div>

                  <div className="tvl-metric-card">
                    <div className="tvl-metric-header">
                      <Coins size={16} />
                      <span className="tvl-metric-label">Stablecoin Mcap</span>
                    </div>
                    <div className="tvl-metric-value">
                      {tvlData.loading ? (
                        <span className="loading-shimmer">Loading...</span>
                      ) : (
                        formatTVL(tvlData.stablecoinMcap)
                      )}
                    </div>
                    <div className="tvl-stablecoin-icons">
                      <img src="/usdc.avif" alt="USDC" className="tvl-stablecoin-icon" title="USDC" />
                      <img src="/ausd.png" alt="AUSD" className="tvl-stablecoin-icon" title="AUSD" />
                      <img src="/usd1.svg" alt="USD1" className="tvl-stablecoin-icon" title="USD1" />
                      <img src="/usdt0.webp" alt="USDT0" className="tvl-stablecoin-icon" title="USDT0" />
                      <img src="/lvusd.png" alt="LVUSD" className="tvl-stablecoin-icon" title="LVUSD" />
                    </div>
                  </div>

                  <div className="tvl-metric-card">
                    <div className="tvl-metric-header">
                      <DollarSign size={16} />
                      <span className="tvl-metric-label">MON Market Cap</span>
                    </div>
                    <div className="tvl-metric-value">
                      {monTokenData.loading ? (
                        <span className="loading-shimmer">Loading...</span>
                      ) : (
                        formatLargeNumber(monTokenData.marketCap)
                      )}
                    </div>
                    {monTokenData.change24h !== null && (
                      <div className={`tvl-metric-change ${monTokenData.change24h >= 0 ? 'positive' : 'negative'}`}>
                        {formatChange(monTokenData.change24h)} 24h
                      </div>
                    )}
                  </div>

                  <div className="tvl-metric-card">
                    <div className="tvl-metric-header">
                      <TrendingUp size={16} />
                      <span className="tvl-metric-label">MON FDV</span>
                    </div>
                    <div className="tvl-metric-value">
                      {monTokenData.loading ? (
                        <span className="loading-shimmer">Loading...</span>
                      ) : (
                        formatLargeNumber(monTokenData.fdv)
                      )}
                    </div>
                    {monTokenData.price !== null && (
                      <div className="tvl-metric-sub">
                        ${monTokenData.price.toFixed(4)} per MON
                      </div>
                    )}
                  </div>

                </div>

                {topProtocols.length > 0 && (
                  <div className="tvl-protocols">
                    <div className="tvl-protocols-head">
                      <span>Top protocols by TVL</span>
                      <Link to="/ecosystem" className="tvl-protocols-more">
                        Full ecosystem →
                      </Link>
                    </div>
                    <div className="tvl-protocols-grid">
                      {topProtocols.map((pr) => (
                        <a
                          key={pr.slug || pr.name}
                          className="tvl-protocol-card"
                          href={pr.url || undefined}
                          target="_blank"
                          rel="noreferrer"
                          title={pr.name}
                        >
                          {pr.logo ? (
                            <img
                              src={pr.logo}
                              alt=""
                              loading="lazy"
                              onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                            />
                          ) : (
                            <span className="tvl-protocol-mono">{(pr.name || '?').slice(0, 1)}</span>
                          )}
                          <span className="tvl-protocol-name">{pr.name}</span>
                          <span className="tvl-protocol-tvl">{formatTvlCompact(pr.tvl)}</span>
                          {Number.isFinite(pr.change1d) && (
                            <span className={`tvl-protocol-delta ${pr.change1d >= 0 ? 'positive' : 'negative'}`}>
                              {formatChangePct(pr.change1d)}
                            </span>
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="tvl-footer">
                  <a
                    href="https://defillama.com/chain/Monad"
                    target="_blank"
                    rel="noreferrer"
                    className="tvl-external-link-footer"
                  >
                    <ExternalLink size={14} />
                    <span>View on DeFiLlama</span>
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

export default React.memo(LiveFeed)
