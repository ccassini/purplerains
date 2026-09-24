import { afterEach, describe, expect, test, vi } from 'vitest'
import { normalizeTerminalTransfer, normalizeTerminalBlock, summarizeTerminalValidators, createTerminalChainStore, createTerminalChainFeed } from '../terminalChain'

const transfer = (id, extra = {}) => ({ hash: `0x${id}`, input: '0x', value: '1', timestamp: 1000 + Number(id), from: '0xAAA', to: '0xBBB', ...extra })
const block = (number, extra = {}) => ({ number, timestamp: 1000 + Number(number), ...extra })
afterEach(() => vi.useRealTimers())

describe('honest native transfers', () => {
  test.each([['0xde0b6b3a7640000', 1, '1'], [1500000000000000001n, 1.5, '1.500000000000000001'], ['0.125000', 0.125, '0.125000'], [2.5, 2.5, '2.5'], ['0x1', 1e-18, '0.000000000000000001']])('normalizes %s without confusing wei and existing MON', (value, amount, amountExact) => {
    expect(normalizeTerminalTransfer(transfer('A', { value, tokenSymbol: 'USDC' }))).toMatchObject({ hash: '0xa', symbol: 'MON', amount, amountExact, from: '0xaaa', to: '0xbbb' })
  })
  test.each([
    { value: '0' }, { value: '-1' }, { value: 'not-a-value' }, { value: Infinity },
    { category: 'defi' }, { category: 'nft' }, { category: 'contractDeploy' },
    { to: null }, { isDexTx: true }, { isConfirmedSwap: true }, { isSimulated: true },
    { status: 'reverted' }, { status: '0x0' },
  ])('excludes non-transfers or invalid native values: %j', (change) => {
    expect(normalizeTerminalTransfer(transfer('1', change))).toBeNull()
  })
  test.each([
    { category: 'contractCall', type: 'contract', input: '0xd0e30db0' },
    { category: 'other', input: '0x12345678' },
    { category: 'transfer', input: '0xa9059cbb' },
    { type: 'transfer', input: '0x00' },
    { input: undefined, data: '0x12345678' },
    { type: 'contract', input: undefined },
  ])('restores positive native call value without claiming an ERC20 transfer: %j', (change) => {
    expect(normalizeTerminalTransfer(transfer('1', { ...change, tokenSymbol: 'USDC', value: '2.75' }))).toMatchObject({
      amount: 2.75, amountExact: '2.75', symbol: 'MON', kind: 'contract-value', isContractCall: true,
    })
  })
  test('distinguishes a known plain transfer, contract selector and unknown native movement', () => {
    expect(normalizeTerminalTransfer(transfer('1'))).toMatchObject({ kind: 'transfer', isContractCall: false, methodSignature: null })
    expect(normalizeTerminalTransfer(transfer('1', { input: '0xD0E30DB00000' }))).toMatchObject({ kind: 'contract-value', methodSignature: '0xd0e30db0' })
    expect(normalizeTerminalTransfer(transfer('1', { input: undefined, category: 'other' }))).toMatchObject({ kind: 'native-value', isContractCall: null, methodSignature: null })
    expect(normalizeTerminalTransfer(transfer('1', { input: '0xa9059cbb', value: '0', tokenSymbol: 'USDC' }))).toBeNull()
  })
  test('upgrades the same observation when calldata later identifies the native contract value', () => {
    const store = createTerminalChainStore()
    store.update({ transactions: [transfer('1', { input: undefined, category: 'other' })] })
    store.update({ transactions: [transfer('1', { input: '0xd0e30db0', category: 'contractCall', type: 'contract' })] })
    const rows = store.snapshot().transfers
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'contract-value', isContractCall: true, methodSignature: '0xd0e30db0' })
  })

  test('a sparse repeat cannot erase already observed contract calldata classification', () => {
    const store = createTerminalChainStore()
    store.update({ transactions: [transfer('1', { input: '0xd0e30db0', type: 'contract' })] })
    store.update({ transactions: [transfer('1', { input: undefined, category: 'other' })] })
    expect(store.snapshot().transfers[0]).toMatchObject({ kind: 'contract-value', isContractCall: true, methodSignature: '0xd0e30db0' })
  })

  test('accepts an explicit transfer without calldata but never invents an observation time', () => {
    const row = normalizeTerminalTransfer(transfer('1', { input: undefined, type: 'transfer', timestamp: undefined }))
    expect(row).toMatchObject({ amount: 1, ts: null, timestamp: null, receivedAt: null })
    expect(normalizeTerminalTransfer(transfer('1', { timestamp: undefined, receivedAt: 5000 }))).toMatchObject({ ts: 5000, timestamp: null, receivedAt: 5000 })
  })
})

