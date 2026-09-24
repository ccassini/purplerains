import { afterEach, describe, expect, test, vi } from 'vitest'
import { accountFills } from '../accounting'
import {
  createTerminalFillStore,
  createTerminalPublisher,
  createTerminalPollLoop,
  collectTerminalTransactions,
} from '../terminalPerformance'

const fill = (id, ts = Number(id)) => ({ id: String(id), ts, wallet: 'wallet', token: 'token', kind: 'swap', side: 'buy', amount: 1, usd: 10 })
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }
afterEach(() => vi.useRealTimers())

describe('terminal fill publication', () => {
  test('100 arriving fills cause one ledger computation and preserve every fill in the batch', () => {
    vi.useFakeTimers()
    const store = createTerminalFillStore({ capacity: 900 })
    const compute = vi.fn(() => accountFills(store.snapshot(), { nowMs: 1000, windowMs: Infinity }))
    const publisher = createTerminalPublisher(compute, { intervalMs: 500 })
    for (let n = 1; n <= 100; n += 1) {
      store.add(fill(n))
      publisher.request()
      vi.advanceTimersByTime(4)
    }
    expect(compute).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(compute).toHaveBeenCalledTimes(1)
    expect(compute.mock.results[0].value.traders[0]).toMatchObject({ fills: 100, volume: 1000 })
    publisher.dispose()
  })

  test('retains the newest fills despite out-of-order arrivals and remembers evicted IDs', () => {
    const store = createTerminalFillStore({ capacity: 3 })
    for (const n of [6, 2, 5, 1, 4, 3]) store.add(fill(n))
    expect(store.snapshot().map((f) => f.id)).toEqual(['6', '5', '4'])
    expect(store.add(fill(1))).toBe(false)
    expect(store.session.fills).toBe(6)
    expect(store.session.usd).toBe(60)
    expect(store.size).toBe(3)
  })

  test('a busy block with identical timestamps retains its most recently observed fills', () => {
    const store = createTerminalFillStore({ capacity: 3 })
    for (const n of [1, 2, 3, 4, 5]) store.add(fill(n, 1000))
    expect(store.snapshot().map((f) => f.id).sort()).toEqual(['3', '4', '5'])
  })

  test('same-timestamp fills keep their observed order for accounting when log indices are unavailable', () => {
    const store = createTerminalFillStore({ capacity: 3 })
    store.add({ ...fill('buy', 1000), amount: 2, usd: 20 })
    store.add({ ...fill('sell', 1000), side: 'sell', amount: 2, usd: 30 })
    const books = accountFills(store.snapshot(), { nowMs: 2000, windowMs: Infinity })
    expect(books.closed).toHaveLength(1)
    expect(books.closed[0].pnl_usd).toBe(10)
  })

  test('keeps unpublished storage bounded during a hidden tab burst', () => {
    const store = createTerminalFillStore({ capacity: 3 })
    for (let n = 0; n < 1000; n += 1) store.add(fill(n))
    expect(store.size).toBeLessThanOrEqual(6)
    expect(store.snapshot().map((f) => f.id)).toEqual(['999', '998', '997'])
  })

  test('hidden publication is coalesced until resume and disposed work cannot publish', () => {
    vi.useFakeTimers()
    const publish = vi.fn()
    const publisher = createTerminalPublisher(publish, { intervalMs: 500 })
    publisher.request()
    publisher.setActive(false)
    vi.advanceTimersByTime(5000)
    expect(publish).not.toHaveBeenCalled()
    publisher.request()
    publisher.setActive(true)
    expect(publish).toHaveBeenCalledTimes(1)
    publisher.request()
    publisher.dispose()
    vi.advanceTimersByTime(1000)
    expect(publish).toHaveBeenCalledTimes(1)
  })

  test('does not mark an incomplete chain transaction processed before later enrichment', () => {
    const processed = new Set()
    const ingest = vi.fn()
    const tx = { hash: '0x1', category: 'defi', timestamp: 1000 }
    collectTerminalTransactions([tx], { processed, ingest })
    expect(processed.size).toBe(0)
    tx.baseSymbol = 'USDC'; tx.baseAmount = 10; tx.baseTokenAddress = '0xusd'
    tx.quoteSymbol = 'MEME'; tx.quoteAmount = 2; tx.quoteTokenAddress = '0xmeme'
    tx.baseDecimals = 6; tx.baseDecimalsVerified = true
    tx.quoteDecimals = 18; tx.quoteDecimalsVerified = true
    collectTerminalTransactions([tx], { processed, ingest })
    collectTerminalTransactions([tx], { processed, ingest })
    expect(ingest).toHaveBeenCalledTimes(1)
    expect(ingest.mock.calls[0][0]).toMatchObject({ usd: 10, amount: 2, side: 'buy' })
  })
})

