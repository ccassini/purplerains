import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import StakingCalculator from '../../StakingCalculatorPage'

const network = { networkStats: { grossApr: 10, activeStaked: 1e9 }, lastUpdated: 2000, sourceUpdatedAt: 1000 }
const render = (props = {}) => renderToStaticMarkup(createElement(StakingCalculator, { network, ...props }))

describe('calculator embedded in the staking document', () => {
  it('renders a wallet-free section from the shared network rate without standalone navigation', () => {
    const refresh = vi.fn()
    const html = render({ network: { ...network, refresh } })
    expect(html).toContain('id="calculator"')
    expect(html).toContain('No wallet connection required.')
    expect(html).toContain('+900')
    expect(html).toContain('href="#validators"')
    expect(html).not.toMatch(/<h1|<nav|sc-page|sc-shell|Connect wallet/)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('offers explicit imports while retaining manual/default inputs until clicked', () => {
    const html = render({ selectedValidator: { id: 1, name: 'Example validator', hasChainData: true, commissionBps: 750 }, stakeAmount: '123.456789012345678901' })
    expect(html).toContain('Use validator commission')
    expect(html).toContain('>7.5%</strong>')
    expect(html).toContain('Use stake amount')
    expect(html).toMatch(/id="sc-amount"[^>]*value="10000"/)
    expect(html).toMatch(/id="sc-commission"[^>]*value="10"/)
    expect(html).toContain('Apply your selected validator and stake amount to this scenario.')
  })

  it('keeps manual scenarios available when the network quote is missing', () => {
    const html = render({ network: { loading: false, networkStats: { grossApr: null }, refresh: () => {} } })
    expect(html).toContain('Network estimate unavailable. Enter your own APR.')
    expect(html).toContain('+450')
    expect(html).toContain('Manual APR and commission are scenario inputs.')
    expect(html).not.toContain('Invalid Date')
  })

  it('labels retained estimates stale and does not pretend loading is a zero APR', () => {
    const stale = render({ network: { ...network, dataError: 'offline' } })
    expect(stale).toContain('Last verified network estimate')
    expect(stale).toContain('+900')
    const loading = render({ network: { loading: true, networkStats: {} } })
    expect(loading).toContain('Preparing your estimate')
    expect(loading).not.toContain('sc-outcome-value')
  })
})
