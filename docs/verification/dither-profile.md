# Dither static profile — 2026-10-28

This is the historical local profile. Its sampling, strength, transparent diffusion and noise rules are superseded by the [31 October reference closure](dither-parity-2026-10-31.md).

Implemented against [the saved contract](../specs/2026-10-27-dither.md), with the [existing-dock controls plan](../specs/2026-10-28-dither-controls.md). This verifies an independently specified local static renderer; it does not establish reference pixel equivalence.

## Delivered

Dispatch15, atlas-free STY1 transport, all15 genuine algorithms: Bayer2/4/8/16, ranked8×8 halftone, periodic radial threshold, horizontal/vertical/diagonal lines, seeded white noise, independent16×16 blue noise, Floyd–Steinberg, Atkinson, Stucki and Sierra Lite. Capability negotiation controls availability; an older worker without dispatch15 keeps the tile unavailable. Studio exposes algorithms, palettes, chroma, integer pixel size/strength/contrast/threshold/angle, custom opaque palettes, shared composition, native thumbnails, whole-look history and captured PNG/JPEG exports. No dependency, session, worker or budget increase.

The14 named palettes are exact transcriptions of [inert literal-only evidence](../research/ascii-magic/2026-10-27/dither-palettes.json): source SHA256 `c8da7db27d92656145fe8dafd62a08c7d5864b48b744f4dedace8074ae2cb6c4`, Unicode declaration range31097..32325. The separately labeled Source RGB332 option is a local8×8×4 quantizer. Custom palettes retain2–64 ordered opaque hex colors; both boundaries reject malformed values, counts, fractional controls and unsupported animation flags. Per Channel UI explicitly explains that channel combinations may leave the palette.

## Numerical behavior

- Exact alpha-weighted source-area square cell samples, including clipped partial cells; zero-alpha hidden RGB has no influence. Crop/quarter rotation/render scale use existing geometry.
- Contrast pivot127.5, multiplier contrast/100, neutral100. Preprocessed RGB clamps before quantization; final blended output clamps and rounds to nearest byte. Distances, threshold bias and blend use f64; each diffusion neighbor addition rounds to f32.
- Nearest squared RGB or Rec.709 luminance chooses the first palette entry on ties. Per-channel ties choose the lower sorted channel value.
- Strength0 bypasses contrast/quantization and returns original sampled color/alpha at the layer boundary. Nonzero strength blends after quantization; diffusion error is computed before strength blending. Complete-frame backdrop composition remains a separate operation.
- Pattern bias is255×(thresholdField−threshold/100). Diffusion uses thresholdField0.5, clips unavailable neighbors without renormalization and discards incoming error at transparent cells.
- Blue noise uses independently generated toroidal farthest-point ranks, initial position0, row-major tie ordering. The compiled tile equals [the generated fixture](../../tests/fixtures/render/styles/blue-noise-v1.json) and was independently regenerated during review. Binary half-density low-frequency DFT energy at frequencies−2..2 excluding DC: blue `2.3054e-27`, seeded white `1137.020940636137`. This is spectral evidence for that fixture, not perceptual equivalence to the reference.

## Ownership and budgets

The existing session owns source and jobs. Dither retains the current and two future f32 RGB error rows, a bounded palette (max256 colors) and bounded custom palette copies. The existing FrameComposer owns layer, premultiplied composition scratch, frame and serialization. Preflight includes source, other live resources, StyleJob metadata, allthree error rows, palette and custom capacity allowances; actual excess capacities are checked. Exact budget succeeds and one byte less fails. Cancellation drops error/palette/custom and composer storage. Geometry validation precedes allocation arithmetic, and checked arithmetic rejects overflow. A review-found direct native constructor panic on pixelSize0/scale0 and unchecked reservation overflow was reproduced RED, corrected, and independently re-reviewed. Wire counts are checked before multiplication for WASM32.

## Verification evidence

Observed RED before implementation: unsupported dispatch15 in native admission and actualWASM; absent TS schema/codec and Studio controls; worker discovery rejected Dither. GREEN after implementation:

- Full Vitest:849 passed,1 existing skipped (94 files).
- Full native `cargo test --manifest-path rust/Cargo.toml --offline`:157 passed across library/integration suites.
- TypeScript and optimized Next16.4.2 webpack build pass. ESLint has0 errors and3 existing prototype warnings.
- Shared [binary fixtures](../../tests/fixtures/render/styles/dither-wire-v1.json) are byte-identical between Rust/TS. Malformed enums, fields, flags, counts, reserved data and trailing bytes are rejected. Existing family packets remain valid.
- Actual rebuiltWASM reads all15 algorithms, thumbnails and identical complete pixels for work budgets1,7,4096. Native fixtures pin palette ties, custom/original/per-channel modes, alpha/strength/contrast, diffusion impulses/borders, transparent absorption, threshold bias, source identity, crop90/scale2/partial cells, budget and cancellation.
- Production Chromium desktop/mobile, Firefox and WebKit Dither tests pass (8 tests): owned gradient upload, each algorithm/palette/pixel-size/strength edit advances the current Dither revision and changes pixels; undo restores the previous complete frame; custom palettes and chroma controls work; downloaded PNG bytes decode exactly to preview pixels, JPEG bytes decode to correct dimensions/opaque alpha; no horizontal mobile overflow.
- Actual browser module-worker harness reads all15 algorithms with matching captured export/thumbnail/PNG full pixels. Mutation of algorithm and palette settings after export submission does not change captured output. Production UI uses its actual webpack worker artifact; this is not a claim that the production artifact is ESM.
- Broader production shared exports, initial-family, style controls, thumbnail and shell regressions:34 passed,8 deliberate mobile/desktop-only skips (33 passed in the expanded run, then the corrected coarse-phone scenario passed its focused rerun). Updated harness observes actual exported Blob MIME, scrolls lazy catalog tiles/sliders into view, and opens/closes mobile controls sheets using their current labels. Earlier initial-family/thumbnail-only run:17 passed,3 deliberate mobile skips.
- Independent TS spec/quality, native spec/quality and PNG writer spec/quality reviews accepted; the native constructor finding was fixed and re-reviewed.
- Extra Firefox coverage found an existing canvas PNG premultiplication loss: preview[18,34,51,170] became PNGraw[18,35,51,170], then browser readback[18,36,51,170]. PNG export now writes captured straight RGBA directly (RGBA8/filter0, valid zlib stored DEFLATE, Adler32, PNG CRC32) in one bounded output buffer. JPEG retains its browser encoder. Independent Sharp readback is byte-identical to the captured worker frame; browser readback equals the preview in allfour configurations. The existing20B/px reservation and64KiB encoded-overhead limit remain unchanged; newtests verify scanline/block boundaries, hidden/translucent colors and cancellation ownership. Stored DEFLATE intentionally produces larger files than compressed canvas PNG. Encoding is synchronous; cancellation takes effect after that bounded encode loop.

Final WASM SHA256: `579651dce254260250dd944b5bffab8ff755db7efda2b2a4da242597b9d52eec`.

Review screenshots: [desktop](screenshots/studio-dither-desktop.png), [mobile](screenshots/studio-dither-mobile.png).

## Remaining differences

Animation/shimmer stay explicitly unavailable and true flags are rejected, as permitted by the saved initial contract. Direction/speed are typed dormant settings, not active controls. No reference Dither same-input pixel equivalence, reference null-palette semantics, full animation parity or large-image performance acceptance is claimed. Other remaining styles, stacked post effects, text/masks/lighting, video/animation exports, recipes/library and Flow remain separate work.
