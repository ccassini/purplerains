import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TerminalTable from '../TerminalTable'
import TerminalChainTable from '../TerminalChainTable'

const token = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const USDC = '0x754704bc059f8c67012fed69bc8a327a5aafb603'
const hash = `0x${'f'.repeat(64)}`
const fill = { id: 'one', kind: 'swap', side: 'buy', ts: 0, token, symbol: 'TOKEN', amount: 4, quoteToken: USDC, quoteSymbol: 'USDC', quoteAmount: 12, usd: 12, wallet: token, tx: hash }
const renderTape = (rows, extra = {}) => renderToStaticMarkup(createElement(TerminalTable, { rows, type: 'feed', page: 1, onSelect: () => {}, ...extra }))

describe('restored terminal trade artwork and amounts', () => {
  it('renders both known and provider artwork, ordered legs and quantities', () => {
    const html = renderTape([fill], { tokenImages: { [token]: 'https://example.org/token.png' } })
    expect(html).toContain('src="/usdc.avif"')
    expect(html).toContain('src="https://example.org/token.png"')
    expect(html.indexOf('Sold 12 USDC')).toBeLessThan(html.indexOf('Bought 4 TOKEN'))
    expect(html).toContain('>12.00</span>')
    expect(html).toContain('>4.00</span>')
  })

  it('labels a partial flow honestly without fabricating its other leg', () => {
    const html = renderTape([{ ...fill, kind: 'flow', side: null, sold: null, bought: { address: token, symbol: 'TOKEN', amount: null } }])
    expect(html).toContain('DEX flow')
    expect(html).toContain('Sold token unavailable')
    expect(html).toContain('Bought unknown quantity of TOKEN')
    expect(html).not.toContain('/usdc.avif')
  })

  it('retains the eighteen-row render cap', () => {
    const html = renderTape(Array.from({ length: 25 }, (_, index) => ({ ...fill, id: String(index) })))
    expect((html.match(/class="term-trade-path"/g) || []).length).toBe(18)
  })

  it('marks MON contract and unknown-calldata values without labelling plain transfers', () => {
    const rows = ['transfer', 'contract-value', 'native-value'].map((kind, index) => ({ id: index, kind, amount: 1, from: token, to: token, hash, ts: 0, methodSignature: '0x12345678' }))
    const html = renderToStaticMarkup(createElement(TerminalChainTable, { rows, type: 'transfers', explorer: 'https://monadvision.com' }))
    expect((html.match(/src="\/monad_logo.png"/g) || []).length).toBe(3)
    expect((html.match(/class="term-chain-value-kind"/g) || []).length).toBe(2)
    expect(html).toContain('Contract value')
    expect(html).toContain('MON value')
    expect(html).toContain('0x12345678')
  })
})
