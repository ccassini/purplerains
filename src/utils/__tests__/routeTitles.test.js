import { describe, expect, it } from 'vitest'
import { DEFAULT_TITLE, titleForPath } from '../routeTitles'

describe('titleForPath', () => {
  it('names every page route after its content', () => {
    expect(titleForPath('/staking')).toBe('Staking · Purple Rain')
    expect(titleForPath('/world-3d')).toBe('World globe · Purple Rain')
    expect(titleForPath('/odyssey')).toBe('Odyssey · Purple Rain')
  })

  it('falls back to the site title for home and unknown paths', () => {
    expect(titleForPath('/')).toBe(DEFAULT_TITLE)
    expect(titleForPath('/nope')).toBe(DEFAULT_TITLE)
  })

  it('ignores a trailing slash', () => {
    expect(titleForPath('/network/')).toBe('Network · Purple Rain')
  })
})