describe('selected pool retention', () => {
  const indexed = (id, ts, pool = '0xglobal') => ({ ...fill(id, ts), source: 'gecko', pool })

  test('reserves up to 100 old selected-pool trades within the same global capacity', () => {
    const store = createTerminalFillStore({ capacity: 900 })
    for (let i = 0; i < 900; i += 1) store.add(indexed(`new:${i}`, 10000 + i))
    store.snapshot()
    expect(store.setPriorityPool('0xSELECTED')).toBe(true)
    expect(store.dirty).toBe(true)
    for (let i = 0; i < 100; i += 1) store.add(indexed(`old:${i}`, i, '0xselected'))
    const rows = store.snapshot()
    expect(rows).toHaveLength(900)
    expect(rows.filter((row) => row.pool === '0xselected')).toHaveLength(100)
    expect(rows.filter((row) => row.pool === '0xglobal')).toHaveLength(800)
    expect(rows[0].id).toBe('new:899')
    expect(store.add(indexed('old:0', 0, '0xselected'))).toBe(false)
    expect(store.session.fills).toBe(1000)
    expect(store.setPriorityPool('0xselected')).toBe(false)
    expect(store.dirty).toBe(false)
  })

  test('reserves only a quarter of a smaller store and clearing returns to normal retention', () => {
    const store = createTerminalFillStore({ capacity: 8 })
    store.setPriorityPool('0xselected')
    for (let i = 0; i < 8; i += 1) store.add(indexed(`old:${i}`, i, '0xselected'))
    for (let i = 0; i < 8; i += 1) store.add(indexed(`new:${i}`, 100 + i))
    const rows = store.snapshot()
    expect(rows).toHaveLength(8)
    expect(rows.filter((row) => row.pool === '0xselected').map((row) => row.id)).toEqual(['old:7', 'old:6'])
    expect(store.setPriorityPool(null)).toBe(true)
    store.add(indexed('latest:0', 200)); store.add(indexed('latest:1', 201))
    expect(store.snapshot()).toHaveLength(8)
    expect(store.snapshot().some((row) => row.pool === '0xselected')).toBe(false)
  })

  test('priority protects the authoritative reconciled event without double counting its chain observation', () => {
    const store = createTerminalFillStore({ capacity: 4 })
    store.setPriorityPool('0xselected')
    const event = { ...indexed('g:swap', 1, '0xselected'), tx: 'tx', wallet: 'w', token: 't', quoteToken: 'q', quoteAmount: 10 }
    store.add({ ...event, id: 'c:swap', source: 'chain', pool: '0xrouter' })
    store.add(event)
    for (let i = 0; i < 8; i += 1) store.add(indexed(`new:${i}`, 100 + i))
    const rows = store.snapshot()
    expect(rows).toHaveLength(4)
    expect(rows.find((row) => row.id === 'g:swap').sources).toEqual(['chain', 'gecko'])
    expect(store.session.fills).toBe(9)
    expect(store.retainedObservationCount).toBe(5)
  })
})

