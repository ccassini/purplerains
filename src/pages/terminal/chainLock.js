import { CHAIN_ID, CHAIN_SLUG } from './constants'

/** Terminal is Monad mainnet only. No other chain id, slug, or prefixed id is admitted. */
export function isMonadNetworkId(id) {
  if (id == null || id === '') return false
  if (id === CHAIN_ID) return true
  const s = String(id).toLowerCase()
  if (s === String(CHAIN_ID) || s === CHAIN_SLUG) return true
  if (s.startsWith(`${CHAIN_SLUG}_`)) return true
  if (s.endsWith(`-${CHAIN_SLUG}`) || s.includes(`-${CHAIN_SLUG}-`)) return true
  return false
}

export function isMonadPair(pair) {
  return pair?.chainId === CHAIN_SLUG
}

export function geckoNetworkPath(rest) {
  const tail = rest.startsWith('/') ? rest : `/${rest}`
  return `/networks/${CHAIN_SLUG}${tail}`
}
