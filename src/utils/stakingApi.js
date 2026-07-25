/**
 * Monad Staking Data API
 * Fetches staking data from the staking precompile
 */

import { MONAD_MAINNET_CONFIG } from '../config/monadNetwork'
import { fetchGmonadsValidatorsEpoch } from './gmonadsApi'
import { logger } from './logger'

// Monad Staking Precompile Address
const STAKING_PRECOMPILE_ADDRESS = '0x0000000000000000000000000000000000001000'

// Monad Staking Constants (from official docs)
const BLOCK_REWARD = 25 // MON per block
// Use app config for block time (more accurate & consistent)
const BLOCK_TIME_MS = MONAD_MAINNET_CONFIG.blockTime || 500
const BLOCKS_PER_YEAR = Math.floor((365 * 24 * 60 * 60 * 1000) / BLOCK_TIME_MS)

function formatMonNumberFromWei(balanceWei) {
  try {
    const wei = typeof balanceWei === 'bigint' ? balanceWei : BigInt(balanceWei ?? 0)
    const whole = wei / 10n ** 18n
    const frac = (wei % 10n ** 18n) / 10n ** 14n // 4dp
    const asNumber = Number(whole) + Number(frac) / 10_000
    return Number.isFinite(asNumber) ? asNumber : null
  } catch {
    return null
  }
}

// Cache for staking data
let stakingCache = {
  totalStaked: null,
  apy: null,
  lastFetch: 0,
  cacheDuration: 60000 // 1 minute cache
}

// Cache for gmonads-derived network staking stats
let gmonadsStakingCache = {
  totalStaked: null,
  activeStaked: null,
  apy: null,
  lastFetch: 0,
  cacheDuration: 60000, // 1 minute cache
}

export function computeStakingStatsFromGmonadsRows(rows) {
  try {
    if (!Array.isArray(rows)) return { totalStaked: null, activeStaked: null, apy: null }
    let total = 0n
    let active = 0n
    for (const row of rows) {
      const stake = BigInt(row?.stake ?? '0')
      total += stake
      if (String(row?.validator_set_type || '').toLowerCase() === 'active') {
        active += stake
      }
    }
    const totalStaked = Number(total)
    const activeStaked = Number(active)
    const apy = calculateAPY(totalStaked)
    return {
      totalStaked: Number.isFinite(totalStaked) ? totalStaked : null,
      activeStaked: Number.isFinite(activeStaked) ? activeStaked : null,
      apy,
    }
  } catch {
    return { totalStaked: null, activeStaked: null, apy: null }
  }
}

/**
 * Network staking stats from gmonads (matches /staking page stake totals)
 */
export async function getNetworkStakingStats(forceRefresh = false, network = 'mainnet') {
  const now = Date.now()

  if (!forceRefresh && gmonadsStakingCache.lastFetch > 0) {
    if (now - gmonadsStakingCache.lastFetch < gmonadsStakingCache.cacheDuration) {
      return {
        totalStaked: gmonadsStakingCache.totalStaked,
        activeStaked: gmonadsStakingCache.activeStaked,
        apy: gmonadsStakingCache.apy,
        fromCache: true,
      }
    }
  }

  const { data } = await fetchGmonadsValidatorsEpoch(network)
  const computed = computeStakingStatsFromGmonadsRows(data)

  if (computed.totalStaked !== null) {
    gmonadsStakingCache.totalStaked = computed.totalStaked
    gmonadsStakingCache.activeStaked = computed.activeStaked
    gmonadsStakingCache.apy = computed.apy
    gmonadsStakingCache.lastFetch = now
  }

  return { ...computed, fromCache: false }
}

/**
 * Fetch staking pool balance from precompile
 */
