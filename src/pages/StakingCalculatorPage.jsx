import { useEffect, useId, useMemo, useState } from 'react'
import { ArrowUpRight, ArrowRight, Check, Info, RefreshCw } from 'lucide-react'
import { ASSUMED_BLOCK_TIME_MS, STAKING_REWARD_MON } from '../utils/stakingApi'
import { projectStakingScenario, STAKING_PROJECTION_LIMITS } from './staking/stakingProjection'
import { calculatorCommission, calculatorNetworkSnapshot, calculatorStakeAmount } from './staking/stakingCalculatorState'
import './StakingCalculatorPage.css'

const STAKING_DOCS = 'https://docs.monad.xyz/monad-arch/consensus/staking'
const TIMING_DOCS = 'https://docs.monad.xyz/reference/staking/overview'
const DEFAULTS = { amount: '10000', days: '365', grossApr: '5', commission: '10', reinvest: 'none' }
const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const preciseFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 })
const compactFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 })

function mon(value, compact = false) {
  if (!Number.isFinite(value)) return '—'
  if (value > 0 && value < 0.000001) return value.toExponential(2)
  if (value >= 1e15) return value.toExponential(2)
  if (compact && value >= 1e6) return compactFormat.format(value)
  return value > 0 && value < 1 ? preciseFormat.format(value) : numberFormat.format(value)
}

function NumberField({ id, label, value, onChange, suffix, hint, error, min = 0, max, step = 'any', readOnly = false }) {
  return (
    <div className="sc-field">
      <label htmlFor={id}>{label}</label>
      <div className={`sc-input-wrap${error ? ' sc-input-wrap--invalid' : ''}${readOnly ? ' sc-input-wrap--readonly' : ''}`}>
        <input id={id} type="number" inputMode="decimal" value={value} onChange={onChange}
          min={min} max={max} step={step} readOnly={readOnly}
          aria-invalid={error ? 'true' : undefined} aria-describedby={`${id}-help`} />
        <span aria-hidden="true">{suffix}</span>
      </div>
      <p id={`${id}-help`} className={error ? 'sc-field-error' : 'sc-field-hint'}>{error || hint}</p>
    </div>
  )
}

function RewardsChart({ projection }) {
  const chartId = useId().replace(/:/g, '')
  const left = 63
  const right = 636
  const top = 20
  const bottom = 185
  const maximum = Math.max(projection.rewards, projection.withoutReinvestment, 0.000001) * 1.12
  const x = (day) => left + day / projection.days * (right - left)
  const y = (value) => bottom - value / maximum * (bottom - top)
  const pathFor = (field) => projection.points.map((point, index) => `${index ? 'L' : 'M'}${x(point.day).toFixed(2)},${y(point[field]).toFixed(2)}`).join(' ')
  const path = pathFor('rewards')
  const hasGrowth = projection.rewards > 0
  const ticks = [0, 0.5, 1]

  return (
    <figure className="sc-chart">
      <div className="sc-chart-heading"><h3>Rewards over time</h3><span>MON</span></div>
      <svg viewBox="0 0 660 220" role="img" aria-labelledby={`${chartId}-title ${chartId}-description`}>
        <title id={`${chartId}-title`}>{`Estimated staking rewards over ${projection.days} days`}</title>
        <desc id={`${chartId}-description`}>
          Rewards start at zero and reach {mon(projection.rewards)} MON after {projection.days} days.
          {projection.reinvest === 'monthly' ? ` Without reinvestment, the same stake would earn ${mon(projection.withoutReinvestment)} MON.` : ' Rewards are held separately from the original stake.'}
          {hasGrowth ? '' : ' The selected inputs produce no rewards.'}
        </desc>
        {ticks.map((tick) => {
          const value = hasGrowth ? maximum * tick : tick
          const axisY = bottom - tick * (bottom - top)
          return <g key={tick} aria-hidden="true"><line x1={left} x2={right} y1={axisY} y2={axisY} className="sc-chart-grid" /><text x={left - 12} y={axisY + 4} textAnchor="end">{hasGrowth ? mon(value, true) : tick === 0 ? '0' : ''}</text></g>
        })}
        <path d={`${path} L${right},${bottom} L${left},${bottom} Z`} className="sc-chart-area" aria-hidden="true" />
        {projection.reinvest === 'monthly' && <path d={pathFor('simpleRewards')} className="sc-chart-baseline" aria-hidden="true" />}
        <path d={path} className="sc-chart-line" aria-hidden="true" />
        <circle cx={right} cy={y(projection.rewards)} r="4" className="sc-chart-end" aria-hidden="true" />
        <g aria-hidden="true"><text x={left} y="211">Day 0</text><text x={(left + right) / 2} y="211" textAnchor="middle">Day {Math.round(projection.days / 2)}</text><text x={right} y="211" textAnchor="end">Day {projection.days}</text></g>
      </svg>
      <figcaption>
        <span><i className="sc-legend-line" />{projection.reinvest === 'monthly' ? 'Monthly reinvestment' : 'Rewards kept separate'}</span>
        {projection.reinvest === 'monthly' && <span><i className="sc-legend-line sc-legend-line--baseline" />Without reinvestment</span>}
      </figcaption>
    </figure>
  )
}

