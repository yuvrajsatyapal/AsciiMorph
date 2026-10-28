# Same-input visual comparison — 28 October 2026

This first four-style comparison finds visible differences; **none passes reference visual acceptance**. No renderer change is retained from this investigation. The captured source, local pixels, typed requests and JPEG reference screenshots are reviewable here.

## Canonical evidence

- Source: `tests/fixtures/gradient.png`,128×64 RGBA. The left strip is transparent; its hidden RGB must not be compared directly with an opaque screenshot.
- Reference: `https://www.ascii-magic.com/app`, normal Studio UI,100% zoom. Full screenshots are966×720 JPEGs; DOM-reported output bounds were x566,y354,width128,height64. Each `{style}-reference-full.jpg` is the original screenshot. `{style}-reference-canvas.png` is a crop of that JPEG, **not a lossless reference export**.
- Reference controls are in `{style}-reference-controls.json`. Characters/Pixel/Mosaic use size11,brightness0,contrast20,backdrop blur8/opacity100,layer opacity100,coverage100,Normal blend; Characters Standard ramp, Mosaic Square. Dither uses Floyd/Mono/Standard,size2,strength100,contrast110,threshold50. Mode changes can reset settings; range fills alone did not commit consistently, so keyboard input and displayed values were checked.
- Local `{style}-local.png` stores straight worker RGBA. `{style}-local-settings.json` stores the exact accepted request. The production `/app` Worker renders the same owned source with no crop/rotation at scale1. `tests/e2e/reference-comparison.spec.ts` checks current style/revision/source and baseline settings, compares preview readback through the same browser premultiplication boundary, and verifies every downloaded PNG with independent Sharp decode against captured worker bytes.
- `comparison.png` columns: reference screenshot, local output flattened onto black, absolute RGB difference. Rows: Characters,Pixel,Mosaic,Dither. `metrics.json` records source-file hashes and diagnostic RGB errors. JPEG artifacts, backdrop edge behavior and phase-sensitive dither patterns preclude an automatic pixel-equivalence verdict.

## Findings

| Mode | Comparison result | Remaining diagnosis |
| --- | --- | --- |
| Characters | Visible glyph/tone/backdrop differences; screenshot RGB MAE about19.54/255 | Separate blur edge treatment, glyph placement/rasterization and source/tone sampling. Source/font/platform equivalence is not established by this JPEG capture. |
| Pixel | Local fills sharp gapless rectangles; reference has inset cells and differing per-cell tones | Existing6.6×11 pitch at size11 is consistent with measured reference boundaries. Center versus area sampling, inset rasterization and quantization need independent numerical specification. |
| Mosaic | Local gapless blocks differ from rounded/inset reference tiles and tones | Freeze sparse/base-cell sampling, rounded coverage and wide/tall behavior before correction. |
| Dither | Default Floyd spatial pattern differs materially | Diagnose sampling, chroma, diffusion/phase and strength independently. Strength0 reference remained black/white, while local strength0 bypasses quantization by its explicit independent contract; this is a follow-on semantic discrepancy, not a validated replacement algorithm. |

## Capture failures and rejected hypothesis

Clipped browser screenshots returned black even when the full screenshot showed the canvas. The earlier26October `pixel-reference-canvas.png` is also entirely black. Early `{characters,pixel}-reference.jpg` files in this folder use that failed clip path and are **excluded** from canonical comparison. Full screenshots followed by cropping corrected this capture issue. Unexpected flat supplemental Bayer/transparent-backdrop captures remain inconclusive and must not become render oracles.

A first interpretation of Pixel suggested square cells. This was wrong: repeated boundaries near39.6,72.6,105.6 and `pixel-none-zoom275-full.jpg` show6.6 horizontal pitch. The speculative square-cell implementation and test were reverted, and rebuilt WASM matches the unchanged baseline SHA256 `579651dce254260250dd944b5bffab8ff755db7efda2b2a4da242597b9d52eec`. Do not reuse the rejected implementation report as an accepted renderer change.

`*-none-full.jpg`, `dither-strength-zero-full.jpg`, supplemental Bayer captures, source comparison and the275% Pixel screenshot are exploratory evidence, not canonical baselines. A source-comparison screenshot includes its split handle/labels and is unsuitable for a full-frame source-error metric. Preliminary `*-local.png.json` files came from a time-based exploratory harness and are superseded by the accepted request files.

Reference PNG export did not produce a download before the browser tool timeout. Reference alpha and lossless preview/export equality remain unverified. Post FX and Color panels were inspected later in the session: effects switches were not checked; tint0,saturation100,vibrance0,hue0,gradientNone,grayscale0. Those later observations do not retrospectively prove every hidden setting in earlier captures.

## Reproduction

Run a current production build and the canonical desktop test:

```sh
ASCIIMORPH_E2E_PRODUCTION=1 SAME_INPUT_CAPTURE_DIR=docs/research/ascii-magic/2026-10-28/same-input npx playwright test tests/e2e/reference-comparison.spec.ts --project desktop
node scripts/compare-reference.mjs docs/research/ascii-magic/2026-10-28/same-input
```

The comparison utility intentionally requires the recorded966×720 reference viewport and128×64 local frames. Remeasure and update bounds when recapturing at another viewport/zoom. It rejects flat captures. The script never declares visual parity from an error threshold.

Remaining work stays ordered: resolve concrete existing-style differences; Mixed,Block,Dots,Cross,Diamond,Lines,Diagonal,LEGO,Voxel,Disco; stacked effects/order/undo/export; text/masks/lighting; video/animation including Dither shimmer; recipes/library and Flow.
