/**
 * Merges the curated Monad project list (which carries our local logos) with
 * DefiLlama's Monad protocol data (which carries live TVL, categories and
 * descriptions).
 *
 * Neither source is complete on its own: the curated list has 208 projects but
 * is missing the largest DeFi protocols on the chain, while DefiLlama only
 * knows DeFi and has no entry for wallets, games, tooling or infra. The union
 * is what the ecosystem page needs.
 *
 * Pure functions only — no fetching — so this can be unit tested and reused by
 * both the client and the snapshot generator.
 */

/** Strip version suffixes and common corporate words so "Uniswap V4" ≈ "uniswap". */
export function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\bv\d+(\.\d+)?\b/g, ' ')
    .replace(/\b(finance|protocol|exchange|labs?|network|dao|xyz|io|app)\b/g, ' ')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * DefiLlama's `tvl` is the protocol's total across every chain. Only
 * `chainTvls.Monad` is the Monad share, so prefer it and fall back to `tvl`
 * only when Monad is the protocol's only chain.
 */
export function monadTvlOf(protocol) {
  const scoped = Number(protocol?.chainTvls?.Monad)
  if (Number.isFinite(scoped)) return scoped
  const chains = Array.isArray(protocol?.chains) ? protocol.chains : []
  const total = Number(protocol?.tvl)
  if (chains.length === 1 && /^monad$/i.test(chains[0]) && Number.isFinite(total)) return total
  return 0
}

/** Keep only what the page renders, so the payload stays small over the wire. */
export function slimProtocol(protocol) {
  return {
    name: protocol.name,
    slug: protocol.slug ?? null,
    category: protocol.category ?? null,
    url: protocol.url ?? null,
    logo: protocol.logo ?? null,
    twitter: protocol.twitter ?? null,
    description: protocol.description ?? null,
    tvl: monadTvlOf(protocol),
    change1d: Number.isFinite(Number(protocol.change_1d)) ? Number(protocol.change_1d) : null,
    change7d: Number.isFinite(Number(protocol.change_7d)) ? Number(protocol.change_7d) : null,
    audits: protocol.audits ?? null,
  }
}

export function isMonadProtocol(protocol) {
  return Array.isArray(protocol?.chains) && protocol.chains.some((c) => /^monad$/i.test(c))
}

/** Pick the DefiLlama entry that best represents a version group. */
function representative(group) {
  return group.reduce((best, p) => (p.tvl > best.tvl ? p : best), group[0])
}

/**
 * @param {Array<{filename?:string,name?:string,website?:string}>} local curated list
 * @param {Array<object>} protocols DefiLlama protocols, already slimmed
 * @returns {Array<object>} unified project records
 */
export function mergeEcosystem(local = [], protocols = []) {
  // Group DefiLlama entries by normalized name so protocol versions (Uniswap
  // V2/V3/V4) collapse into one row whose TVL is the sum of its versions.
  const groups = new Map()
  for (const p of protocols) {
    if (!p?.name) continue
    const key = normalizeName(p.name)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(p)
  }

  const out = []
  const usedKeys = new Set()

  for (const item of local) {
    if (!item) continue
    const filename = typeof item.filename === 'string' ? item.filename : ''
    const name = (item.name || filename.replace(/\.[^.]+$/, '')).trim()
    if (!name) continue
    const key = normalizeName(name)
    const group = key ? groups.get(key) : null
    if (group) usedKeys.add(key)
    const lead = group ? representative(group) : null

    out.push({
      id: `local:${filename || name}`,
      name,
      // Local artwork wins — it is curated and served from our own origin.
      logo: filename ? `/ecosystem/${encodeURIComponent(filename)}` : lead?.logo ?? null,
      logoFallback: lead?.logo ?? null,
      website: (item.website || '').trim() || lead?.url || null,
      twitter: lead?.twitter ?? null,
      description: lead?.description ?? null,
      category: lead?.category ?? null,
      tvl: group ? group.reduce((n, p) => n + (Number(p.tvl) || 0), 0) : null,
      change1d: lead?.change1d ?? null,
      change7d: lead?.change7d ?? null,
      audits: lead?.audits ?? null,
      defiLlamaSlug: lead?.slug ?? null,
      variants: group && group.length > 1 ? group.map((p) => p.name) : null,
      hasLiveTvl: Boolean(group),
    })
  }

  // Everything DefiLlama knows that the curated list never had — this is where
  // the chain's biggest protocols were going missing.
  for (const [key, group] of groups) {
    if (usedKeys.has(key)) continue
    const lead = representative(group)
    out.push({
      id: `llama:${lead.slug || lead.name}`,
      name: lead.name,
      logo: lead.logo ?? null,
      logoFallback: null,
      website: lead.url ?? null,
      twitter: lead.twitter ?? null,
      description: lead.description ?? null,
      category: lead.category ?? null,
      tvl: group.reduce((n, p) => n + (Number(p.tvl) || 0), 0),
      change1d: lead.change1d ?? null,
      change7d: lead.change7d ?? null,
      audits: lead.audits ?? null,
      defiLlamaSlug: lead.slug ?? null,
      variants: group.length > 1 ? group.map((p) => p.name) : null,
      hasLiveTvl: true,
    })
  }

  return out
}

export function computeStats(projects = []) {
  const withTvl = projects.filter((p) => Number(p.tvl) > 0)
  const categories = new Map()
  for (const p of projects) {
    const c = p.category || 'Other'
    categories.set(c, (categories.get(c) || 0) + 1)
  }
  return {
    total: projects.length,
    defiCount: withTvl.length,
    totalTvl: withTvl.reduce((n, p) => n + Number(p.tvl), 0),
    topCategory: [...categories.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    categories: [...categories.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  }
}
