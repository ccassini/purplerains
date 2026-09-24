import { createTerminalPublisher } from './terminalPerformance'

const address = (value) => typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null
const finite = (value) => {
  if (!['number', 'string', 'bigint'].includes(typeof value) || typeof value === 'string' && !value.trim()) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}
const integer = (value) => {
  const number = finite(value)
  return Number.isSafeInteger(number) ? number : null
}
const observedTime = (value) => {
  const number = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : finite(value)
  return Number.isFinite(number) && number >= 0 && number <= 8.64e15 ? number : null
}

function nativeAmount(value) {
  let exact
  if (typeof value === 'bigint' || typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) {
    const wei = BigInt(value)
    if (wei <= 0n) return null
    const whole = wei / 1000000000000000000n
    const fraction = (wei % 1000000000000000000n).toString().padStart(18, '0').replace(/0+$/, '')
    exact = `${whole}${fraction ? `.${fraction}` : ''}`
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    exact = String(value)
  } else if (typeof value === 'string' && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) {
    exact = value.trim()
  } else return null
  const amount = Number(exact)
  return Number.isFinite(amount) && amount > 0 ? { amount, amountExact: exact } : null
}

const EXCLUDED_KINDS = new Set(['defi', 'nft', 'contractdeploy', 'deploy', 'swap'])
function transferClassification(tx) {
  if (!tx || tx.isSimulated || tx.simulated || tx.source === 'simulation' || tx.to === null
      || tx.isDexTx || tx.isConfirmedSwap || EXCLUDED_KINDS.has(String(tx.category).toLowerCase())
      || EXCLUDED_KINDS.has(String(tx.type).toLowerCase())) return 'excluded'
  if (['reverted', 'failed', '0x0'].includes(String(tx.status).toLowerCase()) || tx.status === 0 || tx.status === 0n || tx.status === false) return 'excluded'
  const calldata = [tx.input, tx.data].filter((value) => value != null)
  if (calldata.some((value) => typeof value !== 'string')) return 'unknown'
  if (calldata.some((value) => !['', '0x'].includes(value.toLowerCase()))
      || [tx.category, tx.type].some((value) => ['contractcall', 'contract'].includes(String(value).toLowerCase()))) return 'contract-value'
  if (calldata.length || [tx.category, tx.type, tx.categoryDisplay].some((value) => String(value).toLowerCase() === 'transfer')) return 'transfer'
  return 'native-value'
}

/** Existing decimal values are MON; raw hex/bigint values are wei. */
export function normalizeTerminalTransfer(tx) {
  const hash = address(tx?.hash)
  const kind = transferClassification(tx)
  if (!hash || kind === 'excluded' || kind === 'unknown') return null
  const value = nativeAmount(tx.value)
  if (!value) return null
  const timestamp = observedTime(tx.timestamp)
  const receivedAt = observedTime(tx.receivedAt)
  const calldata = [tx.input, tx.data].find((value) => typeof value === 'string' && /^0x[0-9a-f]{8}/i.test(value))
  return {
    id: `transfer:${hash}`, hash, from: address(tx.from), to: address(tx.to), ...value,
    symbol: 'MON', kind, isContractCall: kind === 'native-value' ? null : kind === 'contract-value',
    methodSignature: calldata ? calldata.slice(0, 10).toLowerCase() : null,
    timestamp, receivedAt, ts: timestamp ?? receivedAt,
    blockNumber: integer(tx.blockNumber),
  }
}

export function normalizeTerminalBlock(block) {
  const number = integer(block?.number)
  if (number == null) return null
  const timestamp = observedTime(block.timestamp)
  const receivedAt = observedTime(block.receivedAt)
  const gasUsed = integer(block.gasUsed)
  const gasLimit = integer(block.gasLimit)
  const baseFeePerGas = integer(block.baseFeePerGas)
  const suppliedBurn = finite(block.burnedMon)
  const derivedBurn = gasUsed != null && baseFeePerGas != null ? gasUsed * baseFeePerGas / 1e18 : null
  return {
    id: `block:${number}`, number, hash: address(block.hash), timestamp, receivedAt, ts: timestamp ?? receivedAt,
    transactionCount: integer(block.transactionCount), gasUsed, gasLimit, baseFeePerGas,
    burnedMon: suppliedBurn ?? (Number.isFinite(derivedBurn) ? derivedBurn : null),
    networkUtilization: finite(block.networkUtilization) ?? (gasUsed != null && gasLimit > 0 ? gasUsed / gasLimit * 100 : null),
    proposerId: integer(block.proposerId ?? block.proposerValidator?.id),
    proposerValidator: block.proposerValidator && typeof block.proposerValidator === 'object' ? { ...block.proposerValidator } : null,
  }
}

export function summarizeTerminalValidators(leaderboard) {
  const rows = Object.entries(leaderboard?.validators || {}).map(([key, row]) => ({
    key: String(row?.key ?? key), id: integer(row?.id), name: typeof row?.name === 'string' ? row.name : 'Unknown',
    logo: row?.logo || null, blocks: integer(row?.blocks) ?? 0, lastSeen: observedTime(row?.lastSeen),
  })).sort((a, b) => b.blocks - a.blocks || (b.lastSeen ?? 0) - (a.lastSeen ?? 0) || a.key.localeCompare(b.key))
  const firstSeen = observedTime(leaderboard?.firstSeenAt)
  const lastSeen = observedTime(leaderboard?.lastSeenAt)
  return {
    validators: rows.slice(0, 12),
    validatorTotalBlocks: integer(leaderboard?.totalBlocks) ?? 0,
    validatorCount: rows.length,
    blockWindowMs: firstSeen != null && lastSeen != null ? Math.max(0, lastSeen - firstSeen) : 0,
  }
}

