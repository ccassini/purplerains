import { NATIVE, WMON } from './constants'
import { isMonadNetworkId, isMonadPair } from './chainLock'
import { asNum, canonicalPair, dexLabel, parseFeePct, protoFromDexId } from './format'

function includedMap(included) {
  const tokens = new Map()
  const dexes = new Map()
  for (const row of included || []) {
    if (row?.type === 'token' && row.id) tokens.set(row.id, row.attributes || {})
    if (row?.type === 'dex' && row.id) dexes.set(row.id, row.attributes || {})
  }
  return { tokens, dexes }
}

function tokenFromRel(rel, tokens) {
  const id = rel?.data?.id
  if (!id) return { address: null, symbol: null, name: null }
  const attr = tokens.get(id) || {}
  const address = attr.address ? String(attr.address).toLowerCase() : id.split('_').pop()
  return {
    address,
    symbol: attr.symbol || null,
    name: attr.name || null,
    image: attr.image_url || null,
  }
}

function txnCount(txns, key) {
  if (!txns || !txns[key]) return null
  const buys = nonNegative(txns[key].buys)
  const sells = nonNegative(txns[key].sells)
  return buys != null && sells != null ? buys + sells : null
}

function nonNegative(value) {
  const number = asNum(value)
  return number != null && number >= 0 ? number : null
}

function snapshotMetadata(metadata) {
  return { fetchedAt: nonNegative(metadata?.fetchedAt), fromCache: metadata?.fromCache === true }
}

/**
 * GeckoTerminal pool resource → market row.
 * Unavailable numbers stay null.
 */
export function normalizeGeckoPool(item, included, geckoWindow = 'h24', metadata = {}) {
  if (!item) return null
  if (item.id && !isMonadNetworkId(item.id)) return null
  const a = item.attributes || {}
  const { tokens, dexes } = includedMap(included)
  const base = tokenFromRel(item.relationships?.base_token, tokens)
  const quote = tokenFromRel(item.relationships?.quote_token, tokens)
  const dexId = item.relationships?.dex?.data?.id || null
  const dexName = dexes.get(dexId)?.name || dexLabel(dexId)
  const feePct = parseFeePct(a.name)
  const volume = asNum(a.volume_usd?.[geckoWindow])
  const tvl = asNum(a.reserve_in_usd)
  const change = asNum(a.price_change_percentage?.[geckoWindow])
  const created = a.pool_created_at ? Date.parse(a.pool_created_at) : null
  const address = a.address ? String(a.address).toLowerCase() : null
  const swaps = txnCount(a.transactions, geckoWindow)
  const buys = asNum(a.transactions?.[geckoWindow]?.buys)
  const sells = asNum(a.transactions?.[geckoWindow]?.sells)
  const fees = volume != null && feePct != null ? volume * (feePct / 100) : null
  const price = nonNegative(a.base_token_price_usd)
  const marketCap = nonNegative(a.market_cap_usd)
  const fdv = nonNegative(a.fdv_usd)

  return {
    id: address || item.id,
    address,
    pair: a.name?.replace(/\s+\d+(?:\.\d+)?%$/, '').trim() || `${base.symbol || '—'} / ${quote.symbol || '—'}`,
    pairKey: canonicalPair(base.symbol, quote.symbol),
    proto: protoFromDexId(dexId),
    dexId,
    dexName,
    feePct,
    tvl,
    volume,
    fees,
    feesBasis: fees != null ? 'gross trading-fee estimate, not LP net earnings' : null,
    swaps,
    buys,
    sells,
    adds: null,
    removes: null,
    lpCount: null,
    netFlow: null,
    price,
    quotePrice: nonNegative(a.quote_token_price_usd),
    change,
    created: Number.isFinite(created) ? created : null,
    marketCap,
    fdv,
    mcap: marketCap ?? fdv,
    mcapBasis: marketCap != null ? 'market_cap' : fdv != null ? 'fdv' : null,
    base,
    quote,
    source: 'gecko',
    provider: 'GeckoTerminal',
    ...snapshotMetadata(metadata),
  }
}

export function normalizeDexPair(pair, geckoWindow = 'h24', metadata = {}) {
  if (!pair?.pairAddress) return null
  if (!isMonadPair(pair)) return null
  const volKey = geckoWindow === 'h1' ? 'h1' : 'h24'
  const chKey = volKey
  const feePct = asNum(pair.fee) != null ? Number(pair.fee) : parseFeePct(`${pair.labels?.join(' ') || ''}`)
  const volume = asNum(pair.volume?.[volKey])
  const tvl = asNum(pair.liquidity?.usd)
  const change = asNum(pair.priceChange?.[chKey])
  const created = asNum(pair.pairCreatedAt)
  const base = {
    address: pair.baseToken?.address ? String(pair.baseToken.address).toLowerCase() : null,
    symbol: pair.baseToken?.symbol || null,
    name: pair.baseToken?.name || null,
  }
  const quote = {
    address: pair.quoteToken?.address ? String(pair.quoteToken.address).toLowerCase() : null,
    symbol: pair.quoteToken?.symbol || null,
    name: pair.quoteToken?.name || null,
  }
  const txns = pair.txns?.[volKey]
  const buys = asNum(txns?.buys)
  const sells = asNum(txns?.sells)
  const swaps = txnCount(pair.txns, volKey)
  const marketCap = nonNegative(pair.marketCap)
  const fdv = nonNegative(pair.fdv)

  return {
    id: String(pair.pairAddress).toLowerCase(),
    address: String(pair.pairAddress).toLowerCase(),
    pair: `${base.symbol || '—'} / ${quote.symbol || '—'}`,
    pairKey: canonicalPair(base.symbol, quote.symbol),
    proto: protoFromDexId(pair.dexId),
    dexId: pair.dexId || null,
    dexName: pair.dexId || null,
    feePct,
    tvl,
    volume,
    fees: volume != null && feePct != null ? volume * (feePct / 100) : null,
    feesBasis: volume != null && feePct != null ? 'gross trading-fee estimate, not LP net earnings' : null,
    swaps,
    buys,
    sells,
    adds: null,
    removes: null,
    lpCount: null,
    netFlow: null,
    price: nonNegative(pair.priceUsd),
    // The official schema does not specify priceNative's denomination.
    quotePrice: null,
    change,
    created: created != null ? created : null,
    marketCap,
    fdv,
    mcap: marketCap ?? fdv,
    mcapBasis: marketCap != null ? 'market_cap' : fdv != null ? 'fdv' : null,
    base,
    quote,
    url: pair.url || null,
    source: 'dexscreener',
    provider: 'DEX Screener',
    ...snapshotMetadata(metadata),
  }
}

