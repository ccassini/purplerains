import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ExternalLink, Search, Wallet } from 'lucide-react'
import {
  useAccount,
  useBalance,
  useConnect,
  useDisconnect,
  useSendTransaction,
  useSwitchChain,
  usePublicClient,
} from 'wagmi'
import { parseEther } from 'viem'
import { monad } from '../wallet/wagmiConfig'
import { getAllValidators, getLocalLogoPath, getValidatorById, loadValidatorMetadata } from '../utils/validatorApi'
import { computeStakingStatsFromGmonadsRows, formatAPY, formatStakedMON } from '../utils/stakingApi'
import { fetchGmonadsValidatorsEpoch } from '../utils/gmonadsApi'
import {
  STAKING_PRECOMPILE_ADDRESS,
  decodeGetDelegatorResult,
  decodeGetWithdrawalRequestResult,
  encodeClaimRewardsCalldata,
  encodeCompoundCalldata,
  encodeDelegateCalldata,
  encodeGetDelegatorCalldata,
  encodeGetWithdrawalRequestCalldata,
  encodeUndelegateCalldata,
  encodeWithdrawCalldata,
} from '../utils/stakingPrecompile'
import { commissionBpsFromWad, formatApyFromBps, formatMonCompactFromWei } from '../utils/formatters'
import './StakingPage.css'

