import { useEffect, useState } from 'react'
import { formatPrice } from './priceFormatters'

const TITLE_REFRESH_MS = 250
const FONT_LINK_ID = 'pr-premium-fonts'
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap'

/**
 * Premium chrome typography, loaded only on this route so other pages keep
 * their existing font budget. Mirrors the World / Staking pages.
 */
export function usePremiumFonts() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return
    const link = document.createElement('link')
    link.id = FONT_LINK_ID
    link.rel = 'stylesheet'
    link.href = FONT_HREF
    document.head.appendChild(link)
  }, [])
}

/**
 * Mirrors the live MON price into the browser tab title while the tab is
 * backgrounded, so the page stays useful as a pinned ticker.
 *
 * @param {React.MutableRefObject<number | null>} priceRef
 */
export function useDocumentPriceTitle(priceRef) {
  useEffect(() => {
    const originalTitle = document.title
    let timer = null

    const renderTitle = () => {
      const p = priceRef.current
      document.title = Number.isFinite(p) ? `MON $${formatPrice(p)}` : 'MON'
    }

    const onVisibility = () => {
      if (document.hidden) {
        renderTitle()
        if (!timer) timer = window.setInterval(renderTitle, TITLE_REFRESH_MS)
        return
      }
      if (timer) window.clearInterval(timer)
      timer = null
      document.title = originalTitle
    }

    document.addEventListener('visibilitychange', onVisibility)
    onVisibility()

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      if (timer) window.clearInterval(timer)
      document.title = originalTitle
    }
  }, [priceRef])
}

/**
 * The app header is absolutely positioned and auto-hides on idle, so this
 * fixed-overlay page reserves its height to avoid ever sitting underneath it.
 *
 * @returns {number} top offset in px
 */
export function useHeaderOffset(enabled = true) {
  const [topOffset, setTopOffset] = useState(90)

  useEffect(() => {
    if (!enabled) return undefined
    const update = () => {
      const header = document.querySelector('.app-header')
      const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 78
      setTopOffset(Math.max(56, Math.min(220, headerH + 10)))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [enabled])

  return topOffset
}

/**
 * Shared 1s clock for relative timestamps, so hundreds of tape rows do not each
 * schedule their own timer.
 *
 * @returns {number} Date.now() sampled every second
 */
export function useSecondClock() {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return nowMs
}
