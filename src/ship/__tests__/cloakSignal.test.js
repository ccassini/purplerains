/**
 * The inspector card's accent must be readable ON THE PANEL.
 *
 * The raw cloak dyes are armour — near-black by design — and piping them into
 * the DOM once rendered card titles at ~1.2:1, functionally invisible. Every
 * trait set therefore carries a third, DOM-only `cloakSignal`; this test pins
 * its legibility so a palette tweak cannot silently regress the card.
 *
 * Pure: `hopliteFromTx` builds no sprite, so no canvas stub is needed.
 */
import { describe, expect, test } from 'vitest'
import { hopliteFromTx } from '../sprites'

/** The .hb-card field: rgba(14,9,30,.96) over the #0b0718 night canvas. */
const PANEL = '#0e091e'

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))

/** WCAG relative luminance. */
function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('cloakSignal — the DOM-legible dye', () => {
  test('every reachable dye carries a signal at >= 4.5:1 on the card panel', () => {
    /** @type {Map<string, string>} signal -> the cloak it stands for */
    const seen = new Map()
    // Enough hashes to visit all eight cloak dyes many times over.
    for (let i = 0; i < 256; i++) {
      const t = hopliteFromTx(`0xsig${i}`, { value: 1, gasPrice: 10 })
      seen.set(t.cloakSignal, t.cloak)
    }
    // And the whale gold, reached by value alone.
    const whale = hopliteFromTx('0xsigwhale', { value: 500 })
    expect(whale.whale).toBe(true)
    seen.set(whale.cloakSignal, whale.cloak)

    expect(seen.size).toBeGreaterThanOrEqual(9)
    for (const [signal, cloak] of seen) {
      expect(signal).toMatch(/^#[0-9a-f]{6}$/i)
      const ratio = contrast(hex(signal), hex(PANEL))
      expect(ratio, `${signal} (for cloak ${cloak}) must be legible on ${PANEL}`)
        .toBeGreaterThanOrEqual(4.5)
    }
  })

  test('the signal is deterministic per hash, like every other trait', () => {
    const a = hopliteFromTx('0xstable', { value: 1, gasPrice: 10 })
    const b = hopliteFromTx('0xstable', { value: 1, gasPrice: 10 })
    expect(a.cloakSignal).toBe(b.cloakSignal)
    expect(a.cloak).toBe(b.cloak)
  })
})
