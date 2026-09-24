import { ArrowRight, RefreshCw, Wallet } from 'lucide-react'
import { getValidatorById } from '../../utils/validatorApi'
import { formatMonFromWei } from './stakingFormat'

export default function PortfolioPanel({ isConnected, rows, totals, state, onRefresh, onSelect, onConnect, needsChain }) {
  return <section className="sk-panel sk-portfolio" aria-labelledby="sk-portfolio-title">
    <div className="sk-section-heading"><div><p className="sk-eyebrow">03 / YOUR OVERVIEW</p><h2 id="sk-portfolio-title">Your positions</h2></div>{isConnected && <button className="sk-icon-button" type="button" onClick={onRefresh} disabled={state === 'loading'} aria-label="Refresh staking positions"><RefreshCw size={16} className={state === 'loading' ? 'sk-spin' : ''} /></button>}</div>
    {!isConnected ? <div className="sk-portfolio-connect"><div><Wallet size={24} /><p>See your active stake, pending delegations and rewards in one place.</p></div><button className="sk-btn" type="button" onClick={onConnect}>{needsChain ? 'Switch to Monad' : 'Connect wallet'} <ArrowRight size={15} /></button></div> : <>
      <div className="sk-portfolio-totals">{[['Active stake', totals.staked], ['Pending activation', totals.pending], ['Unclaimed rewards', totals.rewards]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{state === 'ready' || rows.length ? formatMonFromWei(value) : '—'}<small>MON</small></strong></div>)}</div>
      {state === 'loading' && <p className="sk-note" role="status">Reading your delegations…</p>}
      {state === 'error' && <p className="sk-warning" role="alert">Some positions could not be read. Refresh to try again.</p>}
      {state === 'ready' && !rows.length && <p className="sk-note">No active or pending stake found. Select a validator to start, or check a validator’s Unstake tab for existing withdrawal requests.</p>}
      {rows.length > 0 && <ul className="sk-position-list">{rows.map(row => <li key={row.validatorId}><button type="button" onClick={() => onSelect(row.validatorId)}><span>{getValidatorById(row.validatorId)?.name || `Validator #${row.validatorId}`}</span><strong>{formatMonFromWei(row.stake)} MON</strong><ArrowRight size={14} /></button></li>)}</ul>}
    </>}
  </section>
}
