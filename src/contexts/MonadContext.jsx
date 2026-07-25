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
import { fetchProposerValidatorId, getValidatorById } from '../utils/validatorApi'
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

  // Check if we can make a request (rate limiting)
  const canMakeRequest = useCallback(() => {
    const now = Date.now()
    
    // Reset counter every minute
    if (now - requestWindowStartRef.current > 60000) {
      requestCountRef.current = 0
      requestWindowStartRef.current = now
    }
    
    // Check rate limit
    if (requestCountRef.current >= MAX_REQUESTS_PER_MINUTE) {
      return false
    }
    
    // Check cooldown between requests
    if (now - lastRequestTimeRef.current < REQUEST_COOLDOWN_MS) {
      return false
    }
    
    return true
  }, [])
  
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

  const handleNewBlock = useCallback(async (blockData, proposerPromise = undefined) => {
    const receivedAt = Date.now()
    const seq = ++proposerSeqRef.current
    const promise = proposerPromise !== undefined ? proposerPromise : fetchProposerValidatorId()

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
      miner: blockData.miner,
      proposerId,
      proposerValidator,
      receivedAt
    }

    setLatestBlock(blockEntry)

    // Add to blocks history for BlockFeed (keep max 50)
    setBlocks(prev => {
      // Prevent duplicates
      if (prev.some(b => b.number === blockData.number)) {
        return prev
      }
      const updated = [blockEntry, ...prev].slice(0, 50)
      return updated
    })

    // Track recent blocks for instant RPC TPS (wall-clock receive time)
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
  }, [applyProposerToBlock, updateLeaderboard])

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
        const defiTxBatch = defiTxs.slice(i, i + batchSize)
        const enrichPromises = defiTxBatch.map(async (tx) => {
          try {
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
        return {
          ...prev,
          gasPrice: latestTx?.gasPrice || prev.gasPrice,
          networkHash: latestTx?.hash
            ? latestTx.hash.substring(0, 16) + '...'
            : prev.networkHash
        }
      })
    }, 100)
  }, [connection, txAnalyzer])

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

        const blocks = await Promise.all(blockPromises)

        for (const block of blocks) {
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
  }, [connection, handleNewBlock, handleNewTransaction, canMakeRequest, trackRequest])

  // WebSocket connection for real-time block updates
  const connectWebSocket = useCallback(() => {
    if (!connection || !MONAD_MAINNET_CONFIG.wsUrl) return false

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

            // Start the proposer lookup NOW so it runs in parallel with the
            // full-block fetch (two RTTs overlapped instead of serialized —
            // critical for keeping up with Monad's ~0.3s block time).
            const proposerPromise = fetchProposerValidatorId().catch(() => null)

            // Fetch full block with transactions
            if (connection?.client) {
              const block = await connection.client.getBlock({
                blockNumber: BigInt(blockNumber),
                includeTransactions: true,
              })
              if (block) {
                // Process block same as polling
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
                  baseFeePerGas: toNumberish(block.baseFeePerGas)
                }, proposerPromise)

                // Process transactions
                if (block.transactions?.length > 0) {
                  block.transactions.forEach(tx => {
                    if (!tx || typeof tx === 'string' || !tx.hash) return
                    
                    const value = toNumberish(tx.value) / Math.pow(10, 18)
                    const gasPrice = toNumberish(tx.gasPrice) / Math.pow(10, 9)
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

                lastBlockNumberRef.current = blockNumber
              }
            }
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
        logger.log('WebSocket closed, falling back to HTTP polling')
        useWsRef.current = false
        wsRef.current = null
        
        // Reconnect after delay
        if (!wsReconnectTimeoutRef.current) {
          wsReconnectTimeoutRef.current = setTimeout(() => {
            wsReconnectTimeoutRef.current = null
            if (connection) {
              connectWebSocket()
            }
          }, 5000)
        }
      }

      wsRef.current = ws
      return true
    } catch (err) {
      logger.error('Failed to create WebSocket:', err.message)
      return false
    }
  }, [connection, handleNewBlock, handleNewTransaction])

  const startHttpPolling = useCallback(() => {
    if (isPollingRef.current || !connection) return

    setConnectionStatus('connected')
    setIsConnected(true)

    isPollingRef.current = true

    // Try WebSocket first for real-time updates
    const wsConnected = connectWebSocket()
    
    // Always run HTTP polling as backup/supplement
    // Use adaptive interval based on current rate limit
    const startPollingLoop = () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
      pollingIntervalRef.current = setInterval(() => {
        // Only poll if WebSocket is not active or as a safety net
        if (!useWsRef.current || !wsRef.current) {
          pollForBlocks()
        }
      }, rateLimitDelayRef.current)
    }
    
    startPollingLoop()
    
    // Initial poll
    pollForBlocks()
    
    logger.log(`Started real-time sync (WS: ${wsConnected ? 'active' : 'fallback to HTTP'})`)
  }, [connection, pollForBlocks, connectWebSocket])

  const stopHttpPolling = useCallback(() => {
    // Stop HTTP polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    isPollingRef.current = false

    // Close WebSocket
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
        const monadConnection = await createMonadConnection(MONAD_MAINNET_CONFIG)
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
      
      // Restart polling with new interval
      if (pollingIntervalRef.current && connection) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = setInterval(() => {
          if (!useWsRef.current || !wsRef.current) {
            pollForBlocks()
          }
        }, rateLimitDelayRef.current)
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [connection, pollForBlocks])

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