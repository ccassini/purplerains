/** Monad mainnet only. There is no chain picker and no other network is indexed. */
export const CHAIN_ID = 143
export const CHAIN_SLUG = 'monad'
export const CHAIN_NAME = 'Monad Mainnet'
export const CHAIN_LABEL = 'MONAD MAINNET'
export const EXPLORER_URL = 'https://monadvision.com'
export const DEXSCREENER_URL = 'https://dexscreener.com/monad'
export const GECKO_BASE = 'https://api.geckoterminal.com/api/v2'
export const DEXSCREENER_API = 'https://api.dexscreener.com'

export const WMON = '0x3bd359c1119da7da1d913d1c4d2b7c461115433a'
export const NATIVE = '0x0000000000000000000000000000000000000000'

export const WINDOWS = [
  { id: '1h', label: '1h', key: '1', gecko: 'h1', ms: 3_600_000, marketLimited: false },
  { id: '24h', label: '24h', key: '2', gecko: 'h24', ms: 86_400_000, marketLimited: false },
  { id: '7d', label: '7d', key: '3', gecko: 'h24', ms: 7 * 86_400_000, marketLimited: true },
  { id: '30d', label: '30d', key: '4', gecko: 'h24', ms: 30 * 86_400_000, marketLimited: true },
  { id: 'all', label: 'all', key: '5', gecko: 'h24', ms: Number.POSITIVE_INFINITY, marketLimited: true },
]

export const DEFAULT_WINDOW = '24h'

export const POOL_SORTS = [
  { id: 'fees', label: 'Pools: fees' },
  { id: 'volume', label: 'Pools: volume' },
  { id: 'tvl', label: 'Pools: TVL' },
  { id: 'created', label: 'Pools: newest' },
  { id: 'fee', label: 'Pools: fee rate' },
  { id: 'swaps', label: 'Pools: swaps' },
  { id: 'change', label: 'Pools: price change' },
  { id: 'disloc', label: 'Dislocations: cross-pool spread' },
]

export const TRADER_SORTS = [
  { id: 'realized_pnl', label: 'sort: p/l on sells' },
  { id: 'unrealized_pnl', label: 'sort: p/l on open bags' },
  { id: 'net_pnl', label: 'sort: total p/l' },
  { id: 'win_rate', label: 'sort: win rate' },
  { id: 'volume', label: 'sort: volume' },
  { id: 'fills', label: 'sort: fills' },
  { id: 'last_ts', label: 'sort: recently updated' },
]

export const SECTIONS = ['search', 'feed', 'wallets', 'pools', 'tokens', 'fresh', 'status']

export const TAPE_CAP = 420
export const FILL_STORE_CAP = 900
export const POOL_CAP = 80
export const TRADER_CAP = 200

export const GECKO_TIMEOUT_MS = 8000
export const POOL_POLL_MS = 25_000
export const TRADE_POLL_MS = 9_000
export const TRADE_POOL_ROTATE = 12

export const SIZE_TIERS = [
  { min: 50_000, tier: 4 },
  { min: 10_000, tier: 3 },
  { min: 2_500, tier: 2 },
  { min: 500, tier: 1 },
]

export const SOUND_TIERS = [
  { min: 25_000, hz: 880 },
  { min: 5_000, hz: 660 },
  { min: 1_000, hz: 440 },
]

/** Uniswap-style liquidity method ids (add vs remove). */
export const ADD_LIQ_SIGS = new Set([
  '0xe8e33700', // addLiquidity
  '0xf305d719', // addLiquidityETH
  '0x4515cef3', // addLiquidityETH (variant)
  '0x0dcd7a6c',
  '0x4883c06b',
])

export const REMOVE_LIQ_SIGS = new Set([
  '0xbaa2abde', // removeLiquidity
  '0x02751cec', // removeLiquidityETH
  '0x89afcb44', // removeLiquidityETHSupportingFeeOnTransferTokens
])
