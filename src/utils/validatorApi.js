/**
 * Monad Validator Metadata API
 * Fetches and manages validator information from GitHub validator-info repo
 */
import { logger } from './logger'

import { MONAD_MAINNET_CONFIG } from '../config/monadNetwork'

// Staking Precompile Address
const STAKING_PRECOMPILE = '0x0000000000000000000000000000000000001000'

// Cache for validator data
let validatorCache = {
  byAddress: new Map(),  // miner address -> validator info
  byId: new Map(),       // validator id -> validator info
  bySecp: new Map(),     // secp public key -> validator info
  lastFetch: 0,
  loading: false
}

// Validator logo file extensions mapping (auto-generated from downloaded logos)
const LOGO_EXTENSIONS = {
  1: 'webp', 2: 'webp', 3: 'webp', 4: 'png', 5: 'webp', 6: 'webp', 7: 'webp', 8: 'webp',
  9: 'webp', 10: 'webp', 11: 'webp', 12: 'webp', 13: 'webp', 14: 'webp', 15: 'webp', 16: 'svg',
  17: 'webp', 18: 'webp', 19: 'webp', 20: 'webp', 21: 'webp', 22: 'webp', 23: 'svg', 24: 'webp',
  25: 'webp', 26: 'webp', 27: 'webp', 28: 'webp', 29: 'webp', 30: 'webp', 31: 'webp', 32: 'webp',
  33: 'webp', 34: 'webp', 35: 'webp', 36: 'webp', 37: 'webp', 38: 'webp', 39: 'webp', 40: 'webp',
  41: 'webp', 42: 'webp', 43: 'webp', 44: 'svg', 45: 'webp', 46: 'webp', 47: 'webp', 48: 'svg',
  49: 'webp', 50: 'webp', 51: 'svg', 52: 'webp', 54: 'svg', 55: 'webp', 56: 'svg', 57: 'webp',
  58: 'webp', 59: 'webp', 60: 'webp', 61: 'webp', 62: 'webp', 63: 'webp', 64: 'webp', 65: 'webp',
  66: 'webp', 67: 'webp', 68: 'webp', 69: 'webp', 70: 'webp', 71: 'webp', 72: 'webp', 73: 'svg',
  74: 'webp', 75: 'webp', 76: 'webp', 77: 'webp', 78: 'webp', 79: 'webp', 80: 'webp', 81: 'webp',
  82: 'webp', 83: 'webp', 84: 'webp', 85: 'webp', 86: 'webp', 87: 'webp', 88: 'svg', 89: 'webp',
  90: 'webp', 91: 'webp', 92: 'webp', 93: 'webp', 94: 'webp', 95: 'webp', 96: 'webp', 97: 'webp',
  98: 'webp', 99: 'webp', 100: 'webp', 101: 'webp', 102: 'webp', 103: 'webp', 104: 'webp', 105: 'webp',
  106: 'webp', 107: 'webp', 108: 'webp', 109: 'webp', 110: 'webp', 111: 'svg', 112: 'webp', 113: 'webp',
  114: 'webp', 115: 'webp', 116: 'webp', 117: 'webp', 118: 'webp', 119: 'webp', 120: 'webp', 121: 'webp',
  122: 'webp', 123: 'webp', 124: 'webp', 125: 'webp', 126: 'webp', 127: 'webp', 128: 'webp', 129: 'webp',
  130: 'webp', 131: 'webp', 132: 'webp', 133: 'webp', 134: 'webp', 135: 'webp', 136: 'webp', 137: 'webp',
  138: 'webp', 139: 'webp', 140: 'webp', 141: 'webp', 142: 'webp', 143: 'webp', 144: 'webp', 145: 'webp',
  146: 'webp', 147: 'webp', 148: 'webp', 149: 'webp', 150: 'webp', 151: 'webp', 152: 'webp', 153: 'webp',
  154: 'webp', 155: 'webp', 156: 'webp', 157: 'svg', 158: 'webp', 159: 'svg', 160: 'webp', 161: 'webp',
  162: 'webp', 163: 'webp', 164: 'webp', 165: 'webp', 166: 'svg', 167: 'webp', 168: 'webp', 169: 'webp',
  170: 'svg', 171: 'webp', 172: 'webp', 173: 'webp', 174: 'webp', 175: 'webp', 176: 'webp', 177: 'webp',
  178: 'webp', 179: 'webp', 181: 'webp', 182: 'webp', 183: 'webp', 184: 'webp', 185: 'webp', 186: 'webp',
  187: 'webp', 188: 'webp', 189: 'webp', 190: 'webp', 191: 'webp', 192: 'webp', 193: 'webp', 194: 'webp',
  195: 'webp', 196: 'webp', 197: 'webp', 198: 'webp', 199: 'webp', 200: 'webp', 201: 'webp', 202: 'webp',
  203: 'webp', 204: 'webp', 205: 'webp', 206: 'webp', 207: 'webp', 208: 'webp', 209: 'webp', 210: 'webp',
  211: 'webp', 212: 'webp', 213: 'webp', 214: 'webp', 215: 'webp', 216: 'webp', 217: 'webp', 218: 'webp',
  219: 'webp', 220: 'webp', 221: 'webp',
}

