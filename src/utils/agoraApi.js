import { MONAD_RPC_ENDPOINTS } from '../config/monadNetwork'

export const AGORA_DEPLOYMENTS_SOURCE = 'https://docs.agora.finance/developer/contract-deployments'
const AUSD_EVM_CONTRACT = '0x00000000efe302beaa2b3e6e1b18d08d69a9012a'
const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const ERC20_DECIMALS_SELECTOR = '0x313ce567'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const TARGET_CITY_COUNT = 96
const RPC_TIMEOUT_MS = 3000
const CHAIN_TIMEOUT_MS = 6500
const MAX_SEEN_LOGS = 20_000

// Explicit mainnet deployments from Agora's own registry, verified 2026-09-24.
// The identical address is intentional; no deployment is inferred from a chain-name alias.
export const AGORA_CHAINS = [
  { chainId: 1, chainName: 'Ethereum', platform: 'ethereum', rpcs: ['https://ethereum.publicnode.com', 'https://rpc.flashbots.net'], explorerUrl: 'https://etherscan.io' },
  { chainId: 143, chainName: 'Monad', platform: 'monad', rpcs: [...MONAD_RPC_ENDPOINTS], explorerUrl: 'https://monadvision.com' },
  { chainId: 43114, chainName: 'Avalanche', platform: 'avalanche', rpcs: ['https://api.avax.network/ext/bc/C/rpc', 'https://avalanche-c-chain-rpc.publicnode.com'], explorerUrl: 'https://snowtrace.io' },
  { chainId: 747474, chainName: 'Katana', platform: 'katana', rpcs: ['https://rpc.katana.network'], explorerUrl: 'https://katanascan.com' },
  { chainId: 13371, chainName: 'Immutable', platform: 'immutable-zkevm', rpcs: ['https://rpc.immutable.com'], explorerUrl: 'https://explorer.immutable.com' },
  { chainId: 5000, chainName: 'Mantle', platform: 'mantle', rpcs: ['https://rpc.mantle.xyz'], explorerUrl: 'https://mantlescan.xyz' },
  { chainId: 137, chainName: 'Polygon', platform: 'polygon-pos', rpcs: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon-rpc.com'], explorerUrl: 'https://polygonscan.com' },
  { chainId: 42161, chainName: 'Arbitrum', platform: 'arbitrum-one', rpcs: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com'], explorerUrl: 'https://arbiscan.io' },
  { chainId: 8453, chainName: 'Base', platform: 'base', rpcs: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'], explorerUrl: 'https://basescan.org' },
].map((chain) => ({ ...chain, contractAddress: AUSD_EVM_CONTRACT, evm: true }))

// Priority city set:
// - globally recognizable tourist destinations
// - major cloud/data center/financial hubs
// - geographically distributed coverage
const CURATED_CITY_HUBS = [
  // North America
  { city: 'New York', country: 'United States', lat: 40.7128, lon: -74.006 },
  { city: 'Los Angeles', country: 'United States', lat: 34.0522, lon: -118.2437 },
  { city: 'San Francisco', country: 'United States', lat: 37.7749, lon: -122.4194 },
  { city: 'Seattle', country: 'United States', lat: 47.6062, lon: -122.3321 },
  { city: 'Chicago', country: 'United States', lat: 41.8781, lon: -87.6298 },
  { city: 'Miami', country: 'United States', lat: 25.7617, lon: -80.1918 },
  { city: 'Dallas', country: 'United States', lat: 32.7767, lon: -96.797 },
  { city: 'Washington', country: 'United States', lat: 38.9072, lon: -77.0369 },
  { city: 'Toronto', country: 'Canada', lat: 43.6532, lon: -79.3832 },
  { city: 'Vancouver', country: 'Canada', lat: 49.2827, lon: -123.1207 },
  { city: 'Montreal', country: 'Canada', lat: 45.5017, lon: -73.5673 },
  { city: 'Mexico City', country: 'Mexico', lat: 19.4326, lon: -99.1332 },
  { city: 'Cancun', country: 'Mexico', lat: 21.1619, lon: -86.8515 },
  { city: 'Panama City', country: 'Panama', lat: 8.9824, lon: -79.5199 },
  { city: 'San Juan', country: 'Puerto Rico', lat: 18.4655, lon: -66.1057 },

  // South America
  { city: 'Sao Paulo', country: 'Brazil', lat: -23.5505, lon: -46.6333 },
  { city: 'Rio de Janeiro', country: 'Brazil', lat: -22.9068, lon: -43.1729 },
  { city: 'Brasilia', country: 'Brazil', lat: -15.7939, lon: -47.8828 },
  { city: 'Buenos Aires', country: 'Argentina', lat: -34.6037, lon: -58.3816 },
  { city: 'Santiago', country: 'Chile', lat: -33.4489, lon: -70.6693 },
  { city: 'Lima', country: 'Peru', lat: -12.0464, lon: -77.0428 },
  { city: 'Bogota', country: 'Colombia', lat: 4.711, lon: -74.0721 },
  { city: 'Medellin', country: 'Colombia', lat: 6.2442, lon: -75.5812 },
  { city: 'Quito', country: 'Ecuador', lat: -0.1807, lon: -78.4678 },
  { city: 'Montevideo', country: 'Uruguay', lat: -34.9011, lon: -56.1645 },

  // Europe
  { city: 'London', country: 'United Kingdom', lat: 51.5074, lon: -0.1278 },
  { city: 'Manchester', country: 'United Kingdom', lat: 53.4808, lon: -2.2426 },
  { city: 'Dublin', country: 'Ireland', lat: 53.3498, lon: -6.2603 },
  { city: 'Paris', country: 'France', lat: 48.8566, lon: 2.3522 },
  { city: 'Marseille', country: 'France', lat: 43.2965, lon: 5.3698 },
  { city: 'Amsterdam', country: 'Netherlands', lat: 52.3676, lon: 4.9041 },
  { city: 'Brussels', country: 'Belgium', lat: 50.8503, lon: 4.3517 },
  { city: 'Frankfurt', country: 'Germany', lat: 50.1109, lon: 8.6821 },
  { city: 'Berlin', country: 'Germany', lat: 52.52, lon: 13.405 },
  { city: 'Munich', country: 'Germany', lat: 48.1351, lon: 11.582 },
  { city: 'Zurich', country: 'Switzerland', lat: 47.3769, lon: 8.5417 },
  { city: 'Geneva', country: 'Switzerland', lat: 46.2044, lon: 6.1432 },
  { city: 'Madrid', country: 'Spain', lat: 40.4168, lon: -3.7038 },
  { city: 'Barcelona', country: 'Spain', lat: 41.3851, lon: 2.1734 },
  { city: 'Lisbon', country: 'Portugal', lat: 38.7223, lon: -9.1393 },
  { city: 'Milan', country: 'Italy', lat: 45.4642, lon: 9.19 },
  { city: 'Rome', country: 'Italy', lat: 41.9028, lon: 12.4964 },
  { city: 'Venice', country: 'Italy', lat: 45.4408, lon: 12.3155 },
  { city: 'Vienna', country: 'Austria', lat: 48.2082, lon: 16.3738 },
  { city: 'Prague', country: 'Czechia', lat: 50.0755, lon: 14.4378 },
  { city: 'Warsaw', country: 'Poland', lat: 52.2297, lon: 21.0122 },
  { city: 'Budapest', country: 'Hungary', lat: 47.4979, lon: 19.0402 },
  { city: 'Athens', country: 'Greece', lat: 37.9838, lon: 23.7275 },
  { city: 'Istanbul', country: 'Turkey', lat: 41.0082, lon: 28.9784 },
  { city: 'Moscow', country: 'Russia', lat: 55.7558, lon: 37.6173 },
  { city: 'Stockholm', country: 'Sweden', lat: 59.3293, lon: 18.0686 },
  { city: 'Oslo', country: 'Norway', lat: 59.9139, lon: 10.7522 },
  { city: 'Copenhagen', country: 'Denmark', lat: 55.6761, lon: 12.5683 },
  { city: 'Helsinki', country: 'Finland', lat: 60.1699, lon: 24.9384 },
  { city: 'Reykjavik', country: 'Iceland', lat: 64.1466, lon: -21.9426 },
  { city: 'Bucharest', country: 'Romania', lat: 44.4268, lon: 26.1025 },
  { city: 'Sofia', country: 'Bulgaria', lat: 42.6977, lon: 23.3219 },
  { city: 'Kyiv', country: 'Ukraine', lat: 50.4501, lon: 30.5234 },
  { city: 'Belgrade', country: 'Serbia', lat: 44.7866, lon: 20.4489 },

  // Middle East
  { city: 'Dubai', country: 'United Arab Emirates', lat: 25.2048, lon: 55.2708 },
  { city: 'Abu Dhabi', country: 'United Arab Emirates', lat: 24.4539, lon: 54.3773 },
  { city: 'Doha', country: 'Qatar', lat: 25.2854, lon: 51.531 },
  { city: 'Riyadh', country: 'Saudi Arabia', lat: 24.7136, lon: 46.6753 },
  { city: 'Jeddah', country: 'Saudi Arabia', lat: 21.4858, lon: 39.1925 },
  { city: 'Tel Aviv', country: 'Israel', lat: 32.0853, lon: 34.7818 },
  { city: 'Jerusalem', country: 'Israel', lat: 31.7683, lon: 35.2137 },
  { city: 'Amman', country: 'Jordan', lat: 31.9539, lon: 35.9106 },
  { city: 'Kuwait City', country: 'Kuwait', lat: 29.3759, lon: 47.9774 },
  { city: 'Manama', country: 'Bahrain', lat: 26.2235, lon: 50.5876 },

  // Africa
  { city: 'Cairo', country: 'Egypt', lat: 30.0444, lon: 31.2357 },
  { city: 'Alexandria', country: 'Egypt', lat: 31.2001, lon: 29.9187 },
  { city: 'Casablanca', country: 'Morocco', lat: 33.5731, lon: -7.5898 },
  { city: 'Marrakesh', country: 'Morocco', lat: 31.6295, lon: -7.9811 },
  { city: 'Lagos', country: 'Nigeria', lat: 6.5244, lon: 3.3792 },
  { city: 'Abuja', country: 'Nigeria', lat: 9.0765, lon: 7.3986 },
  { city: 'Nairobi', country: 'Kenya', lat: -1.2921, lon: 36.8219 },
  { city: 'Addis Ababa', country: 'Ethiopia', lat: 8.9806, lon: 38.7578 },
  { city: 'Cape Town', country: 'South Africa', lat: -33.9249, lon: 18.4241 },
  { city: 'Johannesburg', country: 'South Africa', lat: -26.2041, lon: 28.0473 },
  { city: 'Tunis', country: 'Tunisia', lat: 36.8065, lon: 10.1815 },
  { city: 'Accra', country: 'Ghana', lat: 5.6037, lon: -0.187 },
  { city: 'Dakar', country: 'Senegal', lat: 14.7167, lon: -17.4677 },
  { city: 'Kigali', country: 'Rwanda', lat: -1.9441, lon: 30.0619 },
  { city: 'Mauritius', country: 'Mauritius', lat: -20.1609, lon: 57.5012 },

  // South Asia
  { city: 'Mumbai', country: 'India', lat: 19.076, lon: 72.8777 },
  { city: 'Delhi', country: 'India', lat: 28.6139, lon: 77.209 },
  { city: 'Bangalore', country: 'India', lat: 12.9716, lon: 77.5946 },
  { city: 'Hyderabad', country: 'India', lat: 17.385, lon: 78.4867 },
  { city: 'Chennai', country: 'India', lat: 13.0827, lon: 80.2707 },
  { city: 'Kolkata', country: 'India', lat: 22.5726, lon: 88.3639 },
  { city: 'Goa', country: 'India', lat: 15.2993, lon: 74.124 },
  { city: 'Karachi', country: 'Pakistan', lat: 24.8607, lon: 67.0011 },
  { city: 'Lahore', country: 'Pakistan', lat: 31.5204, lon: 74.3587 },
  { city: 'Dhaka', country: 'Bangladesh', lat: 23.8103, lon: 90.4125 },
  { city: 'Kathmandu', country: 'Nepal', lat: 27.7172, lon: 85.324 },
  { city: 'Colombo', country: 'Sri Lanka', lat: 6.9271, lon: 79.8612 },
  { city: 'Male', country: 'Maldives', lat: 4.1755, lon: 73.5093 },

  // East Asia
  { city: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503 },
  { city: 'Osaka', country: 'Japan', lat: 34.6937, lon: 135.5023 },
  { city: 'Seoul', country: 'South Korea', lat: 37.5665, lon: 126.978 },
  { city: 'Busan', country: 'South Korea', lat: 35.1796, lon: 129.0756 },
  { city: 'Beijing', country: 'China', lat: 39.9042, lon: 116.4074 },
  { city: 'Shanghai', country: 'China', lat: 31.2304, lon: 121.4737 },
  { city: 'Shenzhen', country: 'China', lat: 22.5431, lon: 114.0579 },
  { city: 'Guangzhou', country: 'China', lat: 23.1291, lon: 113.2644 },
  { city: 'Hong Kong', country: 'Hong Kong', lat: 22.3193, lon: 114.1694 },
  { city: 'Taipei', country: 'Taiwan', lat: 25.033, lon: 121.5654 },
  { city: 'Kaohsiung', country: 'Taiwan', lat: 22.6273, lon: 120.3014 },
  { city: 'Macau', country: 'Macau', lat: 22.1987, lon: 113.5439 },
  { city: 'Ulaanbaatar', country: 'Mongolia', lat: 47.8864, lon: 106.9057 },

  // Southeast Asia
  { city: 'Singapore', country: 'Singapore', lat: 1.3521, lon: 103.8198 },
  { city: 'Jakarta', country: 'Indonesia', lat: -6.2088, lon: 106.8456 },
  { city: 'Bali', country: 'Indonesia', lat: -8.3405, lon: 115.092 },
  { city: 'Bangkok', country: 'Thailand', lat: 13.7563, lon: 100.5018 },
  { city: 'Phuket', country: 'Thailand', lat: 7.8804, lon: 98.3923 },
  { city: 'Kuala Lumpur', country: 'Malaysia', lat: 3.139, lon: 101.6869 },
  { city: 'Penang', country: 'Malaysia', lat: 5.4164, lon: 100.3327 },
  { city: 'Ho Chi Minh City', country: 'Vietnam', lat: 10.8231, lon: 106.6297 },
  { city: 'Hanoi', country: 'Vietnam', lat: 21.0278, lon: 105.8342 },
  { city: 'Manila', country: 'Philippines', lat: 14.5995, lon: 120.9842 },
  { city: 'Cebu', country: 'Philippines', lat: 10.3157, lon: 123.8854 },
  { city: 'Phnom Penh', country: 'Cambodia', lat: 11.5564, lon: 104.9282 },
  { city: 'Vientiane', country: 'Laos', lat: 17.9757, lon: 102.6331 },
  { city: 'Yangon', country: 'Myanmar', lat: 16.8409, lon: 96.1735 },
  { city: 'Bandar Seri Begawan', country: 'Brunei', lat: 4.9031, lon: 114.9398 },

  // Oceania
  { city: 'Sydney', country: 'Australia', lat: -33.8688, lon: 151.2093 },
  { city: 'Melbourne', country: 'Australia', lat: -37.8136, lon: 144.9631 },
  { city: 'Brisbane', country: 'Australia', lat: -27.4698, lon: 153.0251 },
  { city: 'Perth', country: 'Australia', lat: -31.9505, lon: 115.8605 },
  { city: 'Auckland', country: 'New Zealand', lat: -36.8509, lon: 174.7645 },
  { city: 'Wellington', country: 'New Zealand', lat: -41.2866, lon: 174.7762 },
  { city: 'Christchurch', country: 'New Zealand', lat: -43.5321, lon: 172.6362 },
  { city: 'Suva', country: 'Fiji', lat: -18.1248, lon: 178.4501 },
  { city: 'Port Moresby', country: 'Papua New Guinea', lat: -9.4438, lon: 147.1803 },
]

// Keep only globally recognizable city names for clearer map output.
const PRIORITY_CITY_NAMES = new Set([
  'New York', 'Los Angeles', 'San Francisco', 'Seattle', 'Chicago', 'Miami', 'Dallas', 'Washington',
  'Toronto', 'Vancouver', 'Montreal', 'Mexico City', 'Sao Paulo', 'Rio de Janeiro', 'Buenos Aires',
  'Santiago', 'Lima', 'Bogota', 'London', 'Dublin', 'Paris', 'Amsterdam', 'Brussels', 'Frankfurt',
  'Berlin', 'Munich', 'Zurich', 'Geneva', 'Madrid', 'Barcelona', 'Lisbon', 'Milan', 'Rome', 'Venice',
  'Vienna', 'Prague', 'Warsaw', 'Budapest', 'Athens', 'Istanbul', 'Moscow', 'Stockholm', 'Oslo',
  'Copenhagen', 'Helsinki', 'Reykjavik', 'Dubai', 'Abu Dhabi', 'Doha', 'Riyadh', 'Jeddah', 'Tel Aviv',
  'Jerusalem', 'Kuwait City', 'Cairo', 'Casablanca', 'Marrakesh', 'Lagos', 'Nairobi', 'Cape Town',
  'Johannesburg', 'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Karachi', 'Dhaka',
  'Colombo', 'Tokyo', 'Osaka', 'Seoul', 'Busan', 'Beijing', 'Shanghai', 'Shenzhen', 'Guangzhou',
  'Hong Kong', 'Taipei', 'Singapore', 'Jakarta', 'Bali', 'Bangkok', 'Phuket', 'Kuala Lumpur', 'Penang',
  'Ho Chi Minh City', 'Hanoi', 'Manila', 'Cebu', 'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Auckland',
  'Wellington', 'Christchurch'
])

const EUROPE_COUNTRIES = new Set([
  'United Kingdom', 'Ireland', 'France', 'Netherlands', 'Belgium', 'Germany', 'Switzerland',
  'Spain', 'Portugal', 'Italy', 'Austria', 'Czechia', 'Poland', 'Hungary', 'Greece', 'Turkey',
  'Russia', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Iceland', 'Romania', 'Bulgaria', 'Ukraine', 'Serbia'
])
const MAX_EUROPE_CITIES = 9
const EXCLUDED_COUNTRIES = new Set(['United States'])
const PINNED_CITIES = ['Istanbul', 'Moscow', 'Toronto']
const US_ALLOWED_CITIES = new Set(['New York', 'Los Angeles', 'Chicago', 'Miami', 'Seattle'])
const MAX_US_CITIES = 5

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function buildPriorityCities() {
  const out = []
  const used = new Set()
  const usedCountry = new Set()
  let usCount = 0
  let europeCount = 0
  const push = (city, country, lat, lon, source = 'curated') => {
    const key = `${normalize(city)}-${normalize(country)}`
    if (used.has(key)) return
    const isUS = country === 'United States'
    const isAllowedUSCity = isUS && US_ALLOWED_CITIES.has(city)
    if (EXCLUDED_COUNTRIES.has(country) && !isAllowedUSCity) return
    if (isUS) {
      if (!isAllowedUSCity || usCount >= MAX_US_CITIES) return
    } else if (usedCountry.has(country)) {
      return // one city per country (except US special case)
    }
    const isEurope = EUROPE_COUNTRIES.has(country)
    if (isEurope && europeCount >= MAX_EUROPE_CITIES) return
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return
    used.add(key)
    if (isEurope) europeCount += 1
    if (isUS) usCount += 1
    else usedCountry.add(country)
    out.push({
      id: `${source}-${used.size}`,
      city,
      country,
      lat: Number(lat),
      lon: Number(lon),
    })
  }

  // Pass 1: globally known cities only.
  for (const pinned of PINNED_CITIES) {
    const city = CURATED_CITY_HUBS.find((c) => c.city === pinned)
    if (city) push(city.city, city.country, city.lat, city.lon, 'pin')
    if (out.length >= TARGET_CITY_COUNT) return out
  }

  for (const c of CURATED_CITY_HUBS) {
    if (!PRIORITY_CITY_NAMES.has(c.city)) continue
    push(c.city, c.country, c.lat, c.lon, 'hub')
    if (out.length >= TARGET_CITY_COUNT) return out
  }

  // Pass 2: if still short, use remaining curated hubs (still controlled list).
  for (const c of CURATED_CITY_HUBS) {
    push(c.city, c.country, c.lat, c.lon, 'hub2')
    if (out.length >= TARGET_CITY_COUNT) return out
  }

  return out.slice(0, TARGET_CITY_COUNT)
}

function abortError() {
  return new DOMException('Agora polling was cancelled', 'AbortError')
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError()
}

function linkedAbortSignal(parent, timeoutMs) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (parent?.aborted) abort()
  else parent?.addEventListener('abort', abort, { once: true })
  const timer = timeoutMs ? setTimeout(abort, timeoutMs) : null
  return { controller, signal: controller.signal, dispose() { if (timer) clearTimeout(timer); parent?.removeEventListener('abort', abort) } }
}

function normalizeAddress(value) {
  const address = String(value || '').toLowerCase()
  return /^0x[a-f0-9]{40}$/.test(address) ? address : null
}

function quantity(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) throw new Error('Invalid RPC quantity')
  const number = Number(BigInt(value))
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('RPC quantity is outside the supported range')
  return number
}

const toHex = (number) => `0x${number.toString(16)}`

async function rpcCall(endpoint, method, params, parentSignal) {
  throwIfAborted(parentSignal)
  const request = linkedAbortSignal(parentSignal, RPC_TIMEOUT_MS)
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: request.signal,
    })
    if (!response.ok) throw new Error(`RPC request failed (${response.status})`)
    const json = await response.json()
    throwIfAborted(parentSignal)
    if (json?.error) throw new Error(json.error.message || 'RPC request failed')
    if (json?.result == null) throw new Error('RPC returned no result')
    return json.result
  } finally { request.dispose() }
}

