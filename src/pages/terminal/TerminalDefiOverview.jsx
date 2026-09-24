import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { fetchMonadTVL } from '../../utils/defillamaApi'
import { fetchMonTokenData } from '../../utils/coingeckoApi'
import { fetchMonadEcosystem } from '../../utils/ecosystemApi'
import { formatPct, formatUsd } from './format'
import { createTerminalPollLoop } from './terminalPerformance'
import './TerminalDefiOverview.css'

const POLL_MS = 60_000
const SOURCE_KEYS = ['tvl', 'mon', 'protocols']
const FETCHERS = { tvl: fetchMonadTVL, mon: fetchMonTokenData, protocols: fetchMonadEcosystem }
const emptySource = () => ({ data: null, error: null, loading: true })
const known = (value) => Number.isFinite(value) && value >= 0
const snapshots = new Map()
const pending = new Map()

// Tab changes and StrictMode remounts share one bounded request and its result.
// The existing TVL/MON clients also retain their own provider caches.
function loadSource(key) {
  const cached = snapshots.get(key)
  if (cached && Date.now() - cached.cachedAt < POLL_MS) return Promise.resolve(cached)
  if (!pending.has(key)) {
    const request = Promise.resolve().then(() => FETCHERS[key]()).then(
      (data) => ({ data, error: data?.error || (!usable(key, data) ? 'No data is available from this source.' : null) }),
      (error) => ({ data: null, error: error?.message || String(error) }),
    ).then(({ data, error }) => {
      const result = { data: error && cached?.data ? cached.data : usable(key, data) ? data : cached?.data || null, error, cachedAt: Date.now() }
      snapshots.set(key, result)
      return result
    }).finally(() => pending.delete(key))
    pending.set(key, request)
  }
  return pending.get(key)
}

function usable(key, data) {
  if (key === 'protocols') return data?.hasDefiData === true && Array.isArray(data.projects)
  return (key === 'tvl' ? ['totalTVL', 'stablecoinMcap'] : ['price', 'marketCap', 'fdv']).some((field) => known(data?.[field]))
}

function timestamp(value) {
  if (value == null) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function Metric({ label, value, change24h, change7d }) {
  return <div className="term-defi-metric"><dt>{label}</dt><dd>{formatUsd(known(value) ? value : null)}
    {(Number.isFinite(change24h) || Number.isFinite(change7d)) && <small className="term-defi-changes">
      {[[change24h, '24h'], [change7d, '7d']].filter(([change]) => Number.isFinite(change)).map(([change, period]) => <span key={period} className={change > 0 ? 'term-defi-up' : change < 0 ? 'term-defi-down' : ''}>{formatPct(change)} <i>{period}</i></span>)}
    </small>}
  </dd></div>
}

function SourceStatus({ title, href, source, snapshot = false }) {
  const iso = timestamp(source.data?.lastUpdated ?? source.data?.updatedAt)
  const status = source.loading ? 'Refreshing' : source.error ? source.data ? 'Previous data' : 'Unavailable' : snapshot ? 'Snapshot' : source.data?.fromCache ? 'Cached' : 'Available'
  return <div className="term-defi-source">
    <div><a href={href} target="_blank" rel="noreferrer">{title}<ExternalLink size={10} aria-hidden="true" /></a><span className={source.error ? 'term-defi-down' : ''}>{status}</span></div>
    {iso && <time dateTime={iso}>{iso.slice(0, 19).replace('T', ' ')} UTC</time>}
    {source.error && <p>{source.error}</p>}
  </div>
}

function protocolHref(project) {
  const candidate = project.website || project.url
  if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) return candidate
  return project.defiLlamaSlug ? `https://defillama.com/protocol/${encodeURIComponent(project.defiLlamaSlug)}` : null
}

