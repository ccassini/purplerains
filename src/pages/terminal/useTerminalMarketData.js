import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MONAD_STABLECOINS } from '../../config/monadNetwork'
import { POOL_POLL_MS, TRADE_POLL_MS, WMON } from './constants'
import { fetchGeckoBundle, fetchGeckoTrades } from './geckoApi'
import { fetchMonadTokenPairs } from './dexSearch'
import { fillFromGeckoTrade } from './deriveFill'
import { mergePools } from './poolNormalize'
import { createTerminalPollLoop } from './terminalPerformance'
import { chooseTokenPool, createPoolSampler, geckoTradeContext, normalizeMarketSnapshots, retainMarketSnapshots, samePool } from './terminalMarketData'
import { loadTerminalSelection } from './terminalSelection'

const SEED_TOKENS = [WMON, MONAD_STABLECOINS.USDC[0], MONAD_STABLECOINS.AUSD[0]].map((address) => address.toLowerCase())
const visible = () => document.visibilityState !== 'hidden'
const message = (error) => error?.message || String(error)

/** One shared market owner: background discovery plus cancelable selected-pool coverage. */
export function useTerminalMarketData({ window: marketWindow, selected, remoteHits, onFill, onPriorityPool }) {
  const [snapshots, setSnapshots] = useState({ gecko: {}, dex: {}, focused: [] })
  const [sourceState, setSourceState] = useState({ geckoErrors: [], dexError: null, tradeError: null, sampledPools: 0 })
  const [refreshing, setRefreshing] = useState(false)
  const [poolCoverage, setPoolCoverage] = useState(null)
  const [focusRevision, setFocusRevision] = useState(0)
  const loops = useRef(new Set())
  const refreshers = useRef({})
  const allPoolsRef = useRef([])
  const selectedPoolRef = useRef(null)
  const onFillRef = useRef(onFill)
  onFillRef.current = onFill
  const onPriorityPoolRef = useRef(onPriorityPool)
  onPriorityPoolRef.current = onPriorityPool
  const prioritizePool = useCallback((poolId) => {
    selectedPoolRef.current = poolId
    onPriorityPoolRef.current?.(poolId)
  }, [])
  const sampleIds = useRef(new Set())
  const sampler = useRef(createPoolSampler())
  const normalized = useMemo(() => normalizeMarketSnapshots(snapshots, marketWindow), [snapshots, marketWindow])
  allPoolsRef.current = mergePools([...normalized.pools, ...normalized.fresh, ...remoteHits])

  const rememberFocused = useCallback((key, kind, payload) => {
    setSnapshots((previous) => ({ ...previous, focused: [...previous.focused.filter((entry) => entry.key !== key), { key, kind, payload }].slice(-12) }))
  }, [])
  const ingestSample = useCallback((payload, pool) => {
    const context = geckoTradeContext(pool)
    for (const row of payload.data || []) onFillRef.current(fillFromGeckoTrade(row, context))
    sampleIds.current.delete(pool.address)
    sampleIds.current.add(pool.address)
    if (sampleIds.current.size > 80) sampleIds.current.delete(sampleIds.current.values().next().value)
    setSourceState((state) => ({ ...state, tradeError: null, sampledPools: sampleIds.current.size }))
  }, [])

  useEffect(() => {
    const update = () => { for (const loop of loops.current) loop.setActive(visible()) }
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  useEffect(() => {
    let mounted = true
    const registry = loops.current
    const handles = refreshers.current
    const loop = createTerminalPollLoop(async (signal) => {
      setRefreshing(true)
      try {
        const bundle = await fetchGeckoBundle({ signal })
        if (!mounted || signal.aborted) return
        setSnapshots((previous) => {
          const gecko = retainMarketSnapshots(previous.gecko, bundle)
          return gecko === previous.gecko ? previous : { ...previous, gecko }
        })
        setSourceState((state) => ({ ...state, geckoErrors: bundle.errors || [] }))
      } catch (error) {
        if (mounted && !signal.aborted) setSourceState((state) => ({ ...state, geckoErrors: [message(error)] }))
      } finally { if (mounted) setRefreshing(false) }
    }, { intervalMs: POOL_POLL_MS })
    registry.add(loop); handles.market = loop
    loop.setActive(visible()); loop.start()
    return () => { mounted = false; loop.dispose(); registry.delete(loop); delete handles.market }
  }, [])

  useEffect(() => {
    const registry = loops.current
    const handles = refreshers.current
    const loop = createTerminalPollLoop(async (signal) => {
      try {
        const results = await Promise.allSettled(SEED_TOKENS.map((token) => fetchMonadTokenPairs(token, { signal })))
        if (signal.aborted) return
        const bundle = {}
        const errors = []
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') bundle[SEED_TOKENS[index]] = result.value
          else errors.push(message(result.reason))
        })
        setSnapshots((previous) => {
          const dex = retainMarketSnapshots(previous.dex, bundle, SEED_TOKENS)
          return dex === previous.dex ? previous : { ...previous, dex }
        })
        setSourceState((state) => ({ ...state, dexError: errors.length ? [...new Set(errors)].join(' · ') : null }))
      } catch (error) {
        if (!signal.aborted) setSourceState((state) => ({ ...state, dexError: message(error) }))
      }
    }, { intervalMs: 60_000 })
    registry.add(loop); handles.dex = loop
    loop.setActive(visible()); loop.start()
    return () => { loop.dispose(); registry.delete(loop); delete handles.dex }
  }, [])

  useEffect(() => {
    const registry = loops.current
    const handles = refreshers.current
    const loop = createTerminalPollLoop(async (signal) => {
      const pool = sampler.current.next(allPoolsRef.current, selectedPoolRef.current)
      if (!pool?.address) return
      try {
        const payload = await fetchGeckoTrades(pool.address, { signal })
        if (!signal.aborted) ingestSample(payload, pool)
      } catch (error) {
        if (!signal.aborted) setSourceState((state) => ({ ...state, tradeError: message(error) }))
      }
    }, { intervalMs: TRADE_POLL_MS })
    registry.add(loop); handles.trades = loop
    loop.setActive(visible()); loop.start()
    return () => { loop.dispose(); registry.delete(loop); delete handles.trades }
  }, [ingestSample])

  const hasPools = normalized.pools.length > 0
  useEffect(() => { if (hasPools) refreshers.current.trades?.refresh() }, [hasPools])

  const selectedId = selected?.id
  const selectedType = selected?.type
  useEffect(() => {
    prioritizePool(null)
    if (!selectedId || !['pool', 'token'].includes(selectedType)) { setPoolCoverage(null); return undefined }
    let active = true
    const registry = loops.current
    const handles = refreshers.current
    const loop = createTerminalPollLoop(async (signal) => {
      const knownPool = selectedType === 'pool'
        ? allPoolsRef.current.find((row) => samePool(row.address, selectedId))
        : chooseTokenPool(allPoolsRef.current, selectedId)
      let poolId = selectedType === 'pool' ? selectedId : knownPool?.address
      prioritizePool(poolId)
      setPoolCoverage((previous) => ({ ...(samePool(previous?.poolId, poolId) ? previous : {}), selectionId: selectedId, selectionType: selectedType, poolId, loading: true, error: null }))
      try {
        const result = await loadTerminalSelection({ selected: { id: selectedId, type: selectedType }, pools: allPoolsRef.current, window: marketWindow, signal })
        if (signal.aborted || !active) return
        poolId = result.poolId
        prioritizePool(poolId)
        for (const snapshot of result.snapshots) rememberFocused(snapshot.key, snapshot.kind, snapshot.payload)
        if (result.trades) ingestSample(result.trades, result.pool || { address: poolId })
        setPoolCoverage((previous) => ({
          ...(samePool(previous?.poolId, poolId) ? previous : {}),
          selectionId: selectedId, selectionType: selectedType, poolId, loading: false, error: result.tradeError, metadataError: result.metadataError,
          ...(result.trades ? { fetchedAt: result.trades.fetchedAt, tradeCount: result.trades.data.length } : {}),
        }))
      } catch (error) {
        if (active && !signal.aborted) setPoolCoverage((previous) => ({ ...(samePool(previous?.poolId, poolId) ? previous : {}), selectionId: selectedId, selectionType: selectedType, poolId, loading: false, error: message(error) }))
      }
    }, { intervalMs: 60_000 })
    registry.add(loop); handles.selected = loop
    loop.setActive(visible()); loop.start()
    return () => { active = false; loop.dispose(); registry.delete(loop); delete handles.selected; prioritizePool(null) }
  }, [selectedId, selectedType, marketWindow, focusRevision, rememberFocused, ingestSample, prioritizePool])

  const refresh = useCallback(() => {
    for (const loop of Object.values(refreshers.current)) loop.refresh()
  }, [])
  const retrySelected = useCallback(() => setFocusRevision((value) => value + 1), [])
  const sourceInfo = useMemo(() => {
    const geckoTimes = Object.values(snapshots.gecko).map((row) => row.fetchedAt).filter(Number.isFinite)
    const dexTimes = Object.values(snapshots.dex).map((row) => row.fetchedAt).filter(Number.isFinite)
    return { ...sourceState, geckoAt: geckoTimes.length ? Math.min(...geckoTimes) : null, dexAt: dexTimes.length ? Math.min(...dexTimes) : null }
  }, [snapshots.gecko, snapshots.dex, sourceState])
  return { ...normalized, ...sourceInfo, refreshing, poolCoverage, refresh, retrySelected }
}
