import { lazy, Suspense } from 'react'
import { LineChart, Terminal } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { homeSearchForView, homeViewFromSearch } from './home/homeNavigation'
import './HomePage.css'

const loadTerminal = () => import('./TerminalPage')
const loadPrice = () => import('./PricePage')
const TerminalPage = lazy(loadTerminal)
const PricePage = lazy(loadPrice)
const VIEWS = [
  { id: 'terminal', label: 'Terminal', Icon: Terminal, preload: loadTerminal },
  { id: 'price', label: 'Price', Icon: LineChart, preload: loadPrice },
]

export default function HomePage() {
  const location = useLocation()
  const view = homeViewFromSearch(location.search)

  return <div className="home-workspace">
    <nav className="home-view-nav" aria-label="Home views">
      {VIEWS.map(({ id, label, Icon, preload }) => <Link
        key={id}
        to={{ pathname: '/', search: homeSearchForView(location.search, id), hash: location.hash }}
        aria-current={view === id ? 'page' : undefined}
        onMouseEnter={() => { preload().catch(() => {}) }}
        onFocus={() => { preload().catch(() => {}) }}
      ><Icon size={13} aria-hidden="true" />{label}</Link>)}
    </nav>
    <div className="home-view-content">
      <Suspense fallback={<div className="home-view-loading" role="status">Loading {view === 'price' ? 'price streams' : 'terminal'}…</div>}>
        {view === 'price' ? <PricePage embedded /> : <TerminalPage embedded />}
      </Suspense>
    </div>
  </div>
}
