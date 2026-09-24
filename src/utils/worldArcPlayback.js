const CADENCE_MS = 300
const INITIAL_BUFFER_MS = 120
const FRAME_TOLERANCE_MS = 20
const MIN_SPACING_MS = 292
const MAX_PENDING_AGE_MS = 600
const MAX_PENDING_BLOCKS = 3

/**
 * Smooth already verified block arrivals on the caller's animation frames.
 * No internal timers, invented blocks, or replay when the source is empty.
 */
export function createWorldArcPlayback() {
  const queue = []
  let latestNumber = null
  let lastStartedAt = null
  let nextDue = null

  const discardExpired = now => {
    while (queue.length && now - queue[0].queuedAt > MAX_PENDING_AGE_MS) queue.shift()
  }

  return {
    submit(payload, now) {
      const number = payload?.timing?.number
      if (!Number.isSafeInteger(number) || number < 0 || !Number.isFinite(now)) return false
      if (latestNumber != null && number <= latestNumber) return false
      latestNumber = number
      discardExpired(now)

      // Refill the small buffer after a real outage. Existing queued data is
      // handled by take(), which can select the newest block after a frame stall.
      if (nextDue == null || (!queue.length && (lastStartedAt == null || now - lastStartedAt > MAX_PENDING_AGE_MS))) {
        nextDue = Math.max(now + INITIAL_BUFFER_MS, lastStartedAt == null ? 0 : lastStartedAt + MIN_SPACING_MS)
      }
      queue.push({ payload, queuedAt: now })
      if (queue.length > MAX_PENDING_BLOCKS) queue.shift()
      return true
    },

    take(now) {
      if (!Number.isFinite(now)) return null
      discardExpired(now)
      if (!queue.length) {
        if (lastStartedAt == null || now - lastStartedAt > MAX_PENDING_AGE_MS) nextDue = null
        return null
      }
      if (now < nextDue || (lastStartedAt != null && now - lastStartedAt < MIN_SPACING_MS)) return null

      const resumed = lastStartedAt != null && now - lastStartedAt > MAX_PENDING_AGE_MS
      const entry = resumed ? queue.pop() : queue.shift()
      if (resumed) queue.length = 0

      // Preserve phase across ordinary 60Hz frame quantization. The separate
      // minimum spacing keeps catch-up from cutting the current flight short.
      nextDue = !resumed && now - nextDue <= FRAME_TOLERANCE_MS
        ? nextDue + CADENCE_MS
        : now + CADENCE_MS
      lastStartedAt = now
      return entry.payload
    },

    clear() {
      queue.length = 0
      nextDue = null
      // Preserve accepted heights and last start so visibility changes cannot
      // replay an old block or start a fresh burst inside the current flight.
    },
  }
}
