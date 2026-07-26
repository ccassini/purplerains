import { describe, expect, test } from 'vitest'
import { projectFor, projectBreakdown, monadVisionBlockUrl } from '../monadContracts'

describe('projectFor', () => {
  test('resolves a known router regardless of address casing', () => {
    const lower = projectFor('0xb3e6778480b2e488385e8205ea05e20060b813cb')
    const mixed = projectFor('0xB3e6778480b2E488385E8205eA05E20060B813cb')
    expect(lower?.name).toBe('Kuru')
    expect(mixed?.name).toBe('Kuru')
    expect(lower?.logo).toContain('/ecosystem/')
  })

  test('resolves verified token contracts', () => {
    expect(projectFor('0x754704Bc059F8C67012fEd69BC8A327a5aafb603')?.name).toBe('USDC')
    expect(projectFor('0x3bd359c1119da7da1d913d1c4d2b7c461115433a')?.name).toBe('WMON')
  })

  test('resolves contracts harvested from the MonadVision project pages', () => {
    // Kuru's order-book markets and Monday's router — addresses that only the
    // explorer knew, not the repo's hand-written router list.
    expect(projectFor('0x065c9d28e428a0db40191a54d33d5b7c71a9c394')?.name).toBe('Kuru')
    expect(projectFor('0x2f903ac6ddaf57eadcbbc46adc3ad739c3506a2d')?.name).toBe('Monday Trade')
    expect(projectFor('0x6131b5fae19ea4f9d964eac0408e4408b66337b5')?.name).toBe('KyberSwap')
  })

  test('never guesses: unknown addresses and wallets are null', () => {
    expect(projectFor('0x00000000000000000000000000000000deadbeef')).toBeNull()
    expect(projectFor(null)).toBeNull()
    expect(projectFor(undefined)).toBeNull()
  })
})

describe('projectBreakdown', () => {
  test('tallies recruits by project, most active first, unknowns as other', () => {
    const kuru = '0xb3e6778480b2e488385e8205ea05e20060b813cb'
    const uni = '0x4b2ab38dbf28d31d467aa8993f6c2585981d6804'
    const recruits = [
      { to: kuru }, { to: kuru }, { to: kuru },
      { to: uni },
      { to: '0x1234000000000000000000000000000000000000' },
      { to: null },
    ]
    const { rows, other } = projectBreakdown(recruits)
    expect(rows[0]).toMatchObject({ name: 'Kuru', count: 3 })
    expect(rows[1]).toMatchObject({ name: 'Uniswap', count: 1 })
    expect(other).toBe(2)
  })

  test('caps the rows and tolerates empty input', () => {
    expect(projectBreakdown([]).rows).toEqual([])
    expect(projectBreakdown(undefined).other).toBe(0)
  })
})

describe('monadVisionBlockUrl', () => {
  test('links the block on the configured explorer', () => {
    expect(monadVisionBlockUrl(90000004)).toBe('https://monadvision.com/block/90000004')
  })
})