describe('block and validator normalization', () => {
  test('preserves unknown block values rather than displaying fabricated zeroes', () => {
    expect(normalizeTerminalBlock({ number: 12 })).toMatchObject({ number: 12, transactionCount: null, gasUsed: null, gasLimit: null, baseFeePerGas: null, burnedMon: null, ts: null, proposerValidator: null })
    expect(normalizeTerminalBlock({ number: -1 })).toBeNull()
  })
  test('rejects malformed numeric/time metadata instead of coercing it into a zero or date', () => {
    expect(normalizeTerminalBlock({ number: 1, timestamp: '-1', receivedAt: [], gasUsed: [], gasLimit: ' ', baseFeePerGas: false })).toMatchObject({ ts: null, gasUsed: null, gasLimit: null, baseFeePerGas: null })
  })

  test('normalizes integer RPC quantities, actual zero values and derived block burn', () => {
    expect(normalizeTerminalBlock({ number: '0xa', timestamp: 1000, gasUsed: 21000n, gasLimit: '0x989680', baseFeePerGas: 1000000000n, transactionCount: 0 })).toMatchObject({ number: 10, ts: 1000, gasUsed: 21000, gasLimit: 10000000, baseFeePerGas: 1000000000, burnedMon: 0.000021, transactionCount: 0, networkUtilization: 0.21 })
    expect(normalizeTerminalBlock({ number: 1, gasUsed: 0, baseFeePerGas: 1 })).toMatchObject({ burnedMon: 0 })
  })
  test('keeps top twelve observed validators and reports the entire session window/count', () => {
    const validators = Object.fromEntries(Array.from({ length: 15 }, (_, n) => [String(n), { key: String(n), id: n, name: `V${n}`, blocks: n + 1, lastSeen: 2000 + n }]))
    const result = summarizeTerminalValidators({ totalBlocks: 120, validators, firstSeenAt: 1000, lastSeenAt: 2500 })
    expect(result.validators).toHaveLength(12)
    expect(result.validators[0].id).toBe(14)
    expect(result).toMatchObject({ validatorTotalBlocks: 120, validatorCount: 15, blockWindowMs: 1500 })
    expect(summarizeTerminalValidators({ totalBlocks: 1, validators: { x: validators['1'] }, firstSeenAt: 1000 }).blockWindowMs).toBe(0)
  })
})

