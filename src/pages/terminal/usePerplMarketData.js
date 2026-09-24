import { useCallback, useEffect, useRef, useState } from 'react'
import { createPerplMarketFeed } from './perplMarketData'

export function usePerplMarketData({ active = false } = {}) {
  const [state, setState] = useState({ markets: [], trades: [], status: 'paused', error: null, lastMessageAt: null })
  const feedRef = useRef(null)
  const activeRef = useRef(active)
  activeRef.current = active
  useEffect(() => {
    const feed = createPerplMarketFeed({ onChange: setState })
    feedRef.current = feed
    const syncVisibility = () => feed.setActive(activeRef.current && document.visibilityState !== 'hidden')
    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility)
      feed.dispose()
      if (feedRef.current === feed) feedRef.current = null
    }
  }, [])
  useEffect(() => {
    feedRef.current?.setActive(active && document.visibilityState !== 'hidden')
  }, [active])
  const retry = useCallback(() => feedRef.current?.retry(), [])
  return { ...state, retry }
}

export default usePerplMarketData
