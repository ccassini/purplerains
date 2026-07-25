/**
 * Lightweight monitoring / error reporting.
 * Optional endpoint: VITE_MONITORING_URL (POST JSON events).
 * Always logs in development; never throws.
 */

const QUEUE_MAX = 20
const queue = []
let flushTimer = 0

function getEndpoint() {
  try {
    return import.meta.env?.VITE_MONITORING_URL || ''
  } catch {
    return ''
  }
}

function enqueue(event) {
  queue.push({ ...event, ts: Date.now() })
  if (queue.length > QUEUE_MAX) queue.splice(0, queue.length - QUEUE_MAX)
  if (flushTimer) return
  flushTimer = setTimeout(flush, 1500)
}

async function flush() {
  flushTimer = 0
  const endpoint = getEndpoint()
  if (!endpoint || queue.length === 0) {
    queue.length = 0
    return
  }
  const batch = queue.splice(0, queue.length)
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'purple-rain', events: batch }),
      keepalive: true,
    })
  } catch {
    // swallow — monitoring must never break the app
  }
}

export function reportError(error, context = {}) {
  const message = error?.message || String(error)
  const stack = error?.stack || null
  // eslint-disable-next-line no-console
  console.error('[monitoring]', message, context)
  enqueue({
    type: 'error',
    message,
    stack,
    context,
    href: typeof window !== 'undefined' ? window.location?.href : null,
  })
}

export function reportEvent(name, payload = {}) {
  enqueue({ type: 'event', name, payload })
}
