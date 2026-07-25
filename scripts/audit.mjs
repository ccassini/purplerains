#!/usr/bin/env node
/**
 * Repo audit — derives every finding from the CURRENT working tree.
 *
 * Why this exists: an audit written into a chat log or someone's memory goes
 * stale the moment a file changes, and line-based greps quietly lie about
 * multi-line JSX attributes and about keywords that only appear inside
 * comments. Both produced false findings before. This script re-derives each
 * check from source every run, strips comments first, and parses JSX tags
 * across newlines, so the answer is reproducible by anyone without trusting a
 * previous conversation.
 *
 * Usage: node scripts/audit.mjs [--json]
 * Exit code is 1 if any FAIL check trips, so it can gate CI.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

// fileURLToPath, not URL.pathname: this repo's path contains a space and
// pathname would hand back a percent-encoded string, silently breaking every
// existsSync/readdir below and reporting a clean tree.
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const JSON_OUT = process.argv.includes('--json')
const findings = []

const add = (level, area, msg, detail) =>
  findings.push({ level, area, msg, detail: detail ?? null })

const sh = (cmd) => {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

function walk(dir, exts, acc = []) {
  const abs = join(ROOT, dir)
  if (!existsSync(abs)) return acc
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const rel = join(dir, e.name)
    if (e.isDirectory()) {
      if (!/node_modules|\.git|dist|__tests__/.test(rel)) walk(rel, exts, acc)
    } else if (exts.includes(extname(e.name))) acc.push(rel)
  }
  return acc
}

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const stripJs = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1')

function cssRules(rel) {
  const out = []
  for (const m of stripCss(read(rel)).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    out.push({ sel: m[1].trim().replace(/\s+/g, ' '), body: m[2] })
  }
  return out
}

// ── 1. Git hygiene ────────────────────────────────────────────────────────────
{
  const nm = sh('git ls-files node_modules | wc -l').trim()
  if (Number(nm) > 0) {
    add('FAIL', 'git', `node_modules is tracked in git (${nm} files)`,
      'Fix: git rm -r --cached node_modules && git commit')
  }
  const srcOnDisk = walk('src', ['.js', '.jsx', '.css']).length
  const srcTracked = Number(sh('git ls-files src | wc -l').trim() || 0)
  if (srcTracked < srcOnDisk) {
    const untracked = sh("git status --porcelain src | grep '^??' | wc -l").trim()
    add('FAIL', 'git', `${srcOnDisk - srcTracked} source files are not in git (${srcTracked}/${srcOnDisk} tracked)`,
      `${untracked} untracked entries under src/ — no history, no revert path`)
  }
}

// ── 2. Lint config actually loads ─────────────────────────────────────────────
{
  const out = sh('node node_modules/eslint/bin/eslint.js --print-config package.json 2>&1 || true')
  if (/couldn't find the config|Failed to load|Cannot find module/i.test(out)) {
    add('FAIL', 'lint', 'ESLint config does not load — `npm run lint` is a no-op',
      out.split('\n').find((l) => /config/i.test(l)) || '')
  }
}

// ── 3. CSP vs the origins the app really uses ─────────────────────────────────
{
  if (existsSync(join(ROOT, 'vercel.json'))) {
    const vercel = JSON.parse(read('vercel.json'))
    const csp = JSON.stringify(vercel.headers ?? '').match(/Content-Security-Policy[^}]*?"value":"([^"]+)"/)?.[1] || ''
    if (csp) {
      const files = [...walk('src', ['.js', '.jsx', '.css']), 'index.html'].filter((f) =>
        existsSync(join(ROOT, f))
      )
      const origins = new Set()
      for (const f of files) {
        for (const m of read(f).matchAll(/https:\/\/([a-z0-9.-]+)/gi)) origins.add(m[1].toLowerCase())
      }
      const directive = (name) =>
        csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + ' ')) || ''
      const allows = (dir, host) => dir.includes(host) || dir.includes('https:') || dir.includes('*')

      // Stylesheets + fonts are the ones that silently degrade with no console
      // error most people notice, so check them explicitly.
      const styleDir = directive('style-src') || directive('default-src')
      const fontDir = directive('font-src') || directive('default-src')
      if (origins.has('fonts.googleapis.com') && !allows(styleDir, 'fonts.googleapis.com')) {
        add('FAIL', 'csp', 'CSP style-src blocks fonts.googleapis.com, which the app loads',
          `style-src = "${styleDir}" → webfonts silently fall back in production`)
      }
      if (origins.has('fonts.gstatic.com') && !allows(fontDir, 'fonts.gstatic.com')) {
        add('FAIL', 'csp', 'CSP font-src blocks fonts.gstatic.com font files',
          `font-src = "${fontDir}"`)
      }
      if (/script-src[^;]*'unsafe-inline'/.test(csp)) {
        add('WARN', 'csp', "script-src allows 'unsafe-inline' (weakens XSS protection)")
      }
      if (!JSON.stringify(vercel.headers ?? '').includes('Strict-Transport-Security')) {
        add('WARN', 'csp', 'No Strict-Transport-Security header')
      }
    }
  }
}

// ── 4. Layout-triggering animations (compositor-hostile) ──────────────────────
{
  const LAYOUT_PROPS = /\b(width|height|top|left|right|bottom|margin|padding|font-size|border-width)\b/g
  for (const f of walk('src', ['.css'])) {
    for (const r of cssRules(f)) {
      const animated = [
        ...(r.body.match(/transition:[^;]*/g) || []),
        ...(r.body.match(/will-change:[^;]*/g) || []),
      ].join(' ')
      const bad = [...new Set([...animated.matchAll(LAYOUT_PROPS)].map((m) => m[1]))]
      if (bad.length) {
        add('WARN', 'css-perf', `${basename(f)} ${r.sel} animates layout-bound: ${bad.join(', ')}`,
          'Prefer transform/opacity — these force layout every frame of the transition')
      }
    }
  }
}

