# Characters profile — incremental verification

The rebuild targets the full reference website. This checkpoint implements only the native glyph layer and its strict TypeScript contracts. It does not enable the complete Characters look or replace the production Studio yet. The browser atlas, additive WASM interface, worker integration, Rust backdrop and project binding are subsequent stages.

## Native glyph layer

Rust owns source-center sampling, sampled luminance normalization, direct input-ramp selection, brightness/contrast, bilinear mask placement and row-major alpha composition. Full source-derived frame dimensions retain partial-cell margins; zero-cell frames remain transparent. Literal space has an explicit index, independent of measured coverage. Work is cooperatively bounded inside glyph rasterization, with checked source/atlas/output/job admission before output allocation.

Brightness preserves the captured operation order `255 * (brightness / 100)`. The independent B50/channel0/contrast0 regression expects128; folding the expression into `2.55 * brightness` incorrectly produces127 at that tie.

Both result validators require the expected source reference and validate source-derived crop/rotation/scale geometry. Regression tests reject a result that matches forged settings but not the retained source, including collapsed clipped crops.

Checks for this stage:

- `cargo test --manifest-path rust/Cargo.toml --offline --test reference_characters`:19 passed.
- `cargo test --manifest-path rust/Cargo.toml --offline --lib --test character_matching --test character_source --test character_session`:44 existing tests passed.
- `npx vitest run src/render/reference-characters.test.ts src/render/character-contract.test.ts`:29 passed after the source-aware frame fix.
- TypeScript and scoped ESLint passed. Meaningful missing-module and behavioral RED→GREEN evidence is recorded in the task report.

No new WASM build, browser acceptance or full-suite result is claimed by these checks. The old ABI and renderer are unchanged.

## Explicit limits

Only the transparent glyph-layer context executes at this stage. Complete-look readiness requires Rust-rendered backdrop composition. Grapheme indexing, tinted alpha masks, transparent-source treatment and bilinear interpolation are independently specified policies. Reference upstream image preparation, exact browser text hinting, native color emoji and blur equivalence remain unproved. Browser font pixels can vary across platforms. Full feature and UI acceptance remains open in [the parity ledger](reference-parity.md).

## Measured browser atlas (Task 2)

The opt-in `calibrateReferenceCharacters` API now returns the accepted `ReferenceCharacterAtlasV1` wrapper. It preserves unique grapheme input order, explicit top/start/LTR placement, shared measured bounds and fractional origins, and exact literal U+0020 identity. The logical cell rectangle participates in the bounds even when every glyph has zero alpha. Legacy calibration retains center/middle placement, coverage sorting, stable deduplication and its original exact-family verification.

The controlled font policy accepts exactly `"Courier New", Courier, monospace`. Its key identifies an **intentional system fallback** and measured browser rasterization, not a guarantee that Courier is installed. The separate `verified-family` policy retains existing intentional generic families and requires a matching loaded registered FontFace for a named family; arbitrary fallback lists remain rejected. Font revision, profile, policy, placement, order, measured dimensions and origins participate in identity. Unicode masks retain alpha for later tinting; native color emoji RGB parity is not claimed.

Before font loading, the shared factory budget reserves 66,560 job bytes (64KiB bookkeeping plus a 16×16 RGBA metrics surface), and 16,793,600 delivery bytes per subscriber (maximum 16MiB result plus 16KiB metadata). After font loading, tiny-canvas actual bounding boxes determine the shared extent. One atomic update revises the job and all live subscriber charges before resizing the reusable canvas or allocating masks. Actual masks plus coverage/shapes must fit the fixed 16MiB profile cap even if injected legacy test limits are larger. Cache hits and later pending joins use exact measured charges. Clear/abort keeps outstanding noncancellable font work charged until settlement. These are modeled owned-byte limits; browser font/`measureText` native allocations and caller-owned snapshots after handoff are excluded.

The isolated fixture at `tests/e2e/calibration/reference-atlas.spec.ts` serves the actual production calibrator through installed Vite, loads the bundled IBM Plex Mono Latin 400 italic font, and compares its masks against independently drawn full-frame `fillText`. No production route or dependency was added. On macOS Chromium 156.0.8078.4, F31.5, logical cell10×31.5 and ramp `fÁQ ` produced origin(-0.5040000081,-5.0497493744) and extent21×37. Fractional full-frame anchors exercise resampling. Normalized alpha L1 error was0.219689 (limit<0.35), alpha mass relative error0.0005251 (limit<0.08), and alpha centroid distance0.432165px (limit<0.8). These tolerances allow native text hinting and fractional raster resampling differences; they do not assert identical font pixels. The fixture also verifies controlled-stack identity, registered named-font acceptance, missing named-font rejection and the generic/fallback-list boundary.

Task 2 checks:

- `npx vitest run src/render/glyph-calibration.test.ts src/render/glyph-calibration-budget.test.ts src/render/reference-characters.test.ts src/render/character-contract.test.ts`:82 passed (45 calibration,8 budget,23 reference contract,6 existing character contract).
- `npx playwright test -c tests/e2e/calibration/playwright.config.ts`:1 Chromium fixture passed. Local-listener sandbox restrictions required approved execution; a final approval-review timeout was retried successfully.
- `npm run typecheck`, scoped ESLint and `git diff --check`:passed.

Logs and meaningful RED→GREEN evidence are recorded in `.superpowers/sdd/ascii-magic-character-style/task-2-report.md`. This browser test verifies calibration only. It does not exercise the future profile ABI, app worker/service, Rust backdrop, preview/export or complete-look acceptance. No full suite, application build, WASM rebuild or Firefox/WebKit result is claimed by this Task 2 checkpoint. Native interpolation fixtures remain Task 1 evidence and were not duplicated in JavaScript.
