import { MONAD_DEX_ROUTERS, MONAD_RPC_ENDPOINTS, MONAD_STABLECOINS } from '../config/monadNetwork'

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/coins/agora-dollar?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false'
const CHAIN_REGISTRY_URL = 'https://chainid.network/chains.json'
const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const TARGET_CITY_COUNT = 96
const RPC_TIMEOUT_MS = 4500
const AUSD_EVM_CONTRACT = '0x00000000efe302beaa2b3e6e1b18d08d69a9012a'
const DEFAULT_LOG_RANGE = 1200
const MONAD_LOG_RANGE = 90
const INITIAL_LOOKBACK = 180
const MAX_LOG_BATCHES_PER_CHAIN = 5
const RPC_CACHE_TTL_MS = 120000
const ERC20_DECIMALS_SELECTOR = '0x313ce567'

const PLATFORM_ALIASES = {
  ethereum: ['ethereum mainnet', 'ethereum'],
  base: ['base'],
  optimism: ['optimism'],
  arbitrum: ['arbitrum one', 'arbitrum'],
  'arbitrum-one': ['arbitrum one', 'arbitrum'],
  polygon: ['polygon mainnet', 'polygon'],
  'polygon-pos': ['polygon mainnet', 'polygon'],
  avalanche: ['avalanche c-chain', 'avalanche'],
  bsc: ['bnb smart chain mainnet', 'binance smart chain'],
  'binance-smart-chain': ['bnb smart chain mainnet', 'binance smart chain'],
  fantom: ['fantom opera', 'fantom'],
  celo: ['celo'],
  mantle: ['mantle'],
  linea: ['linea'],
  scroll: ['scroll'],
  zksync: ['zksync era'],
  'zksync-era': ['zksync era'],
}

// User-provided chain scope + preferred RPC endpoints.
const CHAIN_SCOPE = {
  ethereum: {
    labels: ['ethereum mainnet', 'ethereum'],
    chainId: 1,
    evm: true,
    rpcs: ['https://ethereum.publicnode.com', 'https://rpc.flashbots.net'],
  },
  monad: {
    labels: ['monad'],
    chainId: 143,
    evm: true,
    rpcs: ['https://rpc.monad.xyz'],
  },
  avalanche: {
    labels: ['avalanche c-chain', 'avalanche'],
    chainId: 43114,
    evm: true,
    rpcs: ['https://api.avax.network/ext/bc/C/rpc'],
  },
  katana: {
    labels: ['katana'],
    chainId: 747474,
    evm: true,
    rpcs: [],
  },
  immutable_zkevm: {
    labels: ['immutable zkevm', 'immutable zkevm mainnet', 'immutable'],
    chainId: 13371,
    evm: true,
    rpcs: [],
  },
  sui: {
    labels: ['sui'],
    chainId: null,
    evm: false,
    rpcs: ['https://fullnode.mainnet.sui.io'],
  },
  mantle: {
    labels: ['mantle'],
    chainId: 5000,
    evm: true,
    rpcs: ['https://rpc.mantle.xyz'],
  },
  polygon: {
    labels: ['polygon mainnet', 'polygon'],
    chainId: 137,
    evm: true,
    rpcs: ['https://polygon-rpc.com'],
  },
  solana: {
    labels: ['solana'],
    chainId: null,
    evm: false,
    rpcs: ['https://api.mainnet-beta.solana.com'],
  },
}

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

function isMainnetLike(chain) {
  const name = String(chain?.name || '').toLowerCase()
  const shortName = String(chain?.shortName || '').toLowerCase()
  if (chain?.testnet) return false
  if ((chain?.status || '').toLowerCase() === 'deprecated') return false
  if (name.includes('testnet') || name.includes('devnet')) return false
  if (shortName.includes('testnet') || shortName.includes('devnet')) return false
  return true
}

