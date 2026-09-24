import { useEffect, Suspense, lazy } from 'react'
import { MotionConfig } from 'framer-motion'
import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import Header from './components/Header'
import ErrorBoundary from './components/ErrorBoundary'
import { MonadProvider } from './contexts/MonadContext'
import { legacyCalculatorTarget, legacyHomeTarget } from './pages/home/homeNavigation'
import './App.css'

// Keep routes and the shared network ticker in separate loading boundaries.
const Footer = lazy(() => import('./components/Footer'))

const HomePage = lazy(() => import('./pages/HomePage'))
const StakingPage = lazy(() => import('./pages/StakingPage'))
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
    <div className="page-fallback" role="status" aria-live="polite">
      <img src="/monad_logo.png" alt="" className="page-fallback-logo" />
      <span>Loading view…</span>
    </div>
  )
}

function AppContent() {
  const location = useLocation()
  const isOverlayPage = ['/price', '/terminal', '/staking', '/staking-calculator', '/validator-requirements', '/network', '/ecosystem', '/world', '/world-3d', '/agora-world', '/agora-world-3d', '/odyssey'].includes(location.pathname)
  const showNetworkFooter =
    !isOverlayPage ||
    location.pathname === '/world' ||
    location.pathname === '/world-3d'

  return (
    <div className="app">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main-content" className="main-content" tabIndex={-1}>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/price" element={<Navigate to={legacyHomeTarget(location, 'price')} replace />} />
            <Route path="/terminal" element={<Navigate to={legacyHomeTarget(location, 'terminal')} replace />} />
            <Route path="/staking" element={<StakingRoute />} />
            <Route path="/staking-calculator" element={<Navigate to={legacyCalculatorTarget(location)} replace />} />
            <Route path="/validator-requirements" element={<ValidatorRequirementsPage />} />
            <Route path="/network" element={<BlockchainVizPage />} />
            <Route path="/ecosystem" element={<EcosystemVizPage />} />
            <Route path="/world" element={<MonadWorldPage />} />
            <Route path="/world-3d" element={<MonadWorld3DPage />} />
            <Route path="/agora-world" element={<AgoraWorldPage />} />
            <Route path="/agora-world-3d" element={<AgoraWorld3DPage />} />
            <Route path="/odyssey" element={<ShipPage />} />
            <Route path="/ship" element={<Navigate to="/odyssey" replace />} />
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

  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <MonadProvider>
          <AppContent />
        </MonadProvider>
      </MotionConfig>
    </ErrorBoundary>
  )
}

export default App
