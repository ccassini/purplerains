import { asNum } from './format'
import { isLpFill, isSwapFill } from './deriveFill'

const FLAT_EPS = 1e-10

function bump(map, key, init) {
  let row = map.get(key)
  if (!row) {
    row = init()
    map.set(key, row)
  }
  return row
}

function markUsd(marks, token) {
  if (!token) return null
  return asNum(marks?.[token]?.usd)
}

/**
 * FIFO episode accounting over observed fills.
 *
 * A position is (wallet, token). Buys open/increase an episode; sells consume
 * quantity FIFO. When inventory returns to flat, one closed-trade row is
 * emitted for the whole episode — not per sell — matching rhtrenches.
 *
 * Missing USD is left null. It is never coerced to zero. An unknown quantity
 * invalidates the wallet/token's remaining inventory for this observed window;
 * later fills cannot prove that balance flat without an independent balance.
 *
 * @param {Array<Record<string, any>>} fills
 * @param {{ nowMs?: number, windowMs?: number, marks?: Record<string, { usd?: number, mcap?: number, symbol?: string }> }} [opts]
 */
export function accountFills(fills, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now()
  const windowMs = opts.windowMs ?? Number.POSITIVE_INFINITY
  const marks = opts.marks || {}
  const cutoff = Number.isFinite(windowMs) ? nowMs - windowMs : 0

  const scoped = (fills || []).filter((f) => Number.isFinite(f?.ts) && f.ts >= cutoff)
  const ordered = scoped.slice().sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts
    return (a.logIndex ?? 0) - (b.logIndex ?? 0)
  })

  const positions = new Map()
  const incompletePositions = new Set()
  const traders = new Map()
  const tokens = new Map()
  const closed = []
  let biggestBuy = null

  const touchTrader = (fill) => {
    if (!fill.wallet) return null
    return bump(traders, fill.wallet, () => ({
      address: fill.wallet,
      volume: 0,
      fills: 0,
      buys: 0,
      sells: 0,
      last_ts: 0,
      realized_pnl: 0,
      realized_n: 0,
      closed_trades: 0,
      wins: 0,
      best_trade: null,
      worst_trade: null,
      open_bags: 0,
      open_cost: 0,
      open_value: 0,
      unpriced_bags: 0,
      incomplete_positions: 0,
      unrealized_pnl: 0,
      net_pnl: 0,
      win_rate: null,
      symbols: new Set(),
    }))
  }

  const touchToken = (fill) => {
    if (!fill.token) return null
    const row = bump(tokens, fill.token, () => ({
      token: fill.token,
      symbol: fill.symbol || null,
      traders: new Set(),
      buyers: new Set(),
      usd_in: 0,
      usd_out: 0,
      first_ts: fill.ts,
      last_ts: fill.ts,
      first_buyer: null,
      mark: null,
      mcap: null,
      net_usd: null,
    }))
    if (!row.symbol && fill.symbol) row.symbol = fill.symbol
    row.last_ts = Math.max(row.last_ts, fill.ts)
    row.first_ts = Math.min(row.first_ts, fill.ts)
    if (fill.wallet) row.traders.add(fill.wallet)
    return row
  }

  for (const fill of ordered) {
    const usd = asNum(fill.usd)
    const trader = touchTrader(fill)
    const tokenRow = touchToken(fill)

    if (trader) {
      trader.fills += 1
      trader.last_ts = Math.max(trader.last_ts, fill.ts)
      if (fill.symbol) trader.symbols.add(fill.symbol)
      if (usd != null) trader.volume += Math.abs(usd)
    }

    if (isLpFill(fill)) continue
    if (!isSwapFill(fill) || !fill.wallet || !fill.token) continue

    if (fill.side === 'buy') {
      if (trader) trader.buys += 1
      if (tokenRow) {
        if (fill.wallet) tokenRow.buyers.add(fill.wallet)
        if (usd != null) tokenRow.usd_in += usd
        if (!tokenRow.first_buyer) {
          tokenRow.first_buyer = { ts: fill.ts, wallet: fill.wallet, symbol: fill.symbol, usd }
        }
      }
      if (usd != null && (!biggestBuy || usd > biggestBuy.usd)) {
        biggestBuy = { usd, ts: fill.ts, wallet: fill.wallet, symbol: fill.symbol, token: fill.token }
      }
    } else if (trader) {
      trader.sells += 1
      if (tokenRow && usd != null) tokenRow.usd_out += usd
    }

    const key = `${fill.wallet}::${fill.token}`
    const qty = asNum(fill.amount)
    if (qty == null || qty <= 0) {
      // USD volume is still evidence, but cannot become a cost basis or sale
      // proceeds without the corresponding token quantity. Forget any partial
      // inventory so a later known sell cannot manufacture a closed episode.
      if (!incompletePositions.has(key)) {
        incompletePositions.add(key)
        if (trader) trader.incomplete_positions += 1
      }
      positions.delete(key)
      continue
    }
    if (incompletePositions.has(key)) continue

    const pos = bump(positions, key, () => ({
      wallet: fill.wallet,
      token: fill.token,
      symbol: fill.symbol || null,
      qty: 0,
      cost: 0,
      openedTs: fill.ts,
      buys: 0,
      sells: 0,
      paidIn: 0,
      gotOut: 0,
      pricedBuys: 0,
      pricedSells: 0,
    }))
    if (!pos.symbol && fill.symbol) pos.symbol = fill.symbol

    if (fill.side === 'buy') {
      pos.buys += 1
      if (qty != null && qty > 0) pos.qty += qty
      if (usd != null) {
        pos.cost += usd
        pos.paidIn += usd
        pos.pricedBuys += 1
      }
    } else {
      pos.sells += 1
      if (usd != null) {
        pos.gotOut += usd
        pos.pricedSells += 1
      }
      const sellQty = qty != null && qty > 0 ? Math.min(qty, pos.qty) : 0
      let costSold = null
      if (sellQty > 0 && pos.qty > 0 && pos.pricedBuys > 0) {
        costSold = pos.cost * (sellQty / pos.qty)
        pos.qty -= sellQty
        pos.cost = Math.max(0, pos.cost - costSold)
      } else if (qty != null && qty > 0) {
        pos.qty = Math.max(0, pos.qty - qty)
      }

      if (usd != null && costSold != null && trader) {
        const realized = usd - costSold
        trader.realized_pnl += realized
        trader.realized_n += 1
      }

      if (pos.qty <= FLAT_EPS) {
        const pnl = pos.pricedBuys && pos.pricedSells ? pos.gotOut - pos.paidIn : null
        const episode = {
          wallet: pos.wallet,
          token: pos.token,
          symbol: pos.symbol,
          opened_ts: pos.openedTs,
          closed_ts: fill.ts,
          paid_in: pos.pricedBuys ? pos.paidIn : null,
          got_out: pos.pricedSells ? pos.gotOut : null,
          pnl_usd: pnl,
          pnl_pct: pnl != null && pos.paidIn > 0 ? (pnl / pos.paidIn) * 100 : null,
          buys: pos.buys,
          sells: pos.sells,
          fills: pos.buys + pos.sells,
          hold_seconds: (fill.ts - pos.openedTs) / 1000,
        }
        closed.push(episode)
        if (trader && pnl != null) {
          trader.closed_trades += 1
          if (pnl > 0) trader.wins += 1
          trader.best_trade = trader.best_trade == null ? pnl : Math.max(trader.best_trade, pnl)
          trader.worst_trade = trader.worst_trade == null ? pnl : Math.min(trader.worst_trade, pnl)
        }
        positions.delete(key)
      }
    }
  }

  const openPositions = []
  for (const pos of positions.values()) {
    if (pos.qty <= FLAT_EPS) continue
    const mark = markUsd(marks, pos.token)
    const value = mark != null ? pos.qty * mark : null
    const unreal = value != null && pos.pricedBuys ? value - pos.cost : null
    openPositions.push({
      wallet: pos.wallet,
      token: pos.token,
      symbol: pos.symbol,
      qty: pos.qty,
      cost: pos.pricedBuys ? pos.cost : null,
      value,
      unrealized: unreal,
      opened_ts: pos.openedTs,
      buys: pos.buys,
      sells: pos.sells,
    })
    const trader = traders.get(pos.wallet)
    if (trader) {
      trader.open_bags += 1
      if (pos.pricedBuys) trader.open_cost += pos.cost
      if (value != null) trader.open_value += value
      else trader.unpriced_bags += 1
      if (unreal != null) trader.unrealized_pnl += unreal
    }
  }

  for (const trader of traders.values()) {
    const realized = trader.realized_n ? trader.realized_pnl : null
    const unreal = trader.open_bags && trader.unpriced_bags < trader.open_bags ? trader.unrealized_pnl : trader.open_bags === 0 ? 0 : null
    trader.realized_pnl = realized
    trader.unrealized_pnl = trader.open_bags === 0 ? 0 : unreal
    trader.net_pnl =
      realized != null && trader.unrealized_pnl != null ? realized + trader.unrealized_pnl : realized != null && trader.open_bags === 0 ? realized : null
    trader.win_rate = trader.closed_trades > 0 ? trader.wins / trader.closed_trades : null
    if (trader.incomplete_positions) {
      // Verified earlier episodes remain inspectable, but partial subtotals
      // must not masquerade as this wallet's complete observed P/L/inventory.
      trader.realized_pnl = null
      trader.unrealized_pnl = null
      trader.net_pnl = null
      trader.open_cost = null
      trader.open_value = null
    }
    trader.symbols = [...trader.symbols]
  }

  for (const token of tokens.values()) {
    token.traders_n = token.traders.size
    token.buyers_n = token.buyers.size
    token.traders = undefined
    token.buyers = undefined
    const mark = marks[token.token]
    token.mark = asNum(mark?.usd)
    token.mcap = asNum(mark?.mcap)
    token.liquidity = asNum(mark?.liquidity)
    token.change24 = asNum(mark?.change24)
    token.pair_url = mark?.pairUrl || null
    token.net_usd = token.usd_in - token.usd_out
  }

  closed.sort((a, b) => b.closed_ts - a.closed_ts)

  return {
    traders: [...traders.values()],
    tokens: [...tokens.values()],
    closed,
    openPositions,
    biggestBuy,
  }
}

