import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isAddress } from 'viem'
import {
  decodeGetEpochResult,
  decodeGetWithdrawalRequestResult,
  encodeClaimRewardsCalldata,
  encodeCompoundCalldata,
  encodeDelegateCalldata,
  encodeGetEpochCalldata,
  encodeGetWithdrawalRequestCalldata,
  encodeUndelegateCalldata,
  encodeWithdrawCalldata,
  STAKING_PRECOMPILE_ADDRESS,
} from '../../utils/stakingPrecompile'
import { GAS_RESERVE_WEI, parseStakingAmount, STAKING_DUST_WEI } from './stakingAmounts'
import { readDelegatorPosition } from './useDelegatorPosition'

const MONAD_CHAIN_ID = 143
const LABELS = { delegate: 'Delegation', undelegate: 'Undelegation', withdraw: 'Withdrawal', claim: 'Reward claim', compound: 'Compounding' }
const HASH = /^0x[a-fA-F0-9]{64}$/

export function txUrl(hash) {
  return typeof hash === 'string' && HASH.test(hash) ? `https://monadvision.com/tx/${hash}` : null
}

export function parseStatus(status) {
  if (!status) return null
  const hash = status.match(/(0x[a-fA-F0-9]{64})/)?.[1] || null
  const kind = /fail|error|reject|revert/i.test(status) ? 'error'
    : /\bconfirmed\b/i.test(status) && hash ? 'success'
      : /submitted|sending|claiming|compounding|checking|confirm in wallet/i.test(status) ? 'pending' : 'info'
  return { text: status, hash, kind }
}

function sameScope(a, b) {
  return Boolean(a && b && a.publicClient === b.publicClient && a.address?.toLowerCase() === b.address?.toLowerCase() && a.validatorId === b.validatorId && a.chainId === b.chainId)
}

async function call(publicClient, data) {
  const result = await publicClient.call({ to: STAKING_PRECOMPILE_ADDRESS, data })
  const hex = typeof result === 'string' ? result : result?.data
  if (!hex || hex === '0x') throw new Error('Staking state could not be verified. Please try again.')
  return hex
}

