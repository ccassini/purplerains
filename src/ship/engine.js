/**
 * Harbour engine: simulation, render loop and the API the page talks to.
 *
 * Nine berths abreast on the quay edge. Soldiers wait on the pier like a
 * mempool. Blocks enter from deep water and angle up to their berth. Overflow
 * passes through open water with its own crew when the apron is full.
 */
import { createPixelSurface, PAL } from './pixel'
import { hopliteFromTx, shipFromBlock, seatOffsetNative, SHIP_NATIVE_W, SHIP_NATIVE_H } from './sprites'
import { planShipLoad } from './capacity'
import { rankFor, pickQueued, RANK_NAMES } from './ranks'
import { ABILITY_CARDS_BY_RANK } from './abilities'
import { updateMotes, clearMotes } from './motes'
import { projectBreakdown } from '../utils/monadContracts'
import { speciesFor, seaLifeSprite, separatePod, SEA_LIFE_SIZE, SPECIES_LABEL } from './seaLife'
import {
  BERTH_COUNT, LANES, QUAY_FEET_Y, FLEET_Y, PASS_Y, SEA_Y, PIER_Y,
  berthX, berthY, rampTopX,
  queueStartX, shipFigureScale,
  drawSky, drawSea, drawFarShips, drawQuay, drawQuayProps, drawTemple,
  drawShips, drawGangplank, drawVignette,
  HOPLITE_W, HOPLITE_H, SHIP_W, SHIP_H,
} from './harborScene'
import { drawHoplites } from './hopliteRender'

/** Quay muster — mempool on the pier; soldiers wait, they do not evaporate. */
const MAX_QUEUE = 96

/**
 * Token bucket for the quay. Sized so a busy mempool can actually stage onto
 * the apron instead of skipping straight past the harbour.
 */
const INTAKE_PER_SEC = 36
const INTAKE_BURST = 64
/** Blocks waiting for a berth — prefer the apron over open-water pass. */
const PENDING_BLOCKS_MAX = 36
/**
 * Queue depth beyond which the oldest blocks are folded straight into the
 * sailed count. 24 blocks is ~8 seconds of live cadence — the most backlog
 * the eye can watch drain without the harbour reading as a cartoon flood.
 */
const CATCHUP_DEPTH = 24
/**
 * Monad seals ~3 blocks/s (~330ms). Live feed often delivers a burst of three
 * in one React commit — releasing them all at once made a convoy of three.
 * Pace the harbour near live block time; accelerate when the queue falls behind.
 */
const BLOCK_INTERVAL = 0.30
/** Catch-up when the queue is deep — still never dump a whole burst in one frame. */
const BLOCK_INTERVAL_MIN = 0.10
/** Clear space a pass-through lane needs before another hull launches. */
const LANE_GAP = 36

/**
 * Approach and departure are paced for a wide harbour: ships cross most of the
 * screen before they moor or leave, so the fleet reads as a procession rather
 * than a blink of hulls.
 */
const APPROACH_SPEED = 265
const PASS_SPEED = 72
/** Distant fleet lane drifts slower so the back of the sea stays full. */
const FLEET_SPEED = 52
const PASS_NEAR_SPEED = 88
/** Distance before the berth over which an arrival angles in to the quay. */
const TURN_IN = 160
const DEPART_ACCEL = 44
const DEPART_SPEED_MAX = 88
/**
 * Horizontal run a departing ship takes to settle onto its exit lane.
 * Long on purpose — the peel-away is part of the on-screen life of the hull.
 */
const DEPART_RUN = 100
/** Gangplank run-out and haul-in — boarding waits until this finishes. */
const PLANK_SECONDS = 0.3
/**
 * Clear water (buffer px) an inbound keeps behind a ship still on the berth.
 * Relief idles on the fairway instead of ramming the moored hull.
 */
const BERTH_WAIT_GAP = 18
/**
 * Keep hulls alongside long enough that the front row usually shows all
 * MIN_ALONGSIDE ships loading at once — nine abreast.
 */
const MIN_ALONGSIDE = 9
const MIN_DWELL = 0.85
/** After seal, wait this long for any last leaps before casting off. */
const STRAGGLER_GRACE = 0.3
/**
 * Leap interval while moored. A deck of ~8 seats fills in under a third of a
 * second — matching a block that arrives before the previous one has left.
 */
const BOARD_INTERVAL = 0.04
/** Arc length per second along a leap path (quay → seat). */
const LEAP_SPEED = 200
/**
 * Mempool life on the quay. Soldiers wait for their block; they only walk off
 * when the harbour truly has nothing for them.
 */
const QUAY_LIFE = 12
const LEAVE_SPEED = 28
const LEAVE_FADE = 1.0
/** Seconds a soldier fades onto a seat when placed directly aboard. */
const ABOARD_FADE = 0.22
/**
 * Only soldiers this close (buffer px) to the berth's plank head may leap.
 * Wide enough that the packed muster along the apron can reach any column.
 */
const NEAR_PLANK = 52
/**
 * How far down the quay a called soldier will march to reach its plank.
 * Bounded by what is walkable inside a long dwell (LEAP_SPEED x ~1.6s), so a
 * marcher can never hold a berth past the unconditional seal.
 */
const MARCH_REACH = 320
/** Standing room on the after deck: four ranks of four. */
const DECK_MAX = 20

