# Monad Odyssey — art direction spec
> Produced by a 24-agent art-direction workflow (recon -> 7 discipline leads ->
> adversarial cohesion/feasibility critique -> unified synthesis).
> Implementation status is tracked in docs/ART-DIRECTION-STATUS.md.

---

## Manifesto — six pillars

MONAD ODYSSEY — 6 pillars. Each has a binary test.

GROUND TRUTH FIRST (both recon docs and 4 of 7 layer specs are stale; verified against the working tree 2026-07-25):
BASE_H=320, MIN_BASE_W=480, MAX_BASE_W=1120. PIER_Y=128, SEA_Y=92, BERTH_Y=138 (row0)/162 (row1), TRANSIT_Y=186, PASS_Y=224, OUTBOUND_Y=269, QUAY_FEET_Y=112. BERTH_COUNT=6 in 3x2, BERTH_ROW_GAP=24. berthPitch is ALWAYS 90 (clamped at every legal width), so berthX(w,i)=round(w*0.04)+col*90 and the whole berth field lives in x 19..253 (w=480) / 45..279 (w=1120) — the right 75% of a wide buffer holds no ship at all. SHIP_W=54, SHIP_H=26, DECK_Y=16, hullDepth=6+size (6/7/8), OAR_COUNT=6/X0=10/STEP=5, DECK_COLS=4. HOPLITE 11x17. MAX_QUEUE=28, DECK_MAX=16 -> worst case 124 sprites, not 216. queueEndX(w)=min(w-48, rampTopX(w,2)+56) = 323 (w=480) / 349 (w=1120): the muster is ~232px wide at EVERY width. ranks.js/flames.js/motes.js/abilities.js/poses.js/hopliteRender.js all exist and are fully wired. sprites.js has NO cache-pressure problem (ships 299 keys / bound 400; figures 108 keys / bound 192). ShipPage.jsx does NOT currently render a berth gauge or a tally strip — engine.snapshot() emits 6 fully-populated berth rows and `skipped`/`sailed`/`queued` and the DOM throws all of it away. That is the single largest missing information surface on the page.

PILLAR 1 — ONE SUN, AND IT IS ON THE LEFT.
Every sprite in the tree is already lit from the upper-left: helmet browband R(4,3,4,1,bronzeLit) on the top row; colonnade shade at x+3 (right); Pharos course highlight on the LEFT edge of every course; amphora highlight at x=1; cloudLit on the top row; prow and ram bright at the bow. The sun sits at 0.7w — upper-right — contradicting all of it. Moving the sun costs one function; re-lighting eight sprites costs ~40 pixel edits into art a parallel effort owns.
TEST: pick any new rect. Does its highlight sit on the -x/-y face and its ink on the +x/+y face? If not it is wrong.

PILLAR 2 — WINE-DARK MEANS WINE.
Homer's oinops pontos and Monad's violet are the same colour story, so the palette is not replaced, it is RECLASSIFIED — and four Monad brand hexes are placed EXACTLY, unmodified, at the four most load-bearing points: #836EF9 at pierGlow (the 1px full-width quay kerb) and beaconBand (the meander on every sail and the Archon's flame body); #200052 as sky band 3; #A0055D as the foreground wave crest and the NFT category; #FBFAF9 as the only pure light in the frame, rationed to <=6 px/frame. The sea ramp now ENDS in berry (#1d0a26), not neutral black.
TEST: greyscale the frame. Are the sails still the brightest mass below y=92? Is there berry in the bottom third? If either fails, revert the change that broke it.

