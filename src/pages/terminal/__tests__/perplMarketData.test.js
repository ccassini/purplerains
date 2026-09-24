import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPerplMarketFeed, createPerplMarketStore, normalizePerplContext, normalizePerplTrade } from '../perplMarketData'

const hash = 'ab'.repeat(32)
function context() {
  return {
    chain: { chain_id: 143 }, tokens: [{ id: 1, symbol: 'AUSD', decimals: 6 }], instances: [{ id: 1, collateral_token_id: 1 }],
    markets: [{ id: 1, instance_id: 1, symbol: '', name: 'BTC', size_units: 'BTC', funding_interval_sec: 2580,
      config: { price_decimals: 1, size_decimals: 5, is_open: true },
      state: { at: { b: 10, t: 1000 }, lst: 835003, mrk: 835000, orl: 834999, bid: 834998, ask: 835004, prv: 840000, dv: 200000, dva: '167000000000', oi: 500000, tvl: '25000000000' },
      funding: { at: { b: 9, t: 900 }, feb: 9, rate: 40 },
    }],
  }
}
const rawTrade = (extra = {}) => ({ at: { b: 10, t: 1000, txid: hash, tx: 2, l: 3 }, p: 835003, s: 473, sd: 2, ...extra })
const ack = { mt: 6, subs: [{ stream: 'trades@1', sid: 77, status: { code: 0 } }] }
function readyStore(options) { const store = createPerplMarketStore(options); store.setContext(context()); store.applyFrame(ack); return store }
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

afterEach(() => { vi.useRealTimers() })

describe('Perpl public data normalization', () => {
  it('uses live config scaling and identifies collateral without claiming a USD price', () => {
    const market = normalizePerplContext(context())[0].market
    expect(market).toMatchObject({ id: 1, symbol: 'BTC', collateralSymbol: 'AUSD', lastPrice: 83500.3, markPrice: 83500, indexPrice: 83499.9, volume24h: 167000, volume24hBase: 2, openInterestBase: 5, openInterestNotional: 417500, tvl: 25000, fundingRatePct: 0.004, fundingIntervalSeconds: 2580, updatedAt: 1000 })
    expect(market.change24hPct).toBeCloseTo((83500.3 / 84000 - 1) * 100)
  })

  it('rejects foreign-chain context and skips markets without verified scale metadata', () => {
    expect(() => normalizePerplContext({ ...context(), chain: { chain_id: 1 } })).toThrow(/mainnet/)
    const input = context()
    delete input.markets[0].config.price_decimals
    expect(normalizePerplContext(input)).toEqual([])
  })

  it('keeps unavailable fields null and preserves known zero values', () => {
    const input = context()
    input.markets[0].state = { dv: 0, oi: 0, dva: '0', tvl: '0', bid: 0 }
    input.markets[0].funding = { rate: 0 }
    expect(normalizePerplContext(input)[0].market).toMatchObject({ lastPrice: null, bid: null, indexPrice: null, volume24h: 0, volume24hBase: 0, openInterestBase: 0, openInterestNotional: null, fundingRatePct: 0, updatedAt: null })
  })

  it('decodes actual transaction identity, timestamp, size and trade side', () => {
    const market = normalizePerplContext(context())[0].market
    expect(normalizePerplTrade(rawTrade(), market)).toMatchObject({ id: `perpl:1:0x${hash}:3`, marketId: 1, side: 'sell', price: 83500.3, size: 0.00473, hash: `0x${hash}`, ts: 1000, blockNumber: 10, transactionIndex: 2, logIndex: 3 })
    const omittedZeros = normalizePerplTrade(rawTrade({ at: { b: 10, t: 1000, txid: hash }, sd: 1 }), market)
    expect(omittedZeros).toMatchObject({ side: 'buy', transactionIndex: 0, logIndex: 0 })
    expect(omittedZeros.notional).toBeCloseTo(83500.3 * 0.00473)
  })

  it.each([{ p: null }, { p: Infinity }, { s: -1 }, { s: 0 }, { sd: 0 }, { at: { t: 1000 } }, { at: { b: 1, tx: 1 } }])('rejects malformed trade %j', (patch) => {
    expect(normalizePerplTrade(rawTrade(patch), normalizePerplContext(context())[0].market)).toBeNull()
  })

  it('uses actual block/transaction/log identity when the provider omits a transaction hash', () => {
    const trade = normalizePerplTrade(rawTrade({ at: { b: 20, tx: 2, l: 1, t: 2000 } }), normalizePerplContext(context())[0].market)
    expect(trade).toMatchObject({ id: 'perpl:1:20:2:1', hash: null })
  })
})

