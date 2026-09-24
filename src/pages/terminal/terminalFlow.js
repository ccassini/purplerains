const VISIBLE_ROWS = 18
const MOTION_MS = 180
const ROW_SELECTOR = 'tbody > tr[data-flow-id]'

const rowId = (row) => row?.id != null ? String(row.id) : null
const headTime = (entry) => Number.isFinite(entry?.row?.ts) ? entry.row.ts : Number.isFinite(entry?.row?.number) ? entry.row.number : null

/** Track only visible identities. Actual records are never copied, queued or delayed. */
export function createTerminalFlowTracker() {
  let previous = null
  let previousKey
  let wasEnabled = false
  return {
    get retainedCount() { return previous?.length || 0 },
    reset() { previous = null; wasEnabled = false },
    update(rows = [], { enabled = true, resetKey } = {}) {
      const entries = rows.slice(0, VISIBLE_ROWS).map((row) => ({
        id: rowId(row), row,
        aliases: [...new Set([rowId(row), ...(Array.isArray(row.sourceIds) ? row.sourceIds.map(String) : [])].filter(Boolean))],
        previousId: null,
      })).filter((entry) => entry.id)
      const reset = !enabled || !wasEnabled || !previous?.length || previousKey !== resetKey
      const oldAliases = new Map()
      for (const [index, entry] of (previous || []).entries()) {
        for (const alias of entry.aliases) oldAliases.set(alias, { id: entry.id, index })
      }
      for (const entry of entries) {
        const match = entry.aliases.map((alias) => oldAliases.get(alias)).find(Boolean)
        if (match) { entry.previousId = match.id; entry.previousIndex = match.index }
      }
      const firstExisting = entries.findIndex((entry) => entry.previousId != null)
      const incomingCount = firstExisting === -1 ? entries.length : firstExisting
      const retained = entries.filter((entry) => entry.previousId != null)
      const sameOrder = retained.every((entry, index) => !index || entry.previousIndex > retained[index - 1].previousIndex)
      const previousTime = headTime(previous?.[0])
      const nextTime = headTime(entries[0])
      const notHistoricalReplacement = firstExisting !== -1 || previousTime == null || nextTime == null || nextTime >= previousTime
      const animate = !reset && incomingCount > 0 && sameOrder && notHistoricalReplacement
      previous = entries
      previousKey = resetKey
      wasEnabled = enabled
      return { entries, reset, animate, newIds: animate ? entries.slice(0, incomingCount).map((entry) => entry.id) : [] }
    },
  }
}

function readPositions(root) {
  const positions = new Map()
  if (!root) return positions
  for (const element of [...root.querySelectorAll(ROW_SELECTOR)].slice(0, VISIBLE_ROWS)) {
    const id = element.dataset.flowId
    // offsetTop is a layout coordinate: scrolling and an in-flight transform do
    // not change it, unlike the row's viewport bounding rectangle.
    const top = element.offsetTop
    const height = element.offsetHeight
    if (id && Number.isFinite(top) && Number.isFinite(height) && height > 0) positions.set(id, { element, top, height })
  }
  return positions
}

/** Own only these short compositor effects; no frame loop, timers or data state. */
export function createTerminalFlowController() {
  const tracker = createTerminalFlowTracker()
  const motions = new Map()
  let positions = new Map()
  let disposed = false
  const cancel = (id) => {
    const motion = motions.get(id)
    if (!motion) return
    motions.delete(id)
    motion.animation.cancel()
    motion.element.classList.remove('term-flow-moving', 'term-flow-entering')
  }
  const cancelAll = () => { for (const id of motions.keys()) cancel(id) }
  const play = (id, target, fromY, entering) => {
    const element = target.element
    if (typeof element.animate !== 'function') return
    const from = { transform: `translateY(${fromY}px)` }
    const to = { transform: 'translateY(0px)' }
    if (entering) { from.opacity = 0.3; to.opacity = 1 }
    element.classList.add('term-flow-moving')
    if (entering) element.classList.add('term-flow-entering')
    let animation
    try {
      animation = element.animate([from, to], { duration: MOTION_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
    } catch {
      element.classList.remove('term-flow-moving', 'term-flow-entering')
      return
    }
    const motion = { element, animation, fromY }
    motions.set(id, motion)
    const release = () => {
      if (motions.get(id) !== motion) return
      motions.delete(id)
      element.classList.remove('term-flow-moving', 'term-flow-entering')
    }
    animation.finished?.then(release, release)
  }
  return {
    get activeCount() { return motions.size },
    reset() { cancelAll(); tracker.reset(); positions = new Map() },
    update(root, rows, options) {
      if (disposed) return
      const plan = tracker.update(rows, options)
      const next = readPositions(root)
      if (plan.reset) {
        cancelAll()
      } else if (plan.animate) {
        const visibleTops = new Map()
        for (const [id, old] of positions) {
          const motion = motions.get(id)
          const progress = motion?.animation.effect?.getComputedTiming?.().progress
          const remaining = Number.isFinite(progress) ? motion.fromY * (1 - Math.max(0, Math.min(1, progress))) : 0
          visibleTops.set(id, old.top + remaining)
        }
        cancelAll()
        const incoming = new Set(plan.newIds)
        for (const entry of plan.entries) {
          const target = next.get(entry.id)
          if (!target) continue
          if (incoming.has(entry.id)) {
            play(entry.id, target, -Math.min(target.height, 36), true)
          } else if (entry.previousId != null && visibleTops.has(entry.previousId)) {
            const fromY = visibleTops.get(entry.previousId) - target.top
            // The live stream pushes records down; unrelated upward reflows do
            // not become an arrival animation.
            if (fromY < -0.5) play(entry.id, target, fromY, false)
          }
        }
      } else {
        // Receipt metadata can re-render an existing record during its entry.
        // Let that existing animation finish instead of restarting it.
        for (const [id, motion] of motions) if (next.get(id)?.element !== motion.element) cancel(id)
      }
      positions = next
    },
    dispose() { disposed = true; cancelAll(); tracker.reset(); positions = new Map() },
  }
}
