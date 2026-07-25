import React, { useState, useEffect, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { loadValidatorMetadata, getAllValidators } from '../utils/validatorApi'
import { fetchGmonadsValidatorsEpoch } from '../utils/gmonadsApi'
import MeteorShower from '../components/MeteorShower'
import { logger } from '../utils/logger'
import './BlockchainVizPage.css'

const ORBIT_COUNT_DESKTOP = 12
const ORBIT_COUNT_MOBILE = 5
const MAX_VALIDATORS_MOBILE = 18
const MIN_DISTANCE_DESKTOP = 14
const MIN_DISTANCE_MOBILE = 26
const HIGHLIGHT_INDEX = 0
const ORBIT_DURATIONS = ['50s', '60s', '45s', '55s', '48s', '52s', '47s', '53s', '49s', '51s', '46s', '54s']
const ORBIT_DIRECTIONS = ['normal', 'reverse', 'normal', 'reverse', 'normal', 'reverse', 'normal', 'reverse', 'normal', 'reverse', 'normal', 'reverse']

function BlockchainVizPage() {
  const [validators, setValidators] = useState([])
  const [validatorStakes, setValidatorStakes] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [selectedValidator, setSelectedValidator] = useState(null)
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 })
  const [hoveredValidator, setHoveredValidator] = useState(null)
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 })
  const hoverTimeoutRef = useRef(null)
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handle = () => setIsMobile(mq.matches)
    mq.addEventListener('change', handle)
    return () => mq.removeEventListener('change', handle)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        logger.log('Loading validator metadata and stake data...')
        
        // Load validator metadata
        await loadValidatorMetadata()
        if (cancelled) return
        
        // Fetch stake data from gmonads API
        const { data } = await fetchGmonadsValidatorsEpoch('mainnet')
        if (cancelled) return
        
        // Stake / status from epoch API (any row); show all validators we have metadata for
        const stakeMap = new Map()
        let epochRowCount = 0

        for (const row of data) {
          const id = Number(row?.val_index)
          if (!Number.isFinite(id)) continue

          epochRowCount += 1
          const stakeMon = BigInt(row?.stake ?? '0')
          const setType = String(row?.validator_set_type || '').toLowerCase()
          stakeMap.set(id, {
            stakeWei: stakeMon * 10n ** 18n,
            stakeMon: Number(stakeMon),
            isActive: setType === 'active',
          })
        }

        const all = getAllValidators()
        const displayValidators = all.filter((v) => v?.id)

        logger.log(
          `Network viz: ${displayValidators.length} validators (metadata), ${epochRowCount} epoch rows, ${stakeMap.size} with stake rows`
        )

        setValidatorStakes(stakeMap)
        setValidators(displayValidators)
      } catch (error) {
        logger.error('Failed to load validators:', error)
      } finally {
        if (!cancelled) {
          setLoading(false)
          logger.log('Validators loaded, rendering visualization')
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Calculate stake-based sizes
  const stakeStats = useMemo(() => {
    if (validators.length === 0) return { min: 0, max: 0, avg: 0 }
    
    const stakes = validators
      .map(v => validatorStakes.get(v.id)?.stakeMon || 0)
      .filter(s => s > 0)
    
    if (stakes.length === 0) return { min: 0, max: 0, avg: 0 }
    
    return {
      min: Math.min(...stakes),
      max: Math.max(...stakes),
      avg: stakes.reduce((a, b) => a + b, 0) / stakes.length
    }
  }, [validators, validatorStakes])

  const orbits = useMemo(() => {
    if (validators.length === 0) return []

    const orbitCount = isMobile ? ORBIT_COUNT_MOBILE : ORBIT_COUNT_DESKTOP
    const minDist = isMobile ? MIN_DISTANCE_MOBILE : MIN_DISTANCE_DESKTOP

    // Sort validators by stake (largest first) for better visual distribution
    const sortedValidators = [...validators].sort((a, b) => {
      const stakeA = validatorStakes.get(a.id)?.stakeMon || 0
      const stakeB = validatorStakes.get(b.id)?.stakeMon || 0
      return stakeB - stakeA
    })
    const capped = isMobile ? sortedValidators.slice(0, MAX_VALIDATORS_MOBILE) : sortedValidators

    const list = []
    let validatorIndex = 0

    const innerRadius = isMobile ? 28 : 20
    const outerRadius = 95
    const radiusStep = (outerRadius - innerRadius) / Math.max(orbitCount - 1, 1)

    const placedValidators = []

    const hasCollision = (x, y) => {
      for (const placed of placedValidators) {
        const dx = x - placed.x
        const dy = y - placed.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance < minDist) return true
      }
      return false
    }

    for (let o = 0; o < orbitCount; o++) {
      const radius = innerRadius + (o * radiusStep)

      const circumference = 2 * Math.PI * radius
      const maxValidatorsForOrbit = Math.floor(circumference / minDist)

      const remainingOrbits = orbitCount - o
      const remainingValidators = capped.length - validatorIndex
      
      let orbitSize
      if (o === orbitCount - 1) {
        orbitSize = Math.min(remainingValidators, maxValidatorsForOrbit)
      } else {
        const targetPerOrbit = Math.ceil(remainingValidators / remainingOrbits)
        orbitSize = Math.min(targetPerOrbit, maxValidatorsForOrbit)
      }
      orbitSize = Math.min(orbitSize, remainingValidators)

      const dots = []
      const validatorsToPlace = []
      for (let i = 0; i < orbitSize && validatorIndex < capped.length; i++) {
        validatorsToPlace.push(validatorIndex)
        validatorIndex++
      }
      
      // Distribute validators around the circle with collision detection
      // Start with evenly spaced angles
      const baseAngles = []
      for (let i = 0; i < validatorsToPlace.length; i++) {
        baseAngles.push((i / validatorsToPlace.length) * Math.PI * 2)
      }
      
      const orbitPhase = (o * Math.PI) / (orbitCount * 6)

      for (let i = 0; i < validatorsToPlace.length; i++) {
        // Start with evenly spaced angle + orbit phase
        let angle = baseAngles[i] + orbitPhase
        let attempts = 0
        let placed = false
        const maxAttempts = 100
        
        // Try to find a non-colliding position
        while (!placed && attempts < maxAttempts) {
          // Calculate position in viewBox coordinates (center is 100, 100)
          const x = 100 + radius * Math.cos(angle)
          const y = 100 + radius * Math.sin(angle)
          
          if (!hasCollision(x, y)) {
            const validator = capped[validatorsToPlace[i]]
            const originalIndex = validators.findIndex(v => v.id === validator.id)
            
            dots.push({
              globalIndex: originalIndex,
              angleOffset: angle,
              radius,
              isHighlight: originalIndex === HIGHLIGHT_INDEX
            })
            
            // Record this position for collision detection
            placedValidators.push({ x, y })
            placed = true
          } else {
            // Try a slightly different angle (spiral search pattern)
            const angleStep = (Math.PI * 2) / (validatorsToPlace.length * 12)
            const spiralDirection = attempts % 2 === 0 ? 1 : -1
            const spiralMultiplier = Math.ceil(attempts / 2)
            angle += angleStep * spiralDirection * spiralMultiplier
            // Normalize angle to [0, 2π)
            angle = ((angle % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2)
            attempts++
          }
        }
        
        // If we couldn't place after many attempts, skip this validator for this orbit
        if (!placed) {
          logger.warn(`Could not place validator ${validatorsToPlace[i]} on orbit ${o} after ${maxAttempts} attempts`)
          // This validator will be skipped - we've already incremented validatorIndex
        }
      }
      
      if (dots.length > 0) {
        list.push({ radius, dots })
      }
    }
    
    return list
  }, [validators, validatorStakes, isMobile])

  // Handle ESC key to close popup
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedValidator) {
        setSelectedValidator(null)
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedValidator])

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    }
  }, [])

  // Handle header show/hide on hover (only on network page)
  // MUST be before early returns to maintain hook order
  useEffect(() => {
    let hideTimeout = null
    let retryTimeout = null
    let cleanup = null

    const setupHeader = () => {
      const header = document.querySelector('.app-header.header-hover-hidden')
      if (!header) {
        // Retry after a short delay if header not found
        retryTimeout = setTimeout(setupHeader, 100)
        return
      }

      const handleMouseMove = () => {
        // Mouse moved - show header and reset timer
        if (hideTimeout) {
          clearTimeout(hideTimeout)
          hideTimeout = null
        }
        
        header.classList.add('header-show')
        header.classList.remove('header-hide')
        
        // Set timer to hide header after 2 seconds of no movement
        hideTimeout = setTimeout(() => {
          header.classList.add('header-hide')
          header.classList.remove('header-show')
          hideTimeout = null
        }, 2000) // 2 seconds of no movement
      }

      // Initially hide header
      header.classList.add('header-hide')
      header.classList.remove('header-show')

      document.addEventListener('mousemove', handleMouseMove)

      cleanup = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        if (hideTimeout) clearTimeout(hideTimeout)
      }
    }

    setupHeader()

    return () => {
      if (retryTimeout) clearTimeout(retryTimeout)
      if (cleanup) cleanup()
    }
  }, [])

  logger.log('Rendering BlockchainVizPage, loading:', loading, 'validators:', validators?.length)

  return (
    <div className="blockchain-viz-page" style={{ background: '#0a0a0f' }}>
      <div className="blockchain-viz-bg-text" aria-hidden="true">
        Decentralization
      </div>

      {loading ? (
        <div className="blockchain-viz-loading" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <img src="/monad_logo.png" alt="Monad" className="blockchain-viz-loading-logo" />
            <p>Loading validators...</p>
          </motion.div>
        </div>
      ) : !validators?.length ? (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
          <img src="/monad_logo.png" alt="Monad" style={{ width: '64px', height: '64px' }} />
          <p style={{ color: '#a0a0a0' }}>No validators loaded. Check console for errors.</p>
        </div>
      ) : (
        <div className="blockchain-viz-container">
          <MeteorShower burnRadiusRatio={0.44} spawnInterval={400} maxMeteors={16} />

          {/* Orbit circles */}
          <svg className="blockchain-viz-orbits" viewBox="0 0 200 200">
            {orbits.map((orbit, oi) => (
              <circle
                key={oi}
                cx="100"
                cy="100"
                r={orbit.radius}
                className="blockchain-viz-orbit-circle"
              />
            ))}
          </svg>

          {/* Validator dots on orbits */}
          {orbits.map((orbit, oi) => (
            <div
              key={oi}
              className="blockchain-viz-orbit-group"
              style={{
                animationDuration: ORBIT_DURATIONS[oi],
                animationDirection: ORBIT_DIRECTIONS[oi]
              }}
            >
              {orbit.dots.map((dot) => {
                const val = validators[dot.globalIndex]
                const stakeInfo = validatorStakes.get(val?.id)
                const stakeMon = stakeInfo?.stakeMon || 0
                
                // On mobile: 44px touch target, 26px visual to avoid overlap
                const sizeScale = stakeStats.max > stakeStats.min
                  ? 20 + ((stakeMon - stakeStats.min) / (stakeStats.max - stakeStats.min)) * 20
                  : 24
                const dotSize = isMobile ? 44 : Math.max(20, Math.min(40, sizeScale))
                
                // Calculate position in percentage - ensure validators sit exactly on orbit circles
                const radiusPercent = (dot.radius / 100) * 50
                const x = 50 + radiusPercent * Math.cos(dot.angleOffset)
                const y = 50 + radiusPercent * Math.sin(dot.angleOffset)
                const logoPrimary = val?.localLogo || val?.logo
                const hasLogo = Boolean(logoPrimary)

                const handleMouseEnter = (e) => {
                  if (hoverTimeoutRef.current) {
                    clearTimeout(hoverTimeoutRef.current)
                    hoverTimeoutRef.current = null
                  }
                  
                  const rect = e.currentTarget.getBoundingClientRect()
                  let x = rect.left + rect.width / 2
                  let y = rect.top - 10 // Show above the validator
                  
                  // Adjust position to keep tooltip within viewport
                  const tooltipWidth = 200
                  const tooltipHeight = 80
                  const padding = 10
                  
                  // Keep tooltip within horizontal bounds
                  if (x < tooltipWidth / 2 + padding) {
                    x = tooltipWidth / 2 + padding
                  } else if (x > window.innerWidth - tooltipWidth / 2 - padding) {
                    x = window.innerWidth - tooltipWidth / 2 - padding
                  }
                  
                  // Keep tooltip within vertical bounds (show above, or below if not enough space)
                  if (y < tooltipHeight + padding) {
                    y = rect.bottom + 10 // Show below if not enough space above
                  }
                  
                  setHoverPosition({ x, y })
                  setHoveredValidator({
                    ...val
                  })
                }
                
                const handleMouseLeave = () => {
                  const timeout = setTimeout(() => {
                    setHoveredValidator(null)
                  }, 100)
                  hoverTimeoutRef.current = timeout
                }
                
                const handleClick = (e) => {
                  e.stopPropagation()
                  
                  // If validator has a website, navigate to it
                  if (val?.website) {
                    let url = val.website
                    // Ensure URL has protocol
                    if (!url.startsWith('http://') && !url.startsWith('https://')) {
                      url = 'https://' + url
                    }
                    window.open(url, '_blank', 'noopener,noreferrer')
                  } else {
                    // If no website, show popup with details
                    const rect = e.currentTarget.getBoundingClientRect()
                    const centerX = rect.left + rect.width / 2
                    const centerY = rect.top + rect.height / 2
                    
                    // Adjust position to keep popup within viewport
                    const popupWidth = 400
                    const popupHeight = 300
                    const padding = 20
                    
                    let x = centerX
                    let y = centerY
                    
                    // Keep popup within horizontal bounds
                    if (x < popupWidth / 2 + padding) {
                      x = popupWidth / 2 + padding
                    } else if (x > window.innerWidth - popupWidth / 2 - padding) {
                      x = window.innerWidth - popupWidth / 2 - padding
                    }
                    
                    // Keep popup within vertical bounds
                    if (y < popupHeight / 2 + padding) {
                      y = popupHeight / 2 + padding
                    } else if (y > window.innerHeight - popupHeight / 2 - padding) {
                      y = window.innerHeight - popupHeight / 2 - padding
                    }
                    
                    setPopupPosition({ x, y })
                    setSelectedValidator({
                      ...val
                    })
                  }
                }
                
                return (
                  <div
                    key={dot.globalIndex}
                    className={`blockchain-viz-dot ${dot.isHighlight ? 'highlight' : ''} ${isMobile ? 'blockchain-viz-dot-mobile' : ''}`}
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      width: `${dotSize}px`,
                      height: `${dotSize}px`,
                      transform: 'translate(-50%, -50%)'
                    }}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    onClick={handleClick}
                  >
                    {hasLogo ? (
                      <img
                        src={logoPrimary}
                        alt={val.name || `Validator ${dot.globalIndex + 1}`}
                        onError={(e) => {
                          const el = e.target
                          if (val?.logo && val?.localLogo && !el.dataset.bcvLogoFallback) {
                            el.dataset.bcvLogoFallback = '1'
                            el.src = val.logo
                            return
                          }
                          el.style.display = 'none'
                          const fallback = el.nextElementSibling
                          if (fallback) fallback.style.display = 'block'
                        }}
                        style={{
                          background: 'transparent',
                          mixBlendMode: 'normal',
                          width: '100%',
                          height: '100%'
                        }}
                      />
                    ) : null}
                    <span 
                      className="blockchain-viz-dot-fallback" 
                      style={{ display: hasLogo ? 'none' : 'block' }}
                      aria-hidden="true"
                    />
                  </div>
                )
              })}
            </div>
          ))}

          {/* Center: Monad logo (rotating, no text) */}
          <div className="blockchain-viz-center">
            <motion.div
              className="blockchain-viz-logo-wrap"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, rotate: 360 }}
              transition={{ 
                scale: { duration: 0.6, ease: 'easeOut' },
                opacity: { duration: 0.6 },
                rotate: { duration: 20, repeat: Infinity, ease: 'linear' }
              }}
              onClick={() => window.open('https://www.monad.xyz', '_blank', 'noopener,noreferrer')}
              style={{ cursor: 'pointer' }}
            >
              <img
                src="/monad_logo.png"
                alt="Monad"
                className="blockchain-viz-logo"
              />
            </motion.div>
          </div>
        </div>
      )}

      {/* Validator Hover Tooltip */}
      {hoveredValidator && !selectedValidator && (
        <div
          className="blockchain-viz-tooltip"
          style={{
            left: `${hoverPosition.x}px`,
            top: `${hoverPosition.y}px`,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="blockchain-viz-tooltip-content">
            <div className="blockchain-viz-tooltip-name">
              {hoveredValidator.name || `Validator ${hoveredValidator.id}`}
            </div>
            <div className="blockchain-viz-tooltip-id">
              ID: #{hoveredValidator.id}
            </div>
          </div>
          <div className="blockchain-viz-tooltip-arrow" />
        </div>
      )}

      {/* Validator Info Popup */}
      {selectedValidator && (
        <>
          <div 
            className="blockchain-viz-popup-overlay"
            onClick={() => setSelectedValidator(null)}
          />
          <motion.div
            className="blockchain-viz-popup"
            initial={{ opacity: 0, scale: 0.8, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              left: `${popupPosition.x}px`,
              top: `${popupPosition.y}px`,
              transform: 'translate(-50%, -50%)'
            }}
          >
            <button 
              className="blockchain-viz-popup-close"
              onClick={() => setSelectedValidator(null)}
            >
              ×
            </button>
            <div className="blockchain-viz-popup-content">
              {(selectedValidator.localLogo || selectedValidator.logo) && (
                <img
                  src={selectedValidator.localLogo || selectedValidator.logo}
                  alt={selectedValidator.name}
                  className="blockchain-viz-popup-logo"
                  onError={(e) => {
                    const el = e.target
                    if (selectedValidator.logo && el.src !== selectedValidator.logo) {
                      el.src = selectedValidator.logo
                    } else {
                      el.style.display = 'none'
                    }
                  }}
                />
              )}
              <h3 className="blockchain-viz-popup-name">
                {selectedValidator.name || `Validator ${selectedValidator.id}`}
              </h3>
              <div className="blockchain-viz-popup-id">
                ID: #{selectedValidator.id}
              </div>
              {selectedValidator.website && (
                <a
                  href={selectedValidator.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="blockchain-viz-popup-website"
                >
                  <span className="blockchain-viz-popup-label">Website:</span>
                  <span className="blockchain-viz-popup-link">
                    {selectedValidator.website.replace(/^https?:\/\//, '')}
                  </span>
                </a>
              )}
              {selectedValidator.description && (
                <div className="blockchain-viz-popup-description">
                  {selectedValidator.description}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </div>
  )
}


export default BlockchainVizPage
