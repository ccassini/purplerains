import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAccount, useBalance, useConnect, useDisconnect, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi'
import { monad } from '../wallet/wagmiConfig'
import StakingHeader from './staking/StakingHeader'
import ValidatorList from './staking/ValidatorList'
import StakePanel from './staking/StakePanel'
import PortfolioPanel from './staking/PortfolioPanel'
import StakingCalculator from './StakingCalculatorPage'
import { useStakingNetwork } from './staking/useStakingNetwork'
import { useDelegatorPosition } from './staking/useDelegatorPosition'
import { usePortfolio } from './staking/usePortfolio'
import { useStakingActions, txUrl } from './staking/useStakingActions'
import { getLocalLogoPath, getValidatorById } from '../utils/validatorApi'
import './StakingPage.css'

function WalletPicker({ connectors, pending, error, onSelect, onClose }) {
  const dialog = useRef(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="sk-wallet-dialog" onCancel={onClose} aria-labelledby="sk-wallet-title"><div className="sk-section-heading"><h2 id="sk-wallet-title">Connect your wallet</h2><button type="button" className="sk-icon-button" onClick={onClose} aria-label="Close wallet picker" autoFocus><X size={18} /></button></div><p>Choose an available browser wallet to continue on Monad.</p><div className="sk-wallet-options">{connectors.map(connector => <button type="button" className="sk-btn" key={connector.uid} disabled={pending} onClick={() => onSelect(connector)}>{connector.name === 'Injected' ? 'Browser wallet' : connector.name}<ArrowUpRight size={16} /></button>)}</div>{!connectors.length && <p>No browser wallet detected. Open this page in a browser with your wallet installed.</p>}{error && <p className="sk-warning" role="alert">{error.shortMessage || error.message}</p>}</dialog>
}

export default function StakingPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { address, isConnected, chainId } = useAccount()
  const { connect, connectors, isPending: isConnecting, error: connectionError, reset: resetConnection } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: monad.id })
  const { sendTransactionAsync, isPending: isSending } = useSendTransaction()
  const [walletOpen, setWalletOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [activeTab, setActiveTab] = useState('stake')
  const [stakeAmount, setStakeAmount] = useState('')
  const [unstakeAmount, setUnstakeAmount] = useState('')
  const actionPanel = useRef(null)
  const needsChain = isConnected && chainId !== monad.id
  const onMonad = isConnected && !needsChain
  const network = useStakingNetwork(publicClient)
  const { data: balance, refetch: refreshBalance } = useBalance({ address, chainId: monad.id, query: { enabled: Boolean(onMonad && address) } })
  const positionData = useDelegatorPosition({ publicClient, address, validatorId: selectedId, enabled: onMonad })
  const portfolio = usePortfolio({ publicClient, address, validators: network.validators, enabled: onMonad })
  const refreshPosition = positionData.refresh
  const refreshPortfolio = portfolio.refresh
  const refreshEpoch = network.refreshEpoch
  const refreshAll = useCallback(() => { refreshPosition(); refreshPortfolio(); refreshBalance(); refreshEpoch?.() }, [refreshBalance, refreshPortfolio, refreshPosition, refreshEpoch])
  const canAct = Boolean(onMonad && !isConnecting && !isSending && !isSwitching && selectedId != null)
  const actions = useStakingActions({ sendTransactionAsync, publicClient, address, chainId, balanceWei: balance?.value, position: positionData.position, withdrawals: positionData.withdrawals, epochInfo: network.epochInfo, withdrawalsReady: positionData.withdrawalsReady, validatorId: selectedId, canAct, onSettled: refreshAll })
  const isPending = Boolean(isSending || actions.isPending)
  const selected = useMemo(() => {
    const known = network.validators.find(v => v.id === selectedId)
    if (known) return known
    if (!portfolio.rows.some(row => row.validatorId === selectedId)) return null
    return { id: selectedId, name: getValidatorById(selectedId)?.name || `Validator #${selectedId}`, logo: getLocalLogoPath(selectedId), hasChainData: false, isActive: false, totalStakeWei: null, commissionBps: null }
  }, [network.validators, portfolio.rows, selectedId])
  const openWallet = () => { resetConnection(); setWalletOpen(true) }
  const selectValidator = (id, scrollToAction = false) => {
    if (isPending) return
    setSelectedId(id); setActiveTab('stake'); setStakeAmount(''); setUnstakeAmount(''); actions.clearStatus()
    if (scrollToAction || window.matchMedia('(max-width: 1050px)').matches) actionPanel.current?.scrollIntoView({ behavior: 'instant', block: 'start' })
  }
  useEffect(() => { if (isConnected) setWalletOpen(false) }, [isConnected])
  useEffect(() => { setStakeAmount(''); setUnstakeAmount('') }, [address, chainId])
  useEffect(() => {
    const id = location.hash.slice(1)
    if (!['validators', 'calculator', 'portfolio'].includes(id)) return undefined
    const frame = window.requestAnimationFrame(() => {
      const section = document.getElementById(id)
      section?.scrollIntoView({ behavior: 'instant', block: 'start' })
      section?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.hash, location.key, network.loading])
  const scrollToSection = (id) => (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    const hash = `#${id}`
    if (location.hash !== hash) navigate({ pathname: location.pathname, search: location.search, hash })
    else {
      const section = document.getElementById(id)
      section?.scrollIntoView({ behavior: 'instant', block: 'start' })
      section?.focus({ preventScroll: true })
    }
  }

  return <div className="staking-page"><div className="sk-shell">
    <StakingHeader network={network} address={address} balance={balance} isConnected={isConnected} needsChain={needsChain} isBusy={isPending || isConnecting || isSwitching} onConnect={openWallet} onDisconnect={disconnect} onSwitchChain={() => switchChain({ chainId: monad.id })} activeSection={location.hash.slice(1) || 'validators'} onSectionClick={scrollToSection} />
    {network.dataError && <div className="sk-banner" role="alert"><span>{network.dataError}</span><button className="sk-text-link" type="button" onClick={network.refresh}>Retry</button></div>}
    {switchError && <p className="sk-warning" role="alert">{switchError.shortMessage || switchError.message}</p>}
    {actions.transaction?.isPending && !actions.statusInfo && <div className="sk-banner" role="status"><div><strong>Transaction in progress · validator #{actions.transaction.validatorId}</strong><p>Submitted from {actions.transaction.address?.slice(0, 6)}…{actions.transaction.address?.slice(-4)}. {actions.transaction.text}</p>{txUrl(actions.transaction.hash) && <a className="sk-text-link" href={txUrl(actions.transaction.hash)} target="_blank" rel="noreferrer">View transaction</a>}</div>{actions.transaction.phase === 'unconfirmed' && <button className="sk-btn" type="button" onClick={actions.checkReceipt}>Check transaction</button>}</div>}
    <div className="sk-workspace sk-anchor" id="validators" tabIndex={-1}>
      <ValidatorList validators={network.validators} loading={network.loading || network.updating} error={network.dataError} lastUpdated={network.lastUpdated} sourceUpdatedAt={network.sourceUpdatedAt} onRefresh={network.refresh} selectedId={selectedId} onSelect={selectValidator} disabled={isPending} />
      <div className="sk-action-rail" ref={actionPanel}><StakePanel validator={selected} positionData={positionData} epochInfo={network.epochInfo} balance={balance} isConnected={isConnected} needsChain={needsChain} canAct={canAct} isPending={isPending} activeTab={activeTab} onTabChange={setActiveTab} stakeAmount={stakeAmount} onStakeAmountChange={setStakeAmount} unstakeAmount={unstakeAmount} onUnstakeAmountChange={setUnstakeAmount} statusInfo={actions.statusInfo} transaction={actions.transaction} onCheckReceipt={actions.checkReceipt} onDelegate={async () => { if (await actions.delegate(stakeAmount)) setStakeAmount('') }} onUndelegate={async () => { if (await actions.undelegate(unstakeAmount, positionData.nextSlot)) setUnstakeAmount('') }} onWithdraw={actions.withdraw} onClaim={actions.claim} onCompound={actions.compound} onConnect={openWallet} onSwitchChain={() => switchChain({ chainId: monad.id })} onCalculatorClick={scrollToSection('calculator')} /></div>
    </div>
    <StakingCalculator network={network} selectedValidator={selected} stakeAmount={stakeAmount} onExploreValidators={scrollToSection('validators')} />
    <div id="portfolio" className="sk-anchor" tabIndex={-1}><PortfolioPanel needsChain={needsChain} isConnected={onMonad} rows={portfolio.rows} totals={portfolio.totals} state={portfolio.state} onRefresh={portfolio.refresh} onSelect={id => selectValidator(id, true)} onConnect={needsChain ? () => switchChain({ chainId: monad.id }) : openWallet} /></div>
    <section className="sk-lifecycle" aria-labelledby="sk-lifecycle-title"><div className="sk-section-heading"><h2 id="sk-lifecycle-title">Know the staking cycle.</h2><a className="sk-text-link" href="https://docs.monad.xyz/reference/staking/overview" target="_blank" rel="noreferrer">Monad documentation <ArrowUpRight size={15} /></a></div><ol><li><span>01</span><h3>Delegate</h3><p>Choose a validator and confirm the amount in your wallet.</p></li><li><span>02</span><h3>Activate</h3><p>Stake starts in epoch n + 1, or n + 2 if the boundary has passed.</p></li><li><span>03</span><h3>Earn & manage</h3><p>Rewards accrue when your validator produces blocks. Claim or compound manually.</p></li><li><span>04</span><h3>Unstake & withdraw</h3><p>Request unstaking, wait for the on-chain unlock epoch, then withdraw.</p></li></ol></section>
    <footer className="sk-footer"><span>Native MON staking · Monad mainnet</span><span>Estimates vary with active stake, commission and validator performance.</span></footer>
  </div>{walletOpen && <WalletPicker connectors={connectors} pending={isConnecting} error={connectionError} onSelect={connector => connect({ connector })} onClose={() => setWalletOpen(false)} />}</div>
}
