import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link, useLocation } from 'react-router-dom'
import { Network, Menu, X } from 'lucide-react'
import { useMonad } from '../contexts/MonadContext'
import SimpleMusic from './SimpleMusic'
import './Header.css'

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/world', label: 'World' },
  { to: '/agora-world', label: 'Agora' },
  { to: '/network', label: 'Network' },
  { to: '/ecosystem', label: 'Ecosystem' },
  { to: '/price', label: 'Price', dividerBefore: true },
  { to: '/staking', label: 'Staking' },
  { to: '/staking-calculator', label: 'Calculator' },
  { to: '/validator-requirements', label: 'Validator Hardware', dividerBefore: true },
]

// Route → lazy chunk loader. Triggered on hover/focus so the chunk is
// already in memory by the time the user clicks the link.
const ROUTE_PREFETCH = {
  '/price': () => import('../pages/PricePage'),
  '/staking': () => import('../pages/StakingPage'),
  '/staking-calculator': () => import('../pages/StakingCalculatorPage'),
  '/validator-requirements': () => import('../pages/ValidatorRequirementsPage'),
  '/network': () => import('../pages/BlockchainVizPage'),
  '/ecosystem': () => import('../pages/EcosystemVizPage'),
  '/world': () => import('../pages/MonadWorldPage'),
  '/agora-world': () => import('../pages/AgoraWorldPage'),
}
const prefetched = new Set()
const prefetchRoute = (to) => {
  if (prefetched.has(to)) return
  const loader = ROUTE_PREFETCH[to]
  if (!loader) return
  prefetched.add(to)
  loader().catch(() => prefetched.delete(to))
}

const HEADER_IDLE_HIDE_MS = 5000

