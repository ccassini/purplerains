import { clamp } from './priceFormatters'

/** One mounted Price view owns these sockets and their retry timers. */
export function createPriceFeedSockets({ venues, symbol, updateSource, pushTrade, createWebSocket = url => new WebSocket(url) }) {
  const wsMap = {}
  const reconnectMap = {}
  let disposed = false

  const disconnect = (key) => {
    const socket = wsMap[key]
    wsMap[key] = null
    if (!socket) return
    socket.onopen = null
    socket.onmessage = null
    socket.onerror = null
    socket.onclose = null
    try { socket.close() } catch { /* already closed */ }
  }

  const scheduleReconnect = (venue) => {
    if (disposed) return
    const ref = reconnectMap[venue.key] || { tries: 0, timer: null }
    if (ref.timer !== null) return
    const tries = ref.tries + 1
    const timer = setTimeout(() => {
      reconnectMap[venue.key] = { tries, timer: null }
      connectVenue(venue)
    }, clamp(400 * tries, 400, 5000))
    reconnectMap[venue.key] = { tries, timer }
  }

  const connectVenue = (venue) => {
    if (disposed) return
    const targetSymbol = venue.mapSymbol ? venue.mapSymbol(symbol) : symbol
    if (!targetSymbol) {
      updateSource(venue.key, { status: 'fallback', symbol: null })
      return
    }
    const streamDef = venue.buildStream(targetSymbol)
    const streamUrl = typeof streamDef === 'string' ? streamDef : streamDef?.url
    const subscribe = typeof streamDef === 'object' ? streamDef?.subscribe : null
    if (!streamUrl) {
      updateSource(venue.key, { status: 'fallback', symbol: targetSymbol })
      return
    }
  
    updateSource(venue.key, { status: 'connecting', symbol: targetSymbol })
    let ws
    try { ws = createWebSocket(streamUrl) } catch {
      updateSource(venue.key, { status: 'fallback' })
      scheduleReconnect(venue)
      return
    }
    if (venue.binaryType) {
      try {
        ws.binaryType = venue.binaryType
      } catch {
        // ignore
      }
    }
    wsMap[venue.key] = ws
    const isCurrent = () => !disposed && wsMap[venue.key] === ws

    ws.onopen = () => {
      if (!isCurrent()) return
      const ref = reconnectMap[venue.key] || {}
      reconnectMap[venue.key] = { ...ref, tries: 0, timer: null }
      updateSource(venue.key, { status: 'live' })
      if (subscribe) {
        try {
          subscribe(ws, targetSymbol)
        } catch {
          // swallow subscription errors
        }
      }
    }
  
    ws.onmessage = (evt) => {
      if (!isCurrent()) return
      const handleMsg = (msg) => {
        // Binary/decompressed data may resolve after disposal or replacement.
        if (!isCurrent()) return
        try {
          const trade = venue.parseTrade?.(msg)
          if (!trade) return
          const affectsChart = trade.affectsChart !== false
          if (affectsChart) updateSource(venue.key, { last: trade.price })
          pushTrade(venue.key, trade.price, trade.qty, trade.time, trade.side, affectsChart)
        } catch {
          // ignore
        }
      }
  
      try {
        if (venue.parseEventData) {
          const parsing = venue.parseEventData(evt.data, handleMsg)
          parsing?.catch?.(() => {})
          return
        }
        if (typeof evt.data !== 'string') return
        if (evt.data === 'pong' || evt.data === 'ping') return
        const parsed = JSON.parse(evt.data)
        // LBank keeps the stream healthy only if we answer its ping frames.
        if (venue.key === 'lbank' && parsed?.action === 'ping' && parsed?.ping) {
          try {
            ws.send(JSON.stringify({ action: 'pong', pong: parsed.ping }))
          } catch {
            // ignore
          }
          return
        }
        handleMsg(parsed)
      } catch {
        // ignore malformed messages
      }
    }
  
    ws.onerror = () => {
      if (!isCurrent()) return
      updateSource(venue.key, { status: 'fallback' })
    }

    ws.onclose = () => {
      if (!isCurrent()) return
      disconnect(venue.key)
      scheduleReconnect(venue)
    }
  }
  venues.forEach(connectVenue)
  return {
    reconnectAll() {
      if (disposed) return
      venues.forEach(venue => {
        disconnect(venue.key)
        scheduleReconnect(venue)
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      venues.forEach(venue => {
        const ref = reconnectMap[venue.key]
        if (ref?.timer != null) clearTimeout(ref.timer)
        reconnectMap[venue.key] = null
        disconnect(venue.key)
      })
    },
  }
}
