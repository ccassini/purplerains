export const BINANCE_FAPI_EXCHANGE_INFO = 'https://fapi.binance.com/fapi/v1/exchangeInfo'
export const BINANCE_FAPI_TICKER_24H = 'https://fapi.binance.com/fapi/v1/ticker/24hr'
export const BINANCE_FSTREAM_WS = 'wss://fstream.binance.com/ws'

/** BTC spot price — prefer spot REST/WS; futures stream is geo-blocked in many regions */
export const BINANCE_SPOT_TICKER_PRICE = 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'
export const BINANCE_SPOT_TICKER_24H = 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'
export const BINANCE_SPOT_WS = 'wss://stream.binance.com:9443/ws'
export const COINBASE_BTC_SPOT = 'https://api.coinbase.com/v2/prices/BTC-USD/spot'
export const BYBIT_BTC_TICKER = 'https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT'
export const BTC_PRICE_POLL_MS = 12_000
export const BTC_CHANGE_POLL_MS = 60_000

export const DEXSCREENER_API = 'https://api.dexscreener.com'

export const COINBASE_WS = 'wss://ws-feed.exchange.coinbase.com'
export const COINBASE_STATS = 'https://api.exchange.coinbase.com/products'

export const BYBIT_WS = 'wss://stream.bybit.com/v5/public/spot'
export const BYBIT_TICKER = 'https://api.bybit.com/v5/market/tickers?category=spot&symbol='

export const BACKPACK_WS = 'wss://ws.backpack.exchange'

export const LBANK_WS = 'wss://www.lbkex.net/ws/V2/'
export const LBANK_TICKER_24H = 'https://api.lbkex.com/v2/ticker/24hr.do?symbol='

export const KRAKEN_WS = 'wss://ws.kraken.com/v2'

export const HYPERLIQUID_WS = 'wss://api.hyperliquid.xyz/ws'

export const GATE_WS = 'wss://api.gateio.ws/ws/v4/'

export const OKX_WS = 'wss://ws.okx.com:8443/ws/v5/public'
export const OKX_TICKER = 'https://www.okx.com/api/v5/market/ticker?instId='
export const OKX_INSTRUMENTS = 'https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId='

export const DEFAULT_CANDIDATES = ['MONUSDT', 'MONUSDC', 'MONUSD']

/** Speed-trading style palette (cf. speedtrading.exchange / Pandora) */
export const SPEED = {
  bg: '#0a0a0a',
  grid: 'rgba(255, 255, 255, 0.035)',
  scaleBorder: 'rgba(255, 255, 255, 0.08)',
  text: 'rgba(245, 245, 245, 0.88)',
  textMuted: 'rgba(163, 163, 163, 0.8)',
  blue: '#58a6ff',
  blueLine: 'rgba(88, 166, 255, 0.98)',
  blueHalo: 'rgba(61, 158, 255, 0.42)',
  areaTop: 'rgba(88, 166, 255, 0.14)',
  areaBot: 'rgba(0, 0, 0, 0)',
  lime: '#bcff00',
  crosshair: 'rgba(88, 166, 255, 0.35)',
  crosshairLabel: 'rgba(25, 80, 160, 0.94)',
  purple: '#a78bfa',
  purpleLine: 'rgba(167, 139, 250, 0.98)',
  purpleHalo: 'rgba(167, 139, 250, 0.42)',
  purpleAreaTop: 'rgba(167, 139, 250, 0.14)',
  purpleCrosshair: 'rgba(167, 139, 250, 0.35)',
  purpleCrosshairLabel: 'rgba(88, 28, 135, 0.94)',
}

/** Line mode: UI tick + exponential smoothing toward last trade price */
export const LINE_TICK_MS = 100
export const LINE_SMOOTH_ALPHA = 0.32
export const SNAKE_POINTS = 80
export const SNAKE_PAD_Y = 16
/** Footer strip for the rolling-window time axis. */
export const CHART_PAD_BOTTOM = 26
export const AXIS_TICKS = 5
export const HEAD_RADIUS = 14
/**
 * Micro-oscillation on the line, scaled per point by local tick-to-tick
 * velocity. Near zero at rest so a flat price stays flat, growing where the
 * price is actually moving fast.
 */
export const WOBBLE_BASE_PX = 0.35
export const WOBBLE_SLOPE_PX = 5
/** Per-tick move (as a fraction of the visible range) that earns full wobble. */
export const WOBBLE_VELOCITY_REF = 0.06

/** Buy/sell pressure window for the flow meter. */
export const FLOW_WINDOW_MS = 12_000

/** How long React state batches trade/price updates (chart is unaffected). */
export const UI_FLUSH_MS = 32
