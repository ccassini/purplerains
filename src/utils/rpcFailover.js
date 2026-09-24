import { fallback, http } from 'viem'

function providerFailure(error) {
  const seen = new Set()
  for (let cause = error; cause && !seen.has(cause); cause = cause.cause) {
    seen.add(cause)
    const status = Number(cause.status)
    if (status === 429 || cause.code === -32005 || cause.code === 429) return { cause, rateLimited: true }
    if ([403, 408].includes(status) || status >= 500 || cause.name === 'TimeoutError' || cause.name === 'TypeError' || (cause.name === 'HttpRequestError' && !status)) {
      return { cause, rateLimited: false }
    }
  }
  return null
}

function cooldownMs(failure, attempts, now) {
  const retryAfter = failure.cause.headers?.get?.('Retry-After')
  if (retryAfter != null && String(retryAfter).trim()) {
    const seconds = Number(retryAfter)
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now
    if (Number.isFinite(delay)) return Math.max(15_000, Math.min(120_000, delay))
  }
  return Math.min(120_000, (failure.rateLimited ? 30_000 : 5_000) * 2 ** Math.min(attempts - 1, 5))
}

/** A connection-scoped circuit breaker shared by receipt, token and block RPCs. */
export function createMonadRpcFailover(endpoints, {
  chainId,
  now = Date.now,
  transportFactory = (url) => http(url, { timeout: 6_000, retryCount: 0 }),
} = {}) {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('A valid Monad chain ID is required')
  const urls = [...new Set(endpoints.filter((url) => typeof url === 'string' && url.trim()))]
  if (!urls.length) throw new Error('No RPC endpoints configured')
  let activeEndpoint = null

  const transports = urls.map((url) => {
    const factory = transportFactory(url)
    const state = { chain: null, checking: null, disabled: null, until: 0, failures: 0, revision: 0 }
    return (config) => {
      const transport = factory({ ...config, retryCount: 0 })
      const verifyChain = async () => {
        if (state.chain !== null) return state.chain
        if (!state.checking) {
          state.checking = transport.request({ method: 'eth_chainId' }).then((value) => {
            if (Number(value) !== chainId) {
              state.disabled = new Error(`RPC chain ID mismatch. Expected ${chainId}, got ${String(value)}`)
              throw state.disabled
            }
            state.chain = value
            return value
          }).finally(() => { state.checking = null })
        }
        return state.checking
      }
      return {
        ...transport,
        request: async (args) => {
          if (state.disabled) throw state.disabled
          if (state.until > now()) throw new Error('RPC provider is temporarily cooling down')
          const revision = state.revision
          try {
            const verifiedChain = await verifyChain()
            // Another request may have tripped the breaker during verification.
            if (state.until > now()) throw new Error('RPC provider is temporarily cooling down')
            const result = args.method === 'eth_chainId' ? verifiedChain : await transport.request(args)
            // An older success must not erase a newer concurrent 429/backoff.
            if (revision === state.revision) {
              state.until = 0
              state.failures = 0
              activeEndpoint = url
            }
            return result
          } catch (error) {
            const failure = providerFailure(error)
            if (failure && state.until <= now()) {
              state.failures += 1
              state.revision += 1
              state.until = now() + cooldownMs(failure, state.failures, now())
            }
            throw error
          }
        },
      }
    }
  })

  return {
    // One pass over configured endpoints; no nested retries or background probes.
    transport: fallback(transports, { retryCount: 0, rank: false }),
    getEndpoint: () => activeEndpoint,
  }
}
