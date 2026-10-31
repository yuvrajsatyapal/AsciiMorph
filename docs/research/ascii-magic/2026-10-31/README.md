# Dither static parity evidence — 31 October 2026

The incoming checkpoint matched 32/56 genuine public PNGs. The controlled closure matrix in `dither-seeded/` now matches **56/56 complete RGBA buffers**, and `dither-backdrops/` matches **14/14** additional default/selected backdrop cases. All 70 alpha buffers and same-scale preview/export pairs match exactly. The final verification and review record is [Dither closure](../../../verification/dither-parity-2026-10-31.md).

## Capture provenance

Both matrices use the owned 128×64 gradient, Chromium 156.0.8078.4, software Canvas and SwiftShader. Manifests bind source/PNG hashes, dimensions and visible settings. The 56-case matrix additionally retains an independently checked Original source proof and a genuine pixel-size-1 alpha check.

The user approved a new capture with controlled randomness. The capture overrides the standard Math.random primitive with xorshift32 seed 123 per callsite, so unrelated UI consumption cannot advance the noise stream. Its manifest records exactly 16,384 draws at the reference's noise generator. The local 128×128 tile is generated independently from float32 white noise minus its toroidal 5×5 mean, then normalized to bytes. It is fixed for deterministic preview/export.

The untouched Dither UI exposes Blur 0 and samples the retained source. Additional cases explicitly select Original, None, Solid, Blur 8, Original 50% and Blur 50%, each at 1×/2×. These selected backdrops are prepared before quantization.

## Historical diagnostics

`dither-verified/` preserves the original unseeded 56 PNGs and incoming 32/56 report. The intermediate `reference-results-after-diffusion-correction.json` records 54/56; its two unseeded Blue Noise images cannot be regenerated from recorded settings alone. The seeded capture replaces the closure matrix with the user's approval; no old PNG was overwritten.

`dither-original/` is an earlier nonblank capture with weaker provenance. Its pre-correction report used public Original versus local None, so it is a diagnostic rather than a same-settings acceptance gate. `dither-software/` is the rejected blank None-backdrop capture. None genuinely yields clear Dither output.

## Independent numerical fixtures

Primitive-only Canvas scripts generate even128×64 and odd31×19 samples, prepared backdrop buffers, and an independent full-plane Float32 diffusion oracle. Native tests compare complete outputs. The odd fixture records sequential draws at pixel sizes 1→2→3→12. Chromium's decode cache makes odd-size output depend on preceding draws: a fresh first31×19→3×2 draw differs. The renderer uses a deterministic ceil-mip policy matching the recorded sequence, not arbitrary incidental cache state.

Prepared-input fixtures also cover 30%/70% opacity. Review found and fixed half-way alpha conversion, PNG premultiplication before filtering, and the maximum admitted fixed-stack depth. Admission and cooperative cancellation retain their existing limits.

## Reproduction

```sh
DITHER_RANDOM_SEED=123 node scripts/capture-dither-software-reference.mjs docs/research/ascii-magic/2026-10-31/dither-seeded
node scripts/capture-dither-backdrops.mjs
node scripts/generate-dither-sampling-fixtures.mjs
node scripts/generate-dither-blue-noise.mjs --check
node scripts/generate-dither-backdrop-fixtures.mjs --check
node scripts/generate-dither-diffusion-fixtures.mjs --check
cargo test --manifest-path rust/Cargo.toml --offline
npm run build:wasm
npx playwright test --config playwright.dither-parity.config.ts
```

Real public 3×/4× export comparison remains deferred. Remaining core styles, stacked effects, text/masks/lighting, animation exports, then recipes/library/Flow remain in that order.