PILLAR 3 — CARVED, NEVER GLASS. ZERO BLUR, ZERO RADIUS, ZERO SOFT GRADIENT.
The canvas physically cannot blur, so the chrome must not either. Depth comes from three hard cues and exactly three: a 2px bronze bevel (lit top-left / shade bottom-right), a 2px inverted incision fillet (dark top-left / light bottom-right — this inversion is what makes a field read as CUT INTO stone), and a hard offset cast shadow. No rivets, no banded panel face, no inset glow: four cues is a Windows-95 skin.
TEST: grep the stylesheet for `border-radius:` with a non-zero value, any `box-shadow`/`text-shadow` with a non-zero blur radius, and any `linear-gradient` without hard stops. Every hit is a bug. (Today `.hb-rank.is-rank-3/-4` ship `text-shadow: 0 0 8px/10px` — the only blur in the file, and it directly contradicts the file's own header comment. It goes.)

PILLAR 4 — FIRE IS THE ONLY FAST THING, AND IT MEANS RANK.
ranks.js/flames.js already own the product's central metaphor (Unlit/Ember/Kindler/Bearer/Archon, torch height and hue derived from value and live gas percentiles, never rolled). No other system may introduce a second gold light source or a second rarity aura. Gold means fire and fullness — nothing else. Everything not on fire moves at 1-4 px amplitude, in 2-4 discrete frames, on the established frequencies (0.9 / 1.1 / 1.3 / 1.4 / 3.1 / 4.4 / 6.0 / 7.5).
TEST: is a new animation faster than an oar stroke (sin(t*4.4))? Then it must be literally on fire. Is a new element gold? Then it must be literally burning, or a seat that is literally filled.

PILLAR 5 — NOTHING MOVES EAST. NOTHING LIES.
Every moving thing in the scene already travels left: clouds 4/6.5/9 px/s, birds 9-15, far ships 2.4-6.8, wave rows 5-26, every hull in every state, every soldier who is leaving. Time runs one way. Separately: the `skipped` counter, the synthetic "unsampled crew - no tx" guard, and the empty benches are honesty affordances. Empty benches are the visible difference between what a block could have carried and what it did; nobody may ever fill them decoratively, ghost-crew them, or hide them behind props. capacity.js is untouchable.
TEST: does anything drift right? Does any label promise a feature the canvas does not draw? Does any surface show a number the chain did not produce?

PILLAR 6 — THE SHIPS ARE THE SUBJECT; THE WORLD PAYS FOR ITSELF.
No background or architectural element may exceed WCAG relative luminance L=0.20. The only masses above it are the sun disc, the stars, and the sails. And the entire redesign is funded by three pure caching reclaims (hull numerals 1020 fills/frame, wave dashes ~700, signpost ~126) totalling ~1846 fills/frame at w=1120 against a measured baseline of ~2628. Everything specified here costs ~100 fills/frame. The frame ends up roughly 3x cheaper than it is today.
TEST: `SCENE_FX_FILL_BUDGET = 160` fills/frame for every new draw pass combined, dev-asserted in engine.draw(), scoped to the new passes only (never to the warrior layer, or a busy frame will trip it and the assert will be deleted by whoever hits it first).

---

## Palette (canvas PAL)

FINAL PAL — src/ship/pixel.js. 69 keys. 41 kept byte-identical, 6 revalued under the same name, 8 dead keys renamed (grep-verified zero readers), 14 added, 0 used keys removed. Because no consumed key name disappears, the object can be swapped wholesale and odysseyScene.js / sprites.js / engine.js / flames.js / abilities.js / poses.js / motes.js keep compiling and rendering on the first commit. Everything after that is opt-in.

```js
export const PAL = {
  // ── NYX · sky, 8 stops, zenith -> waterline (16 bands over rows 0..91)
  skyVault:   '#0d0726', // ADDED  L .0031
  skyTop:     '#170e36', // REVAL from #1b1140  L .0055
  skyDeep:    '#200052', // ADDED  MONAD BLUE — exact, never tweak  L .0093
  skyMid:     '#3b1f5e', // KEEP   L .0195
  skyDusk:    '#5c2a6b', // ADDED  L .0398
  skyLow:     '#7a3a72', // KEEP   L .0713
  skyEmber:   '#a44f7d', // ADDED  L .1289
  skyHorizon: '#c76a86', // KEEP   L .2186

  // ── HELIOS · sun disc
  sun:     '#ffd9a0',    // KEEP
  sunCore: '#fff3d6',    // KEEP  (also Bearer flame core)

  // ── CLOUD / STARS / DISTANCE
  cloud:      '#54306e', // KEEP
  cloudLit:   '#8b5a94', // KEEP
  star:       '#efe6ff', // KEEP
  starDim:    '#a78bfa', // KEEP  (= seaGlint; also WAKE_RAMP tail)
  islandFar:  '#4a2a72', // KEEP  (far ridge; also RAMP_LASTLIGHT step 2)
  islandNear: '#301c52', // KEEP  (near ridge + waterline lip)
  bird:       '#2a1a44', // KEEP
  hullFar:    '#6b4890', // RENAMED from dead `plateEdge`. Far-ship ink + the
                         //   1px horizon glint row. L .1006 vs seaHorizon .0335
                         //   = 1.80:1. The old islandFar ink was 1.20:1 —
                         //   the distant fleet was effectively invisible.
  wallFar:    '#543271', // RENAMED from dead `ink`. Citadel mass. L .0561
  wallFarLit: '#71427e', // RENAMED from dead `inkDim`. Citadel lit courses.
  stoneFar:   '#3f2760', // ADDED. Temple stone, shade edges. L .0327
  stoneFarLit:'#57376f', // ADDED. Temple pediment + column shafts. L .0616
  haze:       '#b06a8e', // RENAMED from dead `thruster`. Aerial wash at the
                         //   horizon: skyHorizon desaturated, which is
                         //   physically what horizon haze is.

  // ── AEGEAN · sea, 6 stops (12 bands over rows 92..319)
  seaHorizon: '#3a2668', // ADDED  L .0335  rows  92..129
  seaFar:     '#2a1c52', // KEEP   L .0194  rows 130..167
  seaMid:     '#20194a', // KEEP   L .0143  rows 168..205
  seaDeep:    '#1b1240', // ADDED  L .0102  rows 206..243
  seaNear:    '#1a0e30', // REVAL from #171236  L .0078  rows 244..281
  seaWine:    '#1d0a26', // ADDED  L .0065  rows 282..319 — the wine-dark floor

  seaFoam:  '#7c6bff',   // KEEP  wave body, wake, WAKE_RAMP head
  seaGlint: '#a78bfa',   // KEEP  oar blades, wake sparkle
  seaCrest: '#dcd6ff',   // ADDED far-row wave highlight (baked, 0/frame)
  wineLit:  '#a0055d',   // ADDED MONAD BERRY — exact. Near-row wave highlight
                         //   (baked, 0/frame) + the NFT category.
  wineHot:  '#d1568c',   // ADDED the wine highlight; DOM --hb-cat-nft
  sunSea:    '#e8899b',  // KEEP
  sunSeaDim: '#9c5c86',  // KEEP

  // ── THE MOLE · quay. Deliberately stays dark violet stone.
  pierGlow: '#836ef9',   // REVAL from #a78bfa. MONAD PURPLE — exact. The 1px
                         //   full-width kerb at y=127: the single most
                         //   brand-legible row in the scene. NOT deleted.
  pierKerb: '#7c6e96',   // RENAMED from dead `pierEdge`. 2px at y=128.
                         //   L .1795 — warm stone, NOT marble. Marble here
                         //   (L .78, 2240px of it) would outweigh the total
                         //   sail area 3.5x and steal the subject.
  pierTop:  '#4a3570',   // KEEP  4px at y=130
  pierFace: '#33254f',   // KEEP  2px at y=134 + joints every 9px
  pierLeg:  '#241a3c',   // KEEP  pilings. No arcade: a 12px pierFace pier
                         //   behind the hulls is 15 L-points from hullDark.

  // ── WEATHERED WOOD (no tar strake: hullPitch vs seaNear is 1.04:1)
  hullDark: '#2a1a10', hullMid: '#4a2f1d', hullLit: '#7a5230', deck: '#a1743f',
  hullWorn: '#5b3a22',   // ADDED — was a literal in shipFromBlock's hull pool

  // ── LINEN
  sailA: '#efe3c8', sailB: '#e0c9a0', linen: '#efe3c8',

  // ── BRONZE (6-step ramp)
  bronzeShade: '#3a2412', // RENAMED from dead `crateDark`. Turned-away edge.
  bronzeDark:  '#6e4a20', // KEEP
  bronze:      '#c98b3f', // KEEP  L .3112
  bronzeLit:   '#f0c27b', // KEEP
  bronzeHot:   '#f5c97a', // RENAMED from dead `crate`. 1px sun rim, upper-left
                          //   only. THE silhouette guarantee: a hoplite must
                          //   carry one pixel from the top of a ramp and one
                          //   from the bottom.
  shadeCool:   '#2b1d4d', // RENAMED from dead `rope`. Stone/violet ink edge.

  // ── MARBLE / GOLD / STATUS
  marble: '#e8e0f5', marbleShade: '#a396c4',
  gold: '#fcd34d',        // KEEP BYTE-IDENTICAL — = beaconLamp = --hb-gold,
                          //   12 CSS references and the whale sprite's helmet,
                          //   aspis rim and spear ferrule. Already correct.
  crimson: '#d94a5a', crimsonLit: '#e8697a', // ADDED crimsonLit: DEMO badge
  laurel: '#8fae5a', laurelLit: '#9dba63',   // ADDED laurelLit: MAINNET badge
  skin: '#c9927a',

  // ── PLATE / BEACON / INK
  plate: '#0f0a24', plateText: '#d8ceff',
  beacon:     '#e9d5ff',  // LIVE (Archon flame) — the recon called this dead. It is not.
  beaconLamp: '#fcd34d',  // KEEP
  beaconBand: '#836ef9',  // REVAL from #8b5cf6. MONAD PURPLE — exact. Sail
                          //   meander on every hull + the Archon flame body.
  white: '#fbfaf9',       // REVAL from #ffffff. MONAD OFF-WHITE — exact.
                          //   LIVE (Archon flame cap). Rationed: <=6 px/frame,
                          //   Archon cap + seal-fire cap ONLY.
  black: '#0b0718',
  abyss: '#050310',       // ADDED — vignette floor, below black.
}
```

REPLACED / RETIRED
- `crate`, `crateDark`, `rope`, `thruster`, `pierEdge`, `plateEdge`, `ink`, `inkDim` — all 8 renamed to consumed keys above. Zero unconsumed keys ship.
- 21 hex literals leave sprites.js: the 8 CLOAK pairs and WHALE_CLOAK (-> the CLOAKS triple table below), crestColor `#e8c547` (-> PAL.gold), whale bronzeLit `#fff3c4` (-> PAL.bronzeHot) and bronzeDark `#9a6f14` (-> PAL.bronzeDark), stripe pool `#8b5cf6` (-> PAL.beaconBand) and `#3f7f8f` (-> PAL.laurelLit), hull pool `#5b3a22` (-> PAL.hullWorn), amphora clays `#8a4b2e`/`#a35c33`/`#6f3c25` (-> `clay`/`clayLit`/`clayDark`, three more ADDED keys; final count 72). poses.js greave `#9a6f14` -> PAL.bronzeDark.

THE CLOAK TABLE — triples, and the production bug it fixes.
`engine.js` sets `focus.color = focus.traits.cloak`; `ShipPage.jsx` pipes it into `--hb-accent`; `ShipPage.css:303` paints `.hb-card h2` with it. Every cloak shade is dark (#6b1f28, #1e3a4a, #2a3d28...) on a panel at L~.009 — the inspector card's title is rendering at roughly 1.2:1 in production RIGHT NOW. One hex cannot serve both a 1px nearest-neighbour silhouette (which needs the cloak DARK against a bright kerb) and a DOM text label (which needs it BRIGHT against a near-black panel). Split the axis; mark the third element canvas-forbidden.

```js
/** [shade, lit, signal]. `signal` is DOM-ONLY — never draw it on canvas. */
export const CLOAKS = [
  ['#5a121c', '#9e2233', '#e4707c'], // 0 madder    signal 5.9:1
  ['#3f0725', '#7e0b48', '#e07aae'], // 1 murex     6.4:1
  ['#14243f', '#26456b', '#7fb6e0'], // 2 woad      8.4:1
  ['#2c3a22', '#4a6134', '#a8c878'], // 3 olive     9.9:1
  ['#33200f', '#5a3a1c', '#c89a6a'], // 4 umber     7.1:1
  ['#1e1a30', '#39335a', '#9a93c8'], // 5 iron-gall 6.2:1
  ['#22463c', '#3e6b5a', '#7fc4a8'], // 6 verdigris 9.0:1
  ['#2e1f6e', '#4b36b0', '#a899ff'], // 7 tyrian    7.4:1
]
export const WHALE_CLOAK = ['#8a5e12', '#c99a22', '#fff0be'] // 16.4:1
```
Dye names, not god names: `CLOAKS[floor(rnd()*8)]` is drawn from the tx hash, so a soldier is not Athena's and a god label would invite the viewer to hunt a meaning that does not exist. Cloak 7 is Monad violet — one warrior in eight wears the brand, so it walks in the ranks rather than only living in the water. Whale overrides: `bronze -> PAL.gold`, `bronzeLit -> PAL.bronzeHot`, `bronzeDark -> PAL.bronzeDark`, `crestColor -> PAL.gold`, laurel -> PAL.laurelLit.

CATEGORY LANGUAGE — one map, adopted by canvas, manifest and legend in a single commit or not at all. transfer `#cfc6e6` · defi `#9dba63` · nft `#d1568c` · contractCall `#c98b3f` · contractDeploy `#f0c27b` · other `#a78bfa`. Today `transfer` and `other` both fall through to violet and are indistinguishable; all six are now distinct in hue AND luminance.

GOLD DISCIPLINE (retires the four-way overload). Gold = fire and fullness. Berth fill bar KEEPS gold (a hull filling with men is fire filling a hull). Active tool KEEPS gold (the tool is lit). Whale tag KEEPS gold — the whale sprite is literally PAL.gold across helmet, aspis rim and blazon, and recolouring the readout green would break the only canvas-to-chrome contract the whale has. DEMO badge moves gold -> `crimsonLit #e8697a` (the false fire). Contract manifest kinds move gold -> `bronze #c98b3f` (bronze is the material of arms and law). Canvas focus bracket moves `PAL.gold` -> `PAL.marble #e8e0f5` (engine.js draw()): a UI affordance painted in a light colour is a semantic collision; marble is inert, bright, and can never be misread as a light source.

---

## CSS design tokens

FINAL `.hb` TOKEN BLOCK — replaces ShipPage.css:14-38 entirely. Two tiers only: material ramps (`--pr-*`, referenced only by Tier 2) and semantic roles (`--hb-*`, the only tier a selector may use). No compatibility-alias tier: all 14 existing `--hb-*` names survive as semantic roles with new values, so nothing breaks on the first commit and there is never a period with two live names for one hex. 12 hexes are byte-shared with the canvas PAL and must not drift independently.

```css
.hb {
  position: fixed; inset: 0; z-index: 60; overflow: hidden;
  background: var(--hb-night);
  color: var(--hb-ink);
  font-family: var(--hb-display);
  -webkit-font-smoothing: none;   /* KEPT. VT323 is bitmap-derived; smoothing
                                     it detaches the chrome from the blit. */

  /* ══ TIER 1 · MATERIAL — components must NEVER reference these ══ */
  --pr-night:      #0b0718;  /* = PAL.black          */
  --pr-abyss:      #050310;  /* = PAL.abyss          */
  --pr-stele-900:  #0e091e;
  --pr-stele-800:  #140d28;
  --pr-stele-700:  #1c1338;

  --pr-marble-100: #f4f1ff;
  --pr-marble-200: #efe6ff;  /* = PAL.star           */
  --pr-marble-300: #cfc6e6;
  --pr-marble-500: #a396c4;  /* = PAL.marbleShade    */
  --pr-marble-600: #8b7fae;

  --pr-bronze-800: #3a2412;  /* = PAL.bronzeShade    */
  --pr-bronze-700: #6e4a20;  /* = PAL.bronzeDark     */
  --pr-bronze-500: #c98b3f;  /* = PAL.bronze         */
  --pr-bronze-300: #f0c27b;  /* = PAL.bronzeLit      */
  --pr-bronze-200: #f5c97a;  /* = PAL.bronzeHot      */

  --pr-gold-500:   #fcd34d;  /* = PAL.gold           */
  --pr-gold-200:   #fff3d6;  /* = PAL.sunCore        */
  --pr-beacon-300: #e9d5ff;  /* = PAL.beacon         */
  --pr-white:      #fbfaf9;  /* = PAL.white (Monad off-white) */

  --pr-violet-500: #836ef9;  /* = PAL.pierGlow / beaconBand (Monad purple) */
  --pr-violet-400: #a78bfa;  /* = PAL.seaGlint       */
  --pr-stone-500:  #7c6e96;  /* = PAL.pierKerb       */
  --pr-timber-700: #2a1a10;  /* = PAL.hullDark       */
  --pr-timber-500: #4a2f1d;  /* = PAL.hullMid        */

  --pr-wine-400:   #d1568c;  /* = PAL.wineHot        */
  --pr-blood-400:  #e8697a;  /* = PAL.crimsonLit     */
  --pr-laurel-400: #9dba63;  /* = PAL.laurelLit      */

  /* ══ TIER 2 · SEMANTIC — the only tier selectors may use ══ */
  --hb-night:      var(--pr-night);
  --hb-panel:      rgba(14, 9, 30, 0.96);
  --hb-panel-deep: rgba(7, 4, 18, 0.96);
  --hb-recess:     rgba(5, 3, 16, 0.82);
  --hb-timber:     var(--pr-timber-700);

  --hb-frame:      var(--pr-bronze-500);
  --hb-frame-lit:  var(--pr-bronze-300);
  --hb-frame-dark: var(--pr-bronze-800);
  --hb-edge:       var(--pr-bronze-500);          /* legacy name, new value */
  --hb-edge-dim:   rgba(201, 139, 63, 0.32);
  --hb-shadow:     5px 6px 0 rgba(4, 2, 11, 0.84);
  --hb-shadow-sm:  3px 4px 0 rgba(4, 2, 11, 0.84);
  --hb-shadow-press: 2px 2px 0 rgba(4, 2, 11, 0.84);

  --hb-ink:        var(--pr-marble-100);  /* 15.9:1 */
  --hb-dim:        var(--pr-marble-300);  /* 10.7:1 */
  --hb-faint:      var(--pr-marble-500);  /*  6.4:1 */
  --hb-quiet:      var(--pr-marble-600);  /*  4.9:1 — was rgba(168,155,200,.62)
                                              at 3.5:1, FAILING AA on every
                                              metric label. Fixed. */
  --hb-knockout:   var(--pr-night);

  --hb-numeral-hero: var(--pr-marble-200); /* 14.6:1 — block height */
  --hb-numeral:      var(--pr-marble-100); /* 15.9:1 — tx/s, blocks/min */
  --hb-chain:        var(--pr-violet-400); /*  6.5:1 — panel counts, card state */
  --hb-violet:       var(--pr-violet-400); /* legacy name, kept */

  --hb-capacity:   var(--pr-gold-500);    /* 12.4:1 seats filled  */
  --hb-gold:       var(--pr-gold-500);    /* legacy name, kept    */
  --hb-demand:     var(--pr-stone-500);   /*  3.9:1 seats needed  */
  --hb-whale:      var(--pr-gold-500);
  --hb-queue:      var(--pr-violet-400);
  --hb-sailed:     var(--pr-laurel-400);  /*  8.1:1 */
  --hb-lost:       var(--pr-blood-400);   /*  5.6:1 */
  --hb-live:       var(--pr-laurel-400);  /* MAINNET */
  --hb-false:      var(--pr-blood-400);   /* DEMO — the false fire */
  --hb-focus:      var(--pr-marble-100);

  --hb-rank-0: var(--pr-marble-600);
  --hb-rank-1: var(--pr-bronze-300);
  --hb-rank-2: var(--pr-gold-500);
  --hb-rank-3: var(--pr-gold-200);
  --hb-rank-4: var(--pr-beacon-300);

  --hb-cat-transfer: var(--pr-marble-300);
  --hb-cat-defi:     var(--pr-laurel-400);
  --hb-cat-nft:      var(--pr-wine-400);
  --hb-cat-call:     var(--pr-bronze-500);
  --hb-cat-deploy:   var(--pr-bronze-300);
  --hb-cat-other:    var(--pr-violet-400);

  /* Vertical 1px tooling only. NO diagonal: a 103deg 1px stop antialiases by
     construction and produces exactly the soft artefact this file bans. */
  --hb-tooled: repeating-linear-gradient(90deg,
      rgba(244,241,255,0.030) 0 1px, rgba(0,0,0,0) 1px 3px);
  --hb-hatch:  repeating-linear-gradient(90deg,
      rgba(244,241,255,0.22) 0 1px, rgba(0,0,0,0) 1px 3px);
  --hb-meander: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='8' shape-rendering='crispEdges'%3E%3Cg fill='black'%3E%3Crect width='16' height='2'/%3E%3Crect x='12' y='2' width='2' height='2'/%3E%3Crect x='2' y='4' width='12' height='2'/%3E%3Crect x='2' y='6' width='2' height='2'/%3E%3C/g%3E%3C/svg%3E");

  /* spacing · size · time — none of these existed before */
  --sp-1: 2px; --sp-2: 4px; --sp-3: 6px; --sp-4: 8px;
  --sp-5: 11px; --sp-6: 14px; --sp-7: 18px; --sp-8: 24px;
  --rule-hair: 1px; --rule: 2px;
  --z-manifest: 4; --z-board: 5; --z-rail: 6; --z-tools: 7;
  --t-snap: 90ms; --t-step: 140ms; --t-fill: 260ms;
  --e-2: steps(2, end); --e-3: steps(3, end); --e-6: steps(6, end);

  --hb-display: 'VT323', 'Courier New', ui-monospace, monospace;
  --hb-mono: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
}
```

CONTRAST LEDGER — measured, not estimated. Ground is `--hb-panel` at 0.96 composited over the WORST thing the canvas can put behind it, which is a full-alpha star (`PAL.star #efe6ff`, 70 of them in rows 2..42 where the board sits) — not the quay, which the specs assumed and which is never behind the board. Composite L = 0.009; typical (over skyDeep) L = 0.0045. All figures use L_ground = 0.009.

ink 15.9 · numeral-hero 14.6 · rank-3 16.0 · rank-4 13.1 · capacity/gold 12.4 · dim 10.7 · rank-1/cat-deploy 10.7 · sailed/live/cat-defi 8.1 · chain/violet/queue/cat-other 6.5 · faint 6.4 · cat-call 6.1 · lost/false 5.6 · quiet 4.9 · cat-nft 4.6. Non-text: demand 3.9, demand-vs-capacity 3.19 (was 2.01 FAIL), frame 6.1. Knockout night-on-bronze 6.8. On timber ground (#2a1a10, L .0126): dim 10.1, faint 6.0, quiet 4.6, capacity 11.7.

FLOOR: no text below 4.6:1. No 3:1 large-text exemption is used anywhere.

THREE COLOUR-ALONE FAILURES FIXED
1. MAINNET vs DEMO were `--hb-live #5ce0a8` and `--hb-gold #fcd34d` — 1.03:1, luminance-identical. A greyscale screenshot or a deuteranope could not tell live data from synthetic on the page's one truthfulness affordance. Now: laurel L .432 vs blood L .281 (1.54:1 luminance), opposite hue, different glyph (solid sprig vs hollow ring), different rhythm (live breathes 1 -> 0.55, demo stutters hard), and the words already differ. Four channels.
2. Berth load vs fill would have been gold-on-bronze at 2.01:1. Now stone `#7c6e96` vs gold at 3.19:1, plus the demand bar is hatched and the fill bar is solid, plus the `{boarded}/{load}` numeral. Three channels.
3. `--hb-accent` (the live canvas->DOM bridge) is now `focus.traits.cloakSignal`, never `cloak`, and it NEVER colours text — see `chrome`.

---

## Lighting language

THE LAW OF ONE SUN. Export it once so nothing re-derives it.

```js
// src/ship/pixel.js
export const LIGHT = Object.freeze({
  rimDx: -1, rimDy: -1,   // highlights: upper-LEFT
  inkDx:  1, inkDy:  1,   // ink + turned-away edge: lower-RIGHT
})
```
> Every form takes its 1px highlight on the upper-LEFT edge and its 1px ink on the lower-RIGHT edge. There is exactly one exception: within 6px of the Pharos or a brazier flame, warm light arrives from the opposite side.

WHY THE SUN MOVES, AND WHERE IT MOVES TO
`SUN_FX = 0.7` puts the key light upper-right while every sprite in the tree is lit upper-left (verified: helmet browband `R(4,3,4,1,bronzeLit)` on the top row; colonnade shade at `x+3`, i.e. right; Pharos course highlight `R(x,y,1,1,PAL.marble)` on the LEFT edge of every course; amphora highlight at `x=1`; `cloudLit` on the top row; prow `R(3,11,2,5,hullLit)` and ram `R(0,hullY+4,2,1,bronzeLit)` bright at the bow). Fixing the sun is one function. Re-lighting eight sprites is ~40 pixel edits into art a parallel effort owns.

It is also the right narrative choice, not merely the cheap one: the hoplites face LEFT toward the ships, so they march INTO the light, westward, toward departure. The Pharos at `w-22` becomes the counter-light — the warm ember at your back as you leave. Two sources, two meanings.

The sun must NOT be a width fraction. berthPitch is pinned at 90 while `sunX` would track width, so no single fraction keeps the sun path out of a hull at every legal width (I solved it: `0.14w - 90c ∈ (54,90)` has no solution covering 480..1120). Anchor it to the berth grid instead:

```js
// odysseyScene.js — replaces SUN_FX and sunX
/** The sun sits in the first clear-water lane, by construction, at every width. */
export const sunX = (w) => berthX(w, 0) + SHIP_W + 18   // = berthX + 72
const SUN_CY = SEA_Y - 12   // 80, was SEA_Y - 20 = 72
```
The gap between berth column 0 and column 1 is exactly `[berthX+54, berthX+90]`, 36px wide; `berthX+72` is its centre at every width. `sunX(480) = 91`, `sunX(1120) = 117`. The disc (`SUN_R = 13`) spans x 78..104 / 104..130 — clear of the colonnade (x 2..36), clear of the new name stone (x 40..78), clear of the amphorae (`w-42`) and the Pharos (`w-22`). Below the quay the sun path descends at x 91/117 while berth col-0's hull ends at x 73/99 and col-1 begins at 109/135 — always inside the 36px lane.

`SUN_CY = 80` finally delivers the half-set sun the docstring has always promised and never rendered. Disc rows become 67..93, the dead `if (y >= SEA_Y) break` now genuinely fires at y=92, and rows 80..91 fall inside the headland strip band — so the ridge (drawn after `drawSun`, inside `drawSky`) cuts the lower third wherever it is tall and the waterline clips the rest. Today the disc bottom is row 85 and the ridge tops out around 80-86, so the "clip" is 0-6 rows depending on width and reads as an accident.

THREE LIGHT SOURCES. THERE ARE NO OTHERS.
1. HELIOS — the key. Low and seaward. Because it is low it does not model form; it RIMS and SILHOUETTES. Its jobs: the sky ramp, the sun path on water, a 1px rim on the upper-left of solids, and the reason the foreground is dark. Contre-jour is what makes an Odyssey feel fateful.
2. THE FIRE — the Pharos, the braziers, and every torch. The only light that moves and changes. `PAL.beaconLamp`, `PAL.bronzeLit`, `PAL.sunCore`, `PAL.beacon`, `PAL.white`.
3. THE GAZE — the focus bracket. `PAL.gold` -> `PAL.marble #e8e0f5` in `engine.js draw()`. Present only while a viewer is looking, gone the instant they look away.

Everything else is reflected light. `hearthglow` (abilities.js) is the ONLY ground light in the Odyssey and it stays that way: its own comment says "an Archon gets more fire on the stone rather than a shadow — nothing else in this Odyssey casts one." That is a documented scarcity rule and it is load-bearing.

CUT: queue cast shadows. CUT: torch pools. Both were specified at `PIER_Y` = row 128, which is the exact row `hearthglow` paints (`h.y + 16` for a queued figure at `QUAY_FEET_Y = 112`), in three different colours from two systems that never spoke. And the shadow was specified at `x+9..x+13` while `layoutQueue` yields an 8.3px pitch at MAX_QUEUE — the effect billed as "the highest value-per-fill item in the spec" is buried inside the next man exactly when the rank is longest.

CUT: divine light shafts. Their sky half (y 66..90) is 100% occluded — rows 67..91 are the sun disc and rows 78..91 are the ridge strip. Their water half paints `PAL.sunSea` from `sunX` down the water, which is the existing sun path, in the same colour, in the same region. Two systems rendering sun-on-water reads as smear. Instead, make the one that already exists monumental, for zero added fills:

```js
// drawSea, replacing the single depth ternary — 0 added fillRects
const c = depth < 0.10 ? PAL.sun : depth < 0.28 ? PAL.sunSea : PAL.sunSeaDim
```

MATERIAL RESPONSE TABLE — apply per material, always on the upper-left / lower-right axis.
| material | base | rim (1px, up-left) | ink (1px, down-right) |
|---|---|---|---|
| bronze | `bronze` #c98b3f | `bronzeHot` #f5c97a | `bronzeShade` #3a2412 |
| bronze, whale | `gold` #fcd34d | `sunCore` #fff3d6 | `bronzeDark` #6e4a20 |
| marble | `marble` #e8e0f5 | none — ceiling | `marbleShade` #a396c4 |
| stone / quay | `pierTop` #4a3570 | `pierKerb` #7c6e96 | `shadeCool` #2b1d4d |
| wood / hull | `hullLit` #7a5230 | `deck` #a1743f | `hullDark` #2a1a10 |
| linen / sail | `sailA` #efe3c8 | none — ceiling | `bronzeDark` at the foot |
| clay | `clayLit` #a35c33 | `bronzeHot` #f5c97a | `clayDark` #6f3c25 |
| skin | `skin` #c9927a | `bronzeHot` #f5c97a | `bronzeDark` #6e4a20 |
| cloth | `cloak` (shade) | `cloakLit` IS the rim | `black` #0b0718 |
| water | seaHorizon..seaWine | `seaGlint` / `seaCrest` | `abyss` #050310 |

Three rules that make the table survive eleven pixels:
- R1 CEILING. A material already at L >= 0.60 (marble, linen, sailA, gold) cannot be rimmed — shade it instead. Its lit form IS the base colour. This is the only thing stopping the scene going white as light is added, and it is why the sun move costs one constant instead of forty pixel edits.
- R2 3px MINIMUM. A rim is applied only to a face >= 3px in the rimmed axis. Narrower forms take base colour and rely on the ink behind them.
- R3 INK BEATS RIM. Where a rim and an ink would land on the same pixel, the ink wins. Separation beats illumination. The aspis leading-edge ink already encodes this and it is the only thing keeping a rank of overlapping bronze rims from smearing into one bar — never remove it.

THE ONE DEMAND ON THE WARRIOR SPRITE. The aspis is the only >=5px face on the figure and currently takes no light at all. Two rects immediately after the `face` loop in `buildBody`:
```js
R(ctx, 1, 7, 1, 1, PAL.bronzeHot)   // upper-left of the disc
R(ctx, 2, 6, 2, 1, PAL.bronzeHot)   // top-left arc
```
Build-time only, zero per-frame cost. And the helmet dome must stay `PAL.bronze` (L .311) — against the new quay kerb (L .180) that is 1.61:1, which sounds bad but is irrelevant: `QUAY_FEET_Y = 112` and `HOPLITE_H = 17`, so 16 of the sprite's 17 rows sit over `seaHorizon` (L .0335), where the dome reads at 4.33:1. Only row 128 — the greaves, `bronzeDark` L .048 — touches the kerb, at 2.9:1. The "bronze helmets vanish on a marble quay" crisis in the incoming specs was an artefact of raising the quay to marble, which this system does not do.

REDUCED MOTION MUST REACH THE CANVAS. `prefers-reduced-motion` currently only reaches the DOM. Read it live, not as a module constant, so canvas and chrome agree without a reload:
```js
// pixel.js
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
export let reducedMotion = mq ? mq.matches : false
if (mq) mq.addEventListener('change', (e) => { reducedMotion = e.matches })
```
When true: all `CLASS_SCENE` mote emitters return early; brazier and Pharos `flare` pins to 0.4; `sealFlash` holds at its dimmest step for its full 0.30s instead of stepping; wave-strip scroll speed halves. The sea keeps moving — freezing it reads as a broken feed, and slow uniform drift is not a vestibular trigger.

THE ALPHA INVARIANT. There is no `ctx.save()`/`restore()` anywhere in `src/ship/`. Manual restoration is the ONLY thing preventing alpha leaking into the next draw call. Every function that writes `globalAlpha` must reset it to 1 on EVERY exit path including early returns. Corollary, from `motes.js`: a particle fades by stepping a colour ramp, never by alpha. Alpha is reserved for the four deterministic light effects where translucency is the entire point — haze, Pharos halo, seal flash, vignette.

---

## Environment & architecture

THE HORIZON STRIP IS THE MECHANISM. `buildRidges(w)` already bakes a static profile into a per-width cached canvas and blits it once per frame. A citadel and a temple are equally static, so they cost exactly the same as the ridges do: nothing. Grow the strip; put all far architecture inside it. Per-frame cost stays 1 `drawImage`.

```js
const RIDGE_H = 44          // was 14
// drawHeadlands: ctx.drawImage(ridgeStrip, 0, SEA_Y - RIDGE_H)   // y = 48, was 78
```
Strip-local y 0..43 maps to buffer y 48..91. Build order inside `buildRidges`, back to front — this ordering IS the depth sort:
1. THE CITADEL OF ILION
2. `ridge(PAL.islandFar, 12, 40, 2)` — unchanged (occupies local rows 32..43)
3. `ridge(PAL.islandNear, 7, 320, 2)` — unchanged (local rows 37..43)
4. waterline lip `R(g, 0, 42, w, 2, PAL.islandNear)` — 2px, was 1px. `seaHorizon` (L .0335) is lighter than the old `seaFar` (L .0194); a 1px lip loses the horizon.
5. THE TEMPLE — drawn LAST, in front of the near ridge, stylobate landing on the lip.

CROP SAFETY IS A HARD CONSTRAINT, AND IT KILLED THREE ELEMENTS. `present()` is a COVER blit with `baseW` clamped to 480..1120, so between the clamps the crop is sub-pixel but AT them it is severe: at 420x700 only buffer x 144..336 of 480 is on screen; at 900x700, 34px per side; on ultrawide, 46px top and bottom. Anything load-bearing must live in **x 0.25w..0.75w**. That is why the Colossus (anchored to `sunX`, which is 0.10w..0.19w under the new sun), the eastern stoa ruin (0.88w), the enlarged propylon (x=2, fully off-screen below 1.5:1) and the roadstead ruins are all cut. It is also why the citadel does NOT straddle the sun: the sun is now on the left, outside the safe band, and the protected composition — a monumental dark mass silhouetted against the brightest sky — is delivered instead against the rose horizon glow, at 66 luminance points of separation, which the environment spec itself identified as the sharpest silhouette available in the frame.

THE CITADEL OF ILION — 116 x 44, origin `(round(w * 0.42), 0)` = buffer y 48..91.
Mycenaean, not medieval. No merlons, no crenellated curtain, no keep windows, no "lower bailey" — that vocabulary is 12th-century Norman and it is exactly the asset-pack failure the brief forbids. The Bronze-Age vocabulary is cheaper AND more specific: cyclopean masonry (irregular joints, not ashlar courses), a BATTERED wall (top course inset 2px — one rect, and it instantly reads "not medieval"), one monumental corbelled gate with a relieving triangle above it (3 rects, and the single most legible "this is Mycenae" signal at any resolution), and a low pitched-roof megaron on the high point.

Drawn in TWO passes: the entire silhouette offset `(-1, 0)` in `PAL.islandNear` (the ink), then the real silhouette. Mechanical, needs no per-shape judgement, and it is load-bearing: at buffer y 58..68 the sky is `skyLow` (L .0713) and the wall is `wallFar` (L .0561) — 1.2:1, so the towers dissolve without the ink edge (islandNear L .0208 against skyLow = 2.3:1).

```
curtain wall     (0,26,116,18,WF)   batter (0,26,116,2,WL) then (2,24,112,2,WF)
cyclopean joints 9 rects 1x18 at x = 7,20,31,45,58,70,83,96,108  (IN)
gate tower       (2,14,20,30,WF)  cap (2,12,20,2,WL)
  corbelled gate void   (9,32,6,12,IN)
  relieving triangle    (10,29,4,1,IN) (11,28,2,1,IN) (12,27,1,1,IN)
megaron (high)   (46,6,26,38,WF)  ridge cap (46,4,26,2,WL)
  pitched roof   (52,0,14,2,WF) (49,2,20,2,WF)
  hearth door    (56,30,6,14,IN)
east bastion     (86,18,22,26,WF)  cap (86,16,22,2,WL)
lower terrace    (104,32,12,12,WF) (104,32,12,1,WL)
```
`WF` = `wallFar #543271` · `WL` = `wallFarLit #71427e` · `IN` = `islandNear #301c52`. All bodies run to local row 43 so both ridges bury the base and nothing floats. ~26 silhouette rects + ~26 ink rects = **52 rects, one-off per resize.**

Read up the mass: the megaron ridge (buffer 52..57, `skyDusk` L .0398) is 1.4:1 and survives on ink alone; the wall base (buffer 74..91, `skyEmber` L .1289 and `skyHorizon` L .2186) is 3.9:1 darker — a hard knife against the rose. A citadel whose roofline dissolves into dusk and whose wall cuts the horizon. That value inversion is the whole point and it is free.

THE TEMPLE OF THE HEADLAND — 34 x 17, origin `(round(w * 0.30), 27)` = buffer y 75..91, drawn last so it is never buried and never floats.
```
pediment (stoneFarLit)  (15,27,4,1) (10,28,14,1) (5,29,24,1) (1,30,32,1)
architrave              (0,31,34,2,stoneFar) + (0,31,34,1,stoneFarLit)
6 columns x = 1,7,13,19,25,31:
    shaft (x,33,3,8,stoneFarLit)   shade (x+2,33,1,8,stoneFar)   ink (x-1,33,1,8,islandNear)
stylobate               (0,41,34,3,stoneFar) + (0,41,34,1,stoneFarLit)
```
26 rects, one-off. The shafts land at buffer 81..88, dead inside the `skyHorizon` band (L .2186); `stoneFarLit` at L .0616 gives 2.6:1 — the sharpest silhouette in the background, which is correct because it is the sacred thing and it stands closest to the water. A pediment is the most recognisable Greek shape available at this resolution; it is worth its 4 rects. Note the column shade is on the RIGHT of each shaft, obeying the Light Law.

ONE RUIN, NOT FOUR. The existing `colonnadeSprite()` already has a snapped column. That is the Odyssey's single ruin and it stays that way. Four fallen drums across three specs said "this civilisation is dead" about a working port that seals a block every 340ms.

AERIAL PERSPECTIVE — the missing layer, 6 fills/frame.
Today far ships use `PAL.islandFar`, the same ink as the near headland: zero aerial perspective, and against the new `seaHorizon` they sit at 1.20:1 and are effectively invisible.
```js
/** Horizon glint — the lit hairline where sky meets sea. First in drawSea. */
R(ctx, 0, SEA_Y, w, 1, PAL.hullFar)          // 1 fill

/** Aerial perspective: the horizon washes toward the sky's rose. */
export function drawHaze(ctx, w) {
  ctx.fillStyle = PAL.haze
  const bars = [[93,2,0.22],[95,3,0.16],[98,4,0.11],[102,5,0.07],[107,6,0.04]]
  for (const [y, h, a] of bars) { ctx.globalAlpha = a; ctx.fillRect(0, y, w, h) }
  ctx.globalAlpha = 1                        // 5 fills, 5 alpha writes
}
```
DRAW ORDER IS LOAD-BEARING: `drawSea -> drawFarShips -> drawHaze -> drawShips(lanes)`. The far ships must be painted BEFORE the haze so they receive it. The transit fleet sits at TRANSIT_Y 186 / PASS_Y 224 / OUTBOUND_Y 269, entirely below row 113, and is untouched. And `farShipSprite`'s ink changes `PAL.islandFar -> PAL.hullFar` (1.20:1 -> 1.80:1). Result: distant hulls wash 22%->4% toward rose and finally sit BEHIND the water instead of on it.

THE MOLE — recolour only. NO ARCADE, NO FRIEZE.
The arcade was 154 fills/frame placing 12px-wide `pierFace` (L .0433) piers directly behind the berthed hulls (`hullDark` L .0126) — 15 luminance points of separation on the primary data object, at 27% coverage of that band against the current pilings' 6%. The figural frieze was 80 repeats of one 14px horseman: wallpaper, mush at fractional blit scale, and it would sit at y=137, 1px above `BERTH_Y = 138`, i.e. under six hulls and a rank of soldiers. Both cut. The quay's ornament budget goes entirely to the kerb.
```
y 127  1px  pierGlow  #836ef9   MONAD PURPLE — the brand line, full width
y 128  2px  pierKerb  #7c6e96   was marbleShade
y 130  4px  pierTop   #4a3570   unchanged + joints 1x4 every 9px in pierFace
y 134  2px  pierFace  #33254f   unchanged
pilings x = 10, step 52: leg 3x64 at y=134 (pierLeg), lit edge 1x64 (pierFace)
        on the -x side per the Light Law, cross-brace 15x1 at y=162
```

BRAZIERS — the empty right two-thirds, finally used. 3 blits + <=6 fills.
The berth field ends at x=279 and the muster ends at `queueEndX` = 349 at w=1120, so x 350..1120 holds nothing but water and quay. Every incoming placement rule put the braziers INSIDE the muster (one spec's own coordinates resolved to 5 braziers all under x=303, standing at row 128 among 28 soldiers at an 8px pitch, where a 5x23 post reads as a spear).
```js
/** Braziers live only in the empty band right of the muster. */
function brazierXs(w) {
  const from = queueEndX(w) + 40, to = w - 64          // clears amphorae at w-42
  const span = to - from
  if (span < 80) return EMPTY
  const n = Math.min(3, Math.floor(span / 80))
  const out = []
  for (let i = 0; i < n; i++) out.push(Math.round(from + (span * (i + 0.5)) / n))
  return out
}
```
w=480 -> 1 brazier at ~397. w=1120 -> 3 at ~455, 573, 691.
`brazierSprite()` 5 x 23, cached, base row 128 so it shares the hoplites' ground line; origin y = 106. 5 wide and 23 tall against an 11x17 figure: deliberately taller and half the width, so it reads as furniture and never as a soldier.
```
(0,21,5,2,pierKerb) (0,21,5,1,marbleShade)          base
(1, 8,3,13,marbleShade) (3,8,1,13,pierKerb)         shaft (shade on +x)
(0, 6,5,2,marbleShade)                              capital
(0, 3,5,3,bronze) (0,3,5,1,bronzeHot) (1,6,3,1,bronzeShade)   fire bowl
```
Flame, following the Pharos grammar exactly (alpha overdraw, never additive), de-synchronised per brazier:
```js
const ph = i * 1.9
const flare = (Math.sin(t * 3.1 + ph) + Math.sin(t * 1.7 + ph * 1.7)) / 2
if (flare > 0) {
  ctx.globalAlpha = 0.22 + flare * 0.34
  R(ctx, bx + 1, 107, 3, 3, PAL.beaconLamp)
  R(ctx, bx + 2, 105, 1, 3, PAL.sunCore)
  ctx.globalAlpha = 1        // MANDATORY on every exit path
}
```

THE NAME STONE — replaces `drawSignpost`, fixes a real collision, and costs 130 fewer fills.
Today `boardW = measurePixelText('MONAD ODYSSEY') + 12 = 63` at x=40, spanning x 40..102, while `rampTopX(480, 0) = 87` — the board overlaps the first plank head and bollard at minimum width. And the name is NOT changed to a Greek place-name: "Aulis" is famous for exactly one thing, Agamemnon sacrificing Iphigenia to buy wind, which inverts the emotional reading of the departure beat this whole Odyssey exists to produce; and on a phone (tagline hidden below 900px, board cropped by COVER) it would leave the product name nowhere on screen.
Stack it instead — two lines, which is both narrower and more monumental:
```
line 1 'MONAD'    3x5, 19px wide
line 2 'ODYSSEY'  3x5, 27px wide
boardW = 27 + 12 = 39     boardH = 3 + 5 + 2 + 5 + 3 = 18
x = 40, top = PIER_Y - 32 = 96   -> plate rows 96..113, x 40..78
posts 2x14 marbleShade at x=43 and x=74, rows 114..127 (feet meet PIER_Y)
line 1 origin (50, 99)   line 2 origin (46, 106)
bevel unchanged: top row + left column bronze; bottom row + right column black
```
x 40..78 clears `rampTopX(480,0) = 87` by 9px, clears the colonnade (x 2..36) by 4px. CACHE IT — the plate is static, so follow the existing `ridgeStrip` pattern: a module-level 39x18 canvas keyed on the label string, rebuilt only when the label changes. Cost drops from ~132 fillRects/frame to **1 drawImage + 2 fillRects**.

STEPPED VIGNETTE — 4 flat bars read as four flat bars. 12 bars, `PAL.abyss` (there must be a value below the darkest pixel), heavier at the bottom because `.hb-manifest` sits there and the near water must sink.
```
top    (0,0,w,8,.16) (0,8,w,8,.10) (0,16,w,8,.05)
bottom (0,306,w,14,.18) (0,296,w,10,.11) (0,288,w,8,.05)
left   (0,0,8,320,.10) (8,0,8,320,.06) (16,0,8,320,.03)
right  (w-8,0,8,320,.10) (w-16,0,8,320,.06) (w-24,0,8,320,.03)
```
+8 fills. The top stair stops at row 24; the citadel starts at 48, so the architecture is never dimmed — only the zenith recedes, which makes the stars pop and gives the citadel darkness to emerge from. The bottom stair's darkest bar covers rows 306..319, clear of the OUTBOUND_Y hull label at row 288.

ONE CSS LINE: `.hb { background: #0b0718 }` stays — it equals `PAL.black` and `present()` is a COVER fit that never letterboxes.

---

## Ships

The trireme is 54 x 26 with `DECK_Y = 16` — NOT 72 x 32. No geometry constant changes. `capacity.js`, `planShipLoad()`, `DECK_MAX`, `DECK_COLS`, `hullDepth`, the seat grid and the berth layout are untouched. Everything below is recolour, one taper fix, three additive treatments and one caching reclaim.

RANK / SIZE TIERS — already correct, do not touch. `size` is 0/1/2, supplied by the caller from the capacity plan so hull size and deck load always come from the same figure. `hullDepth(size) = 6 + size` = 6/7/8, and the strake loop tapers to the bow: `x0 = 3 + round(r*1.2)`, `x1 = 50 - round(r*0.4)`. A heavy block rides visibly lower. That IS the rank tier and it is derived from chain data.

RECOLOURS (sprites.js `shipFromBlock`, lines 253-256) — three hex literals leave the file:
```js
sail:    rnd() < 0.5 ? PAL.sailA : PAL.sailB,
stripe:  [PAL.crimson, PAL.beaconBand, PAL.laurelLit, PAL.laurel][floor(rnd()*4)],  // '#8b5cf6','#3f7f8f' gone
hull:    [PAL.hullMid, PAL.hullLit, PAL.hullWorn][floor(rnd()*3)],                  // '#5b3a22' gone
pennant: [PAL.crimson, PAL.seaFoam, PAL.laurel, PAL.bronzeLit][floor(rnd()*4)],
```
`rnd()` call count and order are UNCHANGED (4 draws), so the deterministic per-hash sprite stream is bit-identical and no cached ship key shifts.

THE MEANDER IS THE HOUSE MARK. `buildShip` already paints it in the sail centre — 3 rects at (10,7,5,1), (10,7,1,2), (14,8,1,1) — and it is now `PAL.beaconBand = #836EF9`, Monad Purple exact. Every hull in the fleet flies it. It is the ONLY violet permitted on any hull, ever, and the sail stripe carries no meaning: nobody may attach one.

THE PAINTED EYE AND THE BRONZE RAM ARE NEVER OMITTED. The eye (`marble` + `black` pupil at local 6,18) says the ship sees — a block validates, it is not blind cargo. The ram (`bronze` + `bronzeLit` at the waterline, local x 0..4) says the ship can act — state change, not storage. Both are 3 rects and both are load-bearing semantics.

EMPTY BENCHES ARE SACRED. The four `hullDark` bench seats at `bx = 22 + i*5` line up exactly with the engine's `DECK_X0 = 22` / `DECK_COL_STEP = 5` seat grid, so an unfilled bench is literally an unfilled seat. They are the truest thing in the scene: the visible difference between what a block could have carried and what it did. Never fill them decoratively, never animate a ghost crew into them, never hide them behind props. `capacity.js` is the sole authority on the count; this is its narrative charter.

RECLAIM A — THE HULL NUMERAL CACHE. 1020 fills/frame recovered, and it is a precondition for everything else in this document.
`drawPixelText(formatHullLabel(12345678))` renders "12.345.678" — 10 characters, 82 lit digit pixels plus 2 dot pixels = 84 `fillRect` calls, plus 1 backing plate = **85 per ship**. With 12 hulls on screen that is **1020 fills/frame — 36% of the entire measured frame spent painting block numbers.**
Block numbers are unique per ship, so they must NEVER enter the shared 400-entry FIFO sprite cache (guaranteed thrash). And they must not allocate a canvas per ship either: at Monad's ~3 blocks/s that is thousands of DOM canvas elements created and dropped per session, inside a layer whose whole argument is bounded pools. Use a fixed ring:
```js
/** 24 pre-allocated label canvases. Max concurrent hulls is 6 berths + ~8
 *  lanes = 14, so a slot can never be reused while its ship is on screen. */
const LABEL_RING = 24
const labels = Array.from({ length: LABEL_RING }, () => surface(48, 7))
let labelCursor = 0

export function claimHullLabel(number) {
  if (!number) return null
  const text = formatHullLabel(number)
  const tw = measurePixelText(text)              // 10 chars -> 39px
  const slot = labels[labelCursor]
  labelCursor = (labelCursor + 1) % LABEL_RING
  slot.ctx.clearRect(0, 0, 48, 7)
  R(slot.ctx, 0, 0, tw + 4, 7, PAL.hullDark)
  drawPixelText(slot.ctx, text, 2, 1, PAL.linen)
  return { canvas: slot.c, w: tw + 4 }
}
// makeShip():  label: claimHullLabel(block.number)
// drawShips(): if (s.label) ctx.drawImage(s.label.canvas, 0, 0, s.label.w, 7,
//                Math.round(x + SHIP_W / 2 - s.label.w / 2), y + DECK_Y + 2, s.label.w, 7)
```
Net: **85 fills -> 1 blit per ship.**

TREATMENT 1 — THE BOW WAVE. Ships have a wake astern but nothing at the ram, so motion reads only from position change. Anchor it to the WATERLINE, not the ram: the hull bottom is `y + DECK_Y + 1 + hullDepth(size)` = y+23..25, while the incoming spec placed it at y+21..22 — level with the bronze ram and 2-4px above the water, at the bow, where the eye tracks. Inside the existing `if (s.rowing)` block:
```js
const wl = y + DECK_Y + 1 + hullDepth(s.traits.size)
const beat = (Math.floor(t * 8 + s.phase) & 1)
R(ctx, x - 2, wl - 1 + beat, 3, 1, PAL.seaFoam)
R(ctx, x - 4, wl,            2, 1, PAL.seaGlint)
```
Two-frame beat, 1px amplitude. 2 fills per rowing ship, <=20 total.

TREATMENT 2 — THE SEAL. This is the climax of the whole visualiser and today it has ZERO pixels: `engine.js` flips `ship.boarding = false` and stamps `ship.sealedAt = elapsed`, and nothing in `drawShips`, `drawGangplank` or `drawHoplites` reads either value. The plank hauling in is the closest tell and it reads as the door closing, not as the block sealing.
(a) THE HULL GOES GOLD — but it must follow the taper. A flat `fillRect(x+3, y+DECK_Y+1, 48, hullDepth)` spills up to 8px left and 4px right of the hull into open water as a hard rectangle. Re-run the strake loop:
```js
const SEAL_ALPHA = [0.50, 0.26, 0.10]
if (s.sealFlash > 0) {
  ctx.globalAlpha = SEAL_ALPHA[s.sealFlash > 0.20 ? 0 : s.sealFlash > 0.10 ? 1 : 2]
  ctx.fillStyle = PAL.gold
  const hullH = hullDepth(s.traits.size)
  for (let r = 0; r < hullH; r++) {
    const x0 = 3 + Math.round(r * 1.2), x1 = SHIP_W - 4 - Math.round(r * 0.4)
    ctx.fillRect(x + x0, y + DECK_Y + 1 + r, x1 - x0, 1)
  }
  ctx.globalAlpha = 1
}
```
6-8 fills, three discrete 0.10s steps — stepped, not eased. Gold on the DARK hull, never on the sail: the sail is already near-white and a flash there is invisible. Draw it AFTER the sprite blit and BEFORE the label blit, or the flash washes out the block number 3x/second — a data-legibility regression on the exact beat that finalises the block.
(b) THE SEAL-FIRE, AT THE STERN POST — with its own silhouette. Reusing `flameSprite(RANK_ARCHON)` would make the block-sealing mark and an Archon transaction's torch the IDENTICAL 3x4 sprite, potentially 30px apart on the same frame, destroying the one law that says white means "this is the beacon". And at the masthead (local x 11..13, `y - 4`) it lands on buffer rows 134..137 for row-0 berths at y=138 — inside the quay (rows 127..135) — so the one reserved white pixel would render as grime on the kerb.
A dedicated 3x5 table in `flames.js`, built once and never evicted, blitted at `(x + 48, y + 1)` — on top of the stern post's curl at local (48,8) and (49,6,3,2). Rows y+1..y+5 = buffer 139..143 (row-0 berth) and 163..167 (row-1). Both clear of the quay by 4px, clear of the sail (local x 6..20), clear of the pennant (local x 13..17, rows 0..1).
```js
const SEAL_ART = [
  [[1,3,1,2,PAL.beacon],[1,2,1,1,PAL.linen]],
  [[1,2,1,3,PAL.beacon],[1,1,1,1,PAL.white]],
  [[1,1,1,4,PAL.beacon],[1,0,1,1,PAL.white],[0,2,1,1,PAL.beacon]],
  [[1,2,1,3,PAL.beacon],[1,1,1,1,PAL.linen],[2,2,1,1,PAL.beacon]],
]
```
Taller (5 not 4), narrower in body, NO gold and NO `beaconBand` violet — so it can never be confused with any rank torch, while white still means beacon. 4 phases at 16fps: `sealFireSprite(Math.floor(age * 16) & 3)`. `SEAL_FIRE_SECONDS = 0.45`.
(c) THE TOWER ANSWERS — see `vfx`. Ship reports, Odyssey acknowledges.
GATE, and the lifecycle bug it fixes: `sealedAt` is a timestamp that engine.js explicitly documents can legitimately be 0 on the first frame, so `sealedAt > 0` is not a safe test. Use a dedicated `ship.sealFlash` initialised to 0 in `makeShip`, set to 0.30 in `seal()`, and decremented at the head of BOTH the `berthShips` loop AND the `ships` loop. The common seal path (`passengers.length >= load && !stillLeaping`) flips `dock` to `'casting'` on the very next frame — `STRAGGLER_GRACE` is a ceiling on the wait, not a floor — so the flash survives only on the 0.38s plank retraction, an 0.08s margin on a constant another layer owns. Decrementing in both arrays removes the dependency entirely.

TWO ALLOCATIONS PER FRAME, REMOVED. `drawShips` does `[...ships].sort((a,b) => a.y - b.y)` and is called TWICE per frame — two array allocations every frame, against a particle pool that is scrupulously allocation-free. Replace with a module-level scratch array refilled in place:
```js
const order = []
export function drawShips(ctx, ships, t) {
  order.length = 0
  for (let i = 0; i < ships.length; i++) order.push(ships[i])
  order.sort((a, b) => a.y - b.y)
  ...
}
```

THE OARS STAY AS THEY ARE. `OAR_COUNT = 6` at `OAR_X0 = 10`, `OAR_STEP = 5`, entry at `y + DECK_Y + 1 + hullDepth`. A moored ship ships its oars — six 1x8 verticals against the hull — and the instant they go upright, the bob stops and the wake vanishes on the same frame. That triple stop is the held breath before the plank runs out, it is already correctly built, and it is the most underrated beat in the scene.

---

## Blocks as sacred relics

A BLOCK IS A SHIP IN THE CATALOGUE — a company, not a container. Homer never lists cargo; he lists men and the hulls that carried them. The Catalogue of Ships is the ur-block-explorer: 1,186 hulls, each named, each with a counted company, each admitted to be an incomplete accounting. That is literally what this software does, and the metaphor is never spoken aloud on screen.

A block has exactly five properties and every one of them is already computed:
- A NAME — its number, painted amidships on the topmost strake in `PAL.linen` on a `PAL.hullDark` plate. It is the only name a ship gets. `formatHullLabel` deliberately omits the '#' because at 3px wide that glyph is indistinguishable from an 'A' and costs 4px the hull does not have.
- A COMPANY — `planShipLoad().load`, the crew the chain gave it. UNTOUCHABLE.
- A DRAUGHT — `size` 0/1/2 via `hullDepth = 6 + size`, so a heavy verse is a heavy hull that rides visibly lower.
- EMPTY BENCHES — `capacity - load`, seats it was given and did not use. Sacred.
- ONE DEPARTURE, and no return. Nothing in this Odyssey moves east.

THE TEN-BEAT LIFE OF A BLOCK. All timings derived from live engine constants at w=480 and w=1120.
1. SIGHT (2.9s at w=480, 6.7s at w=1120). A hull appears at the right edge out of clear water, six oars sweeping, wake behind it, bobbing +/-1px. `APPROACH_SPEED = 165 px/s`. By far the longest beat and it must stay that way — this is why the Odyssey has to be wide.
2. TURN-IN (~0.8s). Over the last `TURN_IN = 130px` the hull angles up out of the fairway (y=186) onto its mooring line (y=138 or 162), passing IN FRONT of anything already alongside. `drawShips` sorts by y for exactly this.
3. THE STILLNESS (~0.1s, and it must be felt). `dock = 'moored'`, `rowing = false`. Oars upright, bob dead, wake gone — three things stop on the same frame.
4. THE WAY OPENS (0.38s, `PLANK_SECONDS`). The plank runs out from `rampTopX` to the after deck, a `bronzeDark` cleat every 5th step.
5. THE CROSSING (0.04s per man, `BOARD_INTERVAL`; <=0.64s for a full deck of 16). Men leap at 200 px/s in arcs, filling the deck back-row-first so each arrival lands in front of the last. The only fast, violent, joyful thing in the Odyssey. `pickQueued` sends the highest rank first, oldest on ties — high-value, high-gas transactions really do get in first, and that is the order's one act of agency.
6. **THE SEAL (0.30s flash / 0.45s fire) — THE CLIMAX, AND TODAY IT HAS NO PICTURE.** Hull goes gold along its taper; a beacon-fire lights at the stern post; the Pharos answers with one brighter pulse for 0.25s. Ship reports, Odyssey acknowledges, the message goes on west. See `ships` and `vfx` for exact construction. This is the highest-value change in the entire redesign and it must be built and looked at BEFORE any label is written.
7. THE STRAGGLERS (0.35s, `STRAGGLER_GRACE`). Anyone mid-leap lands. Nobody is left in the air.
8. CASTING OFF (0.38s). The plank hauls back in, quay-end last.
9. THE WESTING (~4s). Oars bite, 36 px/s^2 to a 62 px/s ceiling, and over `DEPART_RUN = 110px` she drops from the mooring line into the outbound lane at y=269 — nearer the viewer, larger in frame, at her most present at the exact moment she is leaving. The departure beat must feel like ASCENSION, not bereavement: a block reaching finality is kept, not lost.
10. GONE. Off the left edge. Every passenger flips to `'gone'`, `sailed++`.
Total on-screen life: 8-14s, of which ~9s is approach and departure. Protect that ratio — the Odyssey is not a machine that processes blocks, it is a place where you watch one arrive, matter, and go.

THE SIX MOORINGS, IN THE UI. `engine.snapshot()` already emits, per berth, a fully-populated row — `{ slot, number, boarded, load, capacity, deckMax, txCount, fillPct, state }` — and `ShipPage.jsx` currently renders NONE of it. That is the largest missing information surface on the page and it is free to add.

```jsx
<div className="hb-berths">
  <div className="hb-berths-head">
    <span><i className="hb-ico is-hull" aria-hidden="true" />MOORINGS</span>
    <b>{busy}/6</b>
  </div>
  <div className="hb-berths-grid">
    {snap.berths.map((b, i) => (
      <div key={i} className={`hb-berth${b ? '' : ' is-empty'}`}>
        <div className="hb-berth-line">
          <span className="hb-berth-no">{b ? `#…${String(b.number).slice(-3)}` : '—'}</span>
          <b className="hb-berth-load">{b ? `${b.boarded}/${b.load}` : '—'}</b>
        </div>
        <span className="hb-berth-bar"
              style={{ '--gas': `${Math.min(100, b?.fillPct ?? 0)}%` }}>
          <em className="is-load" style={{ width: pctOf(b?.load, b?.deckMax) }} />
          <em className="is-fill" style={{ width: pctOf(b?.boarded, b?.deckMax) }} />
        </span>
      </div>
    ))}
  </div>
</div>
```
GEOMETRY, and why the incoming 3-column-with-side-numbers layout was unshippable: at a 248px board, `(248 - 4 border - 22 padding - 12 gaps) / 3 = 70px` per cell, and a `26px | 1fr | 30px` grid leaves a **14.67px track**. At `DECK_MAX = 16` that is 0.92px per seat — a one-seat delta is sub-pixel and invisible, and the gas caret has ~7 addressable positions. Stack instead: two rows per cell, numbers on the first, a full-cell-width bar on the second. **Track = 70px = 4.4px per seat.** The 3x2 grid still mirrors `BERTH_COLS = 3` / `BERTH_ROWS = 2` exactly, so the spatial mapping to the canvas survives.

FIVE FACTS PER BERTH IN 70px:
- WHICH BLOCK — last 3 digits, `--hb-faint`, tabular.
- SEATS THE BLOCK NEEDS — `em.is-load`, `--hb-demand #7c6e96`, 45deg-free vertical hatch. A different HUE from the fill, not a second step of one hue: the berth gauge is where a user reads "how full is this block" at a glance, and a same-hue monochrome pair kills that for peripheral vision and for red-green deficiency. Gilding is a lovely metaphor; it belongs in the prose, not in the bar.
- SEATS TAKEN — `em.is-fill`, `--hb-capacity #fcd34d`, solid, drawn over the demand bar. 3.19:1 against demand, plus texture, plus the numeral. Three channels.
- GAS FILL — `::after`, a 1px `--hb-dim` tick riding the trough at `left: var(--gas)`. Spends `fillPct`, which the engine already emits and the UI throws away, and lets an operator see at a glance whether seat count and gas fill agree.
- IDLE — `.is-empty` at `opacity: 0.5` with the trough hatched in bronze at 0.14 alpha: an unoccupied mooring, not a faded widget.
The shared `deckMax` scale is non-negotiable — the engine's own comment explains that bars drawn against each ship's own capacity would make a full small hull look identical to a full large one.

THE TROUGH IS CUT INTO THE STONE, not drawn on it — the Light Law inverted:
```css
.hb-berth-bar {
  position: relative; display: block; height: 7px; overflow: hidden;
  background: var(--hb-recess); border: 0;
  box-shadow: inset 0 1px 0 rgba(0,0,0,0.95), inset 1px 0 0 rgba(0,0,0,0.95),
              inset 0 -1px 0 rgba(244,241,255,0.16), inset -1px 0 0 rgba(244,241,255,0.16);
}
.hb-berth-bar em { position: absolute; inset: 1px auto 1px 1px; display: block;
                   transition: width var(--t-fill) var(--e-6); }
.hb-berth-bar .is-load { background-color: var(--hb-demand); background-image: var(--hb-hatch); }
.hb-berth-bar .is-fill { background: var(--hb-capacity); }
.hb-berth-bar::after { content: ''; position: absolute; top: 0; bottom: 0; width: 1px;
                       left: var(--gas, 0%); background: var(--hb-dim); opacity: 0.75; }
```
The `steps(6, end)` fill transition is deliberate: quantised, matching the canvas, and it reads as seats arriving rather than a bar sliding.

THE TALLY STRIP — also currently unrendered, also free. `queued` / `sailed` / `skipped` sit in `snapshot().stats` and nothing shows them. Three cells under the metrics, each with an 9x9 icon and a semantic colour:
- WAITING — `--hb-queue` violet, the upright spear.
- SAILED — `--hb-sailed` laurel, the sail.
- UNSUNG — `--hb-lost` crimson, the broken column. `skipped` is the honesty counter: real arrivals the quay had no room to show. Removing it would make the visualisation quietly lie about throughput, and crimson is the point — it should look like a cost. A ruin is the correct icon for it; a diamond meant nothing.

---

## DOM chrome

EXACT CSS PER DOM SURFACE. All of it goes in `src/pages/ShipPage.css`. The file's own header thesis — hard 2px edges, no rounded corners, offset shadows instead of blur — is correct and is now enforced rather than merely stated.

THE FIVE-SHADOW CARVED PLAQUE. This is the whole redesign in one rule. Applied as a grouped selector, NOT a new class — no JSX churn, and it matches the existing shared-treatment block at lines 53-61.
```css
.hb-board, .hb-guide, .hb-card, .hb-tool, .hb-panel {
  position: relative;
  border: var(--rule) solid var(--hb-frame);
  background-color: var(--hb-panel);
  background-image: var(--hb-tooled);
  border-radius: 0;
  box-shadow:
    inset  1px  1px 0 0 var(--hb-frame-lit),          /* a) torch on the bronze, upper-left */
    inset -1px -1px 0 0 var(--hb-frame-dark),         /* b) shade, lower-right */
    inset  0    2px 0 2px rgba(0,0,0,0.72),           /* c) THE INCISION: field below frame */
    inset  2px  0   0 2px rgba(0,0,0,0.72),
    inset  0   -1px 0 2px rgba(244,241,255,0.10),     /* d) inverted on the far side — this */
    inset -1px  0   0 2px rgba(244,241,255,0.10),     /*    is what says "cut INTO stone" */
    var(--hb-shadow);                                 /* e) cast on the world */
}
```
Read order for a viewer: 2px bronze band -> 2px dark fillet -> stone field. Three distinct depths in 4px of edge, zero blur. THREE cues and only three (bevel, incision, cast shadow). NO rivets, NO banded panel face, NO inset glow — four cues is a Windows-95 skin, and the rivet pseudo-element collides with the card's accent ribbon at inset 3px anyway. `.hb-panel` MUST be in this list: today it duplicates the three panel declarations in its own rule and would silently miss everything.
Note `background-color` + `background-image`, never the `background` shorthand — the shorthand resets `background-image` and would silently kill the tooling. And the tooling is 90deg vertical: a 103deg 1px stop antialiases by construction and produces exactly the soft artefact this file bans.
The two state rules that currently flatten the bevel must become full 4-value or they will drop it in the states users spend the most time in:
```css
.hb-panel.is-open { border-color: var(--hb-frame-lit) var(--hb-frame-dark)
                                 var(--hb-frame-dark) var(--hb-frame-lit); }
.hb-tool.is-on    { border-color: var(--hb-capacity); }   /* deliberate flat, see below */
```

PERFORMANCE. `.hb-board` repaints ~3x/second beside a canvas blitting a 1120x320 buffer at 60fps, and now carries a repeating gradient plus six shadows invalidated together. Add `contain: paint` to `.hb-board`, `.hb-panel-body` and `.hb-manifest`.

`.hb-tagline` — THE EPIGRAPH. Copy: **"EVERY BLOCK SAILS · THE SEA KEEPS THE COUNT"** (39 chars). Original in the Homeric register; do not quote Homer verbatim — attribution noise for zero gain.
```css
.hb-tagline { top: 18px; left: 50%; transform: translateX(-50%); z-index: 4;
  margin: 0; padding: 0; max-width: min(720px, calc(100vw - 340px));
  text-align: center; font-size: 17px; line-height: 1.1;
  letter-spacing: 0.26em; text-indent: 0.26em;   /* indent cancels trailing track */
  text-transform: uppercase;                     /* was lowercase */
  color: var(--hb-faint); text-shadow: 2px 2px 0 rgba(4,2,11,0.9);
  pointer-events: none; }
.hb-tagline::before, .hb-tagline::after { content: ''; position: absolute; top: 50%;
  width: 30px; height: 1px; background: var(--hb-frame); }
.hb-tagline::before { right: calc(100% + 12px); }
.hb-tagline::after  { left:  calc(100% + 12px); }
```
Two bronze rules flank it so it reads as a lintel inscription, not a strapline. Still `display:none` below 900px.

`.hb-board` — THE GREAT STELE. `width: 220px -> 248px` (the berth grid needs it; the math is in `blocks`). `padding: 0 0 var(--sp-4)` — padding moves into the sections.
```css
.hb-board { top: 16px; left: 16px; z-index: var(--z-board); width: 248px;
            padding: 0 0 var(--sp-4); background-color: rgba(14,9,30,0.90);
            contain: paint; }
.hb-board-head { display:flex; align-items:center; justify-content:space-between;
  gap: var(--sp-4); margin: 0; padding: var(--sp-5) var(--sp-5) var(--sp-3);
  border-bottom: var(--rule) solid var(--hb-edge-dim); }
.hb-board-head h1 { margin: 0; font-size: 23px; line-height: 1; font-weight: 400;
  letter-spacing: 0.15em; white-space: nowrap; color: var(--hb-ink);
  text-shadow: 2px 2px 0 rgba(4,2,11,0.92), -1px -1px 0 rgba(252,211,77,0.18); }
```
The gold-leaf incision (hard groove below, gold lip above) replaces `text-shadow: 2px 2px 0 rgba(124,107,255,0.45)` — a violet offset is a neon-sign device, not a carved one. MONAD stays in the h1 at full size: this is a Monad-branded product and demoting the brand word to a quiet kicker above a larger ODYSSEY is the wrong trade.

`.hb-net` — THE OATH BADGE. Three differentiating channels beyond colour.
```css
.hb-net { flex-shrink: 0; position: relative; padding: 3px 8px 2px 20px;
  font-size: 14px; line-height: 1.3; letter-spacing: 0.16em; text-indent: 0.16em;
  border: var(--rule) solid currentColor;
  box-shadow: inset 1px 1px 0 rgba(244,241,255,0.16), 2px 2px 0 rgba(4,2,11,0.7); }
.hb-net.is-live { color: var(--hb-live); background: rgba(157,186,99,0.10); }
.hb-net.is-demo { color: var(--hb-false);
  background: repeating-linear-gradient(90deg, rgba(232,105,122,0.18) 0 1px,
              rgba(0,0,0,0) 1px 4px), rgba(232,105,122,0.06); }
.hb-net::before { content:''; position:absolute; left:5px; top:50%; margin-top:-5px;
  width:10px; height:10px; background-color: currentColor;
  -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
  -webkit-mask-size:10px 10px; mask-size:10px 10px; }
.hb-net.is-live::before { mask-image: var(--ico-sprig); -webkit-mask-image: var(--ico-sprig);
  animation: hb-gutter 2.4s steps(2, end) infinite; }
.hb-net.is-demo::before { mask-image: var(--ico-ring);  -webkit-mask-image: var(--ico-ring); }
@keyframes hb-gutter { 0%, 55% { opacity: 1 } 56%, 100% { opacity: 0.55 } }
```
Live fire breathes to 0.55 and never switches off; DEMO does not animate at all — nothing is arriving, so nothing should move. The old `hb-blink` dropped to 0.15 for 40% of every cycle, which for a liveness indicator is worse than useless. Add `.hb-net.is-live::before` to the reduced-motion block or the distinction silently collapses to hue for those users.

`.hb-tools` — 32px was already below the 44px touch guideline; a redesign must grow it.
```css
.hb-tools { top: 18px; right: 18px; z-index: var(--z-tools); display:flex; gap: var(--sp-3); }
.hb-tool { width: 40px; height: 40px; display:inline-flex; align-items:center;
  justify-content:center; color: var(--hb-dim); cursor:pointer; text-decoration:none;
  box-shadow: inset 1px 1px 0 var(--hb-frame-lit), inset -1px -1px 0 var(--hb-frame-dark),
              var(--hb-shadow-sm);
  transition: color var(--t-snap) var(--e-2), border-color var(--t-snap) var(--e-2),
              background-color var(--t-snap) var(--e-2), transform var(--t-snap) var(--e-2); }
.hb-tool svg { width: 18px; height: 18px; }
.hb-tool:hover { color: var(--hb-ink); border-color: var(--hb-capacity); }
.hb-tool.is-on { color: var(--hb-capacity); border-color: var(--hb-capacity);
  background-color: rgba(252,211,77,0.10); }
.hb-tool.is-on::before { content:''; position:absolute; left:3px; right:3px; bottom:3px;
  height:3px; background: var(--hb-capacity); }   /* state is not colour-only */
.hb-tool:active { transform: translate(2px,3px); box-shadow: none;
  border-color: var(--hb-frame-dark) var(--hb-frame-lit)
                var(--hb-frame-lit) var(--hb-frame-dark); }  /* bevel INVERTS: driven in */
@media (max-width: 640px) { .hb-tool { width: 44px; height: 44px; } }
```

`.hb-rail` — STRUCTURAL JSX FIX. Today `.hb-card ~ .hb-guide { top: 214px }` hard-codes the card's height; any redesign breaks it. Wrap card + guide in one flow container and delete line 289.
```jsx
<div className="hb-rail">
  {focus && <article className="hb-card" style={{ '--hb-accent': focus.color }}>…</article>}
  {showGuide && <aside className="hb-guide">…</aside>}
</div>
```
```css
.hb-rail { position:absolute; top:66px; right:18px; z-index: var(--z-rail);
  display:flex; flex-direction:column; align-items:stretch; gap: var(--sp-5);
  width: min(272px, calc(100vw - 36px)); pointer-events:none;
  max-height: calc(100vh - 66px - 44px);   /* at ALL widths, not just mobile */
  overflow-y: auto; overscroll-behavior: contain; }
.hb-rail > * { pointer-events:auto; position: static; width: 100%; }
```
Without the bound, card (~230px) + guide (12 items + closing paragraph, ~360px) runs under the 34px manifest and off-screen on any viewport under ~700px tall.

`.hb-card` — THE ACCENT RIBBON, and the production bug it fixes. `--hb-accent` NEVER colours text.
```css
.hb-card { padding: var(--sp-5) var(--sp-5) var(--sp-5) calc(var(--sp-5) + 5px);
           border-color: var(--hb-frame); animation: hb-rise var(--t-step) var(--e-3) both; }
.hb-card::before { content:''; position:absolute; left:0; top:0; bottom:0; width:5px;
  background: var(--hb-accent, var(--hb-violet));
  box-shadow: 1px 0 0 var(--hb-dim); }   /* the 1px hairline guarantees 3:1 regardless
                                            of how dark the cloak signal is */
.hb-card h2 { margin:0; font-size:20px; font-weight:400; letter-spacing:0.05em;
              color: var(--hb-ink); }    /* NEVER var(--hb-accent) */
```
Engine change required: `focus.color = focus.traits.cloakSignal` (the third element of the CLOAKS triple), not `traits.cloak`. Verified live defect: `engine.js` sets `color: focus.traits.cloak`, `ShipPage.jsx:300` pipes it in, `ShipPage.css:303` paints `.hb-card h2` with it — and every cloak shade (#6b1f28, #1e3a4a, #2a3d28...) renders at roughly 1.2:1 on the card. The inspector title is invisible in production today.

`.hb-rank` — KILL THE ONLY BLUR IN THE FILE. `is-rank-3` and `is-rank-4` currently ship `text-shadow: 0 0 8px` / `0 0 10px`. Replace with a hard plate that mirrors `flames.js` exactly, so the fire that identifies a soldier on the quay names them here:
```css
.hb-rank { padding: 1px 6px 0; font-size: 14px; letter-spacing: 0.12em;
           border-left: 3px solid currentColor; color: var(--hb-rank-1); }
.hb-rank.is-rank-0 { color: var(--hb-rank-0); }
.hb-rank.is-rank-1 { color: var(--hb-rank-1); }
.hb-rank.is-rank-2 { color: var(--hb-rank-2); }
.hb-rank.is-rank-3 { color: var(--hb-rank-3); text-shadow: 1px 1px 0 rgba(4,2,11,0.9); }
.hb-rank.is-rank-4 { color: var(--hb-rank-4); border: 2px solid var(--pr-white);
                     border-left-width: 3px; }   /* the only white border on the page */
```

`.hb-card-abilities` and `.hb-card-hash`. Both surfaces exist in JSX and one is under-specified. The hash sits in a cut channel — machine data pressed into stone — and the synthetic branch becomes visibly a DIFFERENT MATERIAL from a real hash, which strengthens the honesty guard rather than merely preserving it:
```css
.hb-card-hash { margin: 0 0 var(--sp-3); font-family: var(--hb-mono); font-size: 10px;
  line-height: 1.5; letter-spacing:-0.02em; color: var(--hb-dim);
  padding: 3px 5px; background: var(--hb-recess);
  box-shadow: inset 0 1px 0 rgba(0,0,0,0.9), inset 0 -1px 0 rgba(244,241,255,0.10);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.hb-card-hash.is-synthetic { font-family: var(--hb-display); font-size: 14px;
  letter-spacing: 0.08em; color: var(--hb-quiet); background: none; box-shadow: none;
  padding: 0; }
.hb-card-abilities i { font-size: 10px; }   /* was 9px — below the mono floor */
```

`.hb-panels` / `.hb-panel-body` — RULED TIMBER, a ship's ledger. `bottom: 46px -> 52px` to clear the meander rail.
```css
.hb-panel-body { padding: var(--sp-3) 10px var(--sp-4);
  border-top: var(--rule) solid var(--hb-edge-dim);
  background-color: var(--hb-timber);
  background-image: repeating-linear-gradient(0deg,
      rgba(0,0,0,0) 0 15px, rgba(0,0,0,0.30) 15px 16px);
  box-shadow: inset 0 2px 0 rgba(0,0,0,0.55); contain: paint; }
.hb-panel-row { color: var(--hb-faint); }        /* 6.0:1 on timber */
.hb-panel-row:first-child { color: var(--hb-dim); }   /* 10.1:1, newest */
.hb-panel-row.is-idle { color: var(--hb-quiet); font-family: var(--hb-display);
                        font-size: 13px; letter-spacing: 0.08em; }
.hb-panel-caret { width:7px; height:7px; border-right:2px solid var(--hb-frame);
  border-bottom:2px solid var(--hb-frame); transform: rotate(-45deg); margin-right:2px;
  transition: transform var(--t-snap) var(--e-2); }
.hb-panel.is-open .hb-panel-caret { transform: rotate(45deg); margin-top:-3px; }
```
Panel titles KEEP their technical nouns: **"MEMPOOL"** and **"BLOCK PRODUCTION"**. These are the two panels an engineer reads to confirm the thing is working; renaming them "THE MUSTER" and "THE SAILING" is myth applied to load-bearing instrumentation, and `aria-label` does not help a sighted user scanning at speed. The one honest clarification: the two counts mean different things (mempool is a session-cumulative total, block production is the current height), so the mempool count gets `data-kind="total"` and a `::before { content: 'Σ'; }`-free hairline marker `·` in `--hb-quiet`.

`.hb-manifest` — THE CARGO LEDGER, and the page's single meander.
```css
.hb-manifest { left:0; right:0; bottom:0; z-index: var(--z-manifest); height: 34px;
  display:flex; align-items:stretch; background-color: var(--hb-timber);
  background-image: repeating-linear-gradient(90deg, rgba(0,0,0,0.26) 0 1px,
                    rgba(0,0,0,0) 1px 7px);
  border-top: var(--rule) solid var(--hb-frame);
  box-shadow: inset 0 2px 0 rgba(0,0,0,0.55); contain: paint; }
.hb-manifest::before { content:''; position:absolute; left:0; right:0; top:-10px; height:8px;
  background-color: var(--hb-frame);
  -webkit-mask-image: var(--hb-meander); mask-image: var(--hb-meander);
  -webkit-mask-repeat: repeat-x; mask-repeat: repeat-x;
  -webkit-mask-size: 16px 8px; mask-size: 16px 8px; }
.hb-manifest-tag { padding: 0 13px; background: var(--hb-frame); color: var(--hb-knockout);
  font-size: 16px; letter-spacing: 0.20em; text-indent: 0.20em;
  box-shadow: inset 0 1px 0 var(--hb-frame-lit), inset 0 -1px 0 var(--hb-frame-dark); }
.hb-manifest-item i { color: var(--hb-cat-other); }
.hb-manifest-item.is-transfer i       { color: var(--hb-cat-transfer); }
.hb-manifest-item.is-defi i           { color: var(--hb-cat-defi); }
.hb-manifest-item.is-nft i            { color: var(--hb-cat-nft); }
.hb-manifest-item.is-contractCall i   { color: var(--hb-cat-call); }
.hb-manifest-item.is-contractDeploy i { color: var(--hb-cat-deploy); }
.hb-manifest-item.is-other i          { color: var(--hb-cat-other); }
```
Tag copy stays **"IN BLOCK"** — knockout on solid bronze at 6.8:1, the page's only inverted element, and a manifest word nobody has to decode. The meander is the ONE ornament instance on the page: three meanders in a viewport is wallpaper; one full-width rail is architecture. 16x8 unit with 2px strokes, not 12x7 with 1px — 1px counters close at DPR 1.5 and read as a smear.

MOTION — three keyframes, all `steps()`, zero eased transitions anywhere.
`hb-rise` 140ms steps(3) (card, guide) · `hb-lade` 180ms steps(3) (manifest items) · `hb-gutter` 2400ms steps(2) (live badge). Plus `--t-snap` steps(2) on tools/panels and `--t-fill` steps(6) on the berth bars. FORBIDDEN: any `ease`, `ease-out`, `cubic-bezier`, `linear`; any non-zero blur radius; any transition over 260ms; any opacity animation on a data value.

FOCUS — the existing `outline: 2px solid var(--hb-cyan)` fails against a bronze frame (2.08:1). Back it in night so it is guaranteed regardless of what is behind it:
```css
.hb a:focus-visible, .hb button:focus-visible {
  outline: 2px solid var(--hb-focus); outline-offset: 3px;
  box-shadow: 0 0 0 5px var(--hb-night), var(--hb-shadow-sm); }
```
15.9:1 against its own surround. Keep `:focus-visible`, never `:focus`.

RESPONSIVE — `.hb-guide { display: none }` below 640px is a legibility failure, not a design choice: under this system the guide is the ONLY place crest, blazon, torch rank and empty benches are taught, so shipping it hidden produces a phone build that is pure unexplained cosplay.
```css
@media (max-width: 900px) { .hb-tagline { display: none; } }
@media (max-width: 640px) {
  .hb-board { top:10px; left:10px; right:66px; width:auto; }
  .hb-board-head h1 { font-size: 19px; }
  .hb-metric b, .hb-tally b { font-size: 21px; }
  .hb-berths-grid { grid-template-columns: repeat(2, 1fr); }
  .hb-tools { top:10px; right:10px; flex-direction: column; }
  .hb-rail { top:auto; bottom:84px; left:10px; right:10px; width:auto; max-height:52vh; }
  .hb-guide { display: block; }         /* NO LONGER HIDDEN */
  .hb-panels { display: none; }
  .hb-manifest-item { padding: 0 10px; }
  .hb-manifest-tag { padding: 0 9px; letter-spacing: 0.12em; }
}
@media (prefers-reduced-motion: reduce) {
  .hb-card, .hb-guide, .hb-manifest-item { animation: none; opacity: 1; transform: none; }
  .hb-berth-bar em { transition: none; }
  .hb-net.is-live::before { animation: none; opacity: 1; }
  .hb-tool, .hb-panel, .hb-panel-head, .hb-panel-caret { transition: none; }
  .hb-tool:active { transform: none; }
}
```
A11Y CONTRACTS PRESERVED VERBATIM: `aria-pressed` + `aria-label` on both toggles, `aria-label` on the exit Link, `aria-expanded` + `aria-controls` on both panel heads, `aria-label="Monad Odyssey readout"` on the board, `aria-live="off"` on the manifest (it changes 3x/second and would flood a screen reader), the canvas `aria-label`, and `aria-hidden="true"` on every `<i>` and every decorative SVG.

DEAD CODE REMOVED: `ShipPage.css:289` (`.hb-card ~ .hb-guide { top: 214px }`), `ShipPage.css:349` and `:353` (the two blur shadows), `ShipPage.jsx:76-85` (runtime font `<link>` injection — moves to `index.html`), and the `wght@400;600` on JetBrains Mono (600 is requested and never used). `lucide-react` stays a dependency — nine other files import it — but the `ShipPage.jsx:3` import goes.

---

## Typography

TWO FACES. NO NEW DOWNLOADS. NO CINZEL.

Cinzel is cut, decisively. It is Natanael Gama's revival of first-century ROMAN inscriptional capitals — its own fallback stack names 'Trajan Pro' second — which is ~1,300 years and one civilisation away from a Homeric brief; it is simultaneously the single most predictable "ancient" pick on Google Fonts; and shipping it would have required a per-element `-webkit-font-smoothing: antialiased` override fighting `.hb`'s inherited `none`, a mechanism that has NO EFFECT on Windows or Linux and is ignored entirely by Firefox — so the stated basis of the entire two-material typographic identity would not exist for most viewers. Cutting it also deletes the font-subsetting build step, the four woff2 artefacts, the `font-display: block` invisible-heading risk, the Georgia-metric FOUT reflow, and the "measure ODYSSEY before finalising the board width" unknown. Greek inscriptional letterforms are monoline — no stroke contrast, no bracketed serifs — which is exactly what a bitmap face already is. The Greek-ness comes from the meander and the icons, never from letterforms.

ROLE 1 — DISPLAY: **VT323**, one weight (400, the family has no other). Every heading, label, numeral, state string, legend line and tag. Keeps `-webkit-font-smoothing: none`, which is what welds the chrome to an unsmoothed blit.
ROLE 2 — DATA: **JetBrains Mono 400**. Hashes and raw feed lines only, at 10px/1.55. Three selectors and no more: `.hb-card-hash`, `.hb-panel-row`, `.hb-manifest-item`. The rule is: if it is a hash or a verbatim feed line it is mono; everything else is the display face.
ROLE 3 — BITMAP: the canvas 3x5 `GLYPHS`. Lives ONLY on canvas, never in the DOM.

LOADING. Delete `ShipPage.jsx:76-85` (the runtime `<link>` injection). It is not discoverable by the preload scanner, guarantees a FOUT plus reflow on every cold entry to /ship, and leaks a `<link>` into `<head>` for the rest of the SPA session. Move it to `index.html`, after the existing preconnects at lines 37-38:
```html
<link href="https://fonts.googleapis.com/css2?family=VT323&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
```
Weight 600 is dropped (requested today, never used). Net: /ship goes from 3 downloaded families to 2, and the request now starts in the document's initial HTML — a real CLS win for zero cost.

TYPE SCALE — 11 fixed px steps. The jump from 14px labels to 25px numerals is 1.8x and that gap IS the design: every panel has exactly one loud thing and everything else is a whisper. Do not add intermediate sizes to smooth it.
```css
--fs-title: 23px;   /* h1 MONAD ODYSSEY            */
--fs-epigraph: 17px;
--fs-heading: 18px; /* guide h2                    */
--fs-name: 20px;    /* card h2                     */
--fs-label: 15px;   /* BLOCK, MOORINGS, panel title*/
--fs-micro: 14px;   /* metric captions, tags, state*/
--fs-num-xl: 25px;  /* tx/s, blocks/min, tallies   */
--fs-num-lg: 22px;  /* block height                */
--fs-num-md: 17px;  /* moorings busy/6, panel count*/
--fs-num-sm: 13px;  /* berth load 12/16            */
--fs-data: 10px;    /* hashes, feed rows, manifest */
--fs-prose: 15px;   /* legend lines, hint, closing */
```
TRACKING is the primary hierarchy signal, 0.02em -> 0.20em: `-0.02em` hash · `0.02em` berth number · `0.05em` card name · `0.06em` hint · `0.08em` manifest kind · `0.09em` metric caption · `0.10em` guide h2 / card state / tags · `0.12em` card category / rank · `0.15em` h1 · `0.16em` net badge · `0.18em` panel title / MOORINGS · `0.20em` IN BLOCK (the widest on the page).

FOUR GLOBAL RULES, declared once.
```css
.hb { font-family: var(--hb-display); font-size: var(--fs-prose); line-height: 1.4;
      -webkit-font-smoothing: none; font-synthesis: none; }
/* Every numeral, everywhere. These update at 3 Hz and must not jitter. */
.hb-board-block b, .hb-metric b, .hb-tally b, .hb-berths-head b,
.hb-berth, .hb-berth-load, .hb-panel-count { font-variant-numeric: tabular-nums lining-nums; }
/* Raw machine data: slashed zero on, code ligatures off. */
.hb-card-hash, .hb-panel-row, .hb-manifest-item, .hb-berth-no {
  font-feature-settings: 'zero' 1; font-variant-ligatures: none; }
/* Display numerals: no slashed zero — it reads technical, not monumental. */
.hb-board-block b, .hb-metric b, .hb-tally b, .hb-panel-count {
  font-feature-settings: 'zero' 0; }
```
FONT-WEIGHT IS 400 EVERYWHERE and is explicitly re-declared on `h1`, `h2`, and every `<b>` to defeat the browser default. There is no bold on this page at all; hierarchy comes purely from size, colour and tracking.
TRACKING COMPENSATION: CSS adds letter-spacing AFTER the final glyph, so every centred or right-aligned tracked run needs a matching `text-indent`. Applied to `.hb-tagline` (0.26em), `.hb-net` (0.16em), `.hb-manifest-tag` (0.20em).
CASING: `text-transform: uppercase` on metric/tally captions, card category, card state, tags, guide h2, the epigraph and both badges. Lowercase is the voice of the GLOSS — legend explanations, `.hb-card-hint`, the closing paragraph. Museum-wall-label grammar: CARVED TERM, then a modern lowercase note.

CANVAS FONT — 8 GLYPHS ADDED, ZERO GREEK.
Adding entries to `GLYPHS` is a plain object-literal edit with zero runtime cost. Add:
```
'%': ['101','001','010','100','101']    '=': ['000','111','000','111','000']
'×': ['000','101','010','101','000']    '<': ['001','010','100','010','001']
'(': ['001','010','010','010','001']    '>': ['100','010','001','010','100']
')': ['100','010','010','010','100']    '!': ['010','010','010','000','010']
```
`%` is genuinely needed (fillPct); the rest close obvious holes. Total set: 45 -> 53.
NO Greek capitals and NO homoglyph alias table. Three reasons, all fatal to the proposal: at 3x5 the bitmap for 'Θ' (`111/101/111/101/111`) is BYTE-IDENTICAL to the digit 8, and the proposed placement put it immediately left of a berth number; seven of the nine proposed berth marks are Latin or digit homoglyphs at this resolution, so the wayfinding payoff is zero while the misreading cost is real; and the proposal's own law ("maximum four Greek marks on screen — above that it becomes a costume") was violated by its own sites, which totalled nineteen. An Odyssey sign that says the same name twice in two alphabets is a theme-park device.

NO 5x7 SECOND FONT. Its only consumer was the signpost's second line, and the two-line 3x5 name stone (see `environment`) is narrower, monumental, needs no second `drawPixelText` variant, and fixes the x=87 collision. The protected finding inside that proposal was the CACHING arithmetic, not the letterforms — and the caching lands in full: the signpost drops from ~132 fillRects/frame to 1 drawImage + 2 fillRects, a net **-130 fills/frame**, while the inscription gets bigger. The proposed 1px serif flares are also cut on the same grounds as Cinzel: they would have dragged the bitmap tier toward Rome to match a DOM face that is no longer there.

ON-CANVAS TEXT — two call sites, both now cached.
1. Hull number: `PAL.linen` on a `PAL.hullDark` plate, centred at `x + SHIP_W/2`, `y + DECK_Y + 2`. 12.2:1. Now blitted from the 24-slot label ring.
2. Name stone: `PAL.plateText #d8ceff` on `PAL.plate #0f0a24` (14.1:1), bevel `PAL.bronze` top+left / `PAL.black` bottom+right. Now blitted from a 39x18 cached strip.
Both formatters stay exactly as they are. `formatHullLabel` omits the '#' deliberately — at 3px wide it is indistinguishable from an 'A' and costs 4px the hull does not have — and `de-DE` grouping is why '.' must stay in the glyph set.

COPY. `.hb-tagline` -> **"EVERY BLOCK SAILS · THE SEA KEEPS THE COUNT"**. `.hb-guide h2` -> **"MONAD ODYSSEY"**. Tally captions -> **waiting / sailed / unsung**. Everything load-bearing keeps its technical noun: MAINNET/DEMO, BLOCK, tx/s, blocks/min, block time, MEMPOOL, BLOCK PRODUCTION, IN BLOCK, and every `CATEGORY_LABEL` value (transfer/swap/mint/call/deploy/tx). THE NAMING LAW: proper nouns may be mythic; common nouns must be plain English; the disclosure of whether the data is real is NEVER mythologised. That one rule is what stops a Homeric skin becoming Ren-faire pastiche on a blockchain product.
The `abilities.js` names come under the same law and two of them break it: **"Emberwake"** and **"Hearthglow"** are fantasy-RPG compound nouns — Destiny, not Homer — and they are already rendering on the inspector card. Rename to plain English with the same blurbs: `emberwake -> "The Fire You Carry"`, `hearthglow -> "Firelight on Stone"`. `Quickstep`, `Called to the Plank`, `Wake of the Crossing` and `Last Light` already comply.
NAME POOLS (`sprites.js:126-130`): `NAME_A` currently contains `Nyx, Vela, Orin, Kite, Echo, Nova, Rune, Ivy, Halo, Mira, Onyx, Cinder` — science-fiction names that break the world on sight. Replace with 18: `Alkon, Bryas, Doros, Elpis, Hylas, Idas, Kleon, Lykos, Melas, Nestor, Oros, Peleus, Pyrrhos, Straton, Teukros, Thoas, Xanthos, Zetes`. `NAME_B` keeps all 7 existing and adds `the Younger` — patronymic naming is the most Homeric habit there is and it reads instantly. Longest render: "Shieldwright" + prefix = 20 chars at 20px VT323 ≈ 200px, inside the 272px rail minus 24px padding.

---

## Iconography

EVERY ICON IS INLINE SVG. No `lucide-react` on this page (the dependency stays — nine other files import it — only the `ShipPage.jsx:3` import goes). New file: `src/pages/ship/icons.jsx`, named exports returning a bare `<svg>`.

CONSTRUCTION LAW, non-negotiable:
- `viewBox` is `0 0 16 16` for tool icons, `0 0 9 9` for tallies and headers, `0 0 10 10` for blazon shields and card marks. ALL path coordinates are INTEGERS. No `0.5`, no sub-pixel.
- Every icon carries `shape-rendering="crispEdges"`, `fill="currentColor"`, `aria-hidden="true"`, `focusable="false"`. Diagonals therefore stair-step, which is the point — it matches the sprite idiom exactly.
- Every diagonal runs at exactly 1:1 or 1:2 slope so the stair pattern is regular.
- No icon takes a colour prop; no icon hardcodes a hex; sizes are the three canonical values (18 for tools, 9 for tallies, 10 for shields/marks) and nothing else.
- The parent element keeps its `aria-label` / `aria-pressed` / `aria-expanded` contract untouched. None of this enters the accessibility tree.

TOOL ICONS — 16x16, rendered at 18px inside a 40x40 button (44x44 on touch).

[1] STELE — replaces `BookOpen` (legend toggle). A votive slab with a pediment and three incised lines: an inscription you read.
```svg
<polygon points="8,0 13,4 13,16 3,16 3,4" opacity="0.20"/>
<polygon points="8,0 13,4 3,4"/>
<rect x="5" y="6"  width="6" height="1"/>
<rect x="5" y="9"  width="6" height="1"/>
<rect x="5" y="12" width="4" height="1"/>
```

[2] TRIPOD — replaces `Radio` (live/demo toggle). The Delphic tripod: it speaks true when the fire is lit. The flame is a real designed second state, not a colour change.
```svg
<rect x="3" y="6" width="10" height="2"/>
<polygon points="4,8 12,8 10,11 6,11" opacity="0.45"/>
<rect x="7" y="11" width="2" height="5"/>
<polygon points="5,11 7,11 5,16 3,16"/>
<polygon points="9,11 11,11 13,16 11,16"/>
<polygon class="hb-ico-flame" points="8,0 10,3 8,6 6,3"/>
```
```css
.hb-ico-flame { opacity: 0; transform-origin: 8px 6px; }
.hb-tool[data-live="1"] .hb-ico-flame { opacity: 1;
  animation: hb-flick 0.9s steps(2, end) infinite; }
@keyframes hb-flick { 0%,49% { transform: none }
                      50%,100% { transform: translateY(1px) scaleY(0.82) } }
@media (prefers-reduced-motion: reduce) { .hb-ico-flame { animation: none } }
```
CRITICAL WIRING: the flame must NOT bind to `.is-on`. That class is `forceDemo`, so `.hb-tool.is-on .hb-ico-flame { opacity: 1 }` would light the tripod in DEMO — inverted. And live/demo is additionally driven by feed silence (`QUIET_BEFORE_DEMO_MS = 5000`), so binding to the button's own state would lie in the auto-fallback case. Drive it from an explicit `data-live={mode === 'live' ? '1' : '0'}` attribute fed by the same `snap.stats.mode` that drives `.hb-net`. Two mode indicators with different logic is a cohesion bug; one source of truth.

[3] HOMEWARD PROW — replaces `ArrowLeft` (back to /). A left-facing ram with a wake trailing right. Reads as "sail home" and as an arrow simultaneously.
```svg
<polygon points="1,8 6,3 6,13"/>
<rect x="6"  y="6" width="4" height="4"/>
<rect x="11" y="7" width="2" height="1" opacity="0.6"/>
<rect x="14" y="7" width="2" height="1" opacity="0.3"/>
```

TALLY + HEADER ICONS — 9x9, absolutely positioned at `left:0; top:5px` inside a `padding-left:13px` parent.

[4] SPEAR (waiting) — a grounded dory: leaf head, shaft, sauroter butt-spike. `--hb-queue`.
```svg
<rect x="4" y="0" width="1" height="9"/><rect x="3" y="1" width="3" height="1"/>
<rect x="3" y="8" width="3" height="1"/>
```
[5] SAIL (sailed) — a square sail bellied on its yard, MIRRORED so it sails west like the fleet. `--hb-sailed`. The old bare right triangle read as a "play" button.
```svg
<rect x="7" y="0" width="1" height="9"/><polygon points="7,1 0,1 1,7 7,7"/>
```
[6] BROKEN COLUMN (unsung) — three drums, the top one snapped and offset. `--hb-lost`. A ruin is the correct icon for "real arrivals the quay had no room to show"; a diamond meant nothing.
```svg
<rect x="0" y="8" width="9" height="1"/><rect x="2" y="5" width="5" height="3"/>
<rect x="3" y="1" width="4" height="3"/><rect x="3" y="0" width="2" height="1"/>
```
[7] HULL (MOORINGS header) — `--hb-frame`.
```svg
<rect x="4" y="0" width="1" height="4" opacity="0.55"/>
<polygon points="0,5 9,5 7,8 2,8"/><rect x="0" y="3" width="2" height="2"/>
```

BADGE MARKS — 10x10 masks on `.hb-net::before`, tinted by `background-color: currentColor`.
`--ico-sprig` (LIVE, a filled laurel sprig — curves permitted here; ornament is organic, architecture is not):
```
url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Cpath d='M5 10C3 8 1.4 6 1.4 2.6 4 3.6 4.6 6 5 10Z' fill='black'/%3E%3Cpath d='M5 10c2-2 3.6-4 3.6-7.4C6 3.6 5.4 6 5 10Z' fill='black'/%3E%3C/svg%3E")
```
`--ico-ring` (DEMO, a hollow ring — a struck coin with nothing behind it):
```
url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' shape-rendering='crispEdges'%3E%3Cg fill='black'%3E%3Crect x='3' y='1' width='4' height='1'/%3E%3Crect x='3' y='8' width='4' height='1'/%3E%3Crect x='1' y='3' width='1' height='4'/%3E%3Crect x='8' y='3' width='1' height='4'/%3E%3Crect x='2' y='2' width='1' height='1'/%3E%3Crect x='7' y='2' width='1' height='1'/%3E%3Crect x='2' y='7' width='1' height='1'/%3E%3Crect x='7' y='7' width='1' height='1'/%3E%3C/g%3E%3C/svg%3E")
```
Different SHAPE, not merely different colour — that is the second of the four channels distinguishing live from synthetic.

MANIFEST BLAZON SHIELDS — 10x10, and the sprites.js change that makes them TRUTHFUL.
This is the single strongest cross-layer idea in the whole effort: one heraldic device set that appears identically on the hoplite's aspis in the canvas and on the manifest row in the DOM, so the reader learns one vocabulary and it works in both materials. But it CANNOT ship against the current code: `sprites.js:115` reads `blazon: BLAZONS[Math.floor(rnd() * BLAZONS.length)]` — blazon is RANDOM from the tx hash. A DOM shield asserting "defi = two bars" while defi hoplites on the quay carry none/boss/bars/ring at random, in the same viewport, at the same moment, is the UI lying about its own iconography. Make blazon semantic FIRST.

There is a second, related defect: `hopliteFromTx` assigns crests for `nft`, `contractDeploy`, `contractCall` and `transfer` and lets `defi` and `other` keep a RANDOM crest — while the legend claims crests encode kind. Fix both with one pure data change, keeping the `rnd()` call count and order IDENTICAL (3 draws) so every cached body key and the per-hash sprite stream stay bit-identical:
```js
const rCrest = rnd()                       // draw 1 — consumed even when overridden
const [cloak, cloakLit, cloakSignal] = whale ? WHALE_CLOAK : CLOAKS[Math.floor(rnd() * 8)]  // 2
const rBlazon = rnd()                      // draw 3 — consumed even when overridden

const DEVICE = {
  transfer:       ['low',  'none'],
  defi:           ['low',  'boss'],
  nft:            ['twin', 'ring'],
  contractCall:   ['tall', 'bars'],
  contractDeploy: ['tall', 'ring'],
}
const [crest, blazon] = DEVICE[category]
  || [CRESTS[Math.floor(rCrest * 3)], BLAZONS[Math.floor(rBlazon * 4)]]   // 'other'
```
Every named category now gets a UNIQUE (crest, blazon) pair. Zero sprite art changes — both features are already drawn. Reachable body variants stay at 108 against a 192 bound.

The six shields. The chassis DIFFERS IN SILHOUETTE per family, not only in interior device — at 10x10 in a strip of 18, interior bar-count distinctions do not separate at a glance.
```svg
<!-- ROUND aspis: transfer, defi -->
<polygon points="3,0 7,0 10,3 10,7 7,10 3,10 0,7 0,3" fill="none" stroke="currentColor" stroke-width="1"/>
<!-- NOTCHED aspis (top bite): nft -->
<polygon points="3,0 4,2 6,2 7,0 10,3 10,7 7,10 3,10 0,7 0,3" fill="none" stroke="currentColor" stroke-width="1"/>
<!-- SQUARE thureos: contractCall, contractDeploy -->
<rect x="0" y="0" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1"/>
<!-- BLANK round: other — chassis only, no device -->
```
Devices, `fill="currentColor"`:
```
transfer        <rect x="2" y="4" width="6" height="2"/>                      one bar
defi            <rect x="4" y="4" width="2" height="2"/>                      boss
nft             <polygon points="3,2 7,2 8,3 8,7 7,8 3,8 2,7 2,3" fill="none"
                         stroke="currentColor" stroke-width="1"/>             ring
contractCall    <rect x="2" y="3" width="6" height="1"/>
                <rect x="2" y="6" width="6" height="1"/>                      bars
contractDeploy  <polygon points="3,2 7,2 8,3 8,7 7,8 3,8 2,7 2,3" fill="none"
                         stroke="currentColor" stroke-width="1"/>             ring
other           (chassis only)
```
Placement: 10x10, `vertical-align: -1px`, `margin-right: 5px`, inside `.hb-manifest-item` before the `<i>` kind label, inheriting the per-category colour through `currentColor`. Every item still prints its kind word, so nothing is colour-only.
RESTRAINT: the tally strip, the guide and the card get NO blazon shields. The manifest is the one place a rank of shields makes sense, because it IS a rank.

CARD TAG MARKS — 10x10, prefixed inside the tag.
[8] LAUREL (whale) — 14x10, six leaves in two mirrored arcs, `--hb-whale`. Mirrors the two `PAL.laurelLit` pixels the whale sprite carries at (2,3) and (8,3).
```svg
<polygon points="1,9 3,7 4,8 2,10"/><polygon points="2,6 4,4 5,5 3,7"/><polygon points="4,3 6,1 7,2 5,4"/>
<polygon points="13,9 11,7 10,8 12,10"/><polygon points="12,6 10,4 9,5 11,7"/><polygon points="10,3 8,1 7,2 9,4"/>
```
[9] LIT SPEAR TIP (priority) — four spark pixels around a spear head, `--hb-queue`.
```svg
<polygon points="5,0 7,3 5,5 3,3"/><rect x="4" y="5" width="2" height="5"/>
<rect x="1" y="1" width="1" height="1" opacity="0.7"/><rect x="8" y="1" width="1" height="1" opacity="0.7"/>
<rect x="0" y="4" width="1" height="1" opacity="0.4"/><rect x="9" y="4" width="1" height="1" opacity="0.4"/>
```

[10] PANEL CARET — pure CSS, no SVG and no unicode. The `▾`/`▸` glyphs inherit the wrong face and sit off the baseline. A 7x7 bronze chevron built from two 2px borders, rotated -45deg closed / 45deg open, with a `steps(2)` transition. Spec is in `chrome`.

CROSS-LAYER CONTRACT: the meander belongs to BOTH layers at one rhythm — `PAL.beaconBand #836EF9` in the sail centre on canvas (3 rects, every hull), and the `--hb-meander` 16x8 mask on the manifest rail in the DOM. If either is re-cut, both change together or the two layers stop speaking one language. Everything else stays split: the aspis blazon vocabulary is shared canvas-to-manifest; the Doric/architectural motifs stay out of the chrome entirely.

---

## VFX & particles

ONE POOL. `src/ship/motes.js` ALREADY IS the bounded particle system the brief asked for — POOL 128, cursor-ring recycle, `Float32Array` SoA, allocation-free, and with ZERO `globalAlpha` writes because a mote fades by stepping a colour ramp. It is emitted from `abilities.js:170`, updated at `engine.js` `update()`, and drawn at `hopliteRender.js:112`. Building a second pool would be the "second architecture" anti-pattern. Extend this one.

THE ONE STRUCTURAL CHANGE — CLASS PARTITION. A shared `spawnsLeft` counter is unsafe: 28 soldiers in `leaving` emit at 1/0.15s each = 187/s, which alone saturates 128 slots, and scene bursts would be starved at random. Fixed sub-rings make cross-class interference impossible by construction — no live-count bookkeeping, no eviction accounting.
```js
export const CLASS_FIGURE = 0   // abilities.js — warrior layer
export const CLASS_SCENE  = 1   // this layer
const POOL = 224
const CLASS_BASE   = new Int32Array([0, 128])    // FIGURE keeps slots 0..127
const CLASS_SIZE   = new Int32Array([128, 96])   // exactly its old pool
const CLASS_SPAWNS = new Int16Array([6, 8])
const cursors    = new Int32Array(2)
const spawnsLeft = new Int16Array(2)

export function emitMote(x, y, dx, dy, seconds, rampId, cls = CLASS_FIGURE) {
  if (spawnsLeft[cls] <= 0) return
  spawnsLeft[cls]--
  const i = CLASS_BASE[cls] + cursors[cls]
  cursors[cls] = (cursors[cls] + 1) % CLASS_SIZE[cls]
  px[i]=x; py[i]=y; vx[i]=dx; vy[i]=dy; life[i]=seconds; ttl[i]=seconds; ramp[i]=rampId
}
```
`updateMotes` resets both counters. The 6-argument signature defaults to `CLASS_FIGURE` -> base 0, size 128, gravity 0 — so `abilities.js:170` needs NO edit and warrior behaviour is bit-identical.

TWO NEW PER-RAMP TABLES, zero per-particle cost. Flat typed arrays, not nested consts — array destructuring allocates an iterator.
```js
const GRAVITY = new Float32Array([0, 70, 14])       // px/s^2, indexed by ramp
const SIZE_W  = new Uint8Array([1,1,1, 2,1,1, 1,1,1])   // [ramp*STEPS + step]
const SIZE_H  = new Uint8Array([1,1,1, 1,1,1, 1,1,1])
```
`GRAVITY[0] === 0` keeps RAMP_LASTLIGHT's straight-line rise exactly as it is. `SIZE_W/H` are hoisted OUT of the inner loop in `drawMotes`, so size costs nothing per particle.

THREE RAMPS TOTAL. Every colour is an existing PAL key, so a palette retune retunes the VFX for free.
| id | name | birth | mid | death | size | gravity |
|---|---|---|---|---|---|---|
| 0 | LASTLIGHT (warrior, untouched) | `beacon` #e9d5ff | `beaconBand` #836ef9 | `islandFar` #4a2a72 | 1x1 | 0 |
| 1 | SPRAY | `marble` #e8e0f5 | `seaGlint` #a78bfa | `seaFoam` #7c6bff | 2x1,1x1,1x1 | +70 |
| 2 | EMBER | `sunCore` #fff3d6 | `beaconLamp` #fcd34d | `bronze` #c98b3f | 1x1 | +14 |
Spray dies into `seaFoam` — the exact colour of the wave dashes — so it dissolves into the sea rather than popping out of it.

CUT: a boarding-impact DUST ramp. `abilities.js` Quickstep already paints `PAL.marble` stone dust at `(h.x+8..9, h.y+15..16)`; a landing dust in `marbleShade` at `(h.x+3, h.y+16)` is the same material on the same body row for a different event, and a viewer cannot tell impatient-shuffle dust from landing dust. It would also burn ~33 slots at the 150-landings/s peak to render a blur. The leap already has `wake` (5 samples along the path) and the landing already has the `planted` pose.
CUT: a gold GLEAM ramp and the 8-mote seal ring. `RAMP_GLEAM` (sunCore -> gold -> bronzeDark) is chromatically IDENTICAL to a Bearer torch, so a Kindler's boarding gleam would be invisible against its own flame and an Archon's would be a visual DEMOTION. Combined with brazier embers and seal bursts it put ~45 gold sparks/second permanently in a scene whose palette comment states that bronze is an ACCENT and violet carries the identity. You can wreck a palette using only its own keys by changing PROPORTION. The seal already has three signals and needs no fourth.
CUT: ambient mote haze. `cloudLit` and `starDim` are both three to four value steps LIGHTER than `seaFar`; 24 lighter-than-background pixels drifting leftward in the band `drawFarShips` occupies is the exact visual signature of the existing `seaGlint` foam. Haze is 5 alpha bars instead (see `environment`).
CUT: storm, rain, lightning, screen shake, gulls, extra auras. No chain signal maps to weather, and `ranks.js` states the governing law: rank is DERIVED, never rolled. Inventing atmosphere that encodes nothing breaks the visualiser's premise. `present()` is a centred COVER blit, so translating it reveals uncropped edges — screen shake is technically hostile to the buffer design.

DRAW-SITE MOVE. `drawMotes(ctx)` moves out of `hopliteRender.js:112` into `engine.draw()`, immediately after `drawHoplites(...)`. Same z-order, correct ownership — the warrior renderer should not be drawing sea spray. One line removed, one added.

EFFECT 1 — THE PHAROS, REWRITTEN. 6 fills, 4 alpha writes (from 2 and 2). A glow with no blur and no additive blending can only be a stair-step of discrete alpha slabs, and that is exactly what this is.
```js
export function drawBeacon(ctx, w, t, lastSealAt = -99) {
  const sprite = beaconSprite()
  const x = w - 22, y = PIER_Y - sprite.height + 4          // (w-22, 82)
  ctx.drawImage(sprite, x, y)

  const answering = t - lastSealAt < 0.25
  const flare = answering ? 1 : (Math.sin(t * 3.1) + Math.sin(t * 1.7)) / 2
  ctx.fillStyle = PAL.beaconLamp
  ctx.globalAlpha = 0.40 * (0.75 + flare * 0.25)
  ctx.fillRect(x + 5, y - 2, 6, 3)
  if (flare > -0.2) {
    ctx.globalAlpha = 0.20 * (0.75 + flare * 0.25)
    ctx.fillRect(x + 3, y - 5, 10, 3)
  }
  if (flare > 0.25) {
    ctx.globalAlpha = 0.09
    ctx.fillRect(x + 1, y - 9, 14, 4)
    ctx.fillRect(x - 8, PIER_Y + 3, 30, 1)      // fire-light on the quay STONE
  }
  ctx.globalAlpha = 1                            // MANDATORY, every exit path
  const f = BEACON_FLAME[(t * 6.5 | 0) & 3]
  R(ctx, x + f[0], y + f[1], f[2], f[3], PAL.sunCore)
  R(ctx, x + f[4], y + f[5], f[6], f[7], PAL.beaconLamp)
}
```
The outer rings are GATED on `flare`, so on a hard gutter the halo genuinely collapses to its core — the fire breathes rather than dimming uniformly. And the quay-bounce rect is the single best rect in this entire document: **one fillRect, and it is the only moment in the scene where one object lights another** — which is precisely what separates a physical, inhabited world from a parallax collage. It sits at `PIER_Y + 3` = row 131, on the dark `pierTop` stone face (L .0515), NOT at `PIER_Y - 1` = row 127, which is the `pierGlow` Monad-purple kerb where a 0.09-alpha warm lift is invisible.

EFFECT 2 — THE TOWER ANSWERS. When a hull seals, the Pharos flares to full for 0.25s. `engine.draw()` scans `berthShips` (<=6 iterations) for the most recent seal and passes it:
```js
let lastSeal = -99
for (const s of berthShips) if (s.sealFlash > 0 && s.sealedAt > lastSeal) lastSeal = s.sealedAt
drawBeacon(ctx, w, t, lastSeal)
```
Zero added fills. It converts a per-hull effect into a Odyssey-wide heartbeat and gives the Pharos — currently pure scenery — a job tied to chain state.

EFFECT 3 — CAST-OFF SURGE. Fires at the `casting -> away` transition (plank fully in, oars bite). ~6 pool slots at 3 departures/s.
```js
export function emitCastOff(s) {
  const bx = s.x + SHIP_W - 6
  const by = s.y + DECK_Y + 1 + hullDepth(s.traits.size)
  for (let k = 0; k < 5; k++)
    emitMote(bx + (k & 1), by - (k >> 1), 18 + k * 4, -6 + k * 2,
             0.34 + k * 0.02, RAMP_SPRAY, CLASS_SCENE)
}
```
Spray throws ASTERN (+x) because hulls move left. Gravity +70 drops it back into the water inside its lifetime.

EFFECT 4 — BRAZIER EMBERS. Continuous rate emitter in `tickSceneFx(dt, w)`, called from `engine.update()` next to `updateMotes(dt)`. ~10 pool slots, 0 fills outside the pool.
```js
const EMBER_HZ = 7
let emberAccum = 0, emberSeed = 0x2545f491
export function tickSceneFx(dt, w) {
  if (reducedMotion) return
  const xs = brazierXs(w)
  if (!xs.length) return
  emberAccum += dt * EMBER_HZ
  while (emberAccum >= 1) {
    emberAccum -= 1
    emberSeed = (emberSeed * 1664525 + 1013904223) >>> 0
    const j = emberSeed >>> 29                          // 0..7
    const bx = xs[j % xs.length]
    emitMote(bx + 1 + (j & 1), 105, -4 - (j & 3), -22 - j * 1.2,
             1.15 + j * 0.05, RAMP_EMBER, CLASS_SCENE)
  }
}
```
Seeded LCG, not `Math.random` — matching the determinism discipline in `ranks.js` and `STARS`. Initial `vy = -22` against gravity +14 gives a ~17px rise that decelerates and dies: a real ember arc, not a rising line. Leftward drift matches the prevailing wind already established by clouds, birds and waves. Three braziers at 7/s total is ~21 live embers — literal fire, in a literal fire bowl, which is the only place gold sparks are earned.

RECLAIM B — THE WAVE STRIP CACHE. 716 fills/frame at w=1120 (348 at w=480) recovered. This is 93% of `drawSea` and the single most expensive element in the scene, and it currently produces a uniform two-tone dot field with no depth.
Build ONCE at `MAX_BASE_W + maxGap` and blit a sub-rect with the 9-argument `drawImage`. Do NOT rebuild on width change: `engine.js` wires `new ResizeObserver(() => { surface.resize(); layoutQueue() })` with NO debounce, so a window-edge drag would fire a 15-canvas rebuild on essentially every frame. The cited `ridgeStrip` precedent is ONE canvas; this is fifteen.
```js
const WAVE_ROWS = 15
const WAVE_MAXW = MAX_BASE_W + 86          // widest gap is 30 + 14*4
const waveStrips = (() => {
  const out = []
  for (let row = 0; row < WAVE_ROWS; row++) {
    const y = SEA_Y + 5 + row * 13
    if (y >= BASE_H) break
    const gap = 30 + row * 4
    const { c, ctx: g } = surface(WAVE_MAXW, 2)
    for (let x = 0; x < WAVE_MAXW; x += gap) {
      R(g, x, 0, 3, 1, PAL.seaFoam)
      R(g, x + 6, 0, 2, 1, PAL.seaFoam)
      // Free: built once, so extra colour costs nothing per frame.
      if (row < 5)       R(g, x + 4, 0, 1, 1, PAL.seaCrest)   // horizon catches the light
      else if (row > 9)  R(g, x + 1, 1, 1, 1, PAL.wineLit)    // MONAD BERRY in the foreground
    }
    out.push({ c, gap, y })
  }
  return out
})()

// drawSea, replacing the 15-row dash loop:
for (let row = 0; row < waveStrips.length; row++) {
  const s = waveStrips[row]
  const spd = (5 + row * 1.5) * (reducedMotion ? 0.5 : 1)
  const off = Math.round(((-t * spd) % s.gap + s.gap) % s.gap)
  ctx.drawImage(s.c, s.gap - off, 0, w, 2, 0, s.y, w, 2)
}
```
This is where "the wine-dark sea is not actually wine-dark" gets fixed, at literally zero per-frame cost: the near rows now carry `wineLit #A0055D` — Monad Berry, exact — so the foreground water is visibly wine and the horizon is visibly brighter. Correct aerial perspective (bright distance is right; the incoming spec's `marbleShade` near-row highlight was both inverted AND stone-in-water, a material-category error).

MEASURED BUDGET, w=1120, 6 berths loaded, 124 hoplites, ~10 hulls on screen. Steady state, caches warm.
```
                             fills   blits
BASELINE (verified)          2,628    ~250
  of which: wave dashes        700
            hull numerals    1,020   (85 per ship x 12)
            signpost glyphs    126
RECLAIMS                    -1,846     +28
  wave strips                 -700     +15
  hull label ring           -1,020     +12
  name stone                  -126      +1
NEW THIS DOCUMENT             +100     +18
  sky 9->16 bands                +7
  sea 8->12 bands                +4
  haze bars + horizon glint      +6      (5 alpha)
  Pharos rewrite                 +4      (4 alpha)
  braziers                       +6      +3  (6 alpha)
  seal hull flash (<=3 concurrent) +24    (6 alpha)
  seal-fire sprite                        +3
  bow wave (<=10 rowing)        +20
  stepped vignette 4->12         +8
  mote pool draw (scene class)  +21
NET                            882    ~296
```
**The complete effects language ships and the frame costs 66% less than it does today.** The reclaims are not optimisations layered on top — they ARE the budget, and they must land before any effect does.

HARD GUARDRAIL: `SCENE_FX_FILL_BUDGET = 160` fills/frame for `drawHaze` + `drawBeacon` + `drawBraziers` + seal flash + bow wave + vignette combined (100 designed, 60 headroom). Dev-only assert in `engine.draw()`, scoped to those passes ONLY — never to the warrior layer, whose `wake` alone can legitimately reach 120 fills at `MAX_WAKE_LEAPERS = 24`, and a budget assert that fires on a legitimate busy frame is deleted by whoever hits it first.

`drawMotes` cost: O(RAMPS x STEPS x POOL) = 3 x 3 x 224 = 2,016 iterations of two typed-array reads, ~5us/frame. Acceptable — do not optimise. If ramps ever exceed 8, switch to a counting-sort bucket pass. The ramp-outermost loop means `fillStyle` is written at most 9 times per frame however many motes are alive; preserve that.

---

## Build order

14 steps. Every one is independently shippable, reviewable and revertable; the app is never broken between them. Run `npm run typecheck` and `npm run lint` after each. Steps 1-3 must land in order; 4-9 can be reordered; 10-14 are the chrome.

STEP 0 — FALSIFY THE ONE ASSUMPTION EVERYTHING RESTS ON (half a day, no production code).
Change exactly two constants — `sunX(w) = berthX(w,0) + SHIP_W + 18` and `SUN_CY = SEA_Y - 12` — and nothing else. Screenshot the canvas at buffer widths 480, 640, 768, 1024 and 1120 with all six berths occupied. Judge three things: (1) is the sun path still legible as a path, or has it become flecks behind hulls; (2) does the ridge clip the disc into a convincing half-set at every width; (3) does the disc collide with the name stone or the colonnade at narrow widths. Then desaturate all five to greyscale and confirm the sails are still the brightest mass below y=92. If the sun move fails, the fallback is NOT to revert it — it is to raise `berthX`'s `w*0.04` offset to `w*0.08`, which preserves the entire lighting model at the cost of one layout constant. Reverting the sun would require re-lighting eight sprites, which is exactly the work this change exists to avoid.

STEP 1 — TOKENS ONLY. `src/ship/pixel.js`: swap the PAL object wholesale (14 added keys, 8 renames, 6 revalues, 0 used keys removed). `src/pages/ShipPage.css`: replace lines 14-38 with the new `.hb` token block (all 14 existing `--hb-*` names survive with new values). Add `export const LIGHT` and the live `reducedMotion` MediaQueryList. NOTHING ELSE. The scene recolours wholesale with zero other edits because no consumed key name disappears. Verify: page renders, only colours moved, typecheck clean.

STEP 2 — THE THREE RECLAIMS. Pure caching, zero visual change, and they are the budget for everything after.
(a) Wave strips: build once at `MAX_BASE_W + 86`, blit a sub-rect with 9-arg `drawImage`. -700 fills, +15 blits.
(b) Hull label ring: 24 pre-allocated 48x7 canvases, `claimHullLabel()` in `makeShip`, sub-rect blit in `drawShips`. -1,020 fills, +12 blits.
(c) Name stone: two-line 3x5 plate cached to a 39x18 strip keyed on the label; move x/top to 40/96, `boardW` 63 -> 39. -126 fills, +1 blit. This also fixes the real signpost/`rampTopX(480,0)=87` collision.
Also here, since it is free and in the same file: replace `[...ships].sort()` with a module-level scratch array sorted in place — two array allocations per frame removed.
Verify with a frame counter: fills at w=1120 should drop from ~2,628 to ~782.

STEP 3 — SUN AND LIGHT LAW. Apply the two constants from Step 0. Add the 3-tier sun-path ternary (0 added fills). Change the focus bracket in `engine.draw()` from `PAL.gold` to `PAL.marble`. Add the `SKY_STOPS` 8-stop / 16-band and `SEA_STOPS` 6-stop / 12-band tables — and use the exact truncated fractions (`0, .1333, .2666, .3999, .5333, .6666, .7999, .9333` and `0, .1818, .3636, .5454, .7272, .9090`), because `bandGradient` computes `t = i/(bands-1)` with a nearest-stop-below `pickStop`, and a decimal rounded UP silently steals a band from its own stop. Rounding up here would give Monad Blue half the sky area the thesis claims. +11 fills.

STEP 4 — THE HORIZON. `RIDGE_H` 14 -> 44, blit at `SEA_Y - 44` = 48. Add the citadel (52 rects, one-off, at `round(w*0.42)`) and the temple (26 rects, at `round(w*0.30)`, drawn last) inside `buildRidges`, in the documented back-to-front order, with the 2px waterline lip. Add `drawHaze` (5 bars) and the 1px horizon glint row. Change `farShipSprite`'s ink from `PAL.islandFar` to `PAL.hullFar`. Draw order is load-bearing: `drawSea -> drawFarShips -> drawHaze -> drawShips(lanes)`. +6 fills/frame, 0 added blits.

STEP 5 — QUAY AND PROPS. Recolour the deck stack (`pierGlow` -> Monad #836EF9, `marbleShade` -> `pierKerb`). Add `brazierXs(w)` + `brazierSprite()` + the flame block, placed only in the empty band right of `queueEndX`. Recolour `colonnadeSprite` and `amphoraSprite` off their hex literals. +6 fills, +3 blits.

STEP 6 — THE SEAL. **Build this alone and look at it before writing a single new label.** Add `ship.sealFlash` (init 0 in `makeShip`, set 0.30 in `seal()`, decremented at the head of BOTH the `berthShips` and `ships` loops). Add the taper-following gold hull flash, drawn AFTER the sprite blit and BEFORE the label blit. Add `sealFireSprite()` to `flames.js` (its own 3x5 art table, blitted at `x+48, y+1`) and the tower-answer parameter on `drawBeacon`. Add the bow wave at the true waterline. Everything downstream of this points at this moment; if it does not read against ~700 wave dashes, six hulls and 124 sprites, the fallback is to hold the stern fire for the full straggler grace and raise the flash to four steps — but you must see it first.

STEP 7 — VIGNETTE AND REDUCED MOTION. `drawVignette` 4 bars -> 12 stepped bars in `PAL.abyss`, heavier at the bottom, top stair stopping at row 24 so the citadel is never dimmed. Thread `reducedMotion` into the wave-strip scroll, the brazier and Pharos `flare`, and the seal flash. +8 fills.

STEP 8 — THE POOL. `motes.js`: POOL 128 -> 224, class partition, `GRAVITY`/`SIZE_W`/`SIZE_H` tables, ramps 1 (SPRAY) and 2 (EMBER). Move `drawMotes(ctx)` from `hopliteRender.js:112` into `engine.draw()` after `drawHoplites`. Add `tickSceneFx(dt, w)` next to `updateMotes(dt)` and `emitCastOff(s)` at the `casting -> away` transition. `abilities.js` needs NO edit — verify that by running the existing `__tests__` unchanged.

STEP 9 — SPRITES AND ENGINE DATA. `sprites.js`: `CLOAKS` becomes triples `[shade, lit, signal]`; `WHALE_CLOAK` likewise; the `DEVICE` crest/blazon table (keeping the `rnd()` call count at exactly 3, in order); the `NAME_A`/`NAME_B` pools; the two `bronzeHot` aspis rim rects in `buildBody`; all remaining hex literals moved to PAL. `poses.js`: greave `#9a6f14` -> `PAL.bronzeDark`. `engine.js`: `focus.color = focus.traits.cloakSignal` — this alone fixes the inspector card title rendering at ~1.2:1 in production. `abilities.js`: rename `Emberwake` -> "The Fire You Carry" and `Hearthglow` -> "Firelight on Stone". Confirm the fig cache stays at 108 reachable keys against its 192 bound.

STEP 10 — CHROME PRIMITIVES. The five-shadow carved plaque as a grouped selector including `.hb-panel`; `background-color` + `background-image` never the shorthand; `--hb-tooled` at 90deg; `contain: paint` on the three hot surfaces; the three `steps()` keyframes; the backed focus ring; delete the two `text-shadow: 0 0 8px/10px` blurs on `.hb-rank`. Verify: grep for non-zero blur radii and non-hard-stop gradients returns nothing.

STEP 11 — THE BOARD, AND THE MISSING DATA. Widen to 248px. Add the tally strip (`queued`/`sailed`/`skipped` — already in `snapshot().stats`, currently unrendered) and the six-berth gauge in a 3x2 grid (already in `snapshot().berths`, currently unrendered, nine fields per row). Two-row cells: numbers on top, a 70px full-cell bar beneath, demand hatched in stone and fill solid in gold, the `--gas` caret spending `fillPct`. This is the largest information gain in the whole redesign and it needs no engine change at all.

STEP 12 — CARD, GUIDE, PANELS, MANIFEST. The `.hb-rail` wrapper (delete `ShipPage.css:289`, add `max-height` + `overflow-y` at ALL widths). The 5px accent ribbon with its 1px hairline; `.hb-card h2` -> `--hb-ink`. The rank plate mirroring `flames.js`. `.hb-card-hash` cut channel plus the `.is-synthetic` material switch. Ruled-timber panel bodies. The manifest meander rail, all six category colours, and the `contain`. Un-hide `.hb-guide` below 640px and rewrite the legend to match what the canvas actually draws.

STEP 13 — ICONS AND FONTS. `src/pages/ship/icons.jsx` with all ten icons plus the six blazon shields; drop the `lucide-react` import from `ShipPage.jsx` only. Wire the tripod flame to `data-live` from `snap.stats.mode`, NOT to `.is-on` (which is `forceDemo` and would render the toggle inverted). Move the font `<link>` from `ShipPage.jsx:76-85` into `index.html` and drop JetBrains Mono weight 600. Grow `.hb-tool` to 40/44px and lucide-replacement icons to 18px.

STEP 14 — VERIFICATION PASS.
- Greyscale at 480/640/768/1024/1120 with six berths and a full muster: sails brightest below y=92; the citadel reads as a mass; the seal-fire is findable.
- Frame counter: fills at w=1120 under 950; the scene-FX assert never trips.
- Axe or equivalent on /ship: zero contrast failures; every text token >= 4.6:1.
- Keyboard: tab through all three tools and both panel heads; the ring is visible over bronze.
- `prefers-reduced-motion: reduce`: nothing on canvas or in chrome oscillates, the liveness dot stays VISIBLE at opacity 1 rather than frozen mid-blink, and the sea still drifts.
- Resize-drag the window edge for ten seconds and watch memory: the wave strips must not rebuild.
- 375px wide: legend present and scrollable, tools 44px, board readable, berth grid at 2 columns.

NEVER SHIP STEP 12's LEGEND COPY BEFORE STEPS 6 AND 9. Copy that promises a seal-fire, a crest-and-blazon vocabulary or a rank ladder over an Odyssey that does not draw them is a lie in the UI, and this project's entire posture — the `skipped` counter, the "unsampled crew · no tx" disclosure, the honest empty benches — is that it does not lie about what it is showing.

---

## Functionality & performance protections

CAPACITY IS UNTOUCHABLE. `src/ship/capacity.js` and `planShipLoad()` are not edited, not wrapped, not read for any purpose other than the values the engine already passes. Nothing in this document changes `DECK_MAX` (16), `DECK_COLS` (4), `DECK_X0` (22), `DECK_COL_STEP` (5), `DECK_ROW_STEP` (3), `TIER_CAPACITY`, `hullDepth`, `BERTH_COUNT` (6), `BERTH_COLS`/`ROWS` (3x2), `BERTH_ROW_GAP` (24), `MAX_QUEUE` (28), `BOARD_INTERVAL`, `PLANK_SECONDS`, `STRAGGLER_GRACE`, `MIN_DWELL`, `QUAY_LIFE`, `NEAR_PLANK`, or any lane/approach/depart speed. `size` continues to come from the capacity plan so hull size and deck load always derive from one figure.

BOARDING LOGIC IS UNTOUCHABLE. `pickQueued` keeps its load-bearing property verbatim: it returns non-null if and only if at least one queued soldier is eligible, so it changes WHO boards, never WHETHER, and therefore can never change HOW MANY. `capacity.js` stays the sole authority on the count. `abilities.js` keeps its stated hard rule — abilities are purely presentational, receive a read-only view, must never mutate it, and nothing there may influence how many soldiers board. The `seal()` re-entry guard stays `if (!ship.boarding) return`, and the new `sealFlash` timer is a pure render field that no boarding path reads.

THE THREE HONESTY AFFORDANCES SURVIVE VERBATIM.
1. `skipped` — real arrivals the quay had no room to show. It now gets a visible tally cell in crimson, which is a strengthening, not a softening. Removing it would make the visualisation quietly lie about throughput.
2. The synthetic branch of `.hb-card-hash` — "unsampled crew · no tx" rather than an invented hash. It now renders in a visibly different MATERIAL (display face, no cut channel) from a real hash, which makes the disclosure louder.
3. Empty benches — the four `hullDark` seats at `bx = 22 + i*5` line up exactly with the engine's seat grid, so an unfilled bench is literally an unfilled seat. Never filled, never ghost-crewed, never occluded by a prop.
Plus a fourth, newly enforced: MAINNET vs DEMO were luminance-identical at 1.03:1 and are now separated on four independent channels (hue, luminance 1.54:1, glyph shape, animation rhythm) plus the words.

RANK DETERMINISM IS PRESERVED BIT-FOR-BIT. `ranks.js` consumes no `rnd()`, which is what keeps the per-hash sprite stream stable; that stays true. The `sprites.js` edits keep the `rnd()` call COUNT and ORDER at exactly three draws (crest, cloak, blazon) even where the result is overridden by the `DEVICE` table — deleting a draw would shift every cached body key and break the file's own "same hash, same soldier, always" guarantee across releases.

SPRITE CACHES ARE NOT MADE WORSE, AND NEED NO CHANGE. Verified against source, not against the incoming specs' claims: `cache` (ships + scenery) reaches 299 keys against a 400 bound — sail 2 x stripe 4 x hull 3 x pennant 4 x size 3 = 288, plus 3 far ships, 3 clouds, 3 amphorae, Pharos, colonnade — 25% headroom. `figCache` (bodies) reaches 108 reachable keys against a 192 bound: 8 cloaks x 3 crests x 4 blazons for non-whales, plus 1 x 3 x 4 for whales. `legsCache` is a separate unbounded Map holding 14 canvases. `FLAMES` in `flames.js` is a fixed 5x4 table deliberately outside every LRU so a hot flame can never be evicted by a cold hull. NO NEW VARIANT AXIS IS ADDED anywhere. The "raise the bound to 512/640" instruction in two incoming specs targets a fabricated problem, cites the wrong file and the wrong line, and costs memory for nothing — do not do it. The Greek-letter-on-the-sail proposal is refused on the same grounds: it would multiply the ship key space 288 -> 2,592 against a 400-entry FIFO that never promotes on use.

THE ALPHA INVARIANT. There is no `ctx.save()`/`ctx.restore()` anywhere in `src/ship/`. Manual restoration is the ONLY thing preventing `globalAlpha` leaking into every subsequent draw call for the rest of the frame. Every function that writes it resets it to 1 on EVERY exit path, including early returns and the `flare <= 0` branch. `drawHaze`, `drawBeacon`, `drawBraziers`, the seal flash and `drawVignette` are each individually audited for this. No `globalCompositeOperation` is ever set; the context stays permanently `source-over`.

THE MOTE POOL'S THREE PROPERTIES ARE PRESERVED. Fixed size, pre-allocated, allocation-free; zero `globalAlpha` writes (a mote fades by stepping a colour ramp, which is the house idiom and strictly cheaper than alpha state changes); and ramp-step-outermost drawing so `fillStyle` is written at most `RAMPS.length * STEPS` = 9 times per frame however many motes are alive. The class partition adds no per-particle cost and cannot starve either class. `emitMote`'s 6-argument signature still defaults to `CLASS_FIGURE` with gravity 0 and 1x1 size, so `abilities.js` is byte-identical and the existing `__tests__/ranks.test.js` and mote tests pass unchanged.

PERFORMANCE, MEASURED NOT ASSERTED. Baseline at w=1120 with 6 berths loaded, 124 hoplites and ~10 hulls: ~2,628 fills, ~250 blits. Reclaims: -1,846 fills / +28 blits. New work: +100 fills / +18 blits. Net ~882 fills, ~296 blits — 66% cheaper than today. Three per-frame allocations removed (two `[...ships].sort()` copies, one canvas-per-ship label). Zero new `document.createElement('canvas')` calls in any hot path: the label ring is 24 canvases allocated once, the wave strips are 15 allocated once at `MAX_BASE_W + 86` and NEVER rebuilt on resize (`ResizeObserver` is undebounced in `engine.js`, so a rebuild-on-width-change would fire on every frame of a window drag), and the ridge strip keeps its existing per-width rebuild because it is a single canvas.
DEV GUARD: `SCENE_FX_FILL_BUDGET = 160` fills/frame, asserted in `engine.draw()` under `import.meta.env.DEV`, scoped ONLY to `drawHaze` + `drawBeacon` + `drawBraziers` + seal flash + bow wave + vignette. It is deliberately NOT scoped to the warrior layer, whose `wake` ability can legitimately reach `MAX_WAKE_LEAPERS` (24) x `WAKE_SAMPLES` (5) = 120 fills on a busy frame — an assert that fires on legitimate work gets deleted by the first engineer who hits it.

DOM PERFORMANCE. `contain: paint` on `.hb-board` (repaints ~3x/s beside a 60fps canvas, and now carries a repeating gradient plus six inset shadows invalidated together), `.hb-panel-body` and `.hb-manifest`. Every transition is on `color`, `border-color`, `background-color`, `box-shadow`, `transform` or `width` — all compositor-safe or paint-cheap, none layout-bound. The one `width` transition is on a 7px absolutely-positioned `<em>` inside `overflow: hidden`, so it cannot reflow anything. React commits stay throttled at ~10/s by the existing `emitAccum` gate.

TYPE SAFETY AND TOOLING. Plain JS with JSDoc throughout, verified by `npm run typecheck` (`tsc --checkJs`). No `.ts` files. The ESLint config is not edited — a protective hook forbids it. New modules follow the existing pattern: `flames.js`'s frozen art tables, `ranks.js`'s pure-module discipline (imports nothing, touches no canvas), `motes.js`'s typed-array SoA. Every new draw function stays PURE — takes state and paints, holds no per-frame mutable state — which is the contract stated at the top of `odysseyScene.js`. `omen`/dread-ladder state, which would have required stateful debouncing inside a draw function, is cut entirely for exactly this reason (and because its triggers measured the visualiser's own drop rate, not the chain — turning the tideline blood-red because our renderer fell behind would be a lie told in Monad's voice, and putting the sun out during a 1.2s websocket hiccup is not something anyone ships on a branded page).

ACCESSIBILITY CONTRACTS, PRESERVED VERBATIM. `aria-pressed` + `aria-label` on both toggles; `aria-label` on the exit `Link`; `aria-expanded` + `aria-controls` on both panel heads; `aria-label="Monad Odyssey readout"` on the board; `aria-live="off"` on the manifest (it changes 3x/second and would flood a screen reader); the descriptive canvas `aria-label`; `aria-hidden="true"` on every decorative `<i>` and every SVG. All ornament is CSS masks and inline SVG, so none of it enters the accessibility tree. `:focus-visible` is kept over `:focus` so mouse users never see the ring. Touch targets grow 32px -> 40px desktop / 44px touch. The reduced-motion block is expanded to cover the new keyframes and, critically, holds the FINAL state (`opacity: 1`) rather than the initial one — so the liveness indicator stays visible rather than frozen mid-blink.

CROSS-LAYER CONTRACTS THAT MUST NOT DRIFT.
1. `--hb-accent` <- `focus.color` <- `focus.traits.cloakSignal` (was `.cloak`). Both consumers keep a fallback, so a null accent degrades safely.
2. `--hb-rank-0..4` mirror `flames.js`'s per-rank hues exactly. A rank recolour changes both files in one commit.
3. The six-category colour map is shared across canvas crest/blazon, `.hb-manifest-item.is-*` and the legend. A partial rollout is worse than the status quo.
4. Twelve hexes are byte-shared between PAL and the CSS tokens. Retuning any of them retunes both layers — that is intended, and it is why Tier 1 exists.
5. The meander is one motif at one rhythm: `PAL.beaconBand` on every sail, `--hb-meander` on the manifest rail.
6. `.hb-berths-grid` must keep mirroring `BERTH_COLS`/`BERTH_ROWS`. If `BERTH_COUNT` ever changes, the grid, the width math and the legend copy change together.
7. `-webkit-font-smoothing: none` on `.hb` is intentional and pairs the DOM type with the unsmoothed blit. It is not removed.