describe('terminal serialized polling', () => {
  test('a slow request never overlaps scheduled or manual refreshes', async () => {
    vi.useFakeTimers()
    const first = deferred()
    const run = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue(undefined)
    const loop = createTerminalPollLoop(run, { intervalMs: 1000 })
    loop.start()
    await vi.advanceTimersByTimeAsync(5000)
    loop.refresh(); loop.refresh()
    expect(run).toHaveBeenCalledTimes(1)
    first.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(run).toHaveBeenCalledTimes(2)
    loop.dispose()
  })

  test('hide aborts the active request and resume waits for its cleanup before restarting', async () => {
    vi.useFakeTimers()
    const first = deferred()
    const signals = []
    const run = vi.fn((signal) => { signals.push(signal); return signals.length === 1 ? first.promise : Promise.resolve() })
    const loop = createTerminalPollLoop(run, { intervalMs: 1000 })
    loop.start()
    loop.setActive(false)
    expect(signals[0].aborted).toBe(true)
    loop.setActive(true)
    expect(run).toHaveBeenCalledTimes(1)
    first.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(run).toHaveBeenCalledTimes(2)
    loop.dispose()
    expect(signals[1].aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(run).toHaveBeenCalledTimes(2)
  })

  test('a rejected request is retried without an unhandled rejection and dispose cancels timers', async () => {
    vi.useFakeTimers()
    const run = vi.fn().mockRejectedValue(new Error('network unavailable'))
    const loop = createTerminalPollLoop(run, { intervalMs: 1000 })
    loop.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(run).toHaveBeenCalledTimes(2)
    loop.dispose()
    await vi.advanceTimersByTimeAsync(5000)
    expect(run).toHaveBeenCalledTimes(2)
  })
})

describe('cross-source fill reconciliation', () => {
  const observation = (source, id, extra = {}) => ({
    id, source, tx: '0xtx', wallet: '0xwallet', token: '0xasset', quoteToken: '0xusd',
    side: 'buy', kind: 'swap', ts: 1000, amount: 10, quoteAmount: 100, usd: 100,
    price: 10, pool: source === 'gecko' ? '0xpool' : '0xrouter', ...extra,
  })
  test.each([['chain', 'gecko'], ['gecko', 'chain']])('counts one economic event for %s then %s and ignores repeated polls', (first, second) => {
    const store = createTerminalFillStore()
    const c = observation('chain', 'c:tx')
    const g = observation('gecko', 'g:event', { usd: 100.06, price: 10.006 })
    const bySource = { chain: c, gecko: g }
    store.add(bySource[first]); store.add(bySource[second])
    const rows = store.snapshot()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'g:event', source: 'gecko', usd: 100.06, amount: 10, pool: '0xpool' })
    expect(rows[0].sources).toEqual(['chain', 'gecko'])
    expect(store.session.fills).toBe(1)
    expect(store.session.usd).toBeCloseTo(100.06)
    expect(store.add(c)).toBe(false)
    expect(store.add(g)).toBe(false)
    const books = accountFills(rows, { nowMs: 2000 })
    expect(books.traders[0].volume).toBeCloseTo(100.06)
    expect(books.openPositions[0].qty).toBe(10)
  })

  test('preserves separate swap logs within one transaction', () => {
    const store = createTerminalFillStore()
    for (const index of [7, 9]) {
      store.add(observation('chain', `c:${index}`, { logIndex: index }))
      store.add(observation('gecko', `g:${index}`, { logIndex: index }))
    }
    expect(store.snapshot()).toHaveLength(2)
    expect(store.session.fills).toBe(2)
    expect(store.session.usd).toBe(200)
  })

  test.each([['c', 'g1', 'g2'], ['g1', 'g2', 'c']])('keeps ambiguous same-sized observations separate in arrival order %j', (...order) => {
    const store = createTerminalFillStore()
    const input = { c: observation('chain', 'c'), g1: observation('gecko', 'g1'), g2: observation('gecko', 'g2') }
    for (const key of order) store.add(input[key])
    expect(store.snapshot().map((row) => row.id).sort()).toEqual(['c', 'g1', 'g2'])
    expect(store.session.fills).toBe(3)
    expect(store.session.usd).toBe(300)
  })

  test.each([
    { side: 'sell' }, { token: '0xother' }, { wallet: '0xother' }, { quoteToken: '0xother' },
    { amount: 11 }, { logIndex: 9 }, { amount: null, quoteAmount: null, usd: null },
  ])('does not merge incompatible or insufficient observations: %j', (change) => {
    const store = createTerminalFillStore()
    store.add(observation('chain', 'c', { logIndex: 7 }))
    store.add(observation('gecko', 'g', change))
    expect(store.snapshot()).toHaveLength(2)
  })

  test('an exact shared log can replace incomplete chain metadata without adding a second event', () => {
    const store = createTerminalFillStore()
    store.add(observation('chain', 'c', { logIndex: 7, amount: null, quoteAmount: null, usd: null, price: null }))
    store.add(observation('gecko', 'g', { logIndex: 7 }))
    expect(store.snapshot()).toHaveLength(1)
    expect(store.session).toMatchObject({ fills: 1, usd: 100 })
  })

  test('keeps exact log evidence authoritative when a same-sized unindexed event is also present', () => {
    const store = createTerminalFillStore()
    store.add(observation('chain', 'c', { logIndex: 7 }))
    store.add(observation('gecko', 'g', { logIndex: 7 }))
    store.add(observation('gecko', 'g-other'))
    expect(store.snapshot().map((row) => row.id).sort()).toEqual(['g', 'g-other'])
    expect(store.session.fills).toBe(2)
  })

  test('evicting an ambiguous old event cannot manufacture a unique match later', () => {
    const store = createTerminalFillStore({ capacity: 3 })
    store.add(observation('gecko', 'g-old', { ts: 1 }))
    store.add(observation('gecko', 'g', { ts: 2 }))
    store.add(observation('chain', 'c', { ts: 3 }))
    store.add(fill('unrelated', 4))
    store.snapshot()
    store.add(observation('gecko', 'g-new', { amount: 12, ts: 5 }))
    expect(store.snapshot().map((row) => row.id)).toContain('c')
    expect(store.session.fills).toBe(5)
  })

  test('late verified quantity upgrades the retained chain observation without counting it twice', () => {
    const store = createTerminalFillStore()
    const processed = new Set()
    const tx = {
      hash: 'late', category: 'defi', timestamp: 1000, from: '0xwallet',
      baseSymbol: 'USDC', baseAmount: 100, baseTokenAddress: '0xusd', baseDecimals: 6, baseDecimalsVerified: true,
      quoteSymbol: 'TOKEN', quoteAmount: 1e-9, quoteTokenAddress: '0xasset', quoteDecimals: 18, quoteDecimalsVerified: false,
    }
    const collect = () => collectTerminalTransactions([tx], { processed, ingest: (row) => store.add(row) })
    collect()
    expect(store.snapshot()[0].amount).toBeNull()
    collect()
    expect(store.dirty).toBe(false)
    tx.quoteAmount = 10; tx.quoteDecimals = 8; tx.quoteDecimalsVerified = true
    collect()
    expect(store.snapshot()[0]).toMatchObject({ amount: 10, price: 10 })
    expect(store.session).toMatchObject({ fills: 1, usd: 100 })
    expect(store.lastChange.newEvents).toBe(0)
    expect(processed.size).toBe(1)
  })

  test('an unknown cash quantity can gain verified USD later without losing the original timestamp', () => {
    const store = createTerminalFillStore()
    const processed = new Set()
    const tx = {
      hash: 'late-cash', category: 'defi', timestamp: 1000, from: '0xwallet',
      baseSymbol: 'TOKEN', baseAmount: 10, baseTokenAddress: '0xasset', baseDecimals: 18, baseDecimalsVerified: true,
      quoteSymbol: 'USDC', quoteAmount: 1e-10, quoteTokenAddress: '0xusd', quoteDecimals: 18, quoteDecimalsVerified: false,
    }
    const collect = () => collectTerminalTransactions([tx], { processed, ingest: (row) => store.add(row) })
    collect()
    expect(store.snapshot()[0]).toMatchObject({ amount: 10, usd: null })
    tx.quoteAmount = 100; tx.quoteDecimals = 6; tx.quoteDecimalsVerified = true; tx.timestamp = 2000
    collect()
    expect(store.snapshot()[0]).toMatchObject({ ts: 1000, amount: 10, usd: 100, price: 10, priced: 'cash_leg' })
    expect(store.session).toMatchObject({ fills: 1, usd: 100 })
    expect(store.lastChange.newEvents).toBe(0)
  })

  test('source observations and event groups stay bounded across prolonged ingestion', () => {
    const store = createTerminalFillStore({ capacity: 3 })
    for (let i = 0; i < 1000; i += 1) {
      store.add(observation('chain', `c:${i}`, { tx: `tx:${i}`, ts: i }))
      store.add(observation('gecko', `g:${i}`, { tx: `tx:${i}`, ts: i }))
    }
    expect(store.size).toBeLessThanOrEqual(6)
    expect(store.snapshot()).toHaveLength(3)
    expect(store.session).toMatchObject({ fills: 1000, usd: 100000 })
    expect(store.retainedObservationCount).toBeLessThanOrEqual(12)
    expect(store.retainedGroupCount).toBeLessThanOrEqual(6)
  })
})