const Header = () => {
  const { stats } = useMonad()
  const location = useLocation()
  const isWorldPage = location.pathname === '/world' || location.pathname === '/world-3d'
  const isAgoraPage = location.pathname === '/agora-world' || location.pathname === '/agora-world-3d'
  const shouldRenderHeader = !(isWorldPage || isAgoraPage)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  )
  const menuBtnRef = useRef(null)
  const drawerRef = useRef(null)
  const closeBtnRef = useRef(null)
  const mouseIdleTimerRef = useRef(0)
  const [headerVisible, setHeaderVisible] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handle = () => setIsMobile(mq.matches)
    mq.addEventListener('change', handle)
    return () => mq.removeEventListener('change', handle)
  }, [])

  // Focus trap + Escape key for drawer
  useEffect(() => {
    if (!menuOpen) return

    // Focus close button when drawer opens
    const timer = setTimeout(() => closeBtnRef.current?.focus(), 50)

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        menuBtnRef.current?.focus()
        return
      }
      // Focus trap
      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll(
          'a[href], button, [tabindex]:not([tabindex="-1"])'
        )
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    menuBtnRef.current?.focus()
  }, [])

  const currentTps =
    typeof stats.currentTps === 'number' && !Number.isNaN(stats.currentTps)
      ? Math.round(stats.currentTps).toString()
      : '0'

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (menuOpen) {
      document.body.classList.add('header-menu-open')
      return () => document.body.classList.remove('header-menu-open')
    }
  }, [menuOpen])

  useEffect(() => {
    if (!shouldRenderHeader) return undefined

    const clearIdleTimer = () => {
      if (mouseIdleTimerRef.current) {
        window.clearTimeout(mouseIdleTimerRef.current)
        mouseIdleTimerRef.current = 0
      }
    }

    if (isMobile) {
      setHeaderVisible(true)
      clearIdleTimer()
      return clearIdleTimer
    }

    const handleActivity = () => {
      setHeaderVisible(true)
      clearIdleTimer()
      mouseIdleTimerRef.current = window.setTimeout(() => {
        if (!menuOpen) setHeaderVisible(false)
      }, HEADER_IDLE_HIDE_MS)
    }

    window.addEventListener('mousemove', handleActivity, { passive: true })
    window.addEventListener('keydown', handleActivity)
    handleActivity()

    return () => {
      window.removeEventListener('mousemove', handleActivity)
      window.removeEventListener('keydown', handleActivity)
      clearIdleTimer()
    }
  }, [isMobile, menuOpen, shouldRenderHeader])

  if (!shouldRenderHeader) return null

  return (
    <motion.header
      className={`app-header ${headerVisible ? 'header-show' : 'header-hide'} ${menuOpen ? 'menu-open' : ''}`}
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: headerVisible ? 0 : -100, opacity: headerVisible ? 1 : 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="header-content">
        <div className="logo-section">
          <Link to="/" className="logo-link" title="Home">
            <motion.div
              className="logo-icon"
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <img
                src="/monad_logo.png"
                alt="Monad Logo"
                className="logo-image"
              />
            </motion.div>
          </Link>
          <div className="logo-text">
            <h1 className="app-title">Purple Rain</h1>
            <p className="app-subtitle">Monad Blockchain Visualization</p>
          </div>
        </div>

        <div className="header-stats header-stats-desktop">
          <div className="header-nav" role="navigation" aria-label="Primary">
            {NAV_LINKS.map(({ to, label, dividerBefore }) => (
              <React.Fragment key={to}>
                {dividerBefore ? <span className="nav-pill-divider" aria-hidden="true" /> : null}
                <Link
                  to={to}
                  className={`nav-pill ${location.pathname === to ? 'active' : ''}`}
                  aria-current={location.pathname === to ? 'page' : undefined}
                  onMouseEnter={() => prefetchRoute(to)}
                  onFocus={() => prefetchRoute(to)}
                  onTouchStart={() => prefetchRoute(to)}
                >
                  <span className="nav-pill-label">{label}</span>
                </Link>
              </React.Fragment>
            ))}
          </div>
          <div className="stat-item">
            <Network className="stat-icon" size={16} />
            <span>Mainnet</span>
          </div>
          <div className="stat-item stat-item-tps" title={`TPS: ${currentTps}`}>
            <span className="tps-live-dot" aria-hidden="true" />
            <span className="tps-pill-text">
              {`${Number(currentTps).toLocaleString()} TPS`}
            </span>
          </div>
          <SimpleMusic />
        </div>

        <div className="header-stats header-stats-mobile">
          <div className="stat-item stat-item-tps" title={`TPS: ${currentTps}`}>
            <span className="tps-live-dot" aria-hidden="true" />
            <span className="tps-pill-text">
              {`${Number(currentTps).toLocaleString()} TPS`}
            </span>
          </div>
          <SimpleMusic />
          <button
            ref={menuBtnRef}
            type="button"
            className="header-menu-btn"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
          >
            <Menu size={24} strokeWidth={2} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              className="header-drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeMenu}
              aria-hidden="true"
            />
            <motion.div
              ref={drawerRef}
              className="header-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="header-drawer-inner">
                <div className="header-drawer-header">
                  <span className="header-drawer-title">Menu</span>
                  <button
                    ref={closeBtnRef}
                    type="button"
                    className="header-drawer-close"
                    onClick={closeMenu}
                    aria-label="Close menu"
                  >
                    <X size={24} strokeWidth={2} />
                  </button>
                </div>
                <nav className="header-drawer-nav">
                  {NAV_LINKS.map(({ to, label }) => (
                    <Link
                      key={to}
                      to={to}
                      className={`header-drawer-link ${location.pathname === to ? 'active' : ''}`}
                      aria-current={location.pathname === to ? 'page' : undefined}
                      onMouseEnter={() => prefetchRoute(to)}
                      onFocus={() => prefetchRoute(to)}
                      onTouchStart={() => prefetchRoute(to)}
                      onClick={closeMenu}
                    >
                      <span>{label}</span>
                    </Link>
                  ))}
                </nav>
                <div className="header-drawer-stats">
                  <div className="stat-item">
                    <Network className="stat-icon" size={18} />
                    <span>Monad Mainnet</span>
                  </div>
                  <div className="stat-item stat-item-tps">
                    <span>{`LIVE TPS ${currentTps}`}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <motion.div
        className="header-glow"
        animate={{ opacity: [0.3, 0.8, 0.3] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.header>
  )
}

export default Header
