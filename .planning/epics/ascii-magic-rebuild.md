# Epic: ASCII Magic parity rebuild

**Created:** 2026-10-20  
**Status:** spec approved 2026-10-20 — design and implementation plan review pending  
**Owner:** team

## Why

Rebuild AsciiMorph around the user's explicitly selected reference UI and full effects-studio functionality. Make the engine Rust-owned while solving the rendering, caching, quality and media architecture gaps found in the current application.

## Full description and evidence

- [Rebuild specification](../specs/ascii-magic-rebuild.md)
- [Investigation ledger](../../docs/research/ascii-magic/2026-10-20/findings.md)

## Delivery order

These are workstreams. Split each into bounded feature specs/plans before implementation; this is not a claim that a workstream fits in one short task.

| # | Workstream | State | Depends on | Done when |
| --- | --- | --- | --- | --- |
| 1 | Reference capture, visual tokens, prototype, render contracts and baseline | capture and prototype in progress | — | Desktop/mobile states measured; design reviewed; full pipeline benchmarks; migration and render schemas specified |
| 2 | Rust engine and warm render service | todo | 1 | Tone, sampling, calibrated matching, edges, dither, Braille, packed buffers and cancellation tested; GPU strategy benchmarked |
| 3 | Complete Studio interface and first style families | todo | 1, 2 | Reference layout and controls operate on real output; thumbnails, upload, compare, crop, text, history and export work |
| 4 | Remaining style families, post effects, masks, lights, depth and animation | todo | 2, 3 | Every catalog entry has a renderer, meaningful settings, fixtures and preview/export verification |
| 5 | Video/GIF/MP4, recipes, source/render library and legacy migration | todo | 2, 3 | Real files round-trip, timing/audio handled, sources persist, recipes share, old documents remain editable |
| 6 | Flow workspace | todo | 2–5 | Editable graph executes same pipeline and preserves state across workspace changes |
| 7 | Full website surface, tools, discovery, docs and MCP | todo | 3–6 | Audited routes have functional equivalents; shared engine/schema used by MCP |
| 8 | AI generation, account/credits/commercial service integration and complete parity QA | todo | 3–7; external provisioning | Real configured services work; all gaps explicitly resolved; cross-browser visual, output, performance and migration gates pass |

## Risks and control points

GPU architecture and rendering algorithms determine quality/speed; Rust by itself does not. Current reference counts and tier documentation conflict with the live app. Signed-in/pro-only and private service behavior remain unverified. Preserve all pre-existing dirty work. Use owned/licensed assets and independent production code. Scope service provisioning and spending only after provider and commercial decisions are presented concretely.

## Success criteria

- [ ] User-approved reference appearance and interaction parity across measured viewports/states.
- [ ] Complete tracked style/effect/workflow inventory with no placeholders.
- [ ] Rust-owned renderer with measured end-to-end quality, latency and memory behavior.
- [ ] Real image/video/recipe exports, source library and working Flow.
- [ ] Existing saved work and exports survive migration.
- [ ] AI/MCP/account functions genuinely integrated after configuration; unavailable features remain explicitly incomplete.
- [ ] Full browser/testing evidence and remaining platform limits documented.
