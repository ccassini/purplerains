import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const POOL = `0x${'1'.repeat(40)}`
const OTHER_POOL = `0x${'2'.repeat(40)}`
const data = { data: [{ id: `monad_${POOL}`, attributes: { volume_usd: { h24: '12.5' }, market_cap_usd: null } }], included: [] }
const response = (body = data, status = 200, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(headers), json: async () => body })
const rejection = (promise) => promise.then(() => null, (error) => error)

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-24T00:00:00Z'))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('GeckoTerminal request lifecycle', () => {
  it('coalesces identical pending requests and preserves raw values and included resources', async () => {
    let resolve
    const fetch = vi.fn(() => new Promise((done) => { resolve = done }))
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoPools } = await import('../geckoApi')
    const first = fetchGeckoPools('top')
    const second = fetchGeckoPools('top')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(1)
    resolve(response())
    const [a, b] = await Promise.all([first, second])
    expect(a.data).toEqual(data.data)
    expect(a.included).toEqual([])
    expect(a.fetchedAt).toBe(Date.now())
    expect(b.fetchedAt).toBe(a.fetchedAt)
  })

  it('reuses a one-minute market snapshot without pretending it was just fetched', async () => {
    const fetch = vi.fn(async () => response())
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoPools } = await import('../geckoApi')
    const first = await fetchGeckoPools('top')
    await vi.advanceTimersByTimeAsync(59_000)
    const cached = await fetchGeckoPools('top')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(cached.fromCache).toBe(true)
    expect(cached.fetchedAt).toBe(first.fetchedAt)
    await vi.advanceTimersByTimeAsync(1001)
    expect((await fetchGeckoPools('top')).fromCache).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('cancelling one subscriber does not cancel a shared request needed by another', async () => {
    let resolve
    let transportSignal
    vi.stubGlobal('fetch', vi.fn((url, options) => { transportSignal = options.signal; return new Promise((done) => { resolve = done }) }))
    const { fetchGeckoTrades } = await import('../geckoApi')
    const controller = new AbortController()
    const first = rejection(fetchGeckoTrades(POOL, { signal: controller.signal }))
    const second = fetchGeckoTrades(POOL)
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    expect((await first).name).toBe('AbortError')
    expect(transportSignal.aborted).toBe(false)
    resolve(response({ data: [] }))
    expect((await second).data).toEqual([])
  })

  it('aborts the underlying transport when its last subscriber leaves', async () => {
    let transportSignal
    vi.stubGlobal('fetch', vi.fn((url, options) => new Promise((resolve, reject) => {
      transportSignal = options.signal
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })))
    const { fetchGeckoTrades } = await import('../geckoApi')
    const controller = new AbortController()
    const pending = rejection(fetchGeckoTrades(POOL, { signal: controller.signal }))
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    expect((await pending).name).toBe('AbortError')
    expect(transportSignal.aborted).toBe(true)
  })

  it('sends no request for a mount cancelled in the same turn and permits its replacement', async () => {
    const fetch = vi.fn(async () => response())
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoPools } = await import('../geckoApi')
    const controller = new AbortController()
    const abandoned = rejection(fetchGeckoPools('top', { signal: controller.signal }))
    controller.abort()
    const replacement = fetchGeckoPools('top')
    expect((await abandoned).name).toBe('AbortError')
    expect((await replacement).data).toEqual(data.data)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not cache a late body from a cancelled transport over its replacement', async () => {
    let finishBody
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ...response(), json: () => new Promise((resolve) => { finishBody = resolve }) })
      .mockResolvedValueOnce(response({ data: [{ id: `monad_${OTHER_POOL}` }] }))
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoPools } = await import('../geckoApi')
    const controller = new AbortController()
    const abandoned = rejection(fetchGeckoPools('top', { signal: controller.signal }))
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    expect((await abandoned).name).toBe('AbortError')
    await fetchGeckoPools('top')
    finishBody(data)
    await vi.advanceTimersByTimeAsync(0)
    expect((await fetchGeckoPools('top')).data).toEqual([{ id: `monad_${OTHER_POOL}` }])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('bounds distinct pending transports while letting existing subscribers share them', async () => {
    const fetch = vi.fn((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoPools } = await import('../geckoApi')
    const controller = new AbortController()
    const pending = Array.from({ length: 6 }, (_, index) => rejection(fetchGeckoPools('top', { page: index + 1, signal: controller.signal })))
    pending.push(rejection(fetchGeckoPools('top', { page: 1, signal: controller.signal })))
    await vi.advanceTimersByTimeAsync(0)
    await expect(fetchGeckoPools('top', { page: 7 })).rejects.toThrow(/pending requests/i)
    expect(fetch).toHaveBeenCalledTimes(6)
    controller.abort()
    expect((await Promise.all(pending)).every((error) => error.name === 'AbortError')).toBe(true)
    fetch.mockResolvedValueOnce(response())
    expect((await fetchGeckoPools('top', { page: 7 })).data).toEqual(data.data)
  })

  it('rejects caller cancellation even when a successful snapshot is cached', async () => {
    const fetch = vi.fn(async () => response())
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoPools } = await import('../geckoApi')
    await fetchGeckoPools('top')
    const controller = new AbortController()
    controller.abort()
    await expect(fetchGeckoPools('top', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('reports a timeout distinctly from caller cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })))
    const { fetchGeckoPools } = await import('../geckoApi')
    const pending = rejection(fetchGeckoPools('top'))
    await vi.advanceTimersByTimeAsync(8001)
    expect((await pending).name).toBe('TimeoutError')
  })

  it('honors provider-wide Retry-After without hammering different Gecko endpoints', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({}, 429, { 'Retry-After': '60' })).mockResolvedValue(response({ data: [] }))
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoPools, fetchGeckoTrades } = await import('../geckoApi')
    await expect(fetchGeckoPools('top')).rejects.toMatchObject({ status: 429 })
    await expect(fetchGeckoTrades(POOL)).rejects.toMatchObject({ status: 429 })
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_001)
    expect((await fetchGeckoTrades(POOL)).data).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps an unexpired verified snapshot readable during a cooldown with its original age', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response()).mockResolvedValue(response({}, 429))
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoPools } = await import('../geckoApi')
    const original = await fetchGeckoPools('top')
    await vi.advanceTimersByTimeAsync(1000)
    await expect(fetchGeckoPools('new')).rejects.toMatchObject({ status: 429 })
    expect(await fetchGeckoPools('top')).toMatchObject({ fetchedAt: original.fetchedAt, fromCache: true })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('never relabels an expired snapshot as fresh success when a refresh fails', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response()).mockResolvedValue(response({}, 503))
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoPools } = await import('../geckoApi')
    const first = await fetchGeckoPools('top')
    await vi.advanceTimersByTimeAsync(60_001)
    await expect(fetchGeckoPools('top')).rejects.toMatchObject({ status: 503 })
    await expect(fetchGeckoPools('top')).rejects.toMatchObject({ status: 503 })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(first.fetchedAt).toBeLessThan(Date.now())
  })

  it('refuses malformed successful payloads instead of inventing empty market data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ errors: [{ title: 'unavailable' }] })))
    const { fetchGeckoPools } = await import('../geckoApi')
    await expect(fetchGeckoPools('top')).rejects.toThrow(/invalid|unavailable/i)
  })

  it('keeps every URL locked to Monad and rejects path-like pool identifiers', async () => {
    const fetch = vi.fn(async () => response({ data: [] }))
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoPools, fetchGeckoTrades } = await import('../geckoApi')
    await fetchGeckoPools('trending')
    await fetchGeckoTrades(POOL)
    expect(fetch.mock.calls.every(([url]) => url.includes('/networks/monad/'))).toBe(true)
    await expect(fetchGeckoTrades('../ethereum/pools/anything')).rejects.toThrow(/invalid/i)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('GeckoTerminal bundle semantics', () => {
  it('retains successful sections and reports a partial provider failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => url.includes('trending_pools') ? response({}, 500) : response()))
    const { fetchGeckoBundle } = await import('../geckoApi')
    const bundle = await fetchGeckoBundle()
    expect(bundle.top.data).toEqual(data.data)
    expect(bundle.fresh.data).toEqual(data.data)
    expect(bundle.trending).toBe(null)
    expect(bundle.errors).toHaveLength(1)
    expect(bundle.fetchedAt).toBe(Date.now())
  })

  it('returns no successful timestamp when every section failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({}, 500)))
    const { fetchGeckoBundle } = await import('../geckoApi')
    expect(await fetchGeckoBundle()).toMatchObject({ top: null, trending: null, fresh: null, fetchedAt: null, errors: expect.any(Array) })
  })

  it('propagates a cancelled bundle instead of returning three empty successes or warnings', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const { fetchGeckoBundle } = await import('../geckoApi')
    const controller = new AbortController()
    controller.abort()
    await expect(fetchGeckoBundle({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('cancels an active bundle quietly while another subscriber keeps its shared top request', async () => {
    const finish = new Map()
    vi.stubGlobal('fetch', vi.fn((url, { signal }) => new Promise((resolve, reject) => {
      finish.set(url, resolve)
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })))
    const { fetchGeckoPools, fetchGeckoBundle } = await import('../geckoApi')
    const controller = new AbortController()
    const bundle = rejection(fetchGeckoBundle({ signal: controller.signal }))
    const top = fetchGeckoPools('top')
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    expect((await bundle).name).toBe('AbortError')
    expect(console.warn).not.toHaveBeenCalled()
    for (const [url, resolve] of finish) if (url.includes('/monad/pools?')) resolve(response())
    expect((await top).data).toEqual(data.data)
  })

  it('uses the oldest successful section timestamp when cache ages differ', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response()))
    const { fetchGeckoPools, fetchGeckoBundle } = await import('../geckoApi')
    const top = await fetchGeckoPools('top')
    await vi.advanceTimersByTimeAsync(2000)
    const bundle = await fetchGeckoBundle()
    expect(bundle.fetchedAt).toBe(top.fetchedAt)
    expect(bundle.fromCache).toBe(false)
  })
})

