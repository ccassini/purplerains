/**
 * Monad DeFi protocols with live TVL, filtered server-side.
 *
 * DefiLlama's /protocols response is ~8MB covering every chain. Sending that to
 * a browser is not an option, so this route fetches it once, keeps only the
 * Monad entries and the fields the ecosystem page renders (~53KB), and caches
 * the result both in memory (warm invocations) and at the CDN edge.
 *
 * The client treats a failure here as non-fatal and falls back to the committed
 * snapshot in public/data/monadDefi.json.
 */
import { isMonadProtocol, slimProtocol } from '../src/utils/ecosystemMerge.js'

const SOURCE = 'https://api.llama.fi/protocols'
const CACHE_TTL_MS = 10 * 60 * 1000
const UPSTREAM_TIMEOUT_MS = 15000

/** @type {{ ts: number, data: object } | null} */
let cache = null

async function fetchProtocols() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const res = await fetch(SOURCE, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`DefiLlama responded ${res.status}`)
    const all = await res.json()
    if (!Array.isArray(all)) throw new Error('DefiLlama payload was not an array')
    return all
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1800')
    res.setHeader('X-Cache', 'HIT')
    res.status(200).json(cache.data)
    return
  }

  try {
    const all = await fetchProtocols()
    const protocols = all
      .filter(isMonadProtocol)
      .map(slimProtocol)
      .sort((a, b) => b.tvl - a.tvl)

    if (protocols.length === 0) {
      // Upstream shape changed or Monad vanished from it — let the client fall
      // back to its snapshot rather than caching an empty list.
      res.status(502).json({ error: 'No Monad protocols in upstream response' })
      return
    }

    const payload = {
      source: 'defillama',
      updatedAt: new Date().toISOString(),
      chainTvl: protocols.reduce((n, p) => n + p.tvl, 0),
      count: protocols.length,
      protocols,
    }

    cache = { ts: Date.now(), data: payload }
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1800')
    res.setHeader('X-Cache', 'MISS')
    res.status(200).json(payload)
  } catch (error) {
    // Serve a stale cache over an error whenever we have one.
    if (cache) {
      res.setHeader('Cache-Control', 'public, s-maxage=60')
      res.setHeader('X-Cache', 'STALE')
      res.status(200).json(cache.data)
      return
    }
    res.status(502).json({ error: error?.message || 'Failed to load DefiLlama data' })
  }
}