export function mergePools(rows) {
  const map = new Map()
  for (const row of rows) {
    if (!row?.id) continue
    const prev = map.get(row.id)
    if (!prev) {
      map.set(row.id, row)
      continue
    }
    const prevTime = nonNegative(prev.fetchedAt)
    const nextTime = nonNegative(row.fetchedAt)
    let useNext
    if (prevTime != null || nextTime != null) {
      useNext = (nextTime ?? -1) > (prevTime ?? -1)
        || (nextTime === prevTime && row.source === 'gecko' && prev.source !== 'gecko')
    } else {
      const prevTvl = nonNegative(prev.tvl) ?? -1
      const nextTvl = nonNegative(row.tvl) ?? -1
      useNext = nextTvl > prevTvl || (nextTvl === prevTvl && row.source === 'gecko' && prev.source !== 'gecko')
    }
    // Keep one coherent response: a missing fresh value is not an old value.
    if (useNext) map.set(row.id, row)
  }
  return [...map.values()]
}

export function marksFromPools(pools) {
  const marks = Object.create(null)
  const baseMetadata = Object.create(null)
  const prefer = (next, prev) => {
    if (!prev) return true
    if ((next.usd != null) !== (prev.usd != null)) return next.usd != null
    const nextTvl = nonNegative(next.liquidity) ?? -1
    const prevTvl = nonNegative(prev.liquidity) ?? -1
    if (nextTvl !== prevTvl) return nextTvl > prevTvl
    return (nonNegative(next.fetchedAt) ?? -1) > (nonNegative(prev.fetchedAt) ?? -1)
  }
  const put = (address, patch, base = false) => {
    if (!address) return
    const key = String(address).toLowerCase()
    if (prefer(patch, marks[key])) marks[key] = patch
    if (base && prefer(patch, baseMetadata[key])) baseMetadata[key] = patch
  }

  for (const p of pools || []) {
    const pairUrl = p.url || (p.address ? `https://dexscreener.com/monad/${p.address}` : null)
    put(p.base?.address, {
      usd: nonNegative(p.price),
      symbol: p.base?.symbol,
      mcap: p.mcap,
      marketCap: p.marketCap,
      fdv: p.fdv,
      mcapBasis: p.mcapBasis,
      liquidity: p.tvl,
      change24: p.change,
      pairUrl,
      pairAddress: p.address,
      source: p.source,
      provider: p.provider,
      fetchedAt: p.fetchedAt,
    }, true)
    put(p.quote?.address, {
      usd: nonNegative(p.quotePrice),
      symbol: p.quote?.symbol,
      liquidity: p.tvl,
      pairUrl,
      pairAddress: p.address,
      source: p.source,
      provider: p.provider,
      fetchedAt: p.fetchedAt,
    })
  }

  // A token may have its best USD mark as a quote. Capitalization must still
  // come from a pool where this exact token is the base, independent of order.
  for (const [address, metadata] of Object.entries(baseMetadata)) {
    Object.assign(marks[address], {
      mcap: metadata.mcap,
      marketCap: metadata.marketCap,
      fdv: metadata.fdv,
      mcapBasis: metadata.mcapBasis,
    })
  }

  if (marks[WMON]?.usd != null && marks[NATIVE]?.usd == null) {
    marks[NATIVE] = { ...marks[WMON], symbol: 'MON' }
  }
  if (marks[NATIVE]?.usd != null && marks[WMON]?.usd == null) {
    marks[WMON] = { ...marks[NATIVE], symbol: 'WMON' }
  }

  return marks
}

function poolSortValue(row, sortId) {
  if (sortId === 'created') return row.created
  if (sortId === 'fee') return row.feePct
  if (sortId === 'change') return row.change
  if (sortId === 'disloc') return row.tvl
  return row[sortId]
}

export function sortPools(rows, sortId, dir = 'desc') {
  const sign = dir === 'asc' ? 1 : -1
  return rows.slice().sort((a, b) => {
    const av = poolSortValue(a, sortId)
    const bv = poolSortValue(b, sortId)
    const an = av == null ? -Infinity : av
    const bn = bv == null ? -Infinity : bv
    if (bn === an) return (b.tvl ?? 0) - (a.tvl ?? 0)
    return sign === 1 ? an - bn : bn - an
  })
}