const shallowEqual = (a, b) => a === b || Boolean(a && b && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((key) => a[key] === b[key]))
const sameRow = (a, b) => Boolean(a && Object.keys(b).every((key) => key === 'proposerValidator' ? shallowEqual(a[key], b[key]) : a[key] === b[key]))
const newestTransfer = (a, b) => (b.ts ?? -1) - (a.ts ?? -1) || (b.blockNumber ?? -1) - (a.blockNumber ?? -1) || a.id.localeCompare(b.id)
const newestBlock = (a, b) => b.number - a.number

function mergeObserved(previous, incoming) {
  if (!previous) return incoming
  const merged = { ...previous }
  for (const [key, value] of Object.entries(incoming)) {
    if (value == null) continue
    if (key === 'proposerValidator' && previous.proposerValidator) {
      const prior = previous.proposerValidator
      // A late unknown-ID lookup cannot erase an already named validator.
      if (prior.id != null && (value.id == null || value.name === 'Unknown Validator' || value.name === 'Unknown')) continue
      merged[key] = { ...prior, ...Object.fromEntries(Object.entries(value).filter(([, item]) => item != null)) }
    } else merged[key] = value
  }
  const kindEvidence = { 'native-value': 0, transfer: 1, 'contract-value': 2 }
  if (kindEvidence[previous.kind] > kindEvidence[incoming.kind]) {
    merged.kind = previous.kind
    merged.isContractCall = previous.isContractCall
  }
  merged.ts = merged.timestamp ?? merged.receivedAt
  if (merged.proposerValidator?.id != null) merged.proposerId = integer(merged.proposerValidator.id)
  return sameRow(previous, merged) ? previous : merged
}

function updateRows(previous, input, normalize, capacity, compare, exclude) {
  if (!Array.isArray(input) || !input.length) return previous
  const next = new Map(previous)
  for (const item of input) {
    const row = normalize(item)
    if (!row) {
      const excludedId = exclude?.(item)
      if (excludedId) next.delete(excludedId)
      continue
    }
    next.set(row.id, mergeObserved(next.get(row.id), row))
  }
  if (next.size > capacity) {
    const retained = new Set([...next.values()].sort(compare).slice(0, capacity).map((row) => row.id))
    for (const key of next.keys()) if (!retained.has(key)) next.delete(key)
  }
  return previous.size === next.size && [...previous].every(([key, value]) => next.get(key) === value) ? previous : next
}

/** No transaction queue or fetches: retain at most 200 transfers and 100 blocks. */
export function createTerminalChainStore() {
  let transfers = new Map()
  let blocks = new Map()
  let summary = summarizeTerminalValidators(null)
  let published = { transfers: [], blocks: [], ...summary }
  let publishedTransfers = transfers
  let publishedBlocks = blocks
  let publishedSummary = summary
  return {
    get retainedCounts() { return { transfers: transfers.size, blocks: blocks.size } },
    update(input = {}) {
      const nextTransfers = updateRows(transfers, input.transactions, normalizeTerminalTransfer, 200, newestTransfer,
        (tx) => transferClassification(tx) === 'excluded' && address(tx?.hash) ? `transfer:${address(tx.hash)}` : null)
      const nextBlocks = updateRows(blocks, input.blocks, normalizeTerminalBlock, 100, newestBlock)
      let nextSummary = summary
      if (input.validatorLeaderboard !== undefined) {
        const candidate = summarizeTerminalValidators(input.validatorLeaderboard)
        const unchanged = candidate.validatorTotalBlocks === summary.validatorTotalBlocks && candidate.validatorCount === summary.validatorCount
          && candidate.blockWindowMs === summary.blockWindowMs && candidate.validators.length === summary.validators.length
          && candidate.validators.every((row, index) => shallowEqual(row, summary.validators[index]))
        if (!unchanged) nextSummary = candidate
      }
      const changed = nextTransfers !== transfers || nextBlocks !== blocks || nextSummary !== summary
      transfers = nextTransfers; blocks = nextBlocks; summary = nextSummary
      return changed
    },
    snapshot() {
      if (transfers === publishedTransfers && blocks === publishedBlocks && summary === publishedSummary) return published
      published = {
        transfers: transfers === publishedTransfers ? published.transfers : [...transfers.values()].sort(newestTransfer),
        blocks: blocks === publishedBlocks ? published.blocks : [...blocks.values()].sort(newestBlock),
        ...summary,
      }
      publishedTransfers = transfers; publishedBlocks = blocks; publishedSummary = summary
      return published
    },
  }
}

/** Shared lifecycle for the hook: coalesce publication and suspend it while hidden. */
export function createTerminalChainFeed({ store, onSnapshot, visibilityTarget } = {}) {
  const retained = store || createTerminalChainStore()
  let disposed = false
  const publisher = createTerminalPublisher(() => onSnapshot(retained.snapshot()), { intervalMs: 500 })
  const visibility = () => publisher.setActive(visibilityTarget?.visibilityState !== 'hidden' && visibilityTarget?.hidden !== true)
  visibility()
  // An effect restart may inherit retained data whose old timer was cancelled.
  publisher.request()
  visibilityTarget?.addEventListener('visibilitychange', visibility)
  return {
    update(input) {
      if (disposed) return false
      const changed = retained.update(input)
      if (changed) publisher.request()
      return changed
    },
    dispose() {
      disposed = true
      publisher.dispose()
      visibilityTarget?.removeEventListener('visibilitychange', visibility)
    },
  }
}
