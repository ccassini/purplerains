const keyOf = (tx) => typeof tx?.hash === 'string' && tx.hash ? tx.hash.toLowerCase() : null

/** New observations publish immediately; a repeated raw response must not erase
 * already verified receipt fields or create a second copy of the same hash. */
export function prependTransactionBatch(previous, incoming, capacity = 500) {
  const existing = new Map(previous.map((tx) => [keyOf(tx), tx]))
  const seen = new Set()
  const next = []
  for (const tx of incoming) {
    const key = keyOf(tx)
    if (!key || seen.has(key)) continue
    seen.add(key)
    next.push(existing.has(key) ? { ...existing.get(key), ...tx } : tx)
  }
  if (!next.length) return previous
  for (const tx of previous) {
    const key = keyOf(tx)
    if (!key || seen.has(key)) continue
    seen.add(key)
    next.push(tx)
  }
  return next.slice(0, capacity)
}

/** Late metadata updates only a retained row. It cannot change arrival order,
 * resurrect an evicted transaction, or mutate an object already rendered. */
export function patchTransactionEnrichment(previous, enriched) {
  const patches = new Map(enriched.map((tx) => [keyOf(tx), tx]).filter(([key]) => key))
  if (!patches.size) return previous
  let changed = false
  const next = previous.map((tx) => {
    const patch = patches.get(keyOf(tx))
    if (!patch || !Object.keys(patch).some((key) => patch[key] !== tx[key])) return tx
    changed = true
    return { ...tx, ...patch }
  })
  return changed ? next : previous
}
