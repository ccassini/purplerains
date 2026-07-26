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

/** Ordered largest-first so the first matching tier wins. */
const USD_TIERS = [
  { min: 1e12, div: 1e12, suffix: 'T', digits: 2 },
  { min: 1e9, div: 1e9, suffix: 'B', digits: 2 },
  { min: 1e6, div: 1e6, suffix: 'M', digits: 1 },
  { min: 1e3, div: 1e3, suffix: 'K', digits: 1 },
]

/**
 * Compact USD in financial notation: $1.53B, $412.7M, $88.4K, $512.
 * Rounding that crosses a unit boundary promotes ($999.96M → $1.00B) so the
 * scaled figure never reads as four digits.
 */
export function formatTvlCompact(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  for (let i = 0; i < USD_TIERS.length; i += 1) {
    const tier = USD_TIERS[i]
    if (n < tier.min) continue
    const scaled = Number((n / tier.div).toFixed(tier.digits))
    if (scaled >= 1000 && i > 0) {
      const up = USD_TIERS[i - 1]
      return `$${(n / up.div).toFixed(up.digits)}${up.suffix}`
    }
    return `$${scaled.toFixed(tier.digits)}${tier.suffix}`
  }
  return `$${Math.round(n).toLocaleString('en-US')}`
}

/** Full USD with thousands separators, for tooltips and title attrs: $1,534,210,000. */
export function formatTvlFull(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return `$${Math.round(n).toLocaleString('en-US')}`
}

/**
 * Signed percentage for 1d/7d change, or null when DefiLlama has no figure.
 * Values that round to zero render unsigned so "-0.0%" never appears.
 */
export function formatChangePct(value) {
  // Number(null) is 0 — a missing figure must not render as a flat 0.0%.
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const rounded = Number(n.toFixed(1))
  if (rounded === 0) return '0.0%'
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded.toFixed(1)}%`
}

/**
 * Ignore pools below this TVL when summarizing 24h movement — a $12 pool
 * swinging +900% is noise, not a headline.
 */
const MOVER_MIN_TVL = 10_000

/**
 * 24h movement summary for the hero band. Pure — operates on the merged
 * project records returned by fetchMonadEcosystem.
 *
 * @param {Array<{tvl?: number|null, change1d?: number|null}>} projects
 * @returns {{up: number, down: number, topGainer: object|null, topLoser: object|null}}
 */
export function computeMovers(projects = []) {
  let up = 0
  let down = 0
  let topGainer = null
  let topLoser = null
  for (const p of projects) {
    if (!(Number(p?.tvl) >= MOVER_MIN_TVL)) continue
    const change = Number(p?.change1d)
    if (!Number.isFinite(change) || change === 0) continue
    if (change > 0) {
      up += 1
      if (!topGainer || change > Number(topGainer.change1d)) topGainer = p
    } else {
      down += 1
      if (!topLoser || change < Number(topLoser.change1d)) topLoser = p
    }
  }
  return { up, down, topGainer, topLoser }
}
