# Characters reference investigation

Fresh reference export: `characters-reference-export.png`, downloaded from the real reference app after uploading the verified synthetic 128×64 gradient. Characters Standard ramp `@#S08Xx+=-;:. `, size11, brightness0, contrast20, normal blend, opacity/coverage100, blur backdrop softness8/background opacity100, 1×PNG. UI confirmed128×64.

Initial local comparison:7,500 differing pixels of8,192, RGB MAE26.741984049479168, maximumRGB228, maximumalpha239. Referencealpha255 everywhere; localalpha16..255. Current local files preserve that baseline.

Trace: the project adapter omits SCX context when controls equal defaults. That selects the historical complete-Characters profile rather than corrected context composition. Context blur also still uses the old scaled/clamped six-pass helper. Shared Canvas blur is already covered by independent masks and Pixel/Mosaic reference equality.

Plan: add a failing adapter assertion for explicit default SCX and a native blank-glyph/full-gradient-backdrop oracle regression; send explicit default context for captured Characters projects; use shared Canvas blur in context jobs while preserving the historical standalone profile; rebuildWASM and recapture. Then isolate remaining glyph layer/placement differences with transparent reference/local captures. Require exact reference, broader settings and preview/export gates before Dither.

Mosaic scoped Gate3.5 is independently approved. Other phases remain open.

After the backdrop fix: RGB MAE2.0399983723958335, maximumRGB114, alpha exact. Transparent reference/local glyph-layer comparison still differs at2,617pixels. Reference source range probing includes transparent Canvas image-data pixels as black; the historical native probe skips them, raising the minimum and shifting glyph selections. Add a context-only regression with transparent black/100/200 center samples: expected glyph indices[65535,1,0], old behavior[65535,65535,0]. Preserve historical standalone fixtures; captured projects use SCX.

## Current checkpoint after range correction

Current `characters-local.png`: RGB MAE0.908203125, maximumRGB6, alpha exact,7,165 differing pixels. Transparent layer: maximumalpha1;211 alpha pixels differ,2,137 pixels differ acrossRGBA. Remaining straight RGB differences are amplified by low alpha; no tolerance was relaxed. `characters-baseline-local.png` preserves the initial result; `characters-backdrop-local.png` preserves the backdrop-only correction. Full Characters acceptance is open.

The fresh reference session also produces different Pixel edge bytes from the accepted canonical capture. `pixel-fresh-reference-export.png` is retained separately, without replacing accepted oracles. A standalone local probe proves backend-dependent rectangle coverage: at(13,0), white fillRect(13.7,0.5,5.6,10) yields alpha38 in software Canvas and77 with enabled Metal GPU Canvas. `canvas-backends.json` records the browser/version/settings. This supports a backend explanation for the fresh reference discrepancy; it does not itself establish every pipeline detail.

Repeat the local probe:

```sh
node scripts/diagnose-canvas-backends.mjs /tmp/canvas-backends.json
```

The two `characters-{software,gpu}-canvas.png` files are diagnostic **direct fillText** reconstructions, not reference oracles. They do not match the reference's WebGL glyph-batch pipeline. The source batch paints a padded white atlas, samples it linearly in WebGL, packs floating-point ink colors, and draws that canvas over the backdrop. Investigate texture-weight and premultiplied-byte quantization before changing the native glyph raster. Native currently retains rounded straight RGB and uses exact bilinear weights. An8-bit texture-weight hypothesis is not yet independently tested; do not hardcode adjustments from this checkpoint.

Keep the accepted software Pixel/Mosaic reference gate intact while resolving a stable Characters target. Never overwrite historical references to conceal backend differences. Current CUA DOM canvas proxy does not expose `getContext`; use actual downloads for reference PNGs.

Fresh verification:179 Rust tests passed;849 JS tests passed with1 existing skip before the last Rust-only range change; all61 actual-WASM tests across five renderer suites passed afterward. Production build, typecheck, scoped ESLint, rustfmt and whitespace checks passed. After the latest range change the actual production browser test passed in3.8s, preserving canonical Pixel/Mosaic fullRGBA and all four preview/download pairs. Transparent Characters preview/download bytes also match. WASM SHA256 `d4bdadf4194c9f098ace852e34c85e98c64024ababdbb1a2e2bebacf2b289b60`.

Independent review approved the scoped backdrop/allocation and transparent-probe corrections. It explicitly leaves the full Characters gate open. Dither and all later phases have not begun in this continuation.
