import { fillFromChainTx, isRejectedChainTx } from './deriveFill'

const normalized = (value) => typeof value === 'string' && value ? value.toLowerCase() : null
const validIndex = (value) => Number.isSafeInteger(value) && value >= 0
const sameQuantity = (a, b) => Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0
  && Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 1e-12
const dollarSize = (fill) => Number.isFinite(fill.usd) ? Math.abs(fill.usd) : 0

function eventGroup(fill) {
  const identity = [normalized(fill.tx), normalized(fill.wallet), normalized(fill.token), fill.side]
  if (fill.kind !== 'swap' || !['chain', 'gecko'].includes(fill.source)
      || !identity.every(Boolean) || !['buy', 'sell'].includes(fill.side)) return `single:${fill.id}`
  return JSON.stringify(identity)
}

function matchingEvidence(chain, indexed) {
  const cq = normalized(chain.quoteToken)
  const gq = normalized(indexed.quoteToken)
  if (cq && gq && cq !== gq) return null
  if (chain.block != null && indexed.block != null && chain.block !== indexed.block) return null
  if (validIndex(chain.logIndex) && validIndex(indexed.logIndex)) {
    return chain.logIndex === indexed.logIndex ? 'shared-log' : null
  }
  if (!sameQuantity(chain.amount, indexed.amount) || !cq || cq !== gq) return null
  // Both actual token legs can agree even when the indexer's USD valuation differs.
  if (chain.quoteAmount != null && indexed.quoteAmount != null) {
    return sameQuantity(chain.quoteAmount, indexed.quoteAmount) ? 'token-amounts' : null
  }
  return sameQuantity(chain.usd, indexed.usd) ? 'amount-and-usd' : null
}

function reconcileGroup(group) {
  const observations = [...group.observations.values()]
  const chains = observations.filter((entry) => entry.fill.source === 'chain')
  const indexed = observations.filter((entry) => entry.fill.source === 'gecko')
  const matches = new Map()
  const reverse = new Map()
  // An unusually busy same-asset transaction cannot make fingerprint matching quadratic.
  const indexedByLog = new Map()
  for (const row of indexed) {
    if (!validIndex(row.fill.logIndex)) continue
    const peers = indexedByLog.get(row.fill.logIndex) || []
    peers.push(row)
    indexedByLog.set(row.fill.logIndex, peers)
  }
  for (const chain of chains) {
    const candidates = observations.length <= 64 ? indexed : indexedByLog.get(chain.fill.logIndex) || []
    for (const other of candidates) {
      const evidence = matchingEvidence(chain.fill, other.fill)
      if (!evidence) continue
      const pair = { chain, indexed: other, evidence, key: JSON.stringify([chain.fill.id, other.fill.id]) }
      const forward = matches.get(chain.fill.id) || []
      const backward = reverse.get(other.fill.id) || []
      forward.push(pair); backward.push(pair)
      matches.set(chain.fill.id, forward); reverse.set(other.fill.id, backward)
    }
  }
  const strongest = (candidates) => candidates.some((pair) => pair.evidence === 'shared-log')
    ? candidates.filter((pair) => pair.evidence === 'shared-log') : candidates
  const merged = new Map()
  const hidden = new Set()
  const acceptedPairs = new Set()
  for (const possible of matches.values()) {
    const candidates = strongest(possible)
    if (candidates.length !== 1) continue
    const pair = candidates[0]
    const counterparts = strongest(reverse.get(pair.indexed.fill.id))
    if (counterparts.length !== 1 || counterparts[0] !== pair) continue
    // Eviction cannot turn a previously ambiguous partial transaction into a match.
    if (pair.evidence !== 'shared-log' && !group.allowFingerprints && !group.acceptedPairs.has(pair.key)) continue
    const chain = pair.chain.fill
    const indexedFill = pair.indexed.fill
    const fill = { ...indexedFill, sources: ['chain', 'gecko'], sourceIds: [chain.id, indexedFill.id], reconciliation: pair.evidence }
    for (const field of ['amount', 'usd', 'price', 'symbol', 'quoteAmount', 'quoteSymbol', 'block', 'logIndex', 'ts']) {
      if (fill[field] == null && chain[field] != null) fill[field] = chain[field]
    }
    merged.set(indexedFill.id, { fill, order: Math.min(pair.chain.order, pair.indexed.order), sourceIds: fill.sourceIds, group })
    hidden.add(chain.id)
    acceptedPairs.add(pair.key)
  }
  group.acceptedPairs = acceptedPairs
  const outputs = new Map()
  for (const row of observations) {
    if (hidden.has(row.fill.id)) continue
    outputs.set(row.fill.id, merged.get(row.fill.id) || { ...row, sourceIds: [row.fill.id], group })
  }
  return outputs
}

