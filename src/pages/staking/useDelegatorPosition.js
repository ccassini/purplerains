import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  decodeGetDelegatorResult,
  decodeGetWithdrawalRequestResult,
  encodeGetDelegatorCalldata,
  encodeGetWithdrawalRequestCalldata,
  STAKING_PRECOMPILE_ADDRESS,
} from '../../utils/stakingPrecompile'
import { multicallRaw } from './multicall'

export const MAX_WITHDRAWAL_SLOTS = 256

export function mapDelegator(raw) {
  if (!raw) return null
  return {
    stake: raw.v0 ?? 0n,
    unclaimedRewards: raw.v2 ?? 0n,
    deltaStake: raw.v3 ?? 0n,
    nextDeltaStake: raw.v4 ?? 0n,
    deltaEpoch: raw.e0 ?? null,
    nextDeltaEpoch: raw.e1 ?? null,
  }
}

export function parseWithdrawalResults(results) {
  const seen = new Set()
  const withdrawals = []
  let nextSlot = null
  for (const row of results) {
    if (!Number.isInteger(row.key) || row.key < 0 || row.key >= MAX_WITHDRAWAL_SLOTS || seen.has(row.key) || !row.success || !row.data) {
      throw new Error('Withdrawal data is incomplete. Refresh before unstaking.')
    }
    seen.add(row.key)
    const decoded = decodeGetWithdrawalRequestResult(row.data)
    if (decoded.amount > 0n) withdrawals.push({ id: row.key, ...decoded })
    else if (nextSlot === null || row.key < nextSlot) nextSlot = row.key
  }
  if (seen.size !== MAX_WITHDRAWAL_SLOTS) throw new Error('Withdrawal data is incomplete. Refresh before unstaking.')
  return { withdrawals: withdrawals.sort((a, b) => a.id - b.id), nextSlot }
}

export async function readDelegatorPosition(publicClient, address, validatorId) {
  const result = await publicClient.call({
    to: STAKING_PRECOMPILE_ADDRESS,
    data: encodeGetDelegatorCalldata(validatorId, address),
  })
  const hex = typeof result === 'string' ? result : result?.data
  if (!hex || hex === '0x') throw new Error('Position data is unavailable')
  return mapDelegator(decodeGetDelegatorResult(hex))
}

export async function readWithdrawals(publicClient, address, validatorId) {
  const calls = Array.from({ length: MAX_WITHDRAWAL_SLOTS }, (_, id) => ({
    key: id,
    data: encodeGetWithdrawalRequestCalldata(validatorId, address, id),
  }))
  return parseWithdrawalResults(await multicallRaw(publicClient, STAKING_PRECOMPILE_ADDRESS, calls))
}

const EMPTY = { position: null, withdrawals: [], nextSlot: null, loading: false, updating: false, error: null, lastUpdated: null, withdrawalsReady: false, positionReady: false }

/** Invalidate in-flight reads both on a new request and immediately on a wallet/selection change. */
export function createStakingReadGate() {
  let currentScope
  let revision = 0
  return {
    setScope(scope) { if (scope !== currentScope) { currentScope = scope; revision += 1 } },
    invalidate() { revision += 1 },
    async run(scope, load, publish) {
      const request = ++revision
      const value = await load()
      if (request === revision && scope === currentScope) publish(value)
    },
  }
}

export function useDelegatorPosition({ publicClient, address, validatorId, enabled }) {
  const scope = useMemo(() => ({ publicClient, address, validatorId, enabled }), [publicClient, address, validatorId, enabled])
  const gateRef = useRef(null)
  if (!gateRef.current) gateRef.current = createStakingReadGate()
  gateRef.current.setScope(scope)
  const [snapshot, setSnapshot] = useState(EMPTY)
  const canRead = Boolean(publicClient && address && Number.isSafeInteger(validatorId) && validatorId > 0 && enabled)

  const refresh = useCallback(async () => {
    if (!canRead) return
    setSnapshot((prev) => ({ ...(prev.scope === scope ? prev : EMPTY), scope, loading: !prev.lastUpdated || prev.scope !== scope, updating: true, error: null, withdrawalsReady: false, nextSlot: null }))
    return gateRef.current.run(scope, () => Promise.allSettled([
      readDelegatorPosition(publicClient, address, validatorId),
      readWithdrawals(publicClient, address, validatorId),
    ]), ([positionResult, withdrawalsResult]) => {
    const positionReady = positionResult.status === 'fulfilled'
    const withdrawalsReady = withdrawalsResult.status === 'fulfilled'
    setSnapshot((prev) => ({
      ...(prev.scope === scope ? prev : EMPTY),
      scope,
      ...(positionReady ? { position: positionResult.value } : {}),
      ...(withdrawalsReady ? withdrawalsResult.value : { nextSlot: null }),
      loading: false, updating: false, positionReady, withdrawalsReady,
      lastUpdated: positionReady && withdrawalsReady ? Date.now() : prev.lastUpdated,
      error: !positionReady || !withdrawalsReady ? 'Some position data could not be verified. Refresh to try again.' : null,
    }))
    })
  }, [address, canRead, publicClient, scope, validatorId])

  useEffect(() => {
    refresh()
    return () => { gateRef.current.invalidate() }
  }, [refresh])

  // Mask the previous wallet/validator immediately, before effects finish.
  const current = canRead && snapshot.scope === scope ? snapshot : EMPTY
  return { ...current, loading: canRead && (snapshot.scope !== scope || current.loading), refresh }
}
