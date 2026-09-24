import { describe, expect, it } from 'vitest'
import { NATIVE, WMON } from '../constants'
import { terminalTokenImage, terminalTradeLegs } from '../terminalTokenVisuals'

const token = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const USDC = '0x754704bc059f8c67012fed69bc8a327a5aafb603'

describe('terminal token artwork', () => {
  it('uses shipped verified native and wrapped MON artwork', () => {
    expect(terminalTokenImage(NATIVE)).toBe('/monad_logo.png')
    expect(terminalTokenImage(WMON.toUpperCase())).toBe('/monad_logo.png')
    expect(terminalTokenImage(USDC, 'https://example.org/other.png')).toBe('/usdc.avif')
  })

  it('resolves discovered images by contract address without guessing from ticker', () => {
    expect(terminalTokenImage(token, null, { [token]: 'https://example.org/token.png' })).toBe('https://example.org/token.png')
    expect(terminalTokenImage(token.toUpperCase(), null, new Map([[token, 'https://example.org/token.png']]))).toBe('https://example.org/token.png')
    expect(terminalTokenImage(token)).toBeNull()
  })

  it('rejects unsupported image URLs and falls back to a usable supplied image', () => {
    expect(terminalTokenImage(token, '/valid.png', { [token]: 'javascript:alert(1)' })).toBe('/valid.png')
    expect(terminalTokenImage(token, '//example.org/logo.png')).toBeNull()
    expect(terminalTokenImage(token, 'data:text/html,test')).toBeNull()
  })
})

describe('terminal observed trade legs', () => {
  const indexed = { kind: 'swap', token, symbol: 'TOKEN', amount: 4, quoteToken: USDC, quoteSymbol: 'USDC', quoteAmount: 12 }
  it('reconstructs indexed buys and sells in actual sold-to-bought order', () => {
    const buy = terminalTradeLegs({ ...indexed, side: 'buy' })
    const sell = terminalTradeLegs({ ...indexed, side: 'sell' })
    expect(buy.sold).toEqual({ address: USDC, symbol: 'USDC', amount: 12 })
    expect(buy.bought).toEqual({ address: token, symbol: 'TOKEN', amount: 4 })
    expect(sell).toEqual({ sold: buy.bought, bought: buy.sold })
  })

  it('keeps explicit missing legs missing, even if legacy fields suggest a pair', () => {
    const bought = { address: token, symbol: 'TOKEN', amount: null }
    expect(terminalTradeLegs({ ...indexed, side: 'buy', kind: 'flow', sold: null, bought })).toEqual({ sold: null, bought })
    expect(terminalTradeLegs({ ...indexed, side: 'buy', sold: null })).toEqual({ sold: null, bought: null })
  })

  it('preserves unknown quantities and does not infer flow or LP legs from side', () => {
    expect(terminalTradeLegs({ ...indexed, side: 'buy', amount: null }).bought.amount).toBeNull()
    expect(terminalTradeLegs({ ...indexed, kind: 'flow', side: 'sell' })).toEqual({ sold: null, bought: null })
    expect(terminalTradeLegs({ ...indexed, kind: 'add', side: 'buy' })).toEqual({ sold: null, bought: null })
  })
})
