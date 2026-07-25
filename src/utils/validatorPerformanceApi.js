const perfCache = new Map()
const PERF_TTL = 2 * 60 * 1000
const PERF_TIMEOUT_MS = 4500

function normalizeHexId(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  let hex = raw.toLowerCase()
  if (!hex.startsWith('0x')) hex = `0x${hex}`
  if (!/^0x[a-f0-9]{40,160}$/.test(hex)) return null
  return hex
}

/**
 * Fetch validator performance via our cached serverless API only.
 * (No third-party HTML proxy — keeps data path stable and private.)
 */
export async function fetchValidatorPerformance(idOrIds, signal) {
  const inputIds = Array.isArray(idOrIds) ? idOrIds : [idOrIds]
  const candidates = [...new Set(inputIds.map(normalizeHexId).filter(Boolean))]
  if (!candidates.length) return null

  for (const id of candidates) {
    const cached = perfCache.get(id)
    if (cached && Date.now() - cached.ts < PERF_TTL) return cached.data
  }

  const withTimeout = async (url, opts = {}) => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(new Error('timeout')), PERF_TIMEOUT_MS)
    try {
      const mergedSignal = opts.signal
      if (mergedSignal) {
        if (mergedSignal.aborted) throw new Error('aborted')
        mergedSignal.addEventListener('abort', () => controller.abort(), { once: true })
      }
      return await fetch(url, { ...opts, signal: controller.signal })
    } finally {
      window.clearTimeout(timer)
    }
  }

  try {
    for (const id of candidates) {
      const res = await withTimeout(`/api/validator-performance?nodeId=${encodeURIComponent(id)}`, {
        signal,
      })
      if (!res.ok) continue
      const json = await res.json()
      if (json?.success) {
        perfCache.set(id, { ts: Date.now(), data: json })
        return json
      }
    }
  } catch {
    // network / abort
  }

  return null
}
