# Art direction — implementation status

Tracks [ART-DIRECTION.md](ART-DIRECTION.md) against the working tree.
Verified by `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

## Done

| Area | What landed |
|---|---|
| **Warriors — the Torchbearers** | Rank ladder (Unlit/Ember/Kindler/Bearer/Archon) derived from value + live gas percentiles, never rolled. `ranks.js`, `flames.js`, `poses.js`, `abilities.js`, `motes.js`, `hopliteRender.js`. Six poses with a real leap arc (brace 16px → tuck 15px → planted 17px), six data-driven abilities, bounded 128-mote pool. |
| **Fleet colours** | Monad mark (7×7 rounded-diamond void) on every sail, Monad-purple masthead streamer. `pennant` dropped from the sprite cache key — it no longer changes a pixel and was quadrupling variants. |
| **Palette** | Full PAL replacement: sky in 8 stops, sea ramp ending in wine (`seaWine`), Monad blue/purple/berry/off-white placed exactly at the load-bearing points, six-step bronze ramp, dead keys renamed to live ones. All `PAL.*` references verified to resolve. |
| **Pillar 3 (carved, never glass)** | Removed the only blurred shadows in `ShipPage.css` (`.hb-rank.is-rank-3/-4`), replaced with hard offset shadows. |
| **Cache correctness** | Body/legs/flame split into orthogonal keys; soldier variants 204 → 108; ships and figures now in separate bounded maps so neither evicts the other's hot entries. |

| **CSS design tokens** | Two-tier system in `.hb`: `--pr-*` material ramps (never referenced by selectors) and `--hb-*` semantic roles. 12 hexes byte-shared with the canvas PAL. `--hb-faint` was failing AA at 3.5:1 on every metric label; now 6.4:1. |
| **DOM chrome** | The five-shadow carved plaque on every panel: 2px bronze bevel (lit upper-left), a 2px incision fillet with *inverted* light (what makes a field read as cut into stone), hard cast shadow. Tooled-stone background, Greek-key frieze along the foot of the stele, epigraph flanked by bronze rules. Two latent bugs fixed on the way: `.hb-board`'s `background` shorthand was resetting the tooling away, and a duplicate `.hb-panel` rule was flattening the bevel back off. |
| **Berth gauges + tally** | REGRESSED — the board was rebuilt as a horizontal strip and the gauges/tally were dropped; snapshot data is computed and discarded. See CODE-AUDIT-2026-07-26.md gap #6. Previously: Six gauge channels cut into the stone, both bars on one shared `deckMax` scale so hull size reads off the gauge; plus on-quay / sailed / unseen counters. |

## Not started

Listed in the order the spec's own build order prescribes. Each is fully
specified in ART-DIRECTION.md — no design work remains, only implementation.

1. **Environment & architecture** — temple colonnade, citadel wall, parallax
   bands, the re-lit sun (pillar 1: the sun sits upper-right while every sprite
   in the tree is lit from the upper-left).
5. **Lighting rules** applied to the existing sprites.
6. **Ships** beyond the flag — hull tiers, oars, ram.
7. **Blocks as sacred relics** — scene + UI treatment.
8. **Typography and iconography.**
9. **VFX passes** within the `SCENE_FX_FILL_BUDGET = 160` fills/frame ceiling.

## Invariants that must survive all of the above

- `capacity.js` is untouchable. How many soldiers board is decided there and
  nowhere else. Guarded by `__tests__/capacityIsolation.test.js`.
- Empty benches are an honesty affordance: the visible difference between what
  a block could have carried and what it did. Never fill them decoratively.
- Nothing in the scene moves right. Time runs one way.
- No blur, no border-radius, no soft gradient anywhere in the chrome.