function formatTokenAmount(value, decimals) {
  if (decimals === 0) return value.toString()
  const base = 10n ** BigInt(decimals)
  const fraction = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${value / base}${fraction ? `.${fraction}` : ''}`
}

function parseTransfer(log, chain, decimals, receivedAt, historical) {
  if (log?.removed || normalizeAddress(log?.address) !== chain.contractAddress || log?.topics?.[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) return null
  if (log.topics.length !== 3 || !log.topics.slice(1).every((topic) => /^0x0{24}[0-9a-f]{40}$/i.test(topic)) || !/^0x[0-9a-f]{64}$/i.test(log.data) || !/^0x[0-9a-f]{64}$/i.test(log.transactionHash)) throw new Error('RPC returned an incomplete AUSD transfer')
  const from = normalizeAddress(`0x${log.topics[1].slice(-40)}`)
  const to = normalizeAddress(`0x${log.topics[2].slice(-40)}`)
  const amountRaw = BigInt(log.data)
  const amountDisplay = formatTokenAmount(amountRaw, decimals)
  const amount = Number(amountDisplay)
  const txHash = log.transactionHash.toLowerCase()
  const logIndex = quantity(log.logIndex)
  return {
    id: `${chain.chainId}:${txHash}:${logIndex}`, txHash, logIndex, blockNumber: quantity(log.blockNumber),
    from, to, amount: Number.isFinite(amount) ? amount : null, amountDisplay, amountRaw: amountRaw.toString(), decimals,
    kind: from === ZERO_ADDRESS ? 'mint' : to === ZERO_ADDRESS ? 'burn' : 'transfer',
    chainId: chain.chainId, chainName: chain.chainName, receivedAt, historical,
    explorerUrl: chain.explorerUrl, transactionUrl: `${chain.explorerUrl}/tx/${txHash}`,
  }
}

/** Scene metadata is local; market-price and chain-list services cannot delay the globe. */
export async function fetchAgoraData(signal) {
  throwIfAborted(signal)
  return {
    logo: '/ausd.png', symbol: 'AUSD', name: 'Agora Dollar', marketCapUsd: null,
    cities: buildPriorityCities(), chains: AGORA_CHAINS.map((chain) => ({ ...chain, rpcs: [...chain.rpcs] })),
  }
}

function positiveInteger(value, fallback, max = 100_000) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, max) : fallback
}

/**
 * One poller per mounted scene. Cursor, RPC health, metadata, and overflow queues
 * are isolated. Successful log ranges commit into a queue; only returned rows
 * are removed, so cancellation, failed later batches, and UI limits lose no logs.
 */
export function createAgoraPoller(chains, defaults = {}) {
  const registry = new Map(AGORA_CHAINS.map((chain) => [chain.chainId, chain]))
  const candidates = []
  const ids = new Set()
  for (const chain of chains || []) {
    const verified = registry.get(Number(chain.chainId))
    if (!verified || chain.evm === false || ids.has(verified.chainId) || normalizeAddress(chain.contractAddress) !== verified.contractAddress) continue
    const rpcs = [...new Set((chain.rpcs || verified.rpcs).filter((rpc) => typeof rpc === 'string' && /^https?:\/\//.test(rpc)))]
    if (!rpcs.length) continue
    candidates.push({ ...verified, rpcs })
    ids.add(verified.chainId)
  }
  const makeStates = () => candidates.map((chain) => ({
    chain, rpc: null, verifiedRpcs: new Set(), decimals: null, lastScanned: null, latest: null, maxRange: null,
    pending: [], seen: new Set(), lastSuccessAt: null, error: null, retryAt: 0, failures: 0,
  }))
  let states = makeStates()
  let inFlight = null
  let activeController = null
  let generation = 0

  async function request(state, method, params, signal) {
    const endpoints = [...new Set([state.rpc, ...state.chain.rpcs].filter(Boolean))].slice(0, 2)
    let error
    for (const endpoint of endpoints) {
      throwIfAborted(signal)
      try {
        if (!state.verifiedRpcs.has(endpoint)) {
          if (quantity(await rpcCall(endpoint, 'eth_chainId', [], signal)) !== state.chain.chainId) throw new Error('RPC is connected to the wrong chain')
          state.verifiedRpcs.add(endpoint)
        }
        const result = await rpcCall(endpoint, method, params, signal)
        state.rpc = endpoint
        return result
      } catch (failure) { error = failure }
    }
    throw error || new Error('No RPC endpoint is available')
  }

  async function scan(state, options, signal) {
    if (Date.now() < state.retryAt) return false
    const round = linkedAbortSignal(signal, CHAIN_TIMEOUT_MS)
    try {
      const latest = quantity(await request(state, 'eth_blockNumber', [], round.signal))
      state.latest = latest
      if (state.lastScanned !== null && latest < state.lastScanned) throw new Error('RPC head is behind the last scanned block')
      if (state.decimals === null) {
        const decimals = quantity(await request(state, 'eth_call', [{ to: state.chain.contractAddress, data: ERC20_DECIMALS_SELECTOR }, 'latest'], round.signal))
        if (decimals > 36) throw new Error('Unsupported AUSD decimal precision')
        state.decimals = decimals
      }
      const lookback = Math.max(0, Number.isSafeInteger(options.initialLookback) ? options.initialLookback : 180)
      let cursor = state.lastScanned === null ? Math.max(0, latest - lookback) : state.lastScanned + 1
      let range = positiveInteger(options.blockWindow, state.chain.chainId === 143 ? 90 : 1200)
      if (state.chain.chainId === 143) range = Math.min(range, 90)
      if (state.maxRange !== null) range = Math.min(range, state.maxRange)
      const batches = positiveInteger(options.maxLogBatchesPerChain, 5, 20)
      const limit = positiveInteger(options.maxLogsPerChain, 60, 1000)
      const historical = state.lastScanned === null || latest - state.lastScanned > range
      for (let batch = 0; cursor <= latest && batch < batches && state.pending.length < limit; batch += 1) {
        const toBlock = Math.min(cursor + range - 1, latest)
        let logs
        try {
          logs = await request(state, 'eth_getLogs', [{ address: state.chain.contractAddress, fromBlock: toHex(cursor), toBlock: toHex(toBlock), topics: [ERC20_TRANSFER_TOPIC] }], round.signal)
        } catch (error) {
          if (range > 1 && /range|too many|response size|limit exceeded/i.test(error.message)) {
            range = Math.max(1, Math.floor(range / 2))
            state.maxRange = range
            continue
          }
          throw error
        }
        throwIfAborted(round.signal)
        if (!Array.isArray(logs)) throw new Error('RPC returned an invalid transfer list')
        const receivedAt = Date.now()
        const parsed = logs.map((log) => parseTransfer(log, state.chain, state.decimals, receivedAt, historical)).filter(Boolean)
        if (parsed.some((row) => row.blockNumber < cursor || row.blockNumber > toBlock)) throw new Error('RPC returned transfers outside the requested block range')
        parsed.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
        for (const row of parsed) {
          if (state.seen.has(row.id)) continue
          state.pending.push(row)
          state.seen.add(row.id)
        }
        while (state.seen.size > MAX_SEEN_LOGS) state.seen.delete(state.seen.values().next().value)
        state.lastScanned = toBlock
        cursor = toBlock + 1
      }
      if (state.lastScanned !== null) state.lastSuccessAt = Date.now()
      state.failures = 0
      state.retryAt = 0
      state.error = null
      return state.lastScanned !== null
    } catch (error) {
      if (signal?.aborted) throw abortError()
      state.failures += 1
      state.error = error.name === 'AbortError' ? 'RPC timed out' : error.message || 'RPC unavailable'
      const retryDelay = typeof options.retryDelayMs === 'number' && options.retryDelayMs >= 0 ? options.retryDelayMs : 3000
      state.retryAt = Date.now() + Math.min(30_000, retryDelay * 2 ** Math.min(state.failures - 1, 5))
      return false
    } finally { round.dispose() }
  }

  function status(state, pendingCount = state.pending.length) {
    const catchingUp = pendingCount > 0 || (state.lastScanned !== null && state.latest !== null && state.lastScanned < state.latest)
    return {
      chainId: state.chain.chainId, chainName: state.chain.chainName, explorerUrl: state.chain.explorerUrl,
      status: state.error ? 'error' : state.lastSuccessAt === null ? 'connecting' : catchingUp ? 'catching-up' : 'live',
      lastSuccessAt: state.lastSuccessAt, error: state.error, latestBlock: state.latest,
      lastScannedBlock: state.lastScanned, backlogTransfers: pendingCount, rpc: state.rpc,
    }
  }

  return {
    poll(options = {}) {
      if (options.signal?.aborted) return Promise.reject(abortError())
      if (inFlight) return inFlight
      const config = { ...defaults, ...options }
      const roundGeneration = generation
      const roundStates = states
      const linked = linkedAbortSignal(config.signal)
      activeController = linked.controller
      const promise = (async () => {
        const limit = positiveInteger(config.maxLogsPerChain, 60, 1000)
        const deliveries = new Array(roundStates.length)
        const results = await Promise.all(roundStates.map(async (state, index) => {
          const scanned = await scan(state, config, linked.signal)
          throwIfAborted(linked.signal)
          if (roundGeneration !== generation) throw abortError()
          const rows = state.pending.slice(0, limit)
          const delivery = { rows, consumed: false }
          deliveries[index] = delivery
          // Publish each chain immediately. A slow or unavailable RPC must not
          // hold healthy chains' events until the aggregate poll finishes.
          if (typeof config.onChainResult === 'function') {
            try {
              const returned = config.onChainResult({
                transfers: [...rows], chainStatus: [status(state, state.pending.length - rows.length)], scannedChains: scanned ? 1 : 0,
              })
              // This observer is synchronous. Isolate an accidentally returned
              // rejected promise as well as ordinary callback exceptions.
              if (returned?.then) Promise.resolve(returned).catch(() => {})
              state.pending.splice(0, rows.length)
              delivery.consumed = true
            } catch {
              // The final result remains a delivery path if the observer fails.
            }
          }
          return scanned
        }))
        throwIfAborted(linked.signal)
        if (roundGeneration !== generation) throw abortError()
        const queues = deliveries.map((delivery, index) => {
          if (!delivery.consumed) roundStates[index].pending.splice(0, delivery.rows.length)
          return delivery.rows
        })
        const transfers = []
        // Round-robin delivery is fair across chains. Heights from different
        // chains have no shared chronology and must never rank the global feed.
        for (let index = 0; index < limit; index += 1) {
          for (const queue of queues) if (queue[index]) transfers.push(queue[index])
        }
        return { transfers, chainStatus: roundStates.map((state) => status(state)), scannedChains: results.filter(Boolean).length }
      })().finally(() => {
        linked.dispose()
        if (activeController === linked.controller) activeController = null
        if (inFlight === promise) inFlight = null
      })
      inFlight = promise
      return promise
    },
    reset() {
      generation += 1
      activeController?.abort()
      activeController = null
      inFlight = null
      states = makeStates()
    },
    getStatus() { return states.map((state) => status(state)) },
  }
}

/** One-shot compatibility entry point. Repeated consumers should retain createAgoraPoller(). */
export function fetchAusdTransfersAllChains(chains, options = {}) {
  return createAgoraPoller(chains, options).poll({ signal: options.signal })
}

export async function fetchMonadAusdTransfers({ blockWindow = 180, maxLogs = 80, signal } = {}) {
  const monad = AGORA_CHAINS.find((chain) => chain.chainId === 143)
  const result = await createAgoraPoller([monad], { initialLookback: blockWindow, maxLogsPerChain: maxLogs }).poll({ signal })
  return { ...result, rpc: result.chainStatus[0]?.rpc ?? null, contract: monad.contractAddress }
}