describe('Perpl bounded public tape', () => {
  it('maps acknowledged subscription IDs and deduplicates reconnect snapshots against real updates', () => {
    const store = readyStore()
    store.applyFrame({ mt: 17, sid: 77, d: [rawTrade()] })
    store.applyFrame({ mt: 18, sid: 77, d: [rawTrade(), rawTrade({ at: { b: 11, t: 1100, tx: 1, l: 0 } })] })
    store.resetSubscriptions()
    store.applyFrame({ mt: 6, subs: [{ stream: 'trades@1', sid: 99, status: { code: 0 } }] })
    store.applyFrame({ mt: 17, sid: 99, d: [rawTrade()] })
    expect(store.snapshot().trades).toHaveLength(2)
    expect(store.snapshot().trades[0].ts).toBe(1100)
  })

  it('does not mutate a previously published tape', () => {
    const store = readyStore()
    store.applyFrame({ mt: 17, sid: 77, d: [rawTrade()] })
    const previous = store.snapshot().trades
    Object.freeze(previous)
    store.applyFrame({ mt: 18, sid: 77, d: [rawTrade({ at: { b: 11, t: 1100 } })] })
    expect(previous).toHaveLength(1)
    expect(store.snapshot().trades).toHaveLength(2)
  })

  it('retains only the newest 600 rows and cannot be expanded by old snapshots', () => {
    const store = readyStore()
    const d = Array.from({ length: 800 }, (_, index) => rawTrade({ at: { b: index + 1, t: index + 1, tx: 0, l: 0 } }))
    store.applyFrame({ mt: 17, sid: 77, d })
    store.applyFrame({ mt: 17, sid: 77, d: d.slice(0, 100) })
    expect(store.snapshot().trades).toHaveLength(600)
    expect(store.snapshot().trades[0].blockNumber).toBe(800)
    expect(store.snapshot().trades.at(-1).blockNumber).toBe(201)
  })

  it('ignores unknown markets and old state while updating the same funding event timestamp', () => {
    const store = readyStore()
    store.applyFrame({ mt: 9, d: { 1: { at: { b: 9, t: 800 }, lst: 1 }, 30: { at: { b: 20, t: 2000 }, lst: 10 } } })
    store.applyFrame({ mt: 10, d: { 1: { at: { b: 9, t: 950 }, feb: 9, rate: 40 } } })
    expect(store.snapshot().markets).toHaveLength(1)
    expect(store.snapshot().markets[0]).toMatchObject({ lastPrice: 83500.3, fundingAt: 950 })
  })

  it('surfaces failed stream subscriptions without assigning them a market', () => {
    const store = readyStore()
    expect(store.applyFrame({ mt: 6, subs: [{ stream: 'trades@1', sid: 999, status: { code: 429 } }] }).error).toContain('429')
    expect(store.applyFrame({ mt: 18, sid: 999, d: [rawTrade()] }).received).toBe(false)
    expect(store.snapshot().trades).toEqual([])
  })

  it('refreshes config without rewinding newer live state or funding to cached context', () => {
    const store = readyStore()
    store.applyFrame({ mt: 9, d: { 1: { at: { b: 12, t: 1200 }, lst: 836000, oi: 600000 } } })
    store.applyFrame({ mt: 10, d: { 1: { at: { b: 11, t: 1100 }, feb: 11, rate: -40 } } })
    const cached = context()
    cached.markets[0].name = 'Bitcoin'
    cached.markets[0].funding_interval_sec = 3000
    store.setContext(cached)
    expect(store.snapshot().markets[0]).toMatchObject({ name: 'Bitcoin', lastPrice: 83600, openInterestBase: 6, updatedAt: 1200, fundingBlock: 11, fundingAt: 1100, fundingRatePct: -0.004, fundingIntervalSeconds: 3000 })
  })

  it('accepts newer context state and funding instead of retaining old live values', () => {
    const store = readyStore()
    const latest = context()
    latest.markets[0].state = { at: { b: 13, t: 1300 }, lst: 837000 }
    latest.markets[0].funding = { at: { b: 12, t: 1200 }, feb: 12, rate: -20 }
    store.setContext(latest)
    expect(store.snapshot().markets[0]).toMatchObject({ lastPrice: 83700, updatedAt: 1300, fundingBlock: 12, fundingAt: 1200, fundingRatePct: -0.002 })
  })

  it.each(['price', 'size', 'collateral'])('does not reuse raw state/funding after %s decimals change', (kind) => {
    const store = readyStore()
    store.applyFrame({ mt: 9, d: { 1: { at: { b: 12, t: 1200 }, lst: 836000, oi: 600000 } } })
    store.applyFrame({ mt: 10, d: { 1: { at: { b: 11, t: 1100 }, feb: 11, rate: -40 } } })
    const changed = context()
    if (kind === 'price') changed.markets[0].config.price_decimals = 2
    if (kind === 'size') changed.markets[0].config.size_decimals = 4
    if (kind === 'collateral') changed.tokens[0].decimals = 8
    store.setContext(changed)
    expect(store.snapshot().markets[0]).toMatchObject({ updatedAt: 1000, fundingBlock: 9, fundingAt: 900, fundingRatePct: 0.004 })
    expect(store.snapshot().markets[0].lastPrice).toBe(kind === 'price' ? 8350.03 : 83500.3)
  })
})

