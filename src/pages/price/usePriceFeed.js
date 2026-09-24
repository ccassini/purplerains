import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { UI_FLUSH_MS } from './constants'
import { createPriceFeedSockets } from './priceFeedSockets'
import { VENUES, fetchDexscreener, resolveBinanceSymbol } from './venues'

const TICKER_POLL_MS = 15_000
const DEX_POLL_MS = 30_000
const TAPE_BUFFER = 240
const TAPE_VISIBLE = 120
/** Exchange clocks drift; pin timestamps near "now" so the tape never reads stale. */
const TS_BEHIND_TOLERANCE_MS = 900
const TS_AHEAD_TOLERANCE_MS = 300
/** Smoothing on the trades-per-second readout. */
const TPS_SMOOTH_ALPHA = 0.35

const WS_VENUES = VENUES.filter((v) => v.type === 'ws')

function buildInitialSources() {
  const init = {}
  VENUES.forEach((v) => {
    init[v.key] = {
      key: v.key,
      label: v.label,
      status: 'connecting',
      last: null,
      change: null,
      volume: null,
      symbol: null,
    }
  })
  return init
}

/**
 * Multi-venue MON price feed.
 *
 * The realtime path is deliberately ref-based: every websocket message writes
 * `lastPriceRef` synchronously (that ref is what the 100ms chart loop samples,
 * so chart motion stays at exchange resolution) while React state is batched on
 * a `UI_FLUSH_MS` timer so a busy tape cannot flood the reconciler.
 *
 * @param {{ soundRef?: React.MutableRefObject<((notional: number) => void) | null> }} [options]
 */
