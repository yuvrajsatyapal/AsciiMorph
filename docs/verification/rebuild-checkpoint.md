# Rebuild checkpoint — 2026-10-21

User requested commit and push directly on main, with all subsequent work on main and no new branches.

This checkpoint fixes persistent-worker cancellation/fatal-failure recovery and repairs audio decoding/final-seek behavior. Both passed independent review. A subsequent independently reviewed checkpoint adds packed character painting and explicit legacy document handoff; its review accepted both spec compliance and code quality. Browser pixel parity remains pending. This is an in-progress rebuild: the reference production UI and complete feature parity remain unfinished.

Validation across the current working tree (including the uncommitted packed painter): the full JavaScript suite passes 308 tests (one skipped); all 41 Rust tests pass; production Next.js build including TypeScript passes. ESLint reports zero errors and three existing prototype warnings. Canvas composition unit checks do not establish browser pixel parity; actual browser fixtures and performance measurements remain scheduled.

Reference evidence includes 521 UI descriptor variants across 497 keys, 55 public route checks, desktop/mobile panel lifecycle evidence, and verified character contrast/geometry semantics. Thirteen actual public-site JPEG captures are retained with hashes and viewport metadata. Desktop rasters are right-clipped to 943×900 despite DOM viewport 1280×900; the narrow homepage is 390×844. These captures do not prove full-width pixel parity.

The next production integration needs coordinated geometry support: reference default cells are 6.6×11, outside the initial core envelope. Contrast baseline is 20 and neutral is 0; the core uses a different factor, requiring explicit adapter fixtures. The strict project contract plan records these blockers rather than silently clamping controls.

Raw downloaded reference HTML, raw REA diagnostic captures, local execution handoff files and generated local Next route import changes remain local. No downloaded proprietary editor implementation is included in production source. Full production acceptance remains tracked in reference-parity.md.

## Coordinated geometry follow-up

The new character contract now supports finite fractional cell dimensions1..512 across TypeScript/Rust/WASM. Calibration admission/cache/delivery ownership is byte-bounded; clearing does not discard active reservations. Tiny Braille bins remain finite, painter resources are released on eviction/failure, and incompatible legacy-editor geometry fails explicitly. Fresh independent review accepted the delivery with no actionable high/medium findings. Checks:144 scoped TypeScript tests,44 Rust tests, rebuiltWASM, typecheck and scopedESLint passed. No new full-build/browser-parity claim; actual browser font/output fixtures remain Task8. Independent project-format implementation is underway separately and is not included in this geometry checkpoint.
