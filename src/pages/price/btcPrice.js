/**
 * BTC USD price helpers for the Price page header.
 * Kept separate from utils/priceApi.js (MON-only).
 */

import {
  BINANCE_SPOT_TICKER_24H,
  BINANCE_SPOT_TICKER_PRICE,
  BINANCE_SPOT_WS,
  BYBIT_BTC_TICKER,
  COINBASE_BTC_SPOT,
} from './constants'

async function fetchJson(url, timeoutMs = 6000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function asPrice(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Binance spot REST — primary */
async function fromBinanceSpot() {
  const data = await fetchJson(BINANCE_SPOT_TICKER_PRICE)
  return asPrice(data?.price)
}

/** Coinbase spot REST — fallback */
async function fromCoinbase() {
  const data = await fetchJson(COINBASE_BTC_SPOT)
  return asPrice(data?.data?.amount)
}

/** Bybit spot REST — fallback */
async function fromBybit() {
  const data = await fetchJson(BYBIT_BTC_TICKER)
  const row = data?.result?.list?.[0]
  return asPrice(row?.lastPrice)
}

/**
 * Resolve BTC/USD from the first working public REST source.
 * @returns {Promise<number|null>}
 */
export async function fetchBtcUsdPrice() {
  for (const fn of [fromBinanceSpot, fromCoinbase, fromBybit]) {
    try {
      const price = await fn()
      if (price != null) return price
    } catch {
      // try next
    }
  }
  return null
}

function asPercent(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Binance spot 24hr stats — primary for the change figure */
async function changeFromBinanceSpot() {
  const data = await fetchJson(BINANCE_SPOT_TICKER_24H)
  return asPercent(data?.priceChangePercent)
}

/** Bybit spot ticker reports the move as a fraction, not a percent */
async function changeFromBybit() {
  const data = await fetchJson(BYBIT_BTC_TICKER)
  const pct = asPercent(data?.result?.list?.[0]?.price24hPcnt)
  return pct === null ? null : pct * 100
}

/**
 * Resolve BTC's 24h move from the first working public REST source. Same
 * spot-only sourcing as {@link fetchBtcUsdPrice} — the futures ticker is
 * geo-blocked in the same regions as the futures stream.
 *
 * @returns {Promise<number|null>} percent change, or null if every source fails
 */
export async function fetchBtcUsdChange24h() {
  for (const fn of [changeFromBinanceSpot, changeFromBybit]) {
    try {
      const pct = await fn()
      if (pct != null) return pct
    } catch {
      // try next
    }
  }
  return null
}

/**
 * Optional live ticks via Binance spot WS (not futures — fewer geo blocks).
 * Calls onPrice(number) for each trade. Returns a cleanup function.
 */
export function subscribeBtcSpotTrades(onPrice) {
  let ws = null
  let closed = false
  let reconnectTimer = null
  let tries = 0

  const connect = () => {
    if (closed) return
    try {
      ws?.close()
    } catch {
      // ignore
    }

    try {
      ws = new WebSocket(`${BINANCE_SPOT_WS}/btcusdt@trade`)
    } catch {
      scheduleReconnect()
      return
    }

    ws.onmessage = (evt) => {
      try {
        if (typeof evt.data !== 'string') return
        const msg = JSON.parse(evt.data)
        const p = asPrice(msg?.p)
        if (p != null) {
          tries = 0
          onPrice(p)
        }
      } catch {
        // ignore bad frames
      }
    }

    ws.onopen = () => {
      tries = 0
    }

    ws.onerror = () => {
      try {
        ws?.close()
      } catch {
        // ignore
      }
    }

    ws.onclose = () => {
      if (!closed) scheduleReconnect()
    }
  }

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return
    tries += 1
    const delay = Math.min(400 * tries, 8000)
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  connect()

  return () => {
    closed = true
    if (reconnectTimer) window.clearTimeout(reconnectTimer)
    reconnectTimer = null
    try {
      ws?.close()
    } catch {
      // ignore
    }
    ws = null
  }
}
