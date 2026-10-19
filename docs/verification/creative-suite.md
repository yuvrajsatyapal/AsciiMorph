# Creative suite verification

Date: 2026-10-19. Combined implementation follows the user's instruction to implement the features together and run checking afterward. No per-feature test executions were performed before the initial combined implementation was ready; compiling the WASM artifact was part of implementation.

## Executed checks

- `npm test`: 28 files, 136 tests passed. Includes existing drawing/conversion behavior, Rust/WASM parity, FIGlet parsing/layout, gallery validation/favorites, active-layer operations, animation timing/persistence/migration/roundtrip/stale edits, seeded generators, bounded OBJ/GLB parsing and rasterization, GIF codec/disposal, media timing/validation, audio features/cleanup and recording preparation cancellation/codecs.
- `npm run lint`: passed without warnings.
- `npm run typecheck`: passed.
- `npm run build`: passed; all routes generated successfully.
- `npm run test:rust`: two native Rust tests passed.
- `cargo fmt --manifest-path rust/Cargo.toml -- --check`: passed.
- `cargo clippy --manifest-path rust/Cargo.toml --offline --all-targets -- -D warnings`: passed.
- `npm run build:wasm`: passed offline; built release artifact copied into public assets.
- `git diff --check`: passed.

- `ASCIIMORPH_E2E_PRODUCTION=1 npm run test:e2e`: **47 passed, 1 intentionally skipped**, 48 cases across desktop Chromium and iPhone 13 touch emulation, 1.2 minutes. The existing Studio exact backing-pixel comparison is desktop-only; image converter export parity still runs on both device pixel ratios.
- Browser coverage includes all creative routes and viewport width, animation archive switching/Studio frame updates, seeded generation and real GIF downloads decoded by Chromium, OBJ upload and editable snapshot, actual Rust-worker status, FIGlet editing/export, gallery search/favorites/saved creations, source GIF timing, decoded WebM export/re-import, real WAV FFT response, captured PNG export and source-audio recordings decoded back into PCM.

Screenshots: `../screenshots/generate-desktop.png`, `../screenshots/generate-mobile.png`, `../screenshots/animate-mobile.png`.

## Performance evidence

`npm run bench:wasm`, 30 warmed median samples, 1024×768 RGBA → 160×80 alpha-weighted area sampling:

| Backend | Median |
|---|---:|
| JavaScript | 4.491 ms |
| Rust/WASM | 3.629 ms |

Speedup 1.238×, maximum absolute numeric error 0. Measurement includes WASM allocation and buffer copies. A previous run measured 1.196× (5.516/4.612 ms). Native Rust sampling plus Sobel measured 2.640 ms across 50 iterations. These are bounded numeric workload measurements, not whole-conversion or whole-application claims.

## Review findings resolved

Independent spec/design review identified overwritten saved animations, synchronous turntable generation and clipped Studio file actions. Independent quality review identified GIF frame allocations before budget validation, number-array encoding overhead, missing cancellation during soundtrack preparation, an ineffective waves seed and oversized OBJ line token allocation.

Fixes: bounded multi-project archive with version-1 migration/project picker; projected mesh work limit plus async yields/abort checks; wrapping toolbars; GIF resolution budget applied before RGBA allocations and typed encoding buffers; abort-aware bounded soundtrack preparation; seeded wave phases; OBJ line/line-count limits. Further inspection replaced GIF sub-block accumulation with a bounded two-pass typed copy and ensured audio-bearing recordings request Opus/AAC when supported.

Browser QA exposed an additional mobile layout issue: intrinsic file-control widths expanded the layout viewport and displaced tap targets. The grid now uses zero-minimum tracks and bounded input widths; regression checks compare document width to the actual client viewport. The converter header wraps. Both onion-skin canvases paint above opaque frames. Failed test assumptions about implicit select labels, valid shaded mesh characters and Next.js route-announcer alerts were corrected.

## Compatibility and limits

Executed browser testing uses Chromium with desktop and iPhone 13 touch/DPR emulation. Physical devices, Safari and Firefox remain unverified. Real microphone hardware/permission dialogs are not automated; microphone opt-in and resource-release paths have implementation/unit review, while actual local audio decoding, FFT motion and recorded source audio are exercised in Chromium. WebM output is decoded by the browser and its re-import is exercised. MP4 availability is detected at runtime; no claim of MP4 support on every browser is made.

GIF is opaque, quantized RGB332, and uses 10 ms timing. Video recording runs in real time at browser capture cadence. External GLB resources, material/texture/skin rendering and paid AI segmentation are excluded; directional edges and local enhancement are implemented. See `../creative-suite.md` for exact bounds and supported formats.
