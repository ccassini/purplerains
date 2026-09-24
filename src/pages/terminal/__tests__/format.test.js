import { describe, expect, test } from 'vitest'
import {
  asNum,
  canonicalPair,
  formatAge,
  formatHold,
  formatPct,
  formatUsd,
  parseFeePct,
  protoFromDexId,
  shortAddr,
  signedClass,
  sizeTier,
} from '../format'

describe('asNum', () => {
  test('keeps a successful zero', () => {
    expect(asNum(0)).toBe(0)
    expect(asNum('0')).toBe(0)
  })

  test('returns null for missing or junk evidence instead of zero', () => {
    expect(asNum(null)).toBeNull()
    expect(asNum(undefined)).toBeNull()
    expect(asNum('')).toBeNull()
    expect(asNum('nope')).toBeNull()
    expect(asNum(Number.NaN)).toBeNull()
  })
})

describe('formatUsd', () => {
  test('renders a dash when the value is unknown', () => {
    expect(formatUsd(null)).toBe('—')
  })

  test('keeps a successful zero', () => {
    expect(formatUsd(0)).toBe('$0.00')
  })

  test('signs profits when asked', () => {
    expect(formatUsd(12.5, { signed: true })).toBe('+$12.50')
    expect(formatUsd(-12.5, { signed: true })).toBe('-$12.50')
  })
})

describe('shortAddr', () => {
  test('truncates a 20-byte address', () => {
    expect(shortAddr('0x0123456789abcdef0123456789abcdef01234567')).toBe('0x0123…4567')
  })
})

describe('protoFromDexId / parseFeePct', () => {
  test('reads uniswap v4 from a gecko dex id', () => {
    expect(protoFromDexId('uniswap-v4-monad')).toBe('v4')
    expect(protoFromDexId('pancakeswap-v3-monad')).toBe('v3')
  })

  test('parses the fee out of a gecko pool name', () => {
    expect(parseFeePct('WMON / USDC 0.3%')).toBe(0.3)
    expect(parseFeePct('MON / FLING 1%')).toBe(1)
    expect(parseFeePct('no fee here')).toBeNull()
  })
})

describe('canonicalPair', () => {
  test('orders symbols so WMON/USDC and USDC/WMON collide', () => {
    expect(canonicalPair('WMON', 'USDC')).toBe(canonicalPair('USDC', 'WMON'))
  })
})

describe('display helpers', () => {
  test('formatPct signs the move', () => {
    expect(formatPct(3.04)).toBe('+3.04%')
    expect(formatPct(-1)).toBe('-1.00%')
  })

  test('signedClass is flat at zero and unknown', () => {
    expect(signedClass(0)).toBe('flat')
    expect(signedClass(null)).toBe('flat')
    expect(signedClass(2)).toBe('up')
  })

  test('sizeTier matches the tape weight bands', () => {
    expect(sizeTier(100)).toBe(0)
    expect(sizeTier(500)).toBe(1)
    expect(sizeTier(60_000)).toBe(4)
  })

  test('formatAge and formatHold stay relative', () => {
    expect(formatAge(1_000, 13_000)).toBe('12s')
    expect(formatHold(90)).toBe('1m')
  })
})
