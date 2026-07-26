/**
 * Loads the Monad ecosystem directory: the curated project list (local logos)
 * merged with DefiLlama's Monad protocols (live TVL + categories).
 *
 * Resolution order for the DeFi half:
 *   1. /api/monad-ecosystem — live, filtered and cached server-side
 *   2. /data/monadDefi.json — committed snapshot (vite dev has no /api route,
 *      and it also covers a cold or failing function)
 *
 * The curated list alone is enough to render the page, so a total DeFi failure
 * degrades to "no TVL shown" rather than an error screen.
 */
import { mergeEcosystem, computeStats } from './ecosystemMerge.js'
import { logger } from './logger'

const PROJECTS_URL = '/data/ecosystemProjects.json'
const IMAGES_URL = '/data/ecosystemImages.json'
const DEFI_API = '/api/monad-ecosystem'
const DEFI_SNAPSHOT = '/data/monadDefi.json'
const FETCH_TIMEOUT_MS = 12000

async function getJson(url, { timeout = FETCH_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`${url} responded ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function loadCuratedProjects() {
  try {
    const list = await getJson(PROJECTS_URL)
    if (Array.isArray(list) && list.length) return list
    throw new Error('curated project list was empty')
  } catch (err) {
    logger.warn('[ecosystem] curated list unavailable, trying image list', err?.message)
    const images = await getJson(IMAGES_URL).catch(() => [])
    // The image list is filenames only; names are derived from them.
    return (Array.isArray(images) ? images : []).map((f) =>
      typeof f === 'string' ? { filename: f } : f
    )
  }
}

async function loadDefi() {
  try {
    const live = await getJson(DEFI_API)
    if (Array.isArray(live?.protocols) && live.protocols.length) {
      return { ...live, live: true }
    }
    throw new Error('live route returned no protocols')
  } catch (apiErr) {
    logger.debug('[ecosystem] live DeFi route unavailable, using snapshot', apiErr?.message)
    try {
      const snap = await getJson(DEFI_SNAPSHOT)
      if (Array.isArray(snap?.protocols)) return { ...snap, live: false }
    } catch (snapErr) {
      logger.warn('[ecosystem] DeFi snapshot unavailable', snapErr?.message)
    }
    return { protocols: [], updatedAt: null, chainTvl: 0, live: false }
  }
}

/**
 * @returns {Promise<{projects: Array<object>, stats: object, updatedAt: string|null,
 *                    live: boolean, hasDefiData: boolean}>}
 */
export async function fetchMonadEcosystem() {
  const [curated, defi] = await Promise.all([loadCuratedProjects(), loadDefi()])

  const projects = mergeEcosystem(curated, defi.protocols)
  // Highest TVL first, then everything else alphabetically — so the chain's
  // most significant protocols lead and the long tail stays browsable.
  projects.sort((a, b) => {
    const at = Number(a.tvl) || 0
    const bt = Number(b.tvl) || 0
    if (at !== bt) return bt - at
    return a.name.localeCompare(b.name)
  })

  return {
    projects,
    stats: computeStats(projects),
    updatedAt: defi.updatedAt ?? null,
    live: Boolean(defi.live),
    hasDefiData: defi.protocols.length > 0,
  }
}

/** Compact USD for TVL badges: $1.51B, $252M, $9.3M, $12.4K. */
export function formatTvlCompact(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${Math.round(n)}`
}

/** Signed percentage for 24h change, or null when DefiLlama has no figure. */
export function formatChangePct(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}
