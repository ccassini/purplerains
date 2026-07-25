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
  1: 'png', 2: 'png', 3: 'png', 4: 'png', 5: 'png', 6: 'png', 7: 'png', 8: 'jpg',
  9: 'png', 10: 'png', 11: 'png', 12: 'png', 13: 'png', 14: 'png', 15: 'png', 16: 'svg',
  17: 'png', 18: 'jpg', 19: 'png', 20: 'png', 21: 'png', 22: 'png', 23: 'svg', 24: 'png',
  25: 'jpg', 26: 'png', 27: 'jpg', 28: 'png', 29: 'png', 30: 'png', 31: 'png', 32: 'png',
  33: 'png', 34: 'png', 35: 'png', 36: 'jpg', 37: 'png', 38: 'png', 39: 'jpg', 40: 'png',
  41: 'png', 42: 'png', 43: 'png', 44: 'svg', 45: 'png', 46: 'png', 47: 'png', 48: 'svg',
  49: 'jpg', 50: 'png', 51: 'svg', 52: 'png', 54: 'svg', 55: 'png', 56: 'svg', 57: 'jpg',
  58: 'png', 59: 'png', 60: 'png', 61: 'png', 62: 'jpg', 63: 'png', 64: 'png', 65: 'png',
  66: 'png', 67: 'png', 68: 'png', 69: 'png', 70: 'jpg', 71: 'png', 72: 'png', 73: 'svg',
  74: 'png', 75: 'png', 76: 'jpg', 77: 'png', 78: 'png', 79: 'jpg', 80: 'png', 81: 'jpg',
  82: 'png', 83: 'png', 84: 'png', 85: 'png', 86: 'png', 87: 'jpg', 88: 'svg', 89: 'png',
  90: 'png', 91: 'png', 92: 'png', 93: 'png', 94: 'png', 95: 'png', 96: 'png', 97: 'png',
  98: 'jpg', 99: 'png', 100: 'png', 101: 'png', 102: 'png', 103: 'png', 104: 'jpg', 105: 'png',
  106: 'jpg', 107: 'png', 108: 'png', 109: 'jpg', 110: 'png', 111: 'svg', 112: 'png', 113: 'png',
  114: 'png', 115: 'jpg', 116: 'png', 117: 'png', 118: 'png', 119: 'jpg', 120: 'png', 121: 'png',
  122: 'png', 123: 'png', 124: 'png', 125: 'png', 126: 'png', 127: 'jpg', 128: 'png', 129: 'png',
  130: 'png', 131: 'jpg', 132: 'png', 133: 'png', 134: 'jpg', 135: 'png', 136: 'png', 137: 'jpg',
  138: 'png', 139: 'png', 140: 'jpg', 141: 'png', 142: 'png', 143: 'png', 144: 'png', 145: 'png',
  146: 'png', 147: 'png', 148: 'png', 149: 'jpg', 150: 'png', 151: 'webp', 152: 'png', 153: 'png',
  154: 'png', 155: 'png', 156: 'png', 157: 'svg', 158: 'jpg', 159: 'svg', 160: 'png', 161: 'png',
  162: 'png', 163: 'jpg', 164: 'png', 165: 'jpg', 166: 'svg', 167: 'jpg', 168: 'png', 169: 'png',
  170: 'svg', 171: 'png', 172: 'png', 173: 'png', 174: 'png', 175: 'png', 176: 'jpg', 177: 'jpg',
  178: 'png', 179: 'png', 181: 'png', 182: 'png', 183: 'jpg', 184: 'jpg', 185: 'png', 186: 'jpg',
  187: 'png', 188: 'png', 189: 'png', 190: 'png', 191: 'png', 192: 'png', 193: 'png', 194: 'png',
  195: 'png', 196: 'jpg', 197: 'png', 198: 'jpg', 199: 'png', 200: 'png', 201: 'png', 202: 'jpg',
  203: 'jpg', 204: 'png', 205: 'png', 206: 'png', 207: 'jpg', 208: 'jpg', 209: 'png', 210: 'png',
  211: 'jpg', 212: 'png', 213: 'png', 214: 'jpg', 215: 'png', 216: 'jpg', 217: 'png', 218: 'jpg',
  219: 'jpg', 220: 'png', 221: 'png',
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
 * Load all validator metadata from local mainnet folder
 * These are pre-downloaded from https://github.com/monad-developers/validator-info
 */
export async function loadValidatorMetadata() {
  if (validatorCache.loading) return
  if (validatorCache.byId.size > 0) return // Already loaded
  
  validatorCache.loading = true
  
  try {
    // Import all JSON files from mainnet folder dynamically
    // Use relative path from src folder - Vite resolves from project root
    const modules = import.meta.glob('../../mainnet/*.json', { eager: true })
    
    for (const path in modules) {
      const validator = modules[path].default || modules[path]
      if (validator && validator.secp) {
        validatorCache.bySecp.set(validator.secp.toLowerCase(), validator)
        if (validator.id) {
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
