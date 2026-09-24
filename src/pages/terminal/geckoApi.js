import { GECKO_BASE, GECKO_TIMEOUT_MS } from './constants'
import { geckoNetworkPath } from './chainLock'
import { logger } from '../../utils/logger'

const MARKET_CACHE_MS = 60_000
const FAILURE_CACHE_MS = 5000
const MIN_RETRY_MS = 15_000
const abortError = () => new DOMException('Request cancelled', 'AbortError')

function remember(map, key, value, limit) {
  map.delete(key)
  map.set(key, value)
  while (map.size > limit) map.delete(map.keys().next().value)
}

function retryDelay(value, now) {
  if (!value) return MARKET_CACHE_MS
  const seconds = Number(value)
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now
  return Number.isFinite(delay) ? Math.max(MIN_RETRY_MS, delay) : MARKET_CACHE_MS
}

function rateLimitError(provider, retryAfterMs) {
  return Object.assign(new Error(`${provider} rate limit; retry in ${Math.ceil(retryAfterMs / 1000)} seconds`), {
    name: 'RateLimitError', status: 429, retryAfterMs,
  })
}

function unavailableError(provider, retryAfterMs, timedOut = false) {
  return Object.assign(new Error(`${provider} temporarily unreachable${timedOut ? ' (request timed out)' : ''}; retry in ${Math.ceil(retryAfterMs / 1000)} seconds`), {
    name: timedOut ? 'TimeoutError' : 'ProviderUnavailableError', retryAfterMs,
  })
}

/** Each caller owns its subscription, so cancelling a hidden view cannot cancel
 * a shared public-provider request still needed by another view. */
