import { memo } from 'react'
import { ArrowDown, ArrowUp, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatAmount, formatClock, formatNum, formatPct, formatPrice, formatUsd, shortAddr, signedClass, txUrl } from './format'
import { paginateRows } from './terminalView'
import TerminalTokenIcon from './TerminalTokenIcon'
import { terminalTradeLegs } from './terminalTokenVisuals'
import './TerminalTable.css'

const price = (value) => value == null ? '—' : `$${formatPrice(value)}`
const created = (timestamp) => timestamp ? new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
const POOL_METRICS = {
  volume: { label: 'Volume', value: (row) => formatUsd(row.volume) },
  tvl: { label: 'Liquidity', value: (row) => formatUsd(row.tvl) },
  change: { label: 'Price', value: (row) => price(row.price) },
  created: { label: 'Created', value: (row) => created(row.created) },
  swaps: { label: 'Swaps', value: (row) => formatNum(row.swaps) },
  fees: { label: 'Est. fees', value: (row) => formatUsd(row.fees) },
  fee: { label: 'Fee rate', value: (row) => row.feePct == null ? '—' : `${row.feePct}%` },
}
const WALLET_METRICS = {
  volume: { label: 'Volume', value: (r) => formatUsd(r.volume) },
  fills: { label: 'Trades', value: (r) => formatNum(r.fills) },
  last_ts: { label: 'Last UTC', value: (r) => formatClock(r.last_ts) },
  realized_pnl: { label: 'Realized P/L', value: (r) => formatUsd(r.realized_pnl, { signed: true }) },
  unrealized_pnl: { label: 'Open P/L', value: (r) => formatUsd(r.unrealized_pnl, { signed: true }) },
  net_pnl: { label: 'Net P/L', value: (r) => formatUsd(r.net_pnl, { signed: true }) },
  win_rate: { label: 'Win rate', value: (r) => r.win_rate == null ? '—' : `${(r.win_rate * 100).toFixed(1)}%` },
}

function TradeLeg({ leg, direction, tokenImages, onSelect }) {
  if (!leg) return <span className="term-trade-missing" aria-label={`${direction} token unavailable`}>—</span>
  const symbol = leg.symbol || shortAddr(leg.address, 3, 2)
  const quantity = formatAmount(leg.amount)
  const description = `${direction} ${leg.amount == null ? 'unknown quantity of' : leg.amount} ${symbol}${leg.address ? ` (${leg.address})` : ''}`
  return <button type="button" className="term-trade-leg" title={description} aria-label={`${description}${leg.address ? '. Inspect token' : ''}`} disabled={!leg.address || !onSelect} onClick={() => onSelect?.('token', leg.address)}>
    <TerminalTokenIcon address={leg.address} symbol={leg.symbol} image={leg.image} tokenImages={tokenImages} />
    <span className="term-trade-leg-copy"><span className="term-trade-symbol">{symbol}</span><span className="term-trade-quantity">{quantity}</span></span>
  </button>
}

function TradePath({ row, tokenImages, onSelect }) {
  const { sold, bought } = terminalTradeLegs(row)
  return <span className="term-trade-path"><TradeLeg leg={sold} direction="Sold" tokenImages={tokenImages} onSelect={onSelect} /><span className="term-trade-arrow" aria-hidden="true">→</span><TradeLeg leg={bought} direction="Bought" tokenImages={tokenImages} onSelect={onSelect} /></span>
}

