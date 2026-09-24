import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PerplMarkets, PerplTradeTable, PerplMarketContext } from '../TerminalPerpl'

const BTC = { id: 1, symbol: 'BTC', priceDecimals: 1, sizeDecimals: 5, lastPrice: 83500.3 }
const HYPE = { id: 40, symbol: 'HYPE', priceDecimals: 5, sizeDecimals: 2, lastPrice: 48.12345 }
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
const visible = (html) => html.replace(/<[^>]*>/g, '')
const trade = (market, props = {}) => ({ id: `trade:${market.id}`, marketId: market.id, symbol: market.symbol, price: market.lastPrice, size: 0.00007, notional: 5.85, side: 'buy', ts: 1000, ...props })

describe('Perpl configured precision', () => {
  it('renders tiny BTC lots as readable decimals and groups large prices', () => {
    const html = render(PerplTradeTable, { rows: [trade(BTC)], markets: [BTC] })
    expect(html).toContain('>0.00007</td>')
    expect(html).toContain('>83,500.3</td>')
    expect(html).toContain('title="0.00007 BTC"')
    expect(visible(html)).not.toMatch(/7(?:\.00)?e-5/)
  })

  it('preserves the configured fifth HYPE price digit across market, tape and context', () => {
    const markets = render(PerplMarkets, { markets: [HYPE] })
    const tape = render(PerplTradeTable, { markets: [HYPE], rows: [trade(HYPE, { size: 12.34 })] })
    const context = render(PerplMarketContext, { market: { ...HYPE, markPrice: 48.12346, indexPrice: 48.12347, bid: 48.12344, ask: 48.12348 } })
    expect(markets).toContain('>48.12345</td>')
    expect(tape).toContain('>48.12345</td>')
    expect(tape).toContain('>12.34</td>')
    for (const amount of ['48.12345', '48.12346', '48.12347', '48.12344', '48.12348']) expect(context).toContain(`>${amount} AUSD</dd>`)
  })

  it('uses size precision for base statistics while keeping absent values unknown', () => {
    const html = render(PerplMarketContext, { market: { ...BTC, volume24hBase: 0.00007, openInterestBase: 0, markPrice: null, fundingRatePct: 0.004, fundingIntervalSeconds: 2580 } })
    expect(html).toContain('<dt>24h base volume</dt><dd>0.00007</dd>')
    expect(html).toContain('<dt>Open interest, base</dt><dd>0</dd>')
    expect(html).toContain('<dt>Mark price</dt><dd>—</dd>')
    expect(html).toContain('+0.0040% / 43m')
    expect(visible(html)).not.toContain('$')
  })

  it('bounds unsupported precision and handles missing metadata without crashing', () => {
    const highPrecision = { ...BTC, priceDecimals: 36, sizeDecimals: 36, lastPrice: 0.0000001 }
    const html = render(PerplTradeTable, { markets: [highPrecision], rows: [trade(highPrecision)] })
    expect(html).toContain('>0.0000001</td>')
    const unknown = render(PerplTradeTable, { rows: [trade(BTC, { price: null, size: null })], markets: [] })
    expect(unknown).toContain('title="Price unavailable">—</td>')
    expect(unknown).toContain('title="Size unavailable">—</td>')
    const fallback = render(PerplTradeTable, { rows: [trade(HYPE)] })
    expect(fallback).toContain('>48.12345</td>')
    expect(fallback).toContain('>0.00007</td>')
  })

  it('keeps integer precision without forced fractions', () => {
    const market = { ...BTC, priceDecimals: 0, sizeDecimals: 0, lastPrice: 1250 }
    const html = render(PerplTradeTable, { rows: [trade(market, { size: 3 })], markets: [market] })
    expect(html).toContain('>1,250</td>')
    expect(html).toContain('>3</td>')
  })
})