export function usePriceFeed({ soundRef } = {}) {
  const [symbol, setSymbol] = useState(null)
  const [lastPrice, setLastPrice] = useState(null)
  const [trades, setTrades] = useState([])
  const [sources, setSources] = useState(buildInitialSources)
  const [feedRate, setFeedRate] = useState({ tps: 0, lagMs: null })

  const lastPriceRef = useRef(null)
  const socketFeedRef = useRef(null)

  // Batched UI state — the chart never waits on these.
  const tradesBufferRef = useRef([])
  const uiFlushRef = useRef({ timer: null })
  const pendingLastPriceUiRef = useRef(null)

  // Feed telemetry, sampled once per second (never per trade).
  const tradeCountRef = useRef(0)
  const lagSumRef = useRef(0)
  const lagCountRef = useRef(0)

  const flushUi = useCallback(() => {
    uiFlushRef.current.timer = null
    setTrades(tradesBufferRef.current.slice(0, TAPE_VISIBLE))
    if (Number.isFinite(pendingLastPriceUiRef.current)) {
      setLastPrice(pendingLastPriceUiRef.current)
    }
  }, [])

  useEffect(() => {
    const ui = uiFlushRef.current
    return () => {
      if (ui.timer) window.clearTimeout(ui.timer)
      ui.timer = null
    }
  }, [])

  const updateSource = useCallback((key, patch) => {
    setSources((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }))
  }, [])

  const pushTrade = useCallback((venueKey, price, qty, time, side, affectsChart = true) => {
    if (!Number.isFinite(price)) return
    const now = Date.now()
    const tsRaw = Number.isFinite(time) ? time : now
    const ts = Math.max(now - TS_BEHIND_TOLERANCE_MS, Math.min(now + TS_AHEAD_TOLERANCE_MS, tsRaw))

    const safeQty = Number.isFinite(qty) ? qty : 0
    const trade = { t: ts, p: price, q: safeQty, side, venue: venueKey }
    tradesBufferRef.current = [trade, ...tradesBufferRef.current].slice(0, TAPE_BUFFER)
    if (!affectsChart) return

    // Realtime path: the chart loop reads this ref, not React state.
    lastPriceRef.current = price
    pendingLastPriceUiRef.current = price
    soundRef?.current?.(price * safeQty)

    tradeCountRef.current += 1
    const lag = now - tsRaw
    if (lag >= 0 && lag < 10_000) {
      lagSumRef.current += lag
      lagCountRef.current += 1
    }

    if (!uiFlushRef.current.timer) {
      uiFlushRef.current.timer = window.setTimeout(flushUi, UI_FLUSH_MS)
    }
  }, [flushUi, soundRef])

  // Sample feed telemetry on a 1s cadence so it costs nothing per trade. The
  // rate is smoothed because raw per-second counts on a thin market swing
  // between 0 and 5, which reads as a broken counter rather than a live one.
  useEffect(() => {
    const smoothedRef = { current: null }
    const id = window.setInterval(() => {
      const sampled = tradeCountRef.current
      const lagMs = lagCountRef.current ? Math.round(lagSumRef.current / lagCountRef.current) : null
      tradeCountRef.current = 0
      lagSumRef.current = 0
      lagCountRef.current = 0

      smoothedRef.current = smoothedRef.current === null
        ? sampled
        : smoothedRef.current + (sampled - smoothedRef.current) * TPS_SMOOTH_ALPHA
      const tps = Math.round(smoothedRef.current * 10) / 10

      setFeedRate((prev) => (prev.tps === tps && prev.lagMs === lagMs ? prev : { tps, lagMs }))
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    resolveBinanceSymbol().then((s) => {
      if (!cancelled) setSymbol(s)
    })
    return () => { cancelled = true }
  }, [])

  // 24h ticker snapshots for venues that expose one.
  useEffect(() => {
    if (!symbol) return () => {}
    let cancelled = false
    const timers = []

    WS_VENUES.forEach((venue) => {
      if (typeof venue.fetch24h !== 'function' || typeof venue.mapTicker !== 'function') return
      const fetch24h = async () => {
        const targetSymbol = venue.mapSymbol ? venue.mapSymbol(symbol) : symbol
        if (!targetSymbol) {
          updateSource(venue.key, { symbol: null })
          return
        }
        try {
          const raw = await venue.fetch24h(targetSymbol)
          if (cancelled || !raw) return
          const mapped = venue.mapTicker(raw)
          updateSource(venue.key, {
            last: Number.isFinite(mapped.price) ? mapped.price : null,
            change: Number.isFinite(mapped.change) ? mapped.change : null,
            volume: Number.isFinite(mapped.volume) ? mapped.volume : null,
            symbol: targetSymbol,
          })
          if (Number.isFinite(mapped.price) && !Number.isFinite(lastPriceRef.current)) {
            lastPriceRef.current = mapped.price
            setLastPrice(mapped.price)
          }
        } catch {
          // Ticker REST failures are non-fatal — the WS may still be live, and
          // CORS behaviour differs per venue.
        }
      }
      fetch24h()
      timers.push(window.setInterval(fetch24h, TICKER_POLL_MS))
    })

    return () => {
      cancelled = true
      timers.forEach((id) => window.clearInterval(id))
    }
  }, [symbol, updateSource])

  // REST-only source (DexScreener) — also seeds the chart clock if WS venues lag.
  useEffect(() => {
    let cancelled = false
    const runDex = async () => {
      try {
        updateSource('dexscreener', { status: 'connecting' })
        const data = await fetchDexscreener()
        if (cancelled) return
        if (!data) {
          updateSource('dexscreener', { status: 'fallback' })
          return
        }
        updateSource('dexscreener', {
          status: 'live',
          last: data.price,
          change: data.change,
          volume: data.volume,
        })
        if (Number.isFinite(data.price) && !Number.isFinite(lastPriceRef.current)) {
          lastPriceRef.current = data.price
          pendingLastPriceUiRef.current = data.price
          if (!uiFlushRef.current.timer) {
            uiFlushRef.current.timer = window.setTimeout(flushUi, 0)
          }
        }
      } catch {
        if (!cancelled) updateSource('dexscreener', { status: 'fallback' })
      }
    }

    runDex()
    const dexTimer = window.setInterval(runDex, DEX_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(dexTimer)
    }
  }, [flushUi, updateSource])

  // Each mounted Price view owns a separate connection lifecycle.
  useEffect(() => {
    if (!symbol) return undefined
    const feed = createPriceFeedSockets({ venues: WS_VENUES, symbol, updateSource, pushTrade })
    socketFeedRef.current = feed
    return () => {
      feed.dispose()
      if (socketFeedRef.current === feed) socketFeedRef.current = null
    }
  }, [symbol, pushTrade, updateSource])

  const reconnectAll = useCallback(() => {
    socketFeedRef.current?.reconnectAll()
  }, [])

  const aggregated = useMemo(() => {
    const list = VENUES
      .map((v) => ({ key: v.key, ...sources[v.key] || {} }))
      .filter((s) => Number.isFinite(s.last))

    if (!list.length) {
      return { price: lastPrice ?? null, change: null, volume: null, liveCount: 0, best: null }
    }

    const volSum = list.reduce((sum, s) => sum + (Number.isFinite(s.volume) ? s.volume : 0), 0)
    const price = volSum > 0
      ? list.reduce((sum, s) => sum + s.last * (Number.isFinite(s.volume) ? s.volume : 0), 0) / volSum
      : list.reduce((sum, s) => sum + s.last, 0) / list.length

    const changeList = list.filter((s) => Number.isFinite(s.change))
    const change = changeList.length
      ? changeList.reduce((sum, s) => sum + s.change, 0) / changeList.length
      : null

    const best = list.reduce((cur, s) => {
      if (!cur) return s
      const curVol = Number.isFinite(cur.volume) ? cur.volume : 0
      const vol = Number.isFinite(s.volume) ? s.volume : 0
      return vol > curVol ? s : cur
    }, null)

    return { price, change, volume: volSum || null, liveCount: list.length, best }
  }, [sources, lastPrice])

  const spread = useMemo(() => {
    const quoted = Object.values(sources).filter((s) => Number.isFinite(s.last))
    if (quoted.length < 2) return null
    let lo = quoted[0]
    let hi = quoted[0]
    quoted.forEach((s) => {
      if (s.last < lo.last) lo = s
      if (s.last > hi.last) hi = s
    })
    if (lo.last <= 0) return null
    return {
      min: lo.last,
      max: hi.last,
      minVenue: lo.label,
      maxVenue: hi.label,
      pct: ((hi.last - lo.last) / lo.last) * 100,
      count: quoted.length,
    }
  }, [sources])

  const liveCount = useMemo(
    () => Object.values(sources).filter((s) => s.status === 'live').length,
    [sources],
  )

  return {
    symbol,
    sources,
    trades,
    lastPrice,
    lastPriceRef,
    aggregated,
    spread,
    liveCount,
    venueCount: VENUES.length,
    feedRate,
    reconnectAll,
  }
}
