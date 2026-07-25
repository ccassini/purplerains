// Official Monad Mainnet Validators
// Source: https://github.com/monad-developers/validator-info/tree/main/mainnet
// On-chain metadata (secp-keyed JSON) lives in /mainnet/*.json and is loaded by validatorApi — keep that folder in sync with the repo above.
// This array is for UI rotation; logo() uses legacy paths and may not match every upstream entry.

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/monad-developers/validator-info/main/mainnet'

// Helper to generate logo URL
const logo = (folder) => `${GITHUB_RAW_BASE}/${folder}/logo.png`

export const MONAD_VALIDATORS = [
  // Foundation & Core
  { name: 'Monad Foundation', logo: logo('monad-foundation') },
  
  // Major Validators (A-Z)
  { name: 'a]Blockdaemon', logo: logo('a%5Dblockdaemon') },
  { name: 'Aconcagua', logo: logo('aconcagua') },
  { name: 'Allnodes', logo: logo('allnodes') },
  { name: 'Alphachain', logo: logo('alphachain') },
  { name: 'Anchorage Digital', logo: logo('anchorage-digital') },
  { name: 'Ankr', logo: logo('ankr') },
  { name: 'Artifact', logo: logo('artifact') },
  { name: 'Astaking', logo: logo('astaking') },
  { name: 'Axelar', logo: logo('axelar') },
  
  { name: 'B Harvest', logo: logo('b-harvest') },
  { name: 'Bandito', logo: logo('bandito') },
  { name: 'Binary Holdings', logo: logo('binary-holdings') },
  { name: 'Bison Trails', logo: logo('bison-trails') },
  { name: 'Bitgo', logo: logo('bitgo') },
  { name: 'Bitkraft', logo: logo('bitkraft') },
  { name: 'Bitpanda', logo: logo('bitpanda') },
  { name: 'Bitrue', logo: logo('bitrue') },
  { name: 'Blockhunters', logo: logo('blockhunters') },
  { name: 'Blockscape', logo: logo('blockscape') },
  { name: 'Blockwatch', logo: logo('blockwatch') },
  { name: 'Bware Labs', logo: logo('bware-labs') },
  
  { name: 'Capsule', logo: logo('capsule') },
  { name: 'Chainflow', logo: logo('chainflow') },
  { name: 'Chainlayer', logo: logo('chainlayer') },
  { name: 'Chainstack', logo: logo('chainstack') },
  { name: 'Chorus One', logo: logo('chorus-one') },
  { name: 'Citadel.one', logo: logo('citadel-one') },
  { name: 'CoinSummer Labs', logo: logo('coinsummer-labs') },
  { name: 'Coinbase Cloud', logo: logo('coinbase-cloud') },
  { name: 'Coinhall', logo: logo('coinhall') },
  { name: 'CoinList', logo: logo('coinlist') },
  { name: 'Cosmostation', logo: logo('cosmostation') },
  { name: 'Cros-nest', logo: logo('cros-nest') },
  { name: 'Cryptomeria Capital', logo: logo('cryptomeria-capital') },
  
  { name: 'DappNode', logo: logo('dappnode') },
  { name: 'Data Nexus', logo: logo('data-nexus') },
  { name: 'Decentral', logo: logo('decentral') },
  { name: 'Decentralized Systems', logo: logo('decentralized-systems') },
  { name: 'DeFi Wallet', logo: logo('defi-wallet') },
  { name: 'Deutsche Telekom', logo: logo('deutsche-telekom') },
  { name: 'DEXTF', logo: logo('dextf') },
  { name: 'Dhruva', logo: logo('dhruva') },
  { name: 'Digital Finance Group', logo: logo('digital-finance-group') },
  { name: 'Dokia Capital', logo: logo('dokia-capital') },
  { name: 'DSRV', logo: logo('dsrv') },
  
  { name: 'Easy 2 Stake', logo: logo('easy-2-stake') },
  { name: 'ECO Stake', logo: logo('eco-stake') },
  { name: 'Electric Capital', logo: logo('electric-capital') },
  { name: 'Embark', logo: logo('embark') },
  { name: 'Enigma', logo: logo('enigma') },
  { name: 'Entropy', logo: logo('entropy') },
  { name: 'Everstake', logo: logo('everstake') },
  
  { name: 'Figment', logo: logo('figment') },
  { name: 'Finoa', logo: logo('finoa') },
  { name: 'First Digital', logo: logo('first-digital') },
  { name: 'Forbole', logo: logo('forbole') },
  { name: 'Foundation Nodes', logo: logo('foundation-nodes') },
  { name: 'Framework Ventures', logo: logo('framework-ventures') },
  { name: 'Frens Validator', logo: logo('frens-validator') },
  { name: 'Frontier', logo: logo('frontier') },
  
  { name: 'Galaxy', logo: logo('galaxy') },
  { name: 'Gate.io', logo: logo('gate-io') },
  { name: 'Gemini', logo: logo('gemini') },
  { name: 'Genesis Lab', logo: logo('genesis-lab') },
  { name: 'Giornata', logo: logo('giornata') },
  { name: 'Golden Ratio', logo: logo('golden-ratio') },
  { name: 'Grassroots', logo: logo('grassroots') },
  
  { name: 'HashKey Cloud', logo: logo('hashkey-cloud') },
  { name: 'Hashquark', logo: logo('hashquark') },
  { name: 'Hex Trust', logo: logo('hex-trust') },
  { name: 'High Stakes', logo: logo('high-stakes') },
  { name: 'Huobi', logo: logo('huobi') },
  
  { name: 'ICHI Foundation', logo: logo('ichi-foundation') },
  { name: 'Imperator', logo: logo('imperator') },
  { name: 'Infstones', logo: logo('infstones') },
  { name: 'Interop', logo: logo('interop') },
  { name: 'Ithaca', logo: logo('ithaca') },
  
  { name: 'Jump Crypto', logo: logo('jump-crypto') },
  { name: 'Just Mining', logo: logo('just-mining') },
  
  { name: 'Keplr', logo: logo('keplr') },
  { name: 'Kiln', logo: logo('kiln') },
  { name: 'King Nodes', logo: logo('king-nodes') },
  { name: 'Kraken', logo: logo('kraken') },
  { name: 'KuCoin', logo: logo('kucoin') },
  
  { name: 'Lemniscap', logo: logo('lemniscap') },
  { name: 'Lenix', logo: logo('lenix') },
  { name: 'Lido', logo: logo('lido') },
  { name: 'Lighthouse', logo: logo('lighthouse') },
  { name: 'Liquid', logo: logo('liquid') },
  { name: 'Luganodes', logo: logo('luganodes') },
  { name: 'Luna', logo: logo('luna') },
  
  { name: 'Mango', logo: logo('mango') },
  { name: 'Manifold', logo: logo('manifold') },
  { name: 'MathWallet', logo: logo('mathwallet') },
  { name: 'Melea', logo: logo('melea') },
  { name: 'Meria', logo: logo('meria') },
  { name: 'Metacartel', logo: logo('metacartel') },
  { name: 'Moonlet', logo: logo('moonlet') },
  { name: 'Multicoin Capital', logo: logo('multicoin-capital') },
  { name: 'Mythos', logo: logo('mythos') },
  
  { name: 'Nethermind', logo: logo('nethermind') },
  { name: 'Nexus', logo: logo('nexus') },
  { name: 'Node Monster', logo: logo('node-monster') },
  { name: 'NodeReal', logo: logo('nodereal') },
  { name: 'NodeStake', logo: logo('nodestake') },
  { name: 'Nope Finance', logo: logo('nope-finance') },
  { name: 'Northstake', logo: logo('northstake') },
  { name: 'Notional', logo: logo('notional') },
  
  { name: 'OKX', logo: logo('okx') },
  { name: 'Omnibus', logo: logo('omnibus') },
  { name: 'Onyx', logo: logo('onyx') },
  { name: 'Orca', logo: logo('orca') },
  { name: 'Origin', logo: logo('origin') },
  
  { name: 'P2P Validator', logo: logo('p2p-validator') },
  { name: 'Pantera Capital', logo: logo('pantera-capital') },
  { name: 'Paradigm', logo: logo('paradigm') },
  { name: 'Penta', logo: logo('penta') },
  { name: 'Pier Two', logo: logo('pier-two') },
  { name: 'Pluto', logo: logo('pluto') },
  { name: 'Polkachu', logo: logo('polkachu') },
  { name: 'Polychain', logo: logo('polychain') },
  { name: 'Proton', logo: logo('proton') },
  { name: 'Purple', logo: logo('purple') },
  
  { name: 'QCP Capital', logo: logo('qcp-capital') },
  { name: 'Quicknode', logo: logo('quicknode') },
  
  { name: 'RPC Fast', logo: logo('rpc-fast') },
  { name: 'Ramp', logo: logo('ramp') },
  { name: 'Rhino', logo: logo('rhino') },
  { name: 'Ribbit Capital', logo: logo('ribbit-capital') },
  { name: 'RockX', logo: logo('rockx') },
  { name: 'Rocket Pool', logo: logo('rocket-pool') },
  { name: 'Ryabina', logo: logo('ryabina') },
  
  { name: 'SNZ Holding', logo: logo('snz-holding') },
  { name: 'Safe', logo: logo('safe') },
  { name: 'Sandeep', logo: logo('sandeep') },
  { name: 'Sanshu', logo: logo('sanshu') },
  { name: 'Senseinode', logo: logo('senseinode') },
  { name: 'Sequoia', logo: logo('sequoia') },
  { name: 'SG-1', logo: logo('sg-1') },
  { name: 'Shardeum', logo: logo('shardeum') },
  { name: 'Shipyard', logo: logo('shipyard') },
  { name: 'Sigma Prime', logo: logo('sigma-prime') },
  { name: 'Simply Staking', logo: logo('simply-staking') },
  { name: 'Skybridge', logo: logo('skybridge') },
  { name: 'Smartnode', logo: logo('smartnode') },
  { name: 'Solana FM', logo: logo('solana-fm') },
  { name: 'Sparkpool', logo: logo('sparkpool') },
  { name: 'Stablelab', logo: logo('stablelab') },
  { name: 'Staked', logo: logo('staked') },
  { name: 'Stakecito', logo: logo('stakecito') },
  { name: 'Stakefish', logo: logo('stakefish') },
  { name: 'Stakelab', logo: logo('stakelab') },
  { name: 'Stakely', logo: logo('stakely') },
  { name: 'Staker Space', logo: logo('staker-space') },
  { name: 'Stakin', logo: logo('stakin') },
  { name: 'Stakingcabin', logo: logo('stakingcabin') },
  { name: 'Starbloom', logo: logo('starbloom') },
  { name: 'Stargaze', logo: logo('stargaze') },
  { name: 'Stronghold', logo: logo('stronghold') },
  { name: 'Superfluid', logo: logo('superfluid') },
  { name: 'Swiss Staking', logo: logo('swiss-staking') },
  { name: 'Syncnode', logo: logo('syncnode') },
  
  { name: 'Tarun', logo: logo('tarun') },
  { name: 'Tendermint', logo: logo('tendermint') },
  { name: 'Terraform Labs', logo: logo('terraform-labs') },
  { name: 'The Graph', logo: logo('the-graph') },
  { name: 'Three Arrows', logo: logo('three-arrows') },
  { name: 'Token Terminal', logo: logo('token-terminal') },
  { name: 'Triton One', logo: logo('triton-one') },
  { name: 'Twinstake', logo: logo('twinstake') },
  
  { name: 'Ubik Capital', logo: logo('ubik-capital') },
  { name: 'Umbrella', logo: logo('umbrella') },
  { name: 'Uniswap', logo: logo('uniswap') },
  { name: 'Unit 410', logo: logo('unit-410') },
  
  { name: 'Validation Cloud', logo: logo('validation-cloud') },
  { name: 'Validator.co', logo: logo('validator-co') },
  { name: 'ValidatorRUN', logo: logo('validatorrun') },
  { name: 'Vanguard', logo: logo('vanguard') },
  { name: 'Velvet', logo: logo('velvet') },
  { name: 'Vitwit', logo: logo('vitwit') },
  
  { name: 'WOO Network', logo: logo('woo-network') },
  { name: 'Wanderlust', logo: logo('wanderlust') },
  { name: 'Wetez', logo: logo('wetez') },
  { name: 'WhisperNode', logo: logo('whispernode') },
  { name: 'Wintermute', logo: logo('wintermute') },
  { name: 'Wombat', logo: logo('wombat') },
  
  { name: 'Xterminal', logo: logo('xterminal') },
  
  { name: 'Yield', logo: logo('yield') },
  
  { name: 'Zenchain', logo: logo('zenchain') },
  { name: 'Zero Knowledge', logo: logo('zero-knowledge') },
  { name: 'Zetachain', logo: logo('zetachain') },
  { name: 'Zilliqa', logo: logo('zilliqa') },
  { name: 'Zodia', logo: logo('zodia') },
]

// Get validator by block number (deterministic selection)
export const getValidatorForBlock = (blockNumber) => {
  const index = blockNumber % MONAD_VALIDATORS.length
  return MONAD_VALIDATORS[index]
}

// Get validator by index
export const getValidatorByIndex = (index) => {
  return MONAD_VALIDATORS[index % MONAD_VALIDATORS.length]
}

// Total validator count
export const VALIDATOR_COUNT = MONAD_VALIDATORS.length

export default MONAD_VALIDATORS

