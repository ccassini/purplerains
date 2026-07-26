# Muster plan — every ship sails with its own soldiers

> **STATUS: IMPLEMENTED (phases 1–5) — live data only.** Phase 6 (demo
> spawners) is CANCELLED by explicit instruction: no demo mode, no mock data,
> ever. The Odyssey runs exclusively on the live chain feed. Additions beyond
> the plan: the burnt-offering ledger (per-block and session burned MON from
> gasUsed × baseFee) surfaced in the HUD and fed to the altar's flare.

**Semantic contract (the point of the whole scene):**
the quay is the mempool · a soldier is one real transaction, deterministically
derived from its hash · a ship is a sealed block · **a soldier boards only the
ship whose block actually contains its transaction** · a 10k-tx block cannot
show 10k soldiers, so each ship musters an **honor guard of 10–20 real
transactions sampled from that block**, and the count scales with txCount.

Verified against the working tree by a 3-agent adversarial pass
(geometry / boarding-policy / data-feed). Findings below are from disk, not
assumption.

---

## Why it does not work today (root causes, verified)

1. **Manifests are empty in steady state.** `MonadContext` publishes a block
   ~120 ms after arrival (`PROPOSER_RACE_MS`), but its transactions reach React
   state on a 250 ms flush timer (`TX_FLUSH_MS`). `ShipPage` processes each
   block exactly once, on the earlier commit — so
   `carried = transactions.filter(blockNumber === n)` is almost always `[]`,
   and `ship.manifest` is an empty Set. Every "real" boarding today happens via
   the generic highest-rank fallback — i.e. soldiers board ships that do NOT
   contain their tx, which is exactly the rule violation to fix.
2. **Load ignores the contract.** `planShipLoad` derives load from gas fill;
   at mainnet's 2–14% fill a 1000-tx block can sail with 3–6 soldiers.
3. **`DECK_MAX = 16`** clamps everything in `makeShip`, so tier-2's 20 seats
   are unreachable regardless of formula.
4. **Silent cargo faking:** `transactionCount` falls back to
   `stats?.blockTransactions`, which can stamp a genuinely empty block with the
   newest block's count in a burst commit.

---

## Phase 1 — fix the feed (the unlock everything else depends on)

`MonadContext` holds `block.transactions` in full at fetch time. Attach a
bounded recruit sample to each `blockEntry` **at that moment**, so the data
arrives WITH the block instead of racing it:

```js
// blockEntry(), at fetch time — block.transactions is already in hand
recruits: block.transactions.slice(0, 24).map((t) => ({
  hash: t.hash,
  value: formatMon(t.value),
  gasPrice: formatGwei(t.gasPrice),
  category: categorize(t),
})),
```

- Bounded (≤24 per block, ~2 KB) — no state growth.
- `ShipPage.pushVessel` passes `recruits` through; `ship.manifest` is built
  from them and is now **rich for every block**.
- Drop `stats?.blockTransactions` from the txCount fallback chain (root cause 4).

## Phase 2 — representation formula (pure, in capacity.js)

```
txCount = 0      → load 0        (an empty block sails empty — unchanged)
txCount 1..9     → load txCount  (never more soldiers than transactions)
txCount ≥ 10     → load = clamp(round(10 + 10·(log10(txCount) − 1) / 2), 10, 20)
                   10 → 10 · 100 → 15 · 1000 → 20 · 10k → 20 (saturates)
```

The deck reads as: *how busy was this block*, on a log scale, with a floor of
10 so a sealed block always musters a visible guard. Ship size tier keeps its
existing utilization blend (unchanged). `ship.represented = txCount` is shown
in the UI; each guard is one REAL tx from the block.

## Phase 3 — engine: manifest-true boarding

1. **`DECK_MAX` 16 → 20.** The verifier confirmed `seatOffset` already derives
   rows from load; the constant is the only clamp. Pair with
   **`DECK_ROW_STEP` 3 → 2** so the 5th rank's feet (sprite y8) stay under the
   aphlaston (top y5) instead of floating above the stern — the cheaper of the
   two verified stern fixes, and it shrinks the quay-queue overlap to ~1 px.
