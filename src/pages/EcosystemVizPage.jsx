import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, ExternalLink, Search, X } from 'lucide-react'
import { fetchMonadEcosystem, formatTvlCompact, formatChangePct } from '../utils/ecosystemApi'
import { logger } from '../utils/logger'
import './EcosystemVizPage.css'

const SORTS = [
  { id: 'tvl', label: 'TVL' },
  { id: 'name', label: 'A–Z' },
]
const FEATURED_COUNT = 6

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

function ChangeBadge({ value }) {
  const text = formatChangePct(value)
  if (!text) return null
  const dir = Number(value) >= 0 ? 'up' : 'down'
  return <span className={`eco-change eco-change-${dir}`}>{text}</span>
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

function FeaturedCard({ project, rank }) {
  const tvl = formatTvlCompact(project.tvl)
  return (
    <article className="eco-feature">
      <span className="eco-feature-rank" aria-hidden="true">{String(rank).padStart(2, '0')}</span>
      <div className="eco-feature-head">
        <ProjectLogo project={project} size={44} />
        <div className="eco-feature-id">
          <h3 className="eco-feature-name">{project.name}</h3>
          {project.category && <span className="eco-cat">{project.category}</span>}
        </div>
      </div>
      {tvl && (
        <div className="eco-feature-tvl">
          <span className="eco-tvl-value">{tvl}</span>
          <ChangeBadge value={project.change1d} />
        </div>
      )}
      {project.description && <p className="eco-feature-desc">{project.description}</p>}
      <ProjectLinks project={project} />
    </article>
  )
}

function ProjectCard({ project }) {
  const tvl = formatTvlCompact(project.tvl)
  return (
    <article className="eco-card">
      <div className="eco-card-head">
        <ProjectLogo project={project} size={34} />
        <div className="eco-card-id">
          <h3 className="eco-card-name" title={project.name}>{project.name}</h3>
          {project.category ? (
            <span className="eco-cat">{project.category}</span>
          ) : (
            <span className="eco-cat eco-cat-muted">Ecosystem</span>
          )}
        </div>
        {tvl && (
          <div className="eco-card-tvl">
            <span className="eco-tvl-value">{tvl}</span>
            <ChangeBadge value={project.change1d} />
          </div>
        )}
      </div>
      <ProjectLinks project={project} />
    </article>
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

  const projects = data?.projects ?? []

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
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    // 'tvl' order is already applied by fetchMonadEcosystem.
    return list
  }, [projects, query, category, sort])

  // The featured rail only makes sense on the unfiltered, TVL-ordered view.
  const isDefaultView = category === 'all' && sort === 'tvl' && !query.trim()
  const featured = isDefaultView ? filtered.slice(0, FEATURED_COUNT) : []
  const rest = isDefaultView ? filtered.slice(FEATURED_COUNT) : filtered

  const stats = data?.stats
  const totalTvl = formatTvlCompact(stats?.totalTvl)

  const handleClear = useCallback(() => {
    setQuery('')
    searchRef.current?.focus()
  }, [])

  if (loading) {
    return (
      <div className="eco">
        <div className="eco-center">
          <img src="/monad_logo.png" alt="" className="eco-spinner-logo" width={56} height={56} />
          <p>Loading Monad ecosystem…</p>
        </div>
      </div>
    )
  }

  if (error && !projects.length) {
    return (
      <div className="eco">
        <div className="eco-center">
          <p className="eco-error">{error}</p>
          <button className="eco-retry" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="eco">
      <div className="eco-backdrop" aria-hidden="true" />

      <header className="eco-hero">
        <div className="eco-hero-text">
          <p className="eco-eyebrow">Monad Mainnet</p>
          <h1 className="eco-title">Ecosystem</h1>
          <p className="eco-lede">
            Every project building on Monad, with live DeFi TVL from DefiLlama.
          </p>
        </div>

        <dl className="eco-metrics">
          <div className="eco-metric eco-metric-lead">
            <dt>Total DeFi TVL</dt>
            <dd>{totalTvl ?? '—'}</dd>
          </div>
          <div className="eco-metric">
            <dt>Projects</dt>
            <dd>{stats?.total ?? 0}</dd>
          </div>
          <div className="eco-metric">
            <dt>With live TVL</dt>
            <dd>{stats?.defiCount ?? 0}</dd>
          </div>
          <div className="eco-metric">
            <dt>Categories</dt>
            <dd>{stats?.categories?.length ?? 0}</dd>
          </div>
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

      {featured.length > 0 && (
        <section className="eco-featured" aria-label="Largest protocols by TVL">
          {featured.map((p, i) => (
            <FeaturedCard key={p.id} project={p} rank={i + 1} />
          ))}
        </section>
      )}

      <section className="eco-grid" aria-label="All ecosystem projects">
        {rest.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </section>

      {filtered.length === 0 && (
        <p className="eco-empty">
          No projects match your filters.{' '}
          <button className="eco-linkish" onClick={() => { setQuery(''); setCategory('all') }}>
            Reset
          </button>
        </p>
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
