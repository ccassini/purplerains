/**
 * /odysseyVS — the siege of Troy, fought in block space.
 *
 * Monad's army lands from the ships on the left; every chain added to the
 * coalition pours out of the fortress gate on the right. One soldier is one
 * million gas of block space per second — measured from each chain's own RPC,
 * never invented. The front line moves only by genuine numerical surplus.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMonad } from '../contexts/MonadContext'
import { createWarEngine } from '../vs/warEngine'
import { CHAIN_REGISTRY, MONAD_CHAIN, chainByKey } from '../vs/chains'
import { measureChain } from '../vs/liveGas'
import './OdysseyVsPage.css'

const DEFAULT_ROSTER = ['eth', 'base', 'arbitrum', 'hyperevm']

const fmt = (n) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}K`
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`
  return `${Math.round(n)}`
}

const STATE_BANNERS = {
  walls: 'MONAD AT THE WALLS',
  shore: 'DRIVEN BACK TO THE SHIPS',
}

function rosterFromParams(params) {
  const raw = params.get('vs')
  if (!raw) return DEFAULT_ROSTER
  const keys = raw.split(',').map((k) => k.trim()).filter((k) => chainByKey(k) && k !== 'monad')
  return keys.length ? [...new Set(keys)] : DEFAULT_ROSTER
}

export default function OdysseyVsPage() {
  const { latestBlock } = useMonad()
  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const measuredRef = useRef(new Set())
  const [params, setParams] = useSearchParams()
  const [roster, setRoster] = useState(() => rosterFromParams(params))
  const [snap, setSnap] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  // ── engine lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const engine = createWarEngine(canvas)
    engineRef.current = engine
    engine.onEmit = setSnap
    engine.start()
    return () => {
      engine.stop()
      engineRef.current = null
    }
  }, [])

  // ── live Monad blocks drive the landing party ────────────────────────
  useEffect(() => {
    if (latestBlock?.number) engineRef.current?.pushMonadBlock(latestBlock)
  }, [latestBlock])

  // ── roster: engine + URL + live re-measure of every fielded chain ────
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setRoster(roster)
    const next = new URLSearchParams(params)
    next.set('vs', roster.join(','))
    setParams(next, { replace: true })
    for (const key of [...roster, 'monad']) {
      if (measuredRef.current.has(key)) continue
      measuredRef.current.add(key)
      const chain = chainByKey(key)
      measureChain(chain).then((patch) => {
        if (patch) engineRef.current?.updateChain(key, patch)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- params identity churns per set
  }, [roster])

  const addChain = useCallback((key) => {
    setRoster((r) => (r.includes(key) ? r : [...r, key]))
    setPickerOpen(false)
  }, [])
  const dropChain = useCallback((key) => {
    setRoster((r) => r.filter((k) => k !== key))
  }, [])

  const bench = useMemo(() => {
    const fielded = new Set(roster)
    return [...CHAIN_REGISTRY]
      .filter((c) => !fielded.has(c.key))
      .sort((a, b) => b.gasPerSecM - a.gasPerSecM)
  }, [roster])

  const banner = snap && STATE_BANNERS[snap.state]
  const frontPct = snap ? Math.round(snap.frontPct * 100) : 50

  return (
    <div className="vw">
      <canvas ref={canvasRef} className="vw-canvas" aria-label="Block-space siege: Monad against the coalition" />

      <header className="vw-board">
        <h1>TROY VS</h1>
        <div className="vw-side is-monad">
          <img src="/monad_logo.png" alt="" width="18" height="18" />
          <div>
            <b>{MONAD_CHAIN.name.toUpperCase()}</b>
            <span>{snap ? fmt(snap.monad.gasPerSecM) : '—'}M GAS/S · {snap ? fmt(snap.monad.soldiersPerSec) : '—'} SOLDIERS/S</span>
          </div>
        </div>
        <div className="vw-clash">
          <b>VS</b>
          <i style={{ '--front': `${frontPct}%` }} />
        </div>
        <div className="vw-side is-troy">
          <div>
            <b>COALITION ×{roster.length}</b>
            <span>{snap ? fmt(snap.troy.gasPerSecM) : '—'}M GAS/S · {snap ? fmt(snap.troy.gasPerSecM) : '—'} SOLDIERS/S</span>
          </div>
        </div>
      </header>

      {banner && <p className="vw-banner" data-state={snap.state}>{banner}</p>}

      <aside className="vw-muster">
        <header>
          <h2>THE COALITION</h2>
          <button type="button" onClick={() => setPickerOpen((v) => !v)} className={pickerOpen ? 'is-on' : ''}>
            {pickerOpen ? '×' : '+ CHAIN'}
          </button>
        </header>
        {pickerOpen && (
          <ul className="vw-bench">
            {bench.map((c) => (
              <li key={c.key}>
                <button type="button" onClick={() => addChain(c.key)}>
                  {c.logo && <img src={c.logo} alt="" width="14" height="14" />}
                  <b>{c.name}</b>
                  <i>{c.kind}</i>
                  <span>{fmt(c.gasPerSecM)}M gas/s</span>
                </button>
              </li>
            ))}
            {!bench.length && <li className="vw-bench-empty">Every measured chain is on the field.</li>}
          </ul>
        )}
        <ul className="vw-roster">
          {(snap?.troy.chains || []).map((c) => (
            <li key={c.key} style={{ '--chain': c.color }}>
              {chainByKey(c.key)?.logo && <img src={chainByKey(c.key).logo} alt="" width="16" height="16" />}
              <div className="vw-roster-name">
                <b>{c.name}</b>
                <span>{fmt(c.gasPerSecM)}M gas/s · block {c.blockTimeMs >= 1000 ? `${(c.blockTimeMs / 1000).toFixed(c.blockTimeMs % 1000 ? 1 : 0)}s` : `${c.blockTimeMs}ms`}</span>
              </div>
              <div className="vw-roster-count">
                <b>{fmt(c.fielded)}</b>
                <span>{fmt(c.fallen)} fallen</span>
              </div>
              <button type="button" aria-label={`Remove ${c.name}`} onClick={() => dropChain(c.key)}>×</button>
            </li>
          ))}
        </ul>
      </aside>

      <footer className="vw-ledger">
        <div className="vw-tally is-monad">
          <b>{snap ? fmt(snap.monad.fielded) : '—'}</b>
          <span>MONAD FIELDED</span>
          <i>{snap ? fmt(snap.monad.fallen) : '—'} fallen · {snap ? snap.monad.blocks : '—'} blocks{snap?.monad.live ? ' · LIVE' : ''}</i>
        </div>
        <p className="vw-law">
          1 SOLDIER = 1M GAS OF BLOCK SPACE / SECOND · 1 FIGURE = {snap ? snap.figuresPer : 10} SOLDIERS ·
          CAPACITY MEASURED FROM EACH CHAIN&apos;S OWN RPC
        </p>
        <div className="vw-tally is-troy">
          <b>{snap ? fmt(snap.troy.fielded) : '—'}</b>
          <span>COALITION FIELDED</span>
          <i>{snap ? fmt(snap.troy.fallen) : '—'} fallen</i>
        </div>
      </footer>
    </div>
  )
}
