import { ADD_LIQ_SIGS, REMOVE_LIQ_SIGS, NATIVE, WMON } from './constants'
import { asNum } from './format'
import { KNOWN_TOKENS } from '../../utils/txEnrichment'

const STABLES = new Set(['USDC', 'USDT', 'USDT0', 'USDTO', 'AUSD', 'USD1', 'LVUSD', 'DAI', 'USDG'])
const MON_LIKE = new Set(['MON', 'WMON'])

function isStable(symbol) {
  const s = String(symbol || '').toUpperCase()
  return STABLES.has(s) || s.includes('USD')
}

function isMon(symbol) {
  return MON_LIKE.has(String(symbol || '').toUpperCase())
}

function nativeMon(value) {
  try {
    if (typeof value === 'bigint' || typeof value === 'string' && /^0x[\da-f]+$/i.test(value)) return Number(BigInt(value)) / 1e18
    return asNum(value)
  } catch { return null }
}

function chainLeg(tx, prefix) {
  const amount = asNum(tx[`${prefix}Amount`])
  const symbol = tx[`${prefix}Symbol`]
  if (!(amount > 0) || !symbol) return null
  const address = tx[`${prefix}TokenAddress`]?.toLowerCase() || null
  const decimals = tx[`${prefix}Decimals`]
  const provenance = tx[`${prefix}DecimalsVerified`]
  const known = KNOWN_TOKENS[address]
  const verified = provenance === true && Number.isInteger(decimals) && decimals >= 0 && decimals <= 255
    || provenance !== false && known && (decimals == null || decimals === known.decimals)
  // Keep the observed direction/token even when the decoded quantity is unknown.
  return { amount: verified ? amount : null, symbol, address }
}

function methodSig(tx) {
  const input = String(tx?.input || tx?.data || '0x').toLowerCase()
  return input.length >= 10 ? input.slice(0, 10) : '0x'
}

function lpKind(tx) {
  const sig = methodSig(tx)
  if (ADD_LIQ_SIGS.has(sig)) return 'add'
  if (REMOVE_LIQ_SIGS.has(sig)) return 'remove'
  return null
}

function tokenMeta(address, symbols) {
  if (!address) return { address: null, symbol: null }
  const key = String(address).toLowerCase()
  const symbol = symbols?.[key] || (key === NATIVE || key === WMON ? 'MON' : null)
  return { address: key, symbol }
}

/**
 * GeckoTerminal pool trade → canonical fill.
 * USD comes from the indexer's volume_in_usd; never inferred from raw token amounts.
 */
export function fillFromGeckoTrade(trade, ctx = {}) {
  const a = trade?.attributes || trade
  if (!a) return null
  const side = a.kind === 'sell' ? 'sell' : a.kind === 'buy' ? 'buy' : null
  if (!side) return null
  const tx = a.tx_hash
  if (!tx) return null

  const assetAddr = side === 'buy' ? a.to_token_address : a.from_token_address
  const quoteAddr = side === 'buy' ? a.from_token_address : a.to_token_address
  const amount = asNum(side === 'buy' ? a.to_token_amount : a.from_token_amount)
  const usd = asNum(a.volume_in_usd)
  const price = asNum(side === 'buy' ? a.price_to_in_usd : a.price_from_in_usd)
  const ts = Date.parse(a.block_timestamp)
  const quoteAmount = asNum(side === 'buy' ? a.from_token_amount : a.to_token_amount)
  const explicitIndex = asNum(a.log_index ?? trade?.log_index)
  const logIndex = Number.isSafeInteger(explicitIndex) && explicitIndex >= 0 ? explicitIndex : null
  const providerId = typeof trade?.id === 'string' && trade.id ? trade.id : null
  const pool = ctx.poolAddress ? String(ctx.poolAddress).toLowerCase() : null
  const baseAddress = ctx.baseAddress ? String(ctx.baseAddress).toLowerCase() : null
  const quoteAddress = ctx.quoteAddress ? String(ctx.quoteAddress).toLowerCase() : null
  const asset = tokenMeta(assetAddr, ctx.symbols)
  const quote = tokenMeta(quoteAddr, ctx.symbols)
  const contextSymbol = (address) => address && address === baseAddress ? ctx.baseSymbol : address && address === quoteAddress ? ctx.quoteSymbol : null
  asset.symbol ||= contextSymbol(asset.address) || null
  quote.symbol ||= contextSymbol(quote.address) || null
  // Provider IDs are opaque. Their underscore suffix is not a documented log index.
  const identity = logIndex != null
    ? JSON.stringify([String(tx).toLowerCase(), a.block_number ?? null, logIndex])
    : JSON.stringify([String(tx).toLowerCase(), a.block_number ?? null, side, asset.address, quote.address, amount, quoteAmount, Number.isFinite(ts) ? ts : null])

  return {
    id: providerId ? `g:${providerId}` : `g:${pool || 'unknown-pool'}:${identity}`,
    providerId,
    source: 'gecko',
    ts: Number.isFinite(ts) ? ts : null,
    tx,
    block: asNum(a.block_number),
    logIndex,
    side,
    kind: 'swap',
    usd,
    amount,
    price,
    wallet: a.tx_from_address ? String(a.tx_from_address).toLowerCase() : null,
    token: asset.address,
    symbol: asset.symbol || contextSymbol(asset.address) || null,
    quoteToken: quote.address,
    quoteSymbol: quote.symbol || contextSymbol(quote.address) || null,
    quoteAmount,
    sold: side === 'buy' ? { ...quote, amount: quoteAmount } : { ...asset, amount },
    bought: side === 'buy' ? { ...asset, amount } : { ...quote, amount: quoteAmount },
    pool,
    pair: ctx.pair || null,
    dex: ctx.dexId || null,
    proto: ctx.proto || null,
    mcap: asset.address && asset.address === baseAddress ? ctx.mcap ?? null : null,
    priced: usd != null ? 'gecko' : null,
  }
}

