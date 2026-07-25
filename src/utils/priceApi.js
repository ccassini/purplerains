/**
 * MON Price API - Fetches live price from DexScreener (fast) with CoinGecko fallback
 */

import { logger } from './logger'

// API endpoints
const DEXSCREENER_API = 'https://api.dexscreener.com'
const COINGECKO_API = 'https://api.coingecko.com/api/v3'

// Cache for price data
let priceCache = {
  price: null,
  change24h: null,
  lastFetch: 0
}

const CACHE_DURATION = 15000 // 15 second cache (DexScreener is fast)

/**
 * Fetch MON price from DexScreener (primary) or CoinGecko (fallback)
 * Returns { price, change24h } or null on error
 */
export async function fetchMonPrice() {
  const now = Date.now()
  
  // Return cached data if still valid
  if (priceCache.price && (now - priceCache.lastFetch) < CACHE_DURATION) {
    return {
      price: priceCache.price,
      change24h: priceCache.change24h
    }
  }

  // Try DexScreener first (faster)
  try {
    const dexData = await fetchFromDexScreener()
    if (dexData) {
      priceCache = { ...dexData, lastFetch: now }
      return dexData
    }
  } catch (e) {
    logger.warn('DexScreener failed:', e.message)
  }

  // Fallback to CoinGecko
  try {
    const geckoData = await fetchFromCoinGecko()
    if (geckoData) {
      priceCache = { ...geckoData, lastFetch: now }
      return geckoData
    }
  } catch (e) {
    logger.warn('CoinGecko failed:', e.message)
  }

  // Return stale cache if available
  if (priceCache.price) {
    return { price: priceCache.price, change24h: priceCache.change24h }
  }
  
  return null
}

/**
 * Fetch from DexScreener API (very fast, ~50ms)
 */
async function fetchFromDexScreener() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  
  try {
    // Search for MON on Monad chain
    const response = await fetch(
      `${DEXSCREENER_API}/latest/dex/search?q=MON%20monad`,
      { signal: controller.signal }
    )
    
    clearTimeout(timeout)
    if (!response.ok) return null
    
    const data = await response.json()
    
    // Find MON/USDC or MON/USDT pair on Monad
    if (data.pairs && data.pairs.length > 0) {
      // Look for highest liquidity MON pair on Monad chain
      const monadPairs = data.pairs.filter(p => 
        p.chainId === 'monad' && 
        (p.baseToken?.symbol === 'MON' || p.baseToken?.symbol === 'WMON')
      )
      
      if (monadPairs.length > 0) {
        // Sort by liquidity and take the best one
        const bestPair = monadPairs.sort((a, b) => 
          (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
        )[0]
        
        return {
          price: parseFloat(bestPair.priceUsd) || null,
          change24h: bestPair.priceChange?.h24 || null
        }
      }
    }
    
    return null
  } catch (e) {
    clearTimeout(timeout)
    throw e
  }
}

/**
 * Fetch from CoinGecko API (slower but reliable)
 */
async function fetchFromCoinGecko() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  const response = await fetch(
    `${COINGECKO_API}/simple/price?ids=monad&vs_currencies=usd&include_24hr_change=true`,
    { signal: controller.signal }
  )

  clearTimeout(timeout)
  if (!response.ok) return null
  
  const data = await response.json()
  
  if (data.monad) {
    return {
      price: data.monad.usd,
      change24h: data.monad.usd_24h_change
    }
  }
  
  return null
}

/**
 * Format price for display
 */
export function formatPrice(price) {
  if (!price && price !== 0) return '—'
  
  if (price >= 1000) {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  if (price >= 1) {
    return `$${price.toFixed(2)}`
  }
  if (price >= 0.01) {
    return `$${price.toFixed(4)}`
  }
  return `$${price.toFixed(6)}`
}

/**
 * Format 24h change for display
 */
export function formatChange(change) {
  if (!change && change !== 0) return null
  
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}%`
}
