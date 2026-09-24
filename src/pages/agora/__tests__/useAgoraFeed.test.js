import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchAgoraData: vi.fn(), createAgoraPoller: vi.fn(), poll: vi.fn(), store: null,
}))

vi.mock('react', () => ({
  useSyncExternalStore: (subscribe, getSnapshot, getServerSnapshot) => {
    mocks.store = { subscribe, getSnapshot, getServerSnapshot }
    return getSnapshot()
  },
}))
vi.mock('../../../utils/agoraApi', () => ({
  fetchAgoraData: mocks.fetchAgoraData,
  createAgoraPoller: mocks.createAgoraPoller,
}))

const chains = [{ chainId: 1, chainName: 'Ethereum' }, { chainId: 143, chainName: 'Monad' }]
const data = { chains, cities: [{ city: 'London', country: 'UK', lat: 51, lon: 0 }, { city: 'Tokyo', country: 'Japan', lat: 35, lon: 139 }] }
const row = (index, overrides = {}) => ({
  chainId: 1, chainName: 'Ethereum', txHash: `0x${index.toString(16).padStart(64, '0')}`,
  logIndex: 0, blockNumber: index, from: `0x${'1'.repeat(40)}`, to: `0x${'2'.repeat(40)}`,
  amount: index, receivedAt: 100_000 + index, ...overrides,
})
const result = (transfers = [], chainStatus = []) => ({ transfers, chainStatus })
const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
let subscriptions
let visibilityDocument

function subscribe(store, notify = vi.fn()) {
  const release = store.subscribe(notify)
  let active = true
  const unsubscribe = () => {
    if (!active) return
    active = false
    release()
  }
  subscriptions.push(unsubscribe)
  return { unsubscribe, notify }
}

async function mount() {
  const module = await import('../useAgoraFeed')
  module.useAgoraFeed()
  const store = mocks.store
  const subscription = subscribe(store)
  await vi.advanceTimersByTimeAsync(0)
  return { ...module, store, ...subscription }
}

function setHidden(hidden) {
  visibilityDocument.hidden = hidden
  visibilityDocument.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
  subscriptions = []
  visibilityDocument = Object.assign(new EventTarget(), { hidden: false })
  vi.stubGlobal('document', visibilityDocument)
  mocks.fetchAgoraData.mockResolvedValue(data)
  mocks.poll.mockReset().mockResolvedValue(result())
  mocks.createAgoraPoller.mockReturnValue({ poll: mocks.poll })
})

