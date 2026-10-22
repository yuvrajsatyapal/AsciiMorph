# Rebuild checkpoint — 2026-10-21

User requested commit and push directly on main, with all subsequent work on main and no new branches.

This checkpoint fixes persistent-worker cancellation/fatal-failure recovery and repairs audio decoding/final-seek behavior. Both passed independent review. A subsequent independently reviewed checkpoint adds packed character painting and explicit legacy document handoff; its review accepted both spec compliance and code quality. Browser pixel parity remains pending. This is an in-progress rebuild: the reference production UI and complete feature parity remain unfinished.

Validation across the current working tree (including the uncommitted packed painter): the full JavaScript suite passes 308 tests (one skipped); all 41 Rust tests pass; production Next.js build including TypeScript passes. ESLint reports zero errors and three existing prototype warnings. Canvas composition unit checks do not establish browser pixel parity; actual browser fixtures and performance measurements remain scheduled.

Reference evidence includes 521 UI descriptor variants across 497 keys, 55 public route checks, desktop/mobile panel lifecycle evidence, and verified character contrast/geometry semantics. Thirteen actual public-site JPEG captures are retained with hashes and viewport metadata. Desktop rasters are right-clipped to 943×900 despite DOM viewport 1280×900; the narrow homepage is 390×844. These captures do not prove full-width pixel parity.

The next production integration needs coordinated geometry support: reference default cells are 6.6×11, outside the initial core envelope. Contrast baseline is 20 and neutral is 0; the core uses a different factor, requiring explicit adapter fixtures. The strict project contract plan records these blockers rather than silently clamping controls.

Raw downloaded reference HTML, raw REA diagnostic captures, local execution handoff files and generated local Next route import changes remain local. No downloaded proprietary editor implementation is included in production source. Full production acceptance remains tracked in reference-parity.md.

## Coordinated geometry follow-up

The new character contract now supports finite fractional cell dimensions1..512 across TypeScript/Rust/WASM. Calibration admission/cache/delivery ownership is byte-bounded; clearing does not discard active reservations. Tiny Braille bins remain finite, painter resources are released on eviction/failure, and incompatible legacy-editor geometry fails explicitly. Fresh independent review accepted the delivery with no actionable high/medium findings. Checks:144 scoped TypeScript tests,44 Rust tests, rebuiltWASM, typecheck and scopedESLint passed. No new full-build/browser-parity claim; actual browser font/output fixtures remain Task8. Independent project-format implementation is underway separately and is not included in this geometry checkpoint.

## Project format and check reliability follow-up

Strict project transport/schema/resource readiness passed independent review:70 contract tests plus26 legacy regressions; all six initial style schemas remain unavailable for rendering. Project JSON is detached, bounded by canonical serialized bytes and checked without invoking accessors. Settings, effect order, text, mask identities and export choices persist as typed data; no pixel renderer is fabricated by registering a schema.

The integration check replaces fixed-delay worker completion assertions with request-specific conditions and a controlled delayed-step regression. ESLint excludes only the ephemeral SDD task workspace. Fresh review accepted both changes. Full integration:404 JavaScript tests pass with1 skipped; lint has0 errors and3 existing prototype warnings; productionbuild includingTypeScript passes. The build preceded the test/config-only reliability fix; no production code changed in that fix. Rust remains44 passing tests at the accepted geometry checkpoint.

The next native Characters-profile task has started separately; its unfinished files are excluded from this checkpoint. All work remains onmain. Full UI/feature parity remains open.

## Characters worker integration — 2026-10-22

Native glyph contracts and measured browser atlases were independently reviewed and pushed as2379847/a52005a. The additive112-byte profile ABI now carries full-frame RGBA and optional packed glyph data through the real retained-source worker/service. Legacy160-byte settings and grid calls remain separate. Shared immutable masks avoid per-frame atlas copies; optional profile failures preserve a working legacy connection.

Fresh review found and verified fixes for caller mutation across asynchronous service initialization and recoverable worker-budget validation. Scoped re-review accepted both fixes with no open findings. Final integration:486 application tests pass with1 skipped; production Next build and TypeScript pass. Native72 tests and the rebuilt WASM passed before the TypeScript-only fixes; affected54 tests and scoped lint passed afterward.

The actual Chromium module-worker diagnostic improved from2407ms to30.9ms for the same owned512×512 source/160×90 Braille job, with all475 numeric steps and byte-identical worker/direct output. This is a local diagnostic, not a distribution, full UI latency or final backend-performance acceptance. Real-worker fractional-profile and equal-scale preview/export fixtures also pass.

The new profile currently renders the transparent glyph intermediate only. Rust None/Solid/Blur composition, explicit complete-context capability, project binding and the production `/app` Studio remain pending. Global atlas replacement still cancels dependent exports; that interaction must be resolved or visibly disclosed before Studio acceptance. Full-width reference screenshots at1440×900 and1920×1080 are now retained with actual JPEG dimensions/hashes; they improve reference evidence without proving our UI parity.