function setupFeed(options = {}) {
  const sources = []
  const changes = []
  const fetchImpl = options.fetchImpl || vi.fn(async () => ({ ok: true, json: async () => context() }))
  const feed = createPerplMarketFeed({ now: () => 5000, ...options, fetchImpl,
    onChange: (state) => changes.push(state),
    createEventSource: (url) => { const source = { url, close: vi.fn(), handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn } }; sources.push(source); return source },
  })
  return { feed, sources, changes, fetchImpl }
}

describe('Perpl SSE lifecycle', () => {
  it('opens only after valid context, marks actual frames live, and preserves data through reconnect errors', async () => {
    const { feed, sources, fetchImpl } = setupFeed()
    feed.setActive(true)
    await flush()
    expect(fetchImpl).toHaveBeenCalledWith('/api/perpl-context', expect.objectContaining({ credentials: 'omit' }))
    const source = sources[0]
    expect(source.url).toBe('/api/perpl-stream')
    source.onopen()
    expect(feed.snapshot().status).toBe('connecting')
    source.onmessage({ data: JSON.stringify(ack) })
    source.onmessage({ data: JSON.stringify({ mt: 17, sid: 77, d: [rawTrade()] }) })
    expect(feed.snapshot()).toMatchObject({ status: 'live', lastMessageAt: 5000 })
    source.onerror()
    expect(feed.snapshot().status).toBe('reconnecting')
    expect(feed.snapshot().trades).toHaveLength(1)
    expect(sources).toHaveLength(1)
    feed.dispose()
    expect(source.close).toHaveBeenCalledTimes(1)
  })

  it('closes hidden/inactive streams and rejects their late frames without clearing prior data', async () => {
    const { feed, sources } = setupFeed()
    feed.setActive(true)
    await flush()
    const old = sources[0]
    old.onmessage({ data: JSON.stringify(ack) })
    old.onmessage({ data: JSON.stringify({ mt: 17, sid: 77, d: [rawTrade()] }) })
    feed.setActive(false)
    old.onmessage({ data: JSON.stringify({ mt: 18, sid: 77, d: [rawTrade({ at: { b: 20, t: 2000 } })] }) })
    expect(feed.snapshot().status).toBe('paused')
    expect(feed.snapshot().trades).toHaveLength(1)
    expect(old.close).toHaveBeenCalledTimes(1)
    feed.setActive(true)
    await flush()
    expect(sources).toHaveLength(2)
    feed.dispose()
  })

  it('aborts pending context and prevents a late result from creating a stream', async () => {
    let resolve
    const { feed, sources, fetchImpl } = setupFeed({ fetchImpl: vi.fn(() => new Promise((done) => { resolve = done })) })
    feed.setActive(true)
    await flush()
    feed.setActive(false)
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true)
    resolve({ ok: true, json: async () => context() })
    await flush()
    expect(sources).toHaveLength(0)
    expect(feed.snapshot().status).toBe('paused')
    feed.dispose()
  })

  it('does not send requests for an abandoned StrictMode mount', async () => {
    const { feed, sources, fetchImpl } = setupFeed()
    feed.setActive(true)
    feed.dispose()
    await flush()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(sources).toHaveLength(0)
  })

  it('keeps configuration errors honest and lets explicit retry replace the attempt', async () => {
    const { feed, sources, fetchImpl } = setupFeed({ fetchImpl: vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValue({ ok: true, json: async () => context() }) })
    feed.setActive(true)
    await flush()
    expect(feed.snapshot()).toMatchObject({ status: 'error', lastMessageAt: null })
    expect(sources).toHaveLength(0)
    feed.retry()
    await flush()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(sources).toHaveLength(1)
    feed.dispose()
  })

  it('refreshes relay context on reconnect without clearing or duplicating verified trades', async () => {
    const { feed, sources } = setupFeed()
    feed.setActive(true)
    await flush()
    const source = sources[0]
    source.onmessage({ data: JSON.stringify(ack) })
    source.onmessage({ data: JSON.stringify({ mt: 17, sid: 77, d: [rawTrade()] }) })
    const updated = context()
    updated.markets[0].funding.rate = -40
    source.onopen()
    source.handlers.context({ data: JSON.stringify(updated) })
    source.onmessage({ data: JSON.stringify(ack) })
    source.onmessage({ data: JSON.stringify({ mt: 17, sid: 77, d: [rawTrade()] }) })
    expect(feed.snapshot().markets[0].fundingRatePct).toBe(-0.004)
    expect(feed.snapshot().trades).toHaveLength(1)
    source.handlers.context({ data: '{bad json' })
    expect(feed.snapshot().status).toBe('partial')
    expect(feed.snapshot().trades).toHaveLength(1)
    feed.dispose()
  })

  it('marks a silent open stream stale and recovers on the next valid data frame', async () => {
    vi.useFakeTimers()
    let now = 1000
    const { feed, sources } = setupFeed({ now: () => now })
    feed.setActive(true)
    await flush()
    const source = sources[0]
    const update = { mt: 9, d: { 1: { at: { b: 11, t: 1100 }, lst: 835005 } } }
    source.onmessage({ data: JSON.stringify(update) })
    now = 22_000
    await vi.advanceTimersByTimeAsync(5_000)
    expect(feed.snapshot().status).toBe('stale')
    source.onmessage({ data: JSON.stringify(update) })
    expect(feed.snapshot()).toMatchObject({ status: 'live', lastMessageAt: 22_000 })
    feed.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('times out context fetches and cleans up the timer', async () => {
    vi.useFakeTimers()
    const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    })
    const { feed, sources } = setupFeed({ fetchImpl, contextTimeoutMs: 100 })
    feed.setActive(true)
    await flush()
    await vi.advanceTimersByTimeAsync(100)
    expect(feed.snapshot()).toMatchObject({ status: 'error', error: 'Perpl market configuration timed out. Retrying…' })
    expect(sources).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(1)
    feed.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps relay renewal separate from provider data freshness', async () => {
    const { feed, sources } = setupFeed()
    feed.setActive(true)
    await flush()
    sources[0].handlers['relay-status']({ data: JSON.stringify({ status: 'reconnecting', message: 'Renewing stream' }) })
    expect(feed.snapshot()).toMatchObject({ status: 'reconnecting', error: 'Renewing stream', lastMessageAt: null })
    feed.dispose()
  })

  it('retries unavailable context at bounded 5/15/30 second intervals without opening duplicate streams', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    const { feed, sources } = setupFeed({ fetchImpl })
    feed.setActive(true)
    await flush()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    for (const [delay, count] of [[5000, 2], [15000, 3], [30000, 4], [30000, 5]]) {
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(fetchImpl).toHaveBeenCalledTimes(count - 1)
      await vi.advanceTimersByTimeAsync(1)
      expect(fetchImpl).toHaveBeenCalledTimes(count)
    }
    expect(sources).toHaveLength(0)
    fetchImpl.mockResolvedValue({ ok: true, json: async () => context() })
    await vi.advanceTimersByTimeAsync(30000)
    expect(sources).toHaveLength(1)
    const count = fetchImpl.mock.calls.length
    sources[0].onerror()
    await vi.advanceTimersByTimeAsync(30000)
    expect(fetchImpl).toHaveBeenCalledTimes(count)
    expect(sources).toHaveLength(1)
    feed.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels pending context retries when hidden or disposed and resets backoff on manual retry', async () => {
    vi.useFakeTimers()
    const { feed, fetchImpl } = setupFeed({ fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 502 }) })
    feed.setActive(true)
    await flush()
    feed.setActive(false)
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    feed.setActive(true)
    await flush()
    feed.retry()
    await flush()
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    feed.dispose()
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    expect(vi.getTimerCount()).toBe(0)
  })
})