afterEach(async () => {
  for (const unsubscribe of subscriptions) unsubscribe()
  await vi.advanceTimersByTimeAsync(1500)
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Agora shared live feed lifecycle', () => {
  it('keeps one feed and its history across a 2D to 3D subscription handoff', async () => {
    mocks.poll.mockResolvedValueOnce(result([row(1)]))
    const { store, unsubscribe } = await mount()
    const initial = store.getSnapshot()
    expect(initial.history).toHaveLength(1)
    unsubscribe()
    await vi.advanceTimersByTimeAsync(100)
    const nextView = subscribe(store)
    expect(store.getSnapshot()).toBe(initial)
    await vi.advanceTimersByTimeAsync(1500)
    expect(mocks.fetchAgoraData).toHaveBeenCalledTimes(1)
    expect(mocks.createAgoraPoller).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().history[0].txHash).toBe(row(1).txHash)
    expect(nextView.notify).toHaveBeenCalled()
  })

  it('never overlaps a slow poll with refreshes or visibility changes', async () => {
    const pending = deferred()
    mocks.poll.mockReturnValueOnce(pending.promise)
    const { refreshAgoraFeed } = await mount()
    refreshAgoraFeed()
    refreshAgoraFeed()
    setHidden(true)
    setHidden(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(mocks.poll).toHaveBeenCalledTimes(1)
    pending.resolve(result([row(1)]))
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1199)
    expect(mocks.poll).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.poll).toHaveBeenCalledTimes(2)
  })

  it('aborts disposal and ignores old callbacks and completions after a new mount', async () => {
    const pending = deferred()
    mocks.poll.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(result([row(2)]))
    const { store, unsubscribe } = await mount()
    const oldOptions = mocks.poll.mock.calls[0][0]
    unsubscribe()
    await vi.advanceTimersByTimeAsync(1500)
    expect(oldOptions.signal.aborted).toBe(true)
    expect(store.getSnapshot().nodes).toEqual([])
    subscribe(store)
    await vi.advanceTimersByTimeAsync(0)
    oldOptions.onChainResult(result([row(1)]))
    pending.resolve(result([row(1)]))
    await vi.advanceTimersByTimeAsync(20)
    expect(mocks.createAgoraPoller).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot().history.map((entry) => entry.txHash)).toEqual([row(2).txHash])
  })

  it('ignores metadata that resolves after the last subscriber has gone', async () => {
    const pending = deferred()
    mocks.fetchAgoraData.mockReturnValueOnce(pending.promise)
    const { store, unsubscribe } = await mount()
    const signal = mocks.fetchAgoraData.mock.calls[0][0]
    unsubscribe()
    await vi.advanceTimersByTimeAsync(1500)
    expect(signal.aborted).toBe(true)
    pending.resolve(data)
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.createAgoraPoller).not.toHaveBeenCalled()
    expect(store.getSnapshot().nodes).toEqual([])
  })

  it('combines per-chain arrivals within 16ms and does not replay the final round result', async () => {
    const pending = deferred()
    mocks.poll.mockReturnValueOnce(pending.promise)
    const { store } = await mount()
    const { onChainResult } = mocks.poll.mock.calls[0][0]
    const first = row(1)
    const second = row(2, { chainId: 143, chainName: 'Monad' })
    onChainResult(result([first], [{ chainId: 1, status: 'live', lastSuccessAt: 100_000 }]))
    await vi.advanceTimersByTimeAsync(8)
    onChainResult(result([second], [{ chainId: 143, status: 'live', lastSuccessAt: 100_008 }]))
    await vi.advanceTimersByTimeAsync(7)
    expect(store.getSnapshot().batch.id).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    const published = store.getSnapshot().batch
    expect(published.id).toBe(1)
    expect(published.transfers.map((entry) => entry.txHash)).toEqual([second.txHash, first.txHash])
    expect(store.getSnapshot().chainStatus.every((status) => status.status === 'live')).toBe(true)
    pending.resolve(result([first, second]))
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getSnapshot().batch).toBe(published)
    expect(store.getSnapshot().history).toHaveLength(2)
  })

  it('keeps older chain backlog below newer history and bounds both history and batches', async () => {
    const pending = deferred()
    mocks.poll.mockReturnValueOnce(pending.promise)
    const { store } = await mount()
    const { onChainResult } = mocks.poll.mock.calls[0][0]
    onChainResult(result([row(1000, { receivedAt: 200_000, chainId: 143 })]))
    await vi.advanceTimersByTimeAsync(16)
    onChainResult(result(Array.from({ length: 180 }, (_, index) => row(index + 1, { receivedAt: 150_000 }))))
    await vi.advanceTimersByTimeAsync(16)
    const snapshot = store.getSnapshot()
    expect(snapshot.history).toHaveLength(150)
    expect(snapshot.history[0].blockNumber).toBe(1000)
    expect(snapshot.history[1].blockNumber).toBe(180)
    expect(snapshot.batch.transfers).toHaveLength(64)
    expect(new Set(snapshot.history.map((entry) => entry.id)).size).toBe(150)
  })

  it('stops scheduled polling while hidden and resumes once without losing received history', async () => {
    mocks.poll.mockResolvedValueOnce(result([row(1)]))
    const { store } = await mount()
    setHidden(true)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(mocks.poll).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().history).toHaveLength(1)
    setHidden(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.poll).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1200)
    expect(mocks.poll).toHaveBeenCalledTimes(3)
  })

  it('finishes an in-flight hidden poll without starting another until visibility returns', async () => {
    const pending = deferred()
    mocks.poll.mockReturnValueOnce(pending.promise)
    const { store } = await mount()
    const { onChainResult } = mocks.poll.mock.calls[0][0]
    onChainResult(result([row(1)]))
    setHidden(true)
    expect(store.getSnapshot().history).toHaveLength(1)
    pending.resolve(result([row(1), row(2)]))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(mocks.poll).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().history).toHaveLength(2)
    setHidden(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.poll).toHaveBeenCalledTimes(2)
  })
})
