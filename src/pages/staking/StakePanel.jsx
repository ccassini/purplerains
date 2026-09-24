import { ArrowUpRight, Check, CircleDot, Clock3, ExternalLink, Loader2, Wallet } from 'lucide-react'
import { amountError, amountPreset, GAS_RESERVE_WEI, parseStakingAmount } from './stakingAmounts'
import { formatMonFromWei } from './stakingFormat'
import { txUrl } from './useStakingActions'
import './panels.css'

const TABS = ['Stake', 'Rewards', 'Unstake']
const DOCS = 'https://docs.monad.xyz/reference/staking/overview'

function AmountField({ id, label, value, onChange, available, reserve = 0n, error, disabled }) {
  return <div className="sk-amount">
    <div className="sk-field-label"><label htmlFor={id}>{label}</label><span>{typeof available === 'bigint' ? `${formatMonFromWei(available, { compact: false, digits: 4 })} available` : 'Balance unavailable'}</span></div>
    <div className={`sk-amount-input ${error ? 'has-error' : ''}`}><input id={id} value={value} onChange={e => onChange(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="0.00" disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint`} /><span>MON</span></div>
    <div className="sk-presets">{[25, 50, 75, 100].map(p => <button key={p} type="button" disabled={disabled || typeof available !== 'bigint'} onClick={() => onChange(amountPreset(available, p, reserve))}>{p === 100 ? 'Max' : `${p}%`}</button>)}</div>
    <p id={`${id}-hint`} className={`sk-note ${error ? 'sk-error-text' : ''}`}>{error || (reserve > 0n ? 'Max leaves 0.01 MON for fees. Your wallet estimates the actual cost.' : 'Only active stake can be unstaked. Pending delegations stay locked until activation.')}</p>
  </div>
}

export default function StakePanel({ validator, positionData, epochInfo, balance, isConnected, needsChain, canAct, isPending, activeTab, onTabChange, stakeAmount, onStakeAmountChange, unstakeAmount, onUnstakeAmountChange, statusInfo, transaction, onCheckReceipt, onDelegate, onUndelegate, onWithdraw, onClaim, onCompound, onConnect, onSwitchChain, onCalculatorClick }) {
  const { position, withdrawals, nextSlot, loading, error, withdrawalsReady } = positionData
  const stakeError = amountError(stakeAmount, balance?.value, { reserve: GAS_RESERVE_WEI })
  const unstakeError = amountError(unstakeAmount, position?.stake)
  const hasRewards = (position?.unclaimedRewards ?? 0n) > 0n
  const hasStake = (position?.stake ?? 0n) > 0n
  const pending = (position?.deltaStake ?? 0n) + (position?.nextDeltaStake ?? 0n)
  const targetEpoch = epochInfo.isFresh && epochInfo.epoch != null && typeof epochInfo.inEpochDelayPeriod === 'boolean' ? epochInfo.epoch + (epochInfo.inEpochDelayPeriod ? 2 : 1) : null
  const connected = isConnected && !needsChain
  const actionAllowed = canAct && !isPending

  if (!validator) return <section className="sk-panel sk-action-empty" aria-label="Staking workspace"><p className="sk-eyebrow">02 / DELEGATE</p><div className="sk-orbit-art" aria-hidden="true"><span /><span /><img src="/monad_logo.png" alt="" /></div><h2>Your stake.<br />Your choice.</h2><p>Select a validator to view commission and manage your MON.</p><div className="sk-empty-steps"><span><Check size={14} />Browse without a wallet</span><span><Wallet size={14} />Connect when you’re ready</span></div><a className="sk-text-link" href="#calculator" onClick={onCalculatorClick}>Explore potential rewards <ArrowUpRight size={15} /></a></section>

  return <section className="sk-panel sk-action" aria-labelledby="sk-action-title">
    <p className="sk-eyebrow">02 / MANAGE YOUR STAKE</p>
    <div className="sk-selected-identity"><span className="sk-avatar sk-avatar-large">{validator.logo ? <img src={validator.logo} alt="" /> : validator.name.slice(0, 1)}</span><div><h2 id="sk-action-title">{validator.name}</h2><span className="sk-muted">Validator #{validator.id} · {validator.hasChainData ? validator.isActive ? 'Active' : 'Inactive' : 'Status unverified'}</span></div></div>
    <div className="sk-selected-stats"><div><span>Commission</span><strong>{Number.isFinite(validator.commissionBps) ? `${(validator.commissionBps / 100).toFixed(2)}%` : '—'}</strong></div><div><span>Delegated MON</span><strong>{validator.totalStakeWei == null ? '—' : formatMonFromWei(validator.totalStakeWei)}</strong></div></div>
    {!validator.isActive && <p className="sk-warning">{validator.hasChainData ? 'This validator is outside the active set. Rewards depend on becoming active and producing blocks.' : 'Validator status is not verified. Refresh the data before delegating.'}</p>}
    <div className="sk-tabs" role="tablist" aria-label="Staking action">{TABS.map((tab, i) => <button id={`sk-tab-${tab.toLowerCase()}`} role="tab" aria-selected={activeTab === tab.toLowerCase()} aria-controls="sk-action-panel" tabIndex={activeTab === tab.toLowerCase() ? 0 : -1} key={tab} type="button" disabled={isPending} onClick={() => onTabChange(tab.toLowerCase())} onKeyDown={e => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return; e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (i + (e.key === 'ArrowRight' ? 1 : 2)) % 3; onTabChange(TABS[next].toLowerCase()); e.currentTarget.parentElement.children[next].focus() }}>{tab}{tab === 'Unstake' && withdrawals.length > 0 && <small>{withdrawals.length}</small>}</button>)}</div>
    <div id="sk-action-panel" role="tabpanel" aria-labelledby={`sk-tab-${activeTab}`}>
      {activeTab === 'stake' && <>
        <AmountField id="sk-stake-amount" label="Amount to stake" value={stakeAmount} onChange={onStakeAmountChange} available={connected ? balance?.value : undefined} reserve={GAS_RESERVE_WEI} error={stakeError} disabled={isPending} />
        <dl className="sk-action-details"><div><dt>Activation</dt><dd>{targetEpoch == null ? 'Next eligible epoch' : `Epoch ${targetEpoch}`}</dd></div><div><dt>Rewards</dt><dd>Claim or compound manually</dd></div></dl>
        {connected && <button className="sk-btn sk-btn-primary sk-btn-block" type="button" disabled={!actionAllowed || !validator.hasChainData || balance?.value == null || !parseStakingAmount(stakeAmount) || Boolean(stakeError)} onClick={onDelegate}>{isPending ? <Loader2 size={16} className="sk-spin" /> : <ArrowUpRight size={16} />}Stake MON</button>}
      </>}
      {activeTab === 'rewards' && <>
        <div className="sk-reward-total"><span>Unclaimed rewards</span><strong>{connected && position ? formatMonFromWei(position.unclaimedRewards, { compact: false, digits: 6 }) : '—'}<small>MON</small></strong></div>
        <p className="sk-note">Claim sends rewards to your wallet. Compound adds them to this validator’s stake at the next eligible epoch.</p>
        {connected && <div className="sk-dual-buttons"><button className="sk-btn sk-btn-primary" type="button" disabled={!actionAllowed || !hasRewards || loading} onClick={onClaim}>Claim rewards</button><button className="sk-btn" type="button" disabled={!actionAllowed || !hasRewards || loading} onClick={onCompound}>Compound</button></div>}
      </>}
      {activeTab === 'unstake' && <>
        <AmountField id="sk-unstake-amount" label="Amount to unstake" value={unstakeAmount} onChange={onUnstakeAmountChange} available={connected ? position?.stake : undefined} error={unstakeError} disabled={isPending} />
        {connected && <button className="sk-btn sk-btn-primary sk-btn-block" type="button" disabled={!actionAllowed || !hasStake || !withdrawalsReady || nextSlot == null || !parseStakingAmount(unstakeAmount) || Boolean(unstakeError)} onClick={onUndelegate}>{isPending && <Loader2 size={16} className="sk-spin" />}Request unstake</button>}
        {connected && withdrawalsReady && nextSlot == null && <p className="sk-warning">All withdrawal slots are in use. Complete an available withdrawal first.</p>}
        <p className="sk-note">Unstaking and withdrawing are separate transactions. Funds unlock one epoch after the withdrawal request’s recorded epoch.</p>
        {connected && withdrawals.length > 0 && <div className="sk-withdrawals"><h3>Withdrawal requests</h3>{withdrawals.map(w => { const unlock = Number(w.epoch) + 1; const ready = epochInfo.isFresh && Number.isFinite(epochInfo.epoch) && epochInfo.epoch >= unlock; return <div key={w.id}><span><strong>{formatMonFromWei(w.amount, { compact: false, digits: 4 })} MON</strong><small>#{w.id} · {ready ? 'Available to withdraw' : `Unlocks at epoch ${unlock}`}</small></span><button type="button" className="sk-btn" disabled={!actionAllowed || !ready} onClick={() => onWithdraw(w.id)}>{ready ? 'Withdraw' : <><Clock3 size={13} />Pending</>}</button></div> })}</div>}
      </>}
      {!connected && <div className="sk-connect-prompt"><button className="sk-btn sk-btn-primary sk-btn-block" type="button" onClick={needsChain ? onSwitchChain : onConnect}><Wallet size={16} />{needsChain ? 'Switch to Monad' : 'Connect wallet to continue'}</button><p>Your wallet confirms every transaction.</p></div>}
      {connected && loading && <p className="sk-note" role="status">Reading your position…</p>}
      {connected && error && <p className="sk-warning" role="alert">{error}<button type="button" className="sk-text-link" onClick={positionData.refresh}>Retry position</button></p>}
      {connected && position && <div className="sk-position-strip"><span><CircleDot size={12} />{formatMonFromWei(position.stake)} MON active</span>{pending > 0n && <span>{formatMonFromWei(pending)} MON pending</span>}</div>}
      {statusInfo && <div className={`sk-transaction-status is-${statusInfo.kind}`} role={statusInfo.kind === 'error' ? 'alert' : 'status'}><p>{statusInfo.text}</p>{transaction?.phase === 'unconfirmed' && <button className="sk-btn" type="button" onClick={onCheckReceipt}>Check transaction</button>}{txUrl(statusInfo.hash) && <a href={txUrl(statusInfo.hash)} target="_blank" rel="noreferrer">View transaction <ExternalLink size={13} /></a>}</div>}
    </div>
    <a className="sk-action-docs" href={DOCS} target="_blank" rel="noreferrer">How native staking works <ArrowUpRight size={14} /></a>
  </section>
}
