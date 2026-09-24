import { POOL_CAP, TRADE_POOL_ROTATE } from './constants'
import { mergePools, normalizeDexPair, normalizeGeckoPool } from './poolNormalize'

export const samePool = (a, b) => Boolean(a && b && String(a).toLowerCase() === String(b).toLowerCase())

export function packGeckoSnapshot(payload, window) {
  if (!payload?.data) return []
  const items = Array.isArray(payload.data) ? payload.data : [payload.data]
  return items.map((item) => normalizeGeckoPool(item, payload.included || [], window, payload)).filter(Boolean)
}

export function packDexSnapshot(payload, window) {
  return (payload?.pairs || []).slice(0, 120).map((pair) => normalizeDexPair(pair, window, payload)).filter(Boolean)
}

/** Preserve successful sources during a partial failure without changing their age. */
export function retainMarketSnapshots(previous, bundle, keys = ['top', 'topNext', 'trending', 'fresh']) {
  let changed = false
  const next = { ...previous }
  for (const key of keys) {
    const snapshot = bundle[key]
    if (!snapshot) continue
    if ((snapshot.data || snapshot.pairs) !== (previous[key]?.data || previous[key]?.pairs) || snapshot.fetchedAt !== previous[key]?.fetchedAt) changed = true
    next[key] = snapshot
  }
  return changed ? next : previous
}

export function normalizeMarketSnapshots({ gecko, dex, focused }, window) {
  const focusedRows = [...focused].reverse().flatMap((entry) => entry.kind === 'gecko' ? packGeckoSnapshot(entry.payload, window) : packDexSnapshot(entry.payload, window))
  const indexed = ['top', 'topNext', 'trending'].flatMap((key) => packGeckoSnapshot(gecko[key], window))
  const freshRows = packGeckoSnapshot(gecko.fresh, window)
  const freshIds = new Set(freshRows.map((row) => row.address))
  const dexRows = Object.values(dex || {}).flatMap((snapshot) => packDexSnapshot(snapshot, window))
  const combined = mergePools([...focusedRows, ...indexed, ...dexRows, ...freshRows])
  return {
    pools: combined.slice(0, POOL_CAP),
    fresh: combined.filter((row) => freshIds.has(row.address)),
  }
}

export function chooseTokenPool(pools, token) {
  return pools.filter((pool) => samePool(pool.base?.address, token) || samePool(pool.quote?.address, token))
    .sort((a, b) => (b.tvl ?? -1) - (a.tvl ?? -1) || (b.volume ?? -1) - (a.volume ?? -1))[0] || null
}

export function geckoTradeContext(pool) {
  const symbols = {}
  if (pool?.base?.address && pool.base.symbol) symbols[pool.base.address.toLowerCase()] = pool.base.symbol
  if (pool?.quote?.address && pool.quote.symbol) symbols[pool.quote.address.toLowerCase()] = pool.quote.symbol
  return {
    poolAddress: pool?.address, pair: pool?.pair, dexId: pool?.dexId, proto: pool?.proto,
    baseAddress: pool?.base?.address, quoteAddress: pool?.quote?.address,
    baseSymbol: pool?.base?.symbol, quoteSymbol: pool?.quote?.symbol,
    mcap: pool?.mcap, mcapBasis: pool?.mcapBasis, symbols,
  }
}

/** Round-robin by stable pool id; changing volumes must not starve a pool. */
export function createPoolSampler(limit = TRADE_POOL_ROTATE) {
  let pending = []
  return {
    next(pools, priorityId) {
      const candidates = [...pools].sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, limit)
      const background = candidates.filter((pool) => !samePool(pool.address, priorityId))
      const rows = background.length ? background : candidates
      const byId = new Map(rows.map((pool) => [pool.address.toLowerCase(), pool]))
      pending = pending.filter((id) => byId.has(id))
      if (!pending.length) pending = [...byId.keys()]
      return byId.get(pending.shift()) || null
    },
  }
}
