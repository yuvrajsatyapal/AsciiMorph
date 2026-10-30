# Characters software target — implemented scope accepted, 31 October

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

## Historical failing checkpoint, superseded by closure below

At the previous checkpoint all16 real reference comparisons failed. Those saved failing inputs remain unchanged; current `reference-results.json` records the exact passing rerun.

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

## Historical verification at checkpoint

183 native tests;852 JS tests plus1 existing skip; production Next build, TypeScript and scoped ESLint passed. Characters Worker suite:5 passing plus the explicit reference gate skipped unless requested. The requested real reference gate fails as above. Production same-input test passes canonical Pixel/Mosaic reference RGBA and preview/PNG equality for Characters, Pixel, Mosaic and Dither. No Dither correction or later stage has begun.

Independent review accepted the scoped native fixes. Its two harness findings (partial-prefix comparison and unverified consuming backend) were fixed with full geometry/length/hash checks and a pinned browser config plus live sentinels. These approvals do not close Characters.

WASM SHA256:b26606a7caee6a142901ae01f9bab13127d09c6e5f4c6043086214062774958f.

Continue Characters until exact acceptance, then Dither → remaining core styles → stacked effects → text/masks/lighting → animation exports → recipes/library/Flow.

## Closure, 31 October

Characters is reviewed and closed for the implemented canonical software profile: standard Courier ramp, normal blend, None/Blur8, fonts3/11/17/47, owned gradient. All16 actual reference exports at1×/2× now have **zero differing RGBA bytes**. The independent32-case padded WebGL/Canvas matrix at1×–4× also has **zero differing RGBA bytes**. Every same-scale preview/export pair is identical. `reference-results.json` and `independent-results.json` record all cases.

The remaining fixes were byte-first float32 normalization, exact snapped triangle/UV planes for the padded atlas (including odd triangle-strip ordering), upstream four-bit bilinear RGBA8 source preparation, rounded source premultiplication, and the blur's integer scaled divider. Captured atlases carry an explicit optional batch flag; packets without extended context retain mode0. Native memory admission charges the small owned batch state before allocation; cancellation and release regressions pass.

The independent reviewer accepted the implementation after two findings were fixed: a flagged atlas without SCX had to retain mode0, and partial-alpha source taps had to use rounded premultiplication. Fresh verification:188 native tests,854 JS tests plus1 existing skip, all7 Characters Worker tests with both gates enabled, production build, TypeScript, scoped ESLint, rustfmt and diff checks passed. The fresh production app preserves exact canonical Pixel/Mosaic RGBA and all four preview/download pairs; its default Characters PNG also passes the strict lossless CLI with zero RGBA differences. The nine full-frame browser fixtures regenerate byte-for-byte.

**Deferred by the user:** actual public3×/4× exports require Pro. Selecting3× opens Upgrade to Pro and leaves2× dimensions; no3×/4× public export was accepted. The user confirmed no Pro purchase and asked to leave this for now. Independent3×/4× raster/composition coverage uses measured masks and the selected native grid, so it does not establish public-app3×/4× selection/atlas parity. Non-normal blend/mask workflows, other fonts/ramps and other browser backends are not included in this closure claim.

Repeat the complete gate:

```sh
CHARACTERS_REFERENCE_DIR=docs/research/ascii-magic/2026-10-30/characters-software npx playwright test --config playwright.characters-parity.config.ts
```

Future Pro-enabled expansion uses `CHARACTERS_REFERENCE_SCALES=1,2,3,4` for both capture and comparison. Until then, this explicitly deferred coverage stays unclaimed.

WASM SHA256: b26606a7caee6a142901ae01f9bab13127d09c6e5f4c6043086214062774958f.

Next: Dither → remaining core styles → stacked effects → text/masks/lighting → animation exports → recipes/library/Flow.