describe('restored RPC retention', () => {
  test('upgrades a one-leg observation without duplicate counts', () => {
    const store = createTerminalFillStore()
    const processed = new Set()
    const tx = { hash: '0xupgrade', category: 'defi', value: '3', timestamp: 1000, from: 'wallet' }
    const collect = (row) => collectTerminalTransactions([row], { processed, ingest: (row) => store.add(row) })
    collect(tx)
    expect(store.snapshot()[0]).toMatchObject({ kind: 'flow', side: null })
    expect(processed.size).toBe(0)
    collect({ ...tx, quoteAmount: 10, quoteSymbol: 'TOKEN', quoteTokenAddress: 'token', quoteDecimals: 18, quoteDecimalsVerified: true })
    expect(store.snapshot()).toHaveLength(1)
    expect(store.snapshot()[0]).toMatchObject({ kind: 'swap', side: 'buy', symbol: 'TOKEN', amount: 10, ts: 1000 })
    expect(store.session.fills).toBe(1)
    expect(store.lastChange.newEvents).toBe(0)
    collect(tx)
    expect(store.snapshot()[0].kind).toBe('swap')
  })
  test('indexed snapshots cannot evict all live RPC observations', () => {
    const store = createTerminalFillStore({ capacity: 9 })
    for (let n = 0; n < 3; n++) store.add({ ...fill(`rpc${n}`, n), source: 'chain' })
    for (let n = 0; n < 20; n++) store.add({ ...fill(`index${n}`, 100 + n), source: 'gecko' })
    const rows = store.snapshot()
    expect(rows).toHaveLength(9)
    expect(rows.filter((row) => row.source === 'chain')).toHaveLength(3)
  })
})

