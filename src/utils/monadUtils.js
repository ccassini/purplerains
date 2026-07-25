import { createPublicClient, fallback, http } from 'viem'
import { logger } from './logger'
import { monad } from '../wallet/wagmiConfig'

/**
 * Creates a viem public client connection to Monad.
 * @param {Object} config - Monad configuration
 * @returns {Promise<{client: import('viem').PublicClient, chainId: number, latestBlock: bigint, config: Object}>}
 */
export async function createMonadConnection(config) {
  const expectedChainId = Number(config.chainId)
  const endpoints = Array.isArray(config.rpcEndpoints) && config.rpcEndpoints.length
    ? config.rpcEndpoints
    : [config.rpcUrl]

  let lastError = null

  for (const endpoint of endpoints) {
    try {
      const client = createPublicClient({
        chain: {
          ...monad,
          id: expectedChainId || monad.id,
          rpcUrls: {
            default: { http: [endpoint] },
            public: { http: [endpoint] },
          },
        },
        transport: http(endpoint, { timeout: 12_000, retryCount: 1 }),
      })

      const latestBlock = await client.getBlockNumber()
      let chainId = expectedChainId
      try {
        const id = await client.getChainId()
        if (Number.isFinite(id)) chainId = id
      } catch (chainErr) {
        logger.warn(`eth_chainId check skipped (${endpoint}):`, chainErr?.message || chainErr)
      }

      if (Number.isFinite(expectedChainId) && Number.isFinite(chainId) && chainId !== expectedChainId) {
        throw new Error(`Chain ID mismatch. Expected ${expectedChainId}, got ${chainId}`)
      }

      logger.log(`Connected to Monad via ${endpoint} - Latest block: ${latestBlock}`)

      return {
        client,
        // Back-compat alias used during migration; prefer `client`
        web3: null,
        chainId,
        latestBlock,
        config: {
          ...config,
          rpcUrl: endpoint,
        },
      }
    } catch (error) {
      lastError = error
      logger.warn(`RPC connection failed (${endpoint}):`, error?.message || error)
    }
  }

  // Last resort: multi-transport fallback client
  try {
    const client = createPublicClient({
      chain: monad,
      transport: fallback(endpoints.map((url) => http(url, { timeout: 12_000, retryCount: 0 }))),
    })
    const latestBlock = await client.getBlockNumber()
    logger.log(`Connected to Monad via fallback transports - Latest block: ${latestBlock}`)
    return {
      client,
      web3: null,
      chainId: expectedChainId || monad.id,
      latestBlock,
      config: { ...config, rpcUrl: endpoints[0] },
    }
  } catch (error) {
    lastError = error
  }

  logger.error('Failed to connect to Monad:', lastError)
  throw lastError || new Error('No working RPC endpoint available')
}

/** Default Monad block interval used when timestamps collide (catch-up polls). */
export const DEFAULT_BLOCK_INTERVAL_MS = 400

/**
 * Average block interval (ms) from recent blocks.
 * Prefers local receive-time gaps (Monad chain timestamps are often 1s resolution).
 *
 * @param {Array<{ timestamp?: number, receivedAt?: number }>} recentBlocks
 * @param {number} [fallbackMs=400]
 * @returns {number}
 */
export function computeAvgBlockTimeMs(recentBlocks, fallbackMs = DEFAULT_BLOCK_INTERVAL_MS) {
  if (!Array.isArray(recentBlocks) || recentBlocks.length < 2) {
    return Math.max(1, fallbackMs)
  }

  const gaps = []
  for (let i = 1; i < recentBlocks.length; i++) {
    const prevR = Number(recentBlocks[i - 1]?.receivedAt)
    const nextR = Number(recentBlocks[i]?.receivedAt)
    const prevT = Number(recentBlocks[i - 1]?.timestamp)
    const nextT = Number(recentBlocks[i]?.timestamp)

    let gap = NaN
    if (Number.isFinite(prevR) && Number.isFinite(nextR)) gap = nextR - prevR
    else if (Number.isFinite(prevT) && Number.isFinite(nextT)) gap = nextT - prevT

    // Ignore zero/negative and absurd outliers (>5s)
    if (Number.isFinite(gap) && gap > 0 && gap < 5000) gaps.push(gap)
  }

  if (gaps.length === 0) return Math.max(1, fallbackMs)
  const sum = gaps.reduce((a, b) => a + b, 0)
  return Math.max(1, Math.round(sum / gaps.length))
}

/**
 * Instantaneous TPS from recent RPC blocks (tx counts ÷ wall-clock receive span).
 * Uses receivedAt first — Monad block.timestamp is often second-granularity and
 * collides across ~3 blocks/s, which would otherwise fake TPS.
 *
 * @param {Array<{ txCount?: number, timestamp?: number, receivedAt?: number }>} recentBlocks
 * @param {number} [fallbackIntervalMs=400]
 * @returns {number}
 */
export function computeLiveTps(recentBlocks, fallbackIntervalMs = DEFAULT_BLOCK_INTERVAL_MS) {
  if (!Array.isArray(recentBlocks) || recentBlocks.length === 0) return 0

  const totalTx = recentBlocks.reduce((sum, b) => sum + (Number(b?.txCount) || 0), 0)
  if (totalTx <= 0) return 0

  if (recentBlocks.length === 1) {
    const intervalSec = Math.max(fallbackIntervalMs, 1) / 1000
    return Math.round(totalTx / intervalSec)
  }

  const first = recentBlocks[0]
  const last = recentBlocks[recentBlocks.length - 1]
  const firstRecv = Number(first?.receivedAt)
  const lastRecv = Number(last?.receivedAt)
  const firstTs = Number(first?.timestamp)
  const lastTs = Number(last?.timestamp)

  let elapsedMs = 0
  if (Number.isFinite(firstRecv) && Number.isFinite(lastRecv) && lastRecv > firstRecv) {
    elapsedMs = lastRecv - firstRecv
  } else if (Number.isFinite(firstTs) && Number.isFinite(lastTs) && lastTs > firstTs) {
    elapsedMs = lastTs - firstTs
  }

  // Identical timestamps / catch-up batch → assume cadence × gaps
  if (elapsedMs <= 0) {
    elapsedMs = (recentBlocks.length - 1) * Math.max(fallbackIntervalMs, 1)
  }

  const elapsedSec = elapsedMs / 1000
  if (elapsedSec <= 0) return 0
  return Math.max(0, Math.round(totalTx / elapsedSec))
}
