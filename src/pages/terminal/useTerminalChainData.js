import { useEffect, useRef, useState } from 'react'
import { createTerminalChainFeed, createTerminalChainStore } from './terminalChain'

export function useTerminalChainData({ transactions, blocks, validatorLeaderboard } = {}) {
  const storeRef = useRef(null)
  if (!storeRef.current) storeRef.current = createTerminalChainStore()
  const feedRef = useRef(null)
  const [snapshot, setSnapshot] = useState(() => storeRef.current.snapshot())

  useEffect(() => {
    const feed = createTerminalChainFeed({
      store: storeRef.current,
      onSnapshot: setSnapshot,
      visibilityTarget: typeof document === 'undefined' ? undefined : document,
    })
    feedRef.current = feed
    return () => {
      feed.dispose()
      feedRef.current = null
    }
  }, [])

  useEffect(() => {
    feedRef.current?.update({ transactions, blocks, validatorLeaderboard })
  }, [transactions, blocks, validatorLeaderboard])

  return snapshot
}
