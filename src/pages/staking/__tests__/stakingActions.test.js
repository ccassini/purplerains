import { describe, expect, it, vi } from 'vitest'
import { encodeAbiParameters, parseAbiParameters } from 'viem'
import { createStakingActionRunner, prepareStakingTransaction, parseStatus } from '../useStakingActions'
import { GETTER } from '../../../utils/stakingPrecompile'

const account = '0x1111111111111111111111111111111111111111'
const hash = `0x${'ab'.repeat(32)}`
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const word = (type, values) => ({ data: encodeAbiParameters(parseAbiParameters(type), values) })
function context() {
  return {
    address: account, validatorId: 1, canAct: true, chainId: 143,
    sendTransactionAsync: vi.fn().mockResolvedValue(hash),
    publicClient: {
      chain: { id: 143 }, getChainId: vi.fn().mockResolvedValue(143),
      getBalance: vi.fn().mockResolvedValue(10n ** 20n), estimateGas: vi.fn().mockResolvedValue(300_000n),
      estimateFeesPerGas: vi.fn().mockResolvedValue({ maxFeePerGas: 50_000_000_000n, maxPriorityFeePerGas: 1n }),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success', transactionHash: hash }),
    },
  }
}

describe('staking transaction preparation', () => {
  it('rejects rounded amounts, dust, wrong chains and amounts that spend the actual gas reserve', async () => {
    const ctx = context()
    for (const amount of ['1e2', '1.0000000000000000001', '0.0000000001']) {
      await expect(prepareStakingTransaction(ctx, 'delegate', { amount })).rejects.toThrow()
    }
    await expect(prepareStakingTransaction(ctx, 'delegate', { amount: '99.999' })).rejects.toThrow(/fees|balance/i)
    ctx.publicClient.getChainId.mockResolvedValue(1)
    await expect(prepareStakingTransaction(ctx, 'delegate', { amount: '1' })).rejects.toThrow(/Monad/i)
  })

  it('preserves slot zero and checks active stake and occupancy against fresh state', async () => {
    const ctx = context()
    ctx.publicClient.call = vi.fn(({ data }) => Promise.resolve(data.startsWith(GETTER.GET_DELEGATOR)
      ? word('uint256,uint256,uint256,uint256,uint256,uint64,uint64', [2n * 10n ** 18n, 0n, 0n, 5n * 10n ** 18n, 0n, 2n, 0n])
      : word('uint256,uint256,uint64', [0n, 0n, 0n])))
    const tx = await prepareStakingTransaction(ctx, 'undelegate', { amount: '1', slotId: 0 })
    expect(tx.data.endsWith('0'.repeat(64))).toBe(true)
    await expect(prepareStakingTransaction(ctx, 'undelegate', { amount: '3', slotId: 0 })).rejects.toThrow(/active stake/i)
    ctx.publicClient.call.mockImplementation(({ data }) => Promise.resolve(data.startsWith(GETTER.GET_DELEGATOR)
      ? word('uint256,uint256,uint256,uint256,uint256,uint64,uint64', [2n * 10n ** 18n, 0n, 0n, 0n, 0n, 0n, 0n])
      : word('uint256,uint256,uint64', [1n, 0n, 123n])))
    await expect(prepareStakingTransaction(ctx, 'undelegate', { amount: '1', slotId: 0 })).rejects.toThrow(/occupied/i)
  })
  it('requires the stored withdrawal activation epoch plus one, re-reading the live epoch', async () => {
    const ctx = context()
    let epoch = 123n
    ctx.publicClient.call = vi.fn(({ data }) => Promise.resolve(data === GETTER.GET_EPOCH
      ? word('uint64,bool', [epoch, false])
      : word('uint256,uint256,uint64', [10n ** 18n, 0n, 123n])))
    await expect(prepareStakingTransaction(ctx, 'withdraw', { slotId: 255 })).rejects.toThrow(/epoch 124/)
    epoch = 124n
    await expect(prepareStakingTransaction(ctx, 'withdraw', { slotId: 255 })).resolves.toMatchObject({ value: 0n })
  })
  it('refuses missing, negative or non-bigint fee estimates and caps the fee reserve against balance', async () => {
    for (const fees of [{}, { maxFeePerGas: 0n }, { maxFeePerGas: NaN }, { maxFeePerGas: 1n, maxPriorityFeePerGas: 2n }]) {
      const ctx = context()
      ctx.publicClient.estimateFeesPerGas.mockResolvedValue(fees)
      await expect(prepareStakingTransaction(ctx, 'delegate', { amount: '1' })).rejects.toThrow(/fees/)
    }
    for (const gas of [0n, -1n, NaN, 300000]) {
      const ctx = context()
      ctx.publicClient.estimateGas.mockResolvedValue(gas)
      await expect(prepareStakingTransaction(ctx, 'delegate', { amount: '1' })).rejects.toThrow(/fees/)
    }
    const ctx = context()
    ctx.publicClient.getBalance.mockResolvedValue(1_015_000_000_000_000_000n)
    await expect(prepareStakingTransaction(ctx, 'delegate', { amount: '1' })).rejects.toThrow(/fees/)
  })
})

