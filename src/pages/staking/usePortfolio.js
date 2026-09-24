import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  decodeGetDelegationsResult,
  decodeGetDelegatorResult,
  encodeGetDelegationsCalldata,
  encodeGetDelegatorCalldata,
  STAKING_PRECOMPILE_ADDRESS,
} from '../../utils/stakingPrecompile'
import { multicallRaw } from './multicall'
import { createStakingReadGate, mapDelegator } from './useDelegatorPosition'

/** Pagination discovers unknown IDs; known IDs also retain rewards-only positions after unlinking. */
export async function readPortfolio(publicClient, address, knownValidatorIds = []) {
  const ids = new Set(knownValidatorIds.filter((id) => Number.isSafeInteger(id) && id > 0))
  const cursors = new Set()
  let cursor = 0n
  for (;;) {
    if (cursors.has(cursor) || cursors.size >= 1000) throw new Error('Invalid delegation pagination')
    cursors.add(cursor)
    const result = await publicClient.call({ to: STAKING_PRECOMPILE_ADDRESS, data: encodeGetDelegationsCalldata(address, cursor) })
    const page = decodeGetDelegationsResult(typeof result === 'string' ? result : result?.data)
    page.ids.forEach((id) => ids.add(id))
    if (page.done) break
    cursor = page.nextValId
  }
  const calls = [...ids].map((id) => ({ key: id, data: encodeGetDelegatorCalldata(id, address) }))
  const results = await multicallRaw(publicClient, STAKING_PRECOMPILE_ADDRESS, calls)
  if (results.length !== ids.size) throw new Error('Portfolio data is incomplete')
  const rows = results.map((result) => {
    if (!result.success || !result.data) throw new Error('Portfolio data is incomplete')
    const position = mapDelegator(decodeGetDelegatorResult(result.data))
    return { validatorId: result.key, ...position, pending: position.deltaStake + position.nextDeltaStake }
  }).filter((row) => row.stake > 0n || row.unclaimedRewards > 0n || row.pending > 0n)
  return rows.sort((a, b) => (a.stake === b.stake ? 0 : a.stake > b.stake ? -1 : 1))
}

const EMPTY = { rows: [], state: 'idle', scannedAt: null, error: null }

export function usePortfolio({ publicClient, address, enabled, validators = [] }) {
  const idsKey = [...new Set(validators.map((validator) => validator.id).filter((id) => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b).join(',')
  const scope = useMemo(() => ({ publicClient, address, enabled, validatorIds: idsKey ? idsKey.split(',').map(Number) : [] }), [publicClient, address, enabled, idsKey])
  const gateRef = useRef(null)
  if (!gateRef.current) gateRef.current = createStakingReadGate()
  gateRef.current.setScope(scope)
  const [snapshot, setSnapshot] = useState(EMPTY)
  const canRead = Boolean(publicClient && address && enabled)

  const refresh = useCallback(async () => {
    if (!canRead) return
    setSnapshot((prev) => ({ ...(prev.scope === scope ? prev : EMPTY), scope, state: 'loading', error: null }))
    return gateRef.current.run(scope, async () => {
      try { return { rows: await readPortfolio(publicClient, address, scope.validatorIds), state: 'ready', scannedAt: Date.now(), error: null } }
      catch { return { state: 'error', error: 'Portfolio data could not be verified. Refresh to try again.' } }
    }, (result) => setSnapshot((prev) => ({ ...prev, ...result, scope })))
  }, [address, canRead, publicClient, scope])

  useEffect(() => {
    refresh()
    return () => { gateRef.current.invalidate() }
  }, [refresh])

  const current = canRead && snapshot.scope === scope ? snapshot : EMPTY
  const totals = useMemo(() => ({
    staked: current.rows.reduce((sum, row) => sum + row.stake, 0n),
    rewards: current.rows.reduce((sum, row) => sum + row.unclaimedRewards, 0n),
    pending: current.rows.reduce((sum, row) => sum + row.pending, 0n),
    count: current.rows.length,
  }), [current.rows])
  return { ...current, state: canRead && snapshot.scope !== scope ? 'loading' : current.state, totals, loading: canRead && (snapshot.scope !== scope || current.state === 'loading'), lastUpdated: current.scannedAt, refresh }
}
