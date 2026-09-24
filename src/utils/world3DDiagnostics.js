// Development-only measurements of real renders, not configured animation time.
export function createWorld3DDiagnostics(root, renderer) {
  const samples = { frameMs: [], renderMs: [], moonMs: [], submitMs: [], submitToRenderMs: [], burstIntervalMs: [], receiptToStartMs: [] }
  let pendingBurstAt = null
  let previousFrame = 0, previousBurst = 0, lastPublish = 0, burstCount = 0, frameCount = 0
  const add = (key, value) => {
    const list = samples[key]
    list.push(value)
    if (list.length > 1200) list.shift()
  }
  const stats = list => {
    if (!list.length) return null
    const sorted = [...list].sort((a, b) => a - b)
    const round = n => Math.round(n * 10) / 10
    return { n: list.length, p50: round(sorted[Math.floor(sorted.length * .5)]), p95: round(sorted[Math.floor(sorted.length * .95)]), max: round(sorted.at(-1)) }
  }
  const originalRender = renderer.render
  renderer.render = function (...args) {
    const at = performance.now()
    const result = originalRender.apply(this, args)
    add('renderMs', performance.now() - at)
    if (pendingBurstAt != null) {
      add('submitToRenderMs', performance.now() - pendingBurstAt)
      pendingBurstAt = null
    }
    frameCount++
    if (document.visibilityState === 'visible') {
      if (previousFrame) add('frameMs', at - previousFrame)
      previousFrame = at
    } else previousFrame = 0
    if (at - lastPublish > 1000) {
      lastPublish = at
      root.dataset.performance = JSON.stringify({
        ...Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, stats(values)])),
        burstCount, frameCount, drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries,
        programs: renderer.info.programs?.length,
        visibility: document.visibilityState,
      })
    }
    return result
  }
  return {
    burst(timing, cost) {
      const at = performance.now()
      pendingBurstAt = at
      if (previousBurst) add('burstIntervalMs', at - previousBurst)
      previousBurst = at
      burstCount++
      add('submitMs', cost)
      if (Number.isFinite(timing.receivedAt)) add('receiptToStartMs', Date.now() - timing.receivedAt)
    },
    moon(cost) { add('moonMs', cost) },
    dispose() { renderer.render = originalRender },
  }
}
