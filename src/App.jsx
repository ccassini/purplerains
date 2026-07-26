import React, { useState, useEffect, Suspense, lazy } from 'react'
import { motion } from 'framer-motion'
import { Routes, Route, useLocation } from 'react-router-dom'
import Header from './components/Header'
import ErrorBoundary from './components/ErrorBoundary'
import { MonadProvider } from './contexts/MonadContext'
import './App.css'

// Lazy-split heavy non-critical components to trim initial JS payload.
// These are below-the-fold (Footer), background (PurpleRainCanvas), or
// home-only (Stats, LiveFeed) — safe to code-split.
const PurpleRainCanvas = lazy(() => import('./components/PurpleRainCanvas'))
const LiveFeed = lazy(() => import('./components/LiveFeed'))
const Footer = lazy(() => import('./components/Footer'))

const PricePage = lazy(() => import('./pages/PricePage'))
const StakingPage = lazy(() => import('./pages/StakingPage'))
const StakingCalculatorPage = lazy(() => import('./pages/StakingCalculatorPage'))
const ValidatorRequirementsPage = lazy(() => import('./pages/ValidatorRequirementsPage'))
const BlockchainVizPage = lazy(() => import('./pages/BlockchainVizPage'))
const EcosystemVizPage = lazy(() => import('./pages/EcosystemVizPage'))
const MonadWorldPage = lazy(() => import('./pages/MonadWorldPage'))
const MonadWorld3DPage = lazy(() => import('./pages/MonadWorld3DPage'))
const AgoraWorldPage = lazy(() => import('./pages/AgoraWorldPage'))
const AgoraWorld3DPage = lazy(() => import('./pages/AgoraWorld3DPage'))
const ShipPage = lazy(() => import('./pages/ShipPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const WalletProviders = lazy(() => import('./wallet/WalletProviders'))

function StakingRoute() {
  return (
    <Suspense fallback={<PageFallback />}>
      <WalletProviders>
        <StakingPage />
      </WalletProviders>
    </Suspense>
  )
}

function PageFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <motion.img
        src="/monad_logo.png"
        alt="Loading"
        style={{ width: 48, height: 48, opacity: 0.6 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  )
}

function AppContent() {
  const location = useLocation()
  const isOverlayPage = ['/price', '/staking', '/staking-calculator', '/validator-requirements', '/network', '/ecosystem', '/world', '/world-3d', '/agora-world', '/agora-world-3d', '/ship'].includes(location.pathname)
  const showNetworkFooter =
    !isOverlayPage ||
    location.pathname === '/world' ||
    location.pathname === '/world-3d'

  return (
    <div className="app">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main-content" className="main-content">
        {location.pathname !== '/network' && location.pathname !== '/ecosystem' && location.pathname !== '/world' && location.pathname !== '/world-3d' && location.pathname !== '/agora-world' && location.pathname !== '/agora-world-3d' && location.pathname !== '/ship' && (
          <Suspense fallback={null}>
            <PurpleRainCanvas />
          </Suspense>
        )}
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route
              path="/"
              element={
                <Suspense fallback={null}>
                  <LiveFeed />
                </Suspense>
              }
            />
            <Route path="/price" element={<PricePage />} />
            <Route path="/staking" element={<StakingRoute />} />
            <Route path="/staking-calculator" element={<StakingCalculatorPage />} />
            <Route path="/validator-requirements" element={<ValidatorRequirementsPage />} />
            <Route path="/network" element={<BlockchainVizPage />} />
            <Route path="/ecosystem" element={<EcosystemVizPage />} />
            <Route path="/world" element={<MonadWorldPage />} />
            <Route path="/world-3d" element={<MonadWorld3DPage />} />
            <Route path="/agora-world" element={<AgoraWorldPage />} />
            <Route path="/agora-world-3d" element={<AgoraWorld3DPage />} />
            <Route path="/ship" element={<ShipPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      {showNetworkFooter && (
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
      )}
    </div>
  )
}

function App() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const minTime = setTimeout(() => setIsLoading(false), 800)
    return () => clearTimeout(minTime)
  }, [])

  // Production: discourage opening devtools (full block not possible)
  useEffect(() => {
    if (!import.meta.env.PROD) return

    const preventContextMenu = (e) => e.preventDefault()
    const preventDevToolsShortcuts = (e) => {
      if (e.key === 'F12') return e.preventDefault()
      if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) return e.preventDefault()
      if (e.metaKey && e.altKey && e.key === 'i') return e.preventDefault()
    }

    document.addEventListener('contextmenu', preventContextMenu)
    document.addEventListener('keydown', preventDevToolsShortcuts)
    return () => {
      document.removeEventListener('contextmenu', preventContextMenu)
      document.removeEventListener('keydown', preventDevToolsShortcuts)
    }
  }, [])

  if (isLoading) {
    return (
      <div className="loading-screen">
        <motion.div
          className="loading-content"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <motion.div
            className="purple-rain-logo"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          >
            <img 
              src="/monad_logo.png" 
              alt="Monad Logo" 
              className="loading-logo-image"
            />
          </motion.div>
          <p className="loading-title">Purple Rain</p>
          <motion.div
            className="loading-bar"
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 0.7, ease: "easeInOut" }}
          />
        </motion.div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <MonadProvider>
        <AppContent />
      </MonadProvider>
    </ErrorBoundary>
  )
}

export default App 