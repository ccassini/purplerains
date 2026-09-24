import { TAPE_CAP } from './constants'
import { filterFills } from './marketMath'

export function filterTerminalSource(fills, source = 'all') {
  return !source || source === 'all' ? fills : fills.filter((fill) => fill.source === source || fill.sources?.includes(source))
}

/** The inspector selection becomes a tape filter only through an explicit scope. */
export function selectTerminalTape(fills, options = {}) {
  const { selectedOnly = false, selected, source, ...filters } = options
  return filterFills(filterTerminalSource(fills, source), { ...filters, selected: selectedOnly ? selected : null }).slice(0, TAPE_CAP)
}
