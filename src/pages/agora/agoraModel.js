import { hashInt } from '../../utils/worldShared'

export const AGORA_LOGO = '/agora/agora%20logo.png'
export const HISTORY_LIMIT = 150
export const BATCH_LIMIT = 64
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export function makeNodes(cities) {
  return cities.map((city) => ({ ...city, id: `${city.city}:${city.country}`, logo: AGORA_LOGO }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function transferId(row) {
  return `${row.chainId}:${String(row.txHash).toLowerCase()}:${row.logIndex ?? 0}`
}

// Addresses get stable illustrative anchors. Blockchain logs contain no city data.
export function mapTransfer(row, nodes, receivedAt = Date.now()) {
  if (!nodes.length) return null
  const from = String(row.from || '').toLowerCase()
  const to = String(row.to || '').toLowerCase()
  const fromNode = nodes[hashInt(from) % nodes.length]
  const toNode = nodes[hashInt(to) % nodes.length]
  return {
    ...row, id: transferId(row), from, to, fromNode, toNode,
    startLat: fromNode.lat, startLng: fromNode.lon,
    endLat: toNode.lat, endLng: toNode.lon,
    kind: from === ZERO_ADDRESS ? 'mint' : to === ZERO_ADDRESS ? 'burn' : 'transfer',
    receivedAt: row.receivedAt || receivedAt,
  }
}

export function acceptTransfers(rows, nodes, seen, receivedAt) {
  const fresh = []
  for (const row of rows) {
    const id = transferId(row)
    if (seen.has(id)) continue
    const mapped = mapTransfer(row, nodes, receivedAt)
    if (!mapped) continue
    seen.add(id)
    fresh.push(mapped)
  }
  while (seen.size > 4096) seen.delete(seen.values().next().value)
  // Arrival order is meaningful across chains; their block heights are not comparable.
  return fresh.sort((a, b) => b.receivedAt - a.receivedAt || (a.chainId === b.chainId ? b.blockNumber - a.blockNumber || b.logIndex - a.logIndex : 0))
}

export function filterTransfers(rows, chain = 'all', kind = 'all', nodeId = null) {
  return rows.filter((row) => (chain === 'all' || String(row.chainId) === chain)
    && (kind === 'all' || row.kind === kind)
    && (!nodeId || row.fromNode.id === nodeId || row.toNode.id === nodeId))
}

export function summarizeTransfers(rows) {
  return {
    count: rows.length,
    volume: rows.reduce((sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0), 0),
  }
}

export function connectionSummary(statuses, now = Date.now()) {
  const connected = statuses.filter((s) => s.status === 'live' && now - (s.lastSuccessAt || 0) < 30_000).length
  const catchingUp = statuses.some((s) => s.status === 'catching-up')
  const errors = statuses.some((s) => s.status === 'error')
  const stale = statuses.some((s) => s.lastSuccessAt && now - s.lastSuccessAt >= 30_000)
  const label = connected === statuses.length && connected > 0 ? 'Live'
    : connected > 0 ? 'Partial coverage' : catchingUp ? 'Catching up' : errors || stale ? 'Reconnecting' : 'Connecting'
  return { connected, total: statuses.length, label, live: connected > 0 }
}

export function shortAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—'
}

export function formatAmount(value, compact = false) {
  if (!Number.isFinite(Number(value))) return '—'
  if (Number(value) > 0 && Number(value) < 0.0001) return '<0.0001'
  return new Intl.NumberFormat('en-US', { notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 2 : 4 }).format(value)
}

export function exactAmount(value) {
  const [integer, fraction] = String(value || '0').split('.')
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`
}

export function explorerLink(chain, type, value) {
  const base = chain?.explorerUrl || chain?.explorer
  if (typeof base !== 'string' || !/^https:\/\//.test(base)) return null
  if (!['tx', 'address'].includes(type) || !/^0x[a-fA-F0-9]+$/.test(value || '')) return null
  return `${base.replace(/\/$/, '')}/${type}/${value}`
}