/** Mounted only while the terminal's TVL view is open. */
export default function TerminalDefiOverview() {
  const [sources, setSources] = useState(() => ({ tvl: emptySource(), mon: emptySource(), protocols: emptySource() }))
  const loopsRef = useRef([])

  useEffect(() => {
    let mounted = true
    const loops = SOURCE_KEYS.map((key) => createTerminalPollLoop(async (signal) => {
      // An abandoned StrictMode mount need not start provider work.
      await Promise.resolve()
      if (!mounted || signal.aborted) return
      setSources((previous) => ({ ...previous, [key]: { ...previous[key], loading: true } }))
      const source = await loadSource(key)
      if (!mounted || signal.aborted) return
      setSources((previous) => ({ ...previous, [key]: { ...source, loading: false } }))
    }, { intervalMs: POLL_MS }))
    loopsRef.current = loops
    const onVisibility = () => { for (const loop of loops) loop.setActive(document.visibilityState !== 'hidden') }
    document.addEventListener('visibilitychange', onVisibility)
    onVisibility()
    for (const loop of loops) loop.start()
    return () => {
      mounted = false
      document.removeEventListener('visibilitychange', onVisibility)
      for (const loop of loops) loop.dispose()
      if (loopsRef.current === loops) loopsRef.current = []
    }
  }, [])

  const busy = SOURCE_KEYS.some((key) => sources[key].loading)
  const anyData = SOURCE_KEYS.some((key) => sources[key].data)
  const errors = SOURCE_KEYS.some((key) => sources[key].error)
  const tvl = sources.tvl.data
  const mon = sources.mon.data
  const protocols = (sources.protocols.data?.projects || []).filter((project) => known(project.tvl) && project.tvl > 0)
    .sort((a, b) => b.tvl - a.tvl).slice(0, 6)
  const refresh = () => {
    for (const snapshot of snapshots.values()) snapshot.cachedAt = 0
    for (const loop of loopsRef.current) loop.refresh()
  }

  return <section className="term-defi" aria-label="Monad DeFi overview" aria-busy={busy}>
    <header className="term-defi-heading"><h3>MONAD DEFI</h3><span role="status">{busy ? anyData ? 'Updating…' : 'Loading sources…' : errors ? 'Partial data' : 'USD'}</span><button type="button" onClick={refresh} disabled={busy} aria-label="Refresh DeFi overview" title="Refresh DeFi overview"><RefreshCw size={12} aria-hidden="true" /></button></header>
    <dl className="term-defi-metrics">
      <Metric label="Total TVL" value={tvl?.totalTVL} change24h={tvl?.change24h} change7d={tvl?.change7d} />
      <Metric label="Stablecoin mcap · est." value={tvl?.stablecoinMcap} />
      <Metric label="MON price" value={mon?.price} change24h={mon?.change24h} change7d={mon?.change7d} />
      <Metric label="MON market cap" value={mon?.marketCap} />
      <Metric label="MON fully diluted value" value={mon?.fdv} />
    </dl>
    <div className="term-defi-subheading"><h4>TOP PROTOCOLS BY TVL</h4><Link to="/ecosystem">Ecosystem ↗</Link></div>
    {protocols.length ? <table className="term-defi-protocols"><thead><tr><th scope="col">Protocol</th><th scope="col">Monad TVL</th><th scope="col">24h</th></tr></thead><tbody>{protocols.map((project) => {
      const href = protocolHref(project)
      const content = <>{project.logo && <img src={project.logo} alt="" width="16" height="16" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = 'hidden' }} />}<span>{project.name || 'Unnamed protocol'}</span></>
      return <tr key={project.id || project.defiLlamaSlug || project.name}><th scope="row">{href ? <a href={href} target="_blank" rel="noreferrer" title={project.name}>{content}</a> : <Link to="/ecosystem" title={project.name}>{content}</Link>}</th><td>{formatUsd(project.tvl)}</td><td className={project.change1d > 0 ? 'term-defi-up' : project.change1d < 0 ? 'term-defi-down' : ''}>{formatPct(project.change1d)}</td></tr>
    })}</tbody></table> : <p className="term-defi-empty">{sources.protocols.loading ? 'Loading protocol rankings…' : 'Protocol TVL rankings are unavailable.'}</p>}
    <div className="term-defi-subheading"><h4>DATA SOURCES</h4><span>Reported timestamps · UTC</span></div>
    <div className="term-defi-sources">
      <SourceStatus title="DeFiLlama / stablecoin RPC" href="https://defillama.com/chain/Monad" source={sources.tvl} />
      <SourceStatus title="CoinGecko · MON" href="https://www.coingecko.com/en/coins/monad" source={sources.mon} />
      <SourceStatus title="DeFiLlama · protocols" href="https://defillama.com/chain/Monad" source={sources.protocols} snapshot={sources.protocols.data?.live === false} />
    </div>
    <p className="term-defi-note">Unavailable values stay unknown. Stablecoin capitalization is an estimate from the existing chain data source. Protocol rankings may use a saved snapshot when the live source is unavailable.</p>
  </section>
}
