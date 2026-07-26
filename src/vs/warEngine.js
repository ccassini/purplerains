/**
 * The siege simulation for /odysseyVS.
 *
 * THE LAW OF THE FIELD (mirrors the harbour's manifest law):
 *   - 1 soldier = 1,000,000 gas of block space per second. Exact, in the
 *     counters. Rendered figures are representation: 1 figure = FIGURES_PER
 *     soldiers, and the HUD says so.
 *   - Armies spawn per BLOCK, not on a smooth drip: every chain fields its
 *     block's worth of soldiers (gasLimit / 1M) each block time. Ethereum
 *     sorties rarely and massively; Base every two seconds; Monad four times
 *     a second off the ships. The cadence itself is the data.
 *   - Combat trades 1:1. Neither side gets a hidden multiplier; the front
 *     moves only because one side genuinely out-fields the other.
 *
 * Monad's sorties are driven by REAL blocks pushed from the live feed
 * (pushMonadBlock), each carrying its own gasLimit. A measured-cadence timer
 * covers feed gaps so the army never freezes on a dropped socket.
 */
import { createPixelSurface } from '../ship/pixel'
import { drawHoplites } from '../ship/hopliteRender'
import {
  MONAD_CHAIN, SOLDIER_GAS, FIGURES_PER, soldiersPerBlock, chainByKey,
} from './chains'
import {
  drawWarScene, gateX, SHORE_X, FIELD_TOP, FIELD_BOTTOM,
} from './troyScene'
import { mulberry32, seedFrom } from '../ship/rng'

/** Fraction of engaged pairs that fall per second, each side equally. */
const MELEE_RATE = 0.55
/** Front-line travel speed at total field dominance (px/s). */
const FRONT_SPEED = 26
/** Rendered figures per side before spawns hold as reserves. */
const MAX_FIGURES = 150
/** March speed of a figure to its rank (px/s). */
const MARCH_SPEED = 120
/** How far behind the front a figure still counts as standing in the press. */
const MELEE_REACH = 64
/** Seconds a falling figure takes to fade. */
const FALL_FADE = 0.3
const EMIT_MIN_MS = 140
/** Feed-gap tolerance before the measured-cadence timer covers Monad. */
const FEED_GAP = 2.5

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

/** Chain-dyed hoplite traits: one cached body per chain, colors from brand. */
function traitsForChain(chain, rnd) {
  const hex = chain.color.replace('#', '')
  const n = parseInt(hex, 16)
  const dim = (k) => '#' + [16, 8, 0]
    .map((s) => Math.max(0, Math.min(255, Math.floor(((n >> s) & 255) * k))).toString(16).padStart(2, '0'))
    .join('')
  return {
    hash: `vs-${chain.key}`,
    category: 'other',
    cloak: dim(0.42),
    cloakLit: dim(0.72),
    cloakSignal: chain.color,
    crest: chain.key === 'monad' ? 'tall' : 'low',
    crestColor: dim(0.9),
    blazon: 'boss',
    whale: false,
    priority: false,
    heavy: false,
    urgent: false,
    bob: rnd() * Math.PI * 2,
    rate: 0.8 + rnd() * 0.7,
    name: chain.name,
  }
}

