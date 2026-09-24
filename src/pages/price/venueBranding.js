import { siBinance, siCoinbase, siOkx } from 'simple-icons'
import { VENUES } from './venues'

/**
 * Locally bundled venue marks. Each entry is an ordered candidate list because
 * the drop-in assets under `public/img/exchanges/` vary in extension — the
 * <img> walks the list on error and settles on whichever exists.
 */
export const VENUE_LOGO_SRC = {
  hyperliquid: ['/img/exchanges/hyperliquid.png'],
  gate: ['/img/exchanges/gateio.svg'],
  backpack: ['/img/exchanges/backpack.jpeg', '/img/exchanges/backpack.png'],
  bybitSpot: ['/img/exchanges/bybit.png', '/img/exchanges/bybit.svg', '/img/exchanges/bybit.webp'],
  coinbaseSpot: ['/img/exchanges/coinbase.jpeg', '/img/exchanges/coinbase.svg', '/img/exchanges/coinbase.png'],
  lbank: ['/img/exchanges/lbank.png', '/img/exchanges/lbank.svg'],
  okxFutures: ['/img/exchanges/OKX.png', '/img/exchanges/okx.svg', '/img/exchanges/okx.png'],
}

/** Vector fallbacks for venues with no bundled asset. */
export const VENUE_ICON = {
  binanceFutures: siBinance,
  coinbaseSpot: siCoinbase,
  okxFutures: siOkx,
}

export const VENUE_META = VENUES.reduce((acc, v) => {
  acc[v.key] = { label: v.label, color: v.color, type: v.type }
  return acc
}, {})

/** Two-letter monogram used when a venue has neither an asset nor a vector mark. */
export function venueMonogram(key) {
  const label = VENUE_META[key]?.label || String(key || '')
  const parts = label.trim().split(/\s+/g)
  const mono = parts.length >= 2
    ? parts[0][0] + parts[1][0]
    : (parts[0]?.slice(0, 3) || label.slice(0, 3))
  return String(mono || '').toUpperCase()
}

export function venueLabel(key) {
  return VENUE_META[key]?.label || key
}

/** Market-type suffixes lifted out of the label into their own tag. */
const MARKET_TAGS = [
  { suffix: ' Futures', tag: 'PERP' },
  { suffix: ' Spot', tag: 'SPOT' },
]

/**
 * Splits "Binance Futures" into `{ name: 'Binance', tag: 'PERP' }`.
 *
 * Two wins over printing the raw label: the name column stops ellipsising at
 * rail width, and spot-vs-perp becomes explicit instead of buried in prose.
 * Venues whose name already states the market type get no tag.
 *
 * @param {string} key
 * @returns {{ name: string, tag: string | null }}
 */
export function venueDisplay(key) {
  const label = VENUE_META[key]?.label || String(key || '')
  const match = MARKET_TAGS.find((m) => label.endsWith(m.suffix))
  if (match) return { name: label.slice(0, -match.suffix.length), tag: match.tag }
  return { name: label, tag: null }
}

export function venueColor(key) {
  return VENUE_META[key]?.color || '#a78bfa'
}
