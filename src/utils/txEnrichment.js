import { erc20Abi, hexToBigInt } from 'viem'
import { logger } from './logger'
import { MONAD_DEX_ROUTERS, MONAD_STABLECOINS } from '../config/monadNetwork'

export const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export const SWAP_EVENT_TOPIC =
  '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822'

export const UNISWAP_V3_SWAP_TOPIC =
  '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67'

function buildKnownTokens() {
  const map = {
    // WMON - Wrapped MON (verified Monad mainnet)
    '0x3bd359c1119da7da1d913d1c4d2b7c461115433a': { symbol: 'WMON', decimals: 18 },
  }

  for (const [symbol, addresses] of Object.entries(MONAD_STABLECOINS || {})) {
    for (const addr of addresses || []) {
      const key = String(addr).toLowerCase()
      // Most Monad stables use 6 decimals; LVUSD/DAI-like may differ — default 6 for USD*
      const decimals = symbol === 'DAI' ? 18 : 6
      map[key] = { symbol, decimals }
    }
  }

  return map
}

export const KNOWN_TOKENS = buildKnownTokens()

export const KNOWN_DEX_ADDRESSES = new Set(
  (MONAD_DEX_ROUTERS || []).map((a) => String(a).toLowerCase()),
)

export const SWAP_METHOD_SIGNATURES = new Set([
  '0x7ff36ab5',
  '0x38ed1739',
  '0x8803dbee',
  '0x18cbafe5',
  '0x4a25d94a',
  '0xfb3bdb41',
  '0x5c11d795',
  '0xb6f9de95',
  '0x791ac947',
  '0x414bf389',
  '0xc04b8d59',
  '0xdb3e2198',
  '0xf28c0498',
  '0x128acb08',
  '0x04e45aaf',
  '0x3593564c',
  '0x24856bc3',
  '0x709a1cc2',
  '0x2c76d7a6',
  '0x12aa3caf',
  '0xe449022e',
  '0x0502b1c5',
  '0x2e95b6c8',
  '0xd9627aa4',
  '0x415565b0',
  '0xf47261b0',
  '0x022c0d9f',
  '0xfa461e33',
  '0x2c0198a5',
  '0x38b6e9b6',
  '0x6af479b2',
  '0xdf791e50',
])

export function isStableSymbol(symbol) {
  if (!symbol) return false
  const upper = symbol.toUpperCase()
  return (
    upper === 'USDC' ||
    upper === 'USDT' ||
    upper === 'USDT0' ||
    upper === 'USDTO' ||
    upper === 'DAI' ||
    upper === 'AUSD' ||
    upper === 'USD1' ||
    upper === 'LVUSD' ||
    upper.includes('USD')
  )
}

export function decodeTokenAmount(rawAmount, decimals = 18) {
  if (rawAmount == null) return 0
  try {
    const bn = typeof rawAmount === 'bigint' ? rawAmount : BigInt(rawAmount)
    const base = 10n ** BigInt(decimals)
    const integer = Number(bn / base)
    const fraction = Number(bn % base) / Number(base)
    return integer + fraction
  } catch {
    const num = Number(rawAmount)
    if (!Number.isFinite(num)) return 0
    return num / Math.pow(10, decimals)
  }
}

function topicToAddress(topic) {
  if (!topic || typeof topic !== 'string') return null
  return `0x${topic.slice(-40)}`.toLowerCase()
}

export async function getTokenMetadata(client, cache, tokenAddress) {
  if (!client || !tokenAddress) return null

  const key = tokenAddress.toLowerCase()

  if (cache.has(key)) return cache.get(key)

  if (KNOWN_TOKENS[key]) {
    const knownToken = { address: key, ...KNOWN_TOKENS[key] }
    cache.set(key, knownToken)
    return knownToken
  }

  try {
    const [decimalsResult, symbolResult] = await Promise.allSettled([
      client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'decimals' }),
      client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'symbol' }),
    ])

    const decimals =
      decimalsResult.status === 'fulfilled' ? Number(decimalsResult.value) || 18 : 18

    let symbol = 'TKN'
    if (symbolResult.status === 'fulfilled') {
      const symbolRaw = symbolResult.value
      if (typeof symbolRaw === 'string' && symbolRaw.trim()) {
        symbol = symbolRaw.trim()
      }
    }

    let finalDecimals = decimals
    if (isStableSymbol(symbol) && decimals === 18) {
      finalDecimals = 6
    }

    const meta = { address: key, decimals: finalDecimals, symbol }
    cache.set(key, meta)
    return meta
  } catch (error) {
    logger.error('Failed to fetch token metadata', tokenAddress, error.message)
    const fallback = { address: key, decimals: 18, symbol: 'TKN' }
    cache.set(key, fallback)
    return fallback
  }
}