export default function StakingCalculator({ network: sharedNetwork, selectedValidator, stakeAmount = '', onExploreValidators }) {
  const network = calculatorNetworkSnapshot(sharedNetwork)
  const [inputs, setInputs] = useState(DEFAULTS)
  const [rateMode, setRateMode] = useState(() => network.status === 'unavailable' ? 'manual' : 'network')
  const [commissionSource, setCommissionSource] = useState(null)
  const [appliedNote, setAppliedNote] = useState('')
  const availableCommission = calculatorCommission(selectedValidator)
  const availableAmount = calculatorStakeAmount(stakeAmount)
  const hasNetworkRate = network.status === 'ready' || network.status === 'stale'

  useEffect(() => {
    if (network.status === 'unavailable') setRateMode('manual')
  }, [network.status])

  const grossApr = rateMode === 'network' ? network.grossApr : inputs.grossApr
  const projection = useMemo(() => projectStakingScenario({ ...inputs, grossApr }), [inputs, grossApr])
  const waitingForNetwork = rateMode === 'network' && network.status === 'loading'
  const errors = projection.errors
  const setValue = (key, value) => {
    setInputs((current) => ({ ...current, [key]: String(value) }))
    if (key === 'commission') setCommissionSource(null)
    setAppliedNote('')
  }
  const update = (key) => (event) => setValue(key, event.target.value)
  const reinvesting = inputs.reinvest === 'monthly'
  const rateValue = rateMode === 'network' ? (network.grossApr === null ? '' : String(Number(network.grossApr.toFixed(4)))) : inputs.grossApr
  const reset = () => { setInputs(DEFAULTS); setRateMode(hasNetworkRate ? 'network' : 'manual'); setCommissionSource(null); setAppliedNote('') }
  const applyCommission = () => {
    if (availableCommission === null) return
    setValue('commission', availableCommission)
    setCommissionSource(selectedValidator.name)
    setAppliedNote(`Using ${selectedValidator.name}’s ${availableCommission}% commission. You can still edit this assumption.`)
  }
  const applyAmount = () => {
    if (availableAmount === null) return
    setValue('amount', availableAmount)
    setAppliedNote('Your entered staking amount is now used in this calculation.')
  }

  return (
    <section id="calculator" className="sc-calculator sk-anchor" aria-labelledby="sc-calculator-title" tabIndex={-1}>
          <header className="sc-header">
            <div><p className="sc-eyebrow">PLAN YOUR REWARDS</p><h2 id="sc-calculator-title">Staking calculator<span>.</span></h2><p className="sc-intro">Explore what your MON could earn. No wallet connection required.</p></div>
            <div className="sc-header-note"><span className="sc-small-mark" aria-hidden="true">↗</span><span>Plan in MON.<br />Understand every assumption.</span></div>
          </header>

          <div className="sc-linked-inputs" aria-label="Use your staking choices">
            <div><span className="sc-linked-label">Bring your choices into the estimate</span><p>{selectedValidator ? <>Selected: <strong>{selectedValidator.name}</strong></> : 'Select a validator above to use its commission.'}</p></div>
            <div className="sc-linked-actions"><button type="button" onClick={applyCommission} disabled={availableCommission === null}>Use validator commission{availableCommission !== null && <strong>{availableCommission}%</strong>}</button><button type="button" onClick={applyAmount} disabled={availableAmount === null}>Use stake amount{availableAmount !== null && <strong>{mon(Number(availableAmount), true)} MON</strong>}</button></div>
          </div>
          <p className="sc-applied-note" role="status">{appliedNote || 'Apply your selected validator and stake amount to this scenario.'}</p>
          {selectedValidator?.hasChainData && !selectedValidator.isActive && <p className="sc-source-unavailable">The selected validator is outside the active set. This scenario assumes active participation; actual rewards depend on producing blocks.</p>}

          <div className="sc-workspace">
            <form className="sc-controls" onSubmit={(event) => event.preventDefault()} aria-labelledby="sc-inputs-title" noValidate>
              <div className="sc-section-heading"><h3 id="sc-inputs-title"><span>01</span> Your scenario</h3><button type="button" className="sc-reset" onClick={reset}>Reset</button></div>
              <NumberField id="sc-amount" label="Amount to stake" value={inputs.amount} onChange={update('amount')} suffix="MON" max={STAKING_PROJECTION_LIMITS.amount} hint="Your starting active stake." error={errors.amount} />
              <div className="sc-presets" aria-label="Stake amount presets">{[1000, 10000, 100000].map((amount) => <button type="button" key={amount} aria-pressed={Number(inputs.amount) === amount} onClick={() => setValue('amount', amount)}>{amount / 1000}K MON</button>)}</div>

              <div className="sc-control-divider" />
              <NumberField id="sc-days" label="Staking duration" value={inputs.days} onChange={update('days')} suffix="days" min={1} max={STAKING_PROJECTION_LIMITS.days} step={1} hint="Counted from when your stake becomes active." error={errors.days} />
              <div className="sc-presets" aria-label="Duration presets">{[30, 90, 180, 365].map((days) => <button type="button" key={days} aria-pressed={Number(inputs.days) === days} onClick={() => setValue('days', days)}>{days === 365 ? '1 year' : `${days} days`}</button>)}</div>

              <div className="sc-control-divider" />
              <div className="sc-rate-source" aria-label="APR source">
                <button type="button" aria-pressed={rateMode === 'network'} disabled={!hasNetworkRate} onClick={() => setRateMode('network')}>Network estimate</button>
                <button type="button" aria-pressed={rateMode === 'manual'} onClick={() => setRateMode('manual')}>Manual assumption</button>
              </div>
              <NumberField id="sc-apr" label="Gross annual APR" value={rateValue} onChange={update('grossApr')} suffix="%" max={STAKING_PROJECTION_LIMITS.grossApr} readOnly={rateMode === 'network'} hint={waitingForNetwork ? 'Fetching the current active stake…' : rateMode === 'network' ? 'Estimated inflation rewards, before commission.' : 'An illustrative assumption, not a quoted return.'} error={waitingForNetwork ? undefined : errors.grossApr} />
              {['unavailable', 'stale'].includes(network.status) && <p className="sc-source-unavailable">{network.status === 'stale' ? 'Refresh unavailable. The last verified network estimate is shown.' : 'Network estimate unavailable. Enter your own APR.'}{network.refresh && <button type="button" disabled={network.updating} onClick={network.refresh}><RefreshCw size={12} aria-hidden="true" />{network.updating ? 'Refreshing…' : 'Retry'}</button>}</p>}
              <NumberField id="sc-commission" label="Validator commission" value={inputs.commission} onChange={update('commission')} suffix="%" max={100} hint={commissionSource ? `Copied from ${commissionSource}. Editable for this scenario.` : 'The validator’s share of inflation rewards. Assumed here.'} error={errors.commission} />
              <div className="sc-reinvest">
                <label className="sc-switch-label" htmlFor="sc-reinvest"><span><strong>Reinvest monthly</strong><small>Optional compounding scenario</small></span><span className="sc-switch"><input id="sc-reinvest" type="checkbox" checked={reinvesting} onChange={(event) => setValue('reinvest', event.target.checked ? 'monthly' : 'none')} /><span aria-hidden="true" /></span></label>
                <p>{reinvesting ? 'Assumes reinvestment every 365/12 days, with no activation delay or fees. Monad requires an explicit compound action.' : 'Rewards stay separate from your stake. No automatic compounding is assumed.'}</p>
              </div>
            </form>

            <section className="sc-results" aria-labelledby="sc-results-title">
              <div className="sc-section-heading"><h3 id="sc-results-title"><span>02</span> Estimated outcome</h3><span className="sc-scenario-tag">{reinvesting ? 'REINVESTMENT SCENARIO' : 'SIMPLE INTEREST'}</span></div>
              {projection.valid ? <>
                <div className="sc-outcome" aria-live="polite" aria-atomic="true">
                  <p>Rewards after <strong>{projection.days.toLocaleString('en-US')} days</strong></p>
                  <div className="sc-outcome-value"><span>+{mon(projection.rewards, true)}</span><small>MON</small></div>
                  <div className="sc-outcome-detail"><span>Starting stake <strong>{mon(projection.amount, true)} MON</strong></span><span>Stake + rewards <strong>{mon(projection.total, true)} MON</strong></span></div>
                </div>
                <div className="sc-yield-row"><div><span>Net APR</span><strong>{mon(projection.netApr)}<small>%</small></strong><p>After {mon(projection.commission)}% commission</p></div><div><span>{reinvesting ? 'Scenario APY' : 'Annual yield'}</span><strong>{mon(projection.annualYieldPercent)}<small>%</small></strong><p>{reinvesting ? 'With monthly reinvestment' : 'Without compounding'}</p></div><div><span>{reinvesting ? 'Reinvestment benefit' : 'Reward treatment'}</span>{reinvesting ? <><strong className="sc-yield-mono">+{mon(projection.reinvestmentGain, true)}<small> MON</small></strong><p>Over your selected duration</p></> : <><strong className="sc-yield-word">Held separately</strong><p>Your active stake stays the same</p></>}</div></div>
                <RewardsChart projection={projection} />
                <div className="sc-periods" aria-label="Reward estimates from your starting stake">
                  {[['Daily', '1 day', projection.periods.day], ['Monthly', '30 days', projection.periods.month], ['Annual', '365 days', projection.periods.year]].map(([label, days, value]) => <div key={label}><p>{label} <span>{days}</span></p><strong>{mon(value, true)} <small>MON</small></strong></div>)}
                </div>
                <p className="sc-projection-note"><Info size={14} aria-hidden="true" />Each period uses your starting stake and selected reward treatment. Estimates exclude gas, activation delays, and changes in network conditions.</p>
                <a href="#validators" className="sc-stake-link" onClick={onExploreValidators}>Explore validators <ArrowRight size={17} aria-hidden="true" /></a>
              </> : <div className="sc-empty-result" role="status"><span aria-hidden="true">—</span><h3>{waitingForNetwork ? 'Preparing your estimate' : 'Let’s check those inputs'}</h3><p>{waitingForNetwork ? 'Fetching the network estimate. You can also choose a manual APR to explore a scenario.' : errors.projection || 'Enter valid values in the highlighted fields to see your projection.'}</p></div>}
            </section>
          </div>

          <section className="sc-method" aria-labelledby="sc-method-title">
            <div className="sc-method-intro"><p className="sc-eyebrow">BEHIND THE ESTIMATE</p><h3 id="sc-method-title">The math, made clear.</h3><p>APR is the simple annual rate. APY includes reinvested rewards. This calculator keeps that distinction visible.</p><a href={STAKING_DOCS} target="_blank" rel="noopener noreferrer">Read Monad’s staking docs <ArrowUpRight size={15} aria-hidden="true" /></a></div>
            <div className="sc-method-detail">
              <div className="sc-formula"><span>NET ANNUAL RATE</span><code>Gross APR × (1 − commission ÷ 100)</code></div>
              <div className="sc-formula"><span>{reinvesting ? 'MONTHLY REINVESTMENT SCENARIO' : 'SIMPLE REWARDS'}</span><code>{reinvesting ? 'P × [(1 + r/12)ᵐ × (1 + r × d/365) − 1]' : 'Stake × (net APR ÷ 100) × days ÷ 365'}</code>{reinvesting && <p>P = starting stake; r = net APR ÷ 100; m = completed 365/12-day periods; d = remaining days.</p>}</div>
              <ul className="sc-assumptions">
                <li><Check size={14} aria-hidden="true" /><span>{rateMode === 'network' && hasNetworkRate ? <>{network.status === 'stale' ? 'Last verified network estimate' : 'Network estimate'}: {STAKING_REWARD_MON} MON per block, an assumed {ASSUMED_BLOCK_TIME_MS}ms block time, and {mon(network.activeStaked, true)} MON in active stake. {network.fetchedAt ? <>Data fetched at {new Date(network.fetchedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} from gmonads{network.sourceUpdatedAt ? ` (provider snapshot ${new Date(network.sourceUpdatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })})` : ''}. </> : null}This is an annualized estimate, not a guaranteed rate.</> : <>Manual APR and commission are scenario inputs. They are not a live validator quote.</>}</span></li>
                <li><Check size={14} aria-hidden="true" /><span>Commission applies to inflation rewards. Priority fees and any separately shared external rewards are excluded.</span></li>
                <li><Check size={14} aria-hidden="true" /><span>Projections begin after stake activation. Delegations and compounded rewards activate in a later epoch; <a href={TIMING_DOCS} target="_blank" rel="noopener noreferrer">timing depends on the epoch boundary</a>.</span></li>
                <li><Check size={14} aria-hidden="true" /><span>The model holds the APR, commission, and validator participation constant. Actual rewards vary with block production, active stake, and validator performance.</span></li>
              </ul>
            </div>
          </section>
    </section>
  )
}
