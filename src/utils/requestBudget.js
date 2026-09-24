const WINDOW_MS = 60_000
const PRIORITY_LIMIT = { block: 1, proposer: 0.9, enrichment: 0.8 }

/** Keep optional lookups from consuming the rest of a live minute's feed. */
export function createRequestBudget({ now = Date.now, limit = 600, optionalLimit = 100 } = {}) {
  let windowStart = now()
  let count = 0
  let optionalCount = 0

  const updateWindow = () => {
    const current = now()
    if (current - windowStart >= WINDOW_MS) {
      windowStart = current
      count = 0
      optionalCount = 0
    }
    return current
  }

  return {
    hasBudget(tier = 'block') {
      updateWindow()
      if (tier === 'enrichment' && optionalCount >= optionalLimit) return false
      return count < limit * (PRIORITY_LIMIT[tier] ?? 1)
    },
    track(tier = 'block') {
      updateWindow()
      count++
      if (tier === 'enrichment') optionalCount++
    },
    getSnapshot() {
      const current = updateWindow()
      return { count, optionalCount, windowMs: current - windowStart }
    },
  }
}

class RequestBudgetError extends Error {
  constructor() {
    super('Optional enrichment deferred to preserve the live block feed')
    this.name = 'RequestBudgetError'
  }
}

export function isRequestBudgetError(error) {
  return error instanceof RequestBudgetError
}

/** Count the receipt and every token metadata lookup at its dispatch boundary. */
export function createBudgetedEnrichmentClient(client, reserveRequest) {
  const call = async (method, args) => {
    if (!reserveRequest()) throw new RequestBudgetError()
    return client[method](...args)
  }
  return {
    getTransactionReceipt: (...args) => call('getTransactionReceipt', args),
    readContract: (...args) => call('readContract', args),
  }
}
