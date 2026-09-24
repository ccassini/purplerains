import { asNum, canonicalPair } from './format'

/**
 * Compare USD quotes for the same base and quote contracts, in that order.
 * Spread is (high - low) / mid, as a percent. Pools missing a price are omitted.
 */
export function computeDislocations(pools) {
  const groups = new Map()
  for (const p of pools || []) {
    if (!p?.pairKey || asNum(p.price) == null || !p.base?.address || !p.quote?.address) continue
    // Reversing symbols changes the asset whose USD price is being compared.
    // Symbols alone also cannot distinguish unrelated token contracts.
    const assetKey = `${p.base.address.toLowerCase()}:${p.quote.address.toLowerCase()}`
    const list = groups.get(assetKey) || []
    list.push(p)
    groups.set(assetKey, list)
  }

  const rows = []
  for (const [assetKey, list] of groups) {
    if (list.length < 2) continue
    let lo = list[0]
    let hi = list[0]
    for (const p of list) {
      if (p.price < lo.price) lo = p
      if (p.price > hi.price) hi = p
    }
    const mid = (hi.price + lo.price) / 2
    if (!(mid > 0)) continue
    const spreadPct = ((hi.price - lo.price) / mid) * 100
    if (spreadPct <= 0) continue
    rows.push({
      id: assetKey,
      pair: list[0].pair,
      spreadPct,
      fees: list.reduce((s, p) => s + (p.fees || 0), 0) || null,
      depth: list.reduce((s, p) => s + (p.tvl || 0), 0) || null,
      buyAt: lo.dexName || lo.proto,
      buyPrice: lo.price,
      buyPool: lo.address,
      sellAt: hi.dexName || hi.proto,
      sellPrice: hi.price,
      sellPool: hi.address,
      pools: list.length,
    })
  }

  rows.sort((a, b) => b.spreadPct - a.spreadPct)
  return rows
}

export function filterQuery(q) {
  return String(q || '')
    .trim()
    .toLowerCase()
    .replace(/^[#/]+/, '')
}

export function matchesQuery(q, ...parts) {
  const needle = filterQuery(q)
  if (!needle) return true
  return parts.some((p) => p != null && String(p).toLowerCase().includes(needle))
}

export function searchCorpus({ q, pools, traders, tape, tokens }) {
  const needle = filterQuery(q)
  if (!needle) {
    return { pools: [], traders: [], tape: [], tokens: [] }
  }
  return {
    pools: (pools || []).filter((p) =>
      matchesQuery(needle, p.pair, p.address, p.dexName, p.proto, p.base?.symbol, p.quote?.symbol, p.base?.address, p.quote?.address),
    ),
    traders: (traders || []).filter((t) => matchesQuery(needle, t.address, ...(t.symbols || []))),
    tape: (tape || []).filter((f) =>
      matchesQuery(needle, f.symbol, f.wallet, f.tx, f.token, f.pair, f.pool, f.quoteSymbol),
    ),
    tokens: (tokens || []).filter((t) => matchesQuery(needle, t.symbol, t.token)),
  }
}

export function poolMarketOverview(pools) {
  let tvl = 0
  let volume = 0
  let fees = 0
  let swaps = 0
  let priced = 0
  for (const p of pools || []) {
    if (p.tvl != null) tvl += p.tvl
    if (p.volume != null) {
      volume += p.volume
      priced += 1
    }
    if (p.fees != null) fees += p.fees
    if (p.swaps != null) swaps += p.swaps
  }
  return {
    pools: (pools || []).length,
    tvl: tvl || null,
    volume: volume || null,
    fees: fees || null,
    swaps: swaps || null,
    priced,
  }
}

export function canonicalPairKey(a, b) {
  return canonicalPair(a, b)
}

export function asFiniteOrNull(v) {
  return asNum(v)
}

export function parseSizeInput(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[$,\s]/g, '')
  if (!t) return null
  const m = t.match(/^([0-9]*\.?[0-9]+)([kmb])?$/)
  if (!m) return asNum(t)
  let n = Number(m[1])
  if (!Number.isFinite(n)) return null
  if (m[2] === 'k') n *= 1e3
  else if (m[2] === 'm') n *= 1e6
  else if (m[2] === 'b') n *= 1e9
  return n
}

export function filterFills(fills, opts = {}) {
  const needle = filterQuery(opts.q)
  const minUsd = asNum(opts.minUsd)
  const maxUsd = asNum(opts.maxUsd)
  const minMcap = asNum(opts.minMcap)
  return (fills || []).filter((f) => {
    if (opts.side === 'buys' && f.side !== 'buy') return false
    if (opts.side === 'sells' && f.side !== 'sell') return false
    if (opts.side === 'lp' && f.kind !== 'add' && f.kind !== 'remove') return false
    if (opts.proto && opts.proto !== 'all' && f.proto && f.proto !== opts.proto) return false
    if (opts.selected?.type === 'wallet' && f.wallet !== opts.selected.id) return false
    if (opts.selected?.type === 'pool' && f.pool !== opts.selected.id) return false
    if (opts.selected?.type === 'token' && f.token !== opts.selected.id) return false
    if (opts.clean && (f.usd == null || f.usd < 1)) return false
    if (minUsd != null && (f.usd == null || f.usd < minUsd)) return false
    if (maxUsd != null && (f.usd == null || f.usd > maxUsd)) return false
    if (minMcap != null && (f.mcap == null || f.mcap < minMcap)) return false
    if (
      needle &&
      !matchesQuery(needle, f.symbol, f.wallet, f.tx, f.token, f.pair, f.pool, f.quoteSymbol)
    ) {
      return false
    }
    return true
  })
}