function isAllowedChain(chain) {
  const n = normalize(chain?.name || '')
  const s = normalize(chain?.shortName || '')
  return Object.values(CHAIN_SCOPE).some(({ labels }) =>
    labels.some((label) => {
      const key = normalize(label)
      return n === key || s === key || n.includes(key) || key.includes(n)
    })
  )
}

function getScopeEntryByChain(chain) {
  const n = normalize(chain?.name || '')
  const s = normalize(chain?.shortName || '')
  return Object.values(CHAIN_SCOPE).find(({ labels }) =>
    labels.some((label) => {
      const key = normalize(label)
      return n === key || s === key || n.includes(key) || key.includes(n)
    })
  ) || null
}

function getScopeEntryByPlatform(platform) {
  const p = normalize(platform || '')
  return Object.values(CHAIN_SCOPE).find(({ labels }) =>
    labels.some((label) => {
      const key = normalize(label)
      return key === p || key.includes(p) || p.includes(key)
    })
  ) || null
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

/** Never throws; returns fallback on network/CORS/rate-limit failures so AGORA pages still load. */
async function fetchJsonSafe(url, signal, fallback, timeoutMs = 15000) {
  const ctrl = new AbortController()
  const tid = window.setTimeout(() => ctrl.abort(), timeoutMs)
  const onParentAbort = () => ctrl.abort()
  if (signal) {
    if (signal.aborted) {
      window.clearTimeout(tid)
      return fallback
    }
    signal.addEventListener('abort', onParentAbort, { once: true })
  }
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) return fallback
    const data = await r.json()
    return data ?? fallback
  } catch {
    return fallback
  } finally {
    window.clearTimeout(tid)
    if (signal) signal.removeEventListener('abort', onParentAbort)
  }
}

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))]
}

function normalizeAddress(v) {
  const s = String(v || '').trim().toLowerCase()
  return /^0x[a-f0-9]{40}$/.test(s) ? s : null
}

function parseTopicAddress(topic) {
  const t = String(topic || '')
  if (!t.startsWith('0x') || t.length < 66) return null
  return normalizeAddress(`0x${t.slice(-40)}`)
}

function hexToInt(value) {
  try {
    return Number(BigInt(value || '0x0'))
  } catch {
    return 0
  }
}

function hexToBigInt(value) {
  try {
    return BigInt(value || '0x0')
  } catch {
    return 0n
  }
}

function formatUnits(value, decimals = 18, precision = 6) {
  const d = Math.max(0, Math.min(36, Number(decimals) || 18))
  const base = 10n ** BigInt(d)
  const whole = value / base
  const fracRaw = (value % base).toString().padStart(d, '0')
  const frac = fracRaw.slice(0, precision).replace(/0+$/, '')
  if (frac) return `${whole.toString()}.${frac}`
  return whole.toString()
}

async function rpcCall(endpoint, method, params) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS)
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    })
    if (!r.ok) throw new Error(`RPC ${method} failed (${r.status})`)
    const j = await r.json()
    if (j?.error) throw new Error(j.error.message || `RPC error on ${method}`)
    return j?.result
  } finally {
    clearTimeout(timer)
  }
}

async function pickWorkingRpc(endpoints) {
  for (const ep of endpoints) {
    try {
      await rpcCall(ep, 'eth_blockNumber', [])
      return ep
    } catch {
      // continue
    }
  }
  return null
}

const rpcCache = new Map()
const tokenDecimalsCache = new Map()

async function pickWorkingRpcCached(cacheKey, endpoints) {
  const now = Date.now()
  const cached = rpcCache.get(cacheKey)
  if (cached && now - cached.ts < RPC_CACHE_TTL_MS && endpoints.includes(cached.rpc)) {
    return cached.rpc
  }
  const rpc = await pickWorkingRpc(endpoints)
  if (rpc) rpcCache.set(cacheKey, { rpc, ts: now })
  return rpc
}

