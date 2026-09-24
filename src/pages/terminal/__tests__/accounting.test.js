import { describe, expect, test } from 'vitest'
import { accountFills, overviewFromBooks, sortTraders } from '../accounting'

const wallet = '0xabc'
const token = '0xtoken'

function fill(partial) {
  return {
    id: partial.id,
    ts: partial.ts,
    tx: partial.id,
    side: partial.side,
    kind: 'swap',
    usd: partial.usd,
    amount: partial.amount,
    wallet,
    token,
    symbol: 'MEME',
    logIndex: partial.logIndex ?? 0,
  }
}

describe('accountFills', () => {
  test('a buy then a flat sell emits one closed episode, not one row per sell', () => {
    const books = accountFills(
      [
        fill({ id: 'a', ts: 1000, side: 'buy', usd: 100, amount: 10 }),
        fill({ id: 'b', ts: 2000, side: 'sell', usd: 150, amount: 10 }),
      ],
      { nowMs: 3000, windowMs: Infinity },
    )
    expect(books.closed).toHaveLength(1)
    expect(books.closed[0].paid_in).toBe(100)
    expect(books.closed[0].got_out).toBe(150)
    expect(books.closed[0].pnl_usd).toBe(50)
    expect(books.closed[0].hold_seconds).toBe(1)
    expect(books.openPositions).toHaveLength(0)
    expect(books.traders[0].realized_pnl).toBe(50)
    expect(books.traders[0].closed_trades).toBe(1)
    expect(books.traders[0].wins).toBe(1)
  })

  test('two sells that flatten still collapse into a single episode', () => {
    const books = accountFills(
      [
        fill({ id: 'a', ts: 1, side: 'buy', usd: 100, amount: 10 }),
        fill({ id: 'b', ts: 2, side: 'sell', usd: 40, amount: 4 }),
        fill({ id: 'c', ts: 3, side: 'sell', usd: 90, amount: 6 }),
      ],
      { nowMs: 4, windowMs: Infinity },
    )
    expect(books.closed).toHaveLength(1)
    expect(books.closed[0].fills).toBe(3)
    expect(books.closed[0].pnl_usd).toBe(30)
  })

  test('an open bag reports unrealized P/L only when a mark exists', () => {
    const fills = [fill({ id: 'a', ts: 1, side: 'buy', usd: 100, amount: 10 })]
    const unmarked = accountFills(fills, { nowMs: 2, windowMs: Infinity, marks: {} })
    expect(unmarked.openPositions[0].unrealized).toBeNull()
    expect(unmarked.traders[0].unpriced_bags).toBe(1)

    const marked = accountFills(fills, {
      nowMs: 2,
      windowMs: Infinity,
      marks: { [token]: { usd: 20 } },
    })
    expect(marked.openPositions[0].value).toBe(200)
    expect(marked.openPositions[0].unrealized).toBe(100)
    expect(marked.traders[0].unrealized_pnl).toBe(100)
  })

  test('a fill with no USD does not become a zero-dollar trade', () => {
    const books = accountFills(
      [fill({ id: 'a', ts: 1, side: 'buy', usd: null, amount: 10 })],
      { nowMs: 2, windowMs: Infinity },
    )
    expect(books.traders[0].volume).toBe(0)
    expect(books.openPositions[0].cost).toBeNull()
  })

  test('the accounting window drops older fills', () => {
    const books = accountFills(
      [
        fill({ id: 'old', ts: 1, side: 'buy', usd: 100, amount: 1 }),
        fill({ id: 'new', ts: 1000, side: 'buy', usd: 5, amount: 1 }),
      ],
      { nowMs: 1100, windowMs: 200 },
    )
    expect(books.traders[0].fills).toBe(1)
    expect(books.traders[0].volume).toBe(5)
  })

  test.each([null, undefined, NaN, 0, -1])('unknown or invalid quantity %s retains flows without inventing a position', (amount) => {
    const fills = [fill({ id: 'unknown', ts: 1, side: 'buy', usd: 120, amount })]
    const books = accountFills(fills, { nowMs: 2, marks: { [token]: { usd: 20 } } })
    expect(books.openPositions).toEqual([])
    expect(books.closed).toEqual([])
    expect(books.traders[0]).toMatchObject({
      fills: 1, buys: 1, volume: 120, incomplete_positions: 1,
      realized_pnl: null, unrealized_pnl: null, net_pnl: null, open_cost: null, open_value: null,
    })
    expect(books.tokens[0]).toMatchObject({ usd_in: 120, usd_out: 0, net_usd: 120, traders_n: 1 })
    expect(books.biggestBuy.usd).toBe(120)
    const overview = overviewFromBooks({ fills, windowId: 'all', books, nowMs: 2 })
    expect(overview).toMatchObject({ volume: 120, fills: 1, bought: 120, net_pnl: null, unrealized_pnl: null, open_cost: null, open_value: null })
  })

  test.each(['buy', 'sell'])('an unknown-quantity %s invalidates existing inventory and later apparent closure', (side) => {
    const fills = [
      fill({ id: 'known-buy', ts: 1, side: 'buy', usd: 100, amount: 10 }),
      fill({ id: 'unknown', ts: 2, side, usd: 80, amount: null }),
      fill({ id: 'later-sell', ts: 3, side: 'sell', usd: 150, amount: 10 }),
    ]
    const books = accountFills(fills, { nowMs: 4, marks: { [token]: { usd: 20 } } })
    expect(books.openPositions).toEqual([])
    expect(books.closed).toEqual([])
    expect(books.traders[0]).toMatchObject({ fills: 3, volume: 330, incomplete_positions: 1, realized_pnl: null, unrealized_pnl: null, net_pnl: null })
    expect(books.tokens[0]).toMatchObject({ usd_in: side === 'buy' ? 180 : 100, usd_out: side === 'sell' ? 230 : 150 })
  })

  test('later valid quantities cannot establish a flat balance after an unknown opening fill', () => {
    const books = accountFills([
      fill({ id: 'unknown-buy', ts: 1, side: 'buy', usd: 500, amount: null }),
      fill({ id: 'known-buy', ts: 2, side: 'buy', usd: 100, amount: 10 }),
      fill({ id: 'known-sell', ts: 3, side: 'sell', usd: 130, amount: 10 }),
    ], { nowMs: 4 })
    expect(books.closed).toEqual([])
    expect(books.openPositions).toEqual([])
    expect(books.traders[0].net_pnl).toBeNull()
  })

  test('uncertainty is scoped to a wallet/token and preserves earlier verified closed episodes', () => {
    const fills = [
      fill({ id: 'first-buy', ts: 1, side: 'buy', usd: 100, amount: 10 }),
      fill({ id: 'first-sell', ts: 2, side: 'sell', usd: 150, amount: 10 }),
      fill({ id: 'unknown', ts: 3, side: 'sell', usd: 80, amount: null }),
      { ...fill({ id: 'other-buy', ts: 4, side: 'buy', usd: 100, amount: 10 }), wallet: '0xother' },
      { ...fill({ id: 'other-sell', ts: 5, side: 'sell', usd: 130, amount: 10 }), wallet: '0xother' },
      { ...fill({ id: 'other-token-buy', ts: 6, side: 'buy', usd: 20, amount: 2 }), token: '0xother-token' },
    ]
    const books = accountFills(fills, { nowMs: 7, marks: { '0xother-token': { usd: 15 } } })
    expect(books.closed.map((episode) => episode.pnl_usd)).toEqual([30, 50])
    expect(books.openPositions).toMatchObject([{ token: '0xother-token', qty: 2, cost: 20, value: 30, unrealized: 10 }])
    expect(books.traders.find((trader) => trader.address === '0xother')).toMatchObject({ realized_pnl: 30, net_pnl: 30, incomplete_positions: 0 })
    expect(books.traders.find((trader) => trader.address === wallet)).toMatchObject({ realized_pnl: null, unrealized_pnl: null, net_pnl: null, open_cost: null, open_value: null })
    const overview = overviewFromBooks({ fills, windowId: 'all', books, nowMs: 7 })
    expect(overview).toMatchObject({ realized_pnl: null, unrealized_pnl: null, net_pnl: null, open_cost: null, open_value: null, volume: 580, fills: 6, bought: 220, sold: 360 })
  })
})

describe('sortTraders / overview', () => {
  test('sorts unknown P/L below a real number', () => {
    const sorted = sortTraders(
      [
        { address: 'a', realized_pnl: null, last_ts: 2 },
        { address: 'b', realized_pnl: 1, last_ts: 1 },
      ],
      'realized_pnl',
    )
    expect(sorted[0].address).toBe('b')
  })

  test('overview win rate ignores unpriced closed episodes', () => {
    const fills = [
      fill({ id: 'a', ts: 1, side: 'buy', usd: 10, amount: 1 }),
      fill({ id: 'b', ts: 2, side: 'sell', usd: 12, amount: 1 }),
    ]
    const books = accountFills(fills, { nowMs: 3, windowMs: Infinity })
    const ov = overviewFromBooks({ fills, windowId: '24h', books, nowMs: 3 })
    expect(ov.closed_trades).toBe(1)
    expect(ov.win_rate).toBe(1)
    expect(ov.realized_pnl).toBe(2)
  })
})
