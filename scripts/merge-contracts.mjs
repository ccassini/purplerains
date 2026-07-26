/**
 * Merge harvested MonadVision contracts into src/utils/monadContracts.js.
 *
 * Input: a JSON file shaped
 *   { "<Project Name>": [["0xaddr", "ContractLabel"], ...], ... }
 * as scraped from monadvision.com/project/<name>?tab=Contract.
 *
 * The generated block is written between the BEGIN/END markers, so hand-written
 * entries above it survive and re-running is idempotent. Addresses already
 * present in the file are skipped: the curated set wins over the scrape.
 *
 * Usage: node scripts/merge-contracts.mjs harvest.json [logo-overrides.json]
 *
 * Logo overrides default to scripts/data/mv-logos.json when present; without
 * an override file, only exact normalized filename matches attach a logo.
 */
/* eslint-env node */
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'

const TARGET = 'src/utils/monadContracts.js'
const BEGIN = '  /* BEGIN GENERATED: monadvision harvest */'
const END = '  /* END GENERATED */'

const harvestPath = process.argv[2]
if (!harvestPath) {
  console.error('usage: node scripts/merge-contracts.mjs <harvest.json>')
  process.exit(1)
}

const harvest = JSON.parse(readFileSync(harvestPath, 'utf8'))
const source = readFileSync(TARGET, 'utf8')

// Addresses curated by hand keep their entry. Crucially, the previously
// GENERATED block must not count as existing: it is about to be replaced, and
// counting its rows both skipped them from the new block and then deleted
// them with the old one — the harvest silently shrank on every re-run.
const handWritten = source.includes(BEGIN)
  ? source.replace(new RegExp(`${BEGIN.replace(/[*/]/g, '\\$&')}[\\s\\S]*?${END.replace(/[*/]/g, '\\$&')}`), '')
  : source
const existing = new Set(
  [...handWritten.matchAll(/'(0x[0-9a-f]{40})'\s*:/g)].map((m) => m[1]),
)

/** Exact logo overrides harvested from MonadVision, keyed by project name. */
const DEFAULT_OVERRIDES_PATH = 'scripts/data/mv-logos.json'
const overridesPath =
  process.argv[3] ?? (existsSync(DEFAULT_OVERRIDES_PATH) ? DEFAULT_OVERRIDES_PATH : null)
let overrides = {}
if (overridesPath) {
  try {
    overrides = JSON.parse(readFileSync(overridesPath, 'utf8'))
  } catch (error) {
    console.error(`failed to read logo overrides ${overridesPath}: ${error.message}`)
    process.exit(1)
  }
}

/** Ecosystem logo files, matched case- and punctuation-insensitively. */
const logos = readdirSync('public/ecosystem')
const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
function logoFor(project) {
  if (overrides[project]) return `'${overrides[project]}'`
  const want = normalize(project)
  // Exact normalized equality only: startsWith fuzzy matching could silently
  // attach another project's logo (e.g. "Fly" vs "Flywheel").
  const hit = logos.find((f) => normalize(f.replace(/\.[a-z0-9]+$/i, '')) === want)
  return hit ? `\`\${ECO}${hit}\`` : 'null'
}

const lines = []
let added = 0
for (const [project, rows] of Object.entries(harvest)) {
  if (!Array.isArray(rows) || rows.length === 0) continue
  const fresh = rows.filter(([addr]) => addr && !existing.has(addr.toLowerCase()))
  if (fresh.length === 0) continue
  lines.push(`  // ── ${project} ──`)
  for (const [addr, label] of fresh) {
    const a = addr.toLowerCase()
    existing.add(a)
    added++
    const note = label ? ` // ${label}` : ''
    lines.push(`  '${a}': { name: '${project.replace(/'/g, "\\'")}', logo: ${logoFor(project)} },${note}`)
  }
}

const block = [BEGIN, ...lines, END].join('\n')
const next = source.includes(BEGIN)
  ? source.replace(new RegExp(`${BEGIN.replace(/[*/]/g, '\\$&')}[\\s\\S]*?${END.replace(/[*/]/g, '\\$&')}`), block)
  : source.replace(/\n\}\n\n\/\*\*\n \* Project behind/, `\n${block}\n}\n\n/**\n * Project behind`)

writeFileSync(TARGET, next)
console.log(`merged ${added} contracts across ${Object.keys(harvest).length} projects`)
