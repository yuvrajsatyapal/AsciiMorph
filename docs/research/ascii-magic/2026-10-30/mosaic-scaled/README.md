# Mosaic scaled coverage gate

The remaining 27 cases are closed: the independent Chromium 156.0.8078.4 sweep now matches every alpha byte in all 72 cases (256×128; fonts 3/4/5/11/40/80; scales 1/2/3/4; square/wide/tall). This is the agreed Mosaic raster coverage gate; it does not establish parity for every possible setting, later style, or workflow.

## Reproduction and regression

The first requested mismatch was reproduced in a native regression: font 11, scale 3, Wide, pixel (37,3), alpha 25 versus Canvas 17. The test failed before the fix and passes afterward. Skia keeps the slope computed before integer Y snapping; recalculating it from snapped endpoints changes coverage.

The native full-mask regression freezes all 72 independent browser masks in `tests/fixtures/render/styles/mosaic-scaled-canvas.alpha`. It caught the subsequent clipping errors before their fixes. The production TileJob regression independently failed at (0,7), transparent versus expected alpha 7, and now passes with work budgets 1 and 4096.

Additional corrected source behavior:

- Choose mask storage from original integer path bounds, before intersecting the canvas clip. A clipped small remainder of a large path must still use the run-based rasterizer.
- Bound run-based edge drift by the canvas clip rather than the nominal path box; visit adjacent paint columns and preserve earlier ink when a later tile has zero coverage.
- Route direct two-pixel coverage through general interpolation when horizontal clipping wraps the real blitter.
- Normalize quadratic extrema on clipped paths. Conic subdivision first maintains Y monotonicity, preventing spurious extrema caused by floating-point roundoff.
- Match convex scanline stopping, crossing checks, bounds and carried edge positions.

Arithmetic references remain the attributed Skia sources listed in [the earlier checkpoint](../mosaic-aa/README.md). No acceptance tolerance was introduced and historical evidence was preserved.

## Fresh verification

- Independent browser coverage sweep: 72/72 exact, no remaining differences (`coverage-sweep.json`).
- Fresh production Pixel and Mosaic canonical reference comparisons: zero differing pixels, RGB MAE 0, maximum RGBA error 0 (`lossless-metrics.json`).
- Production browser test: passed in 4.1 seconds; preview/current-result equality and downloaded 1× PNG equality for Characters, Pixel, Mosaic and Dither. Characters/Dither reference parity remains unaccepted.
- Rust: 177 tests passed. JavaScript: 849 passed, one existing skip. Production build, TypeScript, scoped ESLint, formatting and whitespace checks passed.
- Release WASM SHA256: `13841cfc8ef8d47f2404119d2fc66df76a14ffe26a1487b76b02c61c3f3c26d9`.

Repeat the sweep:

```sh
node scripts/diagnose-mosaic-coverage.mjs /tmp/mosaic-coverage.json
cargo test --manifest-path rust/Cargo.toml --offline
```

The optional third positional argument deliberately writes new Canvas mask oracle bytes. Review oracle changes explicitly; routine verification does not regenerate the checked-in fixture.

```sh
node scripts/diagnose-mosaic-coverage.mjs /tmp/mosaic-coverage.json /tmp/reviewed-mosaic-masks.alpha
```

Repeat the lossless comparison:

```sh
node scripts/compare-lossless-reference.mjs docs/research/ascii-magic/2026-10-30/mosaic-scaled
```

Continue in user order: Characters → Dither → remaining core styles → stacked effects → text/masks/lighting → animation exports → recipes/library/Flow. Characters requires a fresh real reference export and numerical findings before changes; its historical backdrop blur remains an open investigation.

Independent Gate 3.5 review approved the scoped Mosaic gate and reran all 72 masks successfully.