describe('bounded chain snapshots', () => {
  test('retains newest 200 transfers and 100 blocks across snapshots and out-of-order batches', () => {
    const store = createTerminalChainStore()
    store.update({ transactions: Array.from({ length: 250 }, (_, i) => transfer(String(i))), blocks: Array.from({ length: 150 }, (_, i) => block(i)) })
    const result = store.snapshot()
    expect(result.transfers).toHaveLength(200)
    expect(result.transfers[0].hash).toBe('0x249')
    expect(result.blocks).toHaveLength(100)
    expect(result.blocks[0].number).toBe(149)
    store.update({ transactions: [transfer('1')], blocks: [block(1)] })
    expect(store.snapshot().transfers).toHaveLength(200)
    expect(store.snapshot().blocks.at(-1).number).toBe(50)
    expect(store.retainedCounts).toEqual({ transfers: 200, blocks: 100 })
  })
  test('same hash/block enriches in place and unchanged inputs preserve published array identity', () => {
    const store = createTerminalChainStore()
    store.update({ transactions: [transfer('AB', { timestamp: undefined })], blocks: [{ number: 1 }] })
    const first = store.snapshot()
    expect(store.update({ transactions: [transfer('ab', { timestamp: undefined })], blocks: [{ number: 1 }] })).toBe(false)
    expect(store.snapshot()).toBe(first)
    const proposer = { id: 4, name: 'Validator' }
    store.update({ transactions: [transfer('AB', { timestamp: 2000, blockNumber: 1 })], blocks: [{ number: 1, proposerValidator: proposer, receivedAt: 2100 }] })
    const next = store.snapshot()
    expect(next.transfers).toHaveLength(1)
    expect(next.transfers[0].ts).toBe(2000)
    expect(next.blocks).toHaveLength(1)
    expect(next.blocks[0].proposerValidator).toMatchObject(proposer)
    expect(next.validators).toBe(first.validators)
    store.update({ blocks: [{ number: 1, proposerValidator: null }] })
    expect(store.snapshot().blocks[0].proposerValidator).toMatchObject(proposer)
  })
  test('new proposer metadata upgrades the row without allowing a later unknown placeholder to erase it', () => {
    const store = createTerminalChainStore()
    store.update({ blocks: [block(1, { proposerValidator: { id: 4, name: 'Unknown Validator' } })] })
    store.update({ blocks: [block(1, { proposerValidator: { id: 4, name: 'Real validator', localLogo: '/v.png' } })] })
    expect(store.snapshot().blocks[0].proposerValidator.name).toBe('Real validator')
    store.update({ blocks: [block(1, { proposerId: 0, proposerValidator: { id: 0, name: 'Unknown Validator' } })] })
    expect(store.snapshot().blocks[0]).toMatchObject({ proposerId: 4, proposerValidator: { id: 4, name: 'Real validator' } })
  })

  test('late classification removes a previously apparent native transfer', () => {
    const store = createTerminalChainStore()
    store.update({ transactions: [transfer('1')] })
    expect(store.snapshot().transfers).toHaveLength(1)
    store.update({ transactions: [transfer('1', { category: 'defi', isDexTx: true })] })
    expect(store.snapshot().transfers).toHaveLength(0)
  })
})

describe('chain publication lifecycle', () => {
  test('a StrictMode lifecycle replacement still publishes data ingested before cleanup', () => {
    vi.useFakeTimers()
    const store = createTerminalChainStore()
    const publish = vi.fn()
    const first = createTerminalChainFeed({ store, onSnapshot: publish })
    first.update({ transactions: [transfer('1')] })
    first.dispose()
    const replacement = createTerminalChainFeed({ store, onSnapshot: publish })
    replacement.update({ transactions: [transfer('1')] })
    vi.advanceTimersByTime(500)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish.mock.calls[0][0].transfers).toHaveLength(1)
    replacement.dispose()
  })

  test('coalesces bursts to 500ms, retains bounded hidden data, resumes immediately and cleans up', () => {
    vi.useFakeTimers()
    const visibility = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    const publish = vi.fn()
    const store = createTerminalChainStore()
    const feed = createTerminalChainFeed({ store, onSnapshot: publish, visibilityTarget: visibility })
    for (let i = 0; i < 100; i += 1) { feed.update({ transactions: [transfer(String(i))] }); vi.advanceTimersByTime(4) }
    expect(publish).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish.mock.calls[0][0].transfers).toHaveLength(100)
    visibility.visibilityState = 'hidden'; visibility.dispatchEvent(new Event('visibilitychange'))
    for (let i = 100; i < 1100; i += 1) feed.update({ transactions: [transfer(String(i))] })
    vi.advanceTimersByTime(5000)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(store.retainedCounts.transfers).toBe(200)
    visibility.visibilityState = 'visible'; visibility.dispatchEvent(new Event('visibilitychange'))
    expect(publish).toHaveBeenCalledTimes(2)
    expect(publish.mock.calls[1][0].transfers[0].hash).toBe('0x1099')
    feed.update({ transactions: [transfer('1100')] })
    feed.dispose()
    vi.advanceTimersByTime(1000)
    expect(publish).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })
})