function shortAddr(addr) {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function formatMonFromWei(bi) {
  try {
    const x = typeof bi === 'bigint' ? bi : BigInt(bi ?? 0)
    const whole = x / 10n ** 18n
    const frac = (x % 10n ** 18n) / 10n ** 14n
    return `${whole}.${String(frac).padStart(4, '0')}`
  } catch {
    return '0.0000'
  }
}

async function ethCall(publicClient, data) {
  const res = await publicClient.call({ to: STAKING_PRECOMPILE_ADDRESS, data })
  // wagmi/viem returns { data } sometimes, or hex string
  return typeof res === 'string' ? res : res?.data
}

export default function StakingPage() {
  const { address, isConnected, chainId } = useAccount()
  const { connect, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: monad.id })
  const { sendTransactionAsync, isPending: isSending } = useSendTransaction()

  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [stakeAmount, setStakeAmount] = useState('100')
  const [status, setStatus] = useState(null)

  const [epochInfo, setEpochInfo] = useState({ epoch: null, inEpochDelayPeriod: null })
  const [myDelegator, setMyDelegator] = useState(null)
  const [myWithdrawal, setMyWithdrawal] = useState(null)
  const [pendingWithdrawals, setPendingWithdrawals] = useState([])
  const [undelegateSlot, setUndelegateSlot] = useState(0)
  const [withdrawSlot, setWithdrawSlot] = useState(0)
  const [networkStats, setNetworkStats] = useState({ totalStaked: null, apy: null, fromCache: false })

  const [sortKey, setSortKey] = useState('stake')
  const [chainStatsById, setChainStatsById] = useState(() => ({}))
  const [stakeLoad, setStakeLoad] = useState({ done: 0, total: 0 })
  const [dataError, setDataError] = useState(null)

  const needsChain = isConnected && chainId !== monad.id
  const { data: balanceData } = useBalance({
    address,
    chainId: monad.id,
    query: { enabled: Boolean(isConnected && address && !needsChain) },
  })

  const validators = useMemo(() => {
    const list = getAllValidators()
      .filter(v => v?.id && v?.name)
      .map(v => ({
        id: v.id,
        name: v.name,
        website: v.website || null,
        logo: getLocalLogoPath(v.id),
      }))
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter(v => v.name.toLowerCase().includes(q) || String(v.id).includes(q))
  }, [query])

  const selected = useMemo(() => (selectedId ? getValidatorById(selectedId) : null), [selectedId])
  const selectedChain = useMemo(() => (selectedId ? chainStatsById[selectedId] : null), [chainStatsById, selectedId])

  const baseApyBps = useMemo(() => {
    if (typeof networkStats?.apy !== 'number' || Number.isNaN(networkStats.apy)) return 0
    // percent -> bps
    return Math.max(0, Math.round(networkStats.apy * 100))
  }, [networkStats])

  const sortedValidators = useMemo(() => {
    const list = validators.slice()
    const cmpStake = (a, b) => {
      const sa = chainStatsById[a.id]?.totalStakeWei
      const sb = chainStatsById[b.id]?.totalStakeWei
      const aMissing = sa === undefined || sa === null
      const bMissing = sb === undefined || sb === null
      if (aMissing && bMissing) return 0
      if (aMissing) return 1
      if (bMissing) return -1
      if (sa === sb) return 0
      return sa > sb ? -1 : 1
    }
    const cmpApy = (a, b) => {
      const ca = commissionBpsFromWad(chainStatsById[a.id]?.commissionWad ?? 0n)
      const cb = commissionBpsFromWad(chainStatsById[b.id]?.commissionWad ?? 0n)
      const na = Math.round((baseApyBps * (10_000 - ca)) / 10_000)
      const nb = Math.round((baseApyBps * (10_000 - cb)) / 10_000)
      if (na === nb) return 0
      return na > nb ? -1 : 1
    }
    const cmpName = (a, b) => a.name.localeCompare(b.name)
    if (sortKey === 'apy') list.sort(cmpApy)
    else if (sortKey === 'name') list.sort(cmpName)
    else list.sort(cmpStake)
    return list
  }, [baseApyBps, chainStatsById, sortKey, validators])

  const refreshWithdrawalSlots = useCallback(async () => {
    if (!publicClient || !address || !selectedId) return
    try {
      const maxScan = 16
      const slots = Array.from({ length: maxScan }, (_, i) => i)
      const found = []

      // parallel-ish scanning with small batches to avoid rate limits
      for (let start = 0; start < slots.length; start += 4) {
        const batch = slots.slice(start, start + 4)
        const results = await Promise.all(batch.map(async (i) => {
          const wrHex = await ethCall(publicClient, encodeGetWithdrawalRequestCalldata(selectedId, address, i))
          if (!wrHex || wrHex === '0x') return null
          const decoded = decodeGetWithdrawalRequestResult(wrHex)
          if (!decoded?.amount || decoded.amount <= 0n) return { id: i, empty: true }
          return { id: i, ...decoded }
        }))
        for (const r of results) {
          if (!r) continue
          if (r.empty) continue
          found.push(r)
        }
      }

      const used = new Set(found.map((x) => x.id))
      const free = slots.find((i) => i !== 0 && !used.has(i)) ?? 1

      setPendingWithdrawals(found)
      setUndelegateSlot(free || 1)
      setWithdrawSlot(found.length ? found[0].id : 0)
    } catch {
      setPendingWithdrawals([])
      setUndelegateSlot(1)
      setWithdrawSlot(0)
    }
  }, [address, publicClient, selectedId])

  const refreshMyState = useCallback(async () => {
    if (!publicClient || !address || !selectedId) return
    try {
      const delHex = await ethCall(publicClient, encodeGetDelegatorCalldata(selectedId, address))
      if (delHex && delHex !== '0x') setMyDelegator(decodeGetDelegatorResult(delHex))
      else setMyDelegator(null)
    } catch {
      setMyDelegator(null)
    }
    try {
      const wId = Number(withdrawSlot)
      if (!Number.isFinite(wId)) return
      const wrHex = await ethCall(publicClient, encodeGetWithdrawalRequestCalldata(selectedId, address, wId))
      if (wrHex && wrHex !== '0x') setMyWithdrawal(decodeGetWithdrawalRequestResult(wrHex))
      else setMyWithdrawal(null)
    } catch {
      setMyWithdrawal(null)
    }
  }, [address, publicClient, selectedId, withdrawSlot])

  useEffect(() => {
    loadValidatorMetadata()
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const { data, meta } = await fetchGmonadsValidatorsEpoch('mainnet')
        if (cancelled) return

        let sumMon = 0n
        const next = {}
        const idSet = new Set()

        for (const row of data) {
          const id = Number(row?.val_index)
          if (!Number.isFinite(id)) continue
          idSet.add(id)
          try {
            const stakeMon = BigInt(row?.stake ?? '0')
            sumMon += stakeMon
            const totalStakeWei = stakeMon * 10n ** 18n

            // commission appears as bps (e.g. 500 = 5.00%)
            const commissionBps = BigInt(Number(row?.commission ?? 0))
            const commissionWad = commissionBps * 10n ** 14n

            next[id] = {
              totalStakeWei,
              commissionWad,
              setType: String(row?.validator_set_type || ''),
              flags: String(row?.flags || ''),
              authAddress: row?.auth_address || null,
            }
          } catch {
            // ignore row
          }
        }

        setChainStatsById((prev) => ({ ...prev, ...next }))
        setStakeLoad({ done: idSet.size, total: Array.isArray(data) ? data.length : 0 })

        const computed = computeStakingStatsFromGmonadsRows(data)
        setNetworkStats({ totalStaked: computed.totalStaked, apy: computed.apy, fromCache: false })

        const epoch = Number(data?.[0]?.epoch ?? NaN)
        if (Number.isFinite(epoch)) setEpochInfo({ epoch, inEpochDelayPeriod: null })
        setDataError(null)
      } catch (err) {
        if (!cancelled) setDataError('Failed to load validator data. Please try again later.')
      }
    }

    run()
    const id = window.setInterval(run, 60 * 60 * 1000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [])

  useEffect(() => {
    refreshMyState()
  }, [refreshMyState])

  useEffect(() => {
    refreshWithdrawalSlots()
  }, [refreshWithdrawalSlots])

  const onConnect = () => {
    // prefer injected (MetaMask/Rabby/etc)
    const injectedConnector = connectors?.[0]
    if (injectedConnector) connect({ connector: injectedConnector })
  }

  const onStake = async () => {
    if (!isConnected || needsChain || !selectedId) return
    setStatus(null)
    try {
      const value = parseEther(String(stakeAmount || '0'))
      const data = encodeDelegateCalldata(selectedId)
      setStatus('Sending delegation…')
      const hash = await sendTransactionAsync({ to: STAKING_PRECOMPILE_ADDRESS, data, value })
      setStatus(`Delegation sent: ${hash}`)
      setTimeout(refreshMyState, 2500)
    } catch (e) {
      setStatus(e?.shortMessage || e?.message || 'Failed to delegate')
    }
  }

  const onUndelegate = async () => {
    if (!isConnected || needsChain || !selectedId) return
    setStatus(null)
    try {
      const amtWei = parseEther(String(stakeAmount || '0'))
      const wId = Number(undelegateSlot || 0)
      const data = encodeUndelegateCalldata(selectedId, amtWei, wId)
      setStatus('Sending undelegation…')
      const hash = await sendTransactionAsync({ to: STAKING_PRECOMPILE_ADDRESS, data, value: 0n })
      setStatus(`Undelegation sent: ${hash}`)
      setTimeout(() => { refreshWithdrawalSlots(); refreshMyState() }, 2500)
    } catch (e) {
      setStatus(e?.shortMessage || e?.message || 'Failed to undelegate')
    }
  }

  const onWithdraw = async () => {
    if (!isConnected || needsChain || !selectedId) return
    setStatus(null)
    try {
      const wId = Number(withdrawSlot || 0)
      const data = encodeWithdrawCalldata(selectedId, wId)
      setStatus('Sending withdraw…')
      const hash = await sendTransactionAsync({ to: STAKING_PRECOMPILE_ADDRESS, data, value: 0n })
      setStatus(`Withdraw sent: ${hash}`)
      setTimeout(() => { refreshWithdrawalSlots(); refreshMyState() }, 2500)
    } catch (e) {
      setStatus(e?.shortMessage || e?.message || 'Failed to withdraw')
    }
  }

  const onClaim = async () => {
    if (!isConnected || needsChain || !selectedId) return
    setStatus(null)
    try {
      const data = encodeClaimRewardsCalldata(selectedId)
      setStatus('Claiming rewards…')
      const hash = await sendTransactionAsync({ to: STAKING_PRECOMPILE_ADDRESS, data, value: 0n })
      setStatus(`Claim sent: ${hash}`)
      setTimeout(refreshMyState, 2500)
    } catch (e) {
      setStatus(e?.shortMessage || e?.message || 'Failed to claim')
    }
  }

  const onCompound = async () => {
    if (!isConnected || needsChain || !selectedId) return
    setStatus(null)
    try {
      const data = encodeCompoundCalldata(selectedId)
      setStatus('Compounding rewards…')
      const hash = await sendTransactionAsync({ to: STAKING_PRECOMPILE_ADDRESS, data, value: 0n })
      setStatus(`Compound sent: ${hash}`)
      setTimeout(refreshMyState, 2500)
    } catch (e) {
      setStatus(e?.shortMessage || e?.message || 'Failed to compound')
    }
  }

  const isBusy = isConnecting || isSending || isSwitching

  const withdrawReady = useMemo(() => {
    if (!epochInfo?.epoch || !myWithdrawal?.epoch) return null
    // docs: WITHDRAWAL_DELAY = 1 epoch
    const needed = Number(myWithdrawal.epoch) + 1
    return { needed, ok: epochInfo.epoch >= needed }
  }, [epochInfo, myWithdrawal])

  return (
    <motion.div
      className="staking-page"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="staking-panel">
        <div className="staking-header">
          <div className="staking-title">
            <span className="staking-badge">Staking</span>
            <span className="staking-sub">Delegate MON to Monad validators</span>
          </div>
          <div className="staking-actions">
            <Link className="staking-link" to="/staking-calculator">Calculator</Link>
            <Link className="staking-link" to="/price">Price</Link>
            <Link className="staking-link" to="/">Home</Link>
          </div>
        </div>

        {dataError && (
          <div className="staking-error-banner" role="alert">
            <span>{dataError}</span>
            <button type="button" onClick={() => setDataError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
          </div>
        )}

        <div className="staking-top">
          <div className="staking-card">
            <div className="staking-card-title">Wallet</div>
            {!isConnected ? (
              <button className="staking-btn" type="button" onClick={onConnect} disabled={isBusy}>
                <Wallet size={16} />
                <span>Connect Wallet</span>
              </button>
            ) : (
              <div className="staking-wallet">
                <div className="staking-wallet-row">
                  <span className="muted">Address</span>
                  <span className="mono">{shortAddr(address)}</span>
                </div>
                <div className="staking-wallet-row">
                  <span className="muted">Network</span>
                  <span className="mono">{needsChain ? 'Wrong network' : 'Monad (143)'}</span>
                </div>
              <div className="staking-wallet-row">
                <span className="muted">Balance</span>
                <span className="mono">{balanceData ? `${balanceData.formatted.slice(0, 10)} ${balanceData.symbol}` : '—'}</span>
              </div>
                <div className="staking-wallet-actions">
                  {needsChain && (
                    <button
                      className="staking-btn secondary"
                      type="button"
                      onClick={() => switchChain({ chainId: monad.id })}
                      disabled={isBusy}
                    >
                      Switch to Monad
                    </button>
                  )}
                  <button className="staking-btn danger" type="button" onClick={() => disconnect()} disabled={isBusy}>
                    Disconnect
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="staking-card">
            <div className="staking-card-title">Network</div>
            <div className="staking-metrics">
              <div className="metric">
                <div className="metric-label">Total staked</div>
                <div className="metric-value mono">{formatStakedMON(networkStats.totalStaked)}</div>
              </div>
              <div className="metric">
                <div className="metric-label">Base APY</div>
                <div className="metric-value mono">{formatAPY(networkStats.apy)}</div>
              </div>
              <a
                className="metric-link"
                href="https://monadvision.com/address/0x0000000000000000000000000000000000001000"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={14} />
                Precompile stats
              </a>
            </div>
          </div>

          <div className="staking-card">
            <div className="staking-card-title">Epoch</div>
            <div className="staking-metrics">
              <div className="metric">
                <div className="metric-label">Current</div>
                <div className="metric-value mono">{epochInfo.epoch === null ? '—' : epochInfo.epoch}</div>
              </div>
              <div className="metric">
                <div className="metric-label">Boundary passed?</div>
                <div className="metric-value mono">
                  {epochInfo.inEpochDelayPeriod === null ? '—' : (epochInfo.inEpochDelayPeriod ? 'Yes' : 'No')}
                </div>
              </div>
              <a
                className="metric-link"
                href="https://docs.monad.xyz/developer-essentials/staking/staking-behavior"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={14} />
                Staking rules
              </a>
            </div>
          </div>
        </div>

        <div className="staking-body">
          <div className="staking-main-content">
            <div className="validators">
            <div className="validators-head">
              <div className="validators-title">Validators</div>
              <div className="validators-search">
                <Search size={14} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or id…"
                  inputMode="search"
                />
              </div>
            </div>

            <div className="validators-list">
              <div className="validators-toolbar">
                <div className="sort-pills">
                  <button
                    type="button"
                    className={`sort-pill ${sortKey === 'stake' ? 'active' : ''}`}
                    onClick={() => setSortKey('stake')}
                  >
                    Stake
                  </button>
                  <button
                    type="button"
                    className={`sort-pill ${sortKey === 'apy' ? 'active' : ''}`}
                    onClick={() => setSortKey('apy')}
                  >
                    APY
                  </button>
                  <button
                    type="button"
                    className={`sort-pill ${sortKey === 'name' ? 'active' : ''}`}
                    onClick={() => setSortKey('name')}
                  >
                    Name
                  </button>
                </div>
                <div className="validators-cols mono">
                  <span>STAKE</span>
                  <span>APY</span>
                  <span>FEE</span>
                </div>
              </div>
              <div className="validators-progress">
                <span className="muted">Stake data</span>
                <span className="mono">{stakeLoad.total ? `${stakeLoad.done}/${stakeLoad.total}` : '—'}</span>
              </div>

              {sortedValidators.slice(0, 220).map((v) => {
                const isSel = selectedId === v.id
                const cs = chainStatsById[v.id]
                const isActive = String(cs?.setType || '').toLowerCase() === 'active'
                const commissionBps = commissionBpsFromWad(cs?.commissionWad ?? 0n)
                const netApyBps = Math.round((baseApyBps * (10_000 - commissionBps)) / 10_000)
                return (
                  <button
                    key={v.id}
                    type="button"
                    className={`validator-row ${isSel ? 'active' : ''}`}
                    onClick={() => setSelectedId(v.id)}
                  >
                    <div className="validator-left">
                      <div className="validator-logo">
                        {v.logo ? <img src={v.logo} alt={v.name} /> : <span className="validator-fallback">{String(v.name || 'V').slice(0, 1)}</span>}
                      </div>
                      <div className="validator-meta">
                        <div className="validator-name">
                          {v.name}
                          {isActive && <span className="pill green">ACTIVE</span>}
                        </div>
                        <div className="validator-sub mono">
                          #{v.id}
                          {v.website ? <span className="validator-site mono">{v.website.replace(/^https?:\/\//, '')}</span> : <span className="validator-site mono muted">—</span>}
                        </div>
                      </div>
                    </div>
                    <div className="validator-right">
                      <div className="validator-metrics mono">
                        <span className="validator-metric">{cs ? formatMonCompactFromWei(cs.totalStakeWei) : '—'}</span>
                        <span className="validator-metric">{netApyBps ? formatApyFromBps(netApyBps) : '—'}</span>
                        <span className="validator-metric">{commissionBps ? formatApyFromBps(commissionBps) : '0.00%'}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="stake-panel">
            <div className="stake-head">
              <div className="stake-title">Stake</div>
              <div className="stake-sub">
                Precompile: <a href="https://monadvision.com/address/0x0000000000000000000000000000000000001000" target="_blank" rel="noreferrer" className="mono">
                  0x…1000
                </a>
              </div>
            </div>

            {!selected ? (
              <div className="stake-empty">Select a validator to begin.</div>
            ) : (
              <div className="stake-content">
                <div className="stake-selected">
                  <div className="stake-selected-title">{selected.name || `Validator #${selectedId}`}</div>
                  <div className="stake-selected-sub mono">
                    Validator ID: {selectedId}
                    {selectedChain && (
                      <>
                        {' '}• total {formatMonCompactFromWei(selectedChain.totalStakeWei)} MON
                        {' '}• fee {formatApyFromBps(commissionBpsFromWad(selectedChain.commissionWad))}
                        {baseApyBps ? (
                          <>
                            {' '}• est APY {formatApyFromBps(Math.round((baseApyBps * (10_000 - commissionBpsFromWad(selectedChain.commissionWad))) / 10_000))}
                          </>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>

                <div className="stake-form">
                  <label>
                    <span>Amount (MON)</span>
                    <input value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} inputMode="decimal" />
                  </label>
                </div>

                <div className="stake-buttons sticky">
                  <button className="staking-btn" type="button" disabled={!isConnected || needsChain || isBusy} onClick={onStake}>
                    Delegate
                  </button>
                  <button className="staking-btn secondary" type="button" disabled={!isConnected || needsChain || isBusy} onClick={onUndelegate}>
                    Undelegate
                  </button>
                  <button className="staking-btn secondary" type="button" disabled={!isConnected || needsChain || isBusy} onClick={onClaim}>
                    Claim
                  </button>
                  <button className="staking-btn secondary" type="button" disabled={!isConnected || needsChain || isBusy} onClick={onCompound}>
                    Compound
                  </button>
                  <button
                    className="staking-btn"
                    type="button"
                    disabled={!isConnected || needsChain || isBusy || !pendingWithdrawals.length || (withdrawReady && !withdrawReady.ok)}
                    onClick={onWithdraw}
                    title={withdrawReady && !withdrawReady.ok ? `Available at epoch ${withdrawReady.needed}` : 'Withdraw'}
                  >
                    Withdraw
                  </button>
                </div>

                {status && <div className="stake-status mono">{status}</div>}
                {!isConnected && (
                  <div className="stake-hint">
                    Connect your wallet to stake. You can still browse validators without connecting.
                  </div>
                )}
                {needsChain && (
                  <div className="stake-hint">
                    Switch your wallet network to Monad (chainId 143) to interact.
                  </div>
                )}
                {withdrawReady && !withdrawReady.ok && pendingWithdrawals.length > 0 && (
                  <div className="stake-hint">
                    Withdraw will be available at epoch <span className="mono">{withdrawReady.needed}</span>.
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