export function createWarEngine(canvas) {
  const surface = createPixelSurface(canvas)

  let raf = 0
  let running = false
  let elapsed = 0
  let lastTs = 0
  let emitAccum = 0
  let onEmit = null

  const rnd = mulberry32(seedFrom('plain-of-ilion'))

  /** Exact ledgers, in soldiers (1M gas/s each). Floats; HUD rounds. */
  const monad = {
    chain: { ...MONAD_CHAIN },
    fielded: 0, fallen: 0, spawned: 0, blocks: 0, reserve: 0,
    timer: 0, lastLiveAt: -Infinity, traits: null, accFig: 0, deathDebt: 0,
  }
  /** @type {Array<object>} enemy musters keyed by chain */
  let troy = []

  /** @type {Array<object>} rendered figures (drawHoplites-compatible) */
  let figures = []
  /** @type {Array<object>} dust motes over deaths */
  let dust = []

  let frontX = 0
  let battleState = 'field'
  /** Chain-mark images for banners; loaded lazily, drawn once complete. */
  const logoCache = new Map()

  function logoFor(chain) {
    if (!chain?.logo || typeof Image === 'undefined') return null
    let img = logoCache.get(chain.key)
    if (!img) {
      img = new Image()
      img.src = chain.logo
      logoCache.set(chain.key, img)
    }
    return img
  }

  monad.traits = traitsForChain(MONAD_CHAIN, rnd)

  const shoreLine = () => SHORE_X + 26
  const gateLine = () => gateX(surface.width) - 14
  const midfield = () => (shoreLine() + gateLine()) / 2

  frontX = 0 // set on first frame when width is known

  function makeMuster(chain) {
    return {
      chain: { ...chain },
      fielded: 0, fallen: 0, spawned: 0, blocks: 0, reserve: 0,
      // Stagger first sorties so a freshly added wall does not fire in sync.
      timer: chain.blockTimeMs / 1000 * rnd(),
      traits: traitsForChain(chain, rnd),
      accFig: 0, deathDebt: 0,
    }
  }

  /** Replace the coalition roster; keeps musters whose chain stays. */
  function setRoster(keys) {
    const keep = new Map(troy.map((m) => [m.chain.key, m]))
    const next = []
    for (const key of keys) {
      if (key === 'monad') continue
      const held = keep.get(key)
      if (held) { next.push(held); keep.delete(key); continue }
      const chain = chainByKey(key)
      if (chain) next.push(makeMuster(chain))
    }
    // Musters leaving the field: their figures quit the plain.
    for (const gone of keep.values()) {
      for (const f of figures) {
        if (f.side === 'troy' && f.chainKey === gone.chain.key) f.dying = elapsed
      }
    }
    troy = next
    emit(true)
  }

  /** Refresh one chain's measured capacity (live RPC re-measure landed). */
  function updateChain(key, patch) {
    const m = key === 'monad' ? monad : troy.find((x) => x.chain.key === key)
    if (!m) return
    m.chain = { ...m.chain, ...patch }
    emit(true)
  }

  /** A REAL Monad block: sortie exactly its gas limit's worth of soldiers. */
  function pushMonadBlock(block) {
    const gasLimit = Number(block?.gasLimit) || monad.chain.gasLimit
    monad.lastLiveAt = elapsed
    monad.timer = 0
    sortie(monad, 'monad', gasLimit / SOLDIER_GAS)
  }

  function spawnFigure(m, side) {
    if (figures.filter((f) => f.side === side && !f.dying).length >= MAX_FIGURES) {
      m.reserve += FIGURES_PER
      return
    }
    const lane = FIELD_TOP + Math.floor(rnd() * (FIELD_BOTTOM - FIELD_TOP))
    const x = side === 'monad' ? SHORE_X - 10 + rnd() * 14 : gateX(surface.width) + 4 + rnd() * 10
    figures.push({
      state: 'queued',
      side,
      chainKey: m.chain.key,
      x, y: lane - 17,
      targetX: x,
      called: false,
      alpha: 1,
      rank: side === 'monad' ? 1 : 0,
      seat: 0,
      ship: null,
      path: null,
      dist: 0,
      pathLen: 0,
      traits: m.traits,
      order: rnd(),
      dying: 0,
      bornAt: elapsed,
    })
  }

  /** One block's worth of soldiers takes the field for muster `m`. */
  function sortie(m, side, soldiers) {
    m.fielded += soldiers
    m.spawned += soldiers
    m.blocks += 1
    m.accFig += soldiers / FIGURES_PER
    while (m.accFig >= 1) {
      m.accFig -= 1
      spawnFigure(m, side)
    }
  }

  /** Remove figures the ledger says have fallen: nearest the front dies. */
  function settleDeaths(m, side, kills) {
    // Only soldiers actually standing in the press may fall — a marcher half
    // way up the plain is not in the melee. Unpaid debt waits for the column
    // to arrive (an arrival under fire is exactly what a hot front looks
    // like), and is capped so a starved muster cannot bank an apocalypse.
    m.deathDebt = Math.min(40, m.deathDebt + kills / FIGURES_PER)
    while (m.deathDebt >= 1) {
      m.deathDebt -= 1
      let pick = null
      for (const f of figures) {
        if (f.side !== side || f.dying || f.chainKey !== m.chain.key) continue
        const d = side === 'monad' ? frontX - f.x : f.x - frontX
        if (d > MELEE_REACH) continue
        if (!pick || d < pick.d) pick = { f, d }
      }
      if (!pick) { m.deathDebt += 1; break }
      pick.f.dying = elapsed
      for (let i = 0; i < 3; i++) {
        dust.push({
          x: pick.f.x + 5, y: pick.f.y + 12,
          vx: (rnd() - 0.5) * 26, vy: -14 - rnd() * 18,
          life: 0.4 + rnd() * 0.3,
          color: i ? '#5a4468' : '#4a3560',
        })
      }
      // The fallen figure's slot goes to a reservist who marches in from the
      // spawn edge — the column from the ships (or the gate) never dries up.
      if (m.reserve >= FIGURES_PER) {
        m.reserve -= FIGURES_PER
        spawnFigure(m, side)
      }
    }
  }

  function update(dt) {
    if (!frontX) frontX = midfield()

    // ── sorties: every chain fields its block, on its own clock ─────────
    const liveFeedFresh = elapsed - monad.lastLiveAt < FEED_GAP
    if (!liveFeedFresh) {
      monad.timer += dt
      const period = monad.chain.blockTimeMs / 1000
      while (monad.timer >= period) {
        monad.timer -= period
        sortie(monad, 'monad', soldiersPerBlock(monad.chain))
      }
    }
    for (const m of troy) {
      m.timer += dt
      const period = m.chain.blockTimeMs / 1000
      while (m.timer >= period) {
        m.timer -= period
        sortie(m, 'troy', soldiersPerBlock(m.chain))
      }
    }

    // ── melee: 1:1 attrition where the lines touch ──────────────────────
    const troyFielded = troy.reduce((s, m) => s + m.fielded, 0)
    const engaged = Math.min(monad.fielded, troyFielded)
    const kills = engaged * MELEE_RATE * dt
    if (kills > 0) {
      monad.fielded = Math.max(0, monad.fielded - kills)
      monad.fallen += kills
      settleDeaths(monad, 'monad', kills)
      // The coalition shares its losses in proportion to its presence.
      for (const m of troy) {
        const share = m.fielded / troyFielded
        const loss = kills * share
        m.fielded = Math.max(0, m.fielded - loss)
        m.fallen += loss
        settleDeaths(m, 'troy', loss)
      }
    }

    // ── the front: pushed by genuine numerical surplus only ─────────────
    const total = monad.fielded + troyFielded
    if (total > 1) {
      const pressure = (monad.fielded - troyFielded) / total
      frontX = clamp(frontX + pressure * FRONT_SPEED * dt, shoreLine(), gateLine())
    }
    battleState = frontX >= gateLine() - 8 ? 'walls'
      : frontX <= shoreLine() + 8 ? 'shore' : 'field'

    // ── figures: march to rank, brace at the line, fall when told ───────
    let mi = 0
    let ti = 0
    for (const f of figures) {
      if (f.dying) {
        f.alpha -= dt / FALL_FADE
        continue
      }
      const idx = f.side === 'monad' ? mi++ : ti++
      const col = Math.floor(idx / 10)
      const gap = 7 + (idx % 3)
      f.targetX = f.side === 'monad'
        ? frontX - 8 - col * gap - f.order * 4
        : frontX + 8 + col * gap + f.order * 4
      const dx = f.targetX - f.x
      const step = MARCH_SPEED * dt
      if (Math.abs(dx) > step) f.x += Math.sign(dx) * step
      else f.x = f.targetX
      // Front two columns brace for the melee; the press behind stands.
      f.called = col < 2 && Math.abs(f.x - f.targetX) < 2
    }
    figures = figures.filter((f) => !(f.dying && f.alpha <= 0))

    for (let i = dust.length - 1; i >= 0; i--) {
      const p = dust[i]
      p.life -= dt
      if (p.life <= 0) { dust.splice(i, 1); continue }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 30 * dt
    }
  }

  function draw() {
    // The pixel surface composes into an internal buffer: size it to the
    // viewport first, present it to the visible canvas after.
    surface.resize()
    const { ctx, width } = surface
    drawWarScene(ctx, width, elapsed, {
      frontX,
      banners: troy.map((m) => ({ color: m.chain.color, img: logoFor(m.chain) })),
      monadImg: logoFor(monad.chain),
    })
    drawHoplites(ctx, figures, elapsed)
    for (const p of dust) {
      ctx.fillStyle = p.color
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2)
    }
    surface.present()
  }

  function emit(force = false) {
    if (!onEmit) return
    const now = performance.now()
    if (!force && now - emitAccum < EMIT_MIN_MS) return
    emitAccum = now
    onEmit(snapshot())
  }

  function snapshot() {
    const troyGas = troy.reduce((s, m) => s + m.chain.gasPerSecM, 0)
    const span = gateLine() - shoreLine()
    return {
      state: battleState,
      frontPct: span > 0 ? (frontX - shoreLine()) / span : 0.5,
      figuresPer: FIGURES_PER,
      monad: {
        key: 'monad',
        name: monad.chain.name,
        color: monad.chain.color,
        tag: monad.chain.tag,
        gasPerSecM: monad.chain.gasPerSecM,
        soldiersPerSec: monad.chain.gasPerSecM,
        fielded: Math.round(monad.fielded),
        fallen: Math.round(monad.fallen),
        blocks: monad.blocks,
        reserve: Math.round(monad.reserve),
        method: monad.chain.method,
        live: elapsed - monad.lastLiveAt < FEED_GAP,
      },
      troy: {
        gasPerSecM: troyGas,
        fielded: Math.round(troy.reduce((s, m) => s + m.fielded, 0)),
        fallen: Math.round(troy.reduce((s, m) => s + m.fallen, 0)),
        chains: troy.map((m) => ({
          key: m.chain.key,
          name: m.chain.name,
          color: m.chain.color,
          tag: m.chain.tag,
          kind: m.chain.kind,
          gasPerSecM: m.chain.gasPerSecM,
          blockTimeMs: m.chain.blockTimeMs,
          fielded: Math.round(m.fielded),
          fallen: Math.round(m.fallen),
          blocks: m.blocks,
          method: m.chain.method,
        })),
      },
    }
  }

  function frame(ts) {
    if (!running) return
    const rawDt = lastTs ? (ts - lastTs) / 1000 : 0
    lastTs = ts
    // Same fixed-step law as the harbour: sim time equals wall time down to
    // 4fps, and one long frame can never leap the simulation.
    let remaining = Math.min(0.25, rawDt)
    while (remaining > 1e-6) {
      const step = Math.min(0.05, remaining)
      remaining -= step
      elapsed += step
      update(step)
    }
    draw()
    emit()
    raf = requestAnimationFrame(frame)
  }

  return {
    start() {
      if (running) return
      running = true
      lastTs = 0
      raf = requestAnimationFrame(frame)
    },
    stop() {
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    },
    setRoster,
    updateChain,
    pushMonadBlock,
    snapshot,
    set onEmit(cb) { onEmit = cb },
    /** Test hook: advance the sim without rAF. */
    __step(dt) {
      let remaining = dt
      while (remaining > 1e-6) {
        const step = Math.min(0.05, remaining)
        remaining -= step
        elapsed += step
        update(step)
      }
    },
  }
}