describe('Monad DEX search', () => {
  it('filters other chains and caches normalized whitespace queries for thirty seconds', async () => {
    const pairs = [{ chainId: 'monad', pairAddress: POOL }, { chainId: 'ethereum', pairAddress: OTHER_POOL }]
    const fetch = vi.fn(async () => response({ pairs }))
    vi.stubGlobal('fetch', fetch)
    const { searchMonadPairs } = await import('../dexSearch')
    expect(await searchMonadPairs(' MON ')).toEqual([pairs[0]])
    expect(await searchMonadPairs('MON')).toEqual([pairs[0]])
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_001)
    await searchMonadPairs('MON')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('accepts documented empty search results but rejects malformed success bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ schemaVersion: '1.0.0', pairs: null })).mockResolvedValue(response({ error: 'blocked' })))
    const { searchMonadPairs } = await import('../dexSearch')
    expect(await searchMonadPairs('empty')).toEqual([])
    await expect(searchMonadPairs('bad')).rejects.toThrow(/invalid/i)
  })

  it('coalesces duplicate search requests without tying their abort signals together', async () => {
    let resolve
    let transportSignal
    const fetch = vi.fn((url, options) => { transportSignal = options.signal; return new Promise((done) => { resolve = done }) })
    vi.stubGlobal('fetch', fetch)
    const { searchMonadPairs } = await import('../dexSearch')
    const controller = new AbortController()
    const first = rejection(searchMonadPairs('MON', { signal: controller.signal }))
    const second = searchMonadPairs('MON')
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    expect((await first).name).toBe('AbortError')
    expect(transportSignal.aborted).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
    resolve(response({ pairs: [] }))
    expect(await second).toEqual([])
  })

  it('uses a bounded search cache instead of retaining every typed query', async () => {
    const fetch = vi.fn(async () => response({ pairs: [] }))
    vi.stubGlobal('fetch', fetch)
    const { searchMonadPairs } = await import('../dexSearch')
    for (let index = 0; index < 33; index += 1) await searchMonadPairs(`token${index}`)
    await searchMonadPairs('token0')
    expect(fetch).toHaveBeenCalledTimes(34)
    await searchMonadPairs('token32')
    expect(fetch).toHaveBeenCalledTimes(34)
  })

  it('honors a date-form Retry-After while keeping providers independent', async () => {
    const until = new Date(Date.now() + 30_000).toUTCString()
    const fetch = vi.fn(async (url) => url.includes('dexscreener') ? response({}, 429, { 'Retry-After': until }) : response())
    vi.stubGlobal('fetch', fetch)
    const { searchMonadPairs } = await import('../dexSearch')
    const { fetchGeckoPools } = await import('../geckoApi')
    await expect(searchMonadPairs('MON')).rejects.toMatchObject({ status: 429 })
    await expect(searchMonadPairs('WMON')).rejects.toMatchObject({ status: 429 })
    expect((await fetchGeckoPools('top')).data).toEqual(data.data)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('Expanded Monad market endpoints', () => {
  const token = `0x${'a'.repeat(40)}`
  const otherToken = `0x${'b'.repeat(40)}`
  const pair = { chainId: 'monad', pairAddress: POOL, baseToken: { address: token }, quoteToken: { address: otherToken }, priceUsd: '0.024', marketCap: null }

  it('keeps the second top-pool page independent when its request fails', async () => {
    const fetch = vi.fn(async (url) => url.includes('page=2') ? response({}, 503) : response())
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoBundle } = await import('../geckoApi')
    const bundle = await fetchGeckoBundle()
    expect(bundle.top.data).toEqual(data.data)
    expect(bundle.topNext).toBe(null)
    expect(bundle.trending.data).toEqual(data.data)
    expect(bundle.fresh.data).toEqual(data.data)
    expect(bundle.errors).toHaveLength(1)
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(fetch.mock.calls.some(([url]) => url.includes('/monad/pools?page=2'))).toBe(true)
  })

  it('fetches one exact pool with included token resources and preserves cache age', async () => {
    const poolId = `0x${'c'.repeat(64)}`
    const detail = { data: { id: `monad_${poolId}`, type: 'pool', attributes: { address: poolId, market_cap_usd: null } }, included: [{ id: `monad_${token}`, type: 'token', attributes: { address: token } }] }
    const fetch = vi.fn(async () => response(detail))
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoPool } = await import('../geckoApi')
    const first = await fetchGeckoPool(poolId)
    expect(first.data).toEqual(detail.data)
    expect(first.included).toEqual(detail.included)
    expect(fetch.mock.calls[0][0]).toBe(`https://api.geckoterminal.com/api/v2/networks/monad/pools/${poolId}?include=base_token,quote_token,dex`)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await fetchGeckoPool(poolId)).toMatchObject({ fetchedAt: first.fetchedAt, fromCache: true })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects a foreign or different pool returned for an exact detail request', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response({ data: { id: `eth_${POOL}`, attributes: { address: POOL } } }))
      .mockResolvedValueOnce(response({ data: { id: `monad_${POOL}`, attributes: { address: POOL } } })))
    const { fetchGeckoPool } = await import('../geckoApi')
    await expect(fetchGeckoPool(POOL)).rejects.toThrow(/invalid/i)
    await expect(fetchGeckoPool(OTHER_POOL)).rejects.toThrow(/invalid/i)
    await expect(fetchGeckoPool(`eth_${POOL}`)).rejects.toThrow(/invalid/i)
  })

  it('returns verified token pools with metadata and shares the canonical cache', async () => {
    const fetch = vi.fn(async () => response([pair]))
    vi.stubGlobal('fetch', fetch)
    const { fetchMonadTokenPairs } = await import('../dexSearch')
    const first = await fetchMonadTokenPairs(token)
    expect(first).toMatchObject({ pairs: [pair], fetchedAt: Date.now(), fromCache: false })
    await vi.advanceTimersByTimeAsync(1000)
    expect(await fetchMonadTokenPairs(token.toUpperCase())).toMatchObject({ pairs: [pair], fetchedAt: first.fetchedAt, fromCache: true })
    expect(fetch.mock.calls[0][0]).toBe(`https://api.dexscreener.com/token-pairs/v1/monad/${token}`)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('canonicalizes and coalesces pair and token batches without losing raw fields', async () => {
    const fetch = vi.fn(async (url) => response(url.includes('/latest/dex/pairs/') ? { pairs: [pair] } : [pair]))
    vi.stubGlobal('fetch', fetch)
    const { fetchMonadPairs, fetchMonadTokenBatch } = await import('../dexSearch')
    const pairs = await fetchMonadPairs([OTHER_POOL, POOL, POOL])
    expect(pairs.pairs).toEqual([pair])
    expect((await fetchMonadPairs([POOL, OTHER_POOL])).fromCache).toBe(true)
    const tokens = await fetchMonadTokenBatch([otherToken, token, token.toUpperCase()])
    expect(tokens.pairs[0].marketCap).toBe(null)
    expect((await fetchMonadTokenBatch([token, otherToken])).fetchedAt).toBe(tokens.fetchedAt)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0][0]).toBe(`https://api.dexscreener.com/latest/dex/pairs/monad/${POOL},${OTHER_POOL}`)
    expect(fetch.mock.calls[1][0]).toBe(`https://api.dexscreener.com/tokens/v1/monad/${token},${otherToken}`)
  })

  it('rejects foreign-chain and unrelated results instead of relabeling them as Monad data', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response([{ ...pair, chainId: 'ethereum' }]))
      .mockResolvedValueOnce(response({ pairs: [{ ...pair, pairAddress: OTHER_POOL }] }))
      .mockResolvedValueOnce(response([{ ...pair, baseToken: { address: OTHER_POOL }, quoteToken: { address: POOL } }]))
    vi.stubGlobal('fetch', fetch)
    const { fetchMonadTokenPairs, fetchMonadPairs, fetchMonadTokenBatch } = await import('../dexSearch')
    await expect(fetchMonadTokenPairs(token)).rejects.toThrow(/invalid/i)
    await expect(fetchMonadPairs([POOL])).rejects.toThrow(/invalid/i)
    await expect(fetchMonadTokenBatch([token])).rejects.toThrow(/invalid/i)
  })

  it('rejects oversized or path-like address batches before any transport', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { fetchMonadTokenPairs, fetchMonadPairs, fetchMonadTokenBatch } = await import('../dexSearch')
    const addresses = Array.from({ length: 31 }, (_, index) => `0x${index.toString(16).padStart(40, '0')}`)
    await expect(fetchMonadTokenBatch(addresses)).rejects.toThrow(/30/i)
    await expect(fetchMonadTokenPairs(`0x${'a'.repeat(64)}`)).rejects.toThrow(/invalid/i)
    await expect(fetchMonadPairs(['../ethereum/pool'])).rejects.toThrow(/invalid/i)
    expect(await fetchMonadTokenBatch([])).toEqual({ pairs: [], fetchedAt: null, fromCache: false })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('offers search metadata without changing the array API or cross-chain filtering', async () => {
    const fetch = vi.fn(async () => response({ pairs: [pair, { ...pair, chainId: 'ethereum' }] }))
    vi.stubGlobal('fetch', fetch)
    const { searchMonadPairs, searchMonadPairsSnapshot } = await import('../dexSearch')
    const snapshot = await searchMonadPairsSnapshot('MON')
    expect(snapshot).toMatchObject({ pairs: [pair], fetchedAt: Date.now(), fromCache: false })
    await vi.advanceTimersByTimeAsync(1000)
    expect(await searchMonadPairs(' MON ')).toEqual([pair])
    expect((await searchMonadPairsSnapshot('MON')).fetchedAt).toBe(snapshot.fetchedAt)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('Provider request budgets', () => {
  it('counts real transports only and recovers on the rolling minute boundary', async () => {
    const fetch = vi.fn(async () => response())
    vi.stubGlobal('fetch', fetch)
    const { createMarketJsonClient } = await import('../geckoApi')
    const request = createMarketJsonClient({ baseUrl: 'https://example.test', provider: 'Test', validate: () => true, maxRequestsPerMinute: 2 })
    await Promise.all([request('/one'), request('/one')])
    await request('/one')
    await vi.advanceTimersByTimeAsync(1000)
    await request('/two')
    await expect(request('/three')).rejects.toMatchObject({ name: 'RateLimitError', status: 429, retryAfterMs: 59_000 })
    expect(fetch).toHaveBeenCalledTimes(2)
    const controller = new AbortController()
    controller.abort()
    await expect(request('/three', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(59_000)
    expect((await request('/three')).fromCache).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('does not consume budget for a same-turn cancelled request', async () => {
    const fetch = vi.fn(async () => response())
    vi.stubGlobal('fetch', fetch)
    const { createMarketJsonClient } = await import('../geckoApi')
    const request = createMarketJsonClient({ baseUrl: 'https://example.test', provider: 'Test', validate: () => true, maxRequestsPerMinute: 1 })
    const controller = new AbortController()
    const aborted = rejection(request('/cancelled', { signal: controller.signal }))
    controller.abort()
    expect((await aborted).name).toBe('AbortError')
    await expect(request('/replacement')).resolves.toMatchObject({ fromCache: false })
    await expect(request('/extra')).rejects.toMatchObject({ name: 'RateLimitError' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('shares the Gecko budget between trades and exact pool details', async () => {
    const fetch = vi.fn(async () => response({ data: [] }))
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoTrades, fetchGeckoPool } = await import('../geckoApi')
    for (let index = 0; index < 25; index += 1) await fetchGeckoTrades(`0x${index.toString(16).padStart(40, '0')}`)
    await expect(fetchGeckoPool(POOL)).rejects.toMatchObject({ name: 'RateLimitError', status: 429 })
    expect(fetch).toHaveBeenCalledTimes(25)
  })

  it('shares one DEX budget across search, token and pool endpoints', async () => {
    const fetch = vi.fn(async () => response({ pairs: [] }))
    vi.stubGlobal('fetch', fetch)
    const { searchMonadPairs, fetchMonadPairs, fetchMonadTokenPairs } = await import('../dexSearch')
    for (let index = 0; index < 120; index += 1) await searchMonadPairs(`query${index}`)
    await expect(fetchMonadPairs([POOL])).rejects.toMatchObject({ name: 'RateLimitError', status: 429 })
    await expect(fetchMonadTokenPairs(OTHER_POOL)).rejects.toMatchObject({ name: 'RateLimitError', status: 429 })
    expect(fetch).toHaveBeenCalledTimes(120)
  })
})

describe('Provider transport backoff', () => {
  it('backs off all endpoints on browser network errors without inventing an HTTP status', async () => {
    const fetch = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoPools, fetchGeckoTrades } = await import('../geckoApi')
    const first = await rejection(fetchGeckoPools('top'))
    expect(first).toMatchObject({ name: 'ProviderUnavailableError', retryAfterMs: 15_000 })
    expect(first.message).toMatch(/GeckoTerminal.*temporarily unreachable/i)
    expect(first.status).toBeUndefined()
    await expect(fetchGeckoTrades(POOL)).rejects.toMatchObject({ name: 'ProviderUnavailableError', retryAfterMs: 15_000 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('counts concurrent failures as one wave and caps consecutive outage backoff at one minute', async () => {
    const fetch = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoBundle, fetchGeckoTrades } = await import('../geckoApi')
    expect((await fetchGeckoBundle()).errors).toHaveLength(4)
    expect(fetch).toHaveBeenCalledTimes(4)
    await expect(fetchGeckoTrades(POOL)).rejects.toMatchObject({ retryAfterMs: 15_000 })
    for (const [advance, delay] of [[15_000, 30_000], [30_000, 60_000], [60_000, 60_000]]) {
      await vi.advanceTimersByTimeAsync(advance)
      await expect(fetchGeckoTrades(POOL)).rejects.toMatchObject({ name: 'ProviderUnavailableError', retryAfterMs: delay })
      await expect(fetchGeckoTrades(OTHER_POOL)).rejects.toMatchObject({ retryAfterMs: delay })
    }
    expect(fetch).toHaveBeenCalledTimes(7)
  })

  it('serves honest cached data during an outage but resets progression only after a successful transport', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response()).mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoPools, fetchGeckoTrades } = await import('../geckoApi')
    const snapshot = await fetchGeckoPools('top')
    await vi.advanceTimersByTimeAsync(1000)
    await expect(fetchGeckoTrades(POOL)).rejects.toMatchObject({ retryAfterMs: 15_000 })
    expect(await fetchGeckoPools('top')).toMatchObject({ fetchedAt: snapshot.fetchedAt, fromCache: true })
    await vi.advanceTimersByTimeAsync(15_000)
    await expect(fetchGeckoTrades(OTHER_POOL)).rejects.toMatchObject({ retryAfterMs: 30_000 })
    expect(fetch).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(30_000)
    fetch.mockResolvedValueOnce(response({ data: [] }))
    await expect(fetchGeckoTrades(OTHER_POOL)).resolves.toMatchObject({ fromCache: false })
    await expect(fetchGeckoPools('new')).rejects.toMatchObject({ retryAfterMs: 15_000 })
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  it('backs off after a timeout while preserving its distinction from caller cancellation', async () => {
    const fetch = vi.fn((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoPools, fetchGeckoTrades } = await import('../geckoApi')
    const pending = rejection(fetchGeckoPools('top'))
    await vi.advanceTimersByTimeAsync(8001)
    const timeout = await pending
    expect(timeout).toMatchObject({ name: 'TimeoutError', retryAfterMs: 15_000 })
    expect(timeout.message).toMatch(/temporarily unreachable.*timed out/i)
    await expect(fetchGeckoTrades(POOL)).rejects.toMatchObject({ name: 'ProviderUnavailableError', retryAfterMs: 14_999 })
    const controller = new AbortController()
    controller.abort()
    await expect(fetchGeckoTrades(POOL, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('caller cancellation never activates provider backoff or a failure cache', async () => {
    const fetch = vi.fn((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoPools } = await import('../geckoApi')
    const controller = new AbortController()
    const pending = rejection(fetchGeckoPools('top', { signal: controller.signal }))
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    expect((await pending).name).toBe('AbortError')
    fetch.mockResolvedValueOnce(response())
    await expect(fetchGeckoPools('top')).resolves.toMatchObject({ fromCache: false })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('uses a conservative floor for Retry-After zero and does not block another provider', async () => {
    const fetch = vi.fn(async (url) => url.includes('geckoterminal') ? response({}, 429, { 'Retry-After': '0' }) : response({ pairs: [] }))
    vi.stubGlobal('fetch', fetch)
    const { fetchGeckoPools } = await import('../geckoApi')
    const { searchMonadPairs } = await import('../dexSearch')
    await expect(fetchGeckoPools('top')).rejects.toMatchObject({ status: 429, retryAfterMs: 15_000 })
    await vi.advanceTimersByTimeAsync(1000)
    await expect(fetchGeckoPools('new')).rejects.toMatchObject({ status: 429, retryAfterMs: 14_000 })
    expect(await searchMonadPairs('MON')).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
