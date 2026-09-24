/* eslint-env node */
import WebSocket from 'ws'

const CONTEXT_URL = 'https://app.perpl.xyz/api/v1/pub/context'
const STREAM_URL = 'wss://app.perpl.xyz/ws/v1/market-data'

export function perplSubscriptions(context) {
  if (context?.chain?.chain_id !== 143 || !Array.isArray(context.markets)) throw new Error('Invalid Perpl mainnet context')
  const ids = [...new Set(context.markets.filter(m => m.config?.is_open !== false && Number.isSafeInteger(m.id) && m.id > 0).map(m => m.id))]
  if (!ids.length || ids.length > 14) throw new Error('Unsupported Perpl market subscription count')
  return { mt: 5, subs: ['market-state@143', 'funding@143', ...ids.map(id => `trades@${id}`)].map(stream => ({ stream, subscribe: true })) }
}

export function createPerplContextLoader({ fetchFn = fetch, now = Date.now } = {}) {
  let cache = null
  let inflight = null
  return async () => {
    if (cache && now() - cache.at < 30_000) return cache.data
    if (inflight) return inflight
    inflight = (async () => {
      const response = await fetchFn(CONTEXT_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error(`Perpl context unavailable (${response.status})`)
      const full = await response.json()
      perplSubscriptions(full)
      // Only the public chain/token/market fields needed by this terminal.
      const data = { chain: full.chain, instances: full.instances, tokens: full.tokens, markets: full.markets }
      cache = { at: now(), data }
      return data
    })().finally(() => { inflight = null })
    return inflight
  }
}

export const loadPerplContext = createPerplContextLoader()

export function jsonResponse(res, status, value) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}

function openEventStream(res) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-store, no-transform')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()
  res.write('retry: 3000\n\n')
}

export function createPerplStreamHandler({ loadContext = loadPerplContext, socketFactory = () => new WebSocket(STREAM_URL, { handshakeTimeout: 8_000, autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 250, maxPayload: 2 * 1024 * 1024 }), lifetimeMs = 45_000 } = {}) {
  return async (req, res) => {
    if (req.method !== 'GET') return jsonResponse(res, 405, { error: 'Method not allowed' })
    let subscription
    let context
    try { context = await loadContext(); subscription = perplSubscriptions(context) }
    catch {
      if (res.destroyed) return
      // EventSource stops retrying after a non-200 response. Keep transient
      // upstream failures inside the stream so its native reconnect can recover.
      openEventStream(res)
      res.end('event: relay-status\ndata: {"status":"reconnecting","message":"Perpl market source is temporarily unavailable. Reconnecting…"}\n\n')
      return
    }
    if (res.destroyed) return
    openEventStream(res)
    res.write(`event: context\ndata: ${JSON.stringify(context)}\n\n`)
    await new Promise((resolve) => {
      let closed = false
      let socket
      let expiry
      let heartbeat
      let drainTimer
      const resume = () => {
        clearTimeout(drainTimer)
        if (!closed) socket?.resume()
      }
      const finish = () => {
        if (closed) return
        closed = true
        clearTimeout(expiry)
        clearInterval(heartbeat)
        clearTimeout(drainTimer)
        res.off('close', finish)
        res.off('drain', resume)
        if (socket) {
          socket.removeAllListeners('message')
          socket.removeAllListeners('open')
          socket.removeAllListeners('close')
          // Keep the error listener until termination has settled.
          socket.terminate()
        }
        if (!res.destroyed && !res.writableEnded) res.end()
        resolve()
      }
      const write = (frame) => {
        if (closed || res.destroyed) return finish()
        if (!res.write(frame)) {
          if (res.writableLength > 2 * 1024 * 1024) return finish()
          socket?.pause()
          res.off('drain', resume)
          res.once('drain', resume)
          clearTimeout(drainTimer)
          drainTimer = setTimeout(finish, 5_000)
        }
      }
      const reconnect = () => {
        write('event: relay-status\ndata: {"status":"reconnecting","message":"Reconnecting to Perpl market data"}\n\n')
        finish()
      }
      res.on('close', finish)
      try { socket = socketFactory() } catch { reconnect(); return }
      socket.on('open', () => { if (!closed) socket.send(JSON.stringify(subscription)) })
      socket.on('message', (bytes, binary) => {
        if (binary || closed) return
        try {
          const frame = JSON.parse(String(bytes))
          if (frame && typeof frame.mt === 'number') write(`data: ${JSON.stringify(frame)}\n\n`)
        } catch { /* Invalid upstream frames never reach the client. */ }
      })
      socket.on('error', reconnect)
      socket.on('close', reconnect)
      heartbeat = setInterval(() => write(': keep-alive\n\n'), 15_000)
      expiry = setTimeout(reconnect, lifetimeMs)
    })
  }
}
