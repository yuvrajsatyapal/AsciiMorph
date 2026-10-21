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
