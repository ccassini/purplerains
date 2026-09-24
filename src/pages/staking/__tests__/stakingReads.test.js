import { describe, expect, it, vi } from 'vitest'
import { encodeAbiParameters, parseAbiParameters } from 'viem'
import { createStakingReadGate, parseWithdrawalResults, readWithdrawals } from '../useDelegatorPosition'
import { readPortfolio } from '../usePortfolio'
import { GETTER } from '../../../utils/stakingPrecompile'

const address = '0x1111111111111111111111111111111111111111'
const withdrawal = (amount, epoch = 0n) => encodeAbiParameters(parseAbiParameters('uint256,uint256,uint64'), [amount, 0n, epoch])
const page = (done, next, ids) => encodeAbiParameters(parseAbiParameters('bool,uint64,uint64[]'), [done, next, ids])
const position = (stake) => encodeAbiParameters(parseAbiParameters('uint256,uint256,uint256,uint256,uint256,uint64,uint64'), [stake, 0n, 0n, 0n, 0n, 0n, 0n])

describe('withdrawal availability', () => {
  it('finds occupied high slots and preserves legal free slot zero', () => {
    const results = Array.from({ length: 256 }, (_, key) => ({ key, success: true, data: withdrawal(key === 255 ? 9n : 0n, 123n) }))
    const parsed = parseWithdrawalResults(results)
    expect(parsed.nextSlot).toBe(0)
    expect(parsed.withdrawals).toEqual([expect.objectContaining({ id: 255, amount: 9n, epoch: 123, withdrawableEpoch: 124 })])
  })
  it('does not invent a free slot when all 256 are occupied or reads fail', () => {
    const results = Array.from({ length: 256 }, (_, key) => ({ key, success: true, data: withdrawal(1n) }))
    expect(parseWithdrawalResults(results).nextSlot).toBeNull()
    results[42] = { key: 42, success: false, data: null }
    expect(() => parseWithdrawalResults(results)).toThrow(/incomplete/i)
    expect(() => parseWithdrawalResults([])).toThrow(/incomplete/i)
  })
  it('never publishes a late 256-slot response after disconnect or validator change', async () => {
    const gate = createStakingReadGate()
    const firstScope = { address, validatorId: 1 }
    gate.setScope(firstScope)
    let release
    const waiting = new Promise((resolve) => { release = resolve })
    const client = { readContract: vi.fn(async ({ args }) => {
      await waiting
      return args[0].map(() => ({ success: true, returnData: withdrawal(3n, 123n) }))
    }) }
    const publish = vi.fn()
    const request = gate.run(firstScope, () => readWithdrawals(client, address, 1), publish)
    gate.setScope({ address: null, validatorId: 2 })
    release()
    await request
    expect(client.readContract).toHaveBeenCalledTimes(3)
    expect(publish).not.toHaveBeenCalled()
  })
  it('prevents an older refresh or an unmounted request from overwriting fresh state', async () => {
    const gate = createStakingReadGate()
    const scope = { address }
    gate.setScope(scope)
    let finishOld
    const old = new Promise((resolve) => { finishOld = resolve })
    const publish = vi.fn()
    const oldRequest = gate.run(scope, () => old, publish)
    await gate.run(scope, async () => 'new account state', publish)
    finishOld('old account state')
    await oldRequest
    expect(publish.mock.calls).toEqual([['new account state']])
    const pending = gate.run(scope, async () => 'after unmount', publish)
    gate.invalidate()
    await pending
    expect(publish).toHaveBeenCalledOnce()
  })
})

describe('delegation portfolio', () => {
  it('retains rewards after fully undelegated validators disappear from getDelegations', async () => {
    const rewardsOnly = encodeAbiParameters(parseAbiParameters('uint256,uint256,uint256,uint256,uint256,uint64,uint64'), [0n, 0n, 9n, 0n, 0n, 0n, 0n])
    const client = {
      call: vi.fn().mockResolvedValue({ data: page(true, 0n, []) }),
      readContract: vi.fn().mockResolvedValue([{ success: true, returnData: rewardsOnly }]),
    }
    expect(await readPortfolio(client, address, [1])).toEqual([expect.objectContaining({ validatorId: 1, stake: 0n, unclaimedRewards: 9n })])
  })
  it('discovers validators absent from local metadata and follows returned cursors', async () => {
    const client = {
      call: vi.fn().mockResolvedValueOnce({ data: page(false, 200n, [195n]) }).mockResolvedValueOnce({ data: page(true, 0n, [999n]) }),
      readContract: vi.fn().mockResolvedValue([{ success: true, returnData: position(5n) }, { success: true, returnData: position(3n) }]),
    }
    const rows = await readPortfolio(client, address)
    expect(rows.map((row) => row.validatorId)).toEqual([195, 999])
    expect(client.call.mock.calls[0][0].data.startsWith(GETTER.GET_DELEGATIONS)).toBe(true)
    expect(client.call.mock.calls[1][0].data.endsWith('c8'.padStart(64, '0'))).toBe(true)
  })
  it('rejects incomplete reads and looping pagination instead of showing a false zero balance', async () => {
    const client = {
      call: vi.fn().mockResolvedValue({ data: page(false, 0n, [195n]) }),
      readContract: vi.fn(),
    }
    await expect(readPortfolio(client, address)).rejects.toThrow(/pagination/i)
    client.call.mockResolvedValue({ data: page(true, 0n, [195n]) })
    client.readContract.mockResolvedValue([{ success: false, returnData: '0x' }])
    await expect(readPortfolio(client, address)).rejects.toThrow(/incomplete/i)
  })
})
