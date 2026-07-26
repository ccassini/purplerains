import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo
} from 'react'
import { createMonadConnection, computeLiveTps, computeAvgBlockTimeMs } from '../utils/monadUtils'
import TransactionAnalyzer from '../utils/transactionAnalyzer'
import { logger } from '../utils/logger'
import { MONAD_MAINNET_CONFIG } from '../config/monadNetwork'
import { fetchProposerValidatorId, getValidatorById, loadValidatorMetadata } from '../utils/validatorApi'
import { requestThrottler } from '../utils/performance'
import {
  KNOWN_DEX_ADDRESSES,
  SWAP_METHOD_SIGNATURES,
  enrichDefiTransactionFromReceipt,
  normalizeBlockNumber,
  toNumberish,
} from '../utils/txEnrichment'
import { BLOCK_TIME_MS } from '../utils/formatters'

// =====================================================
// BLOCK RECRUITS — the ship's own crew list
// =====================================================
/**
 * Bounded sample of a block's own transactions, attached to the block entry at
 * fetch time. The Odyssey's boarding rule — a soldier boards only the ship
 * whose block contains its transaction — depends on this arriving WITH the
 * block: the tx flush timer publishes transactions ~130ms after the block
 * commits, so anything derived from the transactions feed races and loses.
 * 24 entries ≈ 2KB per block; state growth stays bounded by the block list cap.
 */
const RECRUITS_PER_BLOCK = 24
function buildRecruits(transactions) {
  const out = []
  if (!Array.isArray(transactions)) return out
  for (const tx of transactions) {
    if (out.length >= RECRUITS_PER_BLOCK) break
    if (!tx || typeof tx === 'string' || !tx.hash) continue
    const input = tx.input || '0x'
    const isDex = (tx.to && KNOWN_DEX_ADDRESSES.has(tx.to.toLowerCase())) ||
      (input.length >= 10 && SWAP_METHOD_SIGNATURES.has(input.slice(0, 10).toLowerCase()))
    out.push({
      hash: tx.hash,
      // Destination contract: the project-attribution layer keys off this.
      to: tx.to || null,
      value: toNumberish(tx.value) / 1e18,
      gasPrice: toNumberish(tx.gasPrice) / 1e9,
      category: isDex ? 'defi' : input !== '0x' ? (tx.to ? 'contractCall' : 'contractDeploy') : 'transfer',
    })
  }
  return out
}

// =====================================================
// RATE LIMITING & OPTIMIZATION CONSTANTS
// =====================================================
const ACTIVE_POLL_INTERVAL = 1500 // HTTP fallback only (WS is primary)
const INACTIVE_POLL_INTERVAL = 8000 // When tab is hidden: slow polling (save resources)
const CACHE_DURATION_MS = 30000 // Cache block data for 30 seconds
const MAX_REQUESTS_PER_MINUTE = 600 // Rate limit protection (~10/s; Monad produces ~3.3 blocks/s)
const REQUEST_COOLDOWN_MS = 120 // Minimum time between polls — must stay under the ~300ms block time

// Transaction fan-in control. `transactions` is part of the context value, so
// every setTransactions re-renders every consumer in the app. Flushing on a
// fixed timer instead of per-N-transactions keeps that at a handful per second
// regardless of how busy the chain is, and the buffer cap stops us analysing
// (and receipt-enriching) a backlog the feed will never display.
const TX_FLUSH_MS = 250
const TX_BUFFER_MAX = 120

// WS resilience. A socket that stays "open" but silent (proxy idle timeout,
// sleep/resume) must never freeze the product: if no block lands for
// WS_STALE_MS the watchdog drops the socket, un-gates HTTP polling and
// schedules a fresh WS connect.
const WS_STALE_MS = 6000
const WS_WATCHDOG_TICK_MS = 2000
const WS_RECONNECT_DELAY_MS = 5000
const STALE_WS_RECONNECT_DELAY_MS = 1000
// Continuity: on a WS block-number jump > 1, backfill at most this many
// missed blocks so no sealed block silently vanishes from the Odyssey.
const GAP_BACKFILL_MAX = 10
// One delayed retry when getBlock returns null — a load-balanced node can
// lag the announcing node by a few hundred ms.
const NULL_BLOCK_RETRY_MS = 350

// ERC-20 metadata cache cap — the one buffer that was unbounded.
const TOKEN_METADATA_CACHE_MAX = 300

// Priority tiers on the shared per-minute request budget: the block feed
// itself must never be starved, so optional lookups yield first as the
// window fills up (enrichment before proposer attribution before blocks).
const BUDGET_RESERVE_PROPOSER = 0.9
const BUDGET_RESERVE_ENRICH = 0.8

const MonadContext = createContext(null)

