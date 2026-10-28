# Same-input visual parity corrections

User direction: finish Characters, Pixel, Mosaic and Dither comparisons and fix concrete differences before expanding the remaining core styles, stacked effects, text/masks/lighting, animation exports, recipes/library and Flow, in that order. Existing rebuild scope and resource limits remain authoritative.

## Evidence and method

Owned input tests/fixtures/gradient.png, 128×64 RGBA, includes a transparent left strip. Retain source alpha. Use current accepted worker requests/results, not time-based waiting or hover canvases; save typed settings alongside outputs. Assert PNG raw bytes equal captured worker RGBA. Browser canvas readback can differ through premultiplication and must be compared after the same browser boundary. Compare browser screenshots against local output composited onto the same background, never straight RGBA against a screenshot.

2026-10-28 reference captures are in docs/research/ascii-magic/2026-10-28/same-input. Browser clipped screenshots returned black even while full screenshots showed a rendered image. Use full screenshots and crop x566,y354,width128,height64 only while DOM bounds remain those values. JPEG evidence is lossy and supports geometric/visual findings, not exact alpha equality. Explicit controls: size11, brightness0, contrast20, Normal blend, coverage100, layer/backdrop opacity100, blur8; Mosaic Square. Dither: Floyd/Mono/Standard/size2/strength100/contrast110/threshold50. Every switch may restore mode defaults: reapply and verify settings.

## Rejected Pixel square-cell hypothesis

An initial interpretation of pixel-none-full.jpg suggested square cells. This was disproven by the repeated dark boundaries near x39.6,72.6,105.6 and the magnified pixel-none-zoom275-full.jpg capture (canvas bounds x454,y298,352×176 at275%). The horizontal pitch remains0.6×11=6.6; the original contract was correct. The speculative implementation and its tests were fully reverted. Rebuilt WASM matches the original SHA256579651dce254260250dd944b5bffab8ff755db7efda2b2a4da242597b9d52eec. No renderer correction is accepted from that hypothesis.

## Capture verification task

Save a reproducible canonical capture with exact source/style/current-result identity, asserted complete baseline settings, and downloaded1×PNG equal to straight worker RGBA for allfour modes. Compare canvas bytes after browser premultiplication. Generate a labeled reference/local/difference plate with local alpha flattened onto black. Reject flat reference captures and unexpected frame/viewport dimensions. Record qualitative differences without changing frozen numerical profiles on visual inference alone. Independent review required for the capture harness and comparison utility.

## Subsequent tasks

1. Complete broader aligned four-style acceptance; isolate source/composition, glyph and dithering differences before further changes. Dither strength0 reference still quantizes to palette whereas local strength0 bypasses quantization: capture and specify strength behavior before correction. Do not infer diffusion formulas from one screenshot.
2. Remaining core styles in requested order: Mixed, Block Characters, Dots, Cross, Diamond, Lines, Diagonal, LEGO, Voxel, Disco, using existing family gates and TDD.
3. Stacked post effects: ordering, history, captured export.
4. Text, masks and lighting.
5. Video/animation export, including Dither animation/shimmer.
6. Recipes/library and Flow.

No commit, push, branch or worktree action is required. Full parity remains open until the relevant comparisons pass.
