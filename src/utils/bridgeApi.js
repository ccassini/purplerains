/**
 * Bridge inflows into Monad, from every public per-transfer feed found.
 *
 * Two sources, merged and de-duplicated by destination transaction hash:
 *
 *  - LI.FI  (li.quest/v1/analytics/transfers) — an aggregator, so one call
 *    covers Across, Mayan, Polymer, Relay, NEAR, Glacis and whatever else it
 *    routes through. This is the source that sees institutional-size flow.
 *  - Relay  (api.relay.link/requests/v2)      — direct, and the freshest: it
 *    publishes a request the moment it settles, ahead of the aggregator.
 *
 * Both are public, keyless and send `access-control-allow-origin: *`.
 *
 * Rejected after testing: DefiLlama's bridges API (402 on every endpoint since
 * it went paid), deBridge stats (takes an order id, not a feed), Across
 * (no public deposits endpoint), Hyperlane explorer (no JSON API).
 * Wormholescan answers, but its chain numbering does not yet list Monad.
 *
 * MEASURED, 1000 consecutive LI.FI transfers on 2026-07-26: 624 were genuine
 * cross-chain inflows — median $50, p90 $5.0k, p99 $100k, max $2.11M, with 2
 * above $500k and 1 above $1M. That is what the creature tiers are cut
 * against, and it is why the brief's original figures are usable: a Relay-only
 * feed had shown nothing above $4.5k and made them look impossible.
 */

const RELAY_REQUESTS = 'https://api.relay.link/requests/v2'
const LIFI_TRANSFERS = 'https://li.quest/v1/analytics/transfers'
const WORMHOLE_OPS = 'https://api.wormholescan.io/api/v1/operations'

/** Monad in Wormhole's own chain numbering. */
export const WORMHOLE_MONAD = 48
const WORMHOLE_LIMIT = 50

/**
 * Wormhole chain ids differ from EVM ids entirely.
 * @type {Record<number, string>}
 */
const WORMHOLE_CHAIN_NAMES = {
  1: 'Solana',
  2: 'Ethereum',
  4: 'BNB Chain',
  5: 'Polygon',
  6: 'Avalanche',
  10: 'Fantom',
  13: 'Klaytn',
  14: 'Celo',
  16: 'Moonbeam',
  21: 'Sui',
  22: 'Aptos',
  23: 'Arbitrum',
  24: 'Optimism',
  30: 'Base',
  34: 'Scroll',
  36: 'Blast',
  45: 'World Chain',
  48: 'Monad',
}

/** Monad mainnet. Same-chain requests are swaps, not bridge inflows. */
export const MONAD_CHAIN_ID = 143
/** Relay rejects a larger page; LI.FI is happy with a big one. */
const RELAY_LIMIT = 50
const LIFI_LIMIT = 200

/**
 * Source chains seen in the live feeds, plus the majors. Solana appears under
 * two different ids because the two bridges number it differently.
 * @type {Record<number, string>}
 */
const CHAIN_NAMES = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BNB Chain',
  137: 'Polygon',
  143: 'Monad',
  146: 'Sonic',
  480: 'World Chain',
  988: 'Movement',
  999: 'HyperEVM',
  1329: 'Sei',
  4663: 'Hemi',
  8453: 'Base',
  42161: 'Arbitrum',
  43114: 'Avalanche',
  59144: 'Linea',
  81457: 'Blast',
  534352: 'Scroll',
  7777777: 'Zora',
  792703809: 'Solana',
  1151111081099710: 'Solana',
}

/**
 * Human name for a chain id. Never invents one: an unknown id is reported as
 * an unknown id.
 *
 * @param {number | null | undefined} id
 * @returns {string}
 */
export function chainName(id) {
  if (id == null || !Number.isFinite(Number(id))) return 'unknown chain'
  return CHAIN_NAMES[Number(id)] || `chain ${id}`
}

/** Display names for the routing tools LI.FI reports. */
const TOOL_NAMES = {
  relaydepository: 'Relay',
  across: 'Across',
  mayan: 'Mayan',
  mayanfastmctp: 'Mayan',
  polymer: 'Polymer',
  polymerstandard: 'Polymer',
  near: 'NEAR Intents',
  glacis: 'Glacis',
  stargate: 'Stargate',
  hop: 'Hop',
  fly: 'Fly',
}

/**
 * @param {string | null | undefined} tool
 * @returns {string}
 */