/**
 * Enriched Monad live tx → canonical fill.
 * Dollar size is only set from a stable leg, a confirmed usdValue, or a MON mark.
 */
export function fillFromChainTx(tx, marks = {}) {
  if (!tx?.hash || isRejectedChainTx(tx)) return null

  const kindLp = lpKind(tx)
  const sold = chainLeg(tx, 'base')
  const bought = chainLeg(tx, 'quote')
  const nativeAmount = nativeMon(tx.value)
  const soldOrNative = sold || (nativeAmount > 0 ? { amount: nativeAmount, symbol: 'MON', address: NATIVE } : null)

  if (!soldOrNative && !bought && !kindLp) return null

  let side = null
  let asset = null
  let quote = null
  if (soldOrNative && bought) {
    if (isStable(soldOrNative.symbol) && !isStable(bought.symbol)) {
      side = 'buy'
      asset = bought
      quote = soldOrNative
    } else if (isStable(bought.symbol) && !isStable(soldOrNative.symbol)) {
      side = 'sell'
      asset = soldOrNative
      quote = bought
    } else if (isMon(soldOrNative.symbol) && !isMon(bought.symbol)) {
      side = 'buy'
      asset = bought
      quote = soldOrNative
    } else if (isMon(bought.symbol) && !isMon(soldOrNative.symbol)) {
      side = 'sell'
      asset = soldOrNative
      quote = bought
    } else {
      asset = bought
      quote = soldOrNative
    }
  } else if (kindLp) {
    side = kindLp === 'add' ? 'buy' : 'sell'
    asset = bought || soldOrNative
    quote = soldOrNative && bought ? soldOrNative : null
  } else {
    asset = bought || soldOrNative
  }

  const kind = kindLp || (soldOrNative && bought ? 'swap' : 'flow')

  let usd = tx.usdValueVerified === true ? asNum(tx.usdValue) : null
  let priced = usd != null ? 'cash_leg' : null
  if (usd == null && quote && isStable(quote.symbol)) {
    usd = asNum(quote.amount)
    priced = usd != null ? 'cash_leg' : null
  }
  if (usd == null && quote && isMon(quote.symbol)) {
    const mark = asNum(marks[WMON]?.usd) ?? asNum(marks[NATIVE]?.usd)
    const amt = asNum(quote.amount)
    if (mark != null && amt != null) {
      usd = mark * amt
      priced = 'mon_mark'
    }
  }

  const ts = asNum(tx.timestamp) ?? Date.now()
  const tokenAddr = asset?.address ? String(asset.address).toLowerCase() : null
  const amount = asNum(asset?.amount)
  const unitPrice = usd != null && amount > 0 ? usd / amount : null

  return {
    id: tx.logIndex != null ? `c:${tx.hash}:${tx.logIndex}` : `c:${tx.hash}`,
    source: 'chain',
    ts,
    tx: tx.hash,
    block: asNum(tx.blockNumber),
    logIndex: asNum(tx.logIndex),
    side: kindLp ? (kindLp === 'add' ? 'buy' : 'sell') : side,
    kind,
    observationRank: soldOrNative && bought ? 2 : sold || bought ? 1 : 0,
    usd,
    amount,
    // tx.price is a token/token ratio upstream, not a USD quote.
    price: Number.isFinite(unitPrice) ? unitPrice : null,
    wallet: tx.from ? String(tx.from).toLowerCase() : null,
    token: tokenAddr,
    symbol: asset?.symbol || null,
    quoteToken: quote?.address ? String(quote.address).toLowerCase() : null,
    quoteSymbol: quote?.symbol || null,
    quoteAmount: asNum(quote?.amount),
    sold: soldOrNative,
    bought,
    pool: tx.to ? String(tx.to).toLowerCase() : null,
    pair: asset && quote ? `${asset.symbol}/${quote.symbol}` : asset?.symbol || null,
    dex: null,
    proto: null,
    mcap: tokenAddr ? asNum(marks[tokenAddr]?.mcap) : null,
    priced,
  }
}

export function isRejectedChainTx(tx) {
  return Boolean(tx?.isSimulated || tx?.simulated || tx?.source === 'simulation'
    || ['reverted', 'failed', '0x0'].includes(String(tx?.status).toLowerCase())
    || tx?.status === false || tx?.status === 0 || tx?.status === 0n)
}

export function isSwapFill(fill) {
  return fill?.kind === 'swap' && (fill.side === 'buy' || fill.side === 'sell')
}

export function isLpFill(fill) {
  return fill?.kind === 'add' || fill?.kind === 'remove'
}