describe('staking transaction lifecycle', () => {
  it('keeps broadcast pending, prevents duplicate sends and succeeds only after a successful receipt', async () => {
    const ctx = context()
    const receipt = deferred()
    ctx.publicClient.waitForTransactionReceipt.mockReturnValue(receipt.promise)
    const states = []
    const settled = vi.fn()
    const runner = createStakingActionRunner({ getContext: () => ctx, onState: (state) => states.push(state), onSettled: settled })
    const pending = runner.run('delegate', { amount: '1' })
    await vi.waitFor(() => expect(states.at(-1)?.phase).toBe('submitted'))
    expect(states.at(-1).kind).toBe('pending')
    expect(settled).not.toHaveBeenCalled()
    await runner.run('delegate', { amount: '1' })
    expect(ctx.sendTransactionAsync).toHaveBeenCalledTimes(1)
    receipt.resolve({ status: 'success', transactionHash: hash })
    await pending
    expect(states.at(-1).phase).toBe('confirmed')
    expect(settled).toHaveBeenCalledOnce()
  })

  it('does not open a stale wallet request after the account changes during estimation', async () => {
    let ctx = context()
    const original = ctx
    const gas = deferred()
    ctx.publicClient.estimateGas.mockReturnValue(gas.promise)
    const runner = createStakingActionRunner({ getContext: () => ctx, onState: vi.fn() })
    const pending = runner.run('delegate', { amount: '1' })
    await vi.waitFor(() => expect(original.publicClient.estimateGas).toHaveBeenCalled())
    ctx = { ...ctx, address: '0x2222222222222222222222222222222222222222' }
    gas.resolve(300_000n)
    await pending
    expect(original.sendTransactionAsync).not.toHaveBeenCalled()
  })

  it('keeps an unknown receipt distinct from a failed send and supports checking again', async () => {
    const ctx = context()
    ctx.publicClient.waitForTransactionReceipt.mockRejectedValueOnce(new Error('Timed out'))
    const states = []
    const runner = createStakingActionRunner({ getContext: () => ctx, onState: (state) => states.push(state) })
    await runner.run('delegate', { amount: '1' })
    expect(states.at(-1)).toMatchObject({ phase: 'unconfirmed', hash, kind: 'info' })
    await runner.run('delegate', { amount: '1' })
    expect(ctx.sendTransactionAsync).toHaveBeenCalledOnce()
    await runner.checkReceipt()
    expect(states.at(-1).phase).toBe('confirmed')
  })

  it('does not report reverted receipts or submitted text as successful', async () => {
    const ctx = context()
    ctx.publicClient.waitForTransactionReceipt.mockResolvedValue({ status: 'reverted', transactionHash: hash })
    const states = []
    const settled = vi.fn()
    const runner = createStakingActionRunner({ getContext: () => ctx, onState: (state) => states.push(state), onSettled: settled })
    await runner.run('delegate', { amount: '1' })
    expect(states.at(-1)).toMatchObject({ phase: 'failed', kind: 'error' })
    expect(parseStatus(`Delegation submitted: ${hash}`).kind).toBe('pending')
    expect(parseStatus(`Delegation unconfirmed: ${hash}`).kind).not.toBe('success')
  })
  it('does not apply an old receipt to another wallet and keeps cancelled replacements distinct from success', async () => {
    let ctx = context()
    const receipt = deferred()
    ctx.publicClient.waitForTransactionReceipt.mockReturnValue(receipt.promise)
    const settled = vi.fn()
    const runner = createStakingActionRunner({ getContext: () => ctx, onState: vi.fn(), onSettled: settled })
    const pending = runner.run('delegate', { amount: '1' })
    await vi.waitFor(() => expect(ctx.publicClient.waitForTransactionReceipt).toHaveBeenCalled())
    ctx = { ...ctx, address: '0x2222222222222222222222222222222222222222' }
    receipt.resolve({ status: 'success', transactionHash: hash })
    await pending
    expect(settled).not.toHaveBeenCalled()

    const states = []
    ctx = context()
    ctx.publicClient.waitForTransactionReceipt.mockImplementation(async ({ onReplaced }) => {
      onReplaced({ reason: 'cancelled', transaction: { hash } })
      return { status: 'success', transactionHash: hash }
    })
    const replaced = createStakingActionRunner({ getContext: () => ctx, onState: (state) => states.push(state) })
    await replaced.run('delegate', { amount: '1' })
    expect(states.at(-1)).toMatchObject({ phase: 'failed', kind: 'error' })
  })
})