export function bridgeName(tool) {
  if (!tool) return 'bridge'
  return TOOL_NAMES[String(tool).toLowerCase()] || String(tool)
}

/**
 * @typedef {object} BridgeInflow
 * @property {string} id de-duplication key — the destination tx hash when the
 *   feed publishes one, otherwise the source's own request id
 * @property {number} usd value landing on Monad, in USD
 * @property {string} symbol token received on Monad
 * @property {number} fromChainId
 * @property {string} fromChain human-readable source chain
 * @property {string} fromSymbol token sent on the source chain
 * @property {string} bridge routing tool that carried it
 * @property {number} at unix seconds the destination tx landed
 * @property {string | null} txHash destination transaction, if published
 */

/**
 * Normalize one Relay request into an inflow, or null when it is not an
 * inbound bridge transfer we can show honestly.
 *
 * @param {any} r
 * @returns {BridgeInflow | null}
 */
export function normalizeInflow(r) {
  if (!r?.id || r.status !== 'success') return null
  const meta = r?.data?.metadata
  const out = meta?.currencyOut
  const inn = meta?.currencyIn
  const fromChainId = Number(inn?.currency?.chainId)
  const toChainId = Number(out?.currency?.chainId)
  // Only genuine inflows: a Monad-to-Monad request is a swap, not a bridge.
  if (toChainId !== MONAD_CHAIN_ID) return null
  if (!Number.isFinite(fromChainId) || fromChainId === MONAD_CHAIN_ID) return null
  const usd = Number(out?.amountUsd)
  if (!Number.isFinite(usd) || usd <= 0) return null
  const outTx = Array.isArray(r?.data?.outTxs) ? r.data.outTxs[0] : null
  const txHash = outTx?.hash ? String(outTx.hash).toLowerCase() : null
  return {
    id: (txHash || String(r.id)).toLowerCase(),
    usd,
    symbol: String(out?.currency?.symbol || '?'),
    fromChainId,
    fromChain: chainName(fromChainId),
    fromSymbol: String(inn?.currency?.symbol || '?'),
    bridge: 'Relay',
    at: Number(outTx?.timestamp) || 0,
    txHash,
  }
}

/**
 * Normalize one LI.FI analytics transfer. Same contract as the Relay
 * normalizer, so the engine never learns which feed an animal came from.
 *
 * @param {any} t
 * @returns {BridgeInflow | null}
 */
export function normalizeLifiTransfer(t) {
  if (!t || t.status !== 'DONE') return null
  const send = t.sending || {}
  const recv = t.receiving || {}
  const fromChainId = Number(send.chainId)
  const toChainId = Number(recv.chainId)
  if (toChainId !== MONAD_CHAIN_ID) return null
  // LI.FI's toChain filter includes same-chain swaps; those are not bridges.
  if (!Number.isFinite(fromChainId) || fromChainId === MONAD_CHAIN_ID) return null
  const usd = Number(recv.amountUSD)
  if (!Number.isFinite(usd) || usd <= 0) return null
  const txHash = recv.txHash ? String(recv.txHash).toLowerCase() : null
  return {
    id: (txHash || String(t.transactionId || '')).toLowerCase(),
    usd,
    symbol: String(recv.token?.symbol || '?'),
    fromChainId,
    fromChain: chainName(fromChainId),
    fromSymbol: String(send.token?.symbol || '?'),
    bridge: bridgeName(t.tool),
    at: Number(recv.timestamp) || 0,
    txHash,
  }
}

/**
 * Normalize one Wormholescan operation. Same contract as the other
 * normalizers; `fromChainId` keeps Wormhole's numbering, so the name is
 * resolved here rather than through the EVM table.
 *
 * @param {any} o
 * @returns {BridgeInflow | null}
 */
export function normalizeWormholeOp(o) {
  const std = o?.content?.standarizedProperties
  if (!o?.id || std?.toChain !== WORMHOLE_MONAD) return null
  const data = o?.data || {}
  const usd = Number(data.usdAmount)
  if (!Number.isFinite(usd) || usd <= 0) return null
  const src = o?.sourceChain || {}
  const fromChainId = Number(src.chainId)
  if (!Number.isFinite(fromChainId) || fromChainId === WORMHOLE_MONAD) return null
  const at = src.timestamp ? Math.floor(Date.parse(src.timestamp) / 1000) : 0
  return {
    id: String(o.id).toLowerCase(),
    usd,
    symbol: String(data.symbol || '?'),
    fromChainId,
    fromChain: WORMHOLE_CHAIN_NAMES[fromChainId] || `Wormhole chain ${fromChainId}`,
    fromSymbol: String(data.symbol || '?'),
    bridge: 'Wormhole',
    at: Number.isFinite(at) ? at : 0,
    txHash: null,
  }
}