2. **Boarding sources, in order:**
   a. Queued quay soldiers whose hash ∈ manifest — the mempool→block story,
      now real because manifests are rich. Wire the dormant `'marching'`
      state: a called soldier outside `NEAR_PLANK` walks the quay to its plank
      (path = walk segment + leap arc; `stillLeaping` already holds the seal
      for them). Cap the call radius to what is walkable inside a dwell
      (~`LEAP_SPEED × MIN_DWELL × 2.8` px); beyond that the soldier is left
      and the seat fills from (b). Verified: NEAR_PLANK alone strands
      everything past queue position ~35 — marching is mandatory, not polish.
   b. **Recruits from the block itself** — real hashes not on the quay yet,
      spawned marching in from the right edge to the plank, paced at
      `BOARD_INTERVAL` (0.04 s). Verified: 0.08 s pacing loses the race
      against the relief-driven seal at 1.15 s; 0.04 s fills 20 seats in
      1.1 s and wins.
   c. `seal()` top-up as backstop only (instant-place any remainder at seal,
      state `'aboard'` — never `'leaping'`, or the seal ladder would gate on
      them).
3. **No invented hashes, ever.** Synthetic crew is retired entirely (the
   current engine + `boarding.test.js` already assert this). If the recruit
   list is missing (feed gap), the deck sails underfilled — honestly.
   `RANK_UNLIT` remains reserved for a future feed-gap tell.
4. **Quay drain (verified terminal bug otherwise):** with manifest-only
   boarding and today's global `needCrew` hold, the quay pins at
   `MAX_QUEUE = 72`, intake skips every new tx including future manifest
   members, and real boarding asymptotically dies. Fixes, all three:
   - the hold becomes **per-soldier**: hold only while some approaching/moored
     ship's manifest contains this soldier's hash;
   - on every `pushVessel`, queued soldiers whose hash ∈ that block's
     manifest but who cannot board (over load / out of reach) → `'leaving'` —
     their tx is sealed; a real mempool would drop them. Drains at chain rate.
   - `QUAY_LIFE` 28 s → ~10 s for everyone else.

## Phase 4 — UI truth

- Berth row: `boarded/load` plus the represented count — `18⚔ ≈ 1.240 tx`.
- Inspector: a boarded soldier keeps its real hash and rank (recruits carry
  value/gasPrice, so rank derivation is intact).
- Guide: "the deck musters 10–20 of the block's own transactions; empty
  benches mean the block sailed under capacity."

## Phase 5 — tests (extend the existing suites)

- Formula table: 0→0, 5→5, 10→10, 100→15, 1000→20, 10k→20; monotonic;
  `load ≤ min(20, txCount)`.
- Property (5k cases): **a soldier never boards a ship whose manifest lacks
  its hash** — the user's rule, enforced forever.
- Property: every passenger's hash ∈ block recruits ∪ quay manifest matches —
  no invented hashes.
- Sim test: rapid-feed 30 blocks → every sealed ship has
  `boarded === load`; quay count returns to baseline (drain works).
- `capacityIsolation` unchanged.

## Phase 6 — demo spawners (optional, last)

`spawnDemoPulse/spawnDemoBlock` no longer exist. Rebuild them AFTER the above:
demo blocks must carry recruit lists whose hashes were `pushMon`'d first, and
txCounts spanning the formula's decades (3 / 30 / 150 / 1200), with
`fillPct ≥ 70` on the big one so tier-2 hulls appear.

## Sequencing

1 (feed) → 2 (formula) → 3 (engine) → 4 (UI) → 5 (tests alongside each) → 6.
Phase 1 is the unlock: without rich manifests, manifest-true boarding starves
and every later phase shows an empty theatre. Nothing here touches
`capacity.js`'s isolation, the berth layout, or the sprite pipeline.
