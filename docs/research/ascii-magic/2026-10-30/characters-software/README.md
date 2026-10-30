# Characters software target — open acceptance gate

This is a new, consistently captured target. Historical Metal/GPU and diagnostic captures remain separate. Mosaic's closed 72-case gate is unchanged.

The source is the owned 128×64 synthetic gradient. The capture script uses the real Upload file chooser and proves the retained source by downloading Original Image with Characters opacity zero, then checking every source-over-black RGBA byte. `verified-source-reference.png` records this proof. A generic hidden file input and manually activating the crop Save button produced invalid source captures during harness diagnosis; those attempts are not acceptance evidence.

Backend: Chromium156.0.8078.4, macOS, ANGLE Vulkan SwiftShader; software 2D Canvas, sRGB RGBA8, premultiplied WebGL2, antialias disabled. Both generation and consumption check rectangle sentinel alpha38 and the actual GL renderer. Browser version, flags, source SHA256, all controls and PNG hashes are in `reference-manifest.json`. Never mix these PNGs with historical Metal captures.

## Verified corrections

- Independently drawn WebGL masks established RED for floating tone/premultiplied rounding (red63 versus51 at the first controlled pixel), opaque composition (37 versus38), and reduced shader opacity (alpha10 versus5; blue230 versus204).
- Captured-context glyph painting now uses the software sampler's nearest-sixteenth weights, floating tone colors, RGBA8 premultiplied rounding and Canvas normalized float unpremultiplication. Historical requests without SCX remain unchanged.
- Opacity enters shader alpha before RGBA8 rounding. The complete Characters composer recovers already-rounded premultiplied ink and uses image source-over; Pixel/Mosaic composition is unchanged.
- 208 independent transparent and opaque full-frame cases pass across scales1–4, fractional positions, clipped edges and opacity100/50/99/0. Another16 complete native grid cases cover actual placement/bounds, differently colored overlapping glyphs and one-unit cooperative stepping. All16 also pass through the actual Worker/WASM, with exact same-scale preview/export bytes.
- The lossless CLI now exits1 for any RGB or alpha mismatch; three CLI tests establish RGB/alpha RED→GREEN and exact success.
- The old cross-scale raster-average heuristic failed after rounding corrections. It was superseded by exact glyph-index/foreground/alpha invariants plus the independent scaled raster oracles, not a higher tolerance.

Canvas normalized float arithmetic was cross-checked against Skia's primary [swizzler implementation](https://android.googlesource.com/platform/external/skia/+/a75c6124d4a5601f2b9254e68e814af8051f9f49/src/opts/SkSwizzler_opts.inc). The acceptance values come from actual browser output, not native arithmetic.

## Remaining failing regressions

**Characters is not accepted.** All16 real reference comparisons are strict and currently fail. Details: `reference-results.json`.

- Default font11, blur8, scale1:47 differing pixels/8,192; maximum RGB error1; alpha exact; RGB MAE0.0028076171875. There are69 differing RGB bytes. Preview/export are identical. See `lossless-comparison.png` and `lossless-metrics.json`.
- Transparent font11 scale1:160 differing bytes, including51 alpha bytes. Font3 scale1 first alpha mismatch is byte8671 (pixel119,16), native118 versus reference119. This is a reproducible remaining glyph rounding boundary; the small synthetic oracle does not cover every real-atlas/UV rounding case.
- Scale2 blur:28,954–31,876 differing RGB bytes across the four fonts, with exact alpha. First byte82 differs29 versus28, before the relevant glyph paint. Isolate scaled backdrop sampling/filtering separately from glyph interpolation. No tolerance may be raised.
- All16 real-reference runs retain exact preview/export equality. The real captured matrix currently covers font sizes3/11/17/47, None/Blur, scales1/2. Scales3/4 have independent WebGL/native/Worker coverage, but the real reference matrix still needs extension after these failures are fixed. Earlier3× capture failures occurred before source identity was corrected and do not establish a product limitation.
- Non-normal blend modes and arbitrary nonzero mask-border/atlas UV cases still need their own exact reference coverage before broader Characters parity claims.

Repeat capture and the failing gate:

```sh
node scripts/capture-characters-software-reference.mjs
CHARACTERS_REFERENCE_DIR=docs/research/ascii-magic/2026-10-30/characters-software npx playwright test --config playwright.characters-parity.config.ts
node scripts/compare-lossless-reference.mjs docs/research/ascii-magic/2026-10-30/characters-software characters-11-blur-1
```

The matrix test checks PNG dimensions, full buffer lengths, source/image hashes, complete case identities, current browser version and actual backend before comparing every RGBA byte. It is opt-in in the general Worker suite; running it explicitly currently produces a genuine failing regression, not a passing parity claim.

## Verification at checkpoint

183 native tests;852 JS tests plus1 existing skip; production Next build, TypeScript and scoped ESLint passed. Characters Worker suite:5 passing plus the explicit reference gate skipped unless requested. The requested real reference gate fails as above. Production same-input test passes canonical Pixel/Mosaic reference RGBA and preview/PNG equality for Characters, Pixel, Mosaic and Dither. No Dither correction or later stage has begun.

Independent review accepted the scoped native fixes. Its two harness findings (partial-prefix comparison and unverified consuming backend) were fixed with full geometry/length/hash checks and a pinned browser config plus live sentinels. These approvals do not close Characters.

WASM SHA256:a0054ef69555b80d979064b278ed427d4453d099a6c5f065c91d57a03b05efee.

Continue Characters until exact acceptance, then Dither → remaining core styles → stacked effects → text/masks/lighting → animation exports → recipes/library/Flow.