/** All amount and readiness checks are repeated against fresh chain state before asking the wallet. */
export async function prepareStakingTransaction(context, action, { amount, slotId } = {}) {
  const { publicClient, address, validatorId, chainId } = context
  if (!publicClient || !isAddress(address || '') || !Number.isSafeInteger(validatorId) || validatorId <= 0) throw new Error('Connect your wallet and select a validator.')
  if ((chainId != null && chainId !== MONAD_CHAIN_ID) || await publicClient.getChainId() !== MONAD_CHAIN_ID) throw new Error('Switch your wallet to Monad mainnet.')
  let value = 0n
  let data
  let amountWei
  if (action === 'delegate' || action === 'undelegate') {
    amountWei = parseStakingAmount(amount)
    if (amountWei === null || amountWei < STAKING_DUST_WEI) throw new Error('Enter at least 0.000000001 MON, with no more than 18 decimal places.')
  }
  if ((action === 'withdraw' || action === 'undelegate') && (!Number.isInteger(slotId) || slotId < 0 || slotId > 255)) throw new Error('No verified withdrawal slot is available. Refresh your position.')
  if (action === 'delegate') {
    value = amountWei
    data = encodeDelegateCalldata(validatorId)
  } else if (action === 'undelegate') {
    const [position, withdrawalHex] = await Promise.all([
      readDelegatorPosition(publicClient, address, validatorId),
      call(publicClient, encodeGetWithdrawalRequestCalldata(validatorId, address, slotId)),
    ])
    if (amountWei > position.stake) throw new Error('Amount exceeds your active stake. Pending delegations cannot be unstaked.')
    if (decodeGetWithdrawalRequestResult(withdrawalHex).amount > 0n) throw new Error('This withdrawal slot is occupied. Refresh your position.')
    data = encodeUndelegateCalldata(validatorId, amountWei, slotId)
  } else if (action === 'withdraw') {
    const [withdrawalHex, epochHex] = await Promise.all([
      call(publicClient, encodeGetWithdrawalRequestCalldata(validatorId, address, slotId)),
      call(publicClient, encodeGetEpochCalldata()),
    ])
    const withdrawal = decodeGetWithdrawalRequestResult(withdrawalHex)
    const { epoch } = decodeGetEpochResult(epochHex)
    if (withdrawal.amount <= 0n) throw new Error('This withdrawal has already been collected or does not exist.')
    if (epoch < withdrawal.withdrawableEpoch) throw new Error(`This withdrawal becomes available in epoch ${withdrawal.withdrawableEpoch}.`)
    data = encodeWithdrawCalldata(validatorId, slotId)
  } else if (action === 'claim' || action === 'compound') {
    const position = await readDelegatorPosition(publicClient, address, validatorId)
    if (position.unclaimedRewards <= 0n) throw new Error('No rewards are available yet.')
    if (action === 'compound' && position.unclaimedRewards < STAKING_DUST_WEI) throw new Error('Rewards must reach 0.000000001 MON before compounding.')
    data = action === 'claim' ? encodeClaimRewardsCalldata(validatorId) : encodeCompoundCalldata(validatorId)
  } else throw new Error('Unsupported staking action')

  const request = { account: address, to: STAKING_PRECOMPILE_ADDRESS, data, value, chainId: MONAD_CHAIN_ID }
  const [balance, estimatedGas, fees] = await Promise.all([
    publicClient.getBalance({ address, blockTag: 'pending' }),
    publicClient.estimateGas(request),
    publicClient.estimateFeesPerGas(),
  ])
  // Monad charges the gas limit. Keep the margin modest and reserve the quoted maximum fee.
  if (typeof estimatedGas !== 'bigint' || estimatedGas <= 0n) throw new Error('Transaction fees could not be verified.')
  const gas = (estimatedGas * 110n + 99n) / 100n
  const feePerGas = fees.maxFeePerGas ?? fees.gasPrice
  if (typeof balance !== 'bigint' || typeof feePerGas !== 'bigint' || feePerGas <= 0n || gas <= 0n) throw new Error('Transaction fees could not be verified.')
  if (fees.maxPriorityFeePerGas != null && (typeof fees.maxPriorityFeePerGas !== 'bigint' || fees.maxPriorityFeePerGas < 0n || fees.maxPriorityFeePerGas > feePerGas)) throw new Error('Transaction fees could not be verified.')
  const maxFee = gas * feePerGas
  const reserve = action === 'delegate' && GAS_RESERVE_WEI > maxFee ? GAS_RESERVE_WEI : maxFee
  if (value + reserve > balance) throw new Error('Insufficient wallet balance after reserving transaction fees.')
  return { ...request, gas, ...(fees.maxFeePerGas != null ? { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 0n } : { gasPrice: fees.gasPrice }) }
}