export function createMarketJsonClient({ baseUrl, provider, validate, cacheLimit = 48, maxRequestsPerMinute, headers = { Accept: 'application/json' } }) {
  if (maxRequestsPerMinute !== undefined && (!Number.isSafeInteger(maxRequestsPerMinute) || maxRequestsPerMinute < 1)) {
    throw new RangeError('Request budget must be a positive integer')
  }
  const cache = new Map()
  const failures = new Map()
  const inFlight = new Map()
  const sentAt = []
  let cooldownUntil = 0
  let transportBackoffUntil = 0
  let transportFailures = 0

  const transportFailure = (timedOut) => {
    const now = Date.now()
    // A bundle's concurrent failures are one outage wave, rather than four
    // independent retries. Escalate only after the previous pause has ended.
    if (transportBackoffUntil <= now) {
      transportFailures = Math.min(transportFailures + 1, 3)
      transportBackoffUntil = now + MIN_RETRY_MS * 2 ** (transportFailures - 1)
    }
    return unavailableError(provider, transportBackoffUntil - now, timedOut)
  }

  const reserveRequest = () => {
    if (maxRequestsPerMinute === undefined) return
    const now = Date.now()
    while (sentAt.length && sentAt[0] <= now - MARKET_CACHE_MS) sentAt.shift()
    if (sentAt.length >= maxRequestsPerMinute) throw rateLimitError(provider, sentAt[0] + MARKET_CACHE_MS - now)
    sentAt.push(now)
  }

  async function retrieve(path, ttl, entry) {
    let timedOut = false
    let stage = 'starting'
    const timer = setTimeout(() => { timedOut = true; entry.controller.abort() }, GECKO_TIMEOUT_MS)
    try {
      if (entry.controller.signal.aborted) throw abortError()
      // Only a transport that is actually about to start consumes budget.
      // Cache hits, shared subscribers and abandoned mounts consume none.
      reserveRequest()
      stage = 'transport'
      const response = await fetch(`${baseUrl}${path}`, { signal: entry.controller.signal, headers })
      stage = 'response'
      if (entry.controller.signal.aborted) throw abortError()
      if (response.status === 429) {
        const now = Date.now()
        cooldownUntil = Math.max(cooldownUntil, now + retryDelay(response.headers.get('Retry-After'), now))
        throw rateLimitError(provider, cooldownUntil - now)
      }
      if (!response.ok) throw Object.assign(new Error(`${provider} request failed (${response.status})`), { name: 'HTTPError', status: response.status })
      stage = 'transport'
      const payload = await response.json()
      stage = 'validation'
      if (entry.controller.signal.aborted) throw abortError()
      if (!validate(payload, path)) throw new Error(`${provider} returned invalid market data`)
      const fetchedAt = Date.now()
      // A cached read is not evidence that the provider recovered. Only a
      // completed, valid transport resets this provider's outage progression.
      transportFailures = 0
      transportBackoffUntil = 0
      remember(cache, path, { payload, fetchedAt, expiresAt: fetchedAt + ttl }, cacheLimit)
      failures.delete(path)
      return { payload, fetchedAt, fromCache: false }
    } catch (cause) {
      const error = timedOut ? transportFailure(true)
        : entry.controller.signal.aborted ? abortError()
          : stage === 'transport' && cause?.name === 'TypeError' ? transportFailure(false) : cause
      // Caller cancellation is not a source outage and must not poison retries.
      if (error.name !== 'AbortError' && error.status !== 429) {
        remember(failures, path, { error, expiresAt: Date.now() + FAILURE_CACHE_MS }, cacheLimit)
      }
      throw error
    } finally {
      clearTimeout(timer)
      entry.done = true
      if (inFlight.get(path) === entry) inFlight.delete(path)
    }
  }

  function subscribe(path, entry, signal) {
    entry.users += 1
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (complete, value) => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', onAbort)
        entry.users -= 1
        if (!entry.done && entry.users === 0) {
          entry.controller.abort()
          if (inFlight.get(path) === entry) inFlight.delete(path)
        }
        complete(value)
      }
      const onAbort = () => finish(reject, abortError())
      signal?.addEventListener('abort', onAbort, { once: true })
      entry.promise.then((value) => finish(resolve, value), (error) => finish(reject, error))
      if (signal?.aborted) onAbort()
    })
  }

  return async function request(path, { signal, ttl = MARKET_CACHE_MS } = {}) {
    if (signal?.aborted) throw abortError()
    const now = Date.now()
    const snapshot = cache.get(path)
    if (snapshot?.expiresAt > now) {
      remember(cache, path, snapshot, cacheLimit)
      return { payload: snapshot.payload, fetchedAt: snapshot.fetchedAt, fromCache: true }
    }
    // Returning an expired snapshot as success would hide an outage and reset
    // its age. The consuming view may keep its own last successful snapshot.
    cache.delete(path)
    if (cooldownUntil > now) throw rateLimitError(provider, cooldownUntil - now)
    if (transportBackoffUntil > now) throw unavailableError(provider, transportBackoffUntil - now)
    const failure = failures.get(path)
    if (failure?.expiresAt > now) throw failure.error
    failures.delete(path)
    let entry = inFlight.get(path)
    if (!entry) {
      if (inFlight.size >= 6) throw new Error(`${provider} has too many pending requests; retry shortly`)
      entry = { controller: new AbortController(), users: 0, done: false, promise: null }
      inFlight.set(path, entry)
      // A mount abandoned in the same turn can unsubscribe before sending its
      // request, while simultaneous subscribers still share the transport.
      entry.promise = Promise.resolve().then(() => retrieve(path, ttl, entry))
    }
    return subscribe(path, entry, signal)
  }
}

const POOL_ID = /^0x(?:[\da-f]{40}|[\da-f]{64})$/i
const TOKEN_RESOURCE_ID = /^monad_0x[\da-f]{40}$/i

function monadPoolId(value) {
  if (typeof value !== 'string' || !POOL_ID.test(value.trim())) throw new Error('Invalid Monad pool identifier')
  return value.trim().toLowerCase()
}

