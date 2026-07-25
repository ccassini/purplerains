import { OKX_INSTRUMENTS } from './constants'

export const okxCtValCache = new Map()
const okxCtValInFlight = new Set()

export async function primeOkxCtVal(instId) {
  if (!instId) return
  if (okxCtValCache.has(instId)) return
  if (okxCtValInFlight.has(instId)) return
  okxCtValInFlight.add(instId)
  try {
    const res = await fetch(`${OKX_INSTRUMENTS}${encodeURIComponent(instId)}`)
    if (!res.ok) throw new Error(`okx instruments ${res.status}`)
    const json = await res.json()
    const ctVal = Number(json?.data?.[0]?.ctVal)
    if (Number.isFinite(ctVal) && ctVal > 0) okxCtValCache.set(instId, ctVal)
    else okxCtValCache.set(instId, 1)
  } catch {
    okxCtValCache.set(instId, 1)
  } finally {
    okxCtValInFlight.delete(instId)
  }
}

export function toCoinbaseProduct(symbol) {
  if (!symbol) return null
  const upper = symbol.toUpperCase()
  const isUsd = upper.endsWith('USD')
  const isUsdc = upper.endsWith('USDC')
  const isUsdt = upper.endsWith('USDT')
  if (!isUsd && !isUsdc && !isUsdt) return null
  const base = upper.replace(/(USDC|USDT|USD)$/, '')
  const quote = isUsdc ? 'USDC' : 'USD'
  if (!base) return null
  return `${base}-${quote}`
}

export function splitSymbol(symbol) {
  const upper = String(symbol || '').toUpperCase()
  for (const quote of ['USDT', 'USDC', 'USD']) {
    if (upper.endsWith(quote)) {
      return { base: upper.slice(0, -quote.length), quote }
    }
  }
  return { base: upper, quote: null }
}

export function toBackpackSymbol(symbol) {
  const { base, quote } = splitSymbol(symbol)
  if (!base) return null
  // Backpack uses underscore pairs like MON_USDT / MON_USDC
  const q = quote === 'USDC' ? 'USDC' : 'USDT'
  return `${base}_${q}`
}

export function toLbankPair(symbol) {
  const { base, quote } = splitSymbol(symbol)
  if (!base) return null
  const q = quote === 'USDC' ? 'USDC' : quote === 'USD' ? 'USD' : 'USDT'
  return `${base.toLowerCase()}_${q.toLowerCase()}`
}

export function toKrakenSymbol(symbol) {
  const { base, quote } = splitSymbol(symbol)
  if (!base) return null
  const q = quote === 'USDT' ? 'USDT' : 'USD'
  return `${base}/${q}`
}

export function toHyperliquidCoin(symbol) {
  const { base } = splitSymbol(symbol)
  return base || null
}

export function toGateBase(symbol) {
  const { base } = splitSymbol(symbol)
  return base || null
}

export function toOkxInstId(symbol) {
  const { base } = splitSymbol(symbol)
  if (!base) return null
  // OKX linear perps use instId like MON-USDT-SWAP
  return `${base}-USDT-SWAP`
}
