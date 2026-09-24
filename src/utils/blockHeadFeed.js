/**
 * Publishes attributed headers independently of their full transaction payload.
 * Attribution is pinned to each header's block by the caller. Slow, older
 * replies cannot move the live pointer backwards, and a closed stream cannot
 * publish its outstanding replies into a replacement connection.
 */
export function createBlockHeadFeed(publish, resolveValidator) {
  let closed = false
  let latestHead = null
  const originalHeaders = new Map()
  const maxRememberedHeaders = 64

  return {
    async push(header, proposerPromise) {
      const number = header?.number
      const valid = Number.isSafeInteger(number) && number >= 0
      let originalHeader = header
      if (!closed && valid && (!latestHead || number > latestHead.number)) {
        originalHeader = originalHeaders.get(number) || header
        originalHeaders.set(number, originalHeader)
        if (originalHeaders.size > maxRememberedHeaders) {
          originalHeaders.delete(originalHeaders.keys().next().value)
        }
      }

      // Always consume the promise, including on teardown, so a cancelled
      // stream cannot leave a rejected attribution request unhandled.
      const proposerId = await Promise.resolve(proposerPromise).catch(() => null)
      if (closed || !valid || proposerId == null) return
      if (latestHead && number <= latestHead.number) return
      const proposerValidator = resolveValidator(proposerId)
      if (proposerValidator?.id == null) return

      // Unknown newer headers are observations, not drawable blocks. Keep
      // them from suppressing a slower, real proposer for an earlier height.
      latestHead = {
        // A later full body keeps the original header's receive time.
        ...originalHeader,
        proposerId,
        proposerValidator,
      }
      for (const rememberedNumber of originalHeaders.keys()) {
        if (rememberedNumber <= number) originalHeaders.delete(rememberedNumber)
      }
      publish(latestHead)
    },
    close() {
      closed = true
      originalHeaders.clear()
    },
  }
}