function isMonadPool(pool, expectedId) {
  const id = pool?.id
  if (typeof id !== 'string' || !id.startsWith('monad_') || !POOL_ID.test(id.slice(6))) return false
  const address = id.slice(6).toLowerCase()
  return (!expectedId || address === expectedId)
    && (pool.attributes?.address == null || pool.attributes.address.toLowerCase?.() === address)
}

function validGeckoPayload(payload, path) {
  if (!payload || (payload.errors && payload.errors.length !== 0)) return false
  if (payload.included !== undefined && (!Array.isArray(payload.included)
    || !payload.included.every((item) => item?.type !== 'token' || TOKEN_RESOURCE_ID.test(item.id)))) return false
  const leaf = path.split('?')[0]
  const detail = leaf.match(/^\/networks\/monad\/pools\/(0x[\da-f]+)$/i)
  if (detail) return isMonadPool(payload.data, detail[1].toLowerCase())
  if (!Array.isArray(payload.data)) return false
  if (/\/(?:pools|trending_pools|new_pools)$/.test(leaf)) return payload.data.every((pool) => isMonadPool(pool))
  return true
}

const requestGecko = createMarketJsonClient({
  baseUrl: GECKO_BASE,
  provider: 'GeckoTerminal',
  maxRequestsPerMinute: 25,
  headers: { Accept: 'application/json;version=20230203' },
  validate: validGeckoPayload,
})

async function geckoJson(path, options) {
  const { payload, fetchedAt, fromCache } = await requestGecko(path, options)
  return { ...payload, fetchedAt, fromCache }
}

export async function fetchGeckoPools(kind, { page = 1, signal } = {}) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10) throw new Error('Invalid market page (1–10)')
  const leaf =
    kind === 'trending' ? '/trending_pools' : kind === 'new' ? '/new_pools' : '/pools'
  return geckoJson(
    `${geckoNetworkPath(leaf)}?page=${page}&include=base_token,quote_token,dex`,
    { signal },
  )
}

export async function fetchGeckoTrades(poolAddress, { signal } = {}) {
  if (signal?.aborted) throw abortError()
  if (!poolAddress) return { data: [] }
  const address = monadPoolId(poolAddress)
  return geckoJson(
    `${geckoNetworkPath(`/pools/${address}`)}/trades?trade_volume_in_usd_greater_than=0`,
    { signal },
  )
}

export async function fetchGeckoPool(poolId, { signal } = {}) {
  if (signal?.aborted) throw abortError()
  const address = monadPoolId(poolId)
  return geckoJson(`${geckoNetworkPath(`/pools/${address}`)}?include=base_token,quote_token,dex`, { signal })
}

export async function fetchGeckoDexes({ signal } = {}) {
  return geckoJson(geckoNetworkPath('/dexes'), { signal, ttl: 5 * MARKET_CACHE_MS })
}

export async function fetchGeckoBundle({ signal } = {}) {
  if (signal?.aborted) throw abortError()
  const settled = await Promise.allSettled([
    fetchGeckoPools('top', { signal }),
    fetchGeckoPools('trending', { signal }),
    fetchGeckoPools('new', { signal }),
    fetchGeckoPools('top', { page: 2, signal }),
  ])
  if (signal?.aborted) throw abortError()
  const out = { top: null, trending: null, fresh: null, topNext: null, errors: [], fetchedAt: null, fromCache: false }
  const labels = ['top', 'trending', 'fresh', 'topNext']
  const snapshots = []
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      out[labels[i]] = result.value
      snapshots.push(result.value)
    } else {
      out.errors.push(result.reason?.message || String(result.reason))
      logger.warn('GeckoTerminal fetch failed', labels[i], result.reason?.message)
    }
  })
  if (snapshots.length) {
    out.fetchedAt = Math.min(...snapshots.map((snapshot) => snapshot.fetchedAt))
    out.fromCache = snapshots.every((snapshot) => snapshot.fromCache)
  }
  return out
}
