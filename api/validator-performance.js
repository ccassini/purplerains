import {
  parseMetricPage,
  hasUsefulMetrics,
} from './lib/validatorMetricsParse.js'

const MONAD_SPACE_BASE = 'https://monad-space.itrocket.net/validators/'
const CACHE_TTL_MS = 2 * 60 * 1000
const CACHE_MAX = 200

/** @type {Map<string, { ts: number, data: object }>} */
const memoryCache = new Map()

function getCached(nodeId) {
  const hit = memoryCache.get(nodeId)
  if (!hit) return null
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    memoryCache.delete(nodeId)
    return null
  }
  return hit.data
}

function setCached(nodeId, data) {
  if (memoryCache.size >= CACHE_MAX) {
    const oldest = memoryCache.keys().next().value
    memoryCache.delete(oldest)
  }
  memoryCache.set(nodeId, { ts: Date.now(), data })
}

async function fetchUpstreamHtml(nodeId) {
  const upstream = await fetch(`${MONAD_SPACE_BASE}${encodeURIComponent(nodeId)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 PurpleRain/1.0',
      Accept: 'text/html,application/xhtml+xml',
    },
  })
  if (!upstream.ok) {
    const err = new Error(`Upstream error: ${upstream.status}`)
    err.status = upstream.status
    throw err
  }
  return upstream.text()
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const nodeId = String(req.query?.nodeId || '').trim()
  if (!/^0x[a-fA-F0-9]{40,160}$/.test(nodeId)) {
    res.status(400).json({ error: 'Invalid nodeId' })
    return
  }

  const cached = getCached(nodeId)
  if (cached) {
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300')
    res.setHeader('X-Cache', 'HIT')
    res.status(200).json(cached)
    return
  }

  try {
    const text = await fetchUpstreamHtml(nodeId)
    const parsed = parseMetricPage(text)

    if (!hasUsefulMetrics(parsed)) {
      res.status(502).json({ error: 'Unable to parse validator metrics', nodeId })
      return
    }

    const payload = {
      success: true,
      nodeId,
      source: 'monad-space.itrocket.net',
      cachedAt: Date.now(),
      ...parsed,
    }

    setCached(nodeId, payload)
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300')
    res.setHeader('X-Cache', 'MISS')
    res.status(200).json(payload)
  } catch (error) {
    const status = error?.status && Number.isFinite(error.status) ? error.status : 500
    res.status(status).json({
      error: 'Failed to fetch validator performance',
      details: String(error?.message || error),
    })
  }
}