describe('late receipt corrections', () => {
  test('replaces native fallback with a coherent decoded single leg', () => {
    const store = createTerminalFillStore()
    const processed = new Set()
    const tx = { hash: '0xpartial', category: 'defi', value: '1', timestamp: 1000 }
    const collect = (row) => collectTerminalTransactions([row], { processed, ingest: (r) => store.add(r) })
    collect(tx)
    collect({ ...tx, baseSymbol: 'USDC', baseAmount: 10, baseTokenAddress: 'usdc', baseDecimals: 6, baseDecimalsVerified: true })
    expect(store.snapshot()[0]).toMatchObject({ kind: 'flow', symbol: 'USDC', amount: 10, sold: { symbol: 'USDC', amount: 10 } })
    expect(store.session.fills).toBe(1)
    collect(tx)
    expect(store.snapshot()[0].symbol).toBe('USDC')
  })
  test('invalidates a previously published raw row when its receipt fails', () => {
    const store = createTerminalFillStore()
    const processed = new Set()
    const tx = { hash: '0xfail', category: 'defi', value: '1', timestamp: 1000 }
    const collect = (row) => collectTerminalTransactions([row], { processed, ingest: (r) => store.add(r), remove: (id) => store.remove(id) })
    collect(tx)
    expect(store.snapshot()).toHaveLength(1)
    collect({ ...tx, status: 'reverted' })
    expect(store.snapshot()).toHaveLength(0)
    expect(store.session.fills).toBe(0)
    collect(tx)
    expect(store.snapshot()).toHaveLength(0)
  })
})

test('removing a rejected RPC observation preserves independent indexed evidence', () => {
  const store = createTerminalFillStore()
  const event = { ...fill('c:tx', 1000), tx: 'tx', quoteToken: 'quote', quoteAmount: 10, block: 1, logIndex: 2, source: 'chain' }
  store.add(event)
  store.add({ ...event, id: 'g:tx', source: 'gecko' })
  expect(store.snapshot()[0].sources).toEqual(['chain', 'gecko'])
  expect(store.remove('c:tx')).toBe(true)
  expect(store.snapshot()).toHaveLength(1)
  expect(store.snapshot()[0]).toMatchObject({ id: 'g:tx', source: 'gecko' })
  expect(store.snapshot()[0].sources).toBeUndefined()
  expect(store.session.fills).toBe(1)
})

test('raw native replay cannot fill an unknown decoded-token quantity with MON', () => {
  const store = createTerminalFillStore()
  const processed = new Set()
  const tx = { hash: '0xunverified', category: 'defi', value: '1', timestamp: 1000 }
  const collect = (row) => collectTerminalTransactions([row], { processed, ingest: (r) => store.add(r) })
  collect(tx)
  collect({ ...tx, baseSymbol: 'TKN', baseAmount: 10, baseTokenAddress: 'token', baseDecimals: 18, baseDecimalsVerified: false })
  collect(tx)
  expect(store.snapshot()[0]).toMatchObject({ kind: 'flow', symbol: 'TKN', token: 'token', amount: null, sold: { symbol: 'TKN', amount: null } })
})
