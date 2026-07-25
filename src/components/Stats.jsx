import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMonad } from '../contexts/MonadContext'
import { logger } from '../utils/logger'
import {
  Coins,
  Timer,
  Hash,
  BarChart3,
  X,
  Percent,
  Layers,
  User
} from 'lucide-react'
import { getNetworkStakingStats, formatStakedMON, formatAPY } from '../utils/stakingApi'
import { loadValidatorMetadata } from '../utils/validatorApi'
import { fetchMonPrice, formatPrice, formatChange } from '../utils/priceApi'
import { MONAD_MAINNET_CONFIG } from '../config/monadNetwork'
import { formatNumberCompact, formatTimeRemaining, BLOCKS_PER_EPOCH, BLOCK_TIME_MS } from '../utils/formatters'
import './Stats.css'

const Stats = () => {
  const { stats, latestBlock } = useMonad()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  
  // Staking data state
  const [stakingData, setStakingData] = useState({
    totalStaked: null,
    apy: null,
    loading: true
  })
  
  // Block producer/validator state
  const [blockProducer, setBlockProducer] = useState({
    validator: null,
    loading: true
  })
  
  // MON price state
  const [priceData, setPriceData] = useState({
    price: null,
    change24h: null,
    loading: true
  })
  
  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Fetch staking data
  const fetchStakingData = useCallback(async () => {
    try {
      const data = await getNetworkStakingStats()
      setStakingData({
        totalStaked: data.totalStaked,
        apy: data.apy,
        loading: false
      })
    } catch (error) {
      logger.error('Failed to fetch staking data:', error)
      setStakingData(prev => ({ ...prev, loading: false }))
    }
  }, [])

  // Fetch staking data on mount and every 60 seconds
  useEffect(() => {
    fetchStakingData()
    const interval = setInterval(fetchStakingData, 60000)
    return () => clearInterval(interval)
  }, [fetchStakingData])

  // Fetch MON price
  const fetchPriceData = useCallback(async () => {
    try {
      const data = await fetchMonPrice()
      if (data) {
        setPriceData({
          price: data.price,
          change24h: data.change24h,
          loading: false
        })
      } else {
        setPriceData(prev => ({ ...prev, loading: false }))
      }
    } catch (error) {
      logger.error('Failed to fetch MON price:', error)
      setPriceData(prev => ({ ...prev, loading: false }))
    }
  }, [])

  // Fetch price on mount and every 60 seconds
  useEffect(() => {
    fetchPriceData()
    const interval = setInterval(fetchPriceData, 60000)
    return () => clearInterval(interval)
  }, [fetchPriceData])

  // Load validator metadata on mount
  useEffect(() => {
    loadValidatorMetadata()
  }, [])

  // Use proposer info already fetched by MonadContext (avoids duplicate RPC call)
  useEffect(() => {
    if (!latestBlock) return
    const v = latestBlock.proposerValidator
    if (v) {
      setBlockProducer({ validator: v, loading: false })
    } else if (latestBlock.proposerId) {
      setBlockProducer({
        validator: { id: latestBlock.proposerId, name: `Validator #${latestBlock.proposerId}` },
        loading: false
      })
    } else {
      setBlockProducer({ validator: null, loading: false })
    }
  }, [latestBlock])

  // Calculate epoch info
  const epochInfo = useMemo(() => {
    if (!latestBlock?.number) {
      return {
        currentEpoch: 0,
        blocksInEpoch: 0,
        blocksRemaining: BLOCKS_PER_EPOCH,
        progress: 0,
        timeRemainingMs: BLOCKS_PER_EPOCH * BLOCK_TIME_MS
      }
    }

    const blockNumber = latestBlock.number
    const currentEpoch = Math.floor(blockNumber / BLOCKS_PER_EPOCH)
    const blocksInEpoch = blockNumber % BLOCKS_PER_EPOCH
    const blocksRemaining = BLOCKS_PER_EPOCH - blocksInEpoch
    const progress = (blocksInEpoch / BLOCKS_PER_EPOCH) * 100
    const timeRemainingMs = blocksRemaining * BLOCK_TIME_MS

    return {
      currentEpoch,
      blocksInEpoch,
      blocksRemaining,
      progress,
      timeRemainingMs
    }
  }, [latestBlock])

  // On mobile, only show panel when mobileOpen is true
  const shouldShowPanel = !isMobile || mobileOpen
  const panelClassName = `stats-panel ${mobileOpen ? 'mobile-open' : ''}`

  return (
    <>
      {/* Mobile Toggle Button */}
      {isMobile && !mobileOpen && (
        <motion.button
          className="stats-mobile-toggle"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => setMobileOpen(true)}
        >
          <BarChart3 size={14} />
          <span>Stats</span>
        </motion.button>
      )}

      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobile && mobileOpen && (
          <motion.div
            className="stats-mobile-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Stats Panel */}
      {shouldShowPanel && (
      <motion.div 
        className={panelClassName}
        initial={{ x: isMobile ? 0 : 300, opacity: 0, scale: isMobile ? 0.9 : 1 }}
        animate={{ x: 0, opacity: 1, scale: 1 }}
        transition={{ duration: isMobile ? 0.3 : 0.8, ease: "easeOut", delay: isMobile ? 0 : 0.5 }}
      >
        {/* Header with Block */}
        <div className="stats-header">
          <div className="stats-header-cluster">
            <h3>Network Statistics</h3>
            {latestBlock && (
              <div className="latest-block">
                Block #{latestBlock.number?.toLocaleString()}
              </div>
            )}
          </div>
          {isMobile && mobileOpen && (
            <button type="button" className="stats-close-btn" onClick={() => setMobileOpen(false)} aria-label="Close statistics">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Block Producer / Validator Info */}
        {latestBlock && (
          <div className="block-producer-section">
            <div className="producer-label">
              <User size={12} />
              <span>Block Producer</span>
            </div>
            <div className="producer-info">
              {blockProducer.loading ? (
                <span className="loading-shimmer">Loading...</span>
              ) : blockProducer.validator ? (
                <>
                  <div className="validator-avatar" key={blockProducer.validator.id || blockProducer.validator.name}>
                    {(blockProducer.validator.localLogo || blockProducer.validator.logo) ? (
                      <img 
                        src={blockProducer.validator.localLogo || blockProducer.validator.logo} 
                        alt={blockProducer.validator.name}
                        onError={(e) => {
                          e.target.style.display = 'none'
                          if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex'
                        }}
                      />
                    ) : null}
                    <div 
                      className="validator-avatar-fallback" 
                      style={{ display: (blockProducer.validator.localLogo || blockProducer.validator.logo) ? 'none' : 'flex' }}
                    >
                      <User size={20} />
                    </div>
                  </div>
                  <div className="validator-details">
                    <span className="validator-name">{blockProducer.validator.name}</span>
                    {blockProducer.validator.id && (
                      <span className="validator-id">#{blockProducer.validator.id}</span>
                    )}
                  </div>
                  {blockProducer.validator.website && (
                    <a 
                      href={blockProducer.validator.website} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="validator-link"
                      title="Visit website"
                    >
                      ↗
                    </a>
                  )}
                </>
              ) : (
                <span className="producer-unknown">
                  <User size={14} />
                  <span>Unknown Validator</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Epoch Section */}
        <div className="epoch-section">
          <div className="epoch-header-row">
            <div className="epoch-badge">
              <Hash size={12} />
              <span className="epoch-num">#{epochInfo.currentEpoch}</span>
              <span className="epoch-text">epoch</span>
            </div>
            <div className="epoch-live-badge">
              <span className="live-dot"></span>
              Live
            </div>
          </div>

          {/* Epoch Details */}
          <div className="epoch-details-grid">
            <div className="epoch-detail">
              <span className="detail-label">ROUND</span>
              <span className="detail-value">{formatNumberCompact(latestBlock?.number || 0)}</span>
            </div>
            <div className="epoch-detail">
              <span className="detail-label">STATUS</span>
              <span className="detail-value status-ok">Finalized</span>
            </div>
            <div className="epoch-detail">
              <span className="detail-label">TXS</span>
              <span className="detail-value">{latestBlock?.transactionCount || 0}</span>
            </div>
          </div>

          {/* MON Price & Staking Stats */}
          <div className="staking-section">
            <div className="staking-stat price-stat">
              <div className="staking-stat-header">
                <Coins size={14} className="staking-icon price-icon" />
                <span className="staking-label">MON Price</span>
              </div>
              <div className="staking-value price-value">
                {priceData.loading ? (
                  <span className="loading-shimmer">Loading...</span>
                ) : priceData.price ? (
                  <div className="price-display">
                    <span className="price-amount">{formatPrice(priceData.price)}</span>
                    {priceData.change24h !== null && (
                      <span className={`price-change ${priceData.change24h >= 0 ? 'positive' : 'negative'}`}>
                        {formatChange(priceData.change24h)}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="price-unavailable">—</span>
                )}
              </div>
            </div>
            <div className="staking-stat">
              <div className="staking-stat-header">
                <Layers size={14} className="staking-icon" />
                <span className="staking-label">Staking Pool</span>
              </div>
              <div className="staking-value">
                {stakingData.loading ? (
                  <span className="loading-shimmer">Loading...</span>
                ) : (
                  <>{formatStakedMON(stakingData.totalStaked)} <span className="staking-unit">MON</span></>
                )}
              </div>
            </div>
            <div className="staking-stat">
              <div className="staking-stat-header">
                <Percent size={14} className="staking-icon apy-icon" />
                <span className="staking-label">Staking APR</span>
              </div>
              <div className="staking-value apy-value">
                {stakingData.loading ? (
                  <span className="loading-shimmer">Loading...</span>
                ) : (
                  formatAPY(stakingData.apy)
                )}
              </div>
            </div>
          </div>

          {/* Next Epoch Countdown */}
          <div className="epoch-countdown">
            <div className="countdown-label">
              <Timer size={12} />
              <span>Next Epoch</span>
            </div>
            <div className="countdown-value">{formatTimeRemaining(epochInfo.timeRemainingMs)}</div>
            <div className="countdown-bar">
              <div 
                className="countdown-fill" 
                style={{ width: `${epochInfo.progress}%` }}
              />
            </div>
            <div className="countdown-info">
              <span>{formatNumberCompact(epochInfo.blocksInEpoch)} / {formatNumberCompact(BLOCKS_PER_EPOCH)}</span>
              <span>{epochInfo.progress.toFixed(1)}%</span>
            </div>
          </div>

        </div>

        {/* Network Health */}
        <div className="network-health">
          <div className="health-indicator">
            <div className="health-dot" />
            <span>Monad Mainnet</span>
          </div>
          <div className="hash-display">{stats.networkHash}</div>
        </div>
      </motion.div>
      )}
    </>
  )
}

export default Stats