export function sortTraders(rows, sortId) {
  const list = rows.slice()
  const key = sortId || 'realized_pnl'
  list.sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    const an = av == null ? -Infinity : av
    const bn = bv == null ? -Infinity : bv
    if (bn !== an) return bn - an
    return (b.last_ts || 0) - (a.last_ts || 0)
  })
  return list
}

export function overviewFromBooks({ fills, windowId, books, nowMs }) {
  const tape = fills || []
  let buys = 0
  let sells = 0
  let volume = 0
  let bought = 0
  let sold = 0
  let last5mBuys = 0
  let last5mSells = 0
  let last5mVol = 0
  const cutoff5 = nowMs - 5 * 60_000
  const wallets = new Set()
  const tokenSet = new Set()

  for (const f of tape) {
    if (f.wallet) wallets.add(f.wallet)
    if (f.token) tokenSet.add(f.token)
    const usd = asNum(f.usd)
    if (usd != null) volume += Math.abs(usd)
    if (f.side === 'buy') {
      buys += 1
      if (usd != null) bought += usd
      if (f.ts >= cutoff5) {
        last5mBuys += 1
        if (usd != null) last5mVol += usd
      }
    } else if (f.side === 'sell') {
      sells += 1
      if (usd != null) sold += usd
      if (f.ts >= cutoff5) {
        last5mSells += 1
        if (usd != null) last5mVol += usd
      }
    }
  }

  const closed = books.closed || []
  const pricedClosed = closed.filter((c) => c.pnl_usd != null)
  const wins = pricedClosed.filter((c) => c.pnl_usd > 0)
  const realized = pricedClosed.reduce((s, c) => s + c.pnl_usd, 0)
  const traders = books.traders || []
  let unreal = 0
  let unrealKnown = false
  let openBags = 0
  let openCost = 0
  let openValue = 0
  let incompletePositions = 0
  for (const t of traders) {
    openBags += t.open_bags
    if (t.open_cost != null) openCost += t.open_cost
    if (t.open_value != null) openValue += t.open_value
    incompletePositions += t.incomplete_positions || 0
    if (t.unrealized_pnl != null) {
      unreal += t.unrealized_pnl
      unrealKnown = true
    }
  }

  const biggestWin = pricedClosed.slice().sort((a, b) => b.pnl_usd - a.pnl_usd)[0] || null

  return {
    window: windowId,
    fills: tape.length,
    buys,
    sells,
    active_traders: wallets.size,
    tokens: tokenSet.size,
    volume: volume || null,
    bought: bought || null,
    sold: sold || null,
    realized_pnl: !incompletePositions && pricedClosed.length ? realized : null,
    unrealized_pnl: !incompletePositions && unrealKnown ? unreal : null,
    net_pnl: incompletePositions ? null : pricedClosed.length && unrealKnown ? realized + unreal : pricedClosed.length && openBags === 0 ? realized : null,
    open_bags: openBags,
    incomplete_positions: incompletePositions,
    open_cost: incompletePositions ? null : openCost || null,
    open_value: incompletePositions ? null : openValue || null,
    closed_trades: closed.length,
    win_rate: pricedClosed.length ? wins.length / pricedClosed.length : null,
    biggest_win: biggestWin,
    biggest_buy: books.biggestBuy || null,
    last_5m: { buys: last5mBuys, sells: last5mSells, volume: last5mVol || null },
  }
}
