/**
 * Structural guard on the boarding invariant.
 *
 * The Torchbearer work is presentational: ranks, poses, flames, abilities and
 * motes may never influence how many soldiers board. This test fails if a
 * future ability quietly reads the deck count or imports the capacity module,
 * which is how the two systems would drift back together.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, test } from 'vitest'

// Resolved from this file rather than the working directory: the lint config
// targets the browser and has no `process` global.
const SHIP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

const sources = readdirSync(SHIP_DIR)
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ file: f, src: readFileSync(join(SHIP_DIR, f), 'utf8') }))

describe('capacity isolation', () => {
  test('only the engine imports the capacity module', () => {
    const importers = sources
      .filter(({ src }) => /from '\.\/capacity'/.test(src))
      .map(({ file }) => file)
    expect(importers).toEqual(['engine.js'])
  })

  test('only the engine decides how many passengers a hull takes', () => {
    // `passengers.push` is the single act of boarding. The renderer may read
    // passengers.length for occlusion, but nothing else may append.
    const pushers = sources
      .filter(({ src }) => /passengers\s*\.\s*push/.test(src))
      .map(({ file }) => file)
    expect(pushers).toEqual(['engine.js'])
  })

  test('presentation modules never reference ship.load', () => {
    const PRESENTATION = ['abilities.js', 'flames.js', 'poses.js', 'motes.js', 'ranks.js']
    for (const file of PRESENTATION) {
      const hit = sources.find((s) => s.file === file)
      expect(hit, `${file} should exist`).toBeTruthy()
      expect(hit.src, `${file} must not read ship load`).not.toMatch(/\.load\b/)
    }
  })

  test('the capacity module itself imports nothing from the ship modules', () => {
    const capacity = sources.find((s) => s.file === 'capacity.js')
    expect(capacity).toBeTruthy()
    expect(capacity.src).not.toMatch(/^import /m)
  })
})