const TerminalTable = memo(function TerminalTable({ rows, type, page, onPage, onSelect, sort, direction, onSort, period, emptyTitle, emptyDescription, onReset, selectedKey = '', expanded = false, walletSort = 'volume', tokenImages }) {
  const slice = paginateRows(rows, page)
  const isPool = type === 'pools' || type === 'fresh'
  const marketMetric = POOL_METRICS[sort] || POOL_METRICS.volume
  const walletMetric = WALLET_METRICS[walletSort] || WALLET_METRICS.volume
  const label = type === 'feed' ? 'Live tape' : 'Market navigator'
  const sortedHeader = (key, title) => <th className="term-numeric" scope="col" aria-sort={sort === key ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => onSort(key)}>{title}{sort === key && (direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}</button></th>

  return <>
    <div className="term-table-scroll" key={`${type}:${slice.page}`}>
      {!rows.length ? <div className="term-empty" role="status"><span className="term-empty-prompt">_</span><h3>{emptyTitle}</h3><p>{emptyDescription}</p>{onReset && <button type="button" onClick={onReset}>Clear filters</button>}</div> : <table className={`term-table term-table--${type}${expanded ? ' is-expanded' : ''}`}>
        <caption className="term-sr-only">{type === 'feed' ? 'Observed Monad DEX activity' : type === 'wallets' ? 'Observed wallet activity' : type === 'tokens' ? 'Observed token flows' : type === 'compare' ? 'Pool price comparisons' : 'Monad liquidity pools'}</caption>
        <thead><tr>
          {isPool ? <><th scope="col">Pair / venue</th>{sortedHeader('change', `${period} Δ`)}{sort === 'change' ? <th scope="col" className="term-numeric">Price</th> : sortedHeader(sort, marketMetric.label)}</>
            : type === 'feed' ? <><th scope="col">UTC</th><th scope="col">Side</th><th scope="col">Sold → bought</th><th scope="col" className="term-numeric">Value USD</th>{expanded && <><th scope="col" className="term-numeric">Price</th><th scope="col" className="term-numeric">Quantity</th><th scope="col" className="term-numeric">Mcap / FDV</th><th scope="col">Source</th></>}<th scope="col">Wallet</th><th scope="col"><span className="term-sr-only">Transaction</span></th></>
              : type === 'wallets' ? <><th scope="col">Wallet</th><th className="term-numeric" scope="col">Trades</th><th className="term-numeric" scope="col">{walletMetric.label}</th></>
                : type === 'tokens' ? <><th scope="col">Token / mark</th><th scope="col" className="term-numeric">Buy USD</th><th scope="col" className="term-numeric">Net USD</th></>
                  : <><th scope="col">Pair / spread</th><th scope="col">Lower quote</th><th scope="col">Higher quote</th></>}
        </tr></thead>
        <tbody>{slice.rows.map((row) => {
          const key = isPool ? `pool:${row.address || row.id}` : type === 'wallets' ? `wallet:${row.address}` : `token:${row.token}`
          return <tr data-flow-id={type === 'feed' ? row.id : undefined} key={row.id || row.address || row.token || row.pair} className={selectedKey === key ? 'is-selected' : undefined}>
            {isPool ? <>
              <td><button className="term-identity term-identity-with-icons" type="button" aria-pressed={selectedKey === key} onClick={() => onSelect('pool', row.address || row.id)}><span className="term-pair-icons"><TerminalTokenIcon {...row.base} tokenImages={tokenImages} /><TerminalTokenIcon {...row.quote} tokenImages={tokenImages} /></span><span className="term-identity-copy"><strong>{row.pair}</strong><small>{row.dexName || row.proto || 'Unknown venue'}</small></span></button></td>
              <td className={`term-numeric ${signedClass(row.change)}`}>{formatPct(row.change)}</td>
              <td className="term-numeric">{marketMetric.value(row)}</td>
            </> : type === 'feed' ? <>
              <td className="term-timestamp">{formatClock(row.ts)}</td>
              <td><span className={`term-side term-side--${row.kind === 'flow' ? 'flow' : row.side || row.kind}`}>{row.kind === 'flow' ? 'DEX flow' : row.kind === 'swap' ? row.side || 'swap' : row.kind === 'add' ? '+LP' : row.kind === 'remove' ? '−LP' : row.kind}</span></td>
              <td className="term-trade-cell"><TradePath row={row} tokenImages={tokenImages} onSelect={onSelect} /></td>
              <td className="term-numeric term-value">{formatUsd(row.usd)}</td>
              {expanded && <><td className="term-numeric">{price(row.price)}</td><td className="term-numeric">{formatAmount(row.amount)}</td><td className="term-numeric">{formatUsd(row.mcap)}</td><td className="term-source-cell">{row.source === 'gecko' ? row.pair || 'Pool trade' : 'On-chain'}</td></>}
              <td><button className="term-address-button" type="button" onClick={() => row.wallet && onSelect('wallet', row.wallet)} disabled={!row.wallet}>{shortAddr(row.wallet, 4, 3)}</button></td>
              <td>{row.tx && <a className="term-explorer" href={txUrl(row.tx)} target="_blank" rel="noreferrer" aria-label={`View transaction ${row.tx}`}><ArrowUpRight size={12} /></a>}</td>
            </> : type === 'wallets' ? <>
              <td><button className="term-identity" type="button" aria-pressed={selectedKey === key} onClick={() => onSelect('wallet', row.address)}><strong>{shortAddr(row.address)}</strong><small>{row.symbols?.slice(0, 3).join(' · ') || 'Observed wallet'}</small></button></td>
              <td className="term-numeric">{formatNum(row.fills)}</td><td className={`term-numeric ${walletSort.includes('pnl') ? signedClass(row[walletSort]) : ''}`}>{walletMetric.value(row)}</td>
            </> : type === 'tokens' ? <>
              <td><button className="term-identity term-identity-with-icons" type="button" aria-pressed={selectedKey === key} onClick={() => onSelect('token', row.token)}><TerminalTokenIcon address={row.token} symbol={row.symbol} image={row.image} tokenImages={tokenImages} /><span className="term-identity-copy"><strong>{row.symbol || shortAddr(row.token)}</strong><small>{price(row.mark)}</small></span></button></td>
              <td className="term-numeric">{formatUsd(row.usd_in)}</td><td className={`term-numeric ${signedClass(row.net_usd)}`}>{formatUsd(row.net_usd, { signed: true })}</td>
            </> : <>
              <td><strong>{row.pair}</strong><small className="term-cell-note up">{formatPct(row.spreadPct)}</small></td>
              <td><button type="button" className="term-quote" onClick={() => onSelect('pool', row.buyPool)}><strong>{price(row.buyPrice)}</strong><small>{row.buyAt}</small></button></td>
              <td><button type="button" className="term-quote" onClick={() => onSelect('pool', row.sellPool)}><strong>{price(row.sellPrice)}</strong><small>{row.sellAt}</small></button></td>
            </>}
          </tr>
        })}</tbody>
      </table>}
    </div>
    <div className="term-pagination"><span>{slice.start}–{slice.end} <em>/ {slice.total}</em></span><div><button type="button" aria-label={`${label} previous page`} disabled={slice.page === 1} onClick={() => onPage(slice.page - 1)}><ChevronLeft size={13} /></button><span>{slice.page}/{slice.pages}</span><button type="button" aria-label={`${label} next page`} disabled={slice.page === slice.pages} onClick={() => onPage(slice.page + 1)}><ChevronRight size={13} /></button></div></div>
  </>
})

export default TerminalTable
