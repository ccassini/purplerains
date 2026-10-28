export const DEFAULT_TITLE = 'Purple Rain - Monad Blockchain Visualization'

const SUFFIX = 'Purple Rain'

const ROUTE_NAMES = {
  '/staking': 'Staking',
  '/validator-requirements': 'Validator requirements',
  '/network': 'Network',
  '/ecosystem': 'Ecosystem',
  '/world': 'World map',
  '/world-3d': 'World globe',
  '/agora-world': 'AGORA map',
  '/agora-world-3d': 'AGORA globe',
  '/odyssey': 'Odyssey',
}

/** @param {string} pathname @returns {string} */
export function titleForPath(pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const name = ROUTE_NAMES[path]
  return name ? `${name} · ${SUFFIX}` : DEFAULT_TITLE
}
