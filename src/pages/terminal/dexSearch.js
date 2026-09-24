import { DEXSCREENER_API } from './constants'
import { isMonadPair } from './chainLock'
import { createMarketJsonClient } from './geckoApi'

const TOKEN_ADDRESS = /^0x[\da-f]{40}$/i
const POOL_ID = /^0x(?:[\da-f]{40}|[\da-f]{64})$/i
const abortIfNeeded = (signal) => {
  if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError')
}
const emptySnapshot = () => ({ pairs: [], fetchedAt: null, fromCache: false })

function address(value, pool = false) {
  if (typeof value !== 'string' || !(pool ? POOL_ID : TOKEN_ADDRESS).test(value.trim())) {
    throw new Error(`Invalid Monad ${pool ? 'pool identifier' : 'token address'}`)
  }
  return value.trim().toLowerCase()
}

function addressBatch(values, pool = false) {
  if (!Array.isArray(values)) throw new Error('Invalid address batch')
  if (values.length > 30) throw new Error('A market request supports at most 30 addresses')
  return [...new Set(values.map((value) => address(value, pool)))].sort()
}

function responsePairs(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.pairs)) return payload.pairs
  if (typeof payload?.schemaVersion === 'string' && payload.pairs == null) return []
  return null
}

function validDexPayload(payload, path) {
  const pairs = responsePairs(payload)
  if (!pairs) return false
  // Search is cross-chain upstream and filtered on return. Exact Monad
  // endpoints must not return another chain or an unrelated pool/token.
  if (path.startsWith('/latest/dex/search?')) return !Array.isArray(payload)
  const requested = new Set(path.split('/').at(-1).split(','))
  const byPool = path.startsWith('/latest/dex/pairs/')
  if (byPool ? Array.isArray(payload) : !Array.isArray(payload)) return false
  return pairs.every((pair) => isMonadPair(pair) && POOL_ID.test(pair.pairAddress)
    && (byPool ? requested.has(pair.pairAddress.toLowerCase())
      : [pair.baseToken?.address, pair.quoteToken?.address].some((token) => typeof token === 'string' && requested.has(token.toLowerCase()))))
}

const requestDex = createMarketJsonClient({
  baseUrl: DEXSCREENER_API,
  provider: 'DEX Screener',
  cacheLimit: 32,
  maxRequestsPerMinute: 120,
  validate: validDexPayload,
})

async function dexSnapshot(path, signal) {
  const { payload, fetchedAt, fromCache } = await requestDex(path, { signal, ttl: 30_000 })
  return { pairs: responsePairs(payload).filter(isMonadPair), fetchedAt, fromCache }
}

export async function searchMonadPairsSnapshot(q, { signal } = {}) {
  abortIfNeeded(signal)
  const query = String(q || '').trim()
  if (!query) return emptySnapshot()
  if (query.length > 256) throw new Error('Search query is too long')
  return dexSnapshot(`/latest/dex/search?q=${encodeURIComponent(query)}`, signal)
}

export async function searchMonadPairs(q, options) {
  return (await searchMonadPairsSnapshot(q, options)).pairs
}

export async function fetchMonadTokenPairs(token, { signal } = {}) {
  abortIfNeeded(signal)
  return dexSnapshot(`/token-pairs/v1/monad/${address(token)}`, signal)
}

export async function fetchMonadPairs(poolIds, { signal } = {}) {
  abortIfNeeded(signal)
  const ids = addressBatch(poolIds, true)
  return ids.length ? dexSnapshot(`/latest/dex/pairs/monad/${ids.join(',')}`, signal) : emptySnapshot()
}

export async function fetchMonadTokenBatch(addresses, { signal } = {}) {
  abortIfNeeded(signal)
  const tokens = addressBatch(addresses)
  return tokens.length ? dexSnapshot(`/tokens/v1/monad/${tokens.join(',')}`, signal) : emptySnapshot()
}
