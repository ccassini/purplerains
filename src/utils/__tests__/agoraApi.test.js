import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAgoraPoller, fetchAgoraData } from '../agoraApi'

const CONTRACT = '0x00000000efe302beaa2b3e6e1b18d08d69a9012a'
const TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const ZERO = `0x${'0'.repeat(40)}`
const FROM = `0x${'1'.repeat(40)}`
const TO = `0x${'2'.repeat(40)}`
const hex = (value) => `0x${value.toString(16)}`
const topicAddress = (address) => `0x${address.slice(2).padStart(64, '0')}`
const chain = (id = 1) => ({ chainId: id, chainName: id === 1 ? 'Ethereum' : 'Monad', contractAddress: CONTRACT, evm: true, rpcs: [`https://${id}.rpc.test`] })
const log = ({ block = 10, index = 0, amount = 1_250_000n, from = FROM, to = TO, hash = `0x${'a'.repeat(64)}`, removed = false } = {}) => ({ address: CONTRACT, topics: [TOPIC, topicAddress(from), topicAddress(to)], data: `0x${amount.toString(16).padStart(64, '0')}`, blockNumber: hex(block), transactionHash: hash, logIndex: hex(index), removed })

function mockRpc(handler) {
  const calls = []
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const body = JSON.parse(options.body)
    const id = Number(new URL(url).hostname.split('.')[0])
    calls.push({ ...body, id })
    const custom = await handler?.(body.method, body.params, id, options.signal)
    const result = custom === undefined ? body.method === 'eth_chainId' ? hex(id) : body.method === 'eth_blockNumber' ? '0xa' : body.method === 'eth_call' ? '0x6' : [] : custom
    if (result instanceof Error) return { ok: true, json: async () => ({ error: { message: result.message, code: -32000 } }) }
    return { ok: true, json: async () => ({ jsonrpc: '2.0', result }) }
  }))
  return calls
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Agora verified registry', () => {
  it('boots immediately without CoinGecko and only includes official mainnet EVM deployments', async () => {
    const fetch = vi.fn(() => new Promise(() => {}))
    vi.stubGlobal('fetch', fetch)
    const data = await fetchAgoraData()
    expect(data.chains.map((item) => item.chainId).sort((a, b) => a - b)).toEqual([1, 137, 143, 5000, 8453, 13371, 42161, 43114, 747474])
    expect(data.chains.every((item) => item.contractAddress.toLowerCase() === CONTRACT)).toBe(true)
    expect(data.cities.length).toBeGreaterThan(20)
    expect(data.symbol).toBe('AUSD')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('Agora exact transfer data', () => {
  it('uses actual decimals for numeric and exact amounts and only labels evidenced mint/burn/transfer', async () => {
    mockRpc((method) => method === 'eth_getLogs' ? [log(), log({ index: 1, from: ZERO }), log({ index: 2, to: ZERO }), log({ index: 3, removed: true })] : undefined)
    const data = await createAgoraPoller([chain()]).poll()
    expect(data.transfers.map((row) => row.kind)).toEqual(['transfer', 'mint', 'burn'])
    expect(data.transfers[0]).toMatchObject({ amount: 1.25, amountDisplay: '1.25', amountRaw: '1250000', decimals: 6 })
    expect(data.chainStatus[0]).toMatchObject({ status: 'live', latestBlock: 10, lastScannedBlock: 10 })
  })
  it('supports zero decimals and refuses to guess decimals when metadata is unavailable', async () => {
    mockRpc((method) => method === 'eth_call' ? '0x0' : method === 'eth_getLogs' ? [log({ amount: 123n })] : undefined)
    expect((await createAgoraPoller([chain()]).poll()).transfers[0]).toMatchObject({ amount: 123, amountDisplay: '123', decimals: 0 })
    mockRpc((method) => method === 'eth_call' ? new Error('Metadata unavailable') : undefined)
    const result = await createAgoraPoller([chain()]).poll()
    expect(result.transfers).toEqual([])
    expect(result.chainStatus[0].status).toBe('error')
  })
  it('keeps every log in a transaction and scopes dedupe to chain + transaction + log index', async () => {
    mockRpc((method) => method === 'eth_getLogs' ? [log(), log(), log({ index: 1 })] : undefined)
    const result = await createAgoraPoller([chain(143), chain(1)]).poll()
    expect(result.transfers).toHaveLength(4)
    expect(new Set(result.transfers.map((row) => row.id)).size).toBe(4)
  })
})

describe('Agora incremental polling', () => {
  it('publishes a healthy chain immediately while another chain is still waiting', async () => {
    let release
    const slow = new Promise((resolve) => { release = resolve })
    mockRpc((method, params, id) => method === 'eth_getLogs' ? id === 143 ? slow : [log()] : undefined)
    const onChainResult = vi.fn()
    const poller = createAgoraPoller([chain(1), chain(143)])
    const pending = poller.poll({ onChainResult })
    await vi.waitFor(() => expect(onChainResult).toHaveBeenCalledOnce())
    expect(onChainResult.mock.calls[0][0]).toMatchObject({ transfers: [expect.objectContaining({ chainId: 1 })], chainStatus: [expect.objectContaining({ chainId: 1, status: 'live' })], scannedChains: 1 })
    release([log()])
    const final = await pending
    expect(onChainResult).toHaveBeenCalledTimes(2)
    expect(final.transfers.map((row) => row.chainId)).toEqual([1, 143])
    expect((await poller.poll()).transfers).toEqual([])
  })
  it('isolates callback exceptions without losing the final transfer batch or corrupting its cursor', async () => {
    const calls = mockRpc((method) => method === 'eth_getLogs' ? [log()] : undefined)
    const poller = createAgoraPoller([chain()])
    const onChainResult = vi.fn(() => { throw new Error('Consumer render failed') })
    const final = await poller.poll({ onChainResult })
    expect(onChainResult).toHaveBeenCalledOnce()
    expect(final.transfers).toHaveLength(1)
    expect((await poller.poll()).transfers).toEqual([])
    expect(calls.filter((call) => call.method === 'eth_getLogs')).toHaveLength(1)
  })
  it('never invokes per-chain callbacks after cancellation', async () => {
    const controller = new AbortController()
    mockRpc((method) => {
      if (method === 'eth_getLogs') { controller.abort(); return [log()] }
    })
    const onChainResult = vi.fn()
    const poller = createAgoraPoller([chain()])
    await expect(poller.poll({ signal: controller.signal, onChainResult })).rejects.toMatchObject({ name: 'AbortError' })
    expect(onChainResult).not.toHaveBeenCalled()
  })
  it.each([false, true])('handles cancellation after an early callback, with observerThrows=%s', async (observerThrows) => {
    const controller = new AbortController()
    let hold = true
    mockRpc((method, params, id, signal) => {
      if (method !== 'eth_getLogs') return undefined
      if (id === 143 && hold) return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }))
      return [log()]
    })
    const onChainResult = vi.fn(() => { if (observerThrows) throw new Error('Observer failed') })
    const poller = createAgoraPoller([chain(1), chain(143)])
    const pending = poller.poll({ signal: controller.signal, onChainResult })
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(onChainResult).toHaveBeenCalledOnce())
    controller.abort()
    await rejection
    hold = false
    const recovered = await poller.poll()
    expect(recovered.transfers.map((row) => row.chainId)).toEqual(observerThrows ? [1, 143] : [143])
  })
  it('resumes at the last scanned block when the batch budget is exhausted, even if the head moves', async () => {
    let head = 10
    const calls = mockRpc((method) => method === 'eth_blockNumber' ? hex(head) : undefined)
    const poller = createAgoraPoller([chain()], { initialLookback: 4, blockWindow: 2, maxLogBatchesPerChain: 1 })
    await poller.poll()
    head = 30
    await poller.poll()
    expect(calls.filter((call) => call.method === 'eth_getLogs').map((call) => call.params[0])).toMatchObject([
      { fromBlock: '0x6', toBlock: '0x7' }, { fromBlock: '0x8', toBlock: '0x9' },
    ])
  })
  it('queues overflowing logs instead of dropping everything past the UI batch size', async () => {
    const calls = mockRpc((method) => method === 'eth_getLogs' ? Array.from({ length: 5 }, (_, index) => log({ index })) : undefined)
    const poller = createAgoraPoller([chain()], { maxLogsPerChain: 2 })
    const batches = [await poller.poll(), await poller.poll(), await poller.poll()]
    expect(batches.map((batch) => batch.transfers.map((row) => row.logIndex))).toEqual([[0, 1], [2, 3], [4]])
    expect(calls.filter((call) => call.method === 'eth_getLogs')).toHaveLength(1)
  })
  it('keeps successful batches on a later RPC failure and retries the failed range', async () => {
    let fail = true
    const calls = mockRpc((method, params) => method === 'eth_getLogs'
      ? params[0].fromBlock === '0x8' && fail ? new Error('Temporary RPC outage') : [log({ block: Number(BigInt(params[0].fromBlock)), index: Number(BigInt(params[0].fromBlock)) })]
      : undefined)
    const poller = createAgoraPoller([chain()], { initialLookback: 4, blockWindow: 2, retryDelayMs: 0 })
    const first = await poller.poll()
    expect(first.transfers.map((row) => row.blockNumber)).toEqual([6])
    expect(first.chainStatus[0]).toMatchObject({ status: 'error', lastScannedBlock: 7 })
    fail = false
    const second = await poller.poll()
    expect(second.transfers.map((row) => row.blockNumber)).toEqual([8, 10])
    expect(calls.filter((call) => call.method === 'eth_getLogs')[2].params[0].fromBlock).toBe('0x8')
  })
  it('reports partial chain failure honestly and never sorts unrelated chains by block height', async () => {
    mockRpc((method, params, id) => {
      if (id === 1) return new Error('Ethereum unavailable')
      if (method === 'eth_getLogs') return [log({ block: 10 })]
    })
    const result = await createAgoraPoller([chain(143), chain(1)]).poll()
    expect(result.transfers.map((row) => row.chainId)).toEqual([143])
    expect(result.chainStatus.map((row) => row.status)).toEqual(['live', 'error'])
    expect(result.scannedChains).toBe(1)
    mockRpc((method, params, id) => method === 'eth_blockNumber' ? hex(id === 1 ? 5000 : 10) : method === 'eth_getLogs' ? [log({ block: id === 1 ? 5000 : 10 })] : undefined)
    const both = await createAgoraPoller([chain(143), chain(1)]).poll()
    expect(both.transfers.map((row) => row.chainId)).toEqual([143, 1])
  })
  it('isolates scene cursors and coalesces overlapping polls', async () => {
    let release
    const delay = new Promise((resolve) => { release = resolve })
    const calls = mockRpc(async (method) => { if (method === 'eth_getLogs') { await delay; return [log()] } })
    const first = createAgoraPoller([chain()])
    const pending = first.poll()
    const same = first.poll()
    expect(same).toBe(pending)
    release()
    await pending
    await createAgoraPoller([chain()]).poll()
    expect(calls.filter((call) => call.method === 'eth_getLogs')).toHaveLength(2)
  })
  it('cancels without draining queued transfers that were never returned to the caller', async () => {
    const controller = new AbortController()
    let abort = true
    mockRpc((method) => {
      if (method === 'eth_getLogs') {
        if (abort) controller.abort()
        return [log()]
      }
    })
    const poller = createAgoraPoller([chain()])
    await expect(poller.poll({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    abort = false
    const result = await poller.poll()
    expect(result.transfers).toHaveLength(1)
  })
  it('preserves a completed chain queue if another chain is cancelled before the aggregate returns', async () => {
    const controller = new AbortController()
    let hold = true
    const calls = mockRpc((method, params, id, signal) => {
      if (method !== 'eth_getLogs') return undefined
      if (id === 143 && hold) return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }))
      return [log()]
    })
    const poller = createAgoraPoller([chain(1), chain(143)])
    const pending = poller.poll({ signal: controller.signal })
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(poller.getStatus()[0].lastScannedBlock).toBe(10))
    controller.abort()
    await rejection
    hold = false
    const recovered = await poller.poll()
    expect(recovered.transfers.map((row) => row.chainId)).toEqual([1, 143])
    expect(calls.filter((call) => call.method === 'eth_getLogs' && call.id === 1)).toHaveLength(1)
  })
  it('does not report live or repeatedly restart an oversized range when range retries consume the budget', async () => {
    const calls = mockRpc((method, params) => {
      if (method === 'eth_blockNumber') return '0x64'
      if (method === 'eth_getLogs' && Number(BigInt(params[0].toBlock) - BigInt(params[0].fromBlock)) > 0) return new Error('Block range limit exceeded')
    })
    const poller = createAgoraPoller([chain()], { initialLookback: 9, blockWindow: 8, maxLogBatchesPerChain: 2 })
    const first = await poller.poll()
    expect(first.chainStatus[0].status).not.toBe('live')
    await poller.poll()
    expect(calls.filter((call) => call.method === 'eth_getLogs').map((call) => Number(BigInt(call.params[0].toBlock) - BigInt(call.params[0].fromBlock)))).toEqual([7, 3, 1, 0])
  })
  it('rejects an endpoint serving the wrong chain without presenting its logs as AUSD activity', async () => {
    const calls = mockRpc((method) => method === 'eth_chainId' ? '0xa' : undefined)
    const result = await createAgoraPoller([chain(1)]).poll()
    expect(result.chainStatus[0]).toMatchObject({ status: 'error', lastSuccessAt: null })
    expect(result.transfers).toEqual([])
    expect(calls.some((call) => call.method === 'eth_getLogs')).toBe(false)
  })
  it('reset invalidates an unfinished scan without letting it replace the next session cursor', async () => {
    let releaseOld
    const oldLogs = new Promise((resolve) => { releaseOld = resolve })
    let logRequests = 0
    mockRpc((method) => {
      if (method === 'eth_getLogs') return ++logRequests === 1 ? oldLogs : [log({ index: 2 })]
    })
    const poller = createAgoraPoller([chain()])
    const old = poller.poll()
    const rejection = expect(old).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(logRequests).toBe(1))
    poller.reset()
    const current = await poller.poll()
    releaseOld([log({ index: 1 })])
    await rejection
    expect(current.transfers.map((row) => row.logIndex)).toEqual([2])
    expect((await poller.poll()).transfers).toEqual([])
    expect(poller.getStatus()[0].lastScannedBlock).toBe(10)
  })
})