export const MonadProvider = ({ children }) => {
  const [connection, setConnection] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const networkMode = 'live'
  const [latestBlock, setLatestBlock] = useState(null)
  const [blocks, setBlocks] = useState([]) // Block history for BlockFeed
  const [transactions, setTransactions] = useState([])
  const [txAnalyzer] = useState(() => new TransactionAnalyzer())
  const [stats, setStats] = useState({
    currentTps: 0,
    avgBlockTimeMs: BLOCK_TIME_MS,
    totalTransactions: 0,
    blockTransactions: 0,
    gasPrice: 0,
    networkHash: '0x...',
    categoryStats: {
      defi: 0,
      nft: 0,
      transfer: 0,
      contractCall: 0,
      contractDeploy: 0,
      other: 0
    }
  })

  // Live validator leaderboard aggregated from *all* seen blocks (unbounded)
  // We keep blocks[] capped for UI, but counts here are unlimited.
  const [validatorLeaderboard, setValidatorLeaderboard] = useState(() => ({
    firstSeenAt: 0,
    lastSeenAt: 0,
    totalBlocks: 0,
    validators: {} // key -> { key, id, name, logo, blocks, lastSeen }
  }))

  // HTTP polling + TPS
  const pollingIntervalRef = useRef(null)
  const pollLoopGenRef = useRef(0)
  const isPollingRef = useRef(false)
  const lastBlockNumberRef = useRef(null)
  const rateLimitDelayRef = useRef(ACTIVE_POLL_INTERVAL)
  const consecutiveErrorsRef = useRef(0)
  const missedBlocksRef = useRef(0) // Track missed blocks for debugging
  
  // Rate limiting protection
  const requestCountRef = useRef(0)
  const requestWindowStartRef = useRef(Date.now())
  const lastRequestTimeRef = useRef(0)
  const isTabActiveRef = useRef(true)
  
  // Block cache for reducing redundant requests
  const blockCacheRef = useRef(new Map())
  
  // WebSocket connection for real-time updates
  const wsRef = useRef(null)
  const wsReconnectTimeoutRef = useRef(null)
  const useWsRef = useRef(true) // Try WebSocket first
  // Set before teardown closes the socket so onclose never reschedules a
  // reconnect for a socket we killed on purpose (unmount, StrictMode remount).
  const wsIntentionalCloseRef = useRef(false)
  // Staleness watchdog: wall-clock time of the last published block.
  const lastBlockReceivedAtRef = useRef(0)
  const wsWatchdogIntervalRef = useRef(null)

  // Batched transaction analysis
  const transactionBatchRef = useRef([])
  const txFlushTimerRef = useRef(0)
  const statsUpdateTimeoutRef = useRef(null)

  // Live TPS: rolling window of recent on-chain blocks
  const recentBlocksRef = useRef([])
  const lastTpsUpdateRef = useRef(0)

  // ERC-20 token metadata cache (address -> { symbol, decimals })
  const tokenMetadataCacheRef = useRef(new Map())

  // ---- Rate Limiting & Optimization Helpers --------------------------------

  // Budget-only check shared by the WS fan-out and the HTTP poll.
  // `reserveFraction` reserves headroom: hasRequestBudget(0.8) passes only
  // below 80% of the per-minute budget, so low-priority lookups (receipt
  // enrichment, proposer attribution) yield before the block feed can 429.
  const hasRequestBudget = useCallback((reserveFraction = 1) => {
    const now = Date.now()

    // Reset counter every minute
    if (now - requestWindowStartRef.current > 60000) {
      requestCountRef.current = 0
      requestWindowStartRef.current = now
    }

    return requestCountRef.current < MAX_REQUESTS_PER_MINUTE * reserveFraction
  }, [])

  // Check if we can make a polling request (budget + poll cooldown; WS-path
  // requests are paced by block arrival instead and only check the budget)
  const canMakeRequest = useCallback(() => {
    if (!hasRequestBudget()) return false
    return Date.now() - lastRequestTimeRef.current >= REQUEST_COOLDOWN_MS
  }, [hasRequestBudget])
  
  // Track request made
  const trackRequest = useCallback(() => {
    requestCountRef.current++
    lastRequestTimeRef.current = Date.now()
  }, [])
  
  // Get cached block or null
  const getCachedBlock = useCallback((blockNumber) => {
    const cached = blockCacheRef.current.get(blockNumber)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      return cached.data
    }
    blockCacheRef.current.delete(blockNumber)
    return null
  }, [])
  
  // Cache a block
  const cacheBlock = useCallback((blockNumber, data) => {
    // Limit cache size to 100 blocks
    if (blockCacheRef.current.size > 100) {
      const oldestKey = blockCacheRef.current.keys().next().value
      blockCacheRef.current.delete(oldestKey)
    }
    blockCacheRef.current.set(blockNumber, { data, timestamp: Date.now() })
  }, [])

  // ---- Block + transaction handling --------------------------------------

  // Patch proposer info onto an already-published block (latest-wins).
  const applyProposerToBlock = useCallback((blockNumber, proposerId, proposerValidator) => {
    setLatestBlock(prev =>
      prev && prev.number === blockNumber
        ? { ...prev, proposerId, proposerValidator }
        : prev
    )
    setBlocks(prev => {
      // Keep identity (skip re-render) when the block is no longer in the list.
      if (!prev.some(b => b.number === blockNumber)) return prev
      return prev.map(b => (b.number === blockNumber ? { ...b, proposerId, proposerValidator } : b))
    })
  }, [])

  // Count a block for the live leaderboard (called once per block, when the
  // proposer resolution settles — with the validator or as 'unknown').
  const updateLeaderboard = useCallback((proposerValidator, receivedAt) => {
    setValidatorLeaderboard(prev => {
      const nowTs = receivedAt
      const firstSeenAt = prev.firstSeenAt || nowTs
      const lastSeenAt = Math.max(prev.lastSeenAt || 0, nowTs)

      const v = proposerValidator
      const key = v?.id !== undefined && v?.id !== null ? String(v.id) : 'unknown'
      const name = v?.name || 'Unknown'
      const logo = v?.localLogo || v?.logo || null

      const prevRow = prev.validators[key] || {
        key,
        id: key === 'unknown' ? null : v?.id,
        name,
        logo,
        blocks: 0,
        lastSeen: 0
      }

      const nextRow = {
        ...prevRow,
        blocks: (prevRow.blocks || 0) + 1,
        lastSeen: Math.max(prevRow.lastSeen || 0, nowTs),
        name: prevRow.name && prevRow.name !== 'Unknown' ? prevRow.name : name,
        logo: prevRow.logo || logo
      }

      return {
        firstSeenAt,
        lastSeenAt,
        totalBlocks: (prev.totalBlocks || 0) + 1,
        validators: {
          ...prev.validators,
          [key]: nextRow
        }
      }
    })
  }, [])

  const proposerSeqRef = useRef(0)

  // React 18 batches state updates within a single tick but NOT across
  // separate async resolutions — publishing the block now and patching the
  // proposer in later means two commits per block, i.e. every consumer of
  // this context (the whole app, not just the world pages) re-renders twice
  // per block instead of once. Since the proposer lookup is prefetched in
  // parallel with the block fetch, it's usually ready (or very close) by the
  // time we get here, so we give it a short race window and publish
  // everything in ONE commit in the common case. Only the rare slow-RPC case
  // falls back to publish-now-patch-later (2 commits), so the render-doubling
  // is the exception, not the rule.
  const PROPOSER_RACE_MS = 120

  const handleNewBlock = useCallback(async (blockData, proposerPromise = undefined, { isBackfill = false } = {}) => {
    const receivedAt = Date.now()
    // Feed liveness for the staleness watchdog.
    lastBlockReceivedAtRef.current = receivedAt
    const seq = ++proposerSeqRef.current

    let promise
    if (proposerPromise !== undefined) {
      promise = proposerPromise
    } else if (hasRequestBudget(BUDGET_RESERVE_PROPOSER)) {
      trackRequest()
      // Tag the call with the block number so attribution cannot slip to the
      // next block while the request is in flight.
      promise = fetchProposerValidatorId(null, { blockNumber: blockData.number })
    } else {
      // Budget nearly spent: skip attribution rather than risk 429ing the feed.
      promise = Promise.resolve(null)
    }

    let proposerId = null
    let resolvedInTime = false
    try {
      const TIMED_OUT = Symbol('timeout')
      const raced = await Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve(TIMED_OUT), PROPOSER_RACE_MS))
      ])
      if (raced !== TIMED_OUT) {
        proposerId = raced
        resolvedInTime = true
      }
    } catch (e) {
      logger.warn('Failed to fetch proposer for block', blockData.number, e)
    }

    const proposerValidator = proposerId ? getValidatorById(proposerId) : null

    const blockEntry = {
      number: blockData.number,
      hash: blockData.hash,
      timestamp: blockData.timestamp,
      transactionCount: blockData.transactionCount,
      gasUsed: blockData.gasUsed,
      gasLimit: blockData.gasLimit,
      networkUtilization: blockData.networkUtilization,
      baseFeePerGas: blockData.baseFeePerGas,
      /* The block's own crew list and its burnt offering — live data only. */
      recruits: blockData.recruits || [],
      burnedMon: blockData.burnedMon || 0,
      miner: blockData.miner,
      proposerId,
      proposerValidator,
      receivedAt
    }

    // A backfilled (older) block must never regress the latest pointer.
    setLatestBlock(prevLatest =>
      prevLatest && prevLatest.number >= blockEntry.number ? prevLatest : blockEntry
    )

    // Add to blocks history for BlockFeed (keep max 50)
    setBlocks(prev => {
      // Prevent duplicates
      if (prev.some(b => b.number === blockData.number)) {
        return prev
      }
      // Backfilled blocks can resolve out of order — keep newest-first order.
      const updated = [blockEntry, ...prev]
        .sort((a, b) => b.number - a.number)
        .slice(0, 50)
      return updated
    })

    if (!isBackfill) {
      // Track recent blocks for instant RPC TPS (wall-clock receive time).
      // Backfilled blocks arrive bunched, so they are excluded — folding
      // them in would distort the wall-clock TPS/block-time estimates.
      const prev = recentBlocksRef.current
      if (!prev.some((b) => b.number === blockData.number)) {
        prev.push({
          number: blockData.number,
          txCount: blockData.transactionCount || 0,
          timestamp: blockData.timestamp || receivedAt,
          receivedAt,
        })
        if (prev.length > 24) prev.shift()
      }

      const instantTps = computeLiveTps(prev, BLOCK_TIME_MS)
      const avgBlockTimeMs = computeAvgBlockTimeMs(prev, BLOCK_TIME_MS)

      setStats((s) => ({
        ...s,
        currentTps: instantTps,
        avgBlockTimeMs,
        blockTransactions: blockData.transactionCount || 0,
        networkHash: blockData.hash
          ? blockData.hash.substring(0, 16) + '...'
          : s.networkHash,
        gasPrice: blockData.baseFeePerGas
          ? Math.round(blockData.baseFeePerGas / 1e9)
          : s.gasPrice,
      }))
    }

    if (resolvedInTime) {
      updateLeaderboard(proposerValidator, receivedAt)
      return
    }

    // Slow path: the RPC didn't make the race window — don't block the block
    // publish on it, patch the block in when it eventually settles.
    Promise.resolve(promise)
      .then((lateProposerId) => {
        const lateProposerValidator = lateProposerId ? getValidatorById(lateProposerId) : null
        if (lateProposerId && seq === proposerSeqRef.current) {
          applyProposerToBlock(blockData.number, lateProposerId, lateProposerValidator)
        }
        updateLeaderboard(lateProposerValidator, receivedAt)
      })
      .catch((e) => {
        logger.warn('Failed to fetch proposer for block (late)', blockData.number, e)
        updateLeaderboard(null, receivedAt)
      })
  }, [applyProposerToBlock, updateLeaderboard, hasRequestBudget, trackRequest])

  const flushTransactionBatch = useCallback(async () => {
    if (transactionBatchRef.current.length === 0) return

    const batch = transactionBatchRef.current.splice(0)
    const client = connection?.client

    // First pass: analyze all transactions
    const analyzedTxs = batch
      .filter(tx => tx && tx.hash)
      .map(tx => txAnalyzer.analyzeTransaction(tx))

    if (analyzedTxs.length === 0) return

    // Second pass: enrich DeFi transactions in parallel (max 5 concurrent)
    if (client) {
      const defiTxs = analyzedTxs.filter(tx => tx.category === 'defi' || tx.isDexTx)
      
      // Process in batches of 5 to avoid rate limiting
      const batchSize = 5
      for (let i = 0; i < defiTxs.length; i += batchSize) {
        // Enrichment is the lowest-priority consumer of the request budget:
        // an unenriched tx is honest, a 429-starved block feed is not.
        if (!hasRequestBudget(BUDGET_RESERVE_ENRICH)) break
        const defiTxBatch = defiTxs.slice(i, i + batchSize)
        const enrichPromises = defiTxBatch.map(async (tx) => {
          try {
            trackRequest()
            const enriched = await enrichDefiTransactionFromReceipt(
              client,
              tokenMetadataCacheRef.current,
              tx
            )
            // Update the transaction in place
            Object.assign(tx, enriched)
          } catch (err) {
            logger.error('Failed to enrich tx:', tx.hash, err.message)
          }
        })

        await Promise.allSettled(enrichPromises)
      }

      // Keep the token metadata cache bounded like every other buffer
      // (insertion-ordered Map: evict oldest entries first).
      const tokenCache = tokenMetadataCacheRef.current
      while (tokenCache.size > TOKEN_METADATA_CACHE_MAX) {
        tokenCache.delete(tokenCache.keys().next().value)
      }
    }

    setTransactions(prev => {
      const updated = [...analyzedTxs, ...prev].slice(0, 500)
      return updated
    })

    // Update stats with latest info
    if (statsUpdateTimeoutRef.current) {
      clearTimeout(statsUpdateTimeoutRef.current)
    }

    statsUpdateTimeoutRef.current = setTimeout(() => {
      setStats(prev => {
        const latestTx = analyzedTxs[0]
        // tx gasPrice arrives as a formatted string — keep stats.gasPrice
        // a NUMBER so arithmetic consumers never concatenate or NaN.
        const latestGasPrice = Number(latestTx?.gasPrice)
        return {
          ...prev,
          gasPrice: Number.isFinite(latestGasPrice) && latestGasPrice > 0
            ? latestGasPrice
            : prev.gasPrice,
          networkHash: latestTx?.hash
            ? latestTx.hash.substring(0, 16) + '...'
            : prev.networkHash
        }
      })
    }, 100)
  }, [connection, txAnalyzer, hasRequestBudget, trackRequest])

  const handleNewTransaction = useCallback(
    (txData) => {
      if (!txData || !txData.hash) return

      const buf = transactionBatchRef.current
      buf.push(txData)
      if (buf.length > TX_BUFFER_MAX) buf.splice(0, buf.length - TX_BUFFER_MAX)

      if (txFlushTimerRef.current) return
      txFlushTimerRef.current = setTimeout(() => {
        txFlushTimerRef.current = 0
        flushTransactionBatch()
      }, TX_FLUSH_MS)
    },
    [flushTransactionBatch]
  )

  // ---- Single-block pipeline (WS path, gap-fill, null retry) --------------

  // Fetch one full block and feed it through the same pipeline as polling.
  // Used for WS-announced blocks, continuity gap-fill and the null-block
  // retry. Returns true when the block was published.
  const fetchAndProcessBlock = useCallback(async (blockNumber, { isBackfill = false } = {}) => {
    const client = connection?.client
    if (!client) return false

    // Start the proposer lookup NOW so it runs in parallel with the
    // full-block fetch (two RTTs overlapped instead of serialized —
    // critical for keeping up with Monad's ~0.3s block time). The call is
    // tagged with the block number so attribution cannot slip a block, and
    // skipped entirely when the request budget is nearly spent.
    let proposerPromise = Promise.resolve(null)
    if (hasRequestBudget(BUDGET_RESERVE_PROPOSER)) {
      trackRequest()
      proposerPromise = fetchProposerValidatorId(null, { blockNumber }).catch(() => null)
    }

    const fetchOnce = async () => {
      try {
        trackRequest()
        return await client.getBlock({
          blockNumber: BigInt(blockNumber),
          includeTransactions: true,
        })
      } catch (err) {
        logger.error(`Failed to fetch block ${blockNumber}:`, err.message)
        return null
      }
    }

    let block = await fetchOnce()
    if (!block) {
      // A load-balanced node can lag the announcing node — one delayed
      // retry before the block (and its crew) is dropped for good.
      await new Promise((resolve) => setTimeout(resolve, NULL_BLOCK_RETRY_MS))
      block = await fetchOnce()
    }
    if (!block) {
      missedBlocksRef.current += 1
      logger.warn(`Block ${blockNumber} unavailable after retry (total missed: ${missedBlocksRef.current})`)
      return false
    }

    const gasUsed = toNumberish(block.gasUsed)
    const gasLimit = toNumberish(block.gasLimit)
    const timestampMs = toNumberish(block.timestamp) * 1000

    handleNewBlock({
      number: blockNumber,
      hash: block.hash,
      timestamp: timestampMs,
      transactionCount: block.transactions?.length || 0,
      gasUsed,
      gasLimit,
      networkUtilization: gasLimit > 0 ? (gasUsed / gasLimit) * 100 : 0,
      baseFeePerGas: toNumberish(block.baseFeePerGas),
      recruits: buildRecruits(block.transactions),
      // EIP-1559: the base fee is burned. gasUsed x baseFee is the MON
      // this block destroyed — the altar's offering.
      burnedMon: (gasUsed * toNumberish(block.baseFeePerGas)) / 1e18,
      miner: block.miner || null
    }, proposerPromise, { isBackfill })

    if (block.transactions?.length > 0) {
      block.transactions.forEach(tx => {
        if (!tx || typeof tx === 'string' || !tx.hash) return

        const value = toNumberish(tx.value) / 1e18
        const gasPrice = toNumberish(tx.gasPrice) / 1e9
        const input = tx.input || '0x'

        handleNewTransaction({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: value.toFixed(6),
          gasPrice: gasPrice.toFixed(2),
          gasLimit: toNumberish(tx.gas),
          timestamp: timestampMs,
          blockNumber,
          input,
          type: input && input !== '0x' ? 'contract' : 'transfer',
          isDexTx: (tx.to && KNOWN_DEX_ADDRESSES.has(tx.to.toLowerCase())) ||
                   (input.length >= 10 && SWAP_METHOD_SIGNATURES.has(input.slice(0, 10).toLowerCase()))
        })
      })
    }

    return true
  }, [connection, handleNewBlock, handleNewTransaction, hasRequestBudget, trackRequest])

  // ---- HTTP polling (live mode) ------------------------------------------

  const pollForBlocks = useCallback(async () => {
    if (!connection) return
    
    // Rate limiting check - skip if too many requests
    if (!canMakeRequest()) {
      return
    }
    trackRequest()

    try {
      const { client } = connection
      if (!client) return
      const currentBlockNumberRaw = await client.getBlockNumber()
      const currentBlockNumber = normalizeBlockNumber(currentBlockNumberRaw)

      if (
        lastBlockNumberRef.current === null ||
        currentBlockNumber > lastBlockNumberRef.current
      ) {
        const fromBlock =
          lastBlockNumberRef.current === null
            ? currentBlockNumber
            : lastBlockNumberRef.current + 1
        const toBlock = currentBlockNumber
        
        // Increase max blocks per poll to catch up faster
        const maxBlocksPerPoll = 10
        const blocksToFetch = Math.min(toBlock - fromBlock + 1, maxBlocksPerPoll)
        
        // Track missed blocks
        const missedCount = toBlock - fromBlock - blocksToFetch + 1
        if (missedCount > 0) {
          missedBlocksRef.current += missedCount
          logger.warn(`Missed ${missedCount} blocks (total missed: ${missedBlocksRef.current})`)
        }

        // Fetch blocks in parallel for speed
        const blockPromises = []
        for (let blockNum = fromBlock; blockNum <= Math.min(toBlock, fromBlock + maxBlocksPerPoll - 1); blockNum++) {
          blockPromises.push(
            client.getBlock({ blockNumber: BigInt(blockNum), includeTransactions: true }).catch(err => {
              logger.error(`Failed to fetch block ${blockNum}:`, err.message)
              return null
            })
          )
        }

        const fetchedBlocks = await Promise.all(blockPromises)

        // Null getBlock (load-balanced node lag) must not drop a block
        // permanently — route it through the retrying single-block pipeline.
        fetchedBlocks.forEach((block, i) => {
          if (!block) {
            fetchAndProcessBlock(fromBlock + i, { isBackfill: true })
          }
        })

        for (const block of fetchedBlocks) {
          if (!block || !block.transactions) continue

          const gasUsed = toNumberish(block.gasUsed)
          const gasLimit = toNumberish(block.gasLimit)
          const utilization = gasLimit > 0 ? (gasUsed / gasLimit) * 100 : 0

          const blockNumber = normalizeBlockNumber(block.number)
          const timestampMs = toNumberish(block.timestamp) * 1000

          const blockData = {
            number: blockNumber,
            hash: block.hash,
            timestamp: timestampMs,
            transactionCount: block.transactions.length,
            gasUsed,
            gasLimit,
            networkUtilization: utilization,
            baseFeePerGas: toNumberish(block.baseFeePerGas),
            recruits: buildRecruits(block.transactions),
            // EIP-1559: the base fee is burned. gasUsed x baseFee is the MON
            // this block destroyed — the altar's offering.
            burnedMon: (gasUsed * toNumberish(block.baseFeePerGas)) / 1e18,
            // Block producer (miner/author) address
            miner: block.miner || null
          }

          handleNewBlock(blockData)

          if (block.transactions && block.transactions.length > 0) {
            // Process transactions in smaller batches to avoid overwhelming the UI
            // Optimized for 100+ concurrent users - smaller batches, throttled
            const txBatchSize = 15 // Reduced from 20 for better performance
            for (let i = 0; i < block.transactions.length; i += txBatchSize) {
              const txBatch = block.transactions.slice(i, i + txBatchSize)
              
              // Throttle transaction processing
              await requestThrottler.throttle(async () => {
                txBatch.forEach(tx => {
                if (!tx || typeof tx === 'string' || !tx.hash) return

                const value = toNumberish(tx.value) / Math.pow(10, 18)
                const gasPrice = toNumberish(tx.gasPrice) / Math.pow(10, 9)
                const input = tx.input || '0x'

                const txData = {
                  hash: tx.hash,
                  from: tx.from,
                  to: tx.to,
                  value: value.toFixed(6),
                  gasPrice: gasPrice.toFixed(2),
                  gasLimit: toNumberish(tx.gas),
                  timestamp: timestampMs,
                  blockNumber,
                  input,
                  type: input && input !== '0x' ? 'contract' : 'transfer',
                  // Mark if this is likely a DEX transaction (check router + method signature)
                  isDexTx: (tx.to && KNOWN_DEX_ADDRESSES.has(tx.to.toLowerCase())) || 
                           (input.length >= 10 && SWAP_METHOD_SIGNATURES.has(input.slice(0, 10).toLowerCase()))
                }

                handleNewTransaction(txData)
              })
              })
            }
          }
        }

        lastBlockNumberRef.current = currentBlockNumber
        consecutiveErrorsRef.current = 0
        
        // Speed up polling if we're catching up
        if (blocksToFetch >= maxBlocksPerPoll) {
          rateLimitDelayRef.current = Math.max(200, rateLimitDelayRef.current - 50)
        } else {
          rateLimitDelayRef.current = 100 // Ultra-fast speed
        }
      }
    } catch (error) {
      consecutiveErrorsRef.current += 1
      logger.error('Polling error:', error.message)

      // Exponential backoff on errors
      rateLimitDelayRef.current = Math.min(2000, rateLimitDelayRef.current * 1.5)

      if (consecutiveErrorsRef.current > 5) {
        setConnectionStatus('failed')
        setIsConnected(false)
        // Try to reconnect after a delay
        setTimeout(() => {
          consecutiveErrorsRef.current = 0
          setConnectionStatus('connecting')
        }, 5000)
      }
    }
  }, [connection, handleNewBlock, handleNewTransaction, fetchAndProcessBlock, canMakeRequest, trackRequest])

  // WebSocket connection for real-time block updates
  const connectWebSocket = useCallback(() => {
    if (!connection || !MONAD_MAINNET_CONFIG.wsUrl) return false
    if (wsRef.current) return true // already connected/connecting

    wsIntentionalCloseRef.current = false

    try {
      const ws = new WebSocket(MONAD_MAINNET_CONFIG.wsUrl)

      ws.onopen = () => {
        logger.log('WebSocket connected to Monad')
        // Subscribe to new block headers
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_subscribe',
          params: ['newHeads']
        }))
        useWsRef.current = true
      }

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data)
          
          // Handle subscription confirmation
          if (data.id === 1 && data.result) {
            logger.log('Subscribed to newHeads:', data.result)
            return
          }

          // Handle new block notification
          if (data.method === 'eth_subscription' && data.params?.result) {
            const blockHeader = data.params.result
            const blockNumber = normalizeBlockNumber(
              typeof blockHeader.number === 'string'
                ? parseInt(blockHeader.number, 16)
                : blockHeader.number
            )
            if (!Number.isFinite(blockNumber)) return

            const lastSeen = lastBlockNumberRef.current
            // Stale or duplicate header — already seen this height.
            if (lastSeen !== null && blockNumber <= lastSeen) return
            // Claim the number synchronously so a header racing in while
            // the fetch below is in flight computes its continuity gap
            // against THIS block instead of re-dispatching it.
            lastBlockNumberRef.current = blockNumber

            // Continuity gap-fill: a jump > 1 means headers were missed —
            // backfill the gap (bounded) so no sealed block vanishes.
            if (lastSeen !== null && blockNumber > lastSeen + 1) {
              const firstMissed = Math.max(lastSeen + 1, blockNumber - GAP_BACKFILL_MAX)
              const unrecoverable = firstMissed - (lastSeen + 1)
              if (unrecoverable > 0) {
                missedBlocksRef.current += unrecoverable
                logger.warn(
                  `WS gap of ${blockNumber - lastSeen - 1} blocks; backfilling ${blockNumber - firstMissed}, dropping ${unrecoverable} (total missed: ${missedBlocksRef.current})`
                )
              }
              for (let missed = firstMissed; missed < blockNumber; missed++) {
                // Fire-and-forget: the live block must not wait on history.
                fetchAndProcessBlock(missed, { isBackfill: true })
              }
            }

            await fetchAndProcessBlock(blockNumber)
          }
        } catch (err) {
          logger.error('WebSocket message parse error:', err.message)
        }
      }

      ws.onerror = (error) => {
        logger.error('WebSocket error:', error)
        useWsRef.current = false
      }

      ws.onclose = () => {
        const isCurrent = wsRef.current === ws
        if (isCurrent) {
          useWsRef.current = false
          wsRef.current = null
        }

        // A superseded or intentionally-closed socket must never reschedule:
        // otherwise unmount (or StrictMode's mount/unmount/mount) leaks a
        // self-reconnecting zombie stream.
        if (!isCurrent || wsIntentionalCloseRef.current) return

        logger.log('WebSocket closed, falling back to HTTP polling')

        // Reconnect after delay
        if (!wsReconnectTimeoutRef.current) {
          wsReconnectTimeoutRef.current = setTimeout(() => {
            wsReconnectTimeoutRef.current = null
            if (isPollingRef.current && connection) {
              connectWebSocket()
            }
          }, WS_RECONNECT_DELAY_MS)
        }
      }

      wsRef.current = ws
      return true
    } catch (err) {
      logger.error('Failed to create WebSocket:', err.message)
      return false
    }
  }, [connection, fetchAndProcessBlock])

  // Always run HTTP polling as backup/supplement. A self-rescheduling
  // timeout chain (not setInterval) re-reads rateLimitDelayRef on every hop,
  // so adaptive speed-ups and error backoff actually change the cadence.
  const startPollingLoop = useCallback(() => {
    // Bump the generation so an in-flight tick from a previous loop retires
    // instead of double-scheduling a second parallel chain.
    const gen = ++pollLoopGenRef.current
    if (pollingIntervalRef.current) {
      clearTimeout(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    const tick = () => {
      pollingIntervalRef.current = setTimeout(async () => {
        if (!isPollingRef.current || gen !== pollLoopGenRef.current) return
        // Only poll if WebSocket is not active or as a safety net
        if (!useWsRef.current || !wsRef.current) {
          await pollForBlocks()
        }
        if (isPollingRef.current && gen === pollLoopGenRef.current) tick()
      }, rateLimitDelayRef.current)
    }
    tick()
  }, [pollForBlocks])

  // Staleness watchdog: a WS that stays "open" but silent (proxy idle
  // timeout, sleep/resume) never fires onclose, and the !wsRef.current gate
  // would suppress polling forever. If no block lands for WS_STALE_MS while
  // a socket exists, drop it, un-gate HTTP polling and reconnect.
  const startWsWatchdog = useCallback(() => {
    if (wsWatchdogIntervalRef.current) {
      clearInterval(wsWatchdogIntervalRef.current)
    }
    wsWatchdogIntervalRef.current = setInterval(() => {
      if (!isPollingRef.current) return
      const last = lastBlockReceivedAtRef.current
      if (!last || Date.now() - last < WS_STALE_MS) return
      if (!wsRef.current) return // already on the HTTP path — the poll loop owns recovery

      logger.warn(`No block for ${Date.now() - last}ms with WS open — failing over to HTTP and reconnecting WS`)

      const staleWs = wsRef.current
      wsRef.current = null // onclose sees a superseded socket → no double reconnect
      useWsRef.current = false
      try {
        staleWs.close()
      } catch {
        // Socket already closing — nothing to clean up.
      }

      if (!wsReconnectTimeoutRef.current) {
        wsReconnectTimeoutRef.current = setTimeout(() => {
          wsReconnectTimeoutRef.current = null
          if (isPollingRef.current) {
            connectWebSocket()
          }
        }, STALE_WS_RECONNECT_DELAY_MS)
      }

      // Resume the feed immediately instead of waiting for the next poll hop.
      pollForBlocks()
    }, WS_WATCHDOG_TICK_MS)
  }, [connectWebSocket, pollForBlocks])

  const startHttpPolling = useCallback(() => {
    if (isPollingRef.current || !connection) return

    setConnectionStatus('connected')
    setIsConnected(true)

    isPollingRef.current = true
    // Watchdog baseline: measure from session start so a socket that never
    // delivers a single block also trips the staleness failover.
    lastBlockReceivedAtRef.current = Date.now()

    // Try WebSocket first for real-time updates
    const wsConnected = connectWebSocket()

    startPollingLoop()
    startWsWatchdog()

    // Initial poll
    pollForBlocks()

    logger.log(`Started real-time sync (WS: ${wsConnected ? 'active' : 'fallback to HTTP'})`)
  }, [connection, pollForBlocks, connectWebSocket, startPollingLoop, startWsWatchdog])

  const stopHttpPolling = useCallback(() => {
    // Stop HTTP polling (retire any in-flight tick as well)
    pollLoopGenRef.current++
    if (pollingIntervalRef.current) {
      clearTimeout(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    isPollingRef.current = false

    // Stop the staleness watchdog
    if (wsWatchdogIntervalRef.current) {
      clearInterval(wsWatchdogIntervalRef.current)
      wsWatchdogIntervalRef.current = null
    }

    // Close WebSocket. The intentional-close flag (plus nulling wsRef before
    // onclose can observe it) guarantees teardown never reschedules a
    // reconnect — StrictMode's double mount must not leak sockets.
    wsIntentionalCloseRef.current = true
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (wsReconnectTimeoutRef.current) {
      clearTimeout(wsReconnectTimeoutRef.current)
      wsReconnectTimeoutRef.current = null
    }
    useWsRef.current = false

    if (statsUpdateTimeoutRef.current) {
      clearTimeout(statsUpdateTimeoutRef.current)
      statsUpdateTimeoutRef.current = null
    }

    if (txFlushTimerRef.current) {
      clearTimeout(txFlushTimerRef.current)
      txFlushTimerRef.current = 0
    }

    flushTransactionBatch()
    
    logger.log(`Stopped real-time sync (missed blocks: ${missedBlocksRef.current})`)
  }, [flushTransactionBatch])

  // ---- Connection lifecycle ----------------------------------------------

  useEffect(() => {
    let cancelled = false

    const initConnection = async () => {
      try {
        setConnectionStatus('connecting')
        // Load validator metadata alongside the RPC connection so proposer
        // names resolve no matter which page is the entry point (/ship
        // included). Idempotent and never throws.
        const [monadConnection] = await Promise.all([
          createMonadConnection(MONAD_MAINNET_CONFIG),
          loadValidatorMetadata()
        ])
        if (cancelled) return

        setConnection(monadConnection)
        // start polling once connection is ready
        startHttpPolling()
      } catch (error) {
        logger.error('Failed to connect to Monad mainnet RPC:', error)
        if (cancelled) return

        setConnectionStatus('failed')
        setIsConnected(false)
      }
    }

    initConnection()

    return () => {
      cancelled = true
      stopHttpPolling()
      if (statsUpdateTimeoutRef.current) {
        clearTimeout(statsUpdateTimeoutRef.current)
      }
      transactionBatchRef.current = []
    }
  }, [startHttpPolling, stopHttpPolling])

  // ---- Tab Visibility Detection (Save resources when tab is hidden) -----
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isActive = document.visibilityState === 'visible'
      isTabActiveRef.current = isActive
      
      // Adjust polling rate based on tab visibility
      if (isActive) {
        // Tab is active - use fast polling
        rateLimitDelayRef.current = ACTIVE_POLL_INTERVAL
        logger.log('Tab active - fast polling enabled')
      } else {
        // Tab is hidden - use slow polling to save resources
        rateLimitDelayRef.current = INACTIVE_POLL_INTERVAL
        logger.log('Tab hidden - slow polling enabled (saving resources)')
      }
      
      // Restart polling with the new interval (the loop re-reads
      // rateLimitDelayRef on every hop, this just applies it immediately)
      if (isPollingRef.current && connection) {
        startPollingLoop()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [connection, startPollingLoop])

  // Category window stats (TPS is updated per-block from RPC in handleNewBlock)
  useEffect(() => {
    if (!latestBlock) return

    const now = Date.now()
    if (now - lastTpsUpdateRef.current < 400) return
    lastTpsUpdateRef.current = now

    const windowCategoryStats = txAnalyzer.getStats()
    const windowTotalTx = txAnalyzer.getTotalTransactions()

    setStats((prev) => ({
      ...prev,
      totalTransactions: windowTotalTx,
      categoryStats: windowCategoryStats,
    }))

    txAnalyzer.reset()
  }, [latestBlock, txAnalyzer])

  const value = useMemo(() => ({
    connection,
    isConnected,
    connectionStatus,
    networkMode,
    latestBlock,
    blocks,
    validatorLeaderboard,
    transactions,
    stats,
    txAnalyzer,
    config: MONAD_MAINNET_CONFIG
  }), [connection, isConnected, connectionStatus, networkMode, latestBlock, blocks, validatorLeaderboard, transactions, stats, txAnalyzer])

  return (
    <MonadContext.Provider value={value}>
      {children}
    </MonadContext.Provider>
  )
}

const useMonadHook = () => {
  const context = useContext(MonadContext)
  if (!context) {
    throw new Error('useMonad must be used within a MonadProvider')
  }
  return context
}

export { useMonadHook as useMonad }