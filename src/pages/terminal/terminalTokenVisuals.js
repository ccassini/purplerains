import { NATIVE, WMON } from './constants'

// Shipped artwork is attached to verified Monad addresses, never a matching ticker alone.
const LOCAL_TOKEN_IMAGES = {
  [NATIVE]: '/monad_logo.png',
  [WMON]: '/monad_logo.png',
  '0x754704bc059f8c67012fed69bc8a327a5aafb603': '/usdc.avif',
  '0x00000000efe302beaa2b3e6e1b18d08d69a9012a': '/ausd.png',
  '0x111111d2bf19e43c34263401e0cad979ed1cdb61': '/usd1.svg',
  '0xe7cd86e13ac4309349f30b3435a9d337750fc82d': '/usdt0.webp',
  '0xfd44b35139ae53fff7d8f2a9869c503d987f00d1': '/lvusd.png',
}

function imageSource(value) {
  if (typeof value !== 'string') return null
  const source = value.trim()
  if (source.startsWith('/') && !source.startsWith('//')) return source
  try {
    const url = new URL(source)
    return url.protocol === 'https:' ? url.href : null
  } catch { return null }
}

export function terminalTokenImage(address, image, tokenImages) {
  const key = typeof address === 'string' ? address.toLowerCase() : ''
  if (LOCAL_TOKEN_IMAGES[key]) return LOCAL_TOKEN_IMAGES[key]
  const metadataImage = tokenImages instanceof Map ? tokenImages.get(key) : tokenImages?.[key]
  return imageSource(metadataImage) || imageSource(image)
}

/** Explicit observed legs win, including an explicitly absent leg on partial flows. */
export function terminalTradeLegs(row) {
  if (Object.hasOwn(row, 'sold') || Object.hasOwn(row, 'bought')) {
    return { sold: row.sold || null, bought: row.bought || null }
  }
  // Older indexed swaps have the same two legs expressed relative to buy/sell side.
  if (row.kind !== 'swap' || !['buy', 'sell'].includes(row.side)) return { sold: null, bought: null }
  const asset = row.token || row.symbol ? { address: row.token, symbol: row.symbol, amount: row.amount } : null
  const quote = row.quoteToken || row.quoteSymbol ? { address: row.quoteToken, symbol: row.quoteSymbol, amount: row.quoteAmount } : null
  return row.side === 'buy' ? { sold: quote, bought: asset } : { sold: asset, bought: quote }
}