// Default placeholder for unknown validators
const UNKNOWN_VALIDATOR = {
  id: null,
  name: 'Unknown Validator',
  logo: null,
  localLogo: null,
  website: null,
  description: 'Validator information not available'
}

/**
 * Get local logo path for a validator ID
 * Logos are stored in /public/validators/{id}.{ext}
 */
export function getLocalLogoPath(validatorId) {
  if (!validatorId) return null
  const ext = LOGO_EXTENSIONS[validatorId]
  if (!ext) return null
  return `/validators/${validatorId}.${ext}`
}

/**
 * Load all validator metadata from the generated mainnet bundle.
 * Source of truth: https://github.com/monad-developers/validator-info
 * Rebuild with: ./scripts/download-logos.sh
 */
export async function loadValidatorMetadata() {
  if (validatorCache.loading) return
  if (validatorCache.byId.size > 0) return // Already loaded

  validatorCache.loading = true

  try {
    const mod = await import('../data/mainnetValidators.json')
    const list = mod.default || mod
    for (const validator of list) {
      if (validator?.secp) {
        validatorCache.bySecp.set(String(validator.secp).toLowerCase(), validator)
        if (validator.id != null) {
          validatorCache.byId.set(validator.id, validator)
        }
      }
    }

    validatorCache.lastFetch = Date.now()
    logger.log(`Loaded ${validatorCache.bySecp.size} validator metadata entries`)
  } catch (error) {
    logger.error('Failed to load validator metadata:', error)
  } finally {
    validatorCache.loading = false
  }
}

/**
 * Get validator by secp public key
 */
export function getValidatorBySecp(secpKey) {
  if (!secpKey) return UNKNOWN_VALIDATOR
  return validatorCache.bySecp.get(secpKey.toLowerCase()) || UNKNOWN_VALIDATOR
}

/**
 * Get validator by ID with local logo path
 */
export function getValidatorById(validatorId) {
  if (!validatorId) return UNKNOWN_VALIDATOR
  const validator = validatorCache.byId.get(validatorId)
  if (!validator) return UNKNOWN_VALIDATOR
  
  // Add local logo path
  return {
    ...validator,
    localLogo: getLocalLogoPath(validatorId)
  }
}

/**
 * Get all validators with local logo paths (for network visualization etc.)
 * Call loadValidatorMetadata() first to ensure cache is populated.
 */
export function getAllValidators() {
  const list = []
  validatorCache.byId.forEach((v, id) => {
    list.push({
      ...v,
      id: Number(id),
      localLogo: getLocalLogoPath(Number(id))
    })
  })
  return list.sort((a, b) => (a.id || 0) - (b.id || 0))
}