// ── 5. backdrop-filter over continuously repainting surfaces ──────────────────
{
  for (const f of walk('src', ['.css'])) {
    const hits = cssRules(f).filter((r) => /backdrop-filter/.test(r.body)).map((r) => r.sel)
    if (hits.length > 2) {
      add('WARN', 'css-perf', `${basename(f)} has ${hits.length} backdrop-filter rules`,
        `${hits.join(', ')} — each is re-blurred every frame the surface behind it repaints`)
    }
  }
}

// ── 6. Oversized files ────────────────────────────────────────────────────────
{
  const LIMIT = 800
  for (const f of walk('src', ['.js', '.jsx', '.css'])) {
    const lines = read(f).split('\n').length
    if (lines > LIMIT) add('WARN', 'size', `${f} is ${lines} lines (limit ${LIMIT})`)
  }
}

// ── 7. Helpers duplicated across files ────────────────────────────────────────
{
  const seen = new Map()
  for (const f of walk('src', ['.js', '.jsx'])) {
    for (const m of stripJs(read(f)).matchAll(/^\s*function\s+([A-Za-z0-9_]+)\s*\(/gm)) {
      const name = m[1]
      if (!seen.has(name)) seen.set(name, new Set())
      seen.get(name).add(f)
    }
  }
  for (const [name, files] of seen) {
    if (files.size > 1) {
      add('WARN', 'dry', `function ${name}() duplicated in ${files.size} files`,
        [...files].join(', '))
    }
  }
}

// ── 8. Raw console.* outside the logger ───────────────────────────────────────
{
  for (const f of walk('src', ['.js', '.jsx'])) {
    if (/utils[\\/]logger\.js$/.test(f)) continue
    const n = [...stripJs(read(f)).matchAll(/console\.(log|warn|error|info|debug)\b/g)].length
    if (n) add('INFO', 'logging', `${f} uses console.* directly (${n}×) — prefer logger`)
  }
}

// ── 9. Accessibility (multi-line aware, unlike a line grep) ───────────────────
{
  let imgNoAlt = 0, btnNoName = 0
  for (const f of walk('src', ['.jsx'])) {
    const s = read(f)
    for (const m of s.matchAll(/<img\b[^>]*?\/?>/gs)) if (!/\balt\s*=/.test(m[0])) imgNoAlt++
    for (const m of s.matchAll(/<button\b([^>]*?)>([\s\S]*?)<\/button>/g)) {
      const named = /aria-label|aria-labelledby|title\s*=/.test(m[1])
      const text = m[2].replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, '').trim()
      if (!named && !text) btnNoName++
    }
  }
  if (imgNoAlt) add('WARN', 'a11y', `${imgNoAlt} <img> without alt`)
  if (btnNoName) add('WARN', 'a11y', `${btnNoName} <button> with neither accessible name nor text`)
}

