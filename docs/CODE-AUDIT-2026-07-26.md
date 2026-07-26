# Purple Rain — full code & design audit · 2026-07-26

> Produced by a 6-agent scan (sim / art / data / app shell / quality → synthesis),
> cross-checked against a fresh `npm run audit`, `vitest` (112 green), typecheck and build.

## What the product can do today

- HARBOUR SIM (/ship): 9-berth quay state machine with relief stacking and fairway holds; manifest-law boarding (a tx only boards the hull of the block that sealed it, never invents crew); pure capacity model (hull tier/deck load from txCount + gas fill, 0-tx blocks sail empty); fixed-step sub-stepping keeps sim time == wall time down to 4fps with honest hidden-tab catch-up folding (engine.js, capacity.js, ranks.js)
- HARBOUR SIM: mempool quay with token-bucket intake and torch burndown; synchronized sealing rite pose; EIP-1559 burn ledger driving the temple altar fire; USD-tiered bridge sea life (dolphin/orca/whale, thresholds calibrated against a real 1000-transfer LI.FI sample); derived 5-tier rank ladder with flame/ability rendering on strict paint budgets
- HARBOUR SIM: performance discipline throughout — cached sprites, typed-array mote pool, baked quay/ridge strips, wake caps; 71 passing engine/capacity/rank/sea-life tests including pacing parity and manifest-law integration tests
- DATA TRUTH: WS newHeads primary + 7-endpoint HTTP fallback with chain-id validation; per-block 24-tx recruits sample fetched atomically (what makes manifest law possible); live burn = gasUsed x baseFeePerGas; proposer attribution via staking precompile with race-window publish; DeFi receipt enrichment (ERC-20/V2/V3 topics, token cache, USD estimates); ~200-address contract-to-project attribution map with idempotent harvest merge
- DATA TRUTH: three-source bridge inflow feed (LI.FI/Relay/Wormholescan) normalized and deduped with a no-replay watermark; wall-clock TPS/block-time sidestepping 1s chain timestamps; DeFiLlama TVL on 60s cadence; capped buffers everywhere (blocks 50, txs 500, seen-sets bounded)
- INTERACTION: layered hover/click picking (sea life -> hoplite -> ship) with pin + snapshot inspector cards, ~10Hz React emit throttle; carved-stone plaque chrome with zero blur/zero radius, two-tier CSS token system byte-shared with the canvas palette; 3x5 bitmap font for on-canvas text
- OTHER PAGES: /price multi-venue live MON aggregator (7 exchange WS + DexScreener) with custom canvas snake chart and trade tape; /staking full wagmi delegate/undelegate/claim/compound surface vs the staking precompile; /staking-calculator per-validator net-APY; /ecosystem DefiLlama-backed directory with live TVL; /network orbital validator viz; /world + /world-3d geolocated validator map/globe with live proposer arcs; /agora-world 2D/3D aUSD transfer viz; 12 lazy-loaded routes, 51.9kB entry, green build + CI (test+build) on push

## Top gaps (most valuable missing work)

### 1. Commit the flagship — 10 ship/utils source files are untracked and the staged index is broken  · effort S

At HEAD src/ship does not exist; the staged engine.js imports ./capacity, ./ranks, ./abilities, ./motes, ../utils/monadContracts which are NOT in the index, so committing as-is produces a tree that fails CI test AND build. The entire flagship has no history and no revert path; CI currently exercises ~20 of 112 tests.

**Where:** git add src/ship/{abilities,capacity,flames,hopliteRender,motes,poses,ranks,rng,seaLife}.js, the 4 untracked ship tests, src/utils/{bridgeApi,ecosystemApi,ecosystemMerge,monadContracts}.js + tests, tsconfig.json, then commit

### 2. WS feed resilience: staleness watchdog, gap-fill, and null-block retry  · effort M

A WS that stays open but stops delivering (proxy idle timeout, sleep/resume) freezes the entire product forever — polling is suppressed by the !wsRef.current gate and no last-block timer exists. Missed headers are never continuity-checked and a null getBlock (load-balanced node lag) drops that block permanently: no trireme ever spawns for it. This is the single biggest threat to the live-only mandate.

**Where:** src/contexts/MonadContext.jsx:648, 693, 723, 750 — add a last-block-received watchdog that re-enables polling, check lastBlockNumberRef continuity and backfill the gap, retry null getBlock

