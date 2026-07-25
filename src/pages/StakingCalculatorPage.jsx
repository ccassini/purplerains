import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Calculator, TrendingUp, Search } from 'lucide-react'
import { computeStakingStatsFromGmonadsRows, formatAPY } from '../utils/stakingApi'
import { fetchGmonadsValidatorsEpoch } from '../utils/gmonadsApi'
import { getAllValidators, getLocalLogoPath, getValidatorById } from '../utils/validatorApi'
import { formatMonNumber, commissionBpsFromWad, formatApyFromBps } from '../utils/formatters'
import './StakingCalculatorPage.css'

export default function StakingCalculatorPage() {
  const [query, setQuery] = useState('')
  const [selectedValidatorId, setSelectedValidatorId] = useState(null)
  const [stakeAmount, setStakeAmount] = useState('1000')
  const [networkStats, setNetworkStats] = useState({ totalStaked: null, apy: null, fromCache: false })
  const [chainStatsById, setChainStatsById] = useState(() => ({}))

  // Fetch network stats and validator data
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const { data } = await fetchGmonadsValidatorsEpoch('mainnet')
        if (cancelled) return

        const next = {}
        for (const row of data) {
          const id = Number(row?.val_index)
          if (!Number.isFinite(id)) continue
          try {
            const stakeMon = BigInt(row?.stake ?? '0')
            const totalStakeWei = stakeMon * 10n ** 18n
            const commissionBps = BigInt(Number(row?.commission ?? 0))
            const commissionWad = commissionBps * 10n ** 14n

            next[id] = {
              totalStakeWei,
              commissionWad,
              setType: String(row?.validator_set_type || ''),
            }
          } catch {
            // ignore row
          }
        }

        setChainStatsById((prev) => ({ ...prev, ...next }))
        const computed = computeStakingStatsFromGmonadsRows(data)
        setNetworkStats({ totalStaked: computed.totalStaked, apy: computed.apy, fromCache: false })
      } catch {
        // ignore
      }
    }

    run()
    const id = window.setInterval(run, 60 * 60 * 1000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [])

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

  const selectedValidator = useMemo(() => 
    selectedValidatorId ? getValidatorById(selectedValidatorId) : null, 
    [selectedValidatorId]
  )

  const selectedChain = useMemo(() => 
    selectedValidatorId ? chainStatsById[selectedValidatorId] : null, 
    [chainStatsById, selectedValidatorId]
  )

  const baseApyBps = useMemo(() => {
    if (typeof networkStats?.apy !== 'number' || Number.isNaN(networkStats.apy)) return 0
    return Math.max(0, Math.round(networkStats.apy * 100))
  }, [networkStats])

  // Calculate results
  const calculatorResults = useMemo(() => {
    const amount = parseFloat(stakeAmount) || 0
    if (amount <= 0 || !networkStats.apy || !selectedChain) return null

    const commissionBps = commissionBpsFromWad(selectedChain.commissionWad ?? 0n)
    const netApyBps = Math.round((baseApyBps * (10_000 - commissionBps)) / 10_000)
    const netApy = netApyBps / 100

    const daily = (amount * netApy) / 100 / 365
    const weekly = daily * 7
    const monthly = daily * 30
    const yearly = (amount * netApy) / 100

    return {
      netApy,
      netApyBps,
      commissionBps,
      daily,
      weekly,
      monthly,
      yearly,
      totalAfterYear: amount + yearly,
    }
  }, [stakeAmount, networkStats.apy, selectedChain, baseApyBps])

  return (
    <motion.div
      className="staking-calculator-page"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="calculator-panel">
        <div className="calculator-header">
          <div className="calculator-title-section">
            <div className="calculator-title">
              <Calculator size={20} />
              <span>Staking Calculator</span>
            </div>
            <div className="calculator-subtitle">
              Estimate your staking rewards for any validator
            </div>
          </div>
          <div className="calculator-actions">
            <Link className="calculator-link" to="/staking">Staking</Link>
            <Link className="calculator-link" to="/">Home</Link>
          </div>
        </div>

        <div className="calculator-content-wrapper">
          {/* Left Side: Validator Selection */}
          <div className="calculator-validator-section">
            <div className="validator-section-header">
              <h3>Select Validator</h3>
              <div className="validator-search">
                <Search size={14} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search validator..."
                  inputMode="search"
                />
              </div>
            </div>

            <div className="validator-list">
              {validators.map((v) => {
                const isSelected = selectedValidatorId === v.id
                const cs = chainStatsById[v.id]
                const isActive = String(cs?.setType || '').toLowerCase() === 'active'
                const commissionBps = commissionBpsFromWad(cs?.commissionWad ?? 0n)
                const netApyBps = cs && baseApyBps 
                  ? Math.round((baseApyBps * (10_000 - commissionBps)) / 10_000)
                  : 0

                return (
                  <button
                    key={v.id}
                    type="button"
                    className={`validator-item ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedValidatorId(v.id)}
                  >
                    <div className="validator-item-left">
                      <div className="validator-item-logo">
                        {v.logo ? (
                          <img src={v.logo} alt={v.name} />
                        ) : (
                          <span className="validator-item-fallback">
                            {String(v.name || 'V').slice(0, 1)}
                          </span>
                        )}
                      </div>
                      <div className="validator-item-info">
                        <div className="validator-item-name">
                          {v.name}
                          {isActive && <span className="validator-badge active">ACTIVE</span>}
                        </div>
                        <div className="validator-item-sub">
                          #{v.id}
                        </div>
                      </div>
                    </div>
                    <div className="validator-item-right">
                      {cs && baseApyBps ? (
                        <div className="validator-item-apy">
                          {formatApyFromBps(netApyBps)}
                        </div>
                      ) : (
                        <div className="validator-item-apy muted">—</div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Right Side: Calculator */}
          <div className="calculator-main-section">
            {!selectedValidator ? (
              <div className="calculator-empty-state">
                <Calculator size={48} />
                <h3>Select a Validator</h3>
                <p>Choose a validator from the list to calculate your staking rewards</p>
              </div>
            ) : (
              <>
                <div className="calculator-selected-validator">
                  <div className="selected-validator-header">
                    <div className="selected-validator-logo">
                      {selectedValidator.logo ? (
                        <img src={selectedValidator.logo} alt={selectedValidator.name} />
                      ) : (
                        <span className="selected-validator-fallback">
                          {String(selectedValidator.name || 'V').slice(0, 1)}
                        </span>
                      )}
                    </div>
                    <div className="selected-validator-info">
                      <div className="selected-validator-name">{selectedValidator.name}</div>
                      <div className="selected-validator-id">Validator #{selectedValidatorId}</div>
                    </div>
                  </div>

                  {selectedChain && (
                    <div className="selected-validator-stats">
                      <div className="validator-stat">
                        <span className="stat-label">Commission</span>
                        <span className="stat-value">
                          {formatApyFromBps(commissionBpsFromWad(selectedChain.commissionWad))}
                        </span>
                      </div>
                      <div className="validator-stat">
                        <span className="stat-label">Net APY</span>
                        <span className="stat-value positive">
                          {baseApyBps 
                            ? formatApyFromBps(Math.round((baseApyBps * (10_000 - commissionBpsFromWad(selectedChain.commissionWad))) / 10_000))
                            : '—'}
                        </span>
                      </div>
                      <div className="validator-stat">
                        <span className="stat-label">Status</span>
                        <span className="stat-value">
                          {String(selectedChain.setType || '').toLowerCase() === 'active' ? (
                            <span className="status-active">Active</span>
                          ) : (
                            <span className="status-inactive">Inactive</span>
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="calculator-input-section">
                  <label>
                    <span>Stake Amount (MON)</span>
                    <input
                      type="number"
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      placeholder="1000"
                      min="0"
                      step="0.01"
                    />
                  </label>
                </div>

                {calculatorResults ? (
                  <div className="calculator-results">
                    <div className="results-header">
                      <TrendingUp size={18} />
                      <span>Estimated Rewards</span>
                    </div>

                    <div className="results-grid">
                      <div className="result-card">
                        <div className="result-label">Daily</div>
                        <div className="result-value">{formatMonNumber(calculatorResults.daily)} MON</div>
                      </div>
                      <div className="result-card">
                        <div className="result-label">Weekly</div>
                        <div className="result-value">{formatMonNumber(calculatorResults.weekly)} MON</div>
                      </div>
                      <div className="result-card">
                        <div className="result-label">Monthly</div>
                        <div className="result-value">{formatMonNumber(calculatorResults.monthly)} MON</div>
                      </div>
                      <div className="result-card highlight">
                        <div className="result-label">Yearly</div>
                        <div className="result-value">{formatMonNumber(calculatorResults.yearly)} MON</div>
                      </div>
                    </div>

                    <div className="results-total">
                      <div className="total-label">Total After 1 Year</div>
                      <div className="total-value">{formatMonNumber(calculatorResults.totalAfterYear)} MON</div>
                      <div className="total-breakdown">
                        {formatMonNumber(parseFloat(stakeAmount) || 0)} MON staked + {formatMonNumber(calculatorResults.yearly)} MON rewards
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="calculator-no-results">
                    Enter a stake amount to calculate rewards
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