// ── 10. Eager glob imports (whole directories pulled into the bundle) ─────────
{
  for (const f of walk('src', ['.js', '.jsx'])) {
    for (const m of stripJs(read(f)).matchAll(/import\.meta\.glob\(\s*['"]([^'"]+)['"][^)]*eager:\s*true/g)) {
      const pattern = m[1]
      const dir = join(ROOT, 'src', pattern.replace(/\*.*$/, '')).replace(/\/+$/, '')
      let count = 0
      try { count = readdirSync(dir).length } catch { /* pattern may be relative elsewhere */ }
      add('WARN', 'bundle', `${f} eagerly globs "${pattern}"${count ? ` (~${count} files)` : ''}`,
        'eager:true inlines every match into the bundle')
    }
  }
}

// ── 11. Heavy + unreferenced public assets ────────────────────────────────────
{
  const BIG = 300 * 1024
  const refHaystack = [...walk('src', ['.js', '.jsx', '.css']), 'index.html']
    .filter((f) => existsSync(join(ROOT, f)))
    .map((f) => read(f))
    .join('\n')
    + (existsSync(join(ROOT, 'public/manifest.json')) ? read('public/manifest.json') : '')

  // Two ways a real reference is invisible to a naive substring test, both of
  // which produced false "dead asset" findings before:
  //   1. spaces in filenames are percent-encoded at the call site
  //      ('/agora/monad%20logo.jpeg')
  //   2. whole directories are addressed dynamically (`/validators/${id}.png`),
  //      so no individual filename ever appears in source
  const dynamicDirs = new Set()
  for (const m of refHaystack.matchAll(/['"`]\/([a-z0-9_-]+)\/(?:\$\{|['"`]\s*\+|\s*\$)/gi)) {
    dynamicDirs.add(m[1].toLowerCase())
  }

  const assets = walk('public', ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'])
  let bigCount = 0, bigBytes = 0
  const unreferenced = []
  for (const a of assets) {
    const size = statSync(join(ROOT, a)).size
    const name = basename(a)
    if (size > BIG) {
      bigCount++; bigBytes += size
      add('WARN', 'assets', `${a} is ${(size / 1024 / 1024).toFixed(1)}MB`,
        'Resize to rendered dimensions and convert to WebP/AVIF')
    }
    const dir = a.split('/')[1]?.toLowerCase()
    const referenced =
      refHaystack.includes(name) ||
      refHaystack.includes(name.replace(/ /g, '%20')) ||
      refHaystack.includes(encodeURIComponent(name)) ||
      (dir && dynamicDirs.has(dir))
    if (!referenced) unreferenced.push({ a, size })
  }
  if (unreferenced.length) {
    const bytes = unreferenced.reduce((n, u) => n + u.size, 0)
    unreferenced.sort((x, y) => y.size - x.size)
    add('WARN', 'assets',
      `${unreferenced.length} asset(s) with no literal or dynamic reference, ${(bytes / 1024 / 1024).toFixed(1)}MB total`,
      'Largest: ' + unreferenced.slice(0, 4).map((u) => `${u.a} (${(u.size / 1024).toFixed(0)}KB)`).join(', ')
        + ' — verify before deleting')
  }
  if (bigCount) {
    add('INFO', 'assets', `${bigCount} images over 300KB, ${(bigBytes / 1024 / 1024).toFixed(1)}MB total`)
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
const ORDER = { FAIL: 0, WARN: 1, INFO: 2 }
findings.sort((a, b) => ORDER[a.level] - ORDER[b.level] || a.area.localeCompare(b.area))

if (JSON_OUT) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), findings }, null, 2))
} else {
  const counts = findings.reduce((a, f) => ((a[f.level] = (a[f.level] || 0) + 1), a), {})
  console.log(`\nPURPLE RAIN — repo audit  (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`)
  console.log(`${counts.FAIL || 0} FAIL · ${counts.WARN || 0} WARN · ${counts.INFO || 0} INFO\n`)
  let area = ''
  for (const f of findings) {
    if (f.area !== area) { area = f.area; console.log(`— ${area} —`) }
    console.log(`  [${f.level}] ${f.msg}`)
    if (f.detail) console.log(`         ${f.detail}`)
  }
  console.log('')
}

process.exit(findings.some((f) => f.level === 'FAIL') ? 1 : 0)
