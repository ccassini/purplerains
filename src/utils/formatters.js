/**
 * Shared formatting utilities used across multiple components.
 */

export function formatUsd(value) {
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  if (value >= 1) return `$${value.toFixed(2)}`
  return `$${value.toFixed(4)}`
}

export function formatUsdExact(value) {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatUsdCompact(n) {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(2)}K`
  if (abs >= 1) return n.toFixed(2)
  return n.toFixed(4)
}

export function formatAmount(value, symbol = 'MON') {
  if (!Number.isFinite(value) || value <= 0) return `0.0 ${symbol}`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M ${symbol}`
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K ${symbol}`
  if (value >= 1) return `${value.toFixed(2)} ${symbol}`
  return `${value.toFixed(4)} ${symbol}`
}

export function formatTimeAgo(seconds) {
  if (seconds <= 0) return 'now'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}m ${secs}s`
}

export function formatNumber(num) {
  if (!num && num !== 0) return '0'
  return num.toLocaleString()
}

export function formatNumberCompact(num) {
  if (!num && num !== 0) return '0'
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return num.toLocaleString()
}

export function isStablecoin(symbol) {
  if (!symbol) return false
  const upper = symbol.toUpperCase()
  return ['USDC', 'USDT', 'DAI', 'AUSD', 'BUSD', 'TUSD'].includes(upper) || upper.includes('USD')
}

export function getUtilizationColor(percent) {
  if (percent >= 90) return '#ef4444'
  if (percent >= 70) return '#f97316'
  if (percent >= 50) return '#eab308'
  if (percent >= 30) return '#22c55e'
  return '#06b6d4'
}

export function formatTimeRemaining(ms) {
  if (!ms || ms <= 0) return '0s'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// --- Staking-specific formatters ---

export function commissionBpsFromWad(wad) {
  try {
    const x = typeof wad === 'bigint' ? wad : BigInt(wad ?? 0)
    if (x <= 0n) return 0
    const bps = Number((x * 10_000n) / 10n ** 18n)
    return Number.isFinite(bps) ? Math.max(0, Math.min(10_000, bps)) : 0
  } catch {
    return 0
  }
}

export function formatApyFromBps(bps) {
  if (!Number.isFinite(bps)) return '—'
  const sign = bps < 0 ? '-' : ''
  const abs = Math.abs(Math.round(bps))
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  return `${sign}${whole}.${frac}%`
}

export function formatMonNumber(value) {
  if (!Number.isFinite(value) || value <= 0) return '0.0000'
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`
  return value.toFixed(4)
}

export function formatMonCompactFromWei(bi) {
  try {
    const x = typeof bi === 'bigint' ? bi : BigInt(bi ?? 0)
    const mon = x / 10n ** 18n
    const abs = mon < 0n ? -mon : mon
    const sign = mon < 0n ? '-' : ''
    if (abs >= 1_000_000_000_000n) return `${sign}${(abs / 1_000_000_000_000n).toString()}T`
    if (abs >= 1_000_000_000n) return `${sign}${(abs / 1_000_000_000n).toString()}B`
    if (abs >= 1_000_000n) return `${sign}${(abs / 1_000_000n).toString()}M`
    if (abs >= 1_000n) return `${sign}${(abs / 1_000n).toString()}K`
    return `${sign}${abs.toString()}`
  } catch {
    return '—'
  }
}

// --- Epoch constants ---

export const BLOCKS_PER_EPOCH = 50_000
export const BLOCK_TIME_MS = 400
