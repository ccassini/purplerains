/**
 * In-page re-measurement of a chain's block-space capacity.
 *
 * The registry ships with measured figures and their date; this refreshes them
 * from the chain's own RPC the moment a chain takes the field, so the army a
 * viewer watches is sized by the chain as it is TODAY. CORS-safe endpoints
 * only; a failed measure keeps the registry figure and its provenance.
 */

const RPC_TIMEOUT_MS = 5000
/** Span used to average block time. Kept modest for rate-limited RPCs. */
const SPAN = 64

async function rpcCall(url, method, params, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  if (body.error) throw new Error(body.error.message || 'RPC error')
  return body.result
}

const hexNum = (h) => (typeof h === 'string' ? parseInt(h, 16) : Number(h)) || 0

/**
 * Measure gasLimit + block time from the chain itself.
 * @returns {Promise<{gasLimit:number, blockTimeMs:number, gasPerSecM:number,
 *                    method:'rpc-measured', measuredAt:string}|null>}
 */
export async function measureChain(chain) {
  if (!chain?.corsOk || !chain.rpcs?.length) return null
  for (const url of chain.rpcs) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), RPC_TIMEOUT_MS)
    try {
      const latest = await rpcCall(url, 'eth_getBlockByNumber', ['latest', false], ctrl.signal)
      const num = hexNum(latest?.number)
      const tNew = hexNum(latest?.timestamp)
      const gasLimit = hexNum(latest?.gasLimit)
      if (!num || !tNew || !gasLimit) throw new Error('malformed block')
      const oldTag = '0x' + Math.max(1, num - SPAN).toString(16)
      const older = await rpcCall(url, 'eth_getBlockByNumber', [oldTag, false], ctrl.signal)
      const tOld = hexNum(older?.timestamp)
      const span = num - hexNum(older?.number)
      if (!tOld || span <= 0 || tNew <= tOld) throw new Error('bad span')
      const blockTimeMs = ((tNew - tOld) / span) * 1000
      // Sentinel limits (Arbitrum-style 2^50) invalidate the measure: the
      // documented figure in the registry is the honest one, keep it.
      if (gasLimit > 5e9 || blockTimeMs < 50 || blockTimeMs > 20000) {
        throw new Error('out of sane range')
      }
      return {
        gasLimit,
        blockTimeMs: Math.round(blockTimeMs),
        gasPerSecM: Math.round((gasLimit / blockTimeMs) / 1000 * 100) / 100,
        method: 'rpc-measured',
        measuredAt: new Date().toISOString().slice(0, 10),
      }
    } catch {
      // Try the next endpoint; the registry figure stands if all fail.
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}
