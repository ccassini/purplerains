/**
 * CoinGecko API Client
 * Fetches MON token data (price, market cap, FDV)
 */

import { logger } from './logger'

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const MON_COIN_ID = 'monad' // CoinGecko coin ID for Monad

// Cache for MON token data
let monCache = {
  data: null,
  lastFetch: 0,
  cacheDuration: 60000, // 1 minute cache
}

/**
 * Fetch MON token data from CoinGecko
 */
export async function fetchMonTokenData(forceRefresh = false) {
  const now = Date.now()

  // Return cached data if still valid
  if (!forceRefresh && monCache.lastFetch > 0) {
    if (now - monCache.lastFetch < monCache.cacheDuration) {
      return { ...monCache.data, fromCache: true }
    }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const response = await fetch(
      `${COINGECKO_BASE}/coins/${MON_COIN_ID}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`,
      { signal: controller.signal }
    )

    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`CoinGecko HTTP ${response.status}`)
    }

    const data = await response.json()

    const marketData = data.market_data || {}

    const result = {
      price: marketData.current_price?.usd || null,
      marketCap: marketData.market_cap?.usd || null,
      fdv: marketData.fully_diluted_valuation?.usd || null,
      totalSupply: marketData.total_supply || null,
      maxSupply: marketData.max_supply || null,
      circulatingSupply: marketData.circulating_supply || null,
      change24h: marketData.price_change_percentage_24h || null,
      change7d: marketData.price_change_percentage_7d || null,
      lastUpdated: now,
      fromCache: false,
    }

    // Update cache
    monCache.data = result
    monCache.lastFetch = now

    return result
  } catch (error) {
    logger.error('Failed to fetch MON token data:', error)

    // Return cached data if available, even if expired
    if (monCache.data) {
      return { ...monCache.data, fromCache: true, error: error.message }
    }

    return {
      price: null,
      marketCap: null,
      fdv: null,
      totalSupply: null,
      maxSupply: null,
      circulatingSupply: null,
      change24h: null,
      change7d: null,
      lastUpdated: now,
      fromCache: false,
      error: error.message,
    }
  }
}

/**
 * Format large numbers
 */
export function formatLargeNumber(value) {
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

export default {
  fetchMonTokenData,
  formatLargeNumber,
}
