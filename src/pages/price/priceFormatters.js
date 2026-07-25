export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

export function formatPrice(p) {
  if (!Number.isFinite(p)) return '—'
  if (p >= 1000) return p.toFixed(2)
  if (p >= 1) return p.toFixed(4)
  return p.toFixed(6)
}