async function getTokenDecimalsCached(rpc, contract) {
  const key = `${rpc}|${contract}`
  const cached = tokenDecimalsCache.get(key)
  if (cached != null) return cached
  try {
    const result = await rpcCall(rpc, 'eth_call', [{ to: contract, data: ERC20_DECIMALS_SELECTOR }, 'latest'])
    const value = parseInt(result || '0x12', 16)
    const decimals = Number.isFinite(value) && value >= 0 && value <= 36 ? value : 18
    tokenDecimalsCache.set(key, decimals)
    return decimals
  } catch {
    tokenDecimalsCache.set(key, 18)
    return 18
  }
}

let chainPollCursor = 0
const chainLogState = new Map()

function getChainStateKey(ch, contract) {
  return `${String(ch?.chainId ?? 'na')}:${normalize(ch?.chainName || ch?.platform || '')}:${contract || ''}`
}

async function fetchTransferLogsIncremental(ch, contract, rpc, blockWindow) {
  const latestHex = await rpcCall(rpc, 'eth_blockNumber', [])
  const latest = parseInt(latestHex, 16)
  if (!Number.isFinite(latest) || latest < 0) return { latest: 0, logs: [] }

  const key = getChainStateKey(ch, contract)
  const prev = chainLogState.get(key) || { lastScanned: 0 }
  const maxRange = Number(ch?.chainId) === 143 ? MONAD_LOG_RANGE : Math.max(100, blockWindow || DEFAULT_LOG_RANGE)
  const startFrom = prev.lastScanned > 0
    ? Math.min(prev.lastScanned + 1, latest)
    : Math.max(0, latest - INITIAL_LOOKBACK)

  let cursor = startFrom
  let batches = 0
  const out = []

  while (cursor <= latest && batches < MAX_LOG_BATCHES_PER_CHAIN) {
    const to = Math.min(cursor + maxRange, latest)
    const logs = await rpcCall(rpc, 'eth_getLogs', [{
      address: contract,
      fromBlock: `0x${cursor.toString(16)}`,
      toBlock: `0x${to.toString(16)}`,
      topics: [ERC20_TRANSFER_TOPIC],
    }])
    if (Array.isArray(logs) && logs.length) out.push(...logs)
    cursor = to + 1
    batches += 1
  }

  chainLogState.set(key, { lastScanned: latest, updatedAt: Date.now() })
  return { latest, logs: out }
}

const FALLBACK_COIN = {
  symbol: 'ausd',
  name: 'Agora Dollar',
  image: { large: '', small: '' },
  platforms: {},
  market_data: { market_cap: { usd: null } },
}

