import React, { useState } from 'react'
import DenseTable from './DenseTable'
import { DEXSCREENER_URL } from './constants'
import {
  addressUrl,
  formatAge,
  formatAmount,
  formatClock,
  formatHold,
  formatNum,
  formatPct,
  formatPrice,
  formatUsd,
  shortAddr,
  signedClass,
  sizeTier,
  txUrl,
} from './format'

function CopyCa({ value }) {
  const [done, setDone] = useState(false)
  if (!value) return <span className="d">—</span>
  return (
    <button
      type="button"
      className={`tm-ca${done ? ' done' : ''}`}
      onClick={async (e) => {
        e.stopPropagation()
        try {
          await navigator.clipboard.writeText(value)
          setDone(true)
          window.setTimeout(() => setDone(false), 1200)
        } catch {
          setDone(false)
        }
      }}
      title="Copy contract"
    >
      {done ? 'copied' : shortAddr(value)}
    </button>
  )
}

function Ext({ href, children }) {
  if (!href) return <span className="d">—</span>
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
      {children}
    </a>
  )
}

export function SearchPane({ tm, onAllPools }) {
  const hits = tm.query.trim()
    ? {
        pools: [...tm.localHits.pools, ...tm.remoteHits],
        traders: tm.localHits.traders,
        tape: tm.localHits.tape.slice(0, 12),
        tokens: tm.localHits.tokens,
      }
    : { pools: [], traders: [], tape: [], tokens: [] }

  return (
    <section className="tm-pane tm-search-pane" id="search">
      <form
        className="tm-search"
        onSubmit={(e) => {
          e.preventDefault()
          tm.runRemoteSearch()
        }}
      >
        <span className="tm-prompt">SEARCH&gt;</span>
        <input
          ref={tm.filterRef}
          value={tm.query}
          onChange={(e) => tm.setQuery(e.target.value)}
          placeholder="Search pools, tokens, wallets"
          spellCheck={false}
          autoComplete="off"
          aria-label="Search pools, tokens, wallets"
        />
        <button type="submit">GO</button>
        <button type="button" className="tm-ghost" onClick={onAllPools}>
          ALL POOLS
        </button>
        {tm.searching ? <span className="d">searching…</span> : null}
        {tm.searchError ? <span className="down">{tm.searchError}</span> : null}
      </form>
      {tm.query.trim() ? (
        <div className="tm-search-hits">
          <p className="d">
            {hits.pools.length} pools · {hits.traders.length} wallets · {hits.tokens.length} tokens · {hits.tape.length} fills
          </p>
          {hits.pools.slice(0, 8).map((p) => (
            <button key={p.id} type="button" className="tm-hit" onClick={() => tm.select('pool', p.address || p.id)}>
              <span className="tm-hit__kind">pool</span>
              {p.pair}{' '}
              <span className="d">
                {p.proto} {formatUsd(p.tvl)}
              </span>
            </button>
          ))}
          {hits.traders.slice(0, 6).map((t) => (
            <button key={t.address} type="button" className="tm-hit" onClick={() => tm.select('wallet', t.address)}>
              <span className="tm-hit__kind">wallet</span>
              {shortAddr(t.address)}{' '}
              <span className={signedClass(t.net_pnl)}>{formatUsd(t.net_pnl, { signed: true })}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function DetailPane({ tm }) {
  const t = tm.traderDetail
  const pool = tm.selectedPool
  const title = t ? shortAddr(t.address) : pool ? pool.pair : '—'
  return (
    <section className="tm-pane" id="detail">
      <h2 className="tm-sec">
        {t ? 'WALLET DETAIL' : pool ? 'POOL INSPECTOR' : 'LP DETAIL'}
        <span className="tm-secn">{title}</span>
        {tm.selected ? (
          <button type="button" className="tm-kk" onClick={tm.clearSelection}>
            CLOSE
          </button>
        ) : null}
      </h2>
      {!tm.selected ? (
        <p className="d">Select a wallet or pool from the tape, traders, or market.</p>
      ) : t ? (
        <div className="tm-detail-grid">
          <div>
            <h3 className="tm-h3">STATS</h3>
            <p>
              fills {formatNum(t.fills)} · vol {formatUsd(t.volume)} · win{' '}
              {t.win_rate == null ? '—' : `${Math.round(t.win_rate * 100)}%`}
            </p>
            <p>
              <Ext href={addressUrl(t.address)}>{shortAddr(t.address)}</Ext>
            </p>
          </div>
          <div>
            <h3 className="tm-h3">REALIZED P/L · OPEN · NET</h3>
            <p className={signedClass(t.realized_pnl)}>{formatUsd(t.realized_pnl, { signed: true })}</p>
            <p className={signedClass(t.unrealized_pnl)}>
              open {formatUsd(t.unrealized_pnl, { signed: true })} · net {formatUsd(t.net_pnl, { signed: true })}
            </p>
          </div>
        </div>
      ) : pool ? (
        <div className="tm-detail-grid">
          <p>
            {pool.dexName} · {pool.proto} · fee {pool.feePct == null ? '—' : `${pool.feePct}%`}
          </p>
          <p>
            TVL {formatUsd(pool.tvl)} · vol {formatUsd(pool.volume)} · {formatPct(pool.change)}
          </p>
          <p>
            <Ext href={`${DEXSCREENER_URL}/${pool.address}`}>dexscreener</Ext>
            {' · '}
            <CopyCa value={pool.base?.address} />
          </p>
        </div>
      ) : null}

      <h3 className="tm-h3">OPEN POSITIONS · DEPTH</h3>
      <DenseTable
        empty="No open inventory in this observed window."
        rowKey={(r) => `${r.wallet}:${r.token}`}
        columns={[
          { id: 'pair', label: 'pair', render: (r) => r.symbol || shortAddr(r.token) },
          { id: 'qty', label: 'position', numeric: true, hide: true, render: (r) => formatAmount(r.qty) },
          { id: 'cost', label: 'principal', numeric: true, render: (r) => formatUsd(r.cost) },
          { id: 'value', label: 'equity', numeric: true, render: (r) => formatUsd(r.value) },
          {
            id: 'unreal',
            label: 'unrealized',
            numeric: true,
            render: (r) => <span className={signedClass(r.unrealized)}>{formatUsd(r.unrealized, { signed: true })}</span>,
          },
        ]}
        rows={tm.openPositions.slice(0, 40)}
      />

      <h3 className="tm-h3">CASHFLOWS / CLOSED RUNS</h3>
      <DenseTable
        empty="No flattened episodes in this window."
        rowKey={(r) => `${r.wallet}:${r.token}:${r.closed_ts}`}
        rowClassName={(r) => (r.pnl_usd == null ? '' : r.pnl_usd >= 0 ? 'win' : 'loss')}
        columns={[
          { id: 'closed', label: 'closed', render: (r) => formatClock(r.closed_ts) },
          { id: 'pair', label: 'pair', render: (r) => r.symbol || shortAddr(r.token) },
          { id: 'in', label: 'paid in', numeric: true, render: (r) => formatUsd(r.paid_in) },
          { id: 'out', label: 'got out', numeric: true, render: (r) => formatUsd(r.got_out) },
          { id: 'pnl', label: 'net P/L', numeric: true, render: (r) => formatUsd(r.pnl_usd, { signed: true }) },
          { id: 'ret', label: 'return', numeric: true, hide: true, render: (r) => formatPct(r.pnl_pct) },
          { id: 'held', label: 'held', numeric: true, hide: true, render: (r) => formatHold(r.hold_seconds) },
        ]}
        rows={tm.closed.slice(0, 40)}
      />
    </section>
  )
}

export function TapePane({ tm, nowMs, tapeRef }) {
  return (
    <section className="tm-pane tm-tape-pane" id="feed">
      <h2 className="tm-sec">
        <span className="tm-sec-title">FEED</span>
        <span className="tm-tools">
          {['all', 'buys', 'sells', 'lp'].map((s) => (
            <button
              key={s}
              type="button"
              className={`tm-side${tm.side === s ? ' on' : ''}`}
              onClick={() => tm.setSide(s)}
            >
              {s}
            </button>
          ))}
          <input
            className="num"
            placeholder="min $"
            value={tm.minUsdRaw}
            onChange={(e) => tm.setMinUsdRaw(e.target.value)}
            aria-label="Minimum fill USD"
          />
          <input
            className="num"
            placeholder="max $"
            value={tm.maxUsdRaw}
            onChange={(e) => tm.setMaxUsdRaw(e.target.value)}
            aria-label="Maximum fill USD"
          />
          <input
            className="num"
            placeholder="mcap"
            value={tm.minMcapRaw}
            onChange={(e) => tm.setMinMcapRaw(e.target.value)}
            aria-label="Minimum market cap"
          />
        </span>
      </h2>
      <div className="tm-tw tm-tape-wrap" ref={tapeRef}>
        <table className="tm-t">
          <thead>
            <tr>
              <th>time</th>
              <th>side</th>
              <th>token</th>
              <th className="n">size usd</th>
              <th className="n m-hide">price</th>
              <th className="n m-hide">mcap</th>
              <th className="n m-hide">tokens</th>
              <th>trader</th>
              <th>dexscreener</th>
              <th>ca</th>
              <th className="m-hide">tx</th>
            </tr>
          </thead>
          <tbody>
            {tm.tape.length === 0 ? (
              <tr>
                <td className="d" colSpan={11}>
                  {tm.query.trim() || tm.selected
                    ? 'No fills match this filter.'
                    : 'Waiting for Monad fills…'}
                </td>
              </tr>
            ) : (
              tm.tape.map((f) => {
                const tier = sizeTier(f.usd)
                const isNew = tm.arrived.includes(f.id)
                return (
                  <tr
                    key={f.id}
                    className={`${f.side || ''} sz${tier}${isNew ? ' new' : ''}`}
                    onClick={() => f.wallet && tm.select('wallet', f.wallet)}
                  >
                    <td className="d" title={formatAge(f.ts, nowMs)}>
                      {formatClock(f.ts)}
                    </td>
                    <td>
                      <span className={`tm-tag tm-tag--${f.kind === 'swap' ? f.side || 'flat' : f.kind}`}>
                        {f.kind === 'swap' ? f.side : f.kind}
                      </span>
                    </td>
                    <td className="sym">{f.symbol || '—'}</td>
                    <td className="n size">{formatUsd(f.usd)}</td>
                    <td className="n m-hide">{formatPrice(f.price)}</td>
                    <td className="n m-hide">{formatUsd(f.mcap)}</td>
                    <td className="n m-hide">{formatAmount(f.amount)}</td>
                    <td>
                      <button type="button" className="tm-who" onClick={() => f.wallet && tm.select('wallet', f.wallet)}>
                        {shortAddr(f.wallet)}
                      </button>
                    </td>
                    <td>
                      <Ext href={f.source === 'gecko' && f.pool ? `${DEXSCREENER_URL}/${f.pool}` : null}>pair</Ext>
                    </td>
                    <td>
                      <CopyCa value={f.token} />
                    </td>
                    <td className="m-hide">
                      <Ext href={txUrl(f.tx)}>{shortAddr(f.tx, 6, 4)}</Ext>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function TradersPane({ tm }) {
  return (
    <section className="tm-pane" id="wallets">
      <h2 className="tm-sec">
        TRADERS
        <span className="tm-secn">who is actually making money on observed Monad fills</span>
        <select
          className="tm-sort"
          value={tm.traderSort}
          onChange={(e) => tm.setTraderSort(e.target.value)}
          aria-label="Sort wallets"
        >
          <option value="realized_pnl">sort: p/l on sells</option>
          <option value="unrealized_pnl">sort: p/l on open bags</option>
          <option value="net_pnl">sort: total p/l</option>
          <option value="win_rate">sort: win rate</option>
          <option value="volume">sort: volume</option>
          <option value="fills">sort: fills</option>
          <option value="last_ts">sort: recently updated</option>
        </select>
      </h2>
      <DenseTable
        empty="No traders in this window yet."
        rowKey={(r) => r.address}
        selectedKey={tm.selected?.type === 'wallet' ? tm.selected.id : null}
        onRowClick={(r) => tm.select('wallet', r.address)}
        columns={[
          { id: 'n', label: '#', numeric: true, render: (_r, i) => i + 1 },
          { id: 'handle', label: 'wallet', render: (r) => shortAddr(r.address) },
          { id: 'fills', label: 'fills', numeric: true, render: (r) => formatNum(r.fills) },
          { id: 'volume', label: 'volume', numeric: true, render: (r) => formatUsd(r.volume) },
          {
            id: 'realized_pnl',
            label: 'p/l on sells',
            numeric: true,
            render: (r) => <span className={signedClass(r.realized_pnl)}>{formatUsd(r.realized_pnl, { signed: true })}</span>,
          },
          {
            id: 'unrealized_pnl',
            label: 'open bags',
            numeric: true,
            hide: true,
            render: (r) => <span className={signedClass(r.unrealized_pnl)}>{formatUsd(r.unrealized_pnl, { signed: true })}</span>,
          },
          {
            id: 'net_pnl',
            label: 'total p/l',
            numeric: true,
            render: (r) => <span className={signedClass(r.net_pnl)}>{formatUsd(r.net_pnl, { signed: true })}</span>,
          },
          {
            id: 'win_rate',
            label: 'won',
            numeric: true,
            hide: true,
            render: (r) => (r.win_rate == null ? '—' : `${Math.round(r.win_rate * 100)}%`),
          },
          {
            id: 'explorer',
            label: 'explorer',
            tdClass: 'u',
            render: (r) => <Ext href={addressUrl(r.address)}>vision</Ext>,
          },
        ]}
        rows={tm.traders.slice(0, 120).map((r, i) => ({ ...r, _i: i }))}
      />
    </section>
  )
}

const MARKET_TABS = [
  { id: 'pools', label: 'POOLS' },
  { id: 'tokens', label: 'CAPITAL FLOW' },
  { id: 'fresh', label: 'FRESH POOLS' },
  { id: 'disloc', label: 'DISLOCATIONS' },
]

function TokensTable({ tm }) {
  return (
    <DenseTable
      empty="No bought tokens yet."
      rowKey={(r) => r.token}
      onRowClick={(r) => tm.select('token', r.token)}
      columns={[
        { id: 'sym', label: 'token', render: (r) => r.symbol || shortAddr(r.token) },
        { id: 'buyers', label: 'traders', numeric: true, render: (r) => formatNum(r.traders_n) },
        { id: 'in', label: 'usd in', numeric: true, render: (r) => formatUsd(r.usd_in) },
        { id: 'out', label: 'usd out', numeric: true, render: (r) => formatUsd(r.usd_out) },
        {
          id: 'net',
          label: 'net',
          numeric: true,
          render: (r) => <span className={signedClass(r.net_usd)}>{formatUsd(r.net_usd, { signed: true })}</span>,
        },
        { id: 'mark', label: 'mark', numeric: true, hide: true, render: (r) => formatPrice(r.mark) },
        {
          id: 'first',
          label: 'first buyer',
          hide: true,
          render: (r) => (r.first_buyer ? shortAddr(r.first_buyer.wallet) : '—'),
        },
        { id: 'ca', label: 'ca', render: (r) => <CopyCa value={r.token} /> },
      ]}
      rows={tm.tokens.slice(0, 80)}
    />
  )
}

function FreshTable({ tm, nowMs }) {
  return (
    <DenseTable
      empty="No new pools in the snapshot."
      rowKey={(r) => r.id}
      onRowClick={(r) => tm.select('pool', r.address || r.id)}
      columns={[
        { id: 'pair', label: 'pair', render: (r) => r.pair },
        { id: 'proto', label: 'proto', render: (r) => r.proto || '—' },
        { id: 'age', label: 'age', render: (r) => formatAge(r.created, nowMs) },
        { id: 'tvl', label: 'TVL', numeric: true, render: (r) => formatUsd(r.tvl) },
        { id: 'vol', label: 'volume', numeric: true, hide: true, render: (r) => formatUsd(r.volume) },
      ]}
      rows={tm.fresh}
    />
  )
}

export function PoolsPane({ tm, nowMs, marketTab, setMarketTab }) {
  const tab = marketTab || 'pools'
  const clickSort = (id) => {
    if (tm.poolSort === id) tm.setPoolDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else {
      tm.setPoolSort(id)
      tm.setPoolDir('desc')
    }
  }
  const pickTab = (id) => {
    setMarketTab(id)
    if (id === 'disloc') tm.setPoolSort('disloc')
    else if (tm.poolSort === 'disloc') tm.setPoolSort('fees')
  }
  return (
    <section className="tm-pane" id="pools">
      <h2 className="tm-sec tm-sec--tabs">
        {MARKET_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tm-tab${tab === item.id ? ' is-on' : ''}`}
            onClick={() => pickTab(item.id)}
          >
            {item.label}
          </button>
        ))}
        {tab === 'pools' ? (
          <span className="tm-tools">
            <select
              className="tm-sort"
              value={tm.poolSort}
              onChange={(e) => tm.setPoolSort(e.target.value)}
              aria-label="Sort pools"
            >
              <option value="fees">Pools: fees</option>
              <option value="volume">Pools: volume</option>
              <option value="tvl">Pools: TVL</option>
              <option value="created">Pools: newest</option>
              <option value="fee">Pools: fee rate</option>
              <option value="swaps">Pools: swaps</option>
              <option value="change">Pools: price change</option>
            </select>
            <button type="button" className="tm-kk" onClick={() => tm.setPoolDir((d) => (d === 'desc' ? 'asc' : 'desc'))}>
              {tm.poolDir === 'desc' ? '↓' : '↑'}
            </button>
          </span>
        ) : null}
      </h2>
      {tab === 'disloc' ? (
        <DenseTable
          empty="Need two priced venues of the same pair."
          rowKey={(r) => r.pair}
          columns={[
            { id: 'pair', label: 'pair', render: (r) => r.pair },
            { id: 'spread', label: 'spread', numeric: true, render: (r) => formatPct(r.spreadPct) },
            { id: 'fees', label: 'fees', numeric: true, render: (r) => formatUsd(r.fees) },
            { id: 'depth', label: 'depth', numeric: true, render: (r) => formatUsd(r.depth) },
            { id: 'buy', label: 'buy at', render: (r) => r.buyAt },
            { id: 'buyP', label: 'price', numeric: true, render: (r) => formatPrice(r.buyPrice) },
            { id: 'sell', label: 'sell at', render: (r) => r.sellAt },
            { id: 'sellP', label: 'price', numeric: true, render: (r) => formatPrice(r.sellPrice) },
            { id: 'n', label: 'pools', numeric: true, render: (r) => r.pools },
          ]}
          rows={tm.dislocations}
        />
      ) : tab === 'tokens' ? (
        <TokensTable tm={tm} />
      ) : tab === 'fresh' ? (
        <FreshTable tm={tm} nowMs={nowMs} />
      ) : (
        <DenseTable
          empty="Waiting for Monad pool snapshot…"
          rowKey={(r) => r.id}
          selectedKey={tm.selected?.type === 'pool' ? tm.selected.id : null}
          onRowClick={(r) => tm.select('pool', r.address || r.id)}
          columns={[
            { id: 'pair', label: 'pair', onSort: () => clickSort('tvl'), render: (r) => r.pair },
            { id: 'proto', label: 'proto', render: (r) => r.proto || '—' },
            {
              id: 'fee',
              label: 'fee',
              numeric: true,
              onSort: () => clickSort('fee'),
              render: (r) => (r.feePct == null ? '—' : `${r.feePct}%`),
            },
            { id: 'tvl', label: 'TVL', numeric: true, onSort: () => clickSort('tvl'), render: (r) => formatUsd(r.tvl) },
            { id: 'volume', label: 'volume', numeric: true, onSort: () => clickSort('volume'), render: (r) => formatUsd(r.volume) },
            { id: 'fees', label: 'fees', numeric: true, onSort: () => clickSort('fees'), render: (r) => formatUsd(r.fees) },
            { id: 'swaps', label: 'swaps', numeric: true, hide: true, onSort: () => clickSort('swaps'), render: (r) => formatNum(r.swaps) },
            {
              id: 'change',
              label: 'change',
              numeric: true,
              onSort: () => clickSort('change'),
              render: (r) => <span className={signedClass(r.change)}>{formatPct(r.change)}</span>,
            },
            { id: 'price', label: 'price', numeric: true, hide: true, render: (r) => formatPrice(r.price) },
          ]}
          rows={tm.pools}
        />
      )}
    </section>
  )
}

export function StatusPane({ tm }) {
  const s = tm.status
  const rows = [
    { k: 'chain', v: s.chain_name || 'Monad Mainnet' },
    { k: 'chain_id', v: s.chain_id ?? '—' },
    { k: 'source', v: s.source || '—' },
    { k: 'block', v: s.last_block != null ? `#${Number(s.last_block).toLocaleString()}` : '—' },
    { k: 'lag', v: s.lag_seconds == null ? '—' : `${s.lag_seconds.toFixed(1)}s` },
    { k: 'fills_indexed', v: formatNum(s.fills_indexed) },
    { k: 'gecko_errors', v: formatNum(s.gecko_errors) },
    { k: 'tps', v: s.tps == null ? '—' : Number(s.tps).toFixed(1) },
  ]
  return (
    <section className="tm-pane" id="status">
      <h2 className="tm-sec">
        INDEX STATUS
        <span className="tm-secn">{s.ok ? 'ok' : 'down'}</span>
      </h2>
      <dl className="tm-status">
        {rows.map((r) => (
          <div key={r.k} className="tm-status__cell">
            <dt>{r.k}</dt>
            <dd>{r.v}</dd>
          </div>
        ))}
      </dl>
      <p className="d tm-status__note">{s.coverage}</p>
    </section>
  )
}
