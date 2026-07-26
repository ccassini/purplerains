/**
 * The war roster: every chain that can take the field against Monad.
 *
 * THE LAW OF THE FIELD: one soldier per 1,000,000 gas of block space per
 * second. A chain's army size is its real throughput capacity — block gas
 * limit divided by block time — nothing else. No chain is handicapped, no
 * chain is flattered.
 *
 * Every figure below was measured from the chain's own public RPC
 * (eth_getBlockByNumber: gasLimit from the latest block, block time averaged
 * over a 256-block span) on `measuredAt`. `method: 'docs'` marks chains whose
 * RPC reports a sentinel limit (Arbitrum-style 2^50) where the documented
 * per-block cap is used instead — the note says exactly what was found.
 * The battle page re-measures live on roster changes for every corsOk chain.
 *
 * GENERATED from the measure-evm-gas-capacity workflow run of 2026-07-26.
 * Edit measurements by re-running the workflow, not by hand.
 */

/** One soldier represents this much block gas per second. */
export const SOLDIER_GAS = 1_000_000

/** One rendered figure stands for this many soldiers (the HUD says so). */
export const FIGURES_PER = 10


export const MONAD_CHAIN = {
  key: 'monad', name: 'Monad', chainId: 143, kind: 'L1',
  rpcs: ["https://rpc.monad.xyz"],
  gasLimit: 150000000, blockTimeMs: 309, gasPerSecM: 486.08,
  corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
  logo: '/monad_logo.png',
  note: "Measured ~309ms average over 256 blocks ending at block 90387634 \u2014 faster than the commonly cited 400ms slot time; ACAO echoed the requesting origin.",
  color: '#836ef9', tag: 'MONAD',
}

