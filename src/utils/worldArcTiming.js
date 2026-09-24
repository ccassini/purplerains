export const WORLD_BLOCK_CADENCE_MS = 300
export const WORLD_ARC_DASH_LENGTH = 0.24
export const WORLD_ARC_MAX_DELAY = 0.12

function blockHeight(block) {
  if (block?.number == null) return null
  const number = Number(block.number)
  return Number.isSafeInteger(number) && number >= 0 ? number : null
}

export function selectWorldBlock(head, block) {
  const headHeight = blockHeight(head)
  const fullHeight = blockHeight(block)
  if (headHeight == null) return fullHeight == null ? null : block
  if (fullHeight == null) return head
  // The body can advance before its pinned proposer lookup finishes. Keep
  // verified attribution drawable instead of letting an unknown newer body
  // starve every real proposer that arrives a fraction of a block later.
  const headHasProposer = head.proposerValidator?.id != null
  const fullHasProposer = block.proposerValidator?.id != null
  if (headHasProposer !== fullHasProposer) return headHasProposer ? head : block
  if (headHeight > fullHeight) return head
  if (fullHeight > headHeight) return block
  return head.proposerValidator?.id == null && block.proposerValidator?.id != null ? block : head
}

export function getWorldArcTiming(cadence) {
  // Reserve a short gap, including the last delayed dash's trailing end.
  const lifetimeScale = 1 + WORLD_ARC_MAX_DELAY + WORLD_ARC_DASH_LENGTH
  const travel = Math.min(210, Math.floor((cadence - 8) / lifetimeScale))
  return {
    travel,
    total: travel * lifetimeScale,
  }
}

/** One burst per verified block, with no timer queue between receipt and draw. */
export function createWorldArcClock() {
  let lastNumber = null
  let lastAt = null
  let cadence = WORLD_BLOCK_CADENCE_MS

  return (block, now) => {
    const number = blockHeight(block)
    // Unknown heads are observations, not consumed bursts. A confirmed
    // proposer can still arrive after a newer un-attributed full payload.
    if (number == null || block.proposerValidator?.id == null) return null
    if (lastNumber != null && number <= lastNumber) return null

    if (number !== lastNumber) {
      // Proposer lookup latency must not change the chain's measured cadence.
      const receivedAt = Number.isFinite(block.receivedAt) ? block.receivedAt : now
      if (lastNumber != null && lastAt != null) {
        const interval = (receivedAt - lastAt) / (number - lastNumber)
        if (interval > 60 && interval < 5000) {
          cadence = Math.max(160, Math.min(WORLD_BLOCK_CADENCE_MS, cadence * 0.55 + interval * 0.45))
        }
      }
      lastAt = receivedAt
      lastNumber = number
    }

    return { number, cadence, receivedAt: block.receivedAt, ...getWorldArcTiming(cadence) }
  }
}

export function instantiateWorldArcs(template) {
  // globe.gl binds scene objects (and their ongoing dash phase) to each datum.
  // Keep templates free of those bindings and start every block at phase zero.
  return template.map(arc => ({ ...arc }))
}