export async function enrichDefiTransactionFromReceipt(client, cache, tx) {
  if (!client || !tx || !tx.hash) return tx

  try {
    const receipt = await client.getTransactionReceipt({ hash: tx.hash })
    if (!receipt || !Array.isArray(receipt.logs) || !receipt.logs.length) {
      return tx
    }

    const transferLogs = receipt.logs.filter(
      (log) =>
        log.topics &&
        log.topics.length >= 3 &&
        typeof log.topics[0] === 'string' &&
        log.topics[0].toLowerCase() === ERC20_TRANSFER_TOPIC,
    )

    const swapLogs = receipt.logs.filter(
      (log) =>
        log.topics &&
        log.topics.length >= 1 &&
        typeof log.topics[0] === 'string' &&
        (log.topics[0].toLowerCase() === SWAP_EVENT_TOPIC ||
          log.topics[0].toLowerCase() === UNISWAP_V3_SWAP_TOPIC),
    )

    const isConfirmedSwap = swapLogs.length > 0
    if (!transferLogs.length && !isConfirmedSwap) return tx

    const sender = tx.from?.toLowerCase()
    const contractAddress = tx.to?.toLowerCase()
    if (!sender) return tx

    const inTransfers = []
    const outTransfers = []

    for (const log of transferLogs) {
      try {
        const fromAddress = topicToAddress(log.topics[1])
        const toAddress = topicToAddress(log.topics[2])
        const tokenAddr = log.address?.toLowerCase()
        if (!fromAddress || !toAddress || !tokenAddr) continue

        const meta = await getTokenMetadata(client, cache, tokenAddr)
        const rawAmount = hexToBigInt(log.data)
        const amount = decodeTokenAmount(rawAmount, meta?.decimals || 18)

        const transferData = {
          log,
          fromAddress,
          toAddress,
          tokenAddress: tokenAddr,
          amount,
          symbol: meta?.symbol || 'TKN',
          decimals: meta?.decimals || 18,
          isStable: isStableSymbol(meta?.symbol),
        }

        if (fromAddress === sender) inTransfers.push(transferData)
        if (toAddress === sender) outTransfers.push(transferData)
        if (contractAddress && (fromAddress === contractAddress || toAddress === contractAddress)) {
          if (toAddress === sender) outTransfers.push(transferData)
        }
      } catch {
        continue
      }
    }

    let tokenInLog = inTransfers[0]
    let tokenOutLog = outTransfers[0]

    const stableIn = inTransfers.find((t) => t.isStable)
    const stableOut = outTransfers.find((t) => t.isStable)
    if (stableIn) tokenInLog = stableIn
    if (stableOut) tokenOutLog = stableOut

    if (!tokenInLog && !tokenOutLog) return tx

    const enriched = { ...tx, isConfirmedSwap }

    if (tokenInLog) {
      enriched.baseAmount = tokenInLog.amount
      enriched.baseSymbol = tokenInLog.symbol
      enriched.baseTokenAddress = tokenInLog.tokenAddress
      enriched.baseDecimals = tokenInLog.decimals
    }

    if (tokenOutLog) {
      enriched.quoteAmount = tokenOutLog.amount
      enriched.quoteSymbol = tokenOutLog.symbol
      enriched.quoteTokenAddress = tokenOutLog.tokenAddress
      enriched.quoteDecimals = tokenOutLog.decimals
    }

    if (enriched.baseSymbol && enriched.quoteSymbol) {
      enriched.pairLabel = `${enriched.baseSymbol}/${enriched.quoteSymbol}`
    } else if (enriched.baseSymbol) {
      enriched.pairLabel = enriched.baseSymbol
    } else if (enriched.quoteSymbol) {
      enriched.pairLabel = enriched.quoteSymbol
    }

    if (
      typeof enriched.baseAmount === 'number' &&
      enriched.baseAmount > 0 &&
      typeof enriched.quoteAmount === 'number' &&
      enriched.quoteAmount > 0
    ) {
      const price = enriched.quoteAmount / enriched.baseAmount
      if (Number.isFinite(price) && price > 0) enriched.price = price
    }

    let usdValue = null
    if (
      typeof enriched.baseAmount === 'number' &&
      enriched.baseAmount > 0 &&
      isStableSymbol(enriched.baseSymbol)
    ) {
      usdValue = enriched.baseAmount
    }
    if (
      usdValue === null &&
      typeof enriched.quoteAmount === 'number' &&
      enriched.quoteAmount > 0 &&
      isStableSymbol(enriched.quoteSymbol)
    ) {
      usdValue = enriched.quoteAmount
    }
    if (usdValue === null && enriched.baseAmount > 0 && enriched.quoteAmount > 0) {
      const maxAmount = Math.max(enriched.baseAmount, enriched.quoteAmount)
      if (maxAmount < 1000000) usdValue = maxAmount
    }
    if (usdValue !== null && Number.isFinite(usdValue)) {
      enriched.usdValue = usdValue
    }

    return enriched
  } catch (error) {
    logger.error('Failed to enrich DeFi transaction from receipt', tx.hash, error.message)
    return tx
  }
}

export function normalizeBlockNumber(value) {
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'number') return value
  if (value && typeof value.toString === 'function') {
    return Number(value.toString())
  }
  return Number(value)
}

export function toNumberish(value, fallback = 0) {
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    if (value.startsWith('0x')) return parseInt(value, 16) || fallback
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}