/** One action at a time, including receipt checks; never infer confirmation from a broadcast hash. */
export function createStakingActionRunner({ getContext, onState, onSettled }) {
  let active = true
  let generation = 0
  let running = false
  let pending = null
  let lastState = null
  const publish = (job, phase, text, kind, isPending) => {
    const state = { action: job.action, address: job.context.address, validatorId: job.context.validatorId, chainId: job.context.chainId, publicClient: job.context.publicClient, phase, text, kind, hash: job.hash || null, isPending }
    lastState = state
    if (active && job.generation === generation) onState?.(state)
  }
  const settle = (job) => {
    if (active && job.generation === generation && sameScope(getContext(), job.context)) {
      // A data refresh failure must not turn a confirmed receipt into an unknown transaction.
      Promise.resolve().then(() => onSettled?.()).catch(() => {})
    }
  }
  const confirm = async (job) => {
    try {
      const receipt = await job.context.publicClient.waitForTransactionReceipt({
        hash: job.hash, confirmations: 1, timeout: 120_000,
        onReplaced: ({ reason, transaction }) => {
          if (transaction?.hash) job.hash = transaction.hash
          if (reason !== 'repriced') job.replaced = true
        },
      })
      pending = null
      if (receipt.status !== 'success' || job.replaced) {
        publish(job, 'failed', job.replaced ? 'The wallet replaced or cancelled this staking transaction.' : `${LABELS[job.action]} reverted. No staking change was applied.`, 'error', false)
        settle(job)
        return null
      }
      job.hash = receipt.transactionHash || job.hash
      publish(job, 'confirmed', `${LABELS[job.action]} confirmed.`, 'success', false)
      settle(job)
      return job.hash
    } catch {
      publish(job, 'unconfirmed', 'Transaction submitted. Confirmation is not available yet; check its status before trying again.', 'info', true)
      return job.hash
    }
  }
  return {
    async run(action, args) {
      if (!active || running || pending) return null
      const context = getContext()
      if (!context?.canAct) return null
      const job = { context, action, generation, hash: null, replaced: false }
      running = true
      publish(job, 'preparing', 'Checking amount, staking state and transaction fees…', 'pending', true)
      try {
        const request = await prepareStakingTransaction(context, action, args)
        if (!active || job.generation !== generation || !sameScope(getContext(), context)) return null
        publish(job, 'wallet', 'Confirm the transaction in your wallet…', 'pending', true)
        job.hash = await context.sendTransactionAsync(request)
        if (!HASH.test(job.hash || '')) throw new Error('The wallet did not return a transaction hash.')
        pending = job
        publish(job, 'submitted', `${LABELS[action]} submitted. Waiting for confirmation…`, 'pending', true)
        return await confirm(job)
      } catch (error) {
        publish(job, 'failed', error?.shortMessage || error?.message || 'The transaction could not be sent.', 'error', false)
        return null
      } finally {
        running = false
        if (!pending && lastState?.isPending) publish(job, 'cancelled', 'Wallet or validator changed. Please review the action again.', 'info', false)
      }
    },
    async checkReceipt() {
      if (!pending || running || !active) return null
      running = true
      publish(pending, 'submitted', 'Checking transaction confirmation…', 'pending', true)
      try { return await confirm(pending) } finally { running = false }
    },
    clear() { if (!running && !pending) { lastState = null; onState?.(null) } },
    setActive(value) { active = value; if (!value) generation += 1 },
  }
}

export function useStakingActions(params) {
  const paramsRef = useRef(params)
  paramsRef.current = params
  const [transaction, setTransaction] = useState(null)
  const runnerRef = useRef(null)
  if (!runnerRef.current) runnerRef.current = createStakingActionRunner({
    getContext: () => paramsRef.current,
    onState: setTransaction,
    onSettled: () => paramsRef.current.onSettled?.(),
  })
  useEffect(() => {
    runnerRef.current.setActive(true)
    return () => runnerRef.current.setActive(false)
  }, [])
  const delegate = useCallback((amount) => runnerRef.current.run('delegate', { amount }), [])
  const undelegate = useCallback((amount, slotId) => runnerRef.current.run('undelegate', { amount, slotId }), [])
  const withdraw = useCallback((slotId) => runnerRef.current.run('withdraw', { slotId }), [])
  const claim = useCallback(() => runnerRef.current.run('claim'), [])
  const compound = useCallback(() => runnerRef.current.run('compound'), [])
  const checkReceipt = useCallback(() => runnerRef.current.checkReceipt(), [])
  const clearStatus = useCallback(() => runnerRef.current.clear(), [])
  const statusInfo = useMemo(() => transaction && sameScope(transaction, params) ? { text: transaction.text, kind: transaction.kind, hash: transaction.hash } : null, [params, transaction])
  return { delegate, undelegate, withdraw, claim, compound, checkReceipt, clearStatus, transaction, isPending: Boolean(transaction?.isPending), status: statusInfo?.text ?? null, statusInfo }
}
