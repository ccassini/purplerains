import { describe, expect, it } from 'vitest'
import { homeSearchForView, homeViewFromSearch, legacyCalculatorTarget, legacyHomeTarget } from '../homeNavigation'

describe('Home view navigation', () => {
  it('defaults to Terminal and reads Price independently of activity and market tabs', () => {
    expect(homeViewFromSearch('')).toBe('terminal')
    expect(homeViewFromSearch('?tab=price')).toBe('terminal')
    expect(homeViewFromSearch('?view=unknown&tab=perp')).toBe('terminal')
    expect(homeViewFromSearch('?view=PRICE&tab=blocks&market=wallets')).toBe('price')
  })

  it('preserves activity, market, and repeated unrelated parameters across a round trip', () => {
    const original = '?tab=transfers&market=wallets&tag=one&tag=two&query=MON%2FUSD'
    const price = homeSearchForView(original, 'price')
    expect(homeViewFromSearch(price)).toBe('price')
    expect([...new URLSearchParams(price)]).toEqual([
      ['tab', 'transfers'], ['market', 'wallets'], ['tag', 'one'], ['tag', 'two'], ['query', 'MON/USD'], ['view', 'price'],
    ])
    expect(homeSearchForView(price, 'terminal')).toBe(original)
  })

  it('removes every explicit view for the default instead of leaving stale duplicate values', () => {
    expect(homeSearchForView('?view=price&tab=perp&view=terminal', 'terminal')).toBe('?tab=perp')
    expect(homeSearchForView('?view=price', 'terminal')).toBe('')
    expect(homeSearchForView('', 'terminal')).toBe('')
    expect(homeSearchForView('?view=unknown', 'unknown')).toBe('')
  })

  it('replaces duplicate view values when choosing Price', () => {
    const next = homeSearchForView('?view=terminal&view=unknown&tab=blocks', 'price')
    expect(new URLSearchParams(next).getAll('view')).toEqual(['price'])
    expect(new URLSearchParams(next).get('tab')).toBe('blocks')
    expect(homeSearchForView('', 'price')).toBe('?view=price')
  })
})

describe('legacy route destinations', () => {
  it('redirects Price into Home without losing the existing query or anchor', () => {
    const location = { pathname: '/price', search: '?tab=swaps&market=tvl&view=terminal', hash: '#venues' }
    const copy = { ...location }
    expect(legacyHomeTarget(location, 'price')).toEqual({ pathname: '/', search: '?tab=swaps&market=tvl&view=price', hash: '#venues' })
    expect(location).toEqual(copy)
  })

  it('redirects legacy Terminal deep links into the default Home view', () => {
    expect(legacyHomeTarget({ pathname: '/terminal', search: '?view=price&tab=blocks', hash: '#activity' }, 'terminal'))
      .toEqual({ pathname: '/', search: '?tab=blocks', hash: '#activity' })
    expect(legacyHomeTarget({}, 'terminal')).toEqual({ pathname: '/', search: '', hash: '' })
  })

  it('opens the merged calculator section while preserving the query exactly', () => {
    expect(legacyCalculatorTarget({ search: '?amount=1000&label=MON%20stake', hash: '' }))
      .toEqual({ pathname: '/staking', search: '?amount=1000&label=MON%20stake', hash: '#calculator' })
    expect(legacyCalculatorTarget()).toEqual({ pathname: '/staking', search: '', hash: '#calculator' })
  })

  it('preserves an existing calculator anchor instead of overwriting a deep link', () => {
    expect(legacyCalculatorTarget({ search: '?amount=25', hash: '#assumptions' }))
      .toEqual({ pathname: '/staking', search: '?amount=25', hash: '#assumptions' })
  })
})
