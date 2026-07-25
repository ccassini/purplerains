/** Shared helpers for Monad / Agora world pages. */

export function hashInt(input) {
  let h = 2166136261
  const s = String(input || '')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h >>> 0)
}

export function jitterCoord(baseLat, baseLng, seedA, seedB, scale = 1) {
  const latJitter = ((seedA % 1000) / 1000 - 0.5) * 0.8 * scale
  const lngJitter = ((seedB % 1000) / 1000 - 0.5) * 1.1 * scale
  const lat = Math.max(-89.8, Math.min(89.8, baseLat + latJitter))
  let lng = baseLng + lngJitter
  if (lng > 180) lng -= 360
  if (lng < -180) lng += 360
  return { lat, lng }
}

export function continentByLatLng(lat, lng) {
  if (lat > 35 && lng >= -10 && lng <= 60) return 'Europe'
  if (lat >= -35 && lat <= 38 && lng >= -20 && lng <= 55) return 'Africa'
  if (lat >= 5 && lng >= 55 && lng <= 180) return 'Asia'
  if (lat < -5 && lng >= 95 && lng <= 180) return 'Oceania'
  if (lng >= -92 && lng <= -30 && lat >= -55 && lat <= 15) return 'South America'
  if (lng >= -170 && lng <= -45 && lat >= 10) return 'North America'
  return 'Other'
}

export function formatStakeMon(stake) {
  const n = Number(stake || 0)
  if (!Number.isFinite(n)) return '—'
  return `${n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : n.toLocaleString()} MON`
}

export function formatCommission(commissionBps) {
  const bps = Number(commissionBps || 0)
  if (!Number.isFinite(bps)) return '—'
  return `${(bps / 100).toFixed(2)}%`
}

export function normalizeHexId(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  let hex = raw.toLowerCase()
  if (!hex.startsWith('0x')) hex = `0x${hex}`
  if (!/^0x[a-f0-9]{40,160}$/.test(hex)) return null
  return hex
}
