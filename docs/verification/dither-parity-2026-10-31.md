# Dither static reference closure — 31 October 2026

The required captured 1×/2× gate passes: **56/56 zero-RGBA matches**, plus **14/14 default/selected-backdrop matches**. All 70 alpha buffers and all 70 preview/export pairs are exact. No tolerance was raised. Independent review accepted the corrected implementation.

## Evidence

- [Seeded manifest](../research/ascii-magic/2026-10-31/dither-seeded/reference-manifest.json) and [56 full-buffer results](../research/ascii-magic/2026-10-31/dither-seeded/reference-results.json).
- [Backdrop manifest](../research/ascii-magic/2026-10-31/dither-backdrops/reference-manifest.json) and [14 full-buffer results](../research/ascii-magic/2026-10-31/dither-backdrops/reference-results.json).
- Owned 128×64 gradient, Chromium156.0.8078.4, software Canvas and SwiftShader. The harness verifies source/PNG hashes, visible settings, geometry, source proof, retained alpha and runtime backend before rendering through the actual worker.
- The user approved replacing the unseeded Blue Noise closure capture with controlled randomness. Standard Math.random receives xorshift32 seed123 independently per callsite; the manifest records16,384 draws at the noise generator. No reference application function or internal state is imported. The earlier unseeded PNGs and incoming32/56 report remain intact. An intermediate54/56 report preserves the remaining unseeded noise mismatch.

## Corrections

Sampling uses decoded premultiplied bytes, staged16.16 low-precision bilinear filtering, ceil-sized mip reductions and the recorded bitmap-filter path. Both full128×64 and31×19 partial-alpha fixtures pass at pixel sizes1/2/3/12. The fixed inline stack admits levels0–7 without retaining a mip pyramid.

Diffusion initializes sampled, contrast-processed colors as float32 before incoming errors. Every neighbor addition rounds the complete working value to float32. Three reusable rows match eight independent full-plane fixtures across ten rows, partial alpha, fractional threshold bias and work budgets1/7/4096. Transparent cells propagate numerical error while emitting clear RGBA.

Halftone uses the captured clustered threshold field; Radial uses its clamped distance field; White Noise preserves Number-multiplication/bitwise conversion ordering. Blue Noise uses an independently generated fixed128×128 high-pass tile, with float32 intermediate storage, toroidal5×5 mean removal and normalized bytes. Its SHA256 is `d284dd64c10567f7f8309db3ab8c6e78640b602cd5a6a0f9b2a30e86bd802029`.

Untouched Dither samples the source. Selected None/Solid/Original/Blur form the input before quantization. Preparation reuses admitted composer scratch, rounds PNG premultiplication before filtering and applies image opacity before blur. Fourteen independent Canvas input buffers additionally pin30%/50%/70% opacity at1×/2×. SkPaint's half-up byte alpha and SkAlpha255To256 image-blitter arithmetic are distinct from ties-even color quantization. An independent partial-alpha regression pins `[200,0,0,200]` at50% to prepared red79.

The completed Dither frame bypasses post-composition. Resource caps, source identity, cooperative work, cancellation and the existing transport remain intact. Other families retain their previous compositor path.

## Independent review

Read-only reviewers `/root/diffusion_review` and `/root/sampling_review` reviewed numerical correctness, scope, ownership, admission and cooperative stepping. Review found and reproduced three issues: insufficient stack depth for prepared4× input, half-way alpha conversion at30%/70%, and PNG premultiplication ordering. All were fixed with failing regressions before correction. Final scoped re-review accepted with no remaining actionable findings. Acceptance applies to this captured static gate.

Numerical corroboration: [Chromium mip sizing](https://chromium.googlesource.com/chromium/src/+/52f0b3b/cc/tiles/mipmap_util.cc), [decode-cache resizing](https://raw.githubusercontent.com/chromium/chromium/main/cc/tiles/software_image_decode_cache_utils.cc), [Skia image blitter](https://raw.githubusercontent.com/google/skia/main/src/core/SkBlitRow_D32.cpp), and [Canvas alpha-before-filter order](https://html.spec.whatwg.org/multipage/canvas.html#drawing-model). Primitive-only Canvas probes and complete fixtures establish the measured values; source inspection alone was not used as a parity claim.

## Validation

- Native:201 tests pass;26 focused Dither/sampling tests also pass after adding explicit fixture-length assertions.
- JavaScript:854 pass,1 existing skip. Two5-second UI timeouts occurred while the production build and browser gates ran concurrently; a fresh complete run with two workers passes without changing timeouts.
- TypeScript and production Next build pass. ESLint:0 errors,3 existing prototype warnings.
- Rebuilt WASM SHA256: `ba485d48ab847a9c1967d0eddf4bed9b4d8c9b844174da848f4f9f5f78469b1a`.
- Strict reference gate:2 browser tests pass, covering70 full RGBA comparisons.
- Production browsers:39 pass,9 deliberate skips across desktop Chromium, Firefox, WebKit and mobile. Coverage includes Dither controls/history/PNG/JPEG, all15 actual-worker algorithms/captured exports, Pixel/Mosaic/Braille regressions and thumbnails. The interrupted combined run completed desktop/Firefox; a resumed run against the same production server completed WebKit/mobile. One stale translucency fixture assumed Pixel ink retained source alpha; it now uses Dither Original and passes its focused rerun. Artifacts use isolated output directories.
- [Durable validation record and logs](../research/ascii-magic/2026-10-31/dither-closure/verification-run.json).

## Bounds and next work

The odd31×19 oracle records sequential draws1→2→3→12. Chromium decode-cache history changes some odd-size results; the renderer uses a deterministic policy matching this recorded sequence. Unseeded random-tile identity and arbitrary cache histories are not claimed. Real public3×/4× comparisons remain deferred; animation stays unavailable.

Continue in the user's order: remaining core styles → stacked effects → text/masks/lighting → animation exports → recipes/library/Flow. This gate does not close those stages or the complete website.
