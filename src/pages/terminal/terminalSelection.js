import { fetchMonadPairs, fetchMonadTokenPairs } from './dexSearch'
import { fetchGeckoPool, fetchGeckoTrades } from './geckoApi'
import { chooseTokenPool, packDexSnapshot, packGeckoSnapshot, samePool } from './terminalMarketData'

const DEFAULT_APIS = { fetchGeckoPool, fetchGeckoTrades, fetchMonadPairs, fetchMonadTokenPairs }
const POOL_ID = /^0x(?:[\da-f]{40}|[\da-f]{64})$/i
const TOKEN_ADDRESS = /^0x[\da-f]{40}$/i

function checkAbort(signal, error) {
  if (signal?.aborted || error?.name === 'AbortError') throw new DOMException('Selection request cancelled', 'AbortError')
}

function canonicalAddress(value, token = false) {
  if (typeof value !== 'string') throw new Error('Invalid Monad selection address')
  const raw = value.trim()
  const address = !token && raw.startsWith('monad_') ? raw.slice(6) : raw
  if (!(token ? TOKEN_ADDRESS : POOL_ID).test(address)) throw new Error(`Invalid Monad ${token ? 'token address' : 'pool identifier'}`)
  return address.toLowerCase()
}

function poolAddress(pool) {
  try { return canonicalAddress(pool?.address || pool?.id) } catch { return null }
}

function message(error) {
  return error?.message || String(error || 'Source unavailable')
}

/** Resolve one exact selection independently from the background market index.
 * Raw snapshots retain provider provenance; failed sources never erase known data. */
export async function loadTerminalSelection({ selected, pools = [], window = 'h24', signal }, apis = {}) {
  checkAbort(signal)
  if (!selected || !['pool', 'token'].includes(selected.type)) throw new Error('Invalid market selection; choose a Monad pool or token')
  const api = { ...DEFAULT_APIS, ...apis }
  const rows = Array.isArray(pools) ? pools : []
  const snapshots = []
  const token = selected.type === 'token' ? canonicalAddress(selected.id, true) : null
  let pool = token ? chooseTokenPool(rows, token)
    : rows.find((row) => samePool(row.address, selected.id) || samePool(row.id, selected.id)) || null

  if (token && !pool) {
    let discovery
    try {
      discovery = await api.fetchMonadTokenPairs(token, { signal })
      checkAbort(signal)
    } catch (error) {
      checkAbort(signal, error)
      throw new Error(`Unable to find a pool for this Monad token: ${message(error)}`)
    }
    pool = chooseTokenPool(packDexSnapshot(discovery, window), token)
    if (!pool || !poolAddress(pool)) throw new Error('No matching Monad pool was found for this token')
    snapshots.push({ key: `token:${token}`, kind: 'dex', payload: discovery })
  }

  const poolId = poolAddress(pool) || (token ? null : canonicalAddress(selected.id))
  if (!poolId) throw new Error('No matching Monad pool was found for this token')
  const matchingPool = (candidates) => candidates.find((row) => poolAddress(row) === poolId
    && (!token || chooseTokenPool([row], token))) || null

  const loadMetadata = async () => {
    checkAbort(signal)
    let geckoError
    try {
      const payload = await api.fetchGeckoPool(poolId, { signal })
      checkAbort(signal)
      const resolved = matchingPool(packGeckoSnapshot(payload, window))
      if (!resolved) throw new Error('No matching metadata for the requested Monad pool')
      return { pool: resolved, metadataError: null, snapshot: { key: `pool:${poolId}:gecko`, kind: 'gecko', payload } }
    } catch (error) {
      checkAbort(signal, error)
      geckoError = message(error)
    }
    try {
      const payload = await api.fetchMonadPairs([poolId], { signal })
      checkAbort(signal)
      const resolved = matchingPool(packDexSnapshot(payload, window))
      if (!resolved) throw new Error('No matching metadata for the requested Monad pool')
      return { pool: resolved, metadataError: null, snapshot: { key: `pool:${poolId}:dex`, kind: 'dex', payload } }
    } catch (error) {
      checkAbort(signal, error)
      return { pool, metadataError: `GeckoTerminal: ${geckoError}; DEX Screener: ${message(error)}`, snapshot: null }
    }
  }

  const loadTrades = async () => {
    checkAbort(signal)
    try {
      const trades = await api.fetchGeckoTrades(poolId, { signal })
      checkAbort(signal)
      if (!Array.isArray(trades?.data)) throw new Error('Invalid trade response for the requested Monad pool')
      return { trades, tradeError: null }
    } catch (error) {
      checkAbort(signal, error)
      return { trades: null, tradeError: message(error) }
    }
  }

  const [metadata, trades] = await Promise.all([loadMetadata(), loadTrades()])
  checkAbort(signal)
  if (metadata.snapshot) snapshots.push(metadata.snapshot)
  return { poolId, pool: metadata.pool, snapshots, ...trades, metadataError: metadata.metadataError }
}