export async function fetchAgoraData(signal) {
  const [coinRaw, chainsRaw] = await Promise.all([
    fetchJsonSafe(COINGECKO_URL, signal, FALLBACK_COIN),
    fetchJsonSafe(CHAIN_REGISTRY_URL, signal, []),
  ])

  const coin = coinRaw && typeof coinRaw === 'object' ? coinRaw : FALLBACK_COIN
  const chains = Array.isArray(chainsRaw) ? chainsRaw : []

  const cities = buildPriorityCities()

  const platforms = coin?.platforms || {}
  const contracts = Object.entries(platforms)
    .map(([platform, address]) => ({
      platform,
      address: String(address || '').trim(),
    }))
    .filter(v => /^0x[a-fA-F0-9]{40}$/.test(v.address))

  const chainRows = chains
    .map((ch) => {
      const rpcs = uniq(
        (ch.rpc || []).filter((u) => typeof u === 'string' && u.startsWith('http') && !u.includes('${'))
      )
      return {
        chainId: ch.chainId,
        name: ch.name,
        shortName: ch.shortName,
        testnet: !!ch.testnet,
        status: ch.status || 'active',
        rpcs,
      }
    })
    .filter(v => v.rpcs.length > 0 && isMainnetLike(v) && isAllowedChain(v))

  const mappedChains = contracts.map((c) => {
    const key = normalize(c.platform)
    const aliases = PLATFORM_ALIASES[c.platform] || PLATFORM_ALIASES[key] || [c.platform]
    const aliasNorm = aliases.map(normalize)
    const chain = chainRows.find((ch) => {
      const nn = normalize(ch.name)
      const sn = normalize(ch.shortName)
      return aliasNorm.some(a => nn.includes(a) || sn === a)
    })
    const scopeEntry = chain ? getScopeEntryByChain(chain) : (getScopeEntryByPlatform(c.platform) || getScopeEntryByPlatform(aliases[0]))
    return chain ? {
      platform: c.platform,
      contractAddress: (scopeEntry?.evm === false ? c.address : AUSD_EVM_CONTRACT),
      chainName: chain.name,
      chainId: scopeEntry?.chainId ?? chain.chainId,
      rpcs: uniq(scopeEntry?.rpcs?.length ? scopeEntry.rpcs : chain.rpcs),
      evm: scopeEntry?.evm !== false,
    } : null
  }).filter(Boolean)

  // Ensure scoped chains are present even if CoinGecko platform map is incomplete.
  for (const chain of chainRows) {
    const scopeEntry = getScopeEntryByChain(chain)
    if (!scopeEntry) continue
    const targetId = scopeEntry.chainId ?? chain.chainId
    const exists = mappedChains.some((m) =>
      Number(m.chainId) === Number(targetId) || normalize(m.chainName) === normalize(chain.name)
    )
    if (exists) continue
    mappedChains.push({
      platform: chain.shortName || chain.name,
      contractAddress: scopeEntry.evm ? AUSD_EVM_CONTRACT : null,
      chainName: chain.name,
      chainId: targetId,
      rpcs: uniq(scopeEntry.rpcs?.length ? scopeEntry.rpcs : chain.rpcs),
      evm: scopeEntry.evm !== false,
    })
  }

  // Ensure Monad AUSD is always included for live flow.
  const monadScope = CHAIN_SCOPE.monad
  const monadContract = normalizeAddress(AUSD_EVM_CONTRACT || MONAD_STABLECOINS?.AUSD?.[0])
  const hasMonad = mappedChains.some((c) => Number(c.chainId) === 143 || normalize(c.chainName).includes('monad'))
  if (!hasMonad && monadScope && monadContract) {
    mappedChains.push({
      platform: 'monad',
      contractAddress: monadContract,
      chainName: 'Monad',
      chainId: 143,
      rpcs: uniq(monadScope.rpcs || MONAD_RPC_ENDPOINTS || []),
      evm: true,
    })
  }

  return {
    logo: coin?.image?.large || coin?.image?.small || '',
    symbol: String(coin?.symbol || 'AUSD').toUpperCase(),
    name: coin?.name || 'Agora Dollar',
    marketCapUsd: coin?.market_data?.market_cap?.usd || null,
    cities,
    chains: mappedChains,
  }
}

export async function fetchMonadAusdTransfers({ blockWindow = 1200, maxLogs = 80 } = {}) {
  const ausd = normalizeAddress(MONAD_STABLECOINS?.AUSD?.[0])
  if (!ausd) return { rpc: null, contract: null, transfers: [] }

  const rpc = await pickWorkingRpc(MONAD_RPC_ENDPOINTS || [])
  if (!rpc) return { rpc: null, contract: ausd, transfers: [] }

  try {
    const latestHex = await rpcCall(rpc, 'eth_blockNumber', [])
    const latest = parseInt(latestHex, 16)
    const fromBlock = Math.max(0, latest - blockWindow)
    const fromHex = `0x${fromBlock.toString(16)}`
    const toHex = `0x${latest.toString(16)}`
    const logs = await rpcCall(rpc, 'eth_getLogs', [{
      address: ausd,
      fromBlock: fromHex,
      toBlock: toHex,
      topics: [ERC20_TRANSFER_TOPIC],
    }])

    const dexSet = new Set((MONAD_DEX_ROUTERS || []).map((a) => normalizeAddress(a)).filter(Boolean))
    const parsed = (logs || [])
      .slice(-maxLogs)
      .reverse()
      .map((log) => {
        const from = parseTopicAddress(log?.topics?.[1])
        const to = parseTopicAddress(log?.topics?.[2])
        const amountRaw = String(log?.data || '0x0')
        const amount = hexToInt(amountRaw) / 1e18
        const isSwap = !!(from && dexSet.has(from)) || !!(to && dexSet.has(to))
        return {
          txHash: log?.transactionHash || '',
          blockNumber: parseInt(log?.blockNumber || '0x0', 16),
          from,
          to,
          amount,
          isSwap,
          kind: isSwap ? 'swap' : 'transfer',
        }
      })
      .filter((v) => v.from && v.to)

    return { rpc, contract: ausd, transfers: parsed }
  } catch {
    return { rpc, contract: ausd, transfers: [] }
  }
}

