import { describe, expect, it } from 'vitest'
import { activityFromSearch, filterChainRows, filterMarketRows, marketFromSearch, mergeSearchPools, paginateRows, selectionLabel, summarizeWalletTransfers } from '../terminalView'

describe('terminal browsing', () => {
  it('preserves Home activity deep links and falls back safely for TVL or unknown tabs', () => {
    expect(activityFromSearch('?tab=Transfers')).toBe('transfers')
    expect(activityFromSearch('?tab=blocks&token=abc')).toBe('blocks')
    expect(activityFromSearch('?tab=swaps')).toBe('swaps')
    expect(activityFromSearch('?tab=Perp')).toBe('perp')
    expect(activityFromSearch('?tab=tvl')).toBe('swaps')
    expect(activityFromSearch('?tab=other')).toBe('swaps')
  })
  it('keeps market and activity deep links independent while accepting legacy TVL links', () => {
    expect(activityFromSearch('?tab=blocks&market=tvl')).toBe('blocks')
    expect(marketFromSearch('?tab=blocks&market=tvl')).toBe('tvl')
    expect(marketFromSearch('?tab=TVL')).toBe('tvl')
    expect(marketFromSearch('?tab=transfers&market=wallets')).toBe('wallets')
    expect(marketFromSearch('?market=invalid')).toBe('pools')
  })
  it('searches native transfers and scopes either participant without treating an amount as a dollar price', () => {
    const rows = [
      { hash: '0xtxA', from: '0xAAA', to: '0xbbb', blockNumber: 123, amount: 2 },
      { hash: '0xtxB', from: '0xccc', to: '0xAAA', blockNumber: 124, amount: 3 },
      { hash: '0xtxC', from: '0xddd', to: '0xeee', blockNumber: 125, amount: 4 },
    ]
    expect(filterChainRows(rows, 'transfers', '', '0xaaa')).toEqual(rows.slice(0, 2))
    expect(filterChainRows(rows, 'transfers', '124', '0xaaa')).toEqual([rows[1]])
    expect(filterChainRows(rows, 'transfers', 'MON')).toEqual(rows)
    expect(filterChainRows(rows, 'transfers', '0xtxc')).toEqual([rows[2]])
    expect(filterChainRows(rows, 'transfers', 'missing')).toEqual([])
  })
  it('searches block numbers, hashes and validator metadata independently from wallet selection', () => {
    const rows = [{ number: 456, hash: '0xabc', proposerId: 12, proposerValidator: { name: 'Monad Validator' } }, { number: 457 }]
    expect(filterChainRows(rows, 'blocks', '#456')).toEqual([rows[0]])
    expect(filterChainRows(rows, 'blocks', 'validator')).toEqual([rows[0]])
    expect(filterChainRows(rows, 'blocks', '457', 'irrelevant-wallet')).toEqual([rows[1]])
  })
  it('summarizes retained native transfers for the inspected wallet, including self transfers once', () => {
    expect(summarizeWalletTransfers([
      { from: '0xa', to: '0xb', amount: 2, ts: 10 },
      { from: '0xc', to: '0xA', amount: 3, ts: 30 },
      { from: '0xa', to: '0xa', amount: 1, ts: 20 },
      { from: '0xb', to: '0xc', amount: 100, ts: 40 },
      { from: '0xb', to: '0xa', amount: null, ts: 50 },
    ], '0xA')).toEqual({ count: 3, incoming: 2, outgoing: 2, received: 4, sent: 3, lastTs: 30 })
  })
  it('never mounts more than18rows and clamps the page when filters shrink results', () => {
    const rows = Array.from({ length: 420 }, (_, id) => ({ id }))
    expect(paginateRows(rows, 1).rows).toHaveLength(18)
    expect(paginateRows(rows, 24)).toMatchObject({ page: 24, pages: 24, start: 415, end: 420 })
    expect(paginateRows(rows.slice(0, 2), 24)).toMatchObject({ page: 1, start: 1, end: 2 })
    expect(paginateRows([], 10)).toMatchObject({ page: 1, start: 0, end: 0, rows: [] })
  })
  it('combines venue and text filtering including token contract addresses', () => {
    const rows = [{ pair: 'MON / AUSD', dexId: 'dex1', base: { address: '0xABC' } }, { pair: 'MON / AUSD', dexId: 'dex2' }]
    expect(filterMarketRows(rows, 'mon', 'dex1')).toHaveLength(1)
    expect(filterMarketRows(rows, '0xabc')).toEqual([rows[0]])
    expect(filterMarketRows(rows, 'missing')).toEqual([])
  })
  it('deduplicates local and remote search results by pool address', () => {
    expect(mergeSearchPools([{ address: 'pool', pair: 'original' }], [{ address: 'pool', pair: 'remote' }, { address: 'second' }])).toEqual([{ address: 'pool', pair: 'original' }, { address: 'second' }])
  })
  it('uses the newest coherent pool across discovery and search, regardless of address case', () => {
    const local = { address: '0xabc', fetchedAt: 20, price: 2, tvl: 100 }
    const remote = { address: '0xABC', fetchedAt: 30, price: 1, tvl: 50 }
    expect(mergeSearchPools([local], [remote])).toEqual([remote])
    expect(mergeSearchPools([remote], [local])).toEqual([remote])
  })
  it('gives selected filters a useful label even if metadata is missing', () => {
    expect(selectionLabel({ type: 'token', id: '0x123456789abc' }, [], [{ token: '0x123456789abc', symbol: 'MON' }])).toBe('MON')
    expect(selectionLabel({ type: 'pool', id: '0x123456789abc' }, [], [])).toBe('0x1234…9abc')
  })
})
