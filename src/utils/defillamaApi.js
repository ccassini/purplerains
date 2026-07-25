/**
 * DeFiLlama API Client
 * Fetches TVL, stablecoin TVL, and chain revenue data for Monad
 */

import { MONAD_RPC_ENDPOINTS } from '../config/monadNetwork'
import { logger } from './logger'

const DEFILLAMA_BASE = 'https://api.llama.fi'
const API_TIMEOUT = 10000

function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT)
  return fetch(url, { ...opts, signal: controller.signal })
    .finally(() => clearTimeout(timeout))
}

// Cache for TVL data
let tvlCache = {
  data: null,
  lastFetch: 0,
  cacheDuration: 60000, // 1 minute cache
}

/**
 * Fetch Monad chain TVL data from DeFiLlama
 */
export async function fetchMonadTVL(forceRefresh = false) {
  const now = Date.now()

  // Return cached data if still valid
  if (!forceRefresh && tvlCache.lastFetch > 0) {
    if (now - tvlCache.lastFetch < tvlCache.cacheDuration) {
      return { ...tvlCache.data, fromCache: true }
    }
  }

  try {
    // Fetch current chain TVL
    const chainRes = await fetchWithTimeout(`${DEFILLAMA_BASE}/v2/chains`)
    if (!chainRes.ok) throw new Error(`DeFiLlama chains HTTP ${chainRes.status}`)
    const chainsData = await chainRes.json()

    // Find Monad chain data
    const monadChain = chainsData.find((chain) => 
      chain.name?.toLowerCase() === 'monad' || 
      chain.gecko_id === 'monad' ||
      chain.chainId === 143
    )

    // Fetch historical TVL for Monad
    let historicalTVL = null
    try {
      const histRes = await fetchWithTimeout(`${DEFILLAMA_BASE}/v2/historicalChainTvl/monad`)
      if (histRes.ok) {
        const histData = await histRes.json()
        if (Array.isArray(histData) && histData.length > 0) {
          // Get latest TVL from historical data
          const latest = histData[histData.length - 1]
          const prev24h = histData.length >= 2 ? histData[histData.length - 2] : null
          const prev7d = histData.length >= 8 ? histData[histData.length - 8] : null
          
          const currentTvl = latest.tvl || 0
          const tvl24hAgo = prev24h?.tvl || 0
          const tvl7dAgo = prev7d?.tvl || 0
          
          // Calculate percentage changes
          const change24hPct = tvl24hAgo > 0 
            ? ((currentTvl - tvl24hAgo) / tvl24hAgo) * 100 
            : 0
          const change7dPct = tvl7dAgo > 0 
            ? ((currentTvl - tvl7dAgo) / tvl7dAgo) * 100 
            : 0
          
          historicalTVL = {
            tvl: currentTvl,
            date: latest.date || Date.now() / 1000,
            change24h: change24hPct,
            change7d: change7dPct,
          }
        }
      }
    } catch {
      // Historical data fetch failed, continue with chain data
    }

    // Fetch protocols on Monad for count only
    let protocolCount = 0
    let totalProtocolTVL = 0
    try {
      const protocolsRes = await fetchWithTimeout(`${DEFILLAMA_BASE}/protocols`)
      if (protocolsRes.ok) {
        const protocolsData = await protocolsRes.json()
        const monadProtocols = protocolsData.filter((p) => 
          p.chains?.some((chain) => 
            chain.toLowerCase() === 'monad' || 
            chain.toLowerCase().includes('monad')
          )
        )
        protocolCount = monadProtocols.length
        totalProtocolTVL = monadProtocols.reduce((sum, p) => sum + (p.tvl || 0), 0)
      }
    } catch {
      // Protocol fetch failed, continue
    }

    // Fetch stablecoin market cap - Monad stablecoins: USDC, AUSD, USD1, USDT0, LVUSD
    // PRIMARY METHOD: Fetch directly from RPC contracts (most reliable)
    let stablecoinMcap = null
    
    // Stablecoin contract addresses and decimals
    // Verified Monad Mainnet addresses
    // Based on Token Tracker: USDC=247.47M, AUSD=51.47M, USDTO=105.58M, USD1=1.34M
    let stablecoinContracts = [
      { address: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', symbol: 'USDC', decimals: 6 }, // USDC: 247.47M
      { address: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', symbol: 'AUSD', decimals: 6 }, // AUSD: 51.47M (should be 6, not 18)
      { address: '0x111111d2bf19e43C34263401e0CAd979eD1cdb61', symbol: 'USD1', decimals: 6 }, // USD1: 1.34M
      { address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', symbol: 'USDT0', decimals: 6 }, // USDT0: 105.58M
      { address: '0xFD44B35139Ae53FFF7d8F2A9869c503D987f00d1', symbol: 'LVUSD', decimals: 6 }, // LVUSD (try 6 first)
    ]
    
    // Try to get additional stablecoin addresses and FDV from DeFiLlama /stablecoinchains (fallback)
    try {
      const stableRes = await fetchWithTimeout(`${DEFILLAMA_BASE}/stablecoinchains`)
      if (stableRes.ok) {
        const stableData = await stableRes.json()
        logger.debug('DeFiLlama /stablecoinchains response for address lookup')
        
        // Find Monad chain
        let monadChainData = null
        if (Array.isArray(stableData)) {
          monadChainData = stableData.find((chain) => 
            chain.chain?.toLowerCase() === 'monad' || 
            chain.name?.toLowerCase() === 'monad'
          )
        } else if (typeof stableData === 'object') {
          const monadKey = Object.keys(stableData).find(key => key.toLowerCase() === 'monad')
          if (monadKey) monadChainData = stableData[monadKey]
        }
        
        if (monadChainData?.peggedAssets && Array.isArray(monadChainData.peggedAssets)) {
          const usd1 = monadChainData.peggedAssets.find(c => 
            (c.symbol?.toUpperCase() || c.name?.toUpperCase()) === 'USD1'
          )
          const usdt0 = monadChainData.peggedAssets.find(c => 
            (c.symbol?.toUpperCase() || c.name?.toUpperCase()) === 'USDT0'
          )
          const lvusd = monadChainData.peggedAssets.find(c => 
            (c.symbol?.toUpperCase() || c.name?.toUpperCase()) === 'LVUSD'
          )
          
          if (usd1) {
            if (usd1.address) {
              stablecoinContracts.push({ 
                address: usd1.address, 
                symbol: 'USD1', 
                decimals: usd1.decimals || 6 
              })
              logger.debug('Found USD1 address from DeFiLlama:', usd1.address)
            }
            // Also store FDV for fallback
            if (usd1.circulating?.peggedUSD || usd1.fdv) {
              logger.debug('USD1 FDV from DeFiLlama:', usd1.circulating?.peggedUSD || usd1.fdv)
            }
          }
          if (usdt0) {
            if (usdt0.address) {
              stablecoinContracts.push({ 
                address: usdt0.address, 
                symbol: 'USDT0', 
                decimals: usdt0.decimals || 6 
              })
              logger.debug('Found USDT0 address from DeFiLlama:', usdt0.address)
            }
            // Also store FDV for fallback
            if (usdt0.circulating?.peggedUSD || usdt0.fdv) {
              logger.debug('USDT0 FDV from DeFiLlama:', usdt0.circulating?.peggedUSD || usdt0.fdv)
            }
          }
          if (lvusd) {
            if (lvusd.address) {
              stablecoinContracts.push({ 
                address: lvusd.address, 
                symbol: 'LVUSD', 
                decimals: lvusd.decimals || 6 
              })
              logger.debug('Found LVUSD address from DeFiLlama:', lvusd.address)
            }
            // Also store FDV for fallback
            if (lvusd.circulating?.peggedUSD || lvusd.fdv) {
              logger.debug('LVUSD FDV from DeFiLlama:', lvusd.circulating?.peggedUSD || lvusd.fdv)
            }
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to fetch additional stablecoin addresses from DeFiLlama:', error)
    }
    
    // Method 0: Fetch totalSupply from RPC for each stablecoin contract
    // First try with specified decimals, if result seems wrong, try alternative decimals
    try {
      const supplyPromises = stablecoinContracts.map(async ({ address, symbol, decimals }) => {
        // Try both 6 and 18 decimals for stablecoins that might have either
        const decimalsToTry = symbol === 'LVUSD' ? [6, 18] : [decimals]
        
        for (const rpcUrl of MONAD_RPC_ENDPOINTS.slice(0, 3)) { // Try first 3 RPCs
          for (const tryDecimals of decimalsToTry) {
            try {
              // Add timeout to prevent hanging
              const controller = new AbortController()
              const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout
              
              const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'eth_call',
                  params: [{
                    to: address,
                    data: '0x18160ddd' // totalSupply() function selector
                  }, 'latest'],
                  id: Math.floor(Math.random() * 10000)
                }),
                signal: controller.signal
              })

              clearTimeout(timeoutId)

              if (!response.ok) {
                logger.warn(`${symbol} RPC response not OK: ${response.status}`)
                continue
              }

              const data = await response.json()
              if (data.error) {
                logger.error(`${symbol} (${address}) RPC error:`, data.error)
                continue
              }
              
              if (!data.result || data.result === '0x' || data.result === '0x0') {
                logger.warn(`${symbol} (${address}) RPC returned empty result`)
                continue
              }

              // Parse the result (uint256)
              const supplyHex = data.result
              const supplyWei = BigInt(supplyHex)
              
              // Convert to human-readable using specified decimals
              const supply = Number(supplyWei) / Math.pow(10, tryDecimals)
              
              // Validate: stablecoin supply should be reasonable (between 1K and 1B)
              if (supply > 1000 && supply < 1_000_000_000) {
                logger.debug(`${symbol} totalSupply from RPC:`, supply)
                return { symbol, supply, address, decimals: tryDecimals }
              } else {
                logger.warn(`${symbol} supply seems unreasonable with ${tryDecimals} decimals:`, supply)
                // Try next decimals value
                continue
              }
            } catch (error) {
              if (error.name === 'AbortError') {
                logger.warn(`${symbol} RPC timeout on ${rpcUrl}`)
              } else {
                logger.warn(`RPC fetch failed for ${symbol} on ${rpcUrl}:`, error.message)
              }
              continue
            }
          }
        }
        logger.error(`❌ ${symbol} (${address}) failed to fetch from all RPC endpoints`)
        return { symbol, supply: 0, address, decimals, error: 'All RPC endpoints failed' }
      })

      const supplies = await Promise.all(supplyPromises)
      const rpcTotal = supplies.reduce((sum, { supply }) => sum + supply, 0)
      
      logger.debug('RPC stablecoin total:', rpcTotal)
      
      // Set initial stablecoin mcap from RPC
      if (rpcTotal > 0) {
        stablecoinMcap = rpcTotal
      } else {
        logger.warn('RPC total is 0, all RPC calls may have failed')
      }
      
      // If we got less than expected, try to add missing stablecoins from DeFiLlama
      if (rpcTotal > 0 && rpcTotal < 350_000_000) {
        // Try to get missing stablecoin FDV from DeFiLlama to complete the total
        try {
          const stableRes = await fetchWithTimeout(`${DEFILLAMA_BASE}/stablecoinchains`)
          if (stableRes.ok) {
            const stableData = await stableRes.json()
            
            let monadChainData = null
            if (Array.isArray(stableData)) {
              monadChainData = stableData.find((chain) => 
                chain.chain?.toLowerCase() === 'monad' || 
                chain.name?.toLowerCase() === 'monad'
              )
            } else if (typeof stableData === 'object') {
              const monadKey = Object.keys(stableData).find(key => key.toLowerCase() === 'monad')
              if (monadKey) monadChainData = stableData[monadKey]
            }
            
            if (monadChainData?.peggedAssets && Array.isArray(monadChainData.peggedAssets)) {
              const usd1 = monadChainData.peggedAssets.find(c => 
                (c.symbol?.toUpperCase() || c.name?.toUpperCase()) === 'USD1'
              )
              const usdt0 = monadChainData.peggedAssets.find(c => 
                (c.symbol?.toUpperCase() || c.name?.toUpperCase()) === 'USDT0'
              )
              const lvusd = monadChainData.peggedAssets.find(c => 
                (c.symbol?.toUpperCase() || c.name?.toUpperCase()) === 'LVUSD'
              )
              
              let usdt0Fdv = 0
              let lvusdFdv = 0
              
              if (usdt0) {
                usdt0Fdv = usdt0.circulating?.peggedUSD || 
                          usdt0.fdv || 
                          usdt0.circulating?.usd ||
                          usdt0.mcap ||
                          0
                logger.debug('USDT0 FDV from DeFiLlama:', usdt0Fdv)
              }
              
              if (lvusd) {
                lvusdFdv = lvusd.circulating?.peggedUSD || 
                          lvusd.fdv || 
                          lvusd.circulating?.usd ||
                          lvusd.mcap ||
                          0
                logger.debug('LVUSD FDV from DeFiLlama:', lvusdFdv)
              }
              
              const totalWithAdditional = rpcTotal + usdt0Fdv + lvusdFdv
              logger.debug('Total with USDT0 + LVUSD:', totalWithAdditional)
              
              if (totalWithAdditional > rpcTotal) {
                stablecoinMcap = totalWithAdditional
                logger.debug('Combined RPC + DeFiLlama stablecoin total:', stablecoinMcap)
              }
            }
          }
        } catch (error) {
          logger.warn('Failed to fetch additional stablecoins from DeFiLlama:', error)
        }
      }
    } catch (error) {
      logger.warn('RPC stablecoin totalSupply fetch failed:', error)
    }
    
    // Method 1: Try DeFiLlama /stablecoinchains endpoint (correct endpoint per API docs)
    if (!stablecoinMcap || stablecoinMcap < 300_000_000) {
      try {
        const stableRes = await fetchWithTimeout(`${DEFILLAMA_BASE}/stablecoinchains`)
        if (stableRes.ok) {
          const stableData = await stableRes.json()
          logger.debug('DeFiLlama /stablecoinchains response received')
          
          // Target stablecoins: USDC, AUSD, USD1, USDT0, LVUSD
          const targetStablecoins = ['USDC', 'AUSD', 'USD1', 'USDT0', 'LVUSD']
          
          // Find Monad chain in the response
          let monadChainData = null
          
          if (Array.isArray(stableData)) {
            monadChainData = stableData.find((chain) => 
              chain.chain?.toLowerCase() === 'monad' || 
              chain.name?.toLowerCase() === 'monad' ||
              chain.gecko_id === 'monad'
            )
          } else if (typeof stableData === 'object') {
            // Check if it's keyed by chain name
            const monadKey = Object.keys(stableData).find(key => 
              key.toLowerCase() === 'monad'
            )
            if (monadKey) {
              monadChainData = stableData[monadKey]
            }
          }
          
          if (monadChainData) {
            logger.debug('Found Monad chain data in stablecoinchains')
            
            // Check if it has peggedAssets array
            if (monadChainData.peggedAssets && Array.isArray(monadChainData.peggedAssets)) {
              const filtered = monadChainData.peggedAssets.filter(c => {
                const sym = c.symbol?.toUpperCase() || c.name?.toUpperCase()
                return targetStablecoins.includes(sym)
              })
              
              const defillamaTotal = filtered.reduce((sum, c) => {
                const val = c.circulating?.peggedUSD || 
                           c.circulating?.usd || 
                           c.fdv ||
                           c.totalCirculatingUSD ||
                           c.mcap ||
                           0
                logger.debug(`Stablecoin ${c.symbol || c.name}: ${val}`)
                return sum + (typeof val === 'number' ? val : 0)
              }, 0)
              
              if (defillamaTotal > (stablecoinMcap || 0)) {
                stablecoinMcap = defillamaTotal
                logger.debug('Using DeFiLlama stablecoinchains total:', stablecoinMcap)
              }
            } else {
              // Try direct total field
              const total = monadChainData.totalCirculatingUSD || 
                           monadChainData.totalCirculating || 
                           monadChainData.circulating?.peggedUSD ||
                           monadChainData.mcap ||
                           null
              if (total && total > (stablecoinMcap || 0)) {
                stablecoinMcap = total
                logger.debug('Using DeFiLlama stablecoinchains total (direct):', stablecoinMcap)
              }
            }
          }
        }
      } catch (error) {
        logger.warn('DeFiLlama /stablecoinchains endpoint failed:', error)
      }
    }

    // Method 1b: Try /protocols endpoint - sum stablecoin FDV from protocol token breakdowns
    if (!stablecoinMcap || stablecoinMcap < 300_000_000) {
      try {
        // Get all protocols
        const protocolsRes = await fetchWithTimeout(`${DEFILLAMA_BASE}/protocols`)
        if (protocolsRes.ok) {
          const protocolsData = await protocolsRes.json()
          
          const monadProtocols = protocolsData.filter((p) => 
            p.chains?.some((chain) => 
              chain.toLowerCase() === 'monad' || 
              chain.toLowerCase().includes('monad')
            )
          )
          
          const targetStablecoins = ['USDC', 'AUSD', 'USD1', 'USDT0', 'LVUSD']
          
          const topProtocols = monadProtocols
            .sort((a, b) => (b.tvl || 0) - (a.tvl || 0))
            .slice(0, 20)
          
          let protocolStablecoinTotal = 0
          const protocolPromises = topProtocols.map(async (protocol) => {
            try {
              const protocolRes = await fetchWithTimeout(`${DEFILLAMA_BASE}/protocol/${protocol.id}`)
              if (!protocolRes.ok) return null
              
              const protocolData = await protocolRes.json()
              
              // Check chainTvls for Monad chain
              if (protocolData.chainTvls && protocolData.chainTvls['Monad']) {
                const monadTvl = protocolData.chainTvls['Monad']
                
                // Check if it has tokens array with latest data
                if (monadTvl.tokens && Array.isArray(monadTvl.tokens) && monadTvl.tokens.length > 0) {
                  const latest = monadTvl.tokens[monadTvl.tokens.length - 1]
                  if (latest.tokens && typeof latest.tokens === 'object') {
                    // Sum target stablecoins
                    Object.keys(latest.tokens).forEach((tokenSymbol) => {
                      const upperSymbol = tokenSymbol.toUpperCase()
                      if (targetStablecoins.includes(upperSymbol)) {
                        const amount = latest.tokens[tokenSymbol]
                        if (typeof amount === 'number' && amount > 0) {
                          protocolStablecoinTotal += amount
                          logger.debug(`Protocol ${protocol.name}: ${tokenSymbol} = ${amount}`)
                        }
                      }
                    })
                  }
                }
              }
              
              return null
            } catch (error) {
              return null
            }
          })
          
          await Promise.all(protocolPromises)
          
          if (protocolStablecoinTotal > (stablecoinMcap || 0)) {
            stablecoinMcap = protocolStablecoinTotal
            logger.debug('Using protocol token breakdown total:', stablecoinMcap)
          }
        }
      } catch (error) {
        logger.warn('DeFiLlama /protocols token breakdown failed:', error)
      }
    }


    // Method 3: Fallback to protocol-based calculation
    if (!stablecoinMcap) {
      try {
        const protocolsRes = await fetchWithTimeout(`${DEFILLAMA_BASE}/protocols`)
        if (protocolsRes.ok) {
          const protocolsData = await protocolsRes.json()
          const monadProtocols = protocolsData.filter((p) => 
            p.chains?.some((chain) => 
              chain.toLowerCase() === 'monad' || 
              chain.toLowerCase().includes('monad')
            )
          )
          
          // Only count these specific stablecoins: USDC, AUSD, USD1, USDT0, LVUSD
          const targetStablecoins = ['USDC', 'AUSD', 'USD1', 'USDT0', 'LVUSD']
          let stablecoinTVL = 0
          
          monadProtocols.forEach((p) => {
            if (p.chainTvls && p.chainTvls['Monad']) {
              const monadTvl = p.chainTvls['Monad']
              if (typeof monadTvl === 'object' && monadTvl.tokens) {
                monadTvl.tokens.forEach((token) => {
                  const symbol = token.symbol?.toUpperCase()
                  if (targetStablecoins.includes(symbol)) {
                    stablecoinTVL += (token.tvl || 0)
                  }
                })
              }
            }
          })
          
          if (stablecoinTVL > 0) {
            stablecoinMcap = stablecoinTVL
          }
        }
      } catch (error) {
        logger.warn('Protocol-based stablecoin calculation failed:', error)
      }
    }

    // Use chain TVL if available, otherwise use historical or protocol sum
    const totalTVL = monadChain?.tvl || historicalTVL?.tvl || totalProtocolTVL || 0

    // Final check: If stablecoinMcap is still null or seems too low, try chain data
    if (!stablecoinMcap || stablecoinMcap < 300_000_000) {
      // Check if chain data has stablecoin info
      if (monadChain) {
        // Log all chain data keys for debugging
        logger.debug('Monad chain data keys:', Object.keys(monadChain))
        
        // Try various possible field names
        const chainStablecoin = monadChain.stablecoins || 
                               monadChain.stablecoinMcap || 
                               monadChain.stablecoin_mcap ||
                               monadChain.stablecoinMarketCap ||
                               monadChain.stablecoin_market_cap ||
                               null
        
        if (chainStablecoin && chainStablecoin > 300_000_000) {
          stablecoinMcap = chainStablecoin
          logger.debug('Using stablecoin mcap from chain data:', stablecoinMcap)
        }
      }
    }

    logger.debug('Final TVL:', totalTVL, 'Stablecoin mcap:', stablecoinMcap)
    
    const result = {
      totalTVL,
      stablecoinMcap: stablecoinMcap || null,
      chainTVL: monadChain?.tvl || null,
      change24h: historicalTVL?.change24h || null,
      change7d: historicalTVL?.change7d || null,
      protocolCount,
      lastUpdated: now,
      fromCache: false,
    }

    // Update cache
    tvlCache.data = result
    tvlCache.lastFetch = now

    return result
  } catch (error) {
    logger.error('Failed to fetch Monad TVL:', error)
    
    // Return cached data if available, even if expired
    if (tvlCache.data) {
      return { ...tvlCache.data, fromCache: true, error: error.message }
    }

    return {
      totalTVL: null,
      stablecoinMcap: null,
      chainTVL: null,
      change24h: null,
      change7d: null,
      protocolCount: 0,
      lastUpdated: now,
      fromCache: false,
      error: error.message,
    }
  }
}

/**
 * Fetch chain revenue data (if available)
 */
export async function fetchChainRevenue() {
  try {
    // DeFiLlama doesn't have direct revenue endpoint, but we can estimate from protocol fees
    // For now, return null - can be enhanced later with other APIs
    return null
  } catch {
    return null
  }
}

/**
 * Format TVL value
 */
export function formatTVL(value) {
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

/**
 * Format percentage change
 */
export function formatChange(value) {
  if (!Number.isFinite(value)) return '—'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export default {
  fetchMonadTVL,
  fetchChainRevenue,
  formatTVL,
  formatChange,
}
