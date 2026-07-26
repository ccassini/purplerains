#!/usr/bin/env node
/* eslint-env node */
/**
 * Writes a snapshot of DefiLlama's Monad protocols to
 * public/data/monadDefi.json.
 *
 * Why a snapshot exists at all: DefiLlama's /protocols endpoint is ~8MB of every
 * protocol on every chain, which must never reach a browser. In production the
 * serverless route api/monad-ecosystem.js filters and caches it. This file is
 * the fallback the page uses when that route is unavailable — local `vite dev`,
 * a cold/failed function, or offline work — so the page always renders real
 * data instead of an empty state.
 *
 * Usage: npm run build:ecosystem
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { isMonadProtocol, slimProtocol, monadTvlOf } from '../src/utils/ecosystemMerge.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'public/data/monadDefi.json')
const SOURCE = 'https://api.llama.fi/protocols'

const res = await fetch(SOURCE, { headers: { Accept: 'application/json' } })
if (!res.ok) {
  console.error(`DefiLlama returned ${res.status} ${res.statusText}`)
  process.exit(1)
}

const all = await res.json()
if (!Array.isArray(all)) {
  console.error('Unexpected payload: expected an array of protocols')
  process.exit(1)
}

const protocols = all
  .filter(isMonadProtocol)
  .map(slimProtocol)
  .sort((a, b) => b.tvl - a.tvl)

if (protocols.length === 0) {
  // Better to keep the previous snapshot than overwrite it with nothing.
  console.error('No Monad protocols found — refusing to write an empty snapshot')
  process.exit(1)
}

const payload = {
  source: 'defillama',
  updatedAt: new Date().toISOString(),
  chainTvl: protocols.reduce((n, p) => n + p.tvl, 0),
  count: protocols.length,
  protocols,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(payload) + '\n')

const bytes = Buffer.byteLength(JSON.stringify(payload))
console.log(`wrote ${protocols.length} Monad protocols to public/data/monadDefi.json (${(bytes / 1024).toFixed(0)}KB)`)
console.log(`total Monad TVL $${Math.round(payload.chainTvl).toLocaleString()}`)
console.log('top 5:')
for (const p of protocols.slice(0, 5)) {
  console.log(`  ${p.name.padEnd(22)} $${Math.round(monadTvlOf({ chainTvls: { Monad: p.tvl } })).toLocaleString().padStart(13)}  ${p.category}`)
}
