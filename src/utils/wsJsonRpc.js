/**
 * Multiplex JSON-RPC request/response over an already-open WebSocket.
 *
 * The Odyssey live path already holds a `newHeads` subscription; fetching
 * `eth_getBlockByNumber` on that same socket avoids a second HTTP RTT to a
 * (possibly different) load-balanced node — the main lag between header and
 * swap/tx rows in the feed.
 */

/**
 * @typedef {object} WsRpcBridge
 * @property {(data: any) => boolean} handleMessage
 *   true when the frame was a pending RPC reply (caller must not treat it as a subscription)
 * @property {(ws: WebSocket, method: string, params?: any[], timeoutMs?: number) => Promise<any>} callOn
 * @property {(err?: Error) => void} rejectAll
 * @property {() => void} resetIds
 */

/**
 * @returns {WsRpcBridge}
 */
export function createWsRpcBridge() {
  /** @type {Map<number, { resolve: (v: any) => void, reject: (e: Error) => void, timer: ReturnType<typeof setTimeout> }>} */
  const pending = new Map()
  let nextId = 2 // id 1 is reserved for eth_subscribe(newHeads)

  function rejectAll(err = new Error('WebSocket closed')) {
    for (const [, p] of pending) {
      clearTimeout(p.timer)
      p.reject(err)
    }
    pending.clear()
  }

  return {
    resetIds() {
      nextId = 2
    },

    handleMessage(data) {
      if (data == null || data.id == null) return false
      const entry = pending.get(data.id)
      if (!entry) return false
      pending.delete(data.id)
      clearTimeout(entry.timer)
      if (data.error) {
        entry.reject(new Error(data.error.message || 'WS RPC error'))
      } else {
        entry.resolve(data.result)
      }
      return true
    },

    /**
     * @param {WebSocket} ws
     * @param {string} method
     * @param {any[]} [params]
     * @param {number} [timeoutMs]
     */
    callOn(ws, method, params = [], timeoutMs = 3500) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error('WebSocket not open'))
      }
      const id = nextId++
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`WS RPC timeout: ${method}`))
        }, timeoutMs)
        pending.set(id, { resolve, reject, timer })
        try {
          ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
        } catch (err) {
          clearTimeout(timer)
          pending.delete(id)
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })
    },

    rejectAll,
  }
}