export async function fetchAusdTransfersAllChains(
  chains,
  { blockWindow = DEFAULT_LOG_RANGE, maxLogsPerChain = 60, maxChainsPerPoll = 0 } = {}
) {
  const candidates = (chains || []).filter((c) =>
    c?.evm !== false && normalizeAddress(c?.contractAddress) && Array.isArray(c?.rpcs) && c.rpcs.length > 0
  )
  if (!candidates.length) return { transfers: [], scannedChains: 0 }

  const requested = Number(maxChainsPerPoll)
  const count = requested > 0
    ? Math.min(Math.max(1, requested), candidates.length)
    : candidates.length
  const batch = []
  for (let i = 0; i < count; i++) {
    const idx = (chainPollCursor + i) % candidates.length
    batch.push(candidates[idx])
  }
  chainPollCursor = (chainPollCursor + count) % candidates.length

  const dexSet = new Set((MONAD_DEX_ROUTERS || []).map((a) => normalizeAddress(a)).filter(Boolean))
  const results = await Promise.allSettled(batch.map(async (ch) => {
    const contract = normalizeAddress(ch.contractAddress)
    if (!contract) return []
    const cacheKey = `${String(ch.chainId || 'na')}:${normalize(ch.chainName || '')}`
    const rpc = await pickWorkingRpcCached(cacheKey, ch.rpcs.slice(0, 8))
    if (!rpc) return []
    const decimals = await getTokenDecimalsCached(rpc, contract)

    const { logs } = await fetchTransferLogsIncremental(ch, contract, rpc, blockWindow)

    return (logs || [])
      .reverse()
      .map((log) => {
        const from = parseTopicAddress(log?.topics?.[1])
        const to = parseTopicAddress(log?.topics?.[2])
          const amountRaw = hexToBigInt(String(log?.data || '0x0'))
          const amount = hexToInt(String(log?.data || '0x0')) / 1e18
          const amountDisplay = formatUnits(amountRaw, decimals, 6)
        const isSwap = Number(ch.chainId) === 143 && (
          !!(from && dexSet.has(from)) || !!(to && dexSet.has(to))
        )
        return {
          txHash: log?.transactionHash || '',
          blockNumber: parseInt(log?.blockNumber || '0x0', 16),
          from,
          to,
          amount,
            amountDisplay,
          kind: isSwap ? 'swap' : 'transfer',
          chainId: ch.chainId,
          chainName: ch.chainName,
            logIndex: parseInt(log?.logIndex || '0x0', 16),
        }
      })
      .filter((v) => v.from && v.to && v.txHash)
      .slice(0, maxLogsPerChain)
  }))

  const allRaw = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value || [])
  const deduped = new Map()
  for (const row of allRaw) {
    const k = `${row.chainId || 'na'}:${row.txHash}:${row.logIndex ?? 0}`
    if (!deduped.has(k)) deduped.set(k, row)
  }
  const all = [...deduped.values()]

  return {
    transfers: all
      .sort((a, b) => (b.blockNumber || 0) - (a.blockNumber || 0))
      .slice(0, maxLogsPerChain * Math.max(1, Math.min(count, 6))),
    scannedChains: batch.length,
  }
}