/**
 * Fetch current block proposer validator ID from staking precompile
 * Using getProposerValId() - selector: 0xfbacb0be
 * Uses fallback RPC endpoints if primary fails
 */
export async function fetchProposerValidatorId(rpcUrl = null, { timeoutMs = 300 } = {}) {
  const endpoints = rpcUrl
    ? [rpcUrl, ...MONAD_MAINNET_CONFIG.rpcEndpoints.filter(e => e !== rpcUrl)]
    : MONAD_MAINNET_CONFIG.rpcEndpoints

  for (const endpoint of endpoints) {
    // Per-endpoint timeout: with ~0.3s blocks a slow RPC must not stall the
    // whole block pipeline — abort fast and try the next endpoint.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{
            to: STAKING_PRECOMPILE,
            data: '0xfbacb0be' // getProposerValId() selector
          }, 'latest'],
          id: 1
        })
      })

      if (!response.ok) continue // 429/5xx → try next endpoint

      const data = await response.json()
      if (data.error || !data.result || data.result === '0x') continue

      // Decode uint64 from result
      const validatorId = parseInt(data.result, 16)
      return validatorId
    } catch (error) {
      continue
    } finally {
      clearTimeout(timer)
    }
  }

  logger.error('Failed to fetch proposer validator ID from all endpoints')
  return null
}

/**
 * Fetch validator info from staking precompile by ID
 * Using getValidator(uint64) - selector: 0x2b6d639a
 */
export async function fetchValidatorFromChain(validatorId, rpcUrl = MONAD_MAINNET_CONFIG.rpcUrl) {
  try {
    // Encode validatorId as uint64 (padded to 32 bytes)
    const encodedId = validatorId.toString(16).padStart(64, '0')
    
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{
          to: STAKING_PRECOMPILE,
          data: '0x2b6d639a' + encodedId // getValidator(uint64)
        }, 'latest'],
        id: 1
      })
    })

    if (!response.ok) return null
    
    const data = await response.json()
    if (data.error || !data.result || data.result === '0x') return null
    
    // The result contains authAddress as the first 32 bytes (address is last 20 bytes)
    const authAddress = '0x' + data.result.slice(26, 66)
    
    return { validatorId, authAddress }
  } catch (error) {
    logger.error('Failed to fetch validator from chain:', error)
    return null
  }
}

/**
 * Get validator info for a block producer
 * First tries to match by miner address, then by proposer ID
 */
export async function getBlockProducerInfo(minerAddress, rpcUrl) {
  // First, try to load metadata if not loaded
  await loadValidatorMetadata()
  
  // Try to get proposer validator ID
  const proposerId = await fetchProposerValidatorId(rpcUrl)
  
  if (proposerId) {
    // Check local metadata first
    const localValidator = validatorCache.byId.get(proposerId)
    if (localValidator) {
      return localValidator
    }
    
    // If not in local cache, return minimal info
    return {
      ...UNKNOWN_VALIDATOR,
      id: proposerId,
      name: `Validator #${proposerId}`
    }
  }
  
  return UNKNOWN_VALIDATOR
}

/**
 * Search validators by name
 */
export function searchValidators(query) {
  if (!query || query.length < 2) return []
  
  const results = []
  const lowerQuery = query.toLowerCase()
  
  for (const [, validator] of validatorCache.bySecp) {
    if (validator.name && validator.name.toLowerCase().includes(lowerQuery)) {
      results.push(validator)
    }
  }
  
  return results.slice(0, 10)
}

/**
 * Get validator count
 */
export function getValidatorCount() {
  return validatorCache.bySecp.size
}

// Initialize on module load
loadValidatorMetadata()

export default {
  loadValidatorMetadata,
  getValidatorBySecp,
  getValidatorById,
  fetchProposerValidatorId,
  fetchValidatorFromChain,
  getBlockProducerInfo,
  searchValidators,
  getAllValidators,
  getValidatorCount,
  UNKNOWN_VALIDATOR
}