/** Keep the retained raw observations so a later ambiguous match can be undone. */
export function createTerminalFillStore({ capacity = 900 } = {}) {
  const limit = Math.max(1, Math.floor(capacity) || 900)
  const rows = new Map()
  const observations = new Map()
  const groups = new Map()
  const seen = new Set()
  const session = { started: Date.now(), fills: 0, usd: 0 }
  let dirty = false
  let arrived = new Set()
  let order = 0
  let lastChange = { newEvents: 0 }
  let priorityPool = null
  const priorityCapacity = Math.min(100, Math.max(1, Math.floor(limit / 4)))
  const prune = () => {
    const ranked = [...rows.values()].sort((a, b) => (a.fill.ts || 0) - (b.fill.ts || 0) || a.order - b.order)
    const retained = new Set(priorityPool
      ? ranked.filter((entry) => normalized(entry.fill.pool) === priorityPool).slice(-priorityCapacity)
      : [])
    // Indexed history arrives in bursts; preserve a bounded share of live RPC rows.
    const rpcRows = ranked.filter((entry) => entry.fill.source === 'chain' || entry.fill.sources?.includes('chain'))
    for (const entry of rpcRows.slice(-Math.max(1, Math.floor(limit / 3)))) {
      if (retained.size < limit) retained.add(entry)
    }
    for (let i = ranked.length - 1; i >= 0 && retained.size < limit; i -= 1) retained.add(ranked[i])
    const dropped = ranked.filter((entry) => !retained.has(entry))
    for (const entry of dropped) {
      rows.delete(entry.fill.id)
      const group = entry.group
      group.outputs.delete(entry.fill.id)
      group.allowFingerprints = false
      for (const id of entry.sourceIds) { observations.delete(id); group.observations.delete(id) }
      if (!group.observations.size) groups.delete(group.key)
    }
    // Stable tie order matters to accounting when two fills lack a log index.
    return [...retained].sort((a, b) => (b.fill.ts || 0) - (a.fill.ts || 0) || a.order - b.order).map((entry) => entry.fill)
  }
  return {
    session,
    get size() { return rows.size },
    get dirty() { return dirty },
    get lastChange() { return lastChange },
    get retainedObservationCount() { return observations.size },
    get retainedGroupCount() { return groups.size },
    // The caller requests publication when this returns true. Pruning still runs
    // once per batch, and clearing priority never resurrects evicted history.
    setPriorityPool(pool) {
      const next = normalized(pool)
      if (next === priorityPool) return false
      priorityPool = next
      dirty = true
      return true
    },
    remove(id) {
      const previous = observations.get(id)
      if (!previous) return false
      const group = groups.get(eventGroup(previous.fill))
      const oldCount = group.outputs.size
      let oldUsd = 0
      for (const row of group.outputs.values()) { rows.delete(row.fill.id); oldUsd += dollarSize(row.fill) }
      observations.delete(id)
      group.observations.delete(id)
      group.outputs = reconcileGroup(group)
      let newUsd = 0
      for (const row of group.outputs.values()) { rows.set(row.fill.id, row); newUsd += dollarSize(row.fill) }
      if (!group.observations.size) groups.delete(group.key)
      session.fills += group.outputs.size - oldCount
      session.usd += newUsd - oldUsd
      arrived.delete(id)
      dirty = true
      return true
    },
    add(fill) {
      lastChange = { newEvents: 0 }
      if (!fill?.id) return false
      const previous = observations.get(fill.id)
      if (previous?.fill.source === 'chain' && fill.source === 'chain'
          && fill.observationRank < previous.fill.observationRank) return false
      const upgradingFlow = previous?.fill.source === 'chain' && previous.fill.kind === 'flow'
        && fill.source === 'chain' && (fill.kind !== 'flow' || fill.observationRank > previous.fill.observationRank)
      if (upgradingFlow) {
        // A receipt completes the same live observation, without a second event.
        const oldKey = eventGroup(previous.fill)
        rows.delete(fill.id)
        groups.delete(oldKey)
        fill = { ...fill, ts: previous.fill.ts }
      } else if (previous) {
        // Re-enrichment may establish a previously unknown quantity. Never regress
        // known data or let a repeated poll change the event's observed order/time.
        if (eventGroup(previous.fill) !== eventGroup(fill)) return false
        const changes = {}
        for (const field of ['amount', 'usd', 'price', 'symbol', 'quoteAmount', 'quoteSymbol', 'block', 'logIndex', 'mcap', 'priced']) {
          if (previous.fill[field] == null && fill[field] != null) changes[field] = fill[field]
        }
        for (const leg of ['sold', 'bought']) {
          if (fill[leg] && (!previous.fill[leg] || previous.fill[leg].amount == null && fill[leg].amount != null)) changes[leg] = fill[leg]
        }
        if (!Object.keys(changes).length) return false
        fill = { ...previous.fill, ...changes }
      } else if (seen.has(fill.id)) return false
      const key = eventGroup(fill)
      const group = groups.get(key) || { key, observations: new Map(), outputs: new Map(), acceptedPairs: new Set(), allowFingerprints: true }
      groups.set(key, group)
      const previousCount = group.outputs.size + (upgradingFlow ? 1 : 0)
      let previousUsd = upgradingFlow ? dollarSize(previous.fill) : 0
      for (const entry of group.outputs.values()) { rows.delete(entry.fill.id); previousUsd += dollarSize(entry.fill) }
      const entry = { fill, order: previous?.order ?? order++ }
      observations.set(fill.id, entry)
      group.observations.set(fill.id, entry)
      group.outputs = reconcileGroup(group)
      let nextUsd = 0
      for (const row of group.outputs.values()) {
        rows.set(row.fill.id, row)
        arrived.add(row.fill.id)
        nextUsd += dollarSize(row.fill)
      }
      seen.add(fill.id)
      if (seen.size > limit * 4) seen.delete(seen.values().next().value)
      while (arrived.size > limit * 2) arrived.delete(arrived.values().next().value)
      const newEvents = group.outputs.size - previousCount
      session.fills += newEvents
      session.usd += nextUsd - previousUsd
      lastChange = { newEvents: Math.max(0, newEvents) }
      dirty = true
      // A hidden tab may receive many blocks before it publishes another snapshot.
      if (rows.size > limit * 2) prune()
      return true
    },
    snapshot() { dirty = false; return prune() },
    takeArrived() {
      const ids = [...arrived].filter((id) => rows.has(id))
      arrived = new Set()
      return ids
    },
  }
}

