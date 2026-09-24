import { Link } from 'react-router-dom'
import { ArrowUpRight, Wallet } from 'lucide-react'
import { formatStakedMON } from '../../utils/stakingApi'

export default function StakingHeader({ network, address, balance, isConnected, needsChain, isBusy, onConnect, onDisconnect, onSwitchChain, activeSection, onSectionClick }) {
  const apr = network.networkStats.grossApr
  return <>
    <nav className="sk-nav" aria-label="Staking tools">
      <a href="#validators" aria-current={activeSection === 'validators' ? 'location' : undefined} onClick={onSectionClick?.('validators')}>Validators</a>
      <a href="#calculator" aria-current={activeSection === 'calculator' ? 'location' : undefined} onClick={onSectionClick?.('calculator')}>Calculator</a>
      <a href="#portfolio" aria-current={activeSection === 'portfolio' ? 'location' : undefined} onClick={onSectionClick?.('portfolio')}>Portfolio</a>
      <Link to="/validator-requirements">Validator hardware <ArrowUpRight size={13} /></Link>
    </nav>
    <header className="sk-hero">
      <div>
        <p className="sk-eyebrow"><span className="sk-status-dot" /> MONAD MAINNET / NATIVE STAKING</p>
        <h1>Put your MON to work.</h1>
        <p className="sk-lede">Choose a validator. Estimate your rewards. Manage your stake.</p>
      </div>
      <div className="sk-wallet">
        {isConnected ? <>
          <span className="sk-wallet-address">{address?.slice(0, 6)}…{address?.slice(-4)}</span>
          <span className="sk-muted">{needsChain ? 'Switch to Monad to continue' : balance ? `${Number(balance.formatted).toLocaleString(undefined, { maximumFractionDigits: 4 })} MON available` : 'Reading balance…'}</span>
          <button className={`sk-btn ${needsChain ? 'sk-btn-primary' : ''}`} type="button" disabled={isBusy} onClick={needsChain ? onSwitchChain : onDisconnect}>{needsChain ? 'Switch to Monad' : 'Disconnect'}</button>
        </> : <button className="sk-btn sk-btn-primary" type="button" onClick={onConnect} disabled={isBusy}><Wallet size={16} />{isBusy ? 'Connecting…' : 'Connect wallet'}</button>}
      </div>
    </header>
    <section className="sk-metrics" aria-label="Network staking snapshot">
      <div><span>Total delegated</span><strong>{network.networkStats.totalStaked == null ? '—' : formatStakedMON(network.networkStats.totalStaked)}<small>MON</small></strong><p>Validator data snapshot</p></div>
      <div><span>Est. gross APR</span><strong className="sk-accent">{Number.isFinite(apr) ? `${apr.toFixed(2)}%` : '—'}</strong><p>18 MON/block · assumes 300 ms blocks</p></div>
      <div><span>Active validators</span><strong>{network.loadedCount ? network.activeCount : '—'}</strong><p>Current data provider set</p></div>
      <div><span>Current epoch</span><strong>{network.epochInfo.epoch ?? '—'}</strong><p>{network.epochInfo.isFresh && network.epochInfo.inEpochDelayPeriod === true ? 'Boundary passed · activation n + 2' : network.epochInfo.isFresh && network.epochInfo.inEpochDelayPeriod === false ? 'Activation in epoch n + 1' : 'Activation timing awaiting chain data'}</p></div>
    </section>
  </>
}
