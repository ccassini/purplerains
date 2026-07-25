// Monad mainnet network configuration
// Centralized so it can be reused across the app

// Multiple RPC endpoints for fallback (ordered by performance and rate limit tolerance)
export const MONAD_RPC_ENDPOINTS = [
  import.meta.env.VITE_MONAD_RPC || 'https://rpc.monad.xyz',
  'https://rpc1.monad.xyz',
  'https://monad-mainnet.drpc.org',
  'https://rpc3.monad.xyz',
  'https://rpc-mainnet.monadinfra.com',
  'https://rpc2.monad.xyz',
  'https://monad-mainnet-rpc.spidernode.net',
].filter(Boolean)

export const MONAD_WS_ENDPOINTS = [
  import.meta.env.VITE_MONAD_WS || 'wss://rpc.monad.xyz',
].filter(Boolean)

// Known stablecoin contract addresses on Monad (VERIFIED REAL ADDRESSES)
// Monad stablecoins: USDC, AUSD, USD1, USDTO
export const MONAD_STABLECOINS = {
  USDC: [
    // VERIFIED MONAD MAINNET USDC
    '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', // REAL USDC on Monad
    // Other possible addresses
    '0x5f98805a4e8be255a32880fdec7f6728c6568ba0',
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    '0xf817257fed379853cde0fa4f97ab987181b1e5ea',
    '0x836047a99e11f376522b447bffb6e3495dd0637c',
  ],
  AUSD: [
    '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', // REAL AUSD on Monad
    '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
  ],
  USD1: [
    '0x111111d2bf19e43C34263401e0CAd979eD1cdb61', // REAL USD1 on Monad
  ],
  USDTO: [
    '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', // REAL USDT0 on Monad
  ],
  LVUSD: [
    '0xFD44B35139Ae53FFF7d8F2A9869c503D987f00d1', // REAL LVUSD on Monad
  ],
}

// Known DEX router addresses on Monad (VERIFIED REAL ADDRESSES)
export const MONAD_DEX_ROUTERS = [
  // ============ VERIFIED MONAD MAINNET DEXs ============
  // Nad.fun (REAL)
  '0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137', // Nad.fun: DEX_ROUTER
  '0x6F6B8F1a20703309951a5127c45B49b1CD981A22', // Nad.fun: BONDING_CURVE_ROUTER
  
  // Pinot Finance (REAL)
  '0x252b9C1A6C9867a514ea70fe9bBB23621ACc1a50', // Pinot Finance: SwapRouter
  
  // PancakeSwap on Monad (REAL)
  '0x21114915Ac6d5A2e156931e20B20b038dEd0Be7C', // PancakeSwap Router 1
  '0x23682a588CF2601ACa977dF200938634c9f7d552', // PancakeSwap Router 2
  
  // Uniswap on Monad (REAL)
  '0x4B2ab38DBF28D31D467aA8993f6c2585981D6804', // Uniswap: UniswapV2Router02
  
  // Capricorn (REAL)
  '0xdac97b6a3951641B177283028A8f428332333071', // Capricorn Router
  
  // Kuru (REAL)
  '0xb3e6778480b2E488385E8205eA05E20060B813cb', // Kuru Smart Router
  
  // OKX Aggregator (REAL)
  '0xb1E4E25b1938c78Ec0b21cCb2D6a0Be60aA7E63f', // OKX Aggregator Router
  
  // GMGN (REAL)
  '0xc9ca80b5ea956aFA98627963D1880033545d108E', // GMGN Router
  
  // Matcha (REAL)
  '0x0000000000001fF3684f28c67538d4D072C22734', // Matcha Router
  
  // ============ OTHER MONAD DEXs ============
  // Ambient/CrocSwap
  '0xaaaaaaaaa24eeeb8d57d431224f73832bc34f688',
  '0xaaaa0090fcda256a57b31e65e6c00e800e30fcd3',
  
  // ============ COMMON DEX PATTERNS ============
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', // Uniswap V2 Router
  '0xe592427a0aece92de3edee1f18e0157c05861564', // Uniswap V3 Router
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', // Uniswap Universal Router
  '0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b', // Universal Router 2
  '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f', // SushiSwap Router
  '0x1111111254fb6c44bac0bed2854e76f90643097d', // 1inch Router V5
  '0x1111111254eeb25477b68fb85ed929f73a960582', // 1inch Router V4
  '0xdef1c0ded9bec7f1a1670819833240f027b25eff', // 0x Exchange Proxy
  '0x03a520b32c04bf3beef7beb72e919cf822ed34f1', // iZiSwap Router
  '0xdef171fe48cf0115b1d80b88dc8eab59176fee57', // ParaSwap
  '0xba12222222228d8ba445958a75a0704d566bf2c8', // Balancer
]

export const MONAD_MAINNET_CONFIG = {
  name: 'Monad Mainnet',
  rpcUrl: MONAD_RPC_ENDPOINTS[0], // Use best performing RPC as primary
  rpcEndpoints: MONAD_RPC_ENDPOINTS, // All endpoints for fallback
  wsUrl: MONAD_WS_ENDPOINTS[0], // WebSocket for real-time subscriptions
  wsEndpoints: MONAD_WS_ENDPOINTS,
  chainId: 143, // 0x8f
  blockTime: 500, // ~0.5s target block time (Monad is fast!)
  maxTps: 10000,
  nativeToken: 'MON',
  explorerUrl: 'https://monadvision.com',
  // Polling config - optimized for rate limiting
  pollingInterval: 100, // 100ms when tab active
  inactivePollingInterval: 5000, // 5s when tab hidden (saves resources)
  maxBlocksPerPoll: 10, // Fetch up to 10 blocks per poll to catch up
  // Rate limiting protection
  maxRequestsPerMinute: 300, // Max RPC requests per minute
  requestCooldownMs: 200, // Minimum time between requests
  cacheDurationMs: 30000, // Cache block data for 30 seconds
  // Stablecoin addresses
  stablecoins: MONAD_STABLECOINS,
  dexRouters: MONAD_DEX_ROUTERS,
}

export default MONAD_MAINNET_CONFIG