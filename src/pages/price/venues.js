import {
  BINANCE_FAPI_EXCHANGE_INFO,
  BINANCE_FAPI_TICKER_24H,
  BINANCE_FSTREAM_WS,
  BYBIT_TICKER,
  BYBIT_WS,
  COINBASE_STATS,
  COINBASE_WS,
  BACKPACK_WS,
  DEFAULT_CANDIDATES,
  DEXSCREENER_API,
  GATE_WS,
  HYPERLIQUID_WS,
  KRAKEN_WS,
  LBANK_TICKER_24H,
  LBANK_WS,
  OKX_TICKER,
  OKX_WS,
} from './constants'
import {
  okxCtValCache,
  primeOkxCtVal,
  toBackpackSymbol,
  toCoinbaseProduct,
  toGateBase,
  toHyperliquidCoin,
  toKrakenSymbol,
  toLbankPair,
  toOkxInstId,
} from './symbolMaps'

export async function fetchCoinbaseStats(productId) {
  const res = await fetch(`${COINBASE_STATS}/${encodeURIComponent(productId)}/stats`)
  if (!res.ok) throw new Error(`cb ${res.status}`)
  return res.json()
}

export async function fetchBybitTicker(symbol) {
  const res = await fetch(`${BYBIT_TICKER}${encodeURIComponent(symbol)}`)
  if (!res.ok) throw new Error(`bybit ${res.status}`)
  return res.json()
}

export async function fetchLbank24h(pair) {
  const res = await fetch(`${LBANK_TICKER_24H}${encodeURIComponent(pair)}`)
  if (!res.ok) throw new Error(`lbank ${res.status}`)
  return res.json()
}

export async function resolveBinanceSymbol() {
  try {
    const res = await fetch(BINANCE_FAPI_EXCHANGE_INFO)
    if (!res.ok) throw new Error(`exchangeInfo ${res.status}`)
    const data = await res.json()
    const set = new Set((data.symbols || []).map(s => String(s.symbol).toUpperCase()))
    for (const c of DEFAULT_CANDIDATES) {
      if (set.has(c)) return c
    }
    const found = Array.from(set).find(s => s.startsWith('MON') && (s.endsWith('USDT') || s.endsWith('USDC')))
    return found || null
  } catch {
    return DEFAULT_CANDIDATES[0]
  }
}

export async function fetchDexscreener() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch(`${DEXSCREENER_API}/latest/dex/search?q=MON%20monad`, { signal: controller.signal })
    if (!res.ok) throw new Error(`dex ${res.status}`)
    const data = await res.json()
    const monadPairs = (data.pairs || []).filter(p =>
      p.chainId === 'monad' && (p.baseToken?.symbol === 'MON' || p.baseToken?.symbol === 'WMON')
    )
    if (monadPairs.length === 0) return null
    const best = monadPairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0]
    return {
      price: parseFloat(best.priceUsd) || null,
      change: best.priceChange?.h24 ?? null,
      volume: best.volume?.h24 ?? best.liquidity?.usd ?? null
    }
  } finally {
    clearTimeout(timer)
  }
}

