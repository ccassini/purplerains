import { matchesQuery } from './marketMath'

export const TERMINAL_PAGE_SIZE = 18

export function activityFromSearch(search) {
  const tab = new URLSearchParams(search).get('tab')?.toLowerCase()
  return ['perp', 'transfers', 'blocks'].includes(tab) ? tab : 'swaps'
}

export function marketFromSearch(search) {
  const params = new URLSearchParams(search)
  const market = params.get('market')?.toLowerCase()
  if (['pools', 'fresh', 'wallets', 'tokens', 'compare', 'tvl'].includes(market)) return market
  return params.get('tab')?.toLowerCase() === 'tvl' ? 'tvl' : 'pools'
}

export function filterChainRows(rows, type, query, wallet = null) {
  const address = wallet?.toLowerCase()
  return rows.filter((row) => {
    if (type === 'transfers') {
      return (!address || row.from?.toLowerCase() === address || row.to?.toLowerCase() === address)
        && matchesQuery(query, row.hash, row.from, row.to, 'MON', row.blockNumber)
    }
    return matchesQuery(query, row.number, row.hash, row.proposerId, row.proposerValidator?.name, row.proposerValidator?.address)
  })
}

export function summarizeWalletTransfers(rows, wallet) {
  const address = wallet?.toLowerCase()
  const summary = { count: 0, incoming: 0, outgoing: 0, received: 0, sent: 0, lastTs: null }
  if (!address) return summary
  for (const row of rows || []) {
    const incoming = row.to?.toLowerCase() === address
    const outgoing = row.from?.toLowerCase() === address
    if ((!incoming && !outgoing) || !Number.isFinite(row.amount) || row.amount <= 0) continue
    summary.count += 1
    if (incoming) { summary.incoming += 1; summary.received += row.amount }
    if (outgoing) { summary.outgoing += 1; summary.sent += row.amount }
    if (Number.isFinite(row.ts)) summary.lastTs = Math.max(summary.lastTs ?? 0, row.ts)
  }
  return summary
}

export function filterMarketRows(rows, query, venue = 'all') {
  return rows.filter((row) => (venue === 'all' || row.dexId === venue)
    && matchesQuery(query, row.pair, row.symbol, row.address, row.token, row.dexName, row.base?.symbol, row.quote?.symbol, row.base?.address, row.quote?.address))
}

export function mergeSearchPools(local, remote) {
  const result = new Map()
  for (const pool of [...local, ...remote]) {
    const key = String(pool.address || pool.id || '').toLowerCase()
    const previous = result.get(key)
    if (key && (!previous || (pool.fetchedAt ?? -1) > (previous.fetchedAt ?? -1))) result.set(key, pool)
  }
  return [...result.values()]
}

export function paginateRows(rows, requestedPage, size = TERMINAL_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const page = Math.max(1, Math.min(pages, requestedPage))
  const start = (page - 1) * size
  return { rows: rows.slice(start, start + size), page, pages, start: rows.length ? start + 1 : 0, end: Math.min(start + size, rows.length), total: rows.length }
}

export function selectionLabel(selected, pools, tokens) {
  if (!selected) return ''
  if (selected.type === 'pool') return pools.find((row) => row.address === selected.id || row.id === selected.id)?.pair || `${selected.id.slice(0, 6)}…${selected.id.slice(-4)}`
  if (selected.type === 'token') return tokens.find((row) => row.token === selected.id)?.symbol || `${selected.id.slice(0, 6)}…${selected.id.slice(-4)}`
  return `${selected.id.slice(0, 6)}…${selected.id.slice(-4)}`
}
