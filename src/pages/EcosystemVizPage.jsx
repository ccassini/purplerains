import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpRight,
  ExternalLink,
  RefreshCw,
  Search,
  SearchX,
  TrendingDown,
  TrendingUp,
  Unplug,
  X,
} from 'lucide-react'
import {
  fetchMonadEcosystem,
  formatTvlCompact,
  formatTvlFull,
  formatChangePct,
  computeMovers,
} from '../utils/ecosystemApi'
import { logger } from '../utils/logger'
import './EcosystemVizPage.css'

const SORTS = [
  { id: 'tvl', label: 'TVL' },
  { id: '1d', label: '24h %' },
  { id: 'name', label: 'A–Z' },
]
const BOARD_COUNT = 10
const SKELETON_CARDS = 12

/**
 * Logo with a two-step fallback: our curated artwork, then DefiLlama's icon,
 * then a monogram. The 200+ logos come from two sources of differing
 * completeness, so a broken image would otherwise leave a visible hole.
 */
function ProjectLogo({ project, size }) {
  const [step, setStep] = useState(0)
  const candidates = [project.logo, project.logoFallback].filter(Boolean)
  const src = candidates[step]

  if (!src) {
    return (
      <span
        className="eco-logo eco-logo-mono"
        style={{ '--eco-logo-size': `${size}px` }}
        aria-hidden="true"
      >
        {(project.name || '?').trim().charAt(0).toUpperCase()}
      </span>
    )
  }

  return (
    <img
      className="eco-logo"
      style={{ '--eco-logo-size': `${size}px` }}
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setStep((s) => s + 1)}
    />
  )
}

/** Labelled 1d/7d delta with direction color, silent when there is no figure. */
function Delta({ label, value }) {
  const text = formatChangePct(value)
  if (!text) return null
  // Color follows the displayed figure: +0.04 renders "0.0%", so it is flat.
  const dir = text.startsWith('+') ? 'up' : text.startsWith('-') ? 'down' : 'flat'
  return (
    <span className={`eco-delta eco-delta-${dir}`}>
      <span className="eco-delta-label">{label}</span>
      <span className="eco-delta-value">{text}</span>
    </span>
  )
}

function ProjectLinks({ project }) {
  return (
    <div className="eco-links">
      {project.website && (
        <a
          className="eco-link"
          href={project.website}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${project.name} website`}
        >
          Site <ArrowUpRight size={12} aria-hidden="true" />
        </a>
      )}
      {project.twitter && (
        <a
          className="eco-link eco-link-quiet"
          href={`https://x.com/${project.twitter}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${project.name} on X`}
        >
          X
        </a>
      )}
      {project.defiLlamaSlug && (
        <a
          className="eco-link eco-link-quiet"
          href={`https://defillama.com/protocol/${project.defiLlamaSlug}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${project.name} TVL on DefiLlama`}
        >
          TVL <ExternalLink size={11} aria-hidden="true" />
        </a>
      )}
    </div>
  )
}

