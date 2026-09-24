import { memo } from 'react'
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatAmount, formatClock, formatHold, formatNum, shortAddr } from './format'
import { paginateRows } from './terminalView'
import { NATIVE } from './constants'
import TerminalTokenIcon from './TerminalTokenIcon'
import './TerminalChainTable.css'

const ADDRESS = /^0x[\da-f]{40}$/i
const HASH = /^0x[\da-f]{64}$/i
const known = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0

function explorerBase(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? `${url.origin}${url.pathname.replace(/\/+$/, '')}` : null
  } catch { return null }
}

function blockId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value)
  if (typeof value === 'string' && /^\d+$/.test(value)) return value
  return null
}

function fullTime(ts) {
  if (!Number.isFinite(ts)) return 'Time unavailable'
  const date = new Date(ts)
  return Number.isFinite(date.getTime()) ? date.toISOString().replace('T', ' ').replace('Z', ' UTC') : 'Time unavailable'
}

function fullNumber(value, unit) {
  return known(value) ? `${value.toLocaleString('en-US', { maximumFractionDigits: 18 })}${unit ? ` ${unit}` : ''}` : 'Unavailable'
}

function Wallet({ address, direction, onSelect }) {
  const valid = typeof address === 'string' && ADDRESS.test(address)
  return <button className="term-address-button term-chain-wallet" type="button" disabled={!valid || !onSelect}
    title={valid ? address : `${direction} address unavailable`} aria-label={valid ? `Inspect ${direction.toLowerCase()} wallet ${address}` : `${direction} address unavailable`}
    onClick={() => onSelect?.('wallet', address)}>{valid ? shortAddr(address, 5, 4) : '—'}</button>
}

function BlockLink({ number, base }) {
  const id = blockId(number)
  if (id == null) return <span className="term-chain-unknown">—</span>
  const label = `#${BigInt(id).toLocaleString('en-US')}`
  return base ? <a className="term-chain-block-link" href={`${base}/block/${id}`} target="_blank" rel="noopener noreferrer" title={`Block ${id}`} aria-label={`View block ${id}`}>{label}</a>
    : <span title={`Block ${id}`}>{label}</span>
}

const TerminalChainTable = memo(function TerminalChainTable({ rows = [], type, page = 1, onPage, onSelect, expanded = false, explorer, emptyTitle, emptyDescription, onReset }) {
  const transfers = type === 'transfers'
  const label = transfers ? 'Transfers' : 'Blocks'
  const safeRows = Array.isArray(rows) ? rows : []
  const slice = paginateRows(safeRows, Number.isFinite(page) ? Math.trunc(page) : 1)
  const base = explorerBase(explorer)

  return <>
    <div className="term-table-scroll term-chain-scroll" key={`${type}:${slice.page}`}>
      {!slice.total ? <div className="term-empty" role="status"><span className="term-empty-prompt" aria-hidden="true">_</span><h3>{emptyTitle || `Waiting for ${label.toLowerCase()}…`}</h3><p>{emptyDescription || `Observed Monad ${label.toLowerCase()} will appear here.`}</p>{onReset && <button type="button" onClick={onReset}>Clear filters</button>}</div>
        : <table className={`term-table term-chain-table term-chain-table--${transfers ? 'transfers' : 'blocks'}${expanded ? ' is-expanded' : ''}`}>
          <caption className="term-sr-only">{transfers ? 'Observed native MON transfers' : 'Observed Monad blocks'} · UTC times · page {slice.page} of {slice.pages}</caption>
          <thead><tr>
            <th scope="col" className="term-chain-time">UTC</th>
            {transfers ? <><th scope="col">From</th><th scope="col">To</th><th scope="col" className="term-numeric term-chain-amount">Amount <span className="term-chain-unit">MON</span></th>{expanded && <th scope="col" className="term-chain-height">Block</th>}<th scope="col" className="term-chain-transaction"><span className="term-sr-only">Transaction</span></th></>
              : <><th scope="col" className="term-chain-height">Block</th><th scope="col" className="term-numeric term-chain-count">Txs</th><th scope="col">Validator</th><th scope="col" className="term-numeric term-chain-fill">Fill %</th>{expanded && <><th scope="col" className="term-numeric">Burn <span className="term-chain-unit">MON</span></th><th scope="col" className="term-numeric">Gas used</th><th scope="col" className="term-numeric">Base fee <span className="term-chain-unit">gwei</span></th></>}</>}
          </tr></thead>
          <tbody>{slice.rows.map((row, index) => {
            const fill = known(row.networkUtilization) ? row.networkUtilization : null
            const validator = row.proposerValidator?.name || null
            const txHref = base && typeof row.hash === 'string' && HASH.test(row.hash) ? `${base}/tx/${row.hash}` : null
            return <tr data-flow-id={row.id} key={row.id || row.hash || (row.number != null ? `block:${row.number}` : `row:${slice.start + index}`)}>
              <td className="term-chain-time" title={fullTime(row.ts)}>{formatClock(row.ts)}</td>
              {transfers ? <>
                <td><Wallet address={row.from} direction="From" onSelect={onSelect} /></td>
                <td><Wallet address={row.to} direction="To" onSelect={onSelect} /></td>
                <td className="term-numeric term-value" title={row.amountExact != null ? `${row.amountExact} MON` : fullNumber(row.amount, 'MON')}><span className="term-chain-native"><TerminalTokenIcon address={NATIVE} symbol="MON" /><span>{formatAmount(row.amount)}</span></span>{(row.kind === 'contract-value' || row.kind === 'native-value') && <small className="term-chain-value-kind" title={row.kind === 'contract-value' ? `MON sent with contract calldata${row.methodSignature ? ` (${row.methodSignature})` : ''}` : 'MON value observed; transaction calldata unavailable'}>{row.kind === 'contract-value' ? 'Contract value' : 'MON value'}</small>}</td>
                {expanded && <td><BlockLink number={row.blockNumber} base={base} /></td>}
                <td className="term-chain-transaction">{txHref ? <a className="term-explorer" href={txHref} target="_blank" rel="noopener noreferrer" title={row.hash} aria-label={`View transaction ${row.hash}`}><ArrowUpRight size={12} /></a> : <span className="term-chain-unknown" title="Transaction link unavailable">—</span>}</td>
              </> : <>
                <td><BlockLink number={row.number} base={base} /></td>
                <td className="term-numeric" title={fullNumber(row.transactionCount, 'transactions')}>{formatNum(row.transactionCount)}</td>
                <td><span className="term-chain-validator" title={validator || 'Proposer unavailable'}>{validator || '—'}</span></td>
                <td className="term-numeric" title={fill == null ? 'Gas utilization unavailable' : `${fill.toFixed(3)}% of block gas limit`}><span className="term-chain-utilization">{fill != null && <i aria-hidden="true" style={{ width: `${Math.min(100, fill)}%` }} />}<span>{fill == null ? '—' : `${fill.toFixed(1)}%`}</span></span></td>
                {expanded && <>
                  <td className="term-numeric" title={fullNumber(row.burnedMon, 'MON burned')}>{formatAmount(row.burnedMon)}</td>
                  <td className="term-numeric" title={fullNumber(row.gasUsed, 'gas')}>{formatNum(row.gasUsed)}</td>
                  <td className="term-numeric" title={fullNumber(row.baseFeePerGas, 'wei per gas')}>{known(row.baseFeePerGas) ? formatAmount(row.baseFeePerGas / 1e9) : '—'}</td>
                </>}
              </>}
            </tr>
          })}</tbody>
        </table>}
    </div>
    <div className="term-pagination" aria-label={`${label} pagination`}><span>{slice.start}–{slice.end} <em>/ {slice.total}</em></span><div><button type="button" aria-label={`${label} previous page`} disabled={slice.page === 1 || !onPage} onClick={() => onPage?.(slice.page - 1)}><ChevronLeft size={13} /></button><span>{slice.page}/{slice.pages}</span><button type="button" aria-label={`${label} next page`} disabled={slice.page === slice.pages || !onPage} onClick={() => onPage?.(slice.page + 1)}><ChevronRight size={13} /></button></div></div>
  </>
})