export const VENUES = [
  {
    key: 'binanceFutures',
    label: 'Binance Futures',
    type: 'ws',
    color: '#a78bfa',
    buildStream: (symbol) => `${BINANCE_FSTREAM_WS}/${symbol.toLowerCase()}@aggTrade`,
    fetch24h: async (symbol) => {
      const res = await fetch(`${BINANCE_FAPI_TICKER_24H}?symbol=${encodeURIComponent(symbol)}`)
      if (!res.ok) throw new Error(`fapi ${res.status}`)
      return res.json()
    },
    mapTicker: (data) => ({
      price: Number(data.lastPrice),
      change: Number(data.priceChangePercent),
      volume: Number(data.quoteVolume)
    }),
    parseTrade: (msg) => {
      const p = Number(msg.p)
      const q = Number(msg.q)
      const t = Number(msg.T)
      const side = msg.m ? 'SELL' : 'BUY'
      if (!Number.isFinite(p) || !Number.isFinite(t)) return null
      return { price: p, qty: Number.isFinite(q) ? q : 0, time: t, side }
    }
  },
  {
    key: 'okxFutures',
    label: 'OKX Futures',
    type: 'ws',
    color: '#e5e7eb',
    mapSymbol: (s) => toOkxInstId(s),
    buildStream: (instId) => ({
      url: OKX_WS,
      subscribe: (ws) => {
        // Ensure contract value is known (used to convert contracts -> base qty).
        primeOkxCtVal(instId)
        ws.send(JSON.stringify({
          op: 'subscribe',
          args: [{ channel: 'trades', instId }]
        }))
      }
    }),
    fetch24h: async (instId) => {
      const res = await fetch(`${OKX_TICKER}${encodeURIComponent(instId)}`)
      if (!res.ok) throw new Error(`okx ticker ${res.status}`)
      return res.json()
    },
    mapTicker: (data) => {
      const item = data?.data?.[0]
      const price = Number(item?.last)
      const open = Number(item?.open24h)
      const change = Number.isFinite(price) && Number.isFinite(open) && open !== 0
        ? ((price - open) / open) * 100
        : null
      const volQuote = Number(item?.volCcy24h)
      return {
        price,
        change,
        volume: Number.isFinite(volQuote) ? volQuote : null
      }
    },
    parseTrade: (msg) => {
      // OKX v5 trades: { arg:{channel:"trades", instId}, data:[{ px, sz, side, ts, ...}] }
      if (msg?.arg?.channel !== 'trades') return null
      const instId = String(msg?.arg?.instId || '')
      const arr = msg?.data
      if (!Array.isArray(arr) || arr.length === 0) return null
      const last = arr[arr.length - 1]
      const p = Number(last?.px)
      const sz = Number(last?.sz)
      const ctVal = okxCtValCache.get(instId) || 1
      const q = Number.isFinite(sz) ? (sz * ctVal) : 0
      const t = Number(last?.ts)
      const side = String(last?.side || '').toUpperCase() === 'BUY' ? 'BUY' : 'SELL'
      if (!Number.isFinite(p) || !Number.isFinite(t)) return null
      return { price: p, qty: Number.isFinite(q) ? q : 0, time: t, side }
    }
  },
  {
    key: 'bybitSpot',
    label: 'Bybit Spot',
    type: 'ws',
    color: '#f97316',
    mapSymbol: (s) => s,
    buildStream: (sym) => ({
      url: BYBIT_WS,
      subscribe: (ws) => {
        ws.send(JSON.stringify({ op: 'subscribe', args: [`publicTrade.${sym}`] }))
      }
    }),
    fetch24h: async (symbol) => fetchBybitTicker(symbol),
    mapTicker: (data) => {
      const item = data?.result?.list?.[0]
      const price = Number(item?.lastPrice)
      const changePct = Number(item?.price24hPcnt)
      const volume = Number(item?.turnover24h || item?.volume24h)
      return {
        price,
        change: Number.isFinite(changePct) ? changePct * 100 : null,
        volume: Number.isFinite(volume) ? volume : null
      }
    },
    parseTrade: (msg) => {
      const arr = msg?.data?.data || msg?.data || msg?.result?.data
      const entry = Array.isArray(arr) ? arr[0] : arr
      if (!entry) return null
      const p = Number(entry.p || entry.price)
      const q = Number(entry.v || entry.qty)
      const t = Number(entry.T || entry.ts || entry.time)
      const side = String(entry.S || entry.side || '').toUpperCase() === 'BUY' ? 'BUY' : 'SELL'
      if (!Number.isFinite(p) || !Number.isFinite(t)) return null
      return { price: p, qty: Number.isFinite(q) ? q : 0, time: t, side }
    }
  },
  {
    key: 'coinbaseSpot',
    label: 'Coinbase Spot',
    type: 'ws',
    color: '#22c55e',
    mapSymbol: (s) => toCoinbaseProduct(s),
    buildStream: (productId) => ({
      url: COINBASE_WS,
      subscribe: (ws) => {
        ws.send(JSON.stringify({
          type: 'subscribe',
          product_ids: [productId],
          channels: ['ticker']
        }))
      }
    }),
    fetch24h: async (productId) => fetchCoinbaseStats(productId),
    mapTicker: (data) => {
      const price = Number(data?.last)
      const open = Number(data?.open)
      const change = Number.isFinite(price) && Number.isFinite(open) && open !== 0
        ? ((price - open) / open) * 100
        : null
      const volumeBase = Number(data?.volume)
      const volumeUsd = Number.isFinite(volumeBase) && Number.isFinite(price) ? volumeBase * price : null
      return { price, change, volume: Number.isFinite(volumeUsd) ? volumeUsd : null }
    },
    parseTrade: (msg) => {
      if (msg?.type !== 'ticker') return null
      const p = Number(msg.price)
      const q = Number(msg.last_size)
      const t = Number.isFinite(Date.parse(msg.time)) ? Date.parse(msg.time) : Date.now()
      const side = String(msg.side || '').toUpperCase() === 'BUY' ? 'BUY' : 'SELL'
      if (!Number.isFinite(p)) return null
      return { price: p, qty: Number.isFinite(q) ? q : 0, time: t, side }
    }
  },
  {
    key: 'backpack',
    label: 'Backpack',
    type: 'ws',
    color: '#60a5fa',
    mapSymbol: (s) => toBackpackSymbol(s),
    buildStream: (sym) => ({
      url: BACKPACK_WS,
      subscribe: (ws) => {
        // Subscribe to both common quote markets (if one doesn't exist it's simply silent).
        const base = String(sym).split('_')[0] || sym
        ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: [`trade.${base}_USDT`, `trade.${base}_USDC`] }))
      }
    }),
    parseTrade: (msg) => {
      const d = msg?.data
      if (!d || d.e !== 'trade') return null
      const p = Number(d.p)
      const q = Number(d.q)
      const tMicro = Number(d.E || d.T)
      const t = Number.isFinite(tMicro) ? Math.floor(tMicro / 1000) : Date.now()
      const side = d.m ? 'SELL' : 'BUY'
      if (!Number.isFinite(p) || !Number.isFinite(t)) return null
      return { price: p, qty: Number.isFinite(q) ? q : 0, time: t, side }
    }
  },
  {
    key: 'lbank',
    label: 'LBank',
    type: 'ws',
    color: '#f472b6',
    mapSymbol: (s) => toLbankPair(s),
    buildStream: (pair) => ({
      url: LBANK_WS,
      subscribe: (ws) => {
        const base = String(pair).split('_')[0] || 'mon'
        ws.send(JSON.stringify({ action: 'subscribe', subscribe: 'trade', pair: `${base}_usdt` }))
        ws.send(JSON.stringify({ action: 'subscribe', subscribe: 'trade', pair: `${base}_usdc` }))
      }
    }),
    fetch24h: async (pair) => fetchLbank24h(pair),
    mapTicker: (data) => {
      const entry = Array.isArray(data) ? data[0] : data
      const t = entry?.ticker || entry?.data?.ticker
      const price = Number(t?.latest)
      const change = Number(t?.change)
      const volume = Number(t?.turnover)
      return {
        price,
        change: Number.isFinite(change) ? change : null,
        volume: Number.isFinite(volume) ? volume : null
      }
    },
    parseTrade: (msg) => {
      // LBank WS trade: { type:"trade", pair:"btc_usdt", trade:{ price, volume, direction, TS } }
      if (msg?.type !== 'trade') return null
      const t = msg?.trade
      if (!t) return null
      const p = Number(t.price)
      const q = Number(t.volume)
      const ts = Date.parse(t.TS || msg.TS || '')
      const time = Number.isFinite(ts) ? ts : Date.now()
      const side = String(t.direction || '').toUpperCase() === 'BUY' ? 'BUY' : 'SELL'
      const pair = String(msg.pair || '').toUpperCase()
      const affectsChart = pair.endsWith('_USDT') || pair.endsWith('_USDC') || pair.endsWith('_USD')
      if (!Number.isFinite(p)) return null
      return { price: p, qty: Number.isFinite(q) ? q : 0, time, side, affectsChart }
    }
  },
  {
    key: 'kraken',
    label: 'Kraken',
    type: 'ws',
    color: '#e879f9',
    mapSymbol: (s) => toKrakenSymbol(s),
    buildStream: (sym) => ({
      url: KRAKEN_WS,
      subscribe: (ws) => {
        const base = String(sym).split('/')[0] || sym
        ws.send(JSON.stringify({
          method: 'subscribe',
          params: {
            channel: 'trade',
            // Subscribe to both common quotes.
            symbol: [`${base}/USD`, `${base}/USDT`],
            snapshot: false
          }
        }))
      }
    }),
    parseTrade: (msg) => {
      if (msg?.channel !== 'trade') return null
      if (!Array.isArray(msg.data) || msg.data.length === 0) return null
      const last = msg.data[msg.data.length - 1]
      const p = Number(last?.price)
      const q = Number(last?.qty)
      const t = Number.isFinite(Date.parse(last?.timestamp)) ? Date.parse(last.timestamp) : Date.now()
      const side = String(last?.side || '').toUpperCase() === 'BUY' ? 'BUY' : 'SELL'
      if (!Number.isFinite(p) || !Number.isFinite(t)) return null
      return { price: p, qty: Number.isFinite(q) ? q : 0, time: t, side }
    }
  },
  {
    key: 'hyperliquid',
    label: 'Hyperliquid',
    type: 'ws',
    color: '#38bdf8',
    mapSymbol: (s) => toHyperliquidCoin(s),
    buildStream: (coin) => ({
      url: HYPERLIQUID_WS,
      subscribe: (ws) => {
        ws.send(JSON.stringify({
          method: 'subscribe',
          subscription: { type: 'trades', coin }
        }))
      }
    }),
    parseTrade: (msg) => {
      // Hyperliquid trades stream: { channel: "trades", data: WsTrade[] }
      if (msg?.channel !== 'trades') return null
      if (!Array.isArray(msg.data) || msg.data.length === 0) return null
      const last = msg.data[msg.data.length - 1]
      const p = Number(last?.px)
      const q = Number(last?.sz)
      const t = Number(last?.time)
      const rawSide = String(last?.side || '').toUpperCase()
      const side = rawSide === 'BUY' || rawSide === 'B' ? 'BUY' : 'SELL'
      if (!Number.isFinite(p) || !Number.isFinite(t)) return null
      return { price: p, qty: Number.isFinite(q) ? q : 0, time: t, side }
    }
  },
  {
    key: 'gate',
    label: 'Gate.io',
    type: 'ws',
    color: '#fb7185',
    mapSymbol: (s) => toGateBase(s),
    buildStream: (base) => ({
      url: GATE_WS,
      subscribe: (ws) => {
        const pairs = [`${base}_USDT`, `${base}_USDC`, `${base}_USD`]
        ws.send(JSON.stringify({
          time: Math.floor(Date.now() / 1000),
          channel: 'spot.trades',
          event: 'subscribe',
          payload: pairs
        }))
      }
    }),
    parseTrade: (msg) => {
      // Gate spot trades: { channel:"spot.trades", event:"update", result:{ price, amount, create_time_ms, side, currency_pair } }
      if (msg?.channel !== 'spot.trades' || msg?.event !== 'update') return null
      const r = msg?.result
      if (!r) return null
      const p = Number(r.price)
      const q = Number(r.amount)
      const t = Number(r.create_time_ms) || (Number(r.create_time) ? Number(r.create_time) * 1000 : Date.now())
      const side = String(r.side || '').toUpperCase() === 'BUY' ? 'BUY' : 'SELL'
      const pair = String(r.currency_pair || '').toUpperCase()
      const affectsChart = pair.endsWith('_USDT') || pair.endsWith('_USDC') || pair.endsWith('_USD')
      if (!Number.isFinite(p) || !Number.isFinite(t)) return null
      return { price: p, qty: Number.isFinite(q) ? q : 0, time: t, side, affectsChart }
    }
  },
  {
    key: 'dexscreener',
    label: 'DexScreener',
    type: 'rest',
    color: '#22d3ee'
  },
  // CoinGecko removed: blocked by CORS in browsers
]
