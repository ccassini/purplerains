import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useMonad } from '../contexts/MonadContext'
import { getNetworkStakingStats, formatStakedMON, formatAPY } from '../utils/stakingApi'
import { fetchMonPrice, formatPrice, formatChange } from '../utils/priceApi'
import { fetchMonadTVL, formatTVL } from '../utils/defillamaApi'
import { fetchGmonadsValidatorsEpoch, fetchGmonadsBlockMetrics } from '../utils/gmonadsApi'
import { formatTimeRemaining, BLOCKS_PER_EPOCH, BLOCK_TIME_MS } from '../utils/formatters'
import { logger } from '../utils/logger'
import './Footer.css'

function blockNumberFromLatest(latestBlock) {
  if (!latestBlock?.number && latestBlock?.number !== 0) return null
  const n = latestBlock.number
  return typeof n === 'string' ? parseInt(n, 16) : n
}

function formatEpochEtaShort(ms) {
  if (!ms || ms <= 0) return '—'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

/** Display live block time as ms when sub-second (Monad ~300ms). */
function formatBlockTime(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function StatItem({ label, children, className = '' }) {
  return (
    <div className={`footer-stat ${className}`.trim()}>
      <span className="footer-stat-label">{label}</span>
      <div className="footer-stat-value">{children}</div>
    </div>
  )
}

const Footer = () => {
  const { latestBlock, stats } = useMonad()

  const [staking, setStaking] = useState({ totalStaked: null, apy: null, loading: true })
  const [price, setPrice] = useState({ price: null, change24h: null, loading: true })
  const [tvl, setTvl] = useState({ totalTVL: null, loading: true })
  const [validators, setValidators] = useState({ active: null, total: null })
  const [blockTimeMs, setBlockTimeMs] = useState(null)

  const liveBlockInterval =
    (Number.isFinite(stats?.avgBlockTimeMs) && stats.avgBlockTimeMs > 0 && stats.avgBlockTimeMs) ||
    (Number.isFinite(blockTimeMs) && blockTimeMs > 0 && blockTimeMs) ||
    BLOCK_TIME_MS

  const epochInfo = useMemo(() => {
    const blockNumber = blockNumberFromLatest(latestBlock)
    if (blockNumber == null || !Number.isFinite(blockNumber)) {
      return {
        currentEpoch: 0,
        blocksInEpoch: 0,
        progress: 0,
        timeRemainingMs: BLOCKS_PER_EPOCH * liveBlockInterval,
      }
    }
    const currentEpoch = Math.floor(blockNumber / BLOCKS_PER_EPOCH)
    const blocksInEpoch = blockNumber % BLOCKS_PER_EPOCH
    const blocksRemaining = BLOCKS_PER_EPOCH - blocksInEpoch
    const progress = (blocksInEpoch / BLOCKS_PER_EPOCH) * 100
    const timeRemainingMs = blocksRemaining * liveBlockInterval
    return { currentEpoch, blocksInEpoch, progress, timeRemainingMs }
  }, [latestBlock, liveBlockInterval])

  const refreshSideData = useCallback(async () => {
    try {
      const [stakeRes, priceRes, tvlRes, epochRes, metricsRes] = await Promise.allSettled([
        getNetworkStakingStats(true),
        fetchMonPrice(),
        fetchMonadTVL(true),
        fetchGmonadsValidatorsEpoch('mainnet'),
        fetchGmonadsBlockMetrics('mainnet', true),
      ])

      if (stakeRes.status === 'fulfilled' && stakeRes.value) {
        setStaking({
          totalStaked: stakeRes.value.totalStaked,
          apy: stakeRes.value.apy,
          loading: false,
        })
      } else setStaking((p) => ({ ...p, loading: false }))

      if (priceRes.status === 'fulfilled' && priceRes.value) {
        setPrice({
          price: priceRes.value.price,
          change24h: priceRes.value.change24h,
          loading: false,
        })
      } else setPrice((p) => ({ ...p, loading: false }))

      if (tvlRes.status === 'fulfilled' && tvlRes.value) {
        setTvl({ totalTVL: tvlRes.value.totalTVL, loading: false })
      } else setTvl((p) => ({ ...p, loading: false }))

      if (epochRes.status === 'fulfilled' && epochRes.value?.data) {
        const rows = epochRes.value.data
        let active = 0
        for (const row of rows) {
          if (String(row?.validator_set_type || '').toLowerCase() === 'active') active += 1
        }
        setValidators({ active, total: rows.length })
      }

      if (metricsRes.status === 'fulfilled' && metricsRes.value) {
        const m = metricsRes.value
        // Block time fallback only — TPS always comes from RPC
        if (Number.isFinite(m.avgBlockTimeMs)) setBlockTimeMs(m.avgBlockTimeMs)
      }
    } catch (e) {
      logger.debug('Footer stats refresh:', e?.message || e)
    }
  }, [])

  useEffect(() => {
    refreshSideData()
    const id = window.setInterval(refreshSideData, 30_000)
    return () => window.clearInterval(id)
  }, [refreshSideData])

  const blockNum = blockNumberFromLatest(latestBlock)
  // Instant TPS from live RPC blocks (updated every new block in MonadContext)
  const displayTps =
    typeof stats?.currentTps === 'number' && Number.isFinite(stats.currentTps)
      ? Math.round(stats.currentTps)
      : null

  const displayBlockTime =
    (Number.isFinite(stats?.avgBlockTimeMs) && stats.avgBlockTimeMs > 0
      ? stats.avgBlockTimeMs
      : null) ?? blockTimeMs

  return (
    <footer className="app-footer app-footer-stats" aria-label="Network statistics">
      <div className="footer-stats-glow" aria-hidden="true" />
      <div className="footer-stats-inner">
        <div className="footer-stats-track">
          <div className="footer-stat footer-stat--network">
            <span className="footer-live-dot" aria-hidden="true" />
            <span className="footer-network-pill">
              MAINNET
            </span>
          </div>

          <span className="footer-stat-sep" aria-hidden="true" />

          <StatItem label="Block">
            {blockNum != null && Number.isFinite(blockNum) ? (
              <span className="footer-mono">#{blockNum.toLocaleString()}</span>
            ) : (
              <span className="footer-muted">—</span>
            )}
          </StatItem>

          <span className="footer-stat-sep" aria-hidden="true" />

          <StatItem label="Block Time" className="footer-stat--block-time">
            {displayBlockTime != null ? (
              <span className="footer-mono footer-block-time" title="Live RPC avg block interval">
                {formatBlockTime(displayBlockTime)}
              </span>
            ) : (
              <span className="footer-muted">…</span>
            )}
          </StatItem>

          <span className="footer-stat-sep" aria-hidden="true" />

          <StatItem label="Epoch">
            <span className="footer-mono footer-epoch-num">#{epochInfo.currentEpoch.toLocaleString()}</span>
          </StatItem>

          <span className="footer-stat-sep" aria-hidden="true" />

          <StatItem label="Price">
            {price.loading ? (
              <span className="footer-muted">…</span>
            ) : price.price != null ? (
              <span className="footer-price-row">
                <span className="footer-mono">{formatPrice(price.price)}</span>
                {price.change24h != null && (
                  <span className={`footer-pct ${price.change24h >= 0 ? 'is-up' : 'is-down'}`}>
                    {formatChange(price.change24h)}
                  </span>
                )}
              </span>
            ) : (
              <span className="footer-muted">—</span>
            )}
          </StatItem>

          <span className="footer-stat-sep" aria-hidden="true" />

          <StatItem label="Staked">
            {staking.loading ? (
              <span className="footer-muted">…</span>
            ) : (
              <span className="footer-mono">
                {formatStakedMON(staking.totalStaked)} <span className="footer-unit">MON</span>
              </span>
            )}
          </StatItem>

          <span className="footer-stat-sep" aria-hidden="true" />

          <StatItem label="APR">
            {staking.loading ? (
              <span className="footer-muted">…</span>
            ) : (
              <span className="footer-mono footer-apr">{formatAPY(staking.apy)}</span>
            )}
          </StatItem>

          <span className="footer-stat-sep" aria-hidden="true" />

          <StatItem label="TVL">
            {tvl.loading ? (
              <span className="footer-muted">…</span>
            ) : (
              <span className="footer-mono">{formatTVL(tvl.totalTVL)}</span>
            )}
          </StatItem>

          <span className="footer-stat-sep" aria-hidden="true" />

          <StatItem label="Validators">
            {validators.active != null && validators.total != null ? (
              <span className="footer-mono">
                {validators.active} <span className="footer-unit">/</span> {validators.total}
              </span>
            ) : (
              <span className="footer-muted">—</span>
            )}
          </StatItem>

          <span className="footer-stat-sep" aria-hidden="true" />

          <StatItem label="TPS" className="footer-stat--tps">
            {displayTps != null && displayTps > 0 ? (
              <span className="footer-mono footer-tps" title="Instant TPS from live RPC blocks">
                {Number(displayTps).toLocaleString()}
              </span>
            ) : (
              <span className="footer-muted">…</span>
            )}
          </StatItem>

          <span className="footer-stat-sep" aria-hidden="true" />

          <div className="footer-stat footer-stat--next-epoch">
            <span className="footer-stat-label">Next epoch</span>
            <div className="footer-next-epoch-row">
              <div className="footer-epoch-bar" title={formatTimeRemaining(epochInfo.timeRemainingMs)}>
                <div className="footer-epoch-bar-fill" style={{ width: `${epochInfo.progress}%` }} />
              </div>
              <span className="footer-mono footer-epoch-eta">{formatEpochEtaShort(epochInfo.timeRemainingMs)}</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