### 3. Meter the primary WS request fan-out  · effort M

Rate limiting only guards the fallback path. The WS path issues getBlock + proposer call (up to 7 endpoints serially) per block plus per-tx receipt fan-out for DeFi — theoretically ~480 req/s under a burst, inviting 429s that then degrade the block feed itself.

**Where:** src/contexts/MonadContext.jsx:149-175 (extend canMakeRequest/trackRequest to the WS handler at 600-729 and flushTransactionBatch), src/utils/validatorApi.js:150-193

### 4. Wire the quality gates: lint green, lint+typecheck+audit in CI, coverage measurement  · effort M

npm run lint exits 1 (11 unused-disable errors, 170 warnings) and nothing runs it; CI runs only test+build; the audit script was built to gate CI but is not wired in and has drifted from real lint (omits --report-unused-disable-directives, claims a --max-warnings flag that does not exist); no coverage tooling exists so the 80% rule is unmeasurable.

**Where:** .github/workflows/ci.yml:17-19, package.json scripts, scripts/audit.mjs:90+114-116, fix directives in src/utils/logger.js:11-19 et al, add @vitest/coverage-v8

### 5. Fix the inspector card title contrast — the spec's confirmed production bug is still live  · effort S

focus.color = traits.cloak pipes near-black cloak hexes (#6b1f28, #1e3a4a) into --hb-accent, so the card h2 renders at ~1.2:1 on the panel — functionally invisible. The specced fix (CLOAKS triples with a DOM-only cloakSignal element) was never implemented.

**Where:** src/ship/sprites.js:70-79 (add third element per cloak), src/ship/engine.js:1191, src/pages/ShipPage.jsx:384, ShipPage.css:318

### 6. Restore the missing information surfaces: berth gauges, tally strip, legend  · effort M

snapshot().berths and queued/sailed/skipped stats are computed and thrown away — the spec's 'single largest missing information surface' — and nothing on screen teaches crest/blazon/torch/empty-bench/whale vocabulary, so the scene is unexplained cosplay to a newcomer. ART-DIRECTION-STATUS.md falsely marks gauges+tally Done and must be corrected.

**Where:** src/pages/ShipPage.jsx (new .hb-berths/.hb-tally/.hb-guide markup consuming existing snapshot fields), ShipPage.css (orphan .hb-berth-tx at :632), docs/ART-DIRECTION-STATUS.md:18

### 7. Land the canvas performance reclaims — cost grew with MAX_BASE_W 1120->1760 while none shipped  · effort M

~1,250 wave fills/frame, full 10-char hull labels redrawn via drawPixelText every frame (~85 fills/ship, up to 9+ hulls), and two [...ships].sort() allocations per frame plausibly exceed the spec's measured 2,628-fill baseline; no fill-budget assert exists so regressions are invisible.

**Where:** src/ship/harborScene.js:296-306 (bake wave strips), :544-557 (pre-render label ring; formatHullTail at pixel.js:236 is already written and dead), :520 (cache the sort), add a SCENE_FX_FILL_BUDGET assert in engine.draw()

### 8. Kill PricePage's dead chart engine and its 166KB dependency  · effort M

chartContainerRef is never attached, so the entire lightweight-charts integration (~600 of 1744 lines: series creation, candle path, hydrate/seed, visibility toggle) is unreachable — yet the static import ships a 166KB chunk to every /price visitor for code that cannot execute.

**Where:** src/pages/PricePage.jsx:12 (import), :44, :715-793, :906-946, :991-1081, :1197-1258, :1405-1466; drop lightweight-charts from package.json

### 9. Resolve the Agora fabricated-arcs conflict with the live-data mandate  · effort S

TRANSFER_MULTIPLIER 8/18 spawns synthetic arcs with invented endpoints (82% intercontinental bias) for every real transfer — the ship page follows a strict no-fabrication rule while sibling pages violate it. Either drop the multiplier or explicitly document it as artistic amplification with an on-screen cue.

**Where:** src/pages/AgoraWorldPage.jsx:11, 455-475; src/pages/AgoraWorld3DPage.jsx:90

### 10. Add a visual-regression layer for the flagship canvas  · effort M

The /ship surface's correctness is visual — pixel palette, sprite layout, chrome — and its only QA today is two untracked manual lab HTML files outside the build graph. The user's own testing rules put Playwright screenshots at priority #1; breakpoints 320/768/1024/1440 and reduced-motion are unverified.

**Where:** add playwright + screenshot specs for /ship (and track sprite-lab.html/scene-lab.html); wire prefers-reduced-motion into src/ship/pixel.js which currently ignores it

## Bug / correctness risks (ranked)

- Zombie WebSocket reconnect after teardown: ws.onclose (MonadContext.jsx:707-721) fires after stopHttpPolling (:764-796) and reschedules connectWebSocket in 5s with a permanently-truthy guard and no intentional-close flag; with StrictMode (main.jsx:16) every dev load leaks a duplicate WS + block pipeline, and any real unmount leaks a self-reconnecting stream in prod
- Bridge inflows are silently lost forever when the pod is full: engine.pushInflow declines at LIFE_MAX without marking seen (src/ship/engine.js:469) but ShipPage advances the freshInflows watermark unconditionally before staging (src/pages/ShipPage.jsx:130) — advance the watermark only past staged ids
- One bridge transfer can swim in twice: Wormhole ops keyed by VAA id are id-disjoint from LI.FI dest-tx hashes, so a Mayan transfer reported by both feeds animates twice (src/utils/bridgeApi.js:284-287); also add a ms-vs-seconds sanity clamp on `at` before the newest-wins watermark (bridgeApi.js:317-327) or a bad upstream unit permanently mutes the pod
- Swap enrichment fabricates USD values: non-stable pairs get usdValue = max(baseAmount, quoteAmount) stamped as dollars (src/utils/txEnrichment.js:283-286), and the isStableSymbol substring guess overrides on-chain decimals()==18 down to 6, inflating legit 18-dec stables by 1e12 (:73-87, :140-141) — both violate the live-data honesty mandate
- Proposer attribution is off-by-one under load: getProposerValId() is called at block tag 'latest' (src/utils/validatorApi.js:168-171) with 300-400ms blocks and up-to-2.1s serial endpoint retries — pass the block number as the eth_call tag
- Adaptive polling is dead code: rateLimitDelayRef updates (speed-up to 100ms, backoff) never re-arm the setInterval, which captures 1500ms once (MonadContext.jsx:574-585 vs 748-753) — catch-up acceleration and error backoff have zero effect on cadence
- Validator names are 'Unknown' when /ship is the entry point: loadValidatorMetadata() is only called from Stats/Staking/BlockchainViz pages, never from the provider that consumes getValidatorById (MonadContext.jsx:290, 359) — move the load into provider init
- BlockchainVizPage runs an infinite 100ms retry loop for the page lifetime: setupHeader queries '.app-header.header-hover-hidden', a class no code ever sets (src/pages/BlockchainVizPage.jsx:256-261); the whole effect duplicates Header's own idle-hide and should be deleted, along with the render-time logger.log at :302
- stats.gasPrice flips between number and string: handleNewBlock writes Math.round(baseFee/1e9) but flushTransactionBatch overwrites it with a .toFixed(2) string (MonadContext.jsx:345-347 vs :425, :552) — arithmetic consumers silently concatenate or NaN
- Sticky inspector cards: onPointerLeave clears `hovered` but not `hoveredShip`/`hoveredLife` and the pick loop is gated on pointer.inside (src/ship/engine.js:1252-1255) — one-line fix plus emit
- Quay soldiers whose tx seals into a pass-lane hull are never resolved: skipped by placeRecruitAboard's byHash guard (engine.js:597), never dismissed like berth crew (:658-660), they stand the full 12s and are miscounted 'ashore' though their tx visibly sailed past
- abilities.js writes h.__lastMote onto the engine's soldier object (src/ship/abilities.js:169-170), violating its own HARD RULE read-only contract — move phase bookkeeping to a WeakMap, and add the missing structural test forbidding property assignment in abilities/render modules
- Dead release pipeline is a latent unbounded queue: nothing pushes into `pending` because launchPass always succeeds via overlap fallback, so PENDING_BLOCKS_MAX is never enforced (engine.js:36, 141, 360-377, 679-683) — remove it or wire the cap
- merge-contracts.mjs reads logo overrides from a session-scoped scratchpad path (scripts/merge-contracts.mjs:44-45); on any other machine it silently falls back to bidirectional startsWith fuzzy matching that can attach the wrong project's logo
- tokenMetadataCacheRef is the one unbounded collection (MonadContext.jsx:144) — grows per distinct token for the session under Nad.fun-style churn; cap it like every other buffer

## Design review

- STRONG: the carved-plaque chrome genuinely reads as cut stone — 2px bronze bevel + inverted incision + hard cast shadow in 4px of edge with zero blur and zero border-radius anywhere (ShipPage.css:114-131), plus the Greek-key frieze; the strongest specced idea that actually shipped
- STRONG: rank legibility at 1px scale — flame height/hue ladder with the Archon's single pure-white pixel as the scene's highest point, and the synchronized rite pose as the one-body seal signal; motion clarifies state exactly as the design rules demand. One-sun lighting is now internally consistent across sprites, quay, and temple, and the altar fire fed by live EIP-1559 burn is the scene's best idea: one object lit by chain data
- STRONG: the scene has legitimately evolved past its own spec — temple+altar replacing the anachronistic Pharos, 9-abreast berth line, crescent hull — but the docs lie about it: ART-DIRECTION.md's ground-truth block (BASE_H, berth grid, PIER_Y) no longer matches the tree and ART-DIRECTION-STATUS.md marks unbuilt surfaces Done; both need re-verification before anyone builds from them
- INCONSISTENT: the color law is diluted — gold now means five different things (torch, gold-tag, focus bracket at engine.js:1085, manifest gold, whale cloak) when the law is 'gold = fire/fullness only'; category colors collapsed (transfer/defi/other all the same violet, call/deploy share gold, ShipPage.css:545-555); ~15 raw hex literals survive in sprites.js against a zero-literal target; the full-width marble coping row (harborScene.js:357) puts up to 1,760px of near-white across the frame and rivals the sails as the brightest mass below the sky
- INCONSISTENT: the liveness badge keeps the criticized hard-blink (opacity 0.15 for 40% of cycle, ShipPage.css:201-204) instead of the specced breathe; the focus ring measures ~2.08:1 against the bronze frame; .hb-tool is 32x32 vs the 40/44px target; one soft gradient survives Pillar 3's own grep test (ShipPage.css:529-530); prefers-reduced-motion never reaches the canvas
- MOVE 1 — Inspector accent fix (S): implement the CLOAKS triples with a DOM-only cloakSignal third element so card titles stop rendering at 1.2:1 (sprites.js:70-79, engine.js:1191, ShipPage.css:318)
- MOVE 2 — Sun geometry re-site (S): the waterline-clip branch can never fire (disc bottom is SEA_Y-7) so the half-set sun still reads as an accident, and at w=720 the 0.24w sun path lands exactly behind berth col 2 — re-derive SUN_CY/sunX against the real berth math (harborScene.js:71-74, 187-211)
- MOVE 3 — Environment & architecture pass (M): citadel, horizon temple, haze bars, horizon glint per spec; seven PAL keys (hullFar, haze, seaCrest, wineHot, wallFarLit, abyss, hullWorn) are already defined with zero consumers and one pixel.js comment now lies about the far fleet (sprites.js:508, pixel.js:46-48)
- MOVE 4 — Information surfaces (M): berth gauges + tally strip + legend/epigraph — the computed-but-discarded snapshot data and the untaught visual vocabulary are the biggest gap between what the sim knows and what the viewer learns
- MOVE 5 — Typography & color-token cleanup (M): move fonts to index.html preload (drop unused JetBrains 600, ideally self-host — the only third-party request on the flagship), fix the 9px sub-floor abilities text, add the six --hb-cat-* tokens, retire the sprites.js hex literals, move the focus bracket to marble, and back the focus ring in night

## Verdict

The product is genuinely impressive and largely honest: a live-data pixel harbour with a rigorously tested simulation core (112 green tests, manifest law enforced, pacing parity proven), a rich multi-source data layer, and eleven working satellite pages — but the flagship's source is not committed, the staged index would break CI, and the quality gates (lint, coverage, audit) that exist on paper are either red or unwired. The data layer's single point of failure is real: a silently-stalled WebSocket freezes everything with no watchdog, no gap-fill, and an unmetered request fan-out, and several honesty leaks (fabricated swap USD, dropped bridge inflows, synthetic Agora arcs) contradict the project's own live-only mandate. Fix the git/CI situation first (one afternoon), then the WS resilience and the inspector-contrast bug, and the remaining work is a well-documented art-spec backlog on a foundation that is architecturally sound.