/**
 * @param {string} url
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<any | null>} null rather than throwing: one dead feed must
 *   never take the other down with it.
 */
async function getJson(url, signal) {
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Every inbound bridge transfer both feeds can see, newest first, with
 * duplicates collapsed. LI.FI and Relay overlap — Relay routes through LI.FI —
 * so the destination tx hash is the identity, and the entry that carries the
 * more specific bridge name wins.
 *
 * @param {{signal?: AbortSignal}} [opts]
 * @returns {Promise<BridgeInflow[]>}
 */
export async function fetchBridgeInflows(opts = {}) {
  const { signal } = opts
  const [lifi, relay, wormhole] = await Promise.all([
    getJson(`${LIFI_TRANSFERS}?toChain=${MONAD_CHAIN_ID}&limit=${LIFI_LIMIT}`, signal),
    getJson(`${RELAY_REQUESTS}?destinationChainId=${MONAD_CHAIN_ID}&limit=${RELAY_LIMIT}`, signal),
    getJson(`${WORMHOLE_OPS}?targetChain=${WORMHOLE_MONAD}&pageSize=${WORMHOLE_LIMIT}`, signal),
  ])

  /** @type {Map<string, BridgeInflow>} */
  const byId = new Map()
  for (const t of Array.isArray(lifi?.transfers) ? lifi.transfers : []) {
    const inflow = normalizeLifiTransfer(t)
    if (inflow?.id) byId.set(inflow.id, inflow)
  }
  for (const r of Array.isArray(relay?.requests) ? relay.requests : []) {
    const inflow = normalizeInflow(r)
    // LI.FI already named the underlying tool; do not overwrite it with 'Relay'.
    if (inflow?.id && !byId.has(inflow.id)) byId.set(inflow.id, inflow)
  }
  for (const o of Array.isArray(wormhole?.operations) ? wormhole.operations : []) {
    const inflow = normalizeWormholeOp(o)
    // Wormhole ids are VAA ids, disjoint from tx hashes — no cross-feed clash.
    if (inflow?.id && !byId.has(inflow.id)) byId.set(inflow.id, inflow)
  }

  return [...byId.values()].sort((a, b) => b.at - a.at)
}

/**
 * Split a fetched batch into what should animate NOW and the next watermark.
 *
 * Every feed returns a rolling history window (~250 transfers), most of it
 * identical from poll to poll. Without a time watermark the engine's bounded
 * seen-set eventually evicts old ids and the same transfers parade across the
 * water again — the exact bug this function exists to kill. Rules:
 *
 *  - watermark 0 (unarmed): nothing animates. If the batch is empty (feed
 *    blip / first tick aborted), stay unarmed — never invent a watermark of 1,
 *    or the next successful poll would dump the entire history as "fresh".
 *  - first non-empty sight: still nothing animates; arm to the newest `at`
 *    in that snapshot and wait for live arrivals after it.
 *  - afterwards: only inflows strictly newer than the watermark are fresh,
 *    each exactly once. Entries without a timestamp cannot be ordered honestly
 *    and are never staged.
 *
 * Callers should usually seed the watermark with Math.floor(Date.now()/1000)
 * at page open so even a late first poll cannot stage pre-open history.
 *
 * @param {ReadonlyArray<BridgeInflow>} inflows
 * @param {number} watermark unix seconds of the newest inflow already handled
 * @returns {{fresh: BridgeInflow[], next: number}}
 */
export function freshInflows(inflows, watermark) {
  const list = Array.isArray(inflows) ? inflows : []
  let newest = watermark
  for (const i of list) newest = Math.max(newest, i?.at || 0)
  if (watermark <= 0) {
    if (list.length === 0) return { fresh: [], next: 0 }
    return { fresh: [], next: Math.max(newest, 1) }
  }
  const fresh = list.filter((i) => (i?.at || 0) > watermark)
  return { fresh, next: Math.max(watermark, newest) }
}
