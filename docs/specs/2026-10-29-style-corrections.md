# Existing-style visual corrections

Continue the 28 October parity plan, in user order Pixel, Mosaic, Characters, Dither; only then remaining core families and workflows in the saved order. Existing source captures are diagnostic, not accepted reference oracles.

## Evidence and correction sequence

Public renderer script observed on the reference page on 29 October: `/app/_next/static/chunks/3h-myp5srmnc2.js`. Static source inspection supplies hypotheses; visible same-input comparison remains required. Readable diagnostic copy stays in `/tmp/asciimorph-reference-source/renderer-readable.js`.

Pixel retains 0.6F × F pitch. At normal size, draw rectangle begins at cell origin +0.5 in both axes and ends at the far edge -0.5; use fractional destination-pixel coverage. Sample floor(cell center) clamped to source extent, not area average. Apply contrast/brightness, optional inversion, then round to nearest multiple of 51. Transparent hidden source RGB is zero at browser image-data boundary. Pixel ink alpha comes from layer opacity rather than source alpha (the reference fill style uses charOpacity directly); transparent hidden RGB normalizes to black. Quantization formula is already correct. Add distinct coverage, center-vs-area and palette-threshold regressions; establish red before implementation. Export scale changes pitch, while the reference's literal half-pixel inset stays in output coordinates.

Mosaic draws origin +1 with dimensions merged pitch -2 and corner radius 0.2 × min(merged pitch). Wide/Tall skip alternating base cells, and sample only their originating base cell. Sampling starts at floored base-cell bounds, steps max(1,floor(base source width/3)) in both axes; clamp tone per tap before averaging, then invert and round. Add independent sparse/clamp/shape/coverage regressions before implementing.

Existing independent-profile tests asserting gapless area-filled tiles are superseded only by verified corrections; preserve memory, cancellation, cooperative stepping, crop/rotation and preview/export checks. Do not claim visual acceptance from unit tests. Update comparison evidence without replacing historical captures.

Characters and Dither require separate investigations and written numerical findings before changes. Dither Strength zero still quantizes in the reference; isolate diffusion scaling and sampling before changing it.

## Mosaic corner rasterization, 30 October

Independent Chromium white-mask captures reproduce 1,666 differing square-tile alpha pixels. The first is (1,1): geometric integration162 versus Canvas170. Skia converts circular conics to quadratic splines at tolerance0.25, subdivides those into fixed-point edges, snaps Y to quarters and curved X to sixteenths, and accumulates byte trapezoid coverage. Smooth edge transitions can extrapolate to the next integer scanline. True circle integration therefore cannot reproduce the observed mask.

Implementation plan: first freeze square/wide/tall128×64 browser masks and demonstrate RED; replace geometric integration with a bounded native rounded-path scan converter using the above rules; require exact masks before checking the real gradient export; rebuild WASM and run preview/download equality checks. Preserve sparse sampling, tone, cooperative work limits, memory admission and cancellation. Attribute any Skia-derived arithmetic. Do not change acceptance thresholds. Continue Characters only after Mosaic's lossless comparison passes.


## Mosaic scaled coverage closure, 30 October

The 72-case Canvas alpha oracle now matches exactly after pre-snap slope preservation, original-bounds mask selection, clipped-path extrema normalization, conic Y monotonicity, and run-based clip/paint bounds corrections. Full-mask and production drift regressions were observed failing before fixes. Canonical Pixel/Mosaic lossless RGBA and all four existing preview/download pairs remain exact. Evidence and repeat commands: `docs/research/ascii-magic/2026-10-30/mosaic-scaled/README.md`.

Next phase remains Characters: capture a fresh same-input reference PNG; isolate glyph layer versus backdrop errors; add failing regressions for observed differences; fix and repeat lossless, preview/export, scale and clipping checks. Investigate the historical character blur helper against the already verified shared Canvas blur. Do not change glyph selection or sampling to compensate for backdrop differences. Dither and subsequent workflows follow only after this gate.