export const TerminalBlockContext = memo(function TerminalBlockContext({ validators = [], validatorTotalBlocks, validatorCount, blockWindowMs }) {
  const leaders = Array.isArray(validators) ? validators.slice(0, 12) : []
  const total = known(validatorTotalBlocks) ? validatorTotalBlocks : null
  const duration = known(blockWindowMs) && blockWindowMs > 0 ? blockWindowMs < 1000 ? `${Math.round(blockWindowMs)}ms` : formatHold(blockWindowMs / 1000) : '—'
  return <div className="term-session-context term-block-context">
    <div className="term-context-heading"><span>BLOCK PROPOSERS</span><small>Observed session</small></div>
    <dl className="term-session-facts term-block-facts"><div><dt>Observed blocks</dt><dd>{formatNum(total)}</dd></div><div><dt>Unique validators</dt><dd>{formatNum(validatorCount)}</dd></div><div><dt>Observation span</dt><dd title="Time between the first and last observed blocks">{duration}</dd></div></dl>
    {leaders.length ? <table className="term-block-leaders"><caption className="term-sr-only">Top twelve block proposers. Share is calculated only from blocks observed during this session.</caption><thead><tr><th scope="col"><span className="term-sr-only">Rank</span>#</th><th scope="col">Validator</th><th scope="col">Blocks</th><th scope="col" title="Share of all blocks observed in this session">Share</th></tr></thead><tbody>{leaders.map((validator, index) => {
      const count = known(validator.blocks) ? validator.blocks : null
      const share = total > 0 && count != null && count <= total ? count / total * 100 : null
      const name = validator.name || (validator.id != null ? `Validator ${validator.id}` : 'Unattributed')
      return <tr key={validator.key || validator.id || name} title={validator.lastSeen ? `Last observed ${fullTime(validator.lastSeen)}` : undefined}><td>{index + 1}</td><th scope="row"><span title={name}>{name}</span></th><td title={fullNumber(count, 'observed blocks')}>{formatNum(count)}</td><td title={share == null ? 'Session share unavailable' : `${count} of ${total} observed blocks`}>{share == null ? '—' : `${share.toFixed(1)}%`}</td></tr>
    })}</tbody></table> : <p className="term-block-waiting">Waiting for attributed blocks…</p>}
    <p className="term-context-hint">Top 12 validators by blocks observed in this session. Counts and shares cover this observation window.</p>
  </div>
})

export default TerminalChainTable
