const MAX_TRADES = 600
const CHAIN_ID = 143

function numeric(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function integer(value, minimum = 0) {
  const number = numeric(value)
  return Number.isSafeInteger(number) && number >= minimum ? number : null
}

function decimals(value) {
  const number = integer(value)
  return number !== null && number <= 36 ? number : null
}

function scaled(value, places, positive = false) {
  const number = numeric(value)
  if (number === null || places === null || number < 0 || (positive && number === 0)) return null
  const result = number / 10 ** places
  return Number.isFinite(result) ? result : null
}

function timestamp(at) { return integer(at?.t, 1) }
function product(a, b) { return a !== null && b !== null && Number.isFinite(a * b) ? a * b : null }

function marketView(raw, collateral) {
  const config = raw.config || {}
  const state = raw.state || {}
  const funding = raw.funding || {}
  const priceDecimals = decimals(config.price_decimals)
  const sizeDecimals = decimals(config.size_decimals)
  const collateralDecimals = decimals(collateral?.decimals)
  const lastPrice = scaled(state.lst, priceDecimals, true)
  const previous = scaled(state.prv, priceDecimals, true)
  const markPrice = scaled(state.mrk, priceDecimals, true)
  const openInterestBase = scaled(state.oi, sizeDecimals)
  const fundingRate = numeric(funding.rate)
  return {
    id: raw.id,
    symbol: String(raw.symbol || raw.size_units || raw.name || `Market ${raw.id}`),
    name: String(raw.name || raw.size_units || raw.symbol || `Market ${raw.id}`),
    priceDecimals,
    sizeDecimals,
    collateralSymbol: collateral?.symbol || null,
    lastPrice,
    markPrice,
    indexPrice: scaled(state.orl, priceDecimals, true),
    bid: scaled(state.bid, priceDecimals, true),
    ask: scaled(state.ask, priceDecimals, true),
    change24hPct: lastPrice !== null && previous !== null ? (lastPrice / previous - 1) * 100 : null,
    volume24h: scaled(state.dva, collateralDecimals),
    volume24hBase: scaled(state.dv, sizeDecimals),
    openInterestBase,
    openInterestNotional: product(openInterestBase, markPrice),
    tvl: scaled(state.tvl, collateralDecimals),
    fundingRatePct: fundingRate === null ? null : fundingRate / 10_000,
    fundingIntervalSeconds: integer(raw.funding_interval_sec, 1),
    updatedAt: timestamp(state.at),
    fundingAt: timestamp(funding.at),
    fundingBlock: integer(funding.feb),
    isOpen: config.is_open !== false,
  }
}

export function normalizePerplContext(context) {
  if (Number(context?.chain?.chain_id) !== CHAIN_ID) throw new Error('Perpl did not return Monad mainnet data')
  if (!Array.isArray(context.markets)) throw new Error('Perpl market configuration is unavailable')
  const tokens = new Map((context.tokens || []).map((token) => [token.id, token]))
  const instances = new Map((context.instances || []).map((instance) => [instance.id, instance]))
  const seen = new Set()
  return context.markets.flatMap((raw) => {
    const id = integer(raw?.id, 1)
    if (id === null || seen.has(id) || decimals(raw.config?.price_decimals) === null || decimals(raw.config?.size_decimals) === null) return []
    seen.add(id)
    const collateral = tokens.get(instances.get(raw.instance_id)?.collateral_token_id)
    return [{ raw: { ...raw, id }, collateral, market: marketView({ ...raw, id }, collateral) }]
  })
}

export function normalizePerplTrade(raw, market) {
  if (!market) return null
  const price = scaled(raw?.p, market.priceDecimals, true)
  const size = scaled(raw?.s, market.sizeDecimals, true)
  const ts = timestamp(raw?.at)
  if (price === null || size === null || ts === null || ![1, 2].includes(raw.sd)) return null
  const hashText = typeof raw.at.txid === 'string' ? raw.at.txid.replace(/^0x/i, '') : ''
  const hash = /^[a-f\d]{64}$/i.test(hashText) ? `0x${hashText.toLowerCase()}` : null
  const blockNumber = integer(raw.at.b)
  // Perpl omits zero-valued Go timestamp fields, including tx and l.
  const transactionIndex = integer(raw.at.tx ?? 0)
  const logIndex = integer(raw.at.l ?? 0)
  if (logIndex === null || (!hash && (blockNumber === null || transactionIndex === null))) return null
  const identity = hash || `${blockNumber}:${transactionIndex}`
  return {
    id: `perpl:${market.id}:${identity}:${logIndex}`,
    marketId: market.id,
    symbol: market.symbol,
    collateralSymbol: market.collateralSymbol,
    side: raw.sd === 1 ? 'buy' : 'sell',
    price,
    size,
    notional: product(price, size),
    ts,
    hash,
    blockNumber,
    transactionIndex,
    logIndex,
    source: 'perpl',
  }
}

function compareTrades(a, b) {
  return b.ts - a.ts || (b.blockNumber ?? 0) - (a.blockNumber ?? 0) || (b.transactionIndex ?? 0) - (a.transactionIndex ?? 0) || (b.logIndex ?? 0) - (a.logIndex ?? 0) || a.id.localeCompare(b.id)
}

function newerMarketRecord(previous, incoming, key) {
  const before = previous?.[key]
  const next = incoming?.[key]
  const beforeBlock = integer(key === 'funding' ? before?.feb : before?.at?.b)
  const nextBlock = integer(key === 'funding' ? next?.feb : next?.at?.b)
  if (beforeBlock === null) return false
  if (nextBlock === null || beforeBlock > nextBlock) return true
  return beforeBlock === nextBlock && (timestamp(before?.at) ?? 0) > (timestamp(next?.at) ?? 0)
}

/** Retains verified market metadata and a bounded, deduplicated public tape. */
export function createPerplMarketStore({ capacity = MAX_TRADES } = {}) {
  const cap = Math.max(1, Math.min(MAX_TRADES, integer(capacity, 1) ?? MAX_TRADES))
  let records = new Map()
  let markets = []
  let trades = []
  let tradeIds = new Set()
  const subscriptions = new Map()
  let subscriptionError = null
  const refreshMarkets = () => { markets = [...records.values()].map((record) => record.market) }

  return {
    setContext(context) {
      const normalized = normalizePerplContext(context)
      if (!normalized.length) throw new Error('Perpl returned no usable market configuration')
      for (const record of normalized) {
        const previous = records.get(record.market.id)
        const compatible = previous &&
          previous.market.priceDecimals === record.market.priceDecimals &&
          previous.market.sizeDecimals === record.market.sizeDecimals &&
          decimals(previous.collateral?.decimals) === decimals(record.collateral?.decimals) &&
          previous.collateral?.id === record.collateral?.id &&
          previous.collateral?.address?.toLowerCase() === record.collateral?.address?.toLowerCase() &&
          previous.raw.config?.funding_sum_scaling_exp === record.raw.config?.funding_sum_scaling_exp
        if (!compatible) continue
        // Relay context is cached; it must not rewind newer stream observations.
        // Raw observations are reusable only while their unit definitions agree.
        for (const key of ['state', 'funding']) {
          if (newerMarketRecord(previous.raw, record.raw, key)) record.raw[key] = previous.raw[key]
        }
        record.market = marketView(record.raw, record.collateral)
      }
      records = new Map(normalized.map((record) => [record.market.id, record]))
      refreshMarkets()
      trades = trades.filter((trade) => records.has(trade.marketId))
      tradeIds = new Set(trades.map((trade) => trade.id))
    },
    resetSubscriptions() { subscriptions.clear(); subscriptionError = null },
    applyFrame(frame) {
      if (!frame || typeof frame !== 'object') return { changed: false, received: false }
      if (frame.mt === 6 && Array.isArray(frame.subs)) {
        for (const sub of frame.subs) {
          if (sub.status?.code && sub.status.code !== 0) {
            subscriptionError = `Perpl could not subscribe to ${String(sub.stream)} (${sub.status.code})`
            continue
          }
          const match = /^trades@(\d+)$/.exec(sub.stream || '')
          if (match && integer(sub.sid) !== null && records.has(Number(match[1]))) subscriptions.set(sub.sid, Number(match[1]))
        }
        return { changed: false, received: false, error: subscriptionError }
      }
      if ([9, 10].includes(frame.mt) && frame.d && typeof frame.d === 'object' && !Array.isArray(frame.d)) {
        let changed = false
        for (const [id, update] of Object.entries(frame.d)) {
          const record = records.get(Number(id))
          if (!record || !update || typeof update !== 'object') continue
          const key = frame.mt === 9 ? 'state' : 'funding'
          const previous = record.raw[key] || {}
          const oldBlock = integer(frame.mt === 10 ? previous.feb : previous.at?.b)
          const newBlock = integer(frame.mt === 10 ? update.feb : update.at?.b)
          if (oldBlock !== null && newBlock !== null && newBlock < oldBlock) continue
          record.raw = { ...record.raw, [key]: { ...previous, ...update } }
          record.market = marketView(record.raw, record.collateral)
          changed = true
        }
        if (changed) refreshMarkets()
        return { changed, received: changed, error: subscriptionError }
      }
      if ([17, 18].includes(frame.mt) && Array.isArray(frame.d)) {
        const market = records.get(subscriptions.get(frame.sid))?.market
        if (!market) return { changed: false, received: false }
        let changed = false
        const additions = []
        for (const raw of frame.d) {
          const trade = normalizePerplTrade(raw, market)
          if (!trade || tradeIds.has(trade.id)) continue
          additions.push(trade)
          tradeIds.add(trade.id)
          changed = true
        }
        if (changed) {
          trades = [...trades, ...additions].sort(compareTrades).slice(0, cap)
          tradeIds = new Set(trades.map((trade) => trade.id))
        }
        return { changed, received: true, error: subscriptionError }
      }
      return { changed: false, received: false }
    },
    snapshot() { return { markets, trades } },
  }
}

/** EventSource owns reconnect timing; this controller owns teardown and publication. */
export function createPerplMarketFeed({
  onChange,
  fetchImpl = (...args) => fetch(...args),
  createEventSource = (url) => new EventSource(url),
  now = Date.now,
  contextUrl = '/api/perpl-context',
  streamUrl = '/api/perpl-stream',
  contextTimeoutMs = 12_000,
  staleAfterMs = 20_000,
} = {}) {
  const store = createPerplMarketStore()
  let state = { ...store.snapshot(), status: 'paused', error: null, lastMessageAt: null }
  let active = false
  let disposed = false
  let generation = 0
  let source = null
  let controller = null
  let timeout = null
  let watchdog = null
  let retryTimer = null
  let contextFailures = 0
  const publish = (patch = {}) => {
    if (disposed) return
    state = { ...state, ...store.snapshot(), ...patch }
    onChange?.(state)
  }
  const close = () => {
    generation += 1
    controller?.abort()
    controller = null
    if (timeout !== null) clearTimeout(timeout)
    timeout = null
    if (watchdog !== null) clearInterval(watchdog)
    watchdog = null
    if (retryTimer !== null) clearTimeout(retryTimer)
    retryTimer = null
    source?.close()
    source = null
  }
  const start = async () => {
    close()
    const current = generation
    const valid = () => !disposed && active && current === generation
    publish({ status: 'connecting', error: null })
    const requestController = new AbortController()
    controller = requestController
    let timedOut = false
    timeout = setTimeout(() => { timedOut = true; requestController.abort() }, contextTimeoutMs)
    try {
      // Let a StrictMode cleanup cancel an abandoned initial connection.
      await Promise.resolve()
      if (!valid()) return
      const response = await fetchImpl(contextUrl, { signal: requestController.signal, credentials: 'omit', cache: 'no-store' })
      if (!valid()) return
      if (!response.ok) throw new Error(`Perpl market data is temporarily unavailable (${response.status})`)
      const context = await response.json()
      if (!valid()) return
      store.setContext(context)
      contextFailures = 0
      clearTimeout(timeout)
      timeout = null
      controller = null
      publish()
      const events = createEventSource(streamUrl)
      source = events
      watchdog = setInterval(() => {
        if (valid() && ['live', 'partial'].includes(state.status) && state.lastMessageAt !== null && now() - state.lastMessageAt > staleAfterMs) {
          publish({ status: 'stale', error: 'Waiting for fresh Perpl market data…' })
        }
      }, 5_000)
      events.onopen = () => {
        if (!valid()) return
        store.resetSubscriptions()
        publish({ status: 'connecting', error: null })
      }
      events.onmessage = (event) => {
        if (!valid()) return
        let frame
        try { frame = JSON.parse(event.data) } catch { return }
        const result = store.applyFrame(frame)
        if (result.received) publish({ status: result.error ? 'partial' : 'live', error: result.error || null, lastMessageAt: now() })
        else if (result.error) publish({ status: 'partial', error: result.error })
      }
      events.onerror = () => {
        if (valid()) publish({ status: 'reconnecting', error: 'Perpl connection interrupted. Reconnecting…' })
      }
      events.addEventListener?.('context', (event) => {
        if (!valid()) return
        try {
          store.setContext(JSON.parse(event.data))
          publish()
        } catch {
          publish({ status: 'partial', error: 'Perpl sent an invalid market configuration; retaining the last verified data.' })
        }
      })
      events.addEventListener?.('relay-status', (event) => {
        if (!valid()) return
        let info
        try { info = JSON.parse(event.data) } catch { return }
        publish({ status: 'reconnecting', error: typeof info.message === 'string' ? info.message : 'Perpl is reconnecting…' })
      })
    } catch (error) {
      if (valid()) {
        publish({ status: 'error', error: timedOut ? 'Perpl market configuration timed out. Retrying…' : error.message || 'Perpl market data is unavailable' })
        const delay = [5_000, 15_000, 30_000][Math.min(contextFailures++, 2)]
        retryTimer = setTimeout(() => { if (valid()) void start() }, delay)
      }
    } finally {
      if (valid()) {
        if (timeout !== null) clearTimeout(timeout)
        timeout = null
        controller = null
      }
    }
  }
  return {
    setActive(value) {
      const next = Boolean(value)
      if (disposed || next === active) return
      active = next
      if (active) { contextFailures = 0; void start() }
      else { close(); publish({ status: 'paused', error: null }) }
    },
    retry() { if (active && !disposed) { contextFailures = 0; void start() } },
    snapshot() { return state },
    dispose() { if (disposed) return; disposed = true; active = false; close() },
  }
}
