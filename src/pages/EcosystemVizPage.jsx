import React, { useState, useEffect, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import MeteorShower from '../components/MeteorShower'
import { logger } from '../utils/logger'
import './EcosystemVizPage.css'

const ORBIT_COUNT_DESKTOP = 14
const ORBIT_COUNT_MOBILE = 5
const ORBIT_DURATIONS = ['52s', '58s', '48s', '55s', '50s', '54s', '47s', '53s', '49s', '56s', '51s', '57s', '46s', '60s']
const ORBIT_DIRECTIONS = ['normal', 'reverse', 'normal', 'reverse', 'normal', 'reverse', 'normal', 'reverse', 'normal', 'reverse', 'normal', 'reverse', 'normal', 'reverse']
const DOT_SIZE_DESKTOP = 36
const DOT_SIZE_MOBILE = 26
const MIN_DISTANCE_DESKTOP = 16
const MIN_DISTANCE_MOBILE = 26
const MAX_PROJECTS_MOBILE = 16

// Projects to show near center (inner orbits)
const CENTER_PROJECT_NAMES = ['kizzy', 'kuru exchange', 'uniswap', 'curvance', 'fastlane', 'perpl', 'mace', 'backpack', 'monorail', 'lumiterra']

function filenameToName(filename) {
  if (!filename || typeof filename !== 'string') return ''
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return filename.trim()
  return filename.slice(0, lastDot).trim()
}

function normalizeProjects(list) {
  if (!Array.isArray(list)) return []
  return list.map((item) => {
    if (item && typeof item === 'object' && item.filename) {
      return {
        filename: item.filename,
        name: item.name ?? filenameToName(item.filename),
        website: typeof item.website === 'string' ? item.website.trim() : ''
      }
    }
    if (typeof item === 'string' && item) {
      return { filename: item, name: filenameToName(item), website: '' }
    }
    return null
  }).filter(Boolean)
}

function EcosystemVizPage() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [hoveredProject, setHoveredProject] = useState(null)
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
    // Try project list with websites first; fallback to image list only
    fetch('/data/ecosystemProjects.json', { headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .catch(() => fetch('/data/ecosystemImages.json', { headers: { Accept: 'application/json' } }).then((r) => (r.ok ? r.json() : [])))
      .then((list) => (cancelled ? [] : normalizeProjects(Array.isArray(list) ? list : [])))
      .then((normalized) => {
        if (!cancelled) setProjects(normalized)
      })
      .catch((err) => logger.error('EcosystemVizPage: load list', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const { sortedProjects, orbits } = useMemo(() => {
    if (projects.length === 0) return { sortedProjects: [], orbits: [] }
    const orbitCount = isMobile ? ORBIT_COUNT_MOBILE : ORBIT_COUNT_DESKTOP
    const minDist = isMobile ? MIN_DISTANCE_MOBILE : MIN_DISTANCE_DESKTOP
    // Put center projects first (they get placed on inner orbits)
    const sorted = [...projects].sort((a, b) => {
      const aName = (a.name || '').toLowerCase()
      const bName = (b.name || '').toLowerCase()
      const aCenter = CENTER_PROJECT_NAMES.some((n) => aName.includes(n) || n.includes(aName))
      const bCenter = CENTER_PROJECT_NAMES.some((n) => bName.includes(n) || n.includes(bName))
      if (aCenter && !bCenter) return -1
      if (!aCenter && bCenter) return 1
      return 0
    })
    const capped = isMobile ? sorted.slice(0, MAX_PROJECTS_MOBILE) : sorted
    const list = []
    let projectIndex = 0
    const innerRadius = isMobile ? 28 : 22
    const outerRadius = 95
    const radiusStep = (outerRadius - innerRadius) / Math.max(orbitCount - 1, 1)
    const placed = []

    const hasCollision = (x, y) => {
      for (const p of placed) {
        const dx = x - p.x
        const dy = y - p.y
        if (Math.sqrt(dx * dx + dy * dy) < minDist) return true
      }
      return false
    }

    for (let o = 0; o < orbitCount; o++) {
      const radius = innerRadius + o * radiusStep
      const circumference = 2 * Math.PI * radius
      const maxPerOrbit = Math.floor(circumference / minDist)
      const remainingOrbits = orbitCount - o
      const remaining = capped.length - projectIndex
      let orbitSize = o === orbitCount - 1
        ? Math.min(remaining, maxPerOrbit)
        : Math.min(Math.ceil(remaining / remainingOrbits), maxPerOrbit)
      orbitSize = Math.min(orbitSize, remaining)

      const dots = []
      const baseAngles = []
      for (let i = 0; i < orbitSize; i++) {
        baseAngles.push((i / orbitSize) * Math.PI * 2)
      }
      const orbitPhase = (o * Math.PI) / (orbitCount * 6)

      for (let i = 0; i < orbitSize && projectIndex < capped.length; i++) {
        let angle = baseAngles[i] + orbitPhase
        let attempts = 0
        let placedDot = false
        while (!placedDot && attempts < 100) {
          const x = 100 + radius * Math.cos(angle)
          const y = 100 + radius * Math.sin(angle)
          if (!hasCollision(x, y)) {
            dots.push({
              globalIndex: projectIndex,
              angleOffset: angle,
              radius
            })
            placed.push({ x, y })
            placedDot = true
            projectIndex++
          } else {
            const step = (Math.PI * 2) / (orbitSize * 12)
            const dir = attempts % 2 === 0 ? 1 : -1
            angle += step * dir * Math.ceil(attempts / 2)
            angle = ((angle % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2)
            attempts++
          }
        }
      }
      if (dots.length > 0) list.push({ radius, dots })
    }
    return { sortedProjects: capped, orbits: list }
  }, [projects, isMobile])

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    let hideTimeout = null
    let retryTimeout = null
    const setupHeader = () => {
      const header = document.querySelector('.app-header.header-hover-hidden')
      if (!header) {
        retryTimeout = setTimeout(setupHeader, 100)
        return
      }
      const handleMouseMove = () => {
        if (hideTimeout) {
          clearTimeout(hideTimeout)
          hideTimeout = null
        }
        header.classList.add('header-show')
        header.classList.remove('header-hide')
        hideTimeout = setTimeout(() => {
          header.classList.add('header-hide')
          header.classList.remove('header-show')
          hideTimeout = null
        }, 2000)
      }
      header.classList.add('header-hide')
      header.classList.remove('header-show')
      document.addEventListener('mousemove', handleMouseMove)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        if (hideTimeout) clearTimeout(hideTimeout)
      }
    }
    const cleanup = setupHeader()
    return () => {
      if (retryTimeout) clearTimeout(retryTimeout)
      if (cleanup) cleanup()
    }
  }, [])

  return (
    <div className="ecosystem-viz-page" style={{ background: '#0a0a0f' }}>
      <div className="ecosystem-viz-bg-text" aria-hidden="true">
        Ecosystem
      </div>

      {loading ? (
        <div className="ecosystem-viz-loading" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
            <img src="/monad_logo.png" alt="Monad" className="ecosystem-viz-loading-logo" />
            <p>Loading ecosystem...</p>
          </motion.div>
        </div>
      ) : !sortedProjects.length ? (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
          <img src="/monad_logo.png" alt="Monad" style={{ width: '64px', height: '64px' }} />
          <p style={{ color: '#a0a0a0' }}>No ecosystem images found.</p>
        </div>
      ) : (
        <div className="ecosystem-viz-container">
          <MeteorShower burnRadiusRatio={0.44} spawnInterval={400} maxMeteors={16} />

          <svg className="ecosystem-viz-orbits" viewBox="0 0 200 200">
            {orbits.map((orbit, oi) => (
              <circle
                key={oi}
                cx="100"
                cy="100"
                r={orbit.radius}
                className="ecosystem-viz-orbit-circle"
              />
            ))}
          </svg>

          {orbits.map((orbit, oi) => (
            <div
              key={oi}
              className="ecosystem-viz-orbit-group"
              style={{
                animationDuration: ORBIT_DURATIONS[oi] || '50s',
                animationDirection: ORBIT_DIRECTIONS[oi] || 'normal'
              }}
            >
              {orbit.dots.map((dot) => {
                const project = sortedProjects[dot.globalIndex]
                const filename = project?.filename ?? ''
                const name = project?.name ?? filenameToName(filename)
                const website = project?.website ?? ''
                const imgSrc = `/ecosystem/${encodeURIComponent(filename)}`
                const radiusPercent = (dot.radius / 100) * 50
                const x = 50 + radiusPercent * Math.cos(dot.angleOffset)
                const y = 50 + radiusPercent * Math.sin(dot.angleOffset)

                const handleMouseEnter = (e) => {
                  if (hoverTimeoutRef.current) {
                    clearTimeout(hoverTimeoutRef.current)
                    hoverTimeoutRef.current = null
                  }
                  const rect = e.currentTarget.getBoundingClientRect()
                  let tx = rect.left + rect.width / 2
                  let ty = rect.top - 10
                  const tw = 220
                  const th = 60
                  const pad = 10
                  if (tx < tw / 2 + pad) tx = tw / 2 + pad
                  else if (tx > window.innerWidth - tw / 2 - pad) tx = window.innerWidth - tw / 2 - pad
                  if (ty < th + pad) ty = rect.bottom + 10
                  setHoverPosition({ x: tx, y: ty })
                  setHoveredProject({ name, website })
                }

                const handleMouseLeave = () => {
                  hoverTimeoutRef.current = setTimeout(() => setHoveredProject(null), 100)
                }

                const handleClick = (e) => {
                  e.stopPropagation()
                  if (website) {
                    const url = website.startsWith('http://') || website.startsWith('https://') ? website : `https://${website}`
                    window.open(url, '_blank', 'noopener,noreferrer')
                  }
                }

                const dotSize = isMobile ? 44 : DOT_SIZE_DESKTOP
                return (
                  <div
                    key={dot.globalIndex}
                    className={`ecosystem-viz-dot ${isMobile ? 'ecosystem-viz-dot-mobile' : ''}`}
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      width: `${dotSize}px`,
                      height: `${dotSize}px`,
                      transform: 'translate(-50%, -50%)',
                      cursor: website ? 'pointer' : 'default'
                    }}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    onClick={handleClick}
                    role={website ? 'link' : undefined}
                    aria-label={website ? `${name} - Visit website` : name}
                  >
                    <img
                      src={imgSrc}
                      alt={name}
                      onError={(e) => {
                        e.target.style.display = 'none'
                        const fallback = e.target.nextElementSibling
                        if (fallback) fallback.style.display = 'flex'
                      }}
                    />
                    <span className="ecosystem-viz-dot-fallback" style={{ display: 'none' }} aria-hidden="true" />
                  </div>
                )
              })}
            </div>
          ))}

          <div className="ecosystem-viz-center">
            <motion.div
              className="ecosystem-viz-logo-wrap"
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
              <img src="/monad_logo.png" alt="Monad" className="ecosystem-viz-logo" />
            </motion.div>
          </div>
        </div>
      )}

      {hoveredProject && (
        <div
          className="ecosystem-viz-tooltip"
          style={{
            left: `${hoverPosition.x}px`,
            top: `${hoverPosition.y}px`,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="ecosystem-viz-tooltip-content">
            <div className="ecosystem-viz-tooltip-name">{hoveredProject.name}</div>
          </div>
          <div className="ecosystem-viz-tooltip-arrow" />
        </div>
      )}
    </div>
  )
}

export default EcosystemVizPage
