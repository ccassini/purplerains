// Development-only bounded measurements. Publish to the DOM once per second.
export function createWorldArcDiagnostics(canvas) {
  const frames = [], draws = [], bursts = [], starts = [], latencies = [], events = []
  let lastNumber = null, lastReceived = null
  let lastFrame = 0, lastBurst = 0, lastPublish = 0
  let activeFrames = 0, totalFrames = 0, burstCount = 0, interrupted = 0
  const add = (samples, value) => {
    samples.push(value)
    if (samples.length > 1200) samples.shift()
  }
  const stats = samples => {
    if (!samples.length) return null
    const sorted = [...samples].sort((a, b) => a - b)
    const round = n => Math.round(n * 10) / 10
    return { n: samples.length, p50: round(sorted[Math.floor(sorted.length * .5)]), p95: round(sorted[Math.floor(sorted.length * .95)]), max: round(sorted.at(-1)) }
  }
  return {
    resetFrame() { lastFrame = 0 },
    burst(at, previous, timing) {
      if (lastBurst) add(bursts, at - lastBurst)
      events.push({
        number: timing.number, interval: lastBurst ? Math.round(at - lastBurst) : 0,
        skipped: lastNumber == null ? 0 : timing.number - lastNumber - 1,
        receivedInterval: lastReceived == null ? 0 : timing.receivedAt - lastReceived,
        latency: Date.now() - timing.receivedAt,
      })
      if (events.length > 120) events.shift()
      lastNumber = timing.number
      lastReceived = timing.receivedAt
      if (previous && at - previous.startTime < previous.total) interrupted++
      if (Number.isFinite(timing.receivedAt)) add(latencies, Date.now() - timing.receivedAt)
      lastBurst = at
      burstCount++
    },
    frame(at, cost, anim) {
      if (lastFrame && document.visibilityState === 'visible') add(frames, at - lastFrame)
      lastFrame = at
      totalFrames++
      if (anim) {
        activeFrames++
        add(draws, cost)
        if (!anim.measured) {
          anim.measured = true
          add(starts, performance.now() - anim.startTime)
        }
      }
      if (at - lastPublish < 1000) return
      lastPublish = at
      canvas.dataset.performance = JSON.stringify({
        visibility: document.visibilityState, frameMs: stats(frames), drawMs: stats(draws),
        burstIntervalMs: stats(bursts), firstFrameMs: stats(starts), receiptToStartMs: stats(latencies),
        burstCount, interrupted, activeFrames, totalFrames,
      })
      canvas.dataset.burstEvents = JSON.stringify(events)
    },
  }
}
