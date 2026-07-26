/**
 * Contract → project identity for Monad mainnet.
 *
 * One place that answers "whose contract is this transaction talking to", with
 * the project's name and its logo from the ecosystem asset set. Addresses come
 * from the repo's own verified router/token lists (src/config/monadNetwork.js,
 * src/utils/txEnrichment.js) — the same sets the DEX heuristics already trust.
 * Extending it is one entry here; the UI picks it up everywhere.
 */

/** @typedef {{ name: string, logo: string | null }} ContractProject */

const ECO = '/ecosystem/'

/**
 * address (lowercase) → project. Logos are files that exist in
 * public/ecosystem/ — verified at authoring time; a missing file only costs a
 * broken img which the UI hides via onError.
 * @type {Record<string, ContractProject>}
 */
const CONTRACTS = {
  // ── Nad.fun ──
  '0x0b79d71ae99528d1db24a4148b5f4f865cc2b137': { name: 'Nad.fun', logo: `${ECO}nad.fun.avif` },
  '0x6f6b8f1a20703309951a5127c45b49b1cd981a22': { name: 'Nad.fun', logo: `${ECO}nad.fun.avif` },
  // ── Pinot Finance ──
  '0x252b9c1a6c9867a514ea70fe9bbb23621acc1a50': { name: 'Pinot Finance', logo: `${ECO}pinot finance.avif` },
  // ── PancakeSwap ──
  '0x21114915ac6d5a2e156931e20b20b038ded0be7c': { name: 'PancakeSwap', logo: `${ECO}pancakeswap,.avif` },
  '0x23682a588cf2601aca977df200938634c9f7d552': { name: 'PancakeSwap', logo: `${ECO}pancakeswap,.avif` },
  // ── Uniswap ──
  '0x4b2ab38dbf28d31d467aa8993f6c2585981d6804': { name: 'Uniswap', logo: `${ECO}uniswap.avif` },
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': { name: 'Uniswap', logo: `${ECO}uniswap.avif` },
  '0xe592427a0aece92de3edee1f18e0157c05861564': { name: 'Uniswap', logo: `${ECO}uniswap.avif` },
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': { name: 'Uniswap', logo: `${ECO}uniswap.avif` },
  '0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b': { name: 'Uniswap', logo: `${ECO}uniswap.avif` },
  // ── Capricorn ──
  '0xdac97b6a3951641b177283028a8f428332333071': { name: 'Capricorn', logo: `${ECO}capricorn.avif` },
  // ── Kuru ──
  '0xb3e6778480b2e488385e8205ea05e20060b813cb': { name: 'Kuru', logo: `${ECO}Kuru Exchange.avif` },
  // ── OKX Aggregator ──
  '0xb1e4e25b1938c78ec0b21ccb2d6a0be60aa7e63f': { name: 'OKX', logo: `${ECO}okx aggregator.avif` },
  // ── GMGN ──
  '0xc9ca80b5ea956afa98627963d1880033545d108e': { name: 'GMGN', logo: `${ECO}gmgn.avif` },
  // ── Matcha / 0x ──
  '0x0000000000001ff3684f28c67538d4d072c22734': { name: 'Matcha', logo: `${ECO}0x.jpg` },
  '0xdef1c0ded9bec7f1a1670819833240f027b25eff': { name: '0x', logo: `${ECO}0x.jpg` },
  // ── Ambient ──
  '0xaaaaaaaaa24eeeb8d57d431224f73832bc34f688': { name: 'Ambient', logo: `${ECO}Ambient.jpg` },
  '0xaaaa0090fcda256a57b31e65e6c00e800e30fcd3': { name: 'Ambient', logo: `${ECO}Ambient.jpg` },
  // ── SushiSwap ──
  '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f': { name: 'SushiSwap', logo: `${ECO}sushiswap.avif` },
  // ── 1inch ──
  '0x1111111254fb6c44bac0bed2854e76f90643097d': { name: '1inch', logo: null },
  '0x1111111254eeb25477b68fb85ed929f73a960582': { name: '1inch', logo: null },
  // ── iZiSwap ──
  '0x03a520b32c04bf3beef7beb72e919cf822ed34f1': { name: 'iZiSwap', logo: null },
  // ── ParaSwap ──
  '0xdef171fe48cf0115b1d80b88dc8eab59176fee57': { name: 'ParaSwap', logo: null },
  // ── Balancer ──
  '0xba12222222228d8ba445958a75a0704d566bf2c8': { name: 'Balancer', logo: null },
  // ── Core tokens: a call TO the token contract is that token moving. ──
  // Addresses are the repo's verified Monad-mainnet set (monadNetwork.js);
  // logos ship in public/ already.
  '0x3bd359c1119da7da1d913d1c4d2b7c461115433a': { name: 'WMON', logo: '/monad_logo.png' },
  '0x754704bc059f8c67012fed69bc8a327a5aafb603': { name: 'USDC', logo: '/usdc.avif' },
  '0x00000000efe302beaa2b3e6e1b18d08d69a9012a': { name: 'AUSD', logo: '/ausd.png' },
  '0x111111d2bf19e43c34263401e0cad979ed1cdb61': { name: 'USD1', logo: '/usd1.svg' },
  '0xe7cd86e13ac4309349f30b3435a9d337750fc82d': { name: 'USDT0', logo: '/usdt0.webp' },
  '0xfd44b35139ae53fff7d8f2a9869c503d987f00d1': { name: 'LVUSD', logo: '/lvusd.png' },

  /* BEGIN GENERATED: monadvision harvest */
  // ── Uniswap ──
  '0x0d97dc33264bfc1c226207428a79b26757fb9dc3': { name: 'Uniswap', logo: '/ecosystem/mv/uniswap.jpg' }, // UniversalRouter
  '0xfdf682f51fe81aa4898f0ae2163d8a55c127fbc7': { name: 'Uniswap', logo: '/ecosystem/mv/uniswap.jpg' }, // Universal Router 2.1.1
  '0x5b7ec4a94ff9bedb700fb82ab09d5846972f4016': { name: 'Uniswap', logo: '/ecosystem/mv/uniswap.jpg' }, // Uniswap V4 Positions NFT
  '0x7197e214c0b767cfb76fb734ab638e2c192f4e53': { name: 'Uniswap', logo: '/ecosystem/mv/uniswap.jpg' }, // Uniswap V3 Positions NFT-V1
  '0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900': { name: 'Uniswap', logo: '/ecosystem/mv/uniswap.jpg' }, // SwapRouter02
  '0x182a927119d56008d921126764bf884221b10f59': { name: 'Uniswap', logo: '/ecosystem/mv/uniswap.jpg' }, // UniswapV2Factory
  '0x204faca1764b154221e35c0d20abb3c525710498': { name: 'Uniswap', logo: '/ecosystem/mv/uniswap.jpg' }, // UniswapV3Factory
  '0xd1b797d92d87b688193a2b976efc8d577d204343': { name: 'Uniswap', logo: '/ecosystem/mv/uniswap.jpg' }, // UniswapInterfaceMulticall
  '0x661e93cca42afacb172121ef892830ca3b70f08d': { name: 'Uniswap', logo: '/ecosystem/mv/uniswap.jpg' }, // QuoterV2
  // ── Relay ──
  '0x4cd00e387622c35bddb9b4c962c136462338bc31': { name: 'Relay', logo: '/ecosystem/mv/relay.jpg' }, // relayDepository
  '0xb92fe925dc43a0ecde6c8b1a2709c170ec4fff4f': { name: 'Relay', logo: '/ecosystem/mv/relay.jpg' }, // v3RelayRouter
  '0xccc88a9d1b4ed6b0eaba998850414b24f1c315be': { name: 'Relay', logo: '/ecosystem/mv/relay.jpg' }, // v3RelayApprovalProxy
  '0xf17902d51fdff7bf50aacc78d6bb399baf88b479': { name: 'Relay', logo: '/ecosystem/mv/relay.jpg' }, // relayReceiver
  '0x3ec130b627944cad9b2750300ecb0a695da522b6': { name: 'Relay', logo: '/ecosystem/mv/relay.jpg' }, // v2.1RelayRouter
  '0x58cc3e0aa6cd7bf795832a225179ec2d848ce3e7': { name: 'Relay', logo: '/ecosystem/mv/relay.jpg' }, // v2.1RelayApprovalProxy
  '0xf70da97812cb96acdf810712aa562db8dfa3dbef': { name: 'Relay', logo: '/ecosystem/mv/relay.jpg' }, // Bridge Solver
  // ── aPriori ──
  '0x4f02a29df8510975d293aab0b32af7340f406fb4': { name: 'aPriori', logo: '/ecosystem/mv/apriori.jpg' }, // swap
  '0x0c65a0bc65a5d819235b71f554d210d3f80e0852': { name: 'aPriori', logo: '/ecosystem/mv/apriori.jpg' }, // aPriori Monad LST
  '0x77f6e4103e32d6146e29cf9ed1645e170f90bc2b': { name: 'aPriori', logo: '/ecosystem/mv/apriori.jpg' }, // ValidatorsRegistry
  // ── Capricorn ──
  '0x4c02af995bb1f574c9bf31f43ddc112414ae0ac7': { name: 'Capricorn', logo: '/ecosystem/mv/capricorn.jpg' }, // Capricorn CL Positions NFT-V1
  '0x6b5f564339dbad6b780249827f2198a841feb7f3': { name: 'Capricorn', logo: '/ecosystem/mv/capricorn.jpg' }, // CapricornCLFactory
  '0xed2850d3704a1a5bcb6158f27deda3d6ff4c31d9': { name: 'Capricorn', logo: '/ecosystem/mv/capricorn.jpg' }, // NonfungibleTokenPositionDescriptor
  '0xb430edd2b54cdb3b25703fb3342ca3a88663a04d': { name: 'Capricorn', logo: '/ecosystem/mv/capricorn.jpg' }, // QuoterV2
  // ── Agora ──
  '0x9cab7ede13dc56652e44d2404e969c212f22689b': { name: 'Agora', logo: '/ecosystem/mv/agora.svg' }, // AUSDBridge
  // ── Monday Trade ──
  '0x2f903ac6ddaf57eadcbbc46adc3ad739c3506a2d': { name: 'Monday Trade', logo: '/ecosystem/mv/monday-trade.svg' }, // MondayStockRouter
  '0xfe951b693a2fe54be5148614b109e316b567632f': { name: 'Monday Trade', logo: '/ecosystem/mv/monday-trade.svg' }, // SwapRouter
  '0x68b507bf58ed32173f41ff20aa2494a569daec44': { name: 'Monday Trade', logo: '/ecosystem/mv/monday-trade.svg' }, // NFTPositionManager
  '0xf462c8c85991f1dd8f5fa6199dfc1387c4f8f3b2': { name: 'Monday Trade', logo: '/ecosystem/mv/monday-trade.svg' }, // MondayOrderSettler
  '0xc1e98d0a2a58fb8abd10ccc30a58efff4080aa21': { name: 'Monday Trade', logo: '/ecosystem/mv/monday-trade.svg' }, // MondayFactory
  '0xb97ecd41aef0f842e773c8f9905919cde49880c9': { name: 'Monday Trade', logo: '/ecosystem/mv/monday-trade.svg' }, // QuoterV2
  '0xad8974d98f7fc386e396ffe826b886cf20afe232': { name: 'Monday Trade', logo: '/ecosystem/mv/monday-trade.svg' }, // Aggregator
  '0xdc67221ea8d223e0a1d0948edecb634caf190ec9': { name: 'Monday Trade', logo: '/ecosystem/mv/monday-trade.svg' }, // MondayConfig
  '0x2e32345bf0592bff19313831b99900c530d37d90': { name: 'Monday Trade', logo: '/ecosystem/mv/monday-trade.svg' }, // Gate
  '0x73ada1ea346cc3908f41cf67a040f0acd7808be0': { name: 'Monday Trade', logo: '/ecosystem/mv/monday-trade.svg' }, // Instrument
  // ── Kuru ──
  '0x2a68ba1833cdf93fa9da1eebd7f46242ad8e90c5': { name: 'Kuru', logo: '/ecosystem/mv/kuru.png' }, // MarginAccount
  '0x065c9d28e428a0db40191a54d33d5b7c71a9c394': { name: 'Kuru', logo: '/ecosystem/mv/kuru.png' }, // Market-MON/USDC
  '0xa6afd386135b7d41a6c40c525abc4a1019b0d132': { name: 'Kuru', logo: '/ecosystem/mv/kuru.png' }, // Market-WETH/USDC
  '0x851145eaefdc37956b08da829fa31722199f3f07': { name: 'Kuru', logo: '/ecosystem/mv/kuru.png' }, // Market-XAUt0/USDC
  '0x40c49f171202f91ff5d2fae34c22dd2bfdd22af0': { name: 'Kuru', logo: '/ecosystem/mv/kuru.png' }, // Market-cbBTC/USDC
  '0xd651346d7c789536ebf06dc72ae3c8502cd695cc': { name: 'Kuru', logo: '/ecosystem/mv/kuru.png' }, // Router
  '0x465d06d4521ae9ce724e0c182daad5d8a2ff7040': { name: 'Kuru', logo: '/ecosystem/mv/kuru.png' }, // KuruFlowRouter
  '0x974e61bba9c4704e8bcc1923fdc3527b41323faa': { name: 'Kuru', logo: '/ecosystem/mv/kuru.png' }, // KuruForwarder
  '0xe29309e308af3ee3b1a414e97c37a58509f27d1e': { name: 'Kuru', logo: '/ecosystem/mv/kuru.png' }, // MonadDeployer
  // ── Perpl ──
  '0x34b6552d57a35a1d042ccae1951bd1c370112a6f': { name: 'Perpl', logo: '/ecosystem/mv/perpl.jpg' }, // Exchange
  // ── Merkl ──
  '0x3ef3d8ba38ebe18db133cec108f4d14ce00dd9ae': { name: 'Merkl', logo: '/ecosystem/mv/merkl.jpg' }, // Merkl
  // ── Li.Fi ──
  '0x3c6b2e0b7421254846c53c118e24c65d59eae75e': { name: 'Li.Fi', logo: '/ecosystem/mv/li-fi.png' }, // Permit2Proxy
  '0x026f252016a7c47cdef1f05a3fc9e20c92a49c37': { name: 'Li.Fi', logo: '/ecosystem/mv/li-fi.png' }, // Li.Fi
  // ── Neverland ──
  '0x80f00661b13cc5f6ccd3885be7b4c9c67545d585': { name: 'Neverland', logo: '/ecosystem/mv/neverland.png' }, // Pool (Proxy)
  '0x57ea245ccbfab074babb9d01d1f0c60525e52cec': { name: 'Neverland', logo: '/ecosystem/mv/neverland.png' }, // DustRewardsController
  '0x800409dbd7157813bb76501c30e04596cc478f25': { name: 'Neverland', logo: '/ecosystem/mv/neverland.png' }, // WrappedTokenGatewayV3
  '0xbb4738d05ad1b3da57a4881bae62ce9bb1eeed6c': { name: 'Neverland', logo: '/ecosystem/mv/neverland.png' }, // Voting Escrow DUST
  '0xff20ac10eb808b1e31f5cfca58d80ede2ba71c43': { name: 'Neverland', logo: '/ecosystem/mv/neverland.png' }, // RevenueReward
  '0xad96c3dffcd6374294e2573a7fbba96097cc8d7c': { name: 'Neverland', logo: '/ecosystem/mv/neverland.png' }, // Pixie Dust
  '0xd0fd2cf7f6ceff4f96b1161f5e995d5843326154': { name: 'Neverland', logo: '/ecosystem/mv/neverland.png' }, // Neverland Interest Bearing WMON
  '0x690ad251a0d9c8a47cf1bc5e4c0dbd3131ee09d3': { name: 'Neverland', logo: '/ecosystem/mv/neverland.png' }, // Isolated Pendle-AUSD Pool
  '0xcee8d6d42a37a9d721b41cefa16dab7f0d0a14eb': { name: 'Neverland', logo: '/ecosystem/mv/neverland.png' }, // NeverlandProfileItemsSeller
  '0x3aca285b9f57832ff55f1e6835966890845c1526': { name: 'Neverland', logo: '/ecosystem/mv/neverland.png' }, // Neverland Variable Debt WMON
  // ── PancakeSwap ──
  '0x1b81d678ffb9c0263b24a97847620c99d213eb14': { name: 'PancakeSwap', logo: '/ecosystem/mv/pancakeswap.png' }, // SwapRouter
  '0x46a15b0b27311cedf172ab29e4f4766fbe7f4364': { name: 'PancakeSwap', logo: '/ecosystem/mv/pancakeswap.png' }, // Pancake V3 Positions NFT-V1
  '0xb1bc24c34e88f7d43d5923034e3a14b24daacff9': { name: 'PancakeSwap', logo: '/ecosystem/mv/pancakeswap.png' }, // PancakeV2Router
  '0x02a84c1b3bbd7401a5f7fa98a384ebc70bb5749e': { name: 'PancakeSwap', logo: '/ecosystem/mv/pancakeswap.png' }, // PancakeV2Factory
  '0x41ff9aa7e16b8b1a8a8dc4f0efacd93d02d071c9': { name: 'PancakeSwap', logo: '/ecosystem/mv/pancakeswap.png' }, // PancakeV3PoolDeployer
  '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865': { name: 'PancakeSwap', logo: '/ecosystem/mv/pancakeswap.png' }, // PancakeV3Factory
  '0xb099b459887bc759dbf0293e12d3dfcd0c456cff': { name: 'PancakeSwap', logo: '/ecosystem/mv/pancakeswap.png' }, // NfpTokenDescriptor
  '0xac1ce734566f390a94b00eb9bf561c2625bf44ea': { name: 'PancakeSwap', logo: '/ecosystem/mv/pancakeswap.png' }, // PancakeInterfaceMulticall
  // ── LeverUp ──
  '0xea1b8e4ab7f14f7dca68c5b214303b13078fc5ec': { name: 'LeverUp', logo: '/ecosystem/mv/leverup.jpg' }, // LeverUp
  '0x91b81bfbe3a747230f0529aa28d8b2bc898e6d56': { name: 'LeverUp', logo: '/ecosystem/mv/leverup.jpg' }, // LeverUp MON
  '0x61b29efef2e6f866ba4aaefdb87d2837c6a22b9c': { name: 'LeverUp', logo: '/ecosystem/mv/leverup.jpg' }, // Staked LVMON
  '0x1001ff13bf368aa4fa85f21043648079f00e1001': { name: 'LeverUp', logo: '/ecosystem/mv/leverup.jpg' }, // LeverUp
  '0xf71b390448df37c8379332f372f344a576574d4a': { name: 'LeverUp', logo: '/ecosystem/mv/leverup.jpg' }, // LVMON_Delegator_Vault
  '0x135951057cfccca7e8ef87ee41318d670f723f68': { name: 'LeverUp', logo: '/ecosystem/mv/leverup.jpg' }, // LVUSD_Issuer
  '0xbf52ced429c3901afa4bbf25849269ef7a4ad105': { name: 'LeverUp', logo: '/ecosystem/mv/leverup.jpg' }, // LVMON_Issuer
  '0x06058fe1fcfad19181438508600925106309e5fe': { name: 'LeverUp', logo: '/ecosystem/mv/leverup.jpg' }, // LVMON_Fast_Redeem_Vault
  // ── Nad.fun ──
  '0x8986c8fd44eb85294a725a7e61af35e76ba26f91': { name: 'Nad.fun', logo: '/ecosystem/mv/nad-fun.jpg' }, // V2_NAD_FUN_ROUTER
  '0x003989cd92c31a51d8b20bdbd0c51e444f88d081': { name: 'Nad.fun', logo: '/ecosystem/mv/nad-fun.jpg' }, // SWAP
  '0x687f9172d5f4798694811333c5c5696afcf4f6f4': { name: 'Nad.fun', logo: '/ecosystem/mv/nad-fun.jpg' }, // V2_CREATOR_FEE_VAULT
  '0x42e75b4b96d7000e7da1e0c729cec8d2049b9731': { name: 'Nad.fun', logo: '/ecosystem/mv/nad-fun.jpg' }, // CREATOR_TREASURY
  '0xaebe5522749b65eae7b2a35c593145cc3128b515': { name: 'Nad.fun', logo: '/ecosystem/mv/nad-fun.jpg' }, // LP_MANAGER
  '0x9a6b8addfec15a27c54570033c1ee02af1d2c7e6': { name: 'Nad.fun', logo: '/ecosystem/mv/nad-fun.jpg' }, // V2_FEE_TO
  '0xa46a28558d77b1bf9dd98a451f78c43be2545605': { name: 'Nad.fun', logo: '/ecosystem/mv/nad-fun.jpg' }, // V2_GIFT_VAULT
  '0xe1c8b73343f5a83ebe165be90470d84b00e33022': { name: 'Nad.fun', logo: '/ecosystem/mv/nad-fun.jpg' }, // V2_FEE_COLLECTOR
  // ── FastLane ──
  '0x1b68626dca36c7fe922fd2d55e4f631d962de19c': { name: 'FastLane', logo: '/ecosystem/mv/fastlane.jpg' }, // ShMonad
  '0xd32edf6642d917dbbe7b8bf8e5d6f5df6a9fff58': { name: 'FastLane', logo: '/ecosystem/mv/fastlane.jpg' }, // FastLaneAuctionHandler
  '0x2da28fedc4643c787cb5c5e84fa6aadb596875e8': { name: 'FastLane', logo: '/ecosystem/mv/fastlane.jpg' }, // Atlas
  // ── Aave V3 ──
  '0x69a5f9ad4f96ebf0a0c792dd42a01cc5c0102fef': { name: 'Aave V3', logo: '/ecosystem/mv/aave-v3.png' }, // Pool
  '0xfc421ad3c883bf9e7c4f42de845c4e4405799e73': { name: 'Aave V3', logo: '/ecosystem/mv/aave-v3.png' }, // Gho Token
  '0x35a73bacb179d3740395a3cecc87ff2e581d6042': { name: 'Aave V3', logo: '/ecosystem/mv/aave-v3.png' }, // aUSDC
  '0xbc2a1fa0069e59e2552ab40889520c7b0d413d9b': { name: 'Aave V3', logo: '/ecosystem/mv/aave-v3.png' }, // a-syrupUSDC
  '0x5bb847f1e529df8819038ba6d34a95c9c2fb6813': { name: 'Aave V3', logo: '/ecosystem/mv/aave-v3.png' }, // WrappedTokenGateway
  '0x34793fb9935f7bb5e5ae920fb963f39063e7a615': { name: 'Aave V3', logo: '/ecosystem/mv/aave-v3.png' }, // PoolAddressesProvider
  '0xc7a386da9cb528aa86fed862a7bf33d10aa8455b': { name: 'Aave V3', logo: '/ecosystem/mv/aave-v3.png' }, // PoolConfigurator
  '0xa7d38785be3422c25677a8aa4a44d3a0853a3a17': { name: 'Aave V3', logo: '/ecosystem/mv/aave-v3.png' }, // UiPoolDataProvider
  '0x9d8678556bcf7240be12982430c281db76e26ea2': { name: 'Aave V3', logo: '/ecosystem/mv/aave-v3.png' }, // UiIncentiveDataProvider
  '0xa9fee192a76b8f5e5f3d310ab6c526cb11f3d95b': { name: 'Aave V3', logo: '/ecosystem/mv/aave-v3.png' }, // ACLManager
  // ── Pendle ──
  '0x888888888889758f76e7103c6cbf23abbf58f946': { name: 'Pendle', logo: '/ecosystem/mv/pendle.jpg' }, // Router
  '0x000000000000c9b3e2c3ec88b1b4c0cd853f4321': { name: 'Pendle', logo: '/ecosystem/mv/pendle.jpg' }, // LimitRouter
  '0x5e49e1f85813f2b65858860a3fa231b4186f2e0e': { name: 'Pendle', logo: '/ecosystem/mv/pendle.jpg' }, // Pendle
  '0x7e500c6efbb00fd3227888256e477171a1304721': { name: 'Pendle', logo: '/ecosystem/mv/pendle.jpg' }, // GaugeController
  '0xa3cb62a49b66eb2536cf6f3c7ac82293784888a3': { name: 'Pendle', logo: '/ecosystem/mv/pendle.jpg' }, // MarketFactory
  '0x5542be50420e88dd7d5b4a3d488fa6ed82f6dac2': { name: 'Pendle', logo: '/ecosystem/mv/pendle.jpg' }, // PYLPOracle
  '0xd4f480965d2347d421f1bec7f545682e5ec2151d': { name: 'Pendle', logo: '/ecosystem/mv/pendle.jpg' }, // PendleSwap
  '0x466ced3b33045ea986b2f306c8d0aa8067961cf8': { name: 'Pendle', logo: '/ecosystem/mv/pendle.jpg' }, // SYFactory
  '0x34c91651a070664279866e5f3d6b4d5f65cbbffb': { name: 'Pendle', logo: '/ecosystem/mv/pendle.jpg' }, // SparkLinearDiscountOracleFactory
  '0x4fe1b23ab695d99394ab78c16a5be358f31847f4': { name: 'Pendle', logo: '/ecosystem/mv/pendle.jpg' }, // YieldContractFactory
  // ── KyberSwap ──
  '0x6131b5fae19ea4f9d964eac0408e4408b66337b5': { name: 'KyberSwap', logo: '/ecosystem/mv/kyberswap.jpg' }, // MetaAggregationRouterV2
  '0xcab2fa2eeab7065b45cbcf6e3936dde2506b4f6c': { name: 'KyberSwap', logo: '/ecosystem/mv/kyberswap.jpg' }, // DSLOProtocol
  '0x89c91686948c3bc9a5bdf7a2a773ea71530a233e': { name: 'KyberSwap', logo: '/ecosystem/mv/kyberswap.jpg' }, // KSZapRouterPosition
  '0x4445520306c9c70952bdfec28f3989f53d9f80c4': { name: 'KyberSwap', logo: '/ecosystem/mv/kyberswap.jpg' }, // UniswapV4KEMHook
  // ── bonad.fun ──
  '0x660eaaedebc968f8f3694354fa8ec0b4c5ba8d12': { name: 'bonad.fun', logo: '/ecosystem/mv/bonad-fun.jpg' }, // Airlock
  '0xc99b485499f78995c6f1640dbb1413c57f8ba684': { name: 'bonad.fun', logo: '/ecosystem/mv/bonad-fun.jpg' }, // Bundler
  '0xfaafde6a5b658684cc5eb0c5c2c755b00a246f45': { name: 'bonad.fun', logo: '/ecosystem/mv/bonad-fun.jpg' }, // GovernanceFactory
  '0xb4dee32eb70a5e55f3d2d861f49fb3d79f7a14d9': { name: 'bonad.fun', logo: '/ecosystem/mv/bonad-fun.jpg' }, // NoOpGovernanceFactory
  '0x5f3ba43d44375286296cb85f1ea2ebfa25dde731': { name: 'bonad.fun', logo: '/ecosystem/mv/bonad-fun.jpg' }, // NoOpMigrator
  '0x136191b46478cab023cbc01a36160c4aad81677a': { name: 'bonad.fun', logo: '/ecosystem/mv/bonad-fun.jpg' }, // UniswapV2Migrator
  '0xce3099b2f07029b086e5e92a1573c5f5a3071783': { name: 'bonad.fun', logo: '/ecosystem/mv/bonad-fun.jpg' }, // UniswapV4ScheduledMultic
  '0x66266174564170519409d8853898f065c719536b': { name: 'bonad.fun', logo: '/ecosystem/mv/bonad-fun.jpg' }, // V3Quoter
  // ── Bitget Wallet ──
  '0x3e95a025efc7f93bf4efcbea40297f97d421a274': { name: 'Bitget Wallet', logo: '/ecosystem/mv/bitget-wallet.jpg' }, // Swap
  // ── Drake Exchange ──
  '0xe6dfd064f1cff4f62236fc862a2543ea98380f32': { name: 'Drake Exchange', logo: '/ecosystem/mv/drake-exchange.jpg' }, // trading
  '0x8379c32a965a7bac7289893aa3861f01dd470049': { name: 'Drake Exchange', logo: '/ecosystem/mv/drake-exchange.jpg' }, // dUSD_vault
  '0x991d0f1e44e590fdbce15cff13aaa69c8287b7f3': { name: 'Drake Exchange', logo: '/ecosystem/mv/drake-exchange.jpg' }, // portfolio_factory
  '0x40999c623202de3d3430b6a9506ee24098d23bb8': { name: 'Drake Exchange', logo: '/ecosystem/mv/drake-exchange.jpg' }, // oracle_router
  '0x7940575377c3c2abda23813c123b4c880e217d6d': { name: 'Drake Exchange', logo: '/ecosystem/mv/drake-exchange.jpg' }, // platform_manager
  '0x4939aef78cd2dc2bae5bf9da51c61a113cae909a': { name: 'Drake Exchange', logo: '/ecosystem/mv/drake-exchange.jpg' }, // common_helper
  '0x5a42b55732f6013e3d0f4aab876ae56331ead7d2': { name: 'Drake Exchange', logo: '/ecosystem/mv/drake-exchange.jpg' }, // orderBook_factory
  '0xf36d98c22e8279cfc849a0ca197d0afd1b855654': { name: 'Drake Exchange', logo: '/ecosystem/mv/drake-exchange.jpg' }, // order_book
  // ── Avail Nexus ──
  '0x00000000ac0ac9d69424fa5adc291d75ec4a0f11': { name: 'Avail Nexus', logo: '/ecosystem/mv/avail-nexus.jpg' }, // Vault
  // ── Dexalot ──
  '0xa5c079c1986e2335d83fa2d7282e162958e515d5': { name: 'Dexalot', logo: '/ecosystem/mv/dexalot.png' }, // BannedAccounts
  '0x06b82468100a3a7b0eac77289f0d1ab920573b16': { name: 'Dexalot', logo: '/ecosystem/mv/dexalot.png' }, // Create3Factory
  '0x3d3e4f0523500f95039d0fe600acf2ade4b06eb9': { name: 'Dexalot', logo: '/ecosystem/mv/dexalot.png' }, // DexalotRouter
  '0xc725229aefeab5faec9cc1667d79d9478e564a0c': { name: 'Dexalot', logo: '/ecosystem/mv/dexalot.png' }, // Exchange
  '0x170c15cb9887e6adb097518104b174df212bb190': { name: 'Dexalot', logo: '/ecosystem/mv/dexalot.png' }, // LzV2App
  '0xa0421a4db5bb7577f9bb9b577b5f600a642368be': { name: 'Dexalot', logo: '/ecosystem/mv/dexalot.png' }, // MainnetRFQ
  '0x1fd108cf42a59c635bd4703b8dbc8a741ff834be': { name: 'Dexalot', logo: '/ecosystem/mv/dexalot.png' }, // Portfolio
  '0x246c87368580acd6e9ca46bf112ad91978389634': { name: 'Dexalot', logo: '/ecosystem/mv/dexalot.png' }, // PortfolioBridge
  // ── Band ──
  '0x9c5490fc68005df8b2dc124309c2c036b93d785f': { name: 'Band', logo: '/ecosystem/mv/band.png' }, // proxy
  // ── Gamma ──
  '0x974de5b7c7d4acb42ac89b7a1978e7f0aea2267d': { name: 'Gamma', logo: '/ecosystem/mv/gamma.jpg' }, // Vault
  // ── Curvance ──
  '0xe01d426b589c7834a5f6b20d7e992a705d3c22ed': { name: 'Curvance', logo: '/ecosystem/mv/curvance.jpg' }, // Curvance Wrapped MON
  '0x8ee9fc28b8da872c38a496e9ddb9700bb7261774': { name: 'Curvance', logo: '/ecosystem/mv/curvance.jpg' }, // cUSDC
  '0xad4aa2a713fb86fbb6b60de2af9e32a11db6abf2': { name: 'Curvance', logo: '/ecosystem/mv/curvance.jpg' }, // csAUSD
  '0x6e182eb501800c555bd5e662e6d350d627f504d8': { name: 'Curvance', logo: '/ecosystem/mv/curvance.jpg' }, // cAUSD
  '0x0fced51b526bfa5619f83d97b54a57e3327eb183': { name: 'Curvance', logo: '/ecosystem/mv/curvance.jpg' }, // cWMON
  '0x1e240e30e51491546dec3af16b0b4eac8dd110d4': { name: 'Curvance', logo: '/ecosystem/mv/curvance.jpg' }, // Curvance Wrapped MON
  '0x494876051b0e85dce5ecd5822b1ad39b9660c928': { name: 'Curvance', logo: '/ecosystem/mv/curvance.jpg' }, // csMON
  '0x852ff1ec21d63b405ec431e04ae3ac760e29263d': { name: 'Curvance', logo: '/ecosystem/mv/curvance.jpg' }, // cearnAUSD
  // ── FoMonad Rugpad ──
  '0xd2c45789a6a26cbb961e7e1b65fa2b5bb3872639': { name: 'FoMonad Rugpad', logo: '/ecosystem/mv/fomonad-rugpad.png' }, // FoMonadGame
  '0x9f4834920e7ad3275f3cf6587ad9c9f7d387f1cf': { name: 'FoMonad Rugpad', logo: '/ecosystem/mv/fomonad-rugpad.png' }, // foMON
  '0xad269fbec6ebbad424fcdc0f8e62f2056a72b403': { name: 'FoMonad Rugpad', logo: '/ecosystem/mv/fomonad-rugpad.png' }, // VibecoinImpl
  // ── Cashmere ──
  '0xd156ffb54871f4562744d6be5d6321b5bffca3b6': { name: 'Cashmere', logo: '/ecosystem/mv/cashmere.jpg' }, // CashmereCCTP
  // ── HaHa Wallet ──
  '0x4631f923c3c470061a97e008ed9c33da4349612c': { name: 'HaHa Wallet', logo: '/ecosystem/mv/haha-wallet.png' }, // FeeManager
  '0xa01a2488cbe09156da4a78fa46483556ce41710a': { name: 'HaHa Wallet', logo: '/ecosystem/mv/haha-wallet.png' }, // MerkleDistributor
  '0xbd2c0dc6521cd25a8bb3943f50b5eec7a9d9a8a2': { name: 'HaHa Wallet', logo: '/ecosystem/mv/haha-wallet.png' }, // MetaAccount
  '0xfff4badfe0eb9731f5593fe7ced5b1209055e640': { name: 'HaHa Wallet', logo: '/ecosystem/mv/haha-wallet.png' }, // NonceManager
  // ── Fly ──
  '0x20f6ee51340adeed01a59b0e65cb3703f3dc860c': { name: 'Fly', logo: '/ecosystem/mv/fly.jpg' }, // DexAggregator
  '0x956df8424b556f0076e8abf5481605f5a791cc7f': { name: 'Fly', logo: '/ecosystem/mv/fly.jpg' }, // MagpieRouterV3_1
  // ── Bro Fun ──
  '0xdf7a89fc62e5120c4617f143c7acddab0d1ca7a2': { name: 'Bro Fun', logo: '/ecosystem/mv/bro-fun.jpg' }, // Brofun
  // ── PlayKami ──
  '0xc1c59b10f896715a1a34085c96ef9309484a086b': { name: 'PlayKami', logo: '/ecosystem/mv/playkami.jpg' }, // DropMarketplace
  '0xc2d57443f061b4490b1e588f3009d6357e6ad062': { name: 'PlayKami', logo: '/ecosystem/mv/playkami.jpg' }, // DropCard
  '0x7ef90ba0d6c3a46c813d8abe02ae5116b72309fe': { name: 'PlayKami', logo: '/ecosystem/mv/playkami.jpg' }, // DropVendingMachine
  '0xdfae9de709ce3513d8e84c704c2eed8d7cfbb3f0': { name: 'PlayKami', logo: '/ecosystem/mv/playkami.jpg' }, // ReferrerRegistry
  // ── Kodeus ──
  '0xa0371d51c086f846bd02c331dd31cc510645332e': { name: 'Kodeus', logo: '/ecosystem/mv/kodeus.jpg' }, // KodeusMetricsTrackerV6
  '0x3d3c1db86989ed5196358ee03e2f1258ea183dcb': { name: 'Kodeus', logo: '/ecosystem/mv/kodeus.jpg' }, // KodeusAgents
  '0xa2c272c0d4fd83587ce3a4e81fa3ad0eb9d63f9d': { name: 'Kodeus', logo: '/ecosystem/mv/kodeus.jpg' }, // XKODE
  '0xec774df35d1169e01c36b895fb1f272feb70f12b': { name: 'Kodeus', logo: '/ecosystem/mv/kodeus.jpg' }, // XKODEDistributor
  // ── Primus ──
  '0x50bd377eb8d4236bb587ab3fb1eeafd888aeec58': { name: 'Primus', logo: '/ecosystem/mv/primus.jpg' }, // PrimusRedEnvelope
  '0xa2e0700a269be3158c81e4739518b324d4398588': { name: 'Primus', logo: '/ecosystem/mv/primus.jpg' }, // PrimusTip
  // ── Narwhal Finance ──
  '0x3556d16519e3407ad43d5d7b3011bb095553d77a': { name: 'Narwhal Finance', logo: '/ecosystem/mv/narwhal-finance.svg' }, // Trading
  '0xfbc1cf329ad241352e777ab7bc17962452b87949': { name: 'Narwhal Finance', logo: '/ecosystem/mv/narwhal-finance.svg' }, // TradingStorage
  '0x5c39f9739c123e64535f6250b256964bc20c52f1': { name: 'Narwhal Finance', logo: '/ecosystem/mv/narwhal-finance.svg' }, // PairInfos
  '0xe22fb1f1bb003759faced645458b8b8ee262828d': { name: 'Narwhal Finance', logo: '/ecosystem/mv/narwhal-finance.svg' }, // FeeHelper
  '0xb412a5d72c203df308624e435659c9f70b6960aa': { name: 'Narwhal Finance', logo: '/ecosystem/mv/narwhal-finance.svg' }, // TradingVault
  // ── OpenOcean ──
  '0x6352a56caadc4f1e25cd6c75970fa768a3304e64': { name: 'OpenOcean', logo: '/ecosystem/mv/openocean.png' }, // Router
  // ── Puffer ──
  '0x37d6382b6889ccef8d6871a8b60e667115eddbcf': { name: 'Puffer', logo: '/ecosystem/mv/puffer.jpg' }, // pufETH
  // ── Doppler ──
  '0x5fbe931dc4b923a7abe4c47ad68d5bf9eda5b76d': { name: 'Doppler', logo: '/ecosystem/mv/doppler.jpg' }, // LaunchpadGovernanceFacto
  '0x8b4c7db9121fc885689c0a50d5a1429f15aec2a0': { name: 'Doppler', logo: '/ecosystem/mv/doppler.jpg' }, // LockableUniswapV3Initial
  '0xaa47d2977d622dbdfd33eef6a8276727c52eb4e5': { name: 'Doppler', logo: '/ecosystem/mv/doppler.jpg' }, // TokenFactory
  '0x580ca49389d83b019d07e17e99454f2f218e2dc0': { name: 'Doppler', logo: '/ecosystem/mv/doppler.jpg' }, // UniswapV4ScheduledMultic
  /* END GENERATED */
}

/**
 * Project behind a destination address, or null for plain wallets and unknown
 * contracts. Never guesses.
 *
 * @param {string | null | undefined} to
 * @returns {ContractProject | null}
 */
export function projectFor(to) {
  if (!to) return null
  return CONTRACTS[String(to).toLowerCase()] || null
}

/**
 * Tally recruits by project for a ship card: [{name, logo, count}], most
 * active first; unknown contracts are aggregated into an `other` count.
 *
 * @param {ReadonlyArray<{to?: string | null}>} recruits
 * @param {number} [max] rows to keep
 */
export function projectBreakdown(recruits, max = 4) {
  /** @type {Map<string, {name: string, logo: string | null, count: number}>} */
  const tally = new Map()
  let other = 0
  for (const r of recruits || []) {
    const p = projectFor(r?.to)
    if (!p) { other++; continue }
    const row = tally.get(p.name) || { name: p.name, logo: p.logo, count: 0 }
    row.count++
    tally.set(p.name, row)
  }
  const rows = [...tally.values()].sort((a, b) => b.count - a.count).slice(0, max)
  return { rows, other }
}

/** MonadVision block URL — the chain's configured explorer. */
export function monadVisionBlockUrl(number) {
  return `https://monadvision.com/block/${number}`
}
