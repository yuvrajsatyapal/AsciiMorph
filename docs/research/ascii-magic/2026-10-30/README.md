# Pixel accepted fixture and Mosaic correction checkpoint

Later 30 October update: the canonical Mosaic corner fix now matches every reference RGBA byte. Broader scaled coverage still has open findings. See the [Mosaic antialiasing evidence and remaining work](mosaic-aa/README.md); the checkpoint below is retained as historical evidence.

The full requested sequence remains unfinished. Pixel matches the fresh lossless reference exactly on the canonical 128×64 fixture at 1×. Mosaic sampling and geometry corrections are implemented, but its corner antialiasing has not passed visual acceptance. Characters, Dither, remaining core styles, stacked effects, text/masks/lighting, animation exports, recipes/library/Flow remain open in that order.

## Shared backdrop and Pixel

Reproduced three independent failures before implementation:

- Image backdrop opacity zero returned transparent `[0,0,0,0]`; Canvas fills black first and returns `[0,0,0,255]`.
- A white 101-square with blur8 returned white at the left border; Chromium returns 134 on that edge and 70 in the corner.
- Half-opacity ink `[51,0,204,128]` over `[21,10,95,255]` returned `[36,5,150,255]`; the Canvas byte products return `[35,5,149,255]`.

`CanvasBlur` combines the three box kernels for each axis before cropping, preserving transparent intermediate outsets without extra padded planes. It rounds premultiplied channels between axes. Blur softness is literal output pixels, as in the observed reference renderer; export scale does not multiply it. Kernel metadata is inline and included in existing memory estimators. No render-step allocations were introduced. `StyleContext` draws image backdrops over opaque black, applies background opacity to premultiplied RGB, and uses separate byte products for normal blending over opaque backdrops. The historical Characters compositor still uses its old filter; its full integration is part of the pending Characters correction.

The kernel follows the raster three-box window definition described in [Skia's blur engine](https://skia.googlesource.com/skia/+/refs/heads/chrome/m146/src/core/SkBlurEngine.cpp). It is independently checked against Canvas values at softness 1, 2, 3, 8, 20 and 60. The entire gradient backdrop matches the saved browser oracle byte-for-byte.

The 29 October reference export differs from a fresh export at the same recorded settings. The fresh export matches an independent Canvas reconstruction byte-for-byte. Do not tune the new renderer to the old export's larger border differences. Historical evidence is unchanged.

`pixel-reference-export.png` is a real reference PNG export, selected at 1×, 128×64, using the owned gradient fixture. Controls: blur8, background opacity100, size11, normal blend, ink opacity100, coverage100, brightness0, contrast20. `pixel-local.png` has exactly the same RGBA bytes across all 8192 pixels. The browser regression now enforces that full-frame match, then verifies preview readback and downloaded PNG bytes. This is evidence for this fixture and settings, not exhaustive acceptance of every control/export scale.

## Mosaic remains open

Observed RED for sparse sampling (black instead of expected red85) and missing inset (white instead of transparent at the gap), followed by GREEN. The corrected renderer:

- Samples the originating base cell for square/wide/tall tiles, skipping alternate base cells for merged shapes.
- Uses a sparse stride derived from floored source base-cell width for both axes.
- Applies tone and clamps every tap before averaging, then inverts/rounds once.
- Uses ink opacity independently of source alpha, insets tiles one output pixel, and rounds corners at 20% of the merged pitch's smaller dimension.

Current circle integration is geometric coverage with bounded quadrature at curved edge pixels. Chromium path antialiasing differs. At size11, a white tile at `(1,1)`, dimensions4.6×9, radius1.32 has Canvas alpha170 at `(1,1)` and 248 at `(1,2)`. At left7.6, corresponding Canvas alphas are35 and128; straight edge alpha at `(7,5)` is103. At left119.8, Canvas alpha at `(119,2)` is80, while exact circle integration is about50. Diagnose the path rasterizer rather than changing tile pitch, source sampling, or tone to hide these differences.

`mosaic-reference-export.png` is a fresh square-shape reference with the same settings as Pixel. Current comparison: RGB MAE0.19091796875, maximum channel difference16, alpha exact, 1566 differing pixels. This is **not accepted**. `characters-local.png` and `dither-local.png` are current baselines, not accepted corrections.

Reproduce the lossless metrics and the enlarged reference/local/error panels with:

```sh
node scripts/compare-lossless-reference.mjs
```

The error panel multiplies RGB differences by8. Metrics include PNG hashes and exact byte comparison; differing PNG file hashes are expected even when decoded pixels match.

## Verification

Verification passed: 168 native tests, 849 JavaScript tests with one existing skip, 22 focused actual-WASM tests, and the production Next build. The full JavaScript run used one worker; a competing-work run timed out in three UI tests. The browser production-route regression passes for all four preview/1× PNG export pairs and now asserts exact Pixel reference bytes. TypeScript, scoped ESLint, Rust formatting, and whitespace checks passed. An independent reviewer found no actionable resource, stepping, cancellation, or ownership defects and independently passed17 focused native checks. The reviewer identified scaled/partial-alpha browser oracles as a remaining coverage gap.

Release WASM SHA256: `f06a9bd7fad0f76670a9ef0e67ee8c926b979441cb87a02c7c06d3729c0814a9`.

No broad visual acceptance, animation, mobile, performance, or 4K claim is made.