/** The coalition bench, strongest first. Measured, never guessed. */
export const CHAIN_REGISTRY = [
  {
    key: 'sonic', name: "Sonic", chainId: 146, kind: 'L1',
    rpcs: ["https://sonic-rpc.publicnode.com", "https://rpc.soniclabs.com", "https://sonic.drpc.org"],
    gasLimit: 5000000000, blockTimeMs: 2238, gasPerSecM: 2233.86,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/sonic.jpg',
    note: "Block 76508541. 5B gasLimit confirmed identically on 3 independent RPCs (publicnode, official soniclabs, drpc) and sits at the sanity ceiling \u2014 it is a protocol ceiling, not sustained throughput, so gasPerSecM here is theoretical headroom. Blocks are produced on demand; ~2.2s cadence was stable across 256- and 64-block windows at measurement time.",
    color: '#FE9A4D', tag: 'SONIC',
  },
  {
    key: 'opbnb', name: "opBNB", chainId: 204, kind: 'L2',
    rpcs: ["https://opbnb-rpc.publicnode.com", "https://opbnb.drpc.org", "https://opbnb-mainnet-rpc.bnbchain.org"],
    gasLimit: 100000000, blockTimeMs: 250, gasPerSecM: 400,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/opbnb.jpg',
    note: "Measured at block 167688264; 256-block window gave 250ms/block (opBNB runs sub-second blocks post speed upgrade), 100M gas limit. ACAO: *",
    color: '#F0B90B', tag: 'OPBNB',
  },
  {
    key: 'abstract', name: "Abstract", chainId: 2741, kind: 'L2',
    rpcs: ["https://api.mainnet.abs.xyz"],
    gasLimit: 200000000, blockTimeMs: 629, gasPerSecM: 318.02,
    corsOk: true, method: 'docs', measuredAt: '2026-07-26',
    logo: '/vs/chains/abstract.jpg',
    note: "ZKsync ZK-stack chain: header gasLimit is the 2^50 placeholder (SystemContext.blockGasLimit confirms). Real execution cap read from the node via zks_getFeeParams: max_gas_per_batch = 200M. blockTimeMs is the measured L2 block cadence (256-block avg at block 76095970). gasPerSecM applies the batch gas cap at block cadence and is a theoretical ceiling \u2014 batches currently seal on timeout (~24 min apart, measured over 50 batches), so treat as burst capacity, not observed throughput.",
    color: '#07C983', tag: 'ABS',
  },
  {
    key: 'linea', name: "Linea", chainId: 59144, kind: 'L2',
    rpcs: ["https://linea-rpc.publicnode.com", "https://rpc.linea.build", "https://linea.drpc.org"],
    gasLimit: 2000000000, blockTimeMs: 9606, gasPerSecM: 208.21,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/linea.jpg',
    note: "2e9 gasLimit passes the stated sanity range and is cross-confirmed on official rpc.linea.build, but it is Linea's nominal protocol block gas limit; the sequencer's prover/module limits cap real per-block usage far lower, so 208 M/s is a nominal ceiling. Block time measured over 256 blocks (31520097-31520353): 9605.5ms.",
    color: '#61DFFF', tag: 'LINEA',
  },
  {
    key: 'base', name: "Base", chainId: 8453, kind: 'L2',
    rpcs: ["https://base-rpc.publicnode.com", "https://base.drpc.org", "https://mainnet.base.org"],
    gasLimit: 400000000, blockTimeMs: 2000, gasPerSecM: 200,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/base.jpg',
    note: "Measured at block 49124824; 256-block window gave exactly 2.0s/block. ACAO: *",
    color: '#0052FF', tag: 'BASE',
  },
  {
    key: 'worldchain', name: "World Chain", chainId: 480, kind: 'L2',
    rpcs: ["https://worldchain.drpc.org", "https://worldchain-mainnet.g.alchemy.com/public"],
    gasLimit: 280000000, blockTimeMs: 2000, gasPerSecM: 140,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/worldchain.jpg',
    note: "Measured at block 32851681 via drpc (worldchain-rpc.publicnode.com returned non-JSON); 256-block window gave 2.0s/block. ACAO: *",
    color: '#000000', tag: 'WLD',
  },
  {
    key: 'nova', name: "Arbitrum Nova", chainId: 42170, kind: 'L2',
    rpcs: ["https://arbitrum-nova-rpc.publicnode.com", "https://arbitrum-nova.drpc.org", "https://nova.arbitrum.io/rpc"],
    gasLimit: 32000000, blockTimeMs: 250, gasPerSecM: 128,
    corsOk: true, method: 'docs', measuredAt: '2026-07-26',
    logo: '/vs/chains/nova.jpg',
    note: "RPC reports the same 2^50 gasLimit placeholder; docs cap is 32M/block. Nova mints blocks on demand: measured avg gap over last 256 blocks was 39758ms (outside the 50-20000ms sanity window), so blockTimeMs uses the documented ~250ms Arbitrum sequencer cadence. Real sustained throughput is far below the 128 M/s ceiling due to low traffic.",
    color: '#EF8220', tag: 'NOVA',
  },
  {
    key: 'arbitrum', name: "Arbitrum One", chainId: 42161, kind: 'L2',
    rpcs: ["https://arbitrum-one-rpc.publicnode.com", "https://arbitrum.drpc.org", "https://arb1.arbitrum.io/rpc"],
    gasLimit: 32000000, blockTimeMs: 254, gasPerSecM: 126.03,
    corsOk: true, method: 'docs', measuredAt: '2026-07-26',
    logo: '/vs/chains/arbitrum.jpg',
    note: "RPC reports nominal 2^50 gasLimit placeholder (1125899906842624); Arbitrum docs state a 32M effective per-block execution cap. Block time measured over 256 blocks (487789692-487789948): 253.9ms. Docs also set a sustained gas target of 7M gas/s, so 126 M/s is burst ceiling, not sustained.",
    color: '#28A0F0', tag: 'ARB',
  },
  {
    key: 'cronos', name: "Cronos", chainId: 25, kind: 'L1',
    rpcs: ["https://cronos-evm-rpc.publicnode.com", "https://evm.cronos.org", "https://cronos.drpc.org"],
    gasLimit: 60000000, blockTimeMs: 488, gasPerSecM: 122.88,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/cronos.jpg',
    note: "Measured over 256 blocks (84758709..84758965) on publicnode: 60M gasLimit at ~0.49s blocks (Cosmos SDK / CometBFT sub-second blocks), giving the highest raw gas throughput of this batch. CORS ACAO '*'.",
    color: '#002D74', tag: 'CRO',
  },
  {
    key: 'bnb', name: "BNB Smart Chain", chainId: 56, kind: 'L1',
    rpcs: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org"],
    gasLimit: 55000000, blockTimeMs: 449, gasPerSecM: 122.43,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/bnb.jpg',
    note: "Block 112175962. Sub-second blocks (post-Maxwell). 55M gasLimit corroborated by official bnbchain dataseed.",
    color: '#F0B90B', tag: 'BNB',
  },
  {
    key: 'polygon', name: "Polygon PoS", chainId: 137, kind: 'L1',
    rpcs: ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"],
    gasLimit: 160000000, blockTimeMs: 1500, gasPerSecM: 106.67,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/polygon.jpg',
    note: "Block 90889328. Technically an Ethereum sidechain with PoS checkpoints, not a rollup. 160M gasLimit corroborated by drpc.",
    color: '#8247E5', tag: 'POL',
  },
  {
    key: 'unichain', name: "Unichain", chainId: 130, kind: 'L2',
    rpcs: ["https://unichain-rpc.publicnode.com", "https://unichain.drpc.org", "https://mainnet.unichain.org"],
    gasLimit: 60000000, blockTimeMs: 1000, gasPerSecM: 60,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/unichain.jpg',
    note: "Measured at block 54290643; 256-block window gave exactly 1.0s/block. ACAO: *",
    color: '#F50DB4', tag: 'UNI',
  },
  {
    key: 'ink', name: "Ink", chainId: 57073, kind: 'L2',
    rpcs: ["https://ink.drpc.org", "https://rpc-gel.inkonchain.com"],
    gasLimit: 60000000, blockTimeMs: 1000, gasPerSecM: 60,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/ink.jpg',
    note: "Measured at block 51540596 via drpc (ink-rpc.publicnode.com returned non-JSON); 256-block window gave exactly 1.0s/block. ACAO: *",
    color: '#7132F5', tag: 'INK',
  },
  {
    key: 'metis', name: "Metis", chainId: 1088, kind: 'L2',
    rpcs: ["https://metis-rpc.publicnode.com", "https://andromeda.metis.io/?owner=1088", "https://metis.drpc.org"],
    gasLimit: 1100000000, blockTimeMs: 22703, gasPerSecM: 48.45,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/metis.jpg',
    note: "gasLimit 1.1B is the real per-block RPC value. Metis sequencer mints blocks on demand, so blockTimeMs (22.7s over 256 blocks, exceeding the 20s sanity band) reflects current low activity (utilization 0.007%), corroborated by the official Blockscout long-window average of 21.97s. gasPerSecM is therefore demand-driven cadence, not a protocol ceiling \u2014 under load blocks arrive in seconds. CORS ACAO '*'.",
    color: '#00DACC', tag: 'METIS',
  },
  {
    key: 'avax', name: "Avalanche C-Chain", chainId: 43114, kind: 'L1',
    rpcs: ["https://avalanche-c-chain-rpc.publicnode.com"],
    gasLimit: 40000000, blockTimeMs: 1094, gasPerSecM: 36.57,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/avax.jpg',
    note: "Block 91247842. 256-block window; C-Chain produces blocks on demand so cadence reflects current activity.",
    color: '#E84142', tag: 'AVAX',
  },
  {
    key: 'plasma', name: "Plasma", chainId: 9745, kind: 'L1',
    rpcs: ["https://rpc.plasma.to"],
    gasLimit: 36000000, blockTimeMs: 1000, gasPerSecM: 36,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/plasma.jpg',
    note: "Measured over 256 blocks ending at block 28098662; ACAO echoed the requesting origin. Accent green from plasma.org/brand.",
    color: '#3DDC84', tag: 'XPL',
  },
  {
    key: 'apechain', name: "ApeChain", chainId: 33139, kind: 'L2',
    rpcs: ["https://rpc.apechain.com", "https://apechain.drpc.org"],
    gasLimit: 32000000, blockTimeMs: 1066, gasPerSecM: 30.01,
    corsOk: true, method: 'docs', measuredAt: '2026-07-26',
    logo: '/vs/chains/apechain.jpg',
    note: "Arbitrum Orbit L3 (settles to Arbitrum One). Header gasLimit is the 2^50 placeholder; real cap read on-chain via ArbGasInfo.getGasAccountingParams(): per-block limit 32M, sustained speed limit 7M gas/s. Block time measured over 256 blocks at block 44440833; blocks are minted on demand. gasPerSecM = 32M burst cap / measured cadence; sustained pricing target is 7 Mgas/s.",
    color: '#0054FA', tag: 'APE',
  },
  {
    key: 'mantle', name: "Mantle", chainId: 5000, kind: 'L2',
    rpcs: ["https://rpc.mantle.xyz", "https://mantle-rpc.publicnode.com", "https://mantle.drpc.org"],
    gasLimit: 60000000, blockTimeMs: 2000, gasPerSecM: 30,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/mantle.jpg',
    note: "Measured on rpc.mantle.xyz over 256 blocks; header gasLimit is a clean 60M with normal gasUsed (no inflated Mantle gas metering in headers), ACAO=*.",
    color: '#65B3AE', tag: 'MNT',
  },
  {
    key: 'lisk', name: "Lisk", chainId: 1135, kind: 'L2',
    rpcs: ["https://rpc.api.lisk.com", "https://lisk.drpc.org"],
    gasLimit: 60000000, blockTimeMs: 2000, gasPerSecM: 30,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/lisk.jpg',
    note: "Measured on rpc.api.lisk.com over 256 blocks; ACAO=*.",
    color: '#0D4EA0', tag: 'LSK',
  },
  {
    key: 'celo', name: "Celo", chainId: 42220, kind: 'L2',
    rpcs: ["https://celo-rpc.publicnode.com", "https://forno.celo.org", "https://celo.drpc.org"],
    gasLimit: 30000000, blockTimeMs: 1000, gasPerSecM: 30,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/celo.jpg',
    note: "Measured over 256 blocks (73137998..73138254) on publicnode: 30M gasLimit, exactly 1s blocks. CORS ACAO '*'. Celo migrated from standalone L1 to an Ethereum L2 (OP Stack) in March 2025, hence kind=L2 despite alt-L1 batch label.",
    color: '#FCFF52', tag: 'CELO',
  },
  {
    key: 'ronin', name: "Ronin", chainId: 2020, kind: 'L1',
    rpcs: ["https://api.roninchain.com/rpc", "https://ronin.drpc.org"],
    gasLimit: 60000000, blockTimeMs: 2000, gasPerSecM: 30,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/ronin.jpg',
    note: "Standalone DPoS EVM chain (Sky Mavis). Measured over 256 blocks at block 58785111: fixed 2s blocks, 60M gasLimit, actively used (3.57M gasUsed in sampled block). CORS: ACAO echoes the requesting origin (not *), which still permits browser use.",
    color: '#1273EA', tag: 'RON',
  },
  {
    key: 'sei', name: "Sei EVM", chainId: 1329, kind: 'L1',
    rpcs: ["https://evm-rpc.sei-apis.com"],
    gasLimit: 12500000, blockTimeMs: 418, gasPerSecM: 29.91,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/sei.jpg',
    note: "Measured over 256 blocks ending at block 222263703; ACAO returned *.",
    color: '#9E1F19', tag: 'SEI',
  },
  {
    key: 'flare', name: "Flare", chainId: 14, kind: 'L1',
    rpcs: ["https://flare-api.flare.network/ext/C/rpc", "https://flare.drpc.org", "https://rpc.ankr.com/flare"],
    gasLimit: 28000000, blockTimeMs: 1145, gasPerSecM: 24.46,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/flare.jpg',
    note: "Measured over 256 blocks (65921110..65921366) on the official Flare API node: 28M gasLimit, ~1.14s blocks (Avalanche-derived Snowman consensus, blocks on demand but currently dense). CORS ACAO '*'.",
    color: '#E62058', tag: 'FLR',
  },
  {
    key: 'taiko', name: "Taiko Alethia", chainId: 167000, kind: 'L2',
    rpcs: ["https://taiko-rpc.publicnode.com", "https://rpc.mainnet.taiko.xyz", "https://taiko.drpc.org"],
    gasLimit: 46000000, blockTimeMs: 2000, gasPerSecM: 23,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/taiko.jpg',
    note: "Measured over 256 blocks (9228804-9229060): exactly 2000ms avg block time, 46M gasLimit.",
    color: '#E81899', tag: 'TKO',
  },
  {
    key: 'optimism', name: "OP Mainnet", chainId: 10, kind: 'L2',
    rpcs: ["https://optimism-rpc.publicnode.com", "https://optimism.drpc.org", "https://mainnet.optimism.io"],
    gasLimit: 40000000, blockTimeMs: 2000, gasPerSecM: 20,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/optimism.jpg',
    note: "Measured at block 154720109; 256-block window gave exactly 2.0s/block. ACAO: *",
    color: '#FF0420', tag: 'OP',
  },
  {
    key: 'soneium', name: "Soneium", chainId: 1868, kind: 'L2',
    rpcs: ["https://soneium-rpc.publicnode.com", "https://soneium.drpc.org", "https://rpc.soneium.org"],
    gasLimit: 40000000, blockTimeMs: 2000, gasPerSecM: 20,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/soneium.jpg',
    note: "Measured at block 25952125; 256-block window gave exactly 2.0s/block. Brand is monochrome; #4D4D4D chosen to stay distinct from World Chain's black. ACAO: *",
    color: '#4D4D4D', tag: 'SONE',
  },
  {
    key: 'xai', name: "Xai", chainId: 660279, kind: 'L2',
    rpcs: ["https://xai-chain.net/rpc"],
    gasLimit: 32000000, blockTimeMs: 1656, gasPerSecM: 19.32,
    corsOk: true, method: 'docs', measuredAt: '2026-07-26',
    logo: '/vs/chains/xai.jpg',
    note: "Arbitrum Orbit L3 gaming chain. Header gasLimit is the 2^50 placeholder; real cap from ArbGasInfo.getGasAccountingParams(): per-block limit 32M, speed limit 7M gas/s. Block time measured over 256 blocks at block 133902889 (on-demand block production).",
    color: '#F30919', tag: 'XAI',
  },
  {
    key: 'berachain', name: "Berachain", chainId: 80094, kind: 'L1',
    rpcs: ["https://rpc.berachain.com"],
    gasLimit: 36000000, blockTimeMs: 2000, gasPerSecM: 18,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/berachain.jpg',
    note: "Measured over 256 blocks ending at block 24012149; ACAO echoed the requesting origin.",
    color: '#814625', tag: 'BERA',
  },
  {
    key: 'story', name: "Story", chainId: 1514, kind: 'L1',
    rpcs: ["https://mainnet.storyrpc.io"],
    gasLimit: 36000000, blockTimeMs: 2285, gasPerSecM: 15.75,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/story.jpg',
    note: "Measured over 256 blocks ending at block 20244702; ACAO returned *. Brand identity is monochrome near-black per story.foundation.",
    color: '#1A1A1A', tag: 'IP',
  },
  {
    key: 'blast', name: "Blast", chainId: 81457, kind: 'L2',
    rpcs: ["https://rpc.blast.io", "https://blast-rpc.publicnode.com", "https://blast.drpc.org"],
    gasLimit: 30000000, blockTimeMs: 2000, gasPerSecM: 15,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/blast.jpg',
    note: "Measured on rpc.blast.io over 256 blocks; ACAO reflects the requesting origin (https://purplerains.com).",
    color: '#FCFC03', tag: 'BLST',
  },
  {
    key: 'mode', name: "Mode", chainId: 34443, kind: 'L2',
    rpcs: ["https://mainnet.mode.network", "https://mode.drpc.org", "https://1rpc.io/mode"],
    gasLimit: 30000000, blockTimeMs: 2000, gasPerSecM: 15,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/mode.jpg',
    note: "Measured on mainnet.mode.network over 256 blocks; ACAO=*.",
    color: '#DFFE00', tag: 'MODE',
  },
  {
    key: 'fraxtal', name: "Fraxtal", chainId: 252, kind: 'L2',
    rpcs: ["https://rpc.frax.com", "https://fraxtal.drpc.org"],
    gasLimit: 30000000, blockTimeMs: 2000, gasPerSecM: 15,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/fraxtal.jpg',
    note: "Measured on rpc.frax.com over 256 blocks; ACAO=*. Frax brand is monochrome black.",
    color: '#000000', tag: 'FRAX',
  },
  {
    key: 'zora', name: "Zora", chainId: 7777777, kind: 'L2',
    rpcs: ["https://rpc.zora.energy", "https://zora.drpc.org"],
    gasLimit: 30000000, blockTimeMs: 2000, gasPerSecM: 15,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/zora.jpg',
    note: "Measured on rpc.zora.energy over 256 blocks; ACAO=*. Brand mark is the multicolor Zorb; #2B5DF0 is the commonly used flat Zora blue.",
    color: '#2B5DF0', tag: 'ZORA',
  },
  {
    key: 'bob', name: "Bob", chainId: 60808, kind: 'L2',
    rpcs: ["https://rpc.gobob.xyz", "https://bob.drpc.org"],
    gasLimit: 30000000, blockTimeMs: 2000, gasPerSecM: 15,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/bob.jpg',
    note: "Measured on rpc.gobob.xyz over 256 blocks; ACAO=*. bob-rpc.publicnode.com returned empty responses and was excluded.",
    color: '#F25D00', tag: 'BOB',
  },
  {
    key: 'immutable', name: "Immutable zkEVM", chainId: 13371, kind: 'L2',
    rpcs: ["https://rpc.immutable.com", "https://immutable-zkevm.drpc.org"],
    gasLimit: 30000000, blockTimeMs: 2000, gasPerSecM: 15,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/immutable.jpg',
    note: "Measured over 256 blocks at block 41378195: fixed 2s blocks, 30M gasLimit. Sampled latest block had gasUsed 0 (quiet chain).",
    color: '#0CAFFF', tag: 'IMX',
  },
  {
    key: 'etherlink', name: "Etherlink", chainId: 42793, kind: 'L2',
    rpcs: ["https://node.mainnet.etherlink.com"],
    gasLimit: 10810800, blockTimeMs: 801, gasPerSecM: 13.5,
    corsOk: true, method: 'docs', measuredAt: '2026-07-26',
    logo: '/vs/chains/etherlink.jpg',
    note: "Official RPC reports a sentinel gasLimit of 2^50 (1,125,899,906,842,624) \u2014 absurd, so docs are used. docs.etherlink.com/progress/upgrades documents a protocol 'speed limit' of 13.5M gas/s (Etherlink 6.0 'Farfadet'; still current as of upgrade 6.6, July 2026); gasPerSecM=13.50 comes straight from that. blockTimeMs 801 is RPC-measured over 256 blocks; gasLimit shown is the per-block equivalent (13.5M gas/s x 0.8008s). Tezos smart rollup, hence kind=L2. CORS ACAO '*'.",
    color: '#38FF9C', tag: 'ETLK',
  },
  {
    key: 'zksync', name: "zkSync Era", chainId: 324, kind: 'L2',
    rpcs: ["https://mainnet.era.zksync.io", "https://zksync.drpc.org", "https://1rpc.io/zksync2-era"],
    gasLimit: 80000000, blockTimeMs: 6348, gasPerSecM: 12.6,
    corsOk: true, method: 'docs', measuredAt: '2026-07-26',
    logo: '/vs/chains/zksync.jpg',
    note: "RPC reports the 2^50 gasLimit placeholder. ZKsync fee-model docs give an 80M computation-gas cap per batch (MAX_GAS_PER_BATCH, VM hard limit 2^32), used here as the effective limit. Block time measured over 256 L2 blocks (71313278-71313534): 6347.7ms. Blocks and batches differ, so 12.6 M/s is an approximation.",
    color: '#8C8DFC', tag: 'ERA',
  },
  {
    key: 'moonbeam', name: "Moonbeam", chainId: 1284, kind: 'L1',
    rpcs: ["https://moonbeam-rpc.publicnode.com", "https://rpc.api.moonbeam.network", "https://moonbeam.drpc.org"],
    gasLimit: 60000000, blockTimeMs: 6117, gasPerSecM: 9.81,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/moonbeam.jpg',
    note: "Measured over 256 blocks (16589582..16589838) on publicnode: 60M gasLimit, ~6.12s blocks (Polkadot parachain, 6s slot target). CORS ACAO '*'. Classified L1 as a sovereign parachain, not an Ethereum rollup.",
    color: '#53CBC9', tag: 'GLMR',
  },
  {
    key: 'degen', name: "Degen Chain", chainId: 666666666, kind: 'L2',
    rpcs: ["https://rpc.degen.tips"],
    gasLimit: 32000000, blockTimeMs: 4571, gasPerSecM: 7,
    corsOk: true, method: 'docs', measuredAt: '2026-07-26',
    logo: '/vs/chains/degen.jpg',
    note: "Arbitrum Orbit L3 on Base. Header gasLimit is the 2^50 placeholder; ArbGasInfo.getGasAccountingParams() gives per-block limit 32M and speed limit 7M gas/s. Measured 256-block avg block time was 53,922ms (chain is idle; blocks mint on demand), outside the sanity range, so gasPerSecM is the documented 7 Mgas/s speed limit and blockTimeMs is derived (32M / 7M gas/s = 4571ms per full block at the sustained limit). CORS: ACAO echoes the requesting origin.",
    color: '#A36EFD', tag: 'DEGEN',
  },
  {
    key: 'eth', name: "Ethereum", chainId: 1, kind: 'L1',
    rpcs: ["https://ethereum-rpc.publicnode.com"],
    gasLimit: 60000000, blockTimeMs: 12000, gasPerSecM: 5,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/eth.jpg',
    note: "Block 25614479. 256-block window, exact 12.0s cadence. chainId verified via eth_chainId.",
    color: '#627EEA', tag: 'ETH',
  },
  {
    key: 'manta', name: "Manta Pacific", chainId: 169, kind: 'L2',
    rpcs: ["https://pacific-rpc.manta.network/http", "https://manta-pacific.drpc.org", "https://1rpc.io/manta"],
    gasLimit: 50000000, blockTimeMs: 10000, gasPerSecM: 5,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/manta.jpg',
    note: "Measured over 256 blocks at block 9081505 and cross-checked on three independent RPCs plus consecutive-block timestamps: uniform 10s blocks (not the 2s OP-stack default), 50M gasLimit.",
    color: '#29CCB9', tag: 'MANTA',
  },
  {
    key: 'kava', name: "Kava EVM", chainId: 2222, kind: 'L1',
    rpcs: ["https://kava-evm-rpc.publicnode.com", "https://evm.kava.io", "https://kava.drpc.org"],
    gasLimit: 20000000, blockTimeMs: 5734, gasPerSecM: 3.49,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/kava.jpg',
    note: "Measured over 256 blocks (21807188..21807444) on publicnode: 20M gasLimit, ~5.73s blocks (Cosmos co-chain). CORS ACAO '*'.",
    color: '#FF433E', tag: 'KAVA',
  },
  {
    key: 'gnosis', name: "Gnosis Chain", chainId: 100, kind: 'L1',
    rpcs: ["https://gnosis-rpc.publicnode.com"],
    gasLimit: 17000000, blockTimeMs: 5156, gasPerSecM: 3.3,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/gnosis.jpg',
    note: "Block 47394611. Matches documented ~5s slots and 17M gas limit.",
    color: '#3E6957', tag: 'GNO',
  },
  {
    key: 'hyperevm', name: "HyperEVM", chainId: 999, kind: 'L1',
    rpcs: ["https://rpc.hyperliquid.xyz/evm"],
    gasLimit: 3000000, blockTimeMs: 984, gasPerSecM: 3.05,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/hyperevm.jpg',
    note: "Dual-block design: fast small blocks (~1s cadence, 3M gas limit measured on latest) interleaved with big blocks (~60s cadence, ~30M gas) reserved for heavy transactions like contract deploys. Figures reflect the small-block stream, measured over 256 blocks ending at block 41462825.",
    color: '#97FCE4', tag: 'HYPE',
  },
  {
    key: 'scroll', name: "Scroll", chainId: 534352, kind: 'L2',
    rpcs: ["https://scroll-rpc.publicnode.com", "https://rpc.scroll.io", "https://scroll.drpc.org"],
    gasLimit: 20000000, blockTimeMs: 10856, gasPerSecM: 1.84,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/scroll.jpg',
    note: "gasLimit 20M cross-confirmed on official rpc.scroll.io. Block time measured over 256 blocks (34475412-34475668): 10855.5ms avg; block production appears demand-paced at current traffic.",
    color: '#EBC28E', tag: 'SCRL',
  },
  {
    key: 'rootstock', name: "Rootstock", chainId: 30, kind: 'L1',
    rpcs: ["https://public-node.rsk.co", "https://rootstock-rpc.publicnode.com", "https://rootstock.drpc.org"],
    gasLimit: 10000000, blockTimeMs: 23777, gasPerSecM: 0.42,
    corsOk: true, method: 'rpc-measured', measuredAt: '2026-07-26',
    logo: '/vs/chains/rootstock.jpg',
    note: "Measured over 256 blocks (9092517..9092773) on the official public node: 10M gasLimit. blockTimeMs 23.8s exceeds the 20s sanity band but is genuine: Rootstock is a merged-mined Bitcoin sidechain (kind=L1/sidechain) with a documented ~30s historical average (dev.rootstock.io FAQ) moving toward RSKIP517's 20s target \u2014 23.8s sits exactly in that transition, with high per-block variance (1s-57s gaps observed). CORS ACAO '*'.",
    color: '#FF9100', tag: 'RSK',
  },
]

/** @returns {object|null} */
export function chainByKey(key) {
  if (key === MONAD_CHAIN.key) return MONAD_CHAIN
  return CHAIN_REGISTRY.find((c) => c.key === key) || null
}

/** Soldiers this chain fields per second: capacity over the soldier gas unit. */
export function soldiersPerSec(chain) {
  return (chain.gasPerSecM * 1_000_000) / SOLDIER_GAS
}

/** Soldiers one sealed block is worth (a sortie): block gas over soldier gas. */
export function soldiersPerBlock(chain) {
  return chain.gasLimit / SOLDIER_GAS
}
