export function homeViewFromSearch(search) {
  return new URLSearchParams(search).get('view')?.toLowerCase() === 'price' ? 'price' : 'terminal'
}

/** Return a Router-compatible search string without changing Terminal's own tabs. */
export function homeSearchForView(search, view) {
  const params = new URLSearchParams(search)
  if (view === 'price') params.set('view', 'price')
  else params.delete('view')
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function legacyHomeTarget(location, view) {
  return { pathname: '/', search: homeSearchForView(location?.search, view), hash: location?.hash || '' }
}

export function legacyCalculatorTarget(location) {
  return { pathname: '/staking', search: location?.search || '', hash: location?.hash || '#calculator' }
}