export async function fetchTotalStaked(rpcUrl = null) {
  const endpoints = rpcUrl 
    ? [rpcUrl, ...MONAD_MAINNET_CONFIG.rpcEndpoints.filter(e => e !== rpcUrl)]
    : MONAD_MAINNET_CONFIG.rpcEndpoints

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [STAKING_PRECOMPILE_ADDRESS, 'latest'],
          id: 1
        })
      })

      if (!response.ok) {
        if (response.status === 429) continue
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      if (data.error || !data.result) continue

      const balanceWei = BigInt(data.result)
      const balanceMON = formatMonNumberFromWei(balanceWei)
      
      return balanceMON
    } catch (error) {
      continue
    }
  }

  logger.error('Failed to fetch staking data')
  return null
}

/**
 * Calculate APY based on total staked and block rewards
 * APY = (Annual Rewards / Total Staked) * 100
 */
export function calculateAPY(totalStakedMON) {
  if (!totalStakedMON || totalStakedMON <= 0) {
    return null
  }

  const annualRewards = BLOCK_REWARD * BLOCKS_PER_YEAR
  const apy = (annualRewards / totalStakedMON) * 100

  // Cap at reasonable max (sanity check)
  if (apy > 1000) {
    return null // Something's wrong with data
  }

  return apy
}

/**
 * Get current epoch from staking precompile
 * Using eth_call to getEpoch() - selector: 0x757991a8
 */
export async function fetchCurrentEpoch(rpcUrl = MONAD_MAINNET_CONFIG.rpcUrl) {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{
          to: STAKING_PRECOMPILE_ADDRESS,
          data: '0x757991a8' // getEpoch() selector
        }, 'latest'],
        id: 1
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    
    if (data.error || !data.result || data.result === '0x') {
      return null
    }

    // Decode: returns (uint64 epoch, bool inEpochDelayPeriod)
    // First 32 bytes = epoch, next 32 bytes = bool
    const epochHex = data.result.slice(0, 66) // 0x + 64 chars
    const epoch = parseInt(epochHex, 16)
    
    return epoch
  } catch (error) {
    logger.error('Failed to fetch epoch:', error.message)
    return null
  }
}

/**
 * Main function: Get all staking stats with caching
 */
export async function getStakingStats(forceRefresh = false) {
  const now = Date.now()
  
  // Return cached data if still valid
  if (!forceRefresh && stakingCache.lastFetch > 0) {
    if (now - stakingCache.lastFetch < stakingCache.cacheDuration) {
      return {
        totalStaked: stakingCache.totalStaked,
        apy: stakingCache.apy,
        fromCache: true
      }
    }
  }

  // Fetch fresh data
  const totalStaked = await fetchTotalStaked()
  const apy = calculateAPY(totalStaked)

  // Update cache
  if (totalStaked !== null) {
    stakingCache.totalStaked = totalStaked
    stakingCache.apy = apy
    stakingCache.lastFetch = now
  }

  return {
    totalStaked,
    apy,
    fromCache: false
  }
}

/**
 * Format large MON numbers (e.g., 15.05B)
 */
export function formatStakedMON(amount) {
  if (amount === null || amount === undefined) return '...'
  
  if (amount >= 1e12) {
    return (amount / 1e12).toFixed(2) + 'T'
  }
  if (amount >= 1e9) {
    return (amount / 1e9).toFixed(2) + 'B'
  }
  if (amount >= 1e6) {
    return (amount / 1e6).toFixed(2) + 'M'
  }
  if (amount >= 1e3) {
    return (amount / 1e3).toFixed(2) + 'K'
  }
  return amount.toFixed(2)
}

/**
 * Format APY percentage
 */
export function formatAPY(apy) {
  if (apy === null || apy === undefined) return '...'
  return apy.toFixed(2) + '%'
}

export default {
  fetchTotalStaked,
  calculateAPY,
  fetchCurrentEpoch,
  getStakingStats,
  formatStakedMON,
  formatAPY,
  STAKING_PRECOMPILE_ADDRESS,
  BLOCK_REWARD,
  BLOCKS_PER_YEAR
}