/** Bounded publication rate without delaying ingestion or dropping intermediate fills. */
export function createTerminalPublisher(publish, { intervalMs = 500 } = {}) {
  let timer = null
  let dirty = false
  let active = true
  let disposed = false
  const flush = () => {
    timer = null
    if (disposed || !active || !dirty) return
    dirty = false
    publish()
  }
  return {
    request() {
      if (disposed) return
      dirty = true
      if (active && timer === null) timer = setTimeout(flush, intervalMs)
    },
    setActive(value) {
      if (disposed || active === value) return
      active = value
      if (timer !== null) clearTimeout(timer)
      timer = null
      if (active) flush()
    },
    dispose() {
      disposed = true
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
  }
}

/** Start the next poll only after the previous request has settled and cleaned up. */
export function createTerminalPollLoop(run, { intervalMs } = {}) {
  let timer = null
  let controller = null
  let active = true
  let running = false
  let requested = false
  let started = false
  let disposed = false
  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const tick = async () => {
    clearTimer()
    if (disposed || !started || !active || running) return
    requested = false
    running = true
    controller = new AbortController()
    try {
      await run(controller.signal)
    } catch {
      // The caller presents request errors. Rejections must not kill future polls.
    } finally {
      running = false
      if (!disposed && active) {
        if (requested) void tick()
        else timer = setTimeout(tick, intervalMs)
      }
    }
  }
  return {
    start() { if (!started && !disposed) { started = true; void tick() } },
    refresh() {
      if (disposed) return
      requested = true
      clearTimer()
      if (!running) void tick()
    },
    setActive(value) {
      if (disposed || active === value) return
      active = value
      clearTimer()
      if (!active) controller?.abort()
      else { requested = true; if (!running) void tick() }
    },
    dispose() {
      disposed = true
      clearTimer()
      controller?.abort()
    },
  }
}

export function collectTerminalTransactions(transactions, { processed, ingest, remove, marks = {}, capacity = 900 }) {
  for (const tx of transactions || []) {
    if (!tx?.hash) continue
    const id = tx.logIndex != null ? `${tx.hash}#${tx.logIndex}` : tx.hash
    if (isRejectedChainTx(tx)) {
      remove?.(tx.logIndex != null ? `c:${tx.hash}:${tx.logIndex}` : `c:${tx.hash}`)
      processed.add(id)
      if (processed.size > capacity * 2) processed.delete(processed.values().next().value)
      continue
    }
    if (!(tx.category === 'defi' || tx.isDexTx || tx.isConfirmedSwap)) continue
    if (processed.has(id)) continue
    const fill = fillFromChainTx(tx, marks)
    // Context enrichment can replace an incomplete transaction with the same hash.
    if (!fill) continue
    // Keep partial observations eligible for a later verified decimals lookup.
    if (fill.kind !== 'flow' && fill.amount > 0 && (fill.kind !== 'swap' || fill.quoteAmount > 0)) processed.add(id)
    if (processed.size > capacity * 2) processed.delete(processed.values().next().value)
    ingest(fill)
  }
}
