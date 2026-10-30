# Mosaic corner rasterization checkpoint

The canonical Mosaic 128×64 gradient frame now matches the lossless reference exactly: RGB MAE0, maximum RGBA error0, zero differing pixels. Pixel remains exact. Both real reference PNGs are copied unchanged from the parent directory. The current local captures and settings are in this directory; earlier evidence remains unchanged.

This is a canonical-fixture pass, not full Mosaic acceptance. A broader independent white-mask sweep is exact in45 of72 cases;27 larger/scaled cases still differ. Gate3.5 remains open on those findings. Characters and Dither corrections and every subsequent phase remain unfinished. Preserve the user's sequence.

## Reproductions and fixes

- Geometric circle integration failed1666 square-mask alpha pixels, first(1,1)162 versus Canvas170. A new native regression freezes full square/wide/tall masks from Chromium156.0.8078.4. All three now match exactly.
- Canvas/Skia uses conic-to-quadratic approximation, fixed-point forward differences, quarter-pixel Y and sixteenth-pixel curved-X snapping, and byte trapezoid accumulation. The native scan converter follows these rules, including clipping curves before subdivision. Attribution is in `rust/third-party/skia-LICENSE`.
- The initial implementation incorrectly advanced the snapped origin through zero-height quadratic subdivisions. Regression: tiny rounded rectangle alpha112 versus120; preserving the origin fixes it and the diagnosed right-edge clipping failure.
- Run-based additive rasterization snaps queued alpha<8 to0 and>247 to255, while full-height direct blits bypass that rule. Direct two-pixel opaque blits use a different byte interpolation: a measured34 versus33 regression now passes.
- Conic float operation order matters: measured192 versus184 at(46,4) for the font40 square tile now passes with Chromium's weight-before-endpoint arithmetic.
- The residual canonical RGB error after the mask fix came from sparse sampling bounds. `floor(14*6.6+6.6)` is98, whereas `floor(15*6.6)` is99. Computing the next base-cell origin preserves the fourth tap. A native regression failed red0 versus64 before the fix. This reduced the remaining265 differing gradient pixels to zero.

Source arithmetic references: [Skia analytic edges](https://raw.githubusercontent.com/google/skia/main/src/core/SkAnalyticEdge.cpp), [analytic rasterizer](https://raw.githubusercontent.com/google/skia/main/src/core/SkScan_AAAPath.cpp), [conic subdivision](https://raw.githubusercontent.com/google/skia/main/src/core/SkGeometry.cpp), [opaque blitters](https://raw.githubusercontent.com/google/skia/main/src/core/SkBlitter_ARGB32.cpp), [byte interpolation](https://raw.githubusercontent.com/google/skia/main/src/core/SkColorData.h). The saved Canvas masks and actual reference export are the independent acceptance oracles.

## Remaining diagnosis

`coverage-sweep.json` records every case and first difference. The diagnostic uses white tiles on256×128, fonts3/4/5/11/40/80, scales1/2/3/4, all shapes, and the native family's current paint bounds. It is diagnostic, not a full colored-frame reference comparison. Fonts3/4/5 across all scales and font11 at scales1/2 match. Remaining examples:

- Font11 scale3 wide: (37,3), native25 versus Canvas17.
- Font11 scale4 square: (239,2), native6 versus Canvas0.
- Font11 scale4 tall: Canvas paints alpha8 at(0,6), outside the current family paint bounds.
- Some larger or clipped corners retain one-byte differences. Do not hide these with thresholds or accept all Mosaic settings.

The review independently reproduced the first failures and supplied the proven skipped-subdivision fix. Banker's coordinate rounding was disproven: it introduces widespread mismatches. A prototype of the single-changing-edge smooth-jump decision did not resolve its target, so was not retained. Additional source differences to investigate include smooth-jump stopping/carrying, clipping and bounds for direct blits. Avoid speculative fixes.

## Verification

Fresh final checks:173 native tests passed;849 JavaScript tests passed with1 existing skip; production build passed; TypeScript, scoped ESLint, formatting and whitespace checks passed. Release WASM rebuilt and tested. The production browser regression now enforces full Pixel and Mosaic reference RGBA equality, plus preview/current-result and downloaded1×PNG equality for Characters, Pixel, Mosaic and Dither; passed4.1s. This does not establish Characters/Dither reference parity.

After the final WASM rebuild, all61 focused actual-WASM tests passed across the five renderer suites. WASM SHA256: `d867173a40b8bf6b0fb02e98d5feae1d53a5acf883ba590a52e190e21c7f480c`.

Reproduce canonical comparison:

```sh
node scripts/compare-lossless-reference.mjs docs/research/ascii-magic/2026-10-30/mosaic-aa
```

Regenerate the independent three-mask fixture only when deliberately reviewing oracle changes:

```sh
node scripts/generate-mosaic-canvas-fixtures.mjs
```

Reproduce the wider diagnostic (requires local Chromium execution and rustc; reports mismatches rather than asserting acceptance):

```sh
node scripts/diagnose-mosaic-coverage.mjs /tmp/mosaic-coverage-sweep.json
```

The final production test used the existing build on127.0.0.1:3108 and `/tmp/asciimorph-mosaic-aa.config.cjs`. Port3107 serves an older process that failed worker initialization after rebuilding Next output; do not use it without restarting. The new server is a local test process only.
