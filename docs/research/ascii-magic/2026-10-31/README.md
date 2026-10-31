# Dither evidence checkpoint — not closed

`dither-verified` is the accepted source/settings capture matrix: 56 genuine public PNG exports (28 numerical identities at 1×/2×), pinned Chromium software Canvas and SwiftShader. The manifest binds the synthetic PNG hash, independently checked opaque Original source export/hash, all exposed control values before/after Dither selection, and an independent retained source-alpha check using genuine pixel-size-1 output. Both black and white opaque output must exist. Original at 100% selects the retained Image as Dither input; the strict gate now requests local Original as well. The runtime backend is probed by the test before rendering.

`dither-original` is the earlier nonblank 56-case capture with less complete provenance. It preserves `reference-results-before-correction.json` against the unchanged Characters-era WASM. Its numerical diagnostic used local None versus public Original to isolate raw-source dithering, so this report is NOT an accepted same-settings closure gate. It proves the Strength 0 mismatch: Floyd/pixel2/1× differs22,400 bytes, including128 alpha bytes; actualRGB26 versus reference0 at byte48. Strength0 reference opaque colors contain only black and white.

`dither-software` is a REJECTED blank capture/diagnostic directory. Public Backdrop None changes the sampled effect frame to transparent. These files cannot establish quantization parity. No historical PNG was replaced to manufacture a pass.

Current `dither-verified/reference-results.json`: candidate WASM matches32/56 complete RGBA images, all56 alpha buffers, all56 same-scale preview/export pairs. Passing: Bayer2/4/8/16, LinesH/V/D, every captured Strength0 case including pixel sizes1/2/3/12, and Bayer2 Strength50. Open: four diffusion kernels at Strength50/100, Halftone, Radial, White Noise, Blue Noise. Dither remains open; later styles/workflows have not started.

## Independent sampling evidence

`scripts/generate-dither-sampling-fixtures.mjs` generates both Canvas-source and decoded PNG Image-source oracles without running reference application code. They differ on this backend. The native candidate matches all four complete128×64 Image-source sample buffers, sizes1/2/3/12. An independent reviewer verified mip box reduction, float32 inverse scale, four-bit bilinear fractions and truncation. The old area sampler first failed at pixel-size2 alpha128 versus127. The candidate uses a fixed inline stack, visits one base source pixel per work unit, and allocates no mipmap pyramid. Existing admission accounts for inline metadata via StyleJob size.

An added31×19 partial-alpha Image-source oracle is deliberately RED. Float32 normalization/reciprocal fixes the pixel-size1 unpremultiplication half-boundary (15premul/30alpha becomes127, not128). Pixel-size2 then exposes a separate filter path: four-bit filtering first produces alpha19 while reference is20. Independent continuous bilinear with rounded premultiplied output matches all160alpha samples but leaves7–8RGB errors. The first residual is(x0,y1), premulred17 versus18 at alpha79. Do not guess decoder math: independent reconstruction confirms decoder premultiplication for all1767source RGB bytes. Odd-dimension mip filtering at sizes3/12 still needs investigation.

Reviewer diagnosis scripts: `/tmp/review-dither-image-sampler.mjs`; review agent `/root/dither_evidence_review` (read-only, no repository edits). Sampling metadata includes source hashes, runtime backend, browser and output hashes. Only the source hash/provenance recorded in each directory applies to its fixtures.

## Repeat commands

```sh
node scripts/capture-dither-software-reference.mjs docs/research/ascii-magic/2026-10-31/dither-verified
node scripts/generate-dither-sampling-fixtures.mjs
cargo test --manifest-path rust/Cargo.toml --offline styles::dither --lib
npm run build:wasm
npx playwright test --config playwright.dither-parity.config.ts
```

The native test command currently includes the intentional odd/partial-alpha failure. Do not close Dither, commit unreviewed corrections, weaken the exact gate, or call later stages complete. Real public3×/4× exports remain deferred.