export function createShipEngine(canvas) {
  const surface = createPixelSurface(canvas)

  /** @type {Array<object>} */
  let hoplites = []
  /** @type {Array<object>} ships rowing through the open lanes */
  let ships = []
  /**
   * Every ship assigned to a berth, in any state: running down the fairway,
   * holding behind a moored hull, lying alongside, or pulling away. A slot can
   * hold two at once — the ship on the berth and its relief waiting clear
   * water behind — keyed by `slot` rather than one ship per berth.
   * @type {Array<object>}
   */
  let berthShips = []
  /**
   * Sealed blocks waiting to appear, in chain order. `pushVessel` only enqueues;
   * `releaseNext` opens one hull per release tick so a 3-block React burst
   * never becomes three ships in the same frame.
   * @type {Array<object>}
   */
  let blockQueue = []
  /** @type {Array<object>} blocks waiting for a free pass lane */
  let pending = []
  let lastReleaseAt = -999
  const byHash = new Map()

  let laneCursor = 0
  let sailed = 0
  let ashore = 0
  // The altar's ledger: MON destroyed by base fees, per block and cumulative.
  let burnedSession = 0
  let burnedLast = 0
  let burnGlow = 0
  let burnRef = 0
  let blocksSeen = 0
  let skipped = 0
  let fastForwarded = 0
  let latestBlock = null
  let hovered = null
  let pinned = null
  let hoveredShip = null
  let pinnedShip = null
  /**
   * Bridge arrivals crossing the open water above the mole. Capped: the pod is
   * scenery for a live feed, not a backlog to replay.
   * @type {Array<object>}
   */
  let seaLife = []
  let hoveredLife = null
  let pinnedLife = null
  const seenInflows = new Set()

  let intakeTokens = INTAKE_BURST

  // Rolling gas sample, used to decide which hoplites are rare.
  const gasWindow = []
  let gasHigh = 0
  let gasTop = 0
  let sinceGasRecalc = 0

  const listeners = new Set()
  let raf = 0
  let lastTs = 0
  let elapsed = 0
  let running = false
  const pointer = { x: -999, y: -999, inside: false }

  function recordGas(value) {
    const gas = Number(value)
    if (!Number.isFinite(gas) || gas <= 0) return
    gasWindow.push(gas)
    if (gasWindow.length > 240) gasWindow.shift()
    // Sorting on every transaction would be wasteful; the percentiles only
    // need to track the chain, not each individual sample.
    if (++sinceGasRecalc < 24 && gasHigh > 0) return
    sinceGasRecalc = 0
    const sorted = [...gasWindow].sort((a, b) => a - b)
    const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
    gasHigh = at(0.9)
    gasTop = Math.max(at(0.99), gasHigh * 1.6)
  }

  /**
   * Muster along the berth apron. Fixed origin + fixed spacing so targets only
   * ever slide forward when someone leaves — stretching the line to fill the
   * pier (or chasing whichever plank is boarding) made soldiers walk back and
   * forth.
   */
  function layoutQueue() {
    const w = surface.width
    const start = queueStartX(w)
    const step = HOPLITE_W + 1
    const queued = hoplites
      .filter((h) => h.state === 'queued')
      .sort((a, b) => a.bornAt - b.bornAt || (a.hash < b.hash ? -1 : 1))
    queued.forEach((h, i) => {
      const slot = start + i * step
      // New arrivals still off the right edge take the slot as-is. Anyone
      // already on the quay may only advance (lower x), never retreat.
      if (h.x > w - HOPLITE_W) h.targetX = slot
      else h.targetX = Math.min(h.targetX, slot)
    })
  }

  function queuedCount() {
    let n = 0
    for (const h of hoplites) if (h.state === 'queued') n++
    return n
  }

  function pushMon(tx) {
    if (!tx?.hash || byHash.has(tx.hash)) return
    recordGas(tx.gasPrice)
    // Two gates, both of which simply decline to stage the transaction. Letting
    // it on and then throwing it off again is what produced figures dropping
    // through the quay, and at this arrival rate it fired constantly.
    if (intakeTokens < 1 || queuedCount() >= MAX_QUEUE) { skipped++; return }
    intakeTokens -= 1

    const enterX = surface.width + HOPLITE_W + 2
    const traits = hopliteFromTx(tx.hash, { ...tx, gasHigh, gasTop })
    const hoplite = {
      hash: tx.hash,
      traits,
      rank: rankFor(traits, false),
      called: false,
      guttering: false,
      gutterLeft: QUAY_LIFE,
      state: 'queued',
      // Always march in from off the right edge — never pop onto the quay.
      x: enterX,
      y: QUAY_FEET_Y,
      targetX: enterX,
      bornAt: elapsed,
      alpha: 1,
      ship: null,
      seat: 0,
      path: null,
      dist: 0,
      pathLen: 0,
    }
    hoplites.push(hoplite)
    byHash.set(tx.hash, hoplite)
    layoutQueue()
  }

  /** Ship lying alongside (or still clearing) berth `i`, if any. */
  function slotHolder(i) {
    return berthShips.find((s) => s.slot === i && s.dock !== 'approach') || null
  }

  /** Ship already on its way in to berth `i`, if any. */
  function slotInbound(i) {
    return berthShips.find((s) => s.slot === i && s.dock === 'approach') || null
  }

  /**
   * X just past the right edge. Park behind any hull that is still entering so
   * arrivals do not overlap — but never stack them into the next postcode;
   * a full berth burst used to push the last ship a thousand pixels off-screen.
   */
  function offscreenEntryX() {
    let x = surface.width + 8
    for (const s of [...ships, ...berthShips]) {
      if (s.x > surface.width - SHIP_W) {
        x = Math.max(x, s.x + SHIP_W + 14)
      }
    }
    // Cap so a burst cannot shove a hull out of reach of the live release pace.
    return Math.min(x, surface.width + SHIP_W * 3 + 40)
  }

  /** Ships actually lying alongside (loading or about to cast off). */
  function alongsideCount() {
    let n = 0
    for (const s of berthShips) {
      if (s.dock === 'moored' || s.dock === 'casting') n++
    }
    return n
  }

  /**
   * Give the block a berth if one can take it, otherwise hold it for later.
   *
   * Fill empty slots first so the apron reaches MIN_ALONGSIDE. Stack a relief
   * behind a moored hull only after that — no forced trio, no early seal.
   */
  function assignBerth(block) {
    for (let i = 0; i < BERTH_COUNT; i++) {
      if (!slotInbound(i) && !slotHolder(i)) { openBerth(block, i); return true }
    }
    // Keep stacking reliefs so the next wave is already coming from behind,
    // but never starve empty slots (handled above).
    let best = null
    for (let i = 0; i < BERTH_COUNT; i++) {
      if (slotInbound(i)) continue
      const held = slotHolder(i)
      if (!held) continue
      if (held.dock !== 'moored' && held.dock !== 'casting') continue
      if (!best || held.mooredAt < best.mooredAt) best = held
    }
    if (!best) return false
    openBerth(block, best.slot)
    return true
  }

  function hasOpenBerth() {
    for (let i = 0; i < BERTH_COUNT; i++) {
      if (!slotInbound(i) && !slotHolder(i)) return true
    }
    for (let i = 0; i < BERTH_COUNT; i++) {
      if (slotInbound(i)) continue
      const held = slotHolder(i)
      if (held && (held.dock === 'moored' || held.dock === 'casting')) return true
    }
    return false
  }

  /** Release spacing tightens under backlog so the tip of the chain is not orphaned. */
  function releaseInterval() {
    const n = blockQueue.length
    if (n >= 8) return 0.06
    if (n >= 5) return BLOCK_INTERVAL_MIN
    if (n >= 3) return 0.16
    if (n >= 2) return 0.22
    return BLOCK_INTERVAL
  }

  function launchPass(block) {
    for (let j = 0; j < LANES.length; j++) {
      const lane = LANES[(laneCursor + j) % LANES.length]
      const tail = laneTail(lane)
      if (tail && tail.x > surface.width - SHIP_W - LANE_GAP) continue
      laneCursor = (laneCursor + j + 1) % LANES.length
      const ship = makeShip(block, lane, 'pass')
      ship.x = offscreenEntryX()
      ships.push(ship)
      fillDeck(ship)
      return true
    }
    // Lanes tight: still place the hull. Overlap beats stalling behind the tip.
    const lane = LANES[laneCursor % LANES.length]
    laneCursor = (laneCursor + 1) % LANES.length
    const ship = makeShip(block, lane, 'pass')
    ship.x = offscreenEntryX()
    ships.push(ship)
    fillDeck(ship)
    return true
  }

  /**
   * Place the next sealed block on screen. Always release on the block-time
   * interval — never stall waiting for the apron to fill. Berth when possible;
   * otherwise pass through open water so ship spawn tracks the live tip.
   */
  function releaseNext() {
    if (!blockQueue.length && pending.length) {
      blockQueue.push(pending.shift())
    }
    if (!blockQueue.length) return

    // Deep backlog: allow a short same-frame burst so a quiet tab / long dwell
    // cannot leave the harbour permanently behind the chain.
    const budget = blockQueue.length >= 8 ? 3 : blockQueue.length >= 4 ? 2 : 1
    for (let n = 0; n < budget; n++) {
      if (!blockQueue.length) break
      // First hull of the frame respects the release interval; further ones
      // only fire when the budget says we are catching up (same frame).
      if (n === 0 && elapsed - lastReleaseAt < releaseInterval()) break

      const block = blockQueue.shift()
      lastReleaseAt = elapsed
      if (hasOpenBerth()) {
        if (!assignBerth(block)) launchPass(block)
      } else {
        launchPass(block)
      }
    }
  }

  function pushVessel(block) {
    if (!block?.number) return
    latestBlock = block
    blocksSeen++
    const burned = Math.max(0, Number(block.burnedMon) || 0)
    if (burned > 0) {
      burnedSession += burned
      burnedLast = burned
      // The altar flares with the offering: normalized against a running
      // reference so the pulse stays meaningful as fees move.
      burnRef = Math.max(burned, burnRef * 0.995)
      burnGlow = Math.min(1, 0.35 + 0.65 * (burnRef > 0 ? burned / burnRef : 0))
    }
    blockQueue.push(block)
    // Deep backlog (hidden tab, feed burst): the oldest blocks already sailed
    // in the real world — record them as sailed and keep the visible queue at
    // a depth the harbour can stage at live cadence. Nothing is lost silently:
    // `sailed` moves, and the HUD block number stays truthful throughout.
    while (blockQueue.length > CATCHUP_DEPTH) {
      blockQueue.shift()
      sailed++
      fastForwarded++
    }
    emit()
  }

  /** Deepest and shallowest the pod may swim: clear water above the quay. */
  const LIFE_TOP = SEA_Y + 3
  const LIFE_BOTTOM = PIER_Y - 3
  const LIFE_MAX = 14
  /**
   * Swim lines across the open water. Three is what the band between the
   * horizon and the quay can hold without a whale hanging off either end, and
   * consecutive arrivals take different lines so a pair can never enter nose to
   * nose on the same row.
   */
  const LIFE_LANES = 3
  /** Clear water an entering creature keeps behind the one already off-screen. */
  const LIFE_GAP = 14
  let lifeLane = 0

  /** Top of swim line `lane`, clamped so nothing hangs below the quay. */
  function lifeLaneY(h, lane) {
    const step = Math.floor((LIFE_BOTTOM - LIFE_TOP) / LIFE_LANES)
    return Math.min(LIFE_BOTTOM - h, LIFE_TOP + lane * step)
  }

  /**
   * X just past the right edge, parked behind anything still entering.
   *
   * A poll returns a whole batch of settled transfers and the page stages them
   * in one pass, so without this every creature in the batch enters on the same
   * column and they swim the harbour as one overlapping clump.
   */
  function lifeEntryX() {
    let x = surface.width + 4
    for (const a of seaLife) {
      if (a.x > surface.width - a.w) x = Math.max(x, a.x + a.w + LIFE_GAP)
    }
    return x
  }

  /**
   * Stage one bridge inflow as a creature. Species comes from the USD landed;
   * bigger animals swim slower and deeper, so a whale reads as heavy.
   */
  function pushInflow(inflow) {
    const id = inflow?.id ? String(inflow.id).toLowerCase() : ''
    if (!id || seenInflows.has(id)) return false
    // Cap before marking seen so a full harbour can still stage this id later.
    if (seaLife.length >= LIFE_MAX) return false
    seenInflows.add(id)
    if (seenInflows.size > 2000) {
      const first = seenInflows.values().next().value
      seenInflows.delete(first)
    }

    const species = speciesFor(inflow.usd)
    const size = SEA_LIFE_SIZE[species]
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
    const lane = lifeLane
    lifeLane = (lifeLane + 1) % LIFE_LANES
    seaLife.push({
      ...inflow,
      id,
      species,
      w: size.w,
      h: size.h,
      x: lifeEntryX(),
      y: lifeLaneY(size.h, lane),
      // Whales lumber, dolphins dart.
      speed: species === 'whale' ? 26 : species === 'orca' ? 34 : 46,
      phase: (h % 100) / 100 * Math.PI * 2,
      bornAt: elapsed,
    })
    emit()
    return true
  }

  function updateSeaLife(dt) {
    for (let i = seaLife.length - 1; i >= 0; i--) {
      const a = seaLife[i]
      a.x -= a.speed * dt
      if (a.x < -a.w - 8) {
        if (pinnedLife === a) pinnedLife = null
        if (hoveredLife === a) hoveredLife = null
        seaLife.splice(i, 1)
      }
    }

    separatePod(seaLife, LIFE_GAP)
  }

  function drawSeaLife(ctx, t) {
    for (const a of seaLife) {
      // Two-frame swim, plus a slow rise and fall through the swell.
      const frame = Math.floor(t * 3 + a.phase) & 1
      const bob = Math.round(Math.sin(t * 0.9 + a.phase) * 1.5)
      ctx.drawImage(seaLifeSprite(a.species, frame), Math.round(a.x), Math.round(a.y) + bob)
    }
    const focus = pinnedLife || hoveredLife
    if (focus) {
      const bob = Math.round(Math.sin(t * 0.9 + focus.phase) * 1.5)
      const bx = Math.round(focus.x) - 2
      const by = Math.round(focus.y) + bob - 2
      const bw = focus.w + 4
      const bh = focus.h + 4
      ctx.fillStyle = PAL.gold
      ctx.fillRect(bx, by, 3, 1); ctx.fillRect(bx, by, 1, 3)
      ctx.fillRect(bx + bw - 3, by, 3, 1); ctx.fillRect(bx + bw - 1, by, 1, 3)
      ctx.fillRect(bx, by + bh - 1, 3, 1); ctx.fillRect(bx, by + bh - 3, 1, 3)
      ctx.fillRect(bx + bw - 3, by + bh - 1, 3, 1); ctx.fillRect(bx + bw - 1, by + bh - 3, 1, 3)
    }
  }

  /** Creature under the cursor, nearest first. */
  function pickLifeAt(bx, by) {
    for (let i = seaLife.length - 1; i >= 0; i--) {
      const a = seaLife[i]
      if (bx >= a.x - 2 && bx <= a.x + a.w + 2 && by >= a.y - 4 && by <= a.y + a.h + 4) return a
    }
    return null
  }

  function makeShip(block, y, role, slot = -1) {
    // Hull size, deck capacity and crew all come from one pure plan, so the
    // painted ship can never disagree with the gauge. A 0-tx block sails
    // empty instead of the old `tx || DECK_MAX` full-deck artefact.
    const plan = planShipLoad(block)
    const fillPct = Math.max(0, Number(block.fillPct) || 0)
    let recruits = Array.isArray(block.recruits) ? block.recruits.filter((r) => r?.hash) : []
    if (!recruits.length && Array.isArray(block.hashes)) {
      recruits = block.hashes.filter(Boolean).map((hash) => ({ hash }))
    }
    return {
      number: block.number,
      hash: block.hash,
      traits: shipFromBlock(block, plan.size),
      capacity: Math.min(DECK_MAX, plan.capacity),
      load: Math.min(DECK_MAX, plan.load),
      txCount: plan.txCount,
      fillPct,
      role,
      slot,
      dock: role === 'berth' ? 'approach' : 'pass',
      plank: 0,
      boarding: false,
      mooredAt: 0,
      sealedAt: 0,
      lastBoardAt: -1,
      speed: role === 'berth' ? APPROACH_SPEED : (y <= FLEET_Y + 4 ? FLEET_SPEED : y <= PASS_Y + 4 ? PASS_SPEED : PASS_NEAR_SPEED),
      rowing: true,
      x: offscreenEntryX(),
      y,
      phase: (Number(block.number) % 12) * 0.5,
      passengers: [],
      /* The block's own crew list, attached by the feed at fetch time. The
         manifest is the boarding LAW: nobody whose hash is outside it may
         board this hull. Recruits carry value/gas so rank derivation works. */
      recruits,
      recruitCursor: 0,
      burnedMon: Math.max(0, Number(block.burnedMon) || 0),
      manifest: new Set([
        ...(Array.isArray(block.hashes) ? block.hashes.filter(Boolean) : []),
        ...recruits.map((r) => r.hash),
      ]),
    }
  }

  /**
   * Seat a recruit directly on deck (no quay march). Pass-through hulls and
   * seal top-ups use this so every ship with txs carries its guard.
   */
  function placeRecruitAboard(ship) {
    if (ship.passengers.length >= ship.load) return false
    while (ship.recruitCursor < ship.recruits.length) {
      const r = ship.recruits[ship.recruitCursor++]
      if (!r?.hash || byHash.has(r.hash)) continue
      const seatIdx = ship.passengers.length
      const seat = seatPosition(ship, seatIdx)
      const h = {
        hash: r.hash,
        traits: hopliteFromTx(r.hash, { ...r, gasHigh, gasTop }),
        rank: 0,
        called: true,
        guttering: false,
        gutterLeft: QUAY_LIFE,
        state: 'aboard',
        x: seat.x,
        y: seat.y,
        targetX: seat.x,
        bornAt: elapsed,
        alpha: 1,
        ship,
        seat: seatIdx,
        path: null,
        dist: 0,
        pathLen: 0,
      }
      h.rank = rankFor(h.traits, false)
      ship.passengers.push(h)
      hoplites.push(h)
      byHash.set(r.hash, h)
      return true
    }
    return false
  }

  /** Fill empty seats from the block's recruit list up to `load`. */
  function fillDeck(ship) {
    while (ship.passengers.length < ship.load) {
      if (!placeRecruitAboard(ship)) break
    }
  }

  function openBerth(block, slot) {
    // Blocks arrive from deep water (behind), then angle up to their berth —
    // not spawned on the fairway mid-harbour.
    const ship = makeShip(block, FLEET_Y, 'berth', slot)
    ship.x = offscreenEntryX()
    ship.y = FLEET_Y
    berthShips.push(ship)
  }

  /**
   * Seal with whatever live crew actually boarded. Never invent passengers —
   * empty seats are unused capacity from the real block.
   */
  function seal(ship) {
    // Explicit re-seal guard: `sealedAt` is a timestamp that can legitimately be
    // 0 on the first frame, so test boarding state rather than its truthiness —
    // re-sealing would restart the straggler grace and delay casting off.
    if (!ship.boarding) return
    // Backstop: the paced muster normally finishes before any seal path can
    // fire; a relief-rushed seal tops up the guard from the block's own list.
    fillDeck(ship)
    // The block is sealed: any of its soldiers still waiting missed the sailing.
    // A real mempool drops a sealed transaction — they walk, at chain rate.
    for (const q of hoplites) {
      if (q.state === 'queued' && ship.manifest.has(q.hash)) { q.state = 'leaving'; ashore++ }
    }
    ship.boarding = false
    ship.sealedAt = elapsed
  }

  /**
   * Furthest-right vessel in a lane, or null when the lane is empty. Ships
   * still running in to a berth count: they use the fairway too, and a block
   * launched on top of one draws straight through its hull.
   */
  function laneTail(lane) {
    let tail = null
    for (const s of [...ships, ...berthShips]) {
      if (Math.abs(s.y - lane) > 18) continue
      if (!tail || s.x > tail.x) tail = s
    }
    return tail
  }

  /** Drain pass-lane pending whenever a lane is clear — at most one per frame. */
  function launchPending() {
    if (!pending.length) return
    if (launchPass(pending[0])) pending.shift()
  }

  function seatPosition(ship, index) {
    const { dx, dy } = seatOffsetNative(ship.load, index)
    const sc = shipFigureScale(ship.y)
    const kx = ship.x + SHIP_W / 2
    const ky = ship.y + SHIP_H
    return {
      x: kx + (dx - SHIP_NATIVE_W / 2) * sc,
      y: ky + (dy - SHIP_NATIVE_H) * sc,
    }
  }

  /** Build a short leap arc from the quay onto a deck seat. */
  function leapPath(fromX, fromY, seat) {
    const midX = (fromX + seat.x) * 0.5
    const midY = Math.min(fromY, seat.y) - 10
    return [
      { x: fromX, y: fromY },
      { x: midX, y: midY },
      { x: seat.x, y: seat.y },
    ]
  }

  function pathLength(path) {
    let len = 0
    for (let i = 1; i < path.length; i++) {
      len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
    }
    return len
  }

  /**
   * Put one real quay soldier onto the ship via a leap — only if they are
   * already near this berth's plank. Never invent crew; empty seats stay empty.
   */
  function leapOne(ship) {
    if (ship.passengers.length >= ship.load) return false

    const ramp = rampTopX(surface.width, ship.slot)
    // THE RULE: only this block's own transactions board this hull. Quay
    // soldiers whose hash is in the manifest go first (the mempool->block
    // story); the rest of the guard musters from the block's recruit list.
    const h = pickQueued(hoplites, ship.manifest, (q) => Math.abs(q.x - ramp) <= NEAR_PLANK)
    if (h) {
      const seat = seatPosition(ship, ship.passengers.length)
      h.state = 'leaping'
      h.ship = ship
      h.seat = ship.passengers.length
      ship.passengers.push(h)
      h.path = leapPath(h.x, h.y, seat)
      h.dist = 0
      h.pathLen = pathLength(h.path)
      layoutQueue()
      return true
    }
    return musterRecruit(ship)
  }

  /**
   * Muster one of the block's own transactions that never reached the quay:
   * a real hash from the recruit list enters at the plank head and boards.
   * Never invents a hash — if the feed gave no recruits, the deck stays
   * underfilled, honestly.
   */
  function musterRecruit(ship) {
    while (ship.recruitCursor < ship.recruits.length) {
      const r = ship.recruits[ship.recruitCursor++]
      if (!r?.hash || byHash.has(r.hash)) continue
      const ramp = rampTopX(surface.width, ship.slot)
      const seatIdx = ship.passengers.length
      const seat = seatPosition(ship, seatIdx)
      const startX = ramp + 18
      const h = {
        hash: r.hash,
        traits: hopliteFromTx(r.hash, { ...r, gasHigh, gasTop }),
        rank: 0,
        called: true,
        guttering: false,
        gutterLeft: QUAY_LIFE,
        state: 'marching',
        x: startX,
        y: QUAY_FEET_Y,
        targetX: startX,
        bornAt: elapsed,
        alpha: 1,
        ship,
        seat: seatIdx,
        path: null,
        dist: 0,
        pathLen: 0,
      }
      h.rank = rankFor(h.traits, false)
      // Short walk to the plank head, then the leap arc onto the seat.
      const plankX = ramp + 4
      h.path = [
        { x: startX, y: QUAY_FEET_Y },
        { x: plankX, y: QUAY_FEET_Y },
        ...leapPath(plankX, QUAY_FEET_Y, seat).slice(1),
      ]
      h.pathLen = pathLength(h.path)
      ship.passengers.push(h)
      hoplites.push(h)
      byHash.set(r.hash, h)
      return true
    }
    return false
  }


  /** Position along a polyline at arc length `d`. */
  function pointAt(path, d) {
    let left = d
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]
      const b = path[i]
      const seg = Math.hypot(b.x - a.x, b.y - a.y)
      if (left <= seg || i === path.length - 1) {
        const k = seg > 0 ? Math.min(1, left / seg) : 1
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
      }
      left -= seg
    }
    return path[path.length - 1]
  }

  function updateBerths(dt) {
    const w = surface.width
    for (let i = berthShips.length - 1; i >= 0; i--) {
      const s = berthShips[i]
      const target = berthX(w, s.slot)
      const dockY = berthY(s.slot)

      if (s.dock === 'approach') {
        const holder = slotHolder(s.slot)
        // Front ship still owns the berth — hold clear water behind it.
        const blocking = holder && (
          holder.dock === 'moored' ||
          holder.dock === 'casting' ||
          (holder.dock === 'away' && holder.x > target - 10)
        )
        let goalX = target
        if (blocking) {
          goalX = Math.max(target + SHIP_W + BERTH_WAIT_GAP, holder.x + SHIP_W + BERTH_WAIT_GAP)
        }

        const gap = s.x - goalX
        if (gap > 0.5) {
          const maxSp = blocking
            ? Math.min(APPROACH_SPEED, 110)
            : APPROACH_SPEED
          s.speed = Math.max(36, Math.min(maxSp, gap * 2.0))
          s.x -= s.speed * dt
          if (s.x < goalX) s.x = goalX
        } else {
          s.x = goalX
          s.speed = blocking ? 0 : s.speed
        }

        if (blocking) {
          // Idle in deep water behind the moored hull.
          const holdY = FLEET_Y + (dockY - FLEET_Y) * 0.15
          s.y += (holdY - s.y) * Math.min(1, dt * 2.4)
        } else {
          // Come up from the back of the sea into the berth. Smoothstep, so
          // the hull banks in and settles instead of riding a straight ramp.
          const kr = Math.max(0, Math.min(1, (TURN_IN - (s.x - target)) / TURN_IN))
          const k = kr * kr * (3 - 2 * kr)
          s.y = FLEET_Y + (dockY - FLEET_Y) * k
        }

        if (!blocking && s.x <= target + 0.5) {
          s.x = target
          s.y = dockY
          s.dock = 'moored'
          s.rowing = false
          s.mooredAt = elapsed
          s.boarding = true
          // Wait for the plank — no leap on the first moor frame.
          s.lastBoardAt = elapsed
          const ramp = rampTopX(surface.width, s.slot)
          for (const q of hoplites) {
            if (q.state !== 'queued' || !s.manifest.has(q.hash)) continue
            q.called = true
            const away = Math.abs(q.x - ramp)
            // Beyond leap range but walkable: assign the seat now and march.
            // `stillLeaping` counts marchers, so the seal waits for them.
            if (away > NEAR_PLANK && away <= MARCH_REACH && s.passengers.length < s.load) {
              const seatIdx = s.passengers.length
              const seat = seatPosition(s, seatIdx)
              const plankX = ramp + 4
              q.state = 'marching'
              q.ship = s
              q.seat = seatIdx
              q.path = [
                { x: q.x, y: QUAY_FEET_Y },
                { x: plankX, y: QUAY_FEET_Y },
                ...leapPath(plankX, QUAY_FEET_Y, seat).slice(1),
              ]
              q.dist = 0
              q.pathLen = pathLength(q.path)
              s.passengers.push(q)
            }
          }
          layoutQueue()
        }
      } else if (s.dock === 'moored') {
        s.y = dockY + Math.sin(elapsed * 1.1 + s.phase) * 0.6
        s.plank = Math.min(1, s.plank + dt / PLANK_SECONDS)

        const stillLeaping = s.passengers.some((h) => h.state === 'leaping' || h.state === 'marching')
        if (s.boarding) {
          if (s.plank >= 1 &&
              s.passengers.length < s.load &&
              elapsed - s.lastBoardAt >= BOARD_INTERVAL) {
            if (leapOne(s)) s.lastBoardAt = elapsed
          }
          // Stay alongside until the apron is populated. Relief may wait;
          // do not rush the front ship just to free a slot for a trio.
          const reliefWaiting = !!slotInbound(s.slot)
          const apronFull = alongsideCount() >= MIN_ALONGSIDE
          const dwellDone = elapsed - s.mooredAt >= MIN_DWELL + PLANK_SECONDS
          const longDwell = elapsed - s.mooredAt >= MIN_DWELL * 2.8 + PLANK_SECONDS
          if (s.passengers.length >= s.load && !stillLeaping && (apronFull || dwellDone)) seal(s)
          else if (s.plank >= 1 && !stillLeaping &&
              ((apronFull && dwellDone && (reliefWaiting || elapsed - s.lastBoardAt >= BOARD_INTERVAL * 3))
                || longDwell)) {
            seal(s)
          }
        } else if (!stillLeaping || elapsed - s.sealedAt > STRAGGLER_GRACE) {
          s.dock = 'casting'
        }
      } else if (s.dock === 'casting') {
        s.plank = Math.max(0, s.plank - dt / PLANK_SECONDS)
        if (s.plank <= 0) {
          s.dock = 'away'
          s.rowing = true
          s.speed = 28
          // Fan across depth lanes — only some hulls take the foreground.
          s.exitY = LANES[s.slot % LANES.length]
        }
      } else {
        s.speed = Math.min(DEPART_SPEED_MAX, s.speed + DEPART_ACCEL * dt)
        s.x -= s.speed * dt
        const exitY = s.exitY ?? PASS_Y
        const k = Math.min(1, (target - s.x) / DEPART_RUN)
        s.y = dockY + (exitY - dockY) * k
        if (k >= 1) {
          s.y = exitY
          berthShips.splice(i, 1)
          ships.push(s)
        }
      }
    }
  }

  function update(dt) {
    intakeTokens = Math.min(INTAKE_BURST, intakeTokens + INTAKE_PER_SEC * dt)
    releaseNext()
    launchPending()
    updateBerths(dt)
    updateMotes(dt)
    updateSeaLife(dt)
    burnGlow = Math.max(0, burnGlow - dt / 1.5)

    // Per-soldier mempool hold: a soldier waits past its quay life ONLY while
    // some inbound or moored hull actually carries its transaction. The old
    // global hold ("any hull needs crew") was near-permanent at 3 blocks/s and,
    // under manifest-law boarding, would pin the queue at MAX_QUEUE until
    // intake skipped every new transaction — a verified terminal state.
    const holdManifests = []
    for (const b of berthShips) {
      if (b.dock === 'approach' || b.dock === 'moored') holdManifests.push(b.manifest)
    }
    const heldByShip = (hash) => {
      for (const m of holdManifests) if (m.has(hash)) return true
      return false
    }

    for (let i = ships.length - 1; i >= 0; i--) {
      const s = ships[i]
      s.x -= (s.role === 'berth' ? DEPART_SPEED_MAX : (s.speed || PASS_SPEED)) * dt
      if (s.x < -SHIP_W - 40) {
        for (const p of s.passengers) {
          if (p.state !== 'gone') p.state = 'gone'
        }
        sailed++
        if (pinnedShip === s) pinnedShip = null
        if (hoveredShip === s) hoveredShip = null
        ships.splice(i, 1)
      }
    }

    for (const h of hoplites) {
      if (h.state === 'queued') {
        // Stable targets: ease toward the slot without overshooting into a
        // left-right wobble when layout reassigns by a pixel.
        const dx = h.targetX - h.x
        if (Math.abs(dx) < 0.4) h.x = h.targetX
        else h.x += dx * Math.min(0.28, dt * 4.5)
        h.y = QUAY_FEET_Y
        // Torch burndown, and it is only truthful because `needCrew` is false:
        // the flame gutters when the harbour genuinely has no berth wanting
        // crew, not merely because time passed.
        const held = heldByShip(h.hash)
        const left = QUAY_LIFE - (elapsed - h.bornAt)
        h.guttering = !held && left < 1.2
        h.gutterLeft = left
        if (left <= 0 && !held) { h.state = 'leaving'; ashore++ }
      } else if (h.state === 'leaving') {
        h.x -= LEAVE_SPEED * dt
        h.y = QUAY_FEET_Y
        h.alpha -= dt / LEAVE_FADE
        if (h.alpha <= 0) h.state = 'gone'
      } else if (h.state === 'leaping' || h.state === 'marching') {
        h.dist += LEAP_SPEED * dt
        if (h.dist >= h.pathLen) {
          h.state = 'aboard'
          h.alpha = 1
        } else {
          const p = pointAt(h.path, h.dist)
          h.x = p.x
          h.y = p.y
        }
      } else if (h.state === 'aboard') {
        const p = seatPosition(h.ship, h.seat)
        h.x = p.x
        h.y = p.y
        if (h.alpha < 1) h.alpha = Math.min(1, h.alpha + dt / ABOARD_FADE)
      }
    }

    if (hoplites.some((h) => h.state === 'gone')) {
      hoplites = hoplites.filter((h) => {
        if (h.state !== 'gone') return true
        byHash.delete(h.hash)
        if (pinned === h) pinned = null
        if (hovered === h) hovered = null
        return false
      })
      layoutQueue()
    }
  }

  function pickAt(bx, by) {
    // Front-to-back so the topmost sprite wins.
    for (let i = hoplites.length - 1; i >= 0; i--) {
      const h = hoplites[i]
      if (h.state === 'gone') continue
      // A soldier standing the deck is part of its ship: without this, a
      // loaded hull is a wall of soldier hit-boxes and the block card can
      // never be opened. Quay, leaping and leaving soldiers stay pickable.
      if (h.state === 'aboard') continue
      if (bx >= h.x - 1 && bx <= h.x + HOPLITE_W + 1 && by >= h.y - 1 && by <= h.y + HOPLITE_H + 1) {
        return h
      }
    }
    return null
  }

  /**
   * Hull hit-test, tried after the (smaller, nearer) soldiers miss. The box
   * reaches above the deck line so a crowded crew is part of the ship's
   * clickable body.
   */
  function pickShipAt(bx, by) {
    for (const list of [berthShips, ships]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const sh = list[i]
        if (bx >= sh.x - 2 && bx <= sh.x + SHIP_W + 2 &&
            by >= sh.y - 12 && by <= sh.y + SHIP_H + 2) {
          return sh
        }
      }
    }
    return null
  }

  function draw() {
    const ctx = surface.ctx
    const w = surface.width
    const t = elapsed

    drawSky(ctx, w, t)
    drawSea(ctx, w, t)
    drawFarShips(ctx, w, t)
    drawSeaLife(ctx, t)
    drawShips(ctx, ships, t)
    drawQuay(ctx, w)
    drawQuayProps(ctx, w)
    drawTemple(ctx, w, t, burnGlow)
    // Berth traffic draws over the quay: it lies alongside, not behind, and a
    // ship still running down the fairway is nearer the viewer than the quay.
    drawShips(ctx, berthShips, t)
    for (const s of berthShips) {
      if (s.plank > 0) drawGangplank(ctx, s, s.plank, w)
    }
    drawHoplites(ctx, hoplites, t)

    // Highlight bracket around the inspected hoplite.
    const focus = pinned || hovered
    if (focus && focus.state !== 'gone') {
      ctx.fillStyle = PAL.gold
      const x = Math.round(focus.x) - 2
      const y = Math.round(focus.y) - 2
      const w2 = HOPLITE_W + 4
      const h2 = HOPLITE_H + 4
      ctx.fillRect(x, y, 3, 1); ctx.fillRect(x, y, 1, 3)
      ctx.fillRect(x + w2 - 3, y, 3, 1); ctx.fillRect(x + w2 - 1, y, 1, 3)
      ctx.fillRect(x, y + h2 - 1, 3, 1); ctx.fillRect(x, y + h2 - 3, 1, 3)
      ctx.fillRect(x + w2 - 3, y + h2 - 1, 3, 1); ctx.fillRect(x + w2 - 1, y + h2 - 3, 1, 3)
    }

    drawVignette(ctx, w)
    surface.present()
  }

  function snapshot() {
    let queued = 0
    let aboard = 0
    for (const h of hoplites) {
      if (h.state === 'queued') queued++
      else if (h.state === 'aboard' || h.state === 'leaping' || h.state === 'marching') aboard++
    }
    const focus = pinned || hovered
    return {
      stats: {
        queueDepth: blockQueue.length + pending.length,
        fastForwarded,
        burnedSession,
        burnedLast,
        queued,
        aboard,
        sailed,
        ashore,
        ships: ships.length + berthShips.length,
        blocks: blocksSeen,
        block: latestBlock?.number ?? null,
        skipped,
      },
      berths: Array.from({ length: BERTH_COUNT }, (_, i) => {
        // Whatever is actually alongside; failing that the relief running in,
        // and only failing that the ship on its way out. One row per berth
        // either way, so the panel never lists the same berth twice.
        const s = berthShips.find((x) => x.slot === i && (x.dock === 'moored' || x.dock === 'casting'))
          || slotInbound(i)
          || slotHolder(i)
        if (!s) return null
        return {
          slot: i,
          number: s.number,
          boarded: s.passengers.length,
          load: s.load,
          capacity: s.capacity,
          // Shared scale for the gauges: capacity now varies with hull size, so
          // bars drawn against each ship's own capacity would make a full small
          // hull look identical to a full large one.
          deckMax: DECK_MAX,
          txCount: s.txCount,
          fillPct: s.fillPct,
          state: s.dock,
        }
      }),
      life: (() => {
        const a = pinnedLife || hoveredLife
        if (!a) return null
        return {
          id: a.id,
          species: a.species,
          label: SPECIES_LABEL[a.species],
          usd: a.usd,
          symbol: a.symbol,
          fromChain: a.fromChain,
          fromSymbol: a.fromSymbol,
          bridge: a.bridge,
          txHash: a.txHash,
          pinned: pinnedLife === a,
        }
      })(),
      ship: (() => {
        const sf = pinnedShip || hoveredShip
        if (!sf) return null
        const projects = projectBreakdown(sf.recruits)
        return {
          number: sf.number,
          txCount: sf.txCount,
          boarded: sf.passengers.length,
          load: sf.load,
          burnedMon: sf.burnedMon,
          state: sf.dock,
          projects: projects.rows,
          otherContracts: projects.other,
          pinned: pinnedShip === sf,
        }
      })(),
      focus: focus
        ? {
          hash: focus.hash,
          name: focus.traits.name,
          category: focus.traits.category,
          state: focus.state,
          synthetic: false,
          rank: focus.rank,
          rankName: RANK_NAMES[focus.rank] || RANK_NAMES[0],
          // Frozen shared array — reading it allocates nothing per frame.
          abilities: ABILITY_CARDS_BY_RANK[focus.rank] || ABILITY_CARDS_BY_RANK[0],
          whale: focus.traits.whale,
          priority: focus.traits.priority,
          color: focus.traits.cloak,
          pinned: pinned === focus,
        }
        : null,
    }
  }

  function emit() {
    const snap = snapshot()
    for (const fn of listeners) fn(snap)
  }

  let emitAccum = 0
  function frame(ts) {
    raf = requestAnimationFrame(frame)
    if (document.visibilityState === 'hidden') { lastTs = ts; return }
    // Fixed-step catch-up. A single clamped dt made SIM time run slower than
    // wall time whenever the frame rate fell below 20fps — the harbour then
    // drifted permanently behind the live chain, which is exactly the
    // ships-cannot-keep-up bug. Sub-stepping keeps sim time equal to wall
    // time down to 4fps; below that the remainder is dropped (a stall, not a
    // spiral), and the release ladder's burst budget absorbs the difference.
    let remaining = Math.min(0.25, (ts - lastTs) / 1000 || 0)
    lastTs = ts
    const frameDt = remaining
    while (remaining > 1e-6) {
      const step = Math.min(0.05, remaining)
      remaining -= step
      elapsed += step
      update(step)
    }

    if (pointer.inside) {
      const next = pickAt(pointer.x, pointer.y)
      const nextLife = pickLifeAt(pointer.x, pointer.y)
      const nextHop = nextLife ? null : next
      const nextShip = (nextLife || nextHop) ? null : pickShipAt(pointer.x, pointer.y)
      if (nextHop !== hovered || nextShip !== hoveredShip || nextLife !== hoveredLife) {
        hovered = nextHop
        hoveredShip = nextShip
        hoveredLife = nextLife
        canvas.style.cursor = (nextHop || nextShip || nextLife) ? 'pointer' : 'default'
        emit()
      }
    }

    draw()

    // Throttle React updates: live HUD still only needs ~10 commits/s.
    emitAccum += frameDt
    if (emitAccum > 0.1) { emitAccum = 0; emit() }
  }

  function onPointerMove(e) {
    const rect = canvas.getBoundingClientRect()
    const p = surface.toBuffer(e.clientX, e.clientY, rect)
    pointer.x = p.x
    pointer.y = p.y
    pointer.inside = true
  }

  function onPointerLeave() {
    pointer.inside = false
    if (hovered) { hovered = null; emit() }
  }

  function onClick() {
    // Pick at the click itself: hover state can lag or be absent entirely
    // (throttled rAF, touch input), and the click must not depend on it.
    const life = pickLifeAt(pointer.x, pointer.y)
    const h = life ? null : pickAt(pointer.x, pointer.y)
    const sh = (life || h) ? null : pickShipAt(pointer.x, pointer.y)
    pinned = h || null
    pinnedShip = sh || null
    pinnedLife = life || null
    hovered = h
    hoveredShip = sh
    hoveredLife = life
    emit()
  }

  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => { surface.resize(); layoutQueue() })
    : null

  return {
    start() {
      if (running) return
      running = true
      surface.resize()
      layoutQueue()
      ro?.observe(canvas)
      canvas.addEventListener('pointermove', onPointerMove)
      canvas.addEventListener('pointerleave', onPointerLeave)
      canvas.addEventListener('click', onClick)
      lastTs = performance.now()
      raf = requestAnimationFrame(frame)
    },
    stop() {
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      ro?.disconnect()
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('click', onClick)
      listeners.clear()
      hoplites = []
      ships = []
      berthShips = []
      blockQueue = []
      pending = []
      lastReleaseAt = -999
      byHash.clear()
      seaLife = []
      seenInflows.clear()
      hoveredLife = null
      pinnedLife = null
      clearMotes()
    },
    pushMon,
    pushInflow,
    pushVessel,
    subscribe(fn) {
      listeners.add(fn)
      fn(snapshot())
      return () => listeners.delete(fn)
    },
    getSnapshot: snapshot,
  }
}
