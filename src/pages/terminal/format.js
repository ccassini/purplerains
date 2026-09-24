import { EXPLORER_URL } from './constants'

/** Successful zero stays a number; missing evidence stays null. */
export function asNum(v) {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export function asInt(v) {
  const n = asNum(v)
  if (n == null) return null
  return Math.trunc(n)
}

export function clampNum(n, min, max) {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

export function shortAddr(addr, left = 6, right = 4) {
  if (!addr || typeof addr !== 'string') return '—'
  const s = addr.toLowerCase()
  if (s.length <= left + right + 2) return s
  return `${s.slice(0, left)}…${s.slice(-right)}`
}

export function txUrl(hash) {
  if (!hash) return null
  return `${EXPLORER_URL}/tx/${hash}`
}

export function addressUrl(addr) {
  if (!addr) return null
  return `${EXPLORER_URL}/address/${addr}`
}

export function formatUsd(value, { signed = false, digits } = {}) {
  const n = asNum(value)
  if (n == null) return '—'
  const abs = Math.abs(n)
  let body
  if (abs >= 1_000_000_000) body = `$${(abs / 1_000_000_000).toFixed(2)}B`
  else if (abs >= 1_000_000) body = `$${(abs / 1_000_000).toFixed(2)}M`
  else if (abs >= 10_000) body = `$${(abs / 1_000).toFixed(2)}K`
  else if (abs >= 1) body = `$${abs.toFixed(digits ?? 2)}`
  else if (abs >= 0.0001) body = `$${abs.toFixed(digits ?? 4)}`
  else if (abs === 0) body = '$0.00'
  else body = `$${abs.toExponential(2)}`
  if (!signed) return n < 0 ? `-${body}` : body
  if (n > 0) return `+${body}`
  if (n < 0) return `-${body}`
  return body
}

export function formatPct(value, digits = 2) {
  const n = asNum(value)
  if (n == null) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(digits)}%`
}

export function formatNum(value) {
  const n = asNum(value)
  if (n == null) return '—'
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function formatAmount(value) {
  const n = asNum(value)
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(2)}K`
  if (abs >= 1) return n.toFixed(2)
  if (abs >= 0.0001) return n.toFixed(4)
  if (abs === 0) return '0'
  return n.toExponential(2)
}

export function formatPrice(value) {
  const n = asNum(value)
  if (n == null) return '—'
  if (n >= 1000) return n.toFixed(2)
  if (n >= 1) return n.toFixed(4)
  if (n >= 0.0001) return n.toFixed(6)
  if (n === 0) return '0'
  return n.toExponential(2)
}

export function formatAge(ts, nowMs) {
  if (!Number.isFinite(ts)) return '—'
  const secs = Math.max(0, Math.floor((nowMs - ts) / 1000))
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function formatClock(ts) {
  if (!Number.isFinite(ts)) return '--:--:--'
  const d = new Date(ts)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export function formatHold(seconds) {
  const n = asNum(seconds)
  if (n == null) return '—'
  const s = Math.max(0, Math.floor(n))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d`
}

export function signedClass(value) {
  const n = asNum(value)
  if (n == null || n === 0) return 'flat'
  return n > 0 ? 'up' : 'down'
}

export function sizeTier(usd) {
  const n = asNum(usd)
  if (n == null) return 0
  if (n >= 50_000) return 4
  if (n >= 10_000) return 3
  if (n >= 2_500) return 2
  if (n >= 500) return 1
  return 0
}

export function parseFeePct(name) {
  if (!name || typeof name !== 'string') return null
  const m = name.match(/(\d+(?:\.\d+)?)\s*%/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

export function protoFromDexId(dexId) {
  const id = String(dexId || '').toLowerCase()
  if (id.includes('v4')) return 'v4'
  if (id.includes('v3') || id.includes('-cl') || id.includes('slipstream')) return 'v3'
  if (id.includes('v2') || id.includes('classic') || id.includes('nad-fun') || id.includes('nadfun')) return 'v2'
  if (id.includes('curve')) return 'curve'
  if (id.includes('v2-1') || id.includes('v2-2') || id.includes('traderjoe') || id.includes('lfj')) return 'lb'
  return id ? 'amm' : null
}

export function dexLabel(dexId, fallback) {
  if (fallback) return fallback
  const id = String(dexId || '')
  return id
    .replace(/-monad$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase()) || '—'
}

export function canonicalPair(a, b) {
  const x = String(a || '').toUpperCase()
  const y = String(b || '').toUpperCase()
  if (!x || !y) return `${x || y || '—'}`
  return x < y ? `${x}/${y}` : `${y}/${x}`
}

export function windowById(windows, id) {
  return windows.find((w) => w.id === id) || windows[1]
}
