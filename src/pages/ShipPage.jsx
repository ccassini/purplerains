import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useMonad } from '../contexts/MonadContext'
import { createShipEngine } from '../ship/engine'
import { projectFor, monadVisionBlockUrl } from '../utils/monadContracts'
import { fetchBridgeInflows, freshInflows, stageFreshInflows } from '../utils/bridgeApi'
import { fetchMonadTVL, formatTVL } from '../utils/defillamaApi'
import './ShipPage.css'

const MANIFEST_MAX = 18
const PANEL_ROWS = 8

const CATEGORY_LABEL = {
  transfer: 'transfer',
  defi: 'swap',
  nft: 'mint',
  contractCall: 'call',
  contractDeploy: 'deploy',
  other: 'tx',
}

const shortHash = (hash) => (hash ? `${hash.slice(0, 8)}…` : '—')

/**
 * A collapsible readout of the raw feed behind the scene. Two of these sit at
 * the foot of the page: the arriving transactions, and block production.
 */
function FeedPanel({ id, title, count, rows, open, onToggle }) {
  return (
    <section className={`hb-panel${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="hb-panel-head"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
      >
        <span className="hb-panel-title">{title}</span>
        <b className="hb-panel-count">{count}</b>
        <i className="hb-panel-caret" aria-hidden="true">{open ? '▾' : '▸'}</i>
      </button>
      <div className="hb-panel-body" id={id} hidden={!open}>
        {rows.map((row) => (
          <div key={row.id} className="hb-panel-row">{row.text}</div>
        ))}
        {rows.length === 0 && <div className="hb-panel-row is-idle">waiting for the feed…</div>}
      </div>
    </section>
  )
}

export default function ShipPage() {
  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const seenTx = useRef(new Set())
  const seenBlocks = useRef(new Set())
  const rowSeq = useRef(0)
  const counts = useRef({ mem: 0, blk: 0 })

  const { transactions, latestBlock, blocks, isConnected, stats } = useMonad()
  const [snap, setSnap] = useState(null)
  const [memRows, setMemRows] = useState([])
  const [blkRows, setBlkRows] = useState([])
  const [memOpen, setMemOpen] = useState(false)
  const [blkOpen, setBlkOpen] = useState(false)
  const [memCount, setMemCount] = useState(0)
  const [manifest, setManifest] = useState([])
  const [monadTvl, setMonadTvl] = useState(null)
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    const id = 'ship-pixel-font'
    if (!document.getElementById(id)) {
      const link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=VT323&family=JetBrains+Mono:wght@400;600&display=swap'
      document.head.appendChild(link)
    }
  }, [])

  // DeFiLlama Monad TVL for the top board — refresh on a slow cadence so the
  // harbour strip stays current without hammering the API.
  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const data = await fetchMonadTVL()
        if (!stop && data?.totalTVL != null) setMonadTvl(data.totalTVL)
      } catch {
        /* keep last good reading */
      }
    }
    load()
    const id = window.setInterval(load, 60_000)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const engine = createShipEngine(canvas)
    engineRef.current = engine
    engine.start()
    const unsub = engine.subscribe(setSnap)
    return () => {
      unsub()
      engine.stop()
      engineRef.current = null
    }
  }, [])

  // Bridge inflows swim in as the pod — each live transfer exactly once.
  // Seed the watermark at page-open time so the feeds' rolling history never
  // parades across the water; only settlements that land after open are fresh.
  const inflowWatermark = useRef(Math.floor(Date.now() / 1000))
  const seenBridgeIds = useRef(new Set())
  useEffect(() => {
    let stop = false
    const ctrl = new AbortController()
    const tick = async () => {
      try {
        const inflows = await fetchBridgeInflows({ signal: ctrl.signal })
        const engine = engineRef.current
        if (stop || !engine) return
        const { fresh } = freshInflows(inflows, inflowWatermark.current)
        // Oldest first so the pod enters in the order the chain saw them, and
        // the watermark only advances past transfers that actually staged —
        // a full pod declines, and the declined transfer stays fresh for the
        // next poll instead of being eaten by an unconditional advance.
        inflowWatermark.current = stageFreshInflows(fresh, inflowWatermark.current, (inflow) => {
          const id = inflow?.id ? String(inflow.id).toLowerCase() : ''
          if (!id || seenBridgeIds.current.has(id)) return true
          if (!engine.pushInflow({ ...inflow, id })) return false
          seenBridgeIds.current.add(id)
          if (seenBridgeIds.current.size > 2000) {
            const first = seenBridgeIds.current.values().next().value
            seenBridgeIds.current.delete(first)
          }
          return true
        })
      } catch {
        // A bridge outage must never take the harbour down with it.
      }
    }
    tick()
    const id = window.setInterval(tick, 12000)
    return () => { stop = true; ctrl.abort(); clearInterval(id) }
  }, [])

  const pushRow = useCallback((setRows, text) => {
    setRows((prev) => [{ id: ++rowSeq.current, text }, ...prev].slice(0, PANEL_ROWS))
  }, [])

  // Transactions muster on the quay.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !transactions?.length) return
    for (let i = 0; i < Math.min(transactions.length, 20); i++) {
      const tx = transactions[i]
      if (!tx?.hash || seenTx.current.has(tx.hash)) continue
      seenTx.current.add(tx.hash)
      if (seenTx.current.size > 400) {
        const first = seenTx.current.values().next().value
        seenTx.current.delete(first)
      }
      engine.pushMon({
        hash: tx.hash,
        category: tx.category || 'other',
        value: tx.value,
        gasPrice: tx.gasPrice,
      })

      counts.current.mem++
      setMemCount(counts.current.mem)
      const gas = Number(tx.gasPrice)
      pushRow(
        setMemRows,
        [
          CATEGORY_LABEL[tx.category] || 'tx',
          Number.isFinite(gas) && gas > 0 ? `${gas.toFixed(0)} gwei` : '',
          shortHash(tx.hash),
        ].filter(Boolean).join(' · '),
      )
    }
  }, [transactions, pushRow])

  // Every sealed block from the live feed becomes a trireme. Prefer the
  // history array so a burst of three in one React tick is not dropped —
  // the engine paces them to live block time so they do not spawn as a convoy.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return

    const feed = []
    if (Array.isArray(blocks) && blocks.length) {
      for (let i = blocks.length - 1; i >= 0; i--) feed.push(blocks[i])
    } else if (latestBlock?.number) {
      feed.push(latestBlock)
    }

    let newestCarried = null
    for (const block of feed) {
      const n = block?.number
      if (!n || seenBlocks.current.has(n)) continue
      seenBlocks.current.add(n)
      if (seenBlocks.current.size > 120) {
        const first = seenBlocks.current.values().next().value
        seenBlocks.current.delete(first)
      }

      const carried = (transactions || []).filter((tx) => Number(tx.blockNumber) === Number(n))
      const hashes = carried.map((tx) => tx.hash).filter(Boolean)
      // Live data only: the block's own count and its own crew list, attached
      // by the feed at fetch time. No stats fallback — it could stamp an empty
      // block with a neighbour's count during a burst commit.
      const txCount = block.transactionCount || (block.recruits?.length ?? 0) || hashes.length
      const fillPct = Number(block.networkUtilization) || 0
      const recruits = (block.recruits?.length
        ? block.recruits
        : carried.map((tx) => ({
            hash: tx.hash,
            value: tx.value,
            gasPrice: tx.gasPrice,
            category: tx.category,
            to: tx.to,
          }))
      ).filter((r) => r?.hash)

      engine.pushVessel({
        number: n,
        hash: block.hash,
        transactionCount: txCount,
        fillPct,
        hashes: hashes.length ? hashes : recruits.map((r) => r.hash),
        recruits,
        burnedMon: block.burnedMon || 0,
      })

      counts.current.blk++
      pushRow(
        setBlkRows,
        `#${Number(n).toLocaleString('de-DE')} · ${txCount} tx · ${fillPct.toFixed(1)}% full`,
      )
      if (carried.length) newestCarried = carried
    }

    if (newestCarried?.length) {
      setManifest(
        newestCarried.slice(0, MANIFEST_MAX).map((tx) => {
          const project = projectFor(tx.to)
          return {
            id: tx.hash,
            hash: shortHash(tx.hash),
            kind: CATEGORY_LABEL[tx.category] || 'tx',
            category: tx.category || 'other',
            project: project?.name || null,
            logo: project?.logo || null,
          }
        }),
      )
    }
  }, [blocks, latestBlock, transactions, stats?.blockTransactions, pushRow])

  const st = snap?.stats
  const focus = snap?.focus
  const tps = Number(stats?.currentTps) || 0
  const blockMs = Number(stats?.avgBlockTimeMs) || 0

  return (
    <div className="hb">
      <canvas
        ref={canvasRef}
        className="hb-canvas"
        aria-label="Monad Odyssey: pending transactions muster on the quay as hoplites and march aboard the triremes of the sealing blocks"
      />

      {/* ── board, top strip — one horizontal course, minimal cover ─── */}
      <section className="hb-board" aria-label="Harbour readout">
        <h1>MONAD ODYSSEY</h1>
        <span className={`hb-net ${isConnected ? 'is-live' : 'is-wait'}`}>
          {isConnected ? 'MAINNET' : 'CONNECTING'}
        </span>
        <p className="hb-board-block">
          <span>BLOCK</span>
          <b>{st?.block ? `#${Number(st.block).toLocaleString('de-DE')}` : '—'}</b>
        </p>
        <div className="hb-metric">
          <b>{tps.toFixed(1)}</b>
          <span>tx/s</span>
        </div>
        <div className="hb-metric">
          <b>{blockMs ? `${Math.round(blockMs)}ms` : '—'}</b>
          <span>block time</span>
        </div>
        {/* The altar's ledger: EIP-1559 base fees are burned; the offering is
            computed from each live block's gasUsed x baseFee — no mock data. */}
        <div className="hb-metric hb-metric-burn" title="Base fee burned each block (EIP-1559) — the altar's share">
          <b>{st?.burnedLast > 0 ? st.burnedLast.toFixed(3) : '—'}</b>
          <span>burn/block</span>
        </div>
        <div className="hb-metric" title="Monad DeFi TVL via DefiLlama">
          <b>{formatTVL(monadTvl)}</b>
          <span>monad tvl</span>
        </div>
      </section>

      {/* ── tool buttons, top-right ─────────────────────────────────── */}
      <div className="hb-tools">
        <button
          type="button"
          className={`hb-tool${guideOpen ? ' is-on' : ''}`}
          onClick={() => setGuideOpen((v) => !v)}
          aria-label="Reading the harbour — legend"
          aria-pressed={guideOpen}
          aria-controls="hb-guide"
        >
          ?
        </button>
        <Link to="/" className="hb-tool" aria-label="Back to Purple Rain">
          <ArrowLeft size={15} aria-hidden="true" />
        </Link>
      </div>

      {/* ── the legend: what the pixels mean, in the scene's own words ── */}
      {guideOpen && (
        <aside className="hb-guide" id="hb-guide" aria-label="Reading the harbour">
          <h3>READING THE HARBOUR</h3>
          <ul>
            <li>
              <b>crest</b>
              <span>helmet silhouette names the tx kind — tall: contract · low: transfer · twin: mint</span>
            </li>
            <li>
              <b>blazon</b>
              <span>shield device cut from the tx hash — same hash, same soldier, always</span>
            </li>
            <li>
              <b>torch</b>
              <span>rank as fire, from live value and gas percentiles — it gutters as quay life runs out</span>
            </li>
            <li>
              <b>empty bench</b>
              <span>a deck seat the sealed block left unused — never filled decoratively</span>
            </li>
            <li>
              <b>whale</b>
              <span>gold cloak ashore: 100+ MON or top-percentile gas · at sea: a $1M+ bridge inflow</span>
            </li>
          </ul>
        </aside>
      )}

      {/* ── inspected hoplite ──────────────────────────────────────── */}
      {snap?.life && (
        <article className={`hb-card hb-card-life is-${snap.life.species}`}>
          <header>
            <h2>{snap.life.label}</h2>
            <span>bridge</span>
          </header>
          <p className="hb-life-amount">
            <b>${snap.life.usd.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>
            <i>{snap.life.symbol}</i>
          </p>
          <p className="hb-life-route">
            <span>{snap.life.fromChain}</span>
            <em>→</em>
            <span>Monad</span>
          </p>
          <p className="hb-life-bridge">{snap.life.bridge}</p>
          <p className="hb-life-sent">{snap.life.fromSymbol} sent · {snap.life.symbol} received</p>
          <p className="hb-card-hint">{snap.life.pinned ? 'pinned · click water to clear' : 'click to pin'}</p>
        </article>
      )}

      {snap?.ship && !focus && !snap?.life && (
        <article className="hb-card hb-card-ship">
          <header>
            <h2>{`BLOCK #${Number(snap.ship.number).toLocaleString('de-DE')}`}</h2>
            <span>{snap.ship.state}</span>
          </header>
          <p className="hb-ship-stats">
            <b>{Number(snap.ship.txCount).toLocaleString('de-DE')}</b> txs ·{' '}
            <b>{snap.ship.boarded}/{snap.ship.load}</b> guards
            {snap.ship.burnedMon > 0 && (
              <> · <b className="is-burn">{snap.ship.burnedMon.toFixed(3)}</b> MON burned</>
            )}
          </p>
          {(snap.ship.projects?.length > 0 || snap.ship.otherContracts > 0) && (
            <ul className="hb-ship-projects">
              {snap.ship.projects.map((pr) => (
                <li key={pr.name}>
                  {pr.logo && (
                    <img src={pr.logo} alt="" loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  )}
                  <span>{pr.name}</span>
                  <b>{pr.count}</b>
                </li>
              ))}
              {snap.ship.otherContracts > 0 && (
                <li className="is-other">
                  <span>other contracts</span>
                  <b>{snap.ship.otherContracts}</b>
                </li>
              )}
            </ul>
          )}
          <a
            className="hb-ship-link"
            href={monadVisionBlockUrl(snap.ship.number)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in MonadVision ↗
          </a>
          <p className="hb-card-hint">{snap.ship.pinned ? 'pinned · click water to clear' : 'click to pin'}</p>
        </article>
      )}

      {focus && (
        <article className="hb-card" style={{ '--hb-accent': focus.color }}>
          <header>
            <h2>{focus.name}</h2>
            <span>{CATEGORY_LABEL[focus.category] || 'tx'}</span>
          </header>
          <p className="hb-card-hash" title={focus.hash}>
            {focus.hash ? `${focus.hash.slice(0, 10)}…${focus.hash.slice(-6)}` : '—'}
          </p>
          <p className="hb-card-state">
            <span className={`hb-rank is-rank-${focus.rank ?? 0}`}>{focus.rankName || 'Ember'}</span>
            {focus.state}
          </p>
          {/* The rank's abilities, straight from the registry — adding one to
              abilities.js surfaces it here with no change to this component. */}
          {focus.abilities?.length > 0 && (
            <ul className="hb-card-abilities">
              {focus.abilities.map((a) => (
                <li key={a.name}>
                  <b>{a.name}</b>
                  <i>{a.blurb}</i>
                </li>
              ))}
            </ul>
          )}
          {(focus.whale || focus.priority) && (
            <p className="hb-card-tags">
              {focus.whale && <span className="is-whale">whale</span>}
              {focus.priority && <span>priority</span>}
            </p>
          )}
          <p className="hb-card-hint">{focus.pinned ? 'pinned · click water to clear' : 'click to pin'}</p>
        </article>
      )}

      {/* ── raw feed panels, bottom-right (clear of the exit lane) ── */}
      <div className="hb-panels">
        <FeedPanel
          id="hb-panel-mem"
          title="MEMPOOL"
          count={memCount.toLocaleString('de-DE')}
          rows={memRows}
          open={memOpen}
          onToggle={() => setMemOpen((v) => !v)}
        />
        <FeedPanel
          id="hb-panel-blk"
          title="BLOCK PRODUCTION"
          count={st?.block ? `#${Number(st.block).toLocaleString('de-DE')}` : '#…'}
          rows={blkRows}
          open={blkOpen}
          onToggle={() => setBlkOpen((v) => !v)}
        />
      </div>

      {/* ── the sealing block's own cargo ──────────────────────────── */}
      <div className="hb-manifest" aria-live="off">
        <span className="hb-manifest-tag">IN BLOCK</span>
        <div className="hb-manifest-strip">
          {manifest.map((tx) => (
            <span key={tx.id} className={`hb-manifest-item is-${tx.category}${tx.project ? ' has-project' : ''}`}>
              {tx.logo && (
                <img
                  className="hb-manifest-logo"
                  src={tx.logo}
                  alt=""
                  loading="lazy"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              )}
              {tx.project && <b>{tx.project}</b>}
              <i>{tx.kind}</i>
              {tx.hash}
            </span>
          ))}
          {manifest.length === 0 && <span className="hb-manifest-item is-idle">waiting for a block…</span>}
        </div>
      </div>
    </div>
  )
}
