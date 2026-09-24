import { useEffect, useState } from 'react'

const FONT_ID = 'pr-premium-fonts'
const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap'

export function useTerminalFonts() {
  useEffect(() => {
    if (document.getElementById(FONT_ID)) return
    const link = document.createElement('link')
    link.id = FONT_ID
    link.rel = 'stylesheet'
    link.href = FONT_HREF
    document.head.appendChild(link)
  }, [])
}

export function useHeaderOffset() {
  const [topOffset, setTopOffset] = useState(90)

  useEffect(() => {
    const update = () => {
      const header = document.querySelector('.app-header')
      const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 78
      setTopOffset(Math.max(56, Math.min(220, headerH + 10)))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return topOffset
}

export function useSecondClock() {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return nowMs
}