/** One leaderboard entry: rank, identity, TVL share bar, deltas, outlink. */
function BoardRow({ project, rank, maxTvl, totalTvl }) {
  const tvl = formatTvlCompact(project.tvl)
  const share = totalTvl > 0 ? (Number(project.tvl) / totalTvl) * 100 : 0
  const bar = maxTvl > 0 ? Math.max((Number(project.tvl) / maxTvl) * 100, 2) : 0
  return (
    <li className={`eco-row${rank === 1 ? ' eco-row-first' : ''}`}>
      <span className="eco-row-rank" aria-hidden="true">{String(rank).padStart(2, '0')}</span>
      <ProjectLogo project={project} size={36} />
      <div className="eco-row-id">
        <span className="eco-row-name">{project.name}</span>
        {project.category && <span className="eco-cat">{project.category}</span>}
      </div>
      <div
        className="eco-row-share"
        title={`${share.toFixed(1)}% of tracked Monad TVL`}
        aria-hidden="true"
      >
        <span className="eco-row-bar" style={{ width: `${bar}%` }} />
      </div>
      <span className="eco-row-pct">{share >= 0.1 ? `${share.toFixed(1)}%` : '<0.1%'}</span>
      <span className="eco-tvl-value eco-row-tvl" title={formatTvlFull(project.tvl) ?? undefined}>
        {tvl}
      </span>
      <div className="eco-row-deltas">
        <Delta label="24h" value={project.change1d} />
        <Delta label="7d" value={project.change7d} />
      </div>
      {project.website ? (
        <a
          className="eco-row-out"
          href={project.website}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${project.name} website`}
        >
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      ) : (
        <span className="eco-row-out eco-row-out-empty" aria-hidden="true" />
      )}
    </li>
  )
}

function ProjectCard({ project }) {
  const tvl = formatTvlCompact(project.tvl)
  return (
    <article className="eco-card">
      <div className="eco-card-head">
        <ProjectLogo project={project} size={36} />
        <div className="eco-card-id">
          <h3 className="eco-card-name" title={project.name}>{project.name}</h3>
          {project.category ? (
            <span className="eco-cat">{project.category}</span>
          ) : (
            <span className="eco-cat eco-cat-muted">Ecosystem</span>
          )}
        </div>
      </div>
      {tvl ? (
        <div className="eco-card-tvl">
          <span className="eco-tvl-value" title={formatTvlFull(project.tvl) ?? undefined}>
            {tvl}
          </span>
          <div className="eco-card-deltas">
            <Delta label="24h" value={project.change1d} />
            <Delta label="7d" value={project.change7d} />
          </div>
        </div>
      ) : (
        project.description && <p className="eco-card-desc">{project.description}</p>
      )}
      <ProjectLinks project={project} />
    </article>
  )
}

/** Skeleton mirrors the real layout so nothing jumps when data lands. */
function LoadingState() {
  return (
    <div className="eco" aria-busy="true">
      <div className="eco-backdrop" aria-hidden="true" />
      <div className="eco-hero eco-hero-skeleton" aria-hidden="true">
        <div className="eco-hero-main">
          <span className="eco-sk eco-sk-eyebrow" />
          <span className="eco-sk eco-sk-title" />
          <span className="eco-sk eco-sk-lede" />
        </div>
        <div className="eco-hero-tvl">
          <span className="eco-sk eco-sk-label" />
          <span className="eco-sk eco-sk-big" />
        </div>
        <div className="eco-sk-row">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="eco-sk eco-sk-metric" />
          ))}
        </div>
      </div>
      <div className="eco-grid" aria-hidden="true">
        {Array.from({ length: SKELETON_CARDS }, (_, i) => (
          <div key={i} className="eco-card eco-card-skeleton">
            <span className="eco-sk eco-sk-logo" />
            <span className="eco-sk eco-sk-line" />
            <span className="eco-sk eco-sk-line-short" />
          </div>
        ))}
      </div>
      <p className="eco-sr-only" role="status">Loading Monad ecosystem…</p>
    </div>
  )
}

function ErrorState({ message }) {
  return (
    <div className="eco">
      <div className="eco-backdrop" aria-hidden="true" />
      <div className="eco-fault" role="alert">
        <span className="eco-fault-ring" aria-hidden="true">
          <Unplug size={26} aria-hidden="true" />
        </span>
        <h2 className="eco-fault-title">The ecosystem feed is unreachable</h2>
        <p className="eco-fault-msg">{message}</p>
        <button className="eco-retry" onClick={() => window.location.reload()}>
          <RefreshCw size={14} aria-hidden="true" /> Try again
        </button>
      </div>
    </div>
  )
}

export default function EcosystemVizPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('tvl')
  const searchRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetchMonadEcosystem()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        logger.error('EcosystemVizPage: load failed', err)
        if (!cancelled) setError(err?.message || 'Failed to load ecosystem data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const projects = useMemo(() => data?.projects ?? [], [data])
  const movers = useMemo(() => computeMovers(projects), [projects])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = projects
    if (category === 'defi') list = list.filter((p) => Number(p.tvl) > 0)
    else if (category !== 'all') list = list.filter((p) => (p.category || 'Other') === category)
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.category || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
      )
    }
    if (sort === 'name') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    } else if (sort === '1d') {
      const changeOf = (p) => {
        const n = Number(p.change1d)
        return Number.isFinite(n) ? n : -Infinity
      }
      // Biggest gainers first; projects without a figure sink to the end.
      list = [...list].sort((a, b) => changeOf(b) - changeOf(a) || a.name.localeCompare(b.name))
    }
    // 'tvl' order is already applied by fetchMonadEcosystem.
    return list
  }, [projects, query, category, sort])

  // The leaderboard only makes sense on the unfiltered, TVL-ordered view.
  const isDefaultView = category === 'all' && sort === 'tvl' && !query.trim()
  const board = isDefaultView ? filtered.slice(0, BOARD_COUNT) : []
  const rest = isDefaultView ? filtered.slice(BOARD_COUNT) : filtered

  const stats = data?.stats
  const totalTvl = formatTvlCompact(stats?.totalTvl)
  const boardMaxTvl = Number(board[0]?.tvl) || 0

  const handleClear = useCallback(() => {
    setQuery('')
    searchRef.current?.focus()
  }, [])

  const jumpToProject = useCallback((name) => {
    setCategory('all')
    setSort('tvl')
    setQuery(name)
  }, [])

  if (loading) return <LoadingState />
  if (error && !projects.length) return <ErrorState message={error} />

  return (
    <div className="eco">
      <div className="eco-backdrop" aria-hidden="true" />

      <header className="eco-hero">
        <div className="eco-hero-main">
          <p className="eco-eyebrow">
            <span className={`eco-live-dot${data?.live ? ' is-live' : ''}`} aria-hidden="true" />
            Monad Mainnet · {data?.live ? 'live' : 'snapshot'}
          </p>
          <h1 className="eco-title">Ecosystem</h1>
          <p className="eco-lede">
            Every project building on Monad, ranked by live DeFi TVL from DefiLlama.
          </p>
        </div>

        <div className="eco-hero-tvl">
          <span className="eco-hero-tvl-label">Total value locked</span>
          <span className="eco-hero-tvl-value" title={formatTvlFull(stats?.totalTvl) ?? undefined}>
            {totalTvl ?? '—'}
          </span>
          <span className="eco-hero-tvl-sub">
            across {stats?.defiCount ?? 0} tracked protocols
          </span>
        </div>

        <dl className="eco-metrics">
          <div className="eco-metric">
            <dt>Projects</dt>
            <dd>{stats?.total ?? 0}</dd>
          </div>
          <div className="eco-metric">
            <dt>Categories</dt>
            <dd>{stats?.categories?.length ?? 0}</dd>
          </div>
          <div className="eco-metric">
            <dt>24h movers</dt>
            <dd className="eco-metric-movers">
              <span className="eco-up">▲ {movers.up}</span>
              <span className="eco-down">▼ {movers.down}</span>
            </dd>
          </div>
          {(movers.topGainer || movers.topLoser) && (
            <div className="eco-metric eco-metric-wide">
              <dt>Biggest 24h moves</dt>
              <dd className="eco-metric-movers">
                {movers.topGainer && (
                  <button
                    className="eco-mover"
                    onClick={() => jumpToProject(movers.topGainer.name)}
                    title={`Show ${movers.topGainer.name}`}
                  >
                    <TrendingUp size={12} aria-hidden="true" />
                    <span className="eco-mover-name">{movers.topGainer.name}</span>
                    <span className="eco-up">{formatChangePct(movers.topGainer.change1d)}</span>
                  </button>
                )}
                {movers.topLoser && (
                  <button
                    className="eco-mover"
                    onClick={() => jumpToProject(movers.topLoser.name)}
                    title={`Show ${movers.topLoser.name}`}
                  >
                    <TrendingDown size={12} aria-hidden="true" />
                    <span className="eco-mover-name">{movers.topLoser.name}</span>
                    <span className="eco-down">{formatChangePct(movers.topLoser.change1d)}</span>
                  </button>
                )}
              </dd>
            </div>
          )}
        </dl>

        {!data?.hasDefiData && (
          <p className="eco-notice">
            Live TVL is unavailable right now — showing the project directory only.
          </p>
        )}
      </header>

      <div className="eco-controls">
        <div className="eco-search">
          <Search size={15} className="eco-search-icon" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, categories…"
            aria-label="Search ecosystem projects"
            className="eco-search-input"
          />
          {query && (
            <button className="eco-search-clear" onClick={handleClear} aria-label="Clear search">
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="eco-sort" role="group" aria-label="Sort projects">
          {SORTS.map((s) => (
            <button
              key={s.id}
              className={`eco-sort-btn${sort === s.id ? ' is-active' : ''}`}
              aria-pressed={sort === s.id}
              onClick={() => setSort(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <nav className="eco-cats" aria-label="Filter by category">
        <button
          className={`eco-chip${category === 'all' ? ' is-active' : ''}`}
          aria-pressed={category === 'all'}
          onClick={() => setCategory('all')}
        >
          All <span className="eco-chip-n">{stats?.total ?? 0}</span>
        </button>
        <button
          className={`eco-chip${category === 'defi' ? ' is-active' : ''}`}
          aria-pressed={category === 'defi'}
          onClick={() => setCategory('defi')}
        >
          Has TVL <span className="eco-chip-n">{stats?.defiCount ?? 0}</span>
        </button>
        {(stats?.categories ?? []).map((c) => (
          <button
            key={c.name}
            className={`eco-chip${category === c.name ? ' is-active' : ''}`}
            aria-pressed={category === c.name}
            onClick={() => setCategory(c.name)}
          >
            {c.name} <span className="eco-chip-n">{c.count}</span>
          </button>
        ))}
      </nav>

      {board.length > 0 && (
        <section className="eco-board-wrap" aria-label="Top 10 protocols by TVL">
          <div className="eco-board-head">
            <h2 className="eco-board-title">Leaderboard</h2>
            <span className="eco-board-sub">top {board.length} by value locked</span>
          </div>
          <ol className="eco-board">
            {board.map((p, i) => (
              <BoardRow
                key={p.id}
                project={p}
                rank={i + 1}
                maxTvl={boardMaxTvl}
                totalTvl={Number(stats?.totalTvl) || 0}
              />
            ))}
          </ol>
        </section>
      )}

      {rest.length > 0 && (
        <section className="eco-grid" aria-label="All ecosystem projects">
          {rest.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </section>
      )}

      {filtered.length === 0 && (
        <div className="eco-empty">
          <span className="eco-empty-ring" aria-hidden="true">
            <SearchX size={22} aria-hidden="true" />
          </span>
          <p className="eco-empty-title">Nothing matches</p>
          <p className="eco-empty-sub">
            {query.trim()
              ? `No project, category or description contains "${query.trim()}".`
              : 'No projects in this category yet.'}
          </p>
          <button
            className="eco-retry"
            onClick={() => { setQuery(''); setCategory('all'); setSort('tvl') }}
          >
            Reset filters
          </button>
        </div>
      )}

      <footer className="eco-foot">
        <span>{filtered.length} of {stats?.total ?? 0} shown</span>
        {data?.updatedAt && (
          <span>
            TVL via{' '}
            <a href="https://defillama.com/chain/Monad" target="_blank" rel="noopener noreferrer">
              DefiLlama
            </a>
            {' · updated '}
            {new Date(data.updatedAt).toLocaleString()}
            {!data.live && ' (snapshot)'}
          </span>
        )}
      </footer>
    </div>
  )
}
