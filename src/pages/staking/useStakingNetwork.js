import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeStakingStatsFromGmonadsRows, parseStakingMon } from '../../utils/stakingApi'
import { getAllValidators, getLocalLogoPath, loadValidatorMetadata } from '../../utils/validatorApi'
import { decodeGetEpochResult, encodeGetEpochCalldata, STAKING_PRECOMPILE_ADDRESS } from '../../utils/stakingPrecompile'
import { feePercentiles } from './stakingMath'

const VALIDATOR_REFRESH_MS = 60_000
const EPOCH_REFRESH_MS = 30_000

export function normalizeStakingRows(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Validator data is unavailable')
  const next = {}
  for (const row of rows) {
    const id = Number(row?.val_index)
    if (!Number.isSafeInteger(id) || id <= 0 || next[id]) throw new Error('Validator data is incomplete')
    const commission = Number(row.commission)
    const commissionBps = row.commission != null && Number.isInteger(commission) && commission >= 0 && commission <= 10_000 ? commission : null
    next[id] = {
      totalStakeWei: parseStakingMon(row.stake),
      commissionBps,
      commissionWad: commissionBps === null ? null : BigInt(commissionBps) * 10n ** 14n,
      setType: String(row.validator_set_type || ''),
      flags: String(row.flags || ''),
      authAddress: row.auth_address || null,
    }
  }
  return next
}

export function useStakingNetwork(publicClient) {
  const [network, setNetwork] = useState({ rows: [], chainStatsById: {}, loading: true, updating: false, lastUpdated: null, error: null })
  const [epochSnapshot, setEpochSnapshot] = useState(null)
  const [metadata, setMetadata] = useState(() => getAllValidators())
  const mountedRef = useRef(false)
  const networkRunRef = useRef(0)
  const epochRunRef = useRef(0)
  const clientRef = useRef(publicClient)
  clientRef.current = publicClient

  useEffect(() => {
    let cancelled = false
    loadValidatorMetadata().then(() => { if (!cancelled) setMetadata(getAllValidators()) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const refreshValidators = useCallback(async () => {
    const run = ++networkRunRef.current
    setNetwork((prev) => ({ ...prev, updating: true }))
    try {
      const response = await fetch('https://www.gmonads.com/api/v1/public/validators/epoch?network=mainnet', { cache: 'no-store', signal: AbortSignal.timeout(12_000) })
      if (!response.ok) throw new Error('Validator data is unavailable')
      const payload = await response.json()
      if (!payload.success) throw new Error('Validator data is unavailable')
      const chainStatsById = normalizeStakingRows(payload.data)
      if (!mountedRef.current || run !== networkRunRef.current) return
      // Replace this snapshot so a removed validator cannot retain stale live status.
      setNetwork({ rows: payload.data, chainStatsById, loading: false, updating: false, lastUpdated: Date.now(), error: null })
    } catch {
      if (mountedRef.current && run === networkRunRef.current) setNetwork((prev) => ({ ...prev, loading: false, updating: false, error: 'Could not refresh validator data. The last verified snapshot is shown.' }))
    }
  }, [])

  const refreshEpoch = useCallback(async () => {
    const run = ++epochRunRef.current
    if (!publicClient) return
    const isCurrent = () => mountedRef.current && clientRef.current === publicClient && run === epochRunRef.current
    try {
      const result = await publicClient.call({ to: STAKING_PRECOMPILE_ADDRESS, data: encodeGetEpochCalldata() })
      const decoded = decodeGetEpochResult(typeof result === 'string' ? result : result?.data)
      if (!Number.isSafeInteger(decoded.epoch) || decoded.epoch < 0) throw new Error('Invalid epoch')
      if (isCurrent()) setEpochSnapshot({ ...decoded, client: publicClient, lastUpdated: Date.now(), error: null })
    } catch {
      if (isCurrent()) setEpochSnapshot((prev) => ({ ...(prev?.client === publicClient ? prev : {}), client: publicClient, error: 'Current epoch could not be verified.' }))
    }
  }, [publicClient])

  useEffect(() => {
    mountedRef.current = true
    refreshValidators()
    const interval = window.setInterval(refreshValidators, VALIDATOR_REFRESH_MS)
    return () => { mountedRef.current = false; networkRunRef.current += 1; window.clearInterval(interval) }
  }, [refreshValidators])

  useEffect(() => {
    refreshEpoch()
    const interval = window.setInterval(refreshEpoch, EPOCH_REFRESH_MS)
    return () => { epochRunRef.current += 1; window.clearInterval(interval) }
  }, [refreshEpoch])

  const validators = useMemo(() => {
    const metadataById = new Map(metadata.map((validator) => [Number(validator.id), validator]))
    const ids = new Set([...metadataById.keys(), ...Object.keys(network.chainStatsById).map(Number)])
    return [...ids].filter((id) => Number.isSafeInteger(id) && id > 0).map((id) => {
      const detail = metadataById.get(id)
      const stats = network.chainStatsById[id]
      return {
        id, name: detail?.name || `Validator #${id}`, website: detail?.website || null,
        logo: getLocalLogoPath(id), totalStakeWei: stats?.totalStakeWei ?? null,
        commissionBps: stats?.commissionBps ?? null, setType: stats?.setType ?? null,
        isActive: String(stats?.setType || '').toLowerCase() === 'active', hasChainData: Boolean(stats),
      }
    })
  }, [metadata, network.chainStatsById])
  const networkStats = useMemo(() => computeStakingStatsFromGmonadsRows(network.rows), [network.rows])
  const epochInfo = useMemo(() => {
    if (epochSnapshot?.client === publicClient && epochSnapshot?.lastUpdated) {
      return { ...epochSnapshot, source: 'chain', isFresh: !epochSnapshot.error && Date.now() - epochSnapshot.lastUpdated <= EPOCH_REFRESH_MS * 2 }
    }
    const value = network.rows[0]?.epoch
    const epoch = value == null ? null : Number(value)
    const sourceUpdatedAt = Date.parse(network.rows[0]?.timestamp)
    return { epoch: Number.isSafeInteger(epoch) ? epoch : null, inEpochDelayPeriod: null, source: 'snapshot', lastUpdated: Number.isFinite(sourceUpdatedAt) ? sourceUpdatedAt : null, isFresh: false, error: epochSnapshot?.error ?? null }
  }, [epochSnapshot, network.rows, publicClient])
  const fees = useMemo(() => feePercentiles(validators.filter((validator) => validator.isActive).map((validator) => validator.commissionBps)), [validators])
  const totalStakeWei = useMemo(() => validators.reduce((sum, validator) => sum + (validator.totalStakeWei ?? 0n), 0n), [validators])
  const refresh = useCallback(() => Promise.all([refreshValidators(), refreshEpoch()]), [refreshEpoch, refreshValidators])

  return {
    validators, chainStatsById: network.chainStatsById, networkStats, epochInfo,
    baseAprBps: networkStats.grossApr == null ? null : Math.round(networkStats.grossApr * 100),
    baseApyBps: networkStats.grossApr == null ? 0 : Math.round(networkStats.grossApr * 100),
    fees, totalStakeWei, activeCount: validators.filter((validator) => validator.isActive).length,
    loadedCount: Object.keys(network.chainStatsById).length,
    loading: network.loading, updating: network.updating, lastUpdated: network.lastUpdated, fetchedAt: network.lastUpdated, sourceUpdatedAt: networkStats.sourceUpdatedAt ?? null,
    dataError: network.error, refresh, refreshEpoch,
    dismissError: () => setNetwork((prev) => ({ ...prev, error: null })),
  }
}
