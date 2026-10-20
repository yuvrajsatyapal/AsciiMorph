# Conversion, layers and mobile canvas upgrade

Implemented Task 3 of the workspace upgrade in the existing conversion/editor pipeline.

## Working behavior

- Image conversion crops normalized source coordinates and rotates pixels clockwise by 0/90/180/270 degrees before sampling. Aspect-corrected output dimensions reflect the transformed source without allocating a preview pixel buffer.
- Four named visual presets change the real tone/detail/character/color settings. Optional shape matching compares 3×3 source samples against measured glyph raster signatures, alongside coverage. Existing directional contour handling remains available.
- Converted artwork retains the original decoded pixel source and conversion settings. RGBA bytes use base64 to avoid large JavaScript number arrays; validators check source dimensions, byte length, settings, masks, groups, blend modes and effects. Version 1 files without metadata remain supported.
- Studio offers “Revise original conversion”, saves the pending draft first, and reopens the retained source/settings in conversion. Editing the revision creates a separate artwork through the existing handoff instead of replacing the saved original.
- Conversion settings persist across route changes and reloads under the workspace preference prefix; the library backup includes this key. Settings-storage failure appears as a visible conversion error.
- Layers support flat groups with visibility/opacity, multiply/screen/overlay blending, cell masks from the current selection, mask inversion/removal, reusable invert/grayscale/fade adjustments, layer thumbnails, and downward merge. Existing direct effects remain available under “Apply to cells”.
- Raster preview/export and SVG/HTML export resolve the same masks, effects, group visibility/opacity and blend settings. Mask arrays resize/crop with the document, and duplicated layers copy their masks/effects.
- Studio supports two-finger pinch zoom and pan. Starting a two-finger gesture cancels the provisional drawing stroke; lifting fingers does not commit it. One finger continues to use the selected editing tool.

## Verification

- New compositing/source tests first failed (3 failures), then passed after implementation.
- New resize-mask regression first failed with “mask dimensions mismatch”, then passed after resizing masks alongside cells.
- `npx vitest run src/core src/converter src/components/converter src/components/editor`: 82 passed before adding one further retained-source revision regression; the revision file then passed all 4 tests.
- Additional tests prove crop/rotation order, shape matching for glyphs with equal coverage, source roundtrip, malformed metadata rejection, masked non-destructive effects, group visibility, merge behavior, and pinch gesture cancellation.
- `npx tsc --noEmit`: passed at task handoff.
- Targeted ESLint across all changed core/conversion/layer/canvas files passed.
- Added `tests/e2e/conversion-layers.spec.ts` for actual image transform/export metadata, Studio layer controls, and reopening retained settings. Root integration runs the browser matrix; this task does not claim a browser execution or physical-device test.

## Limits and explicit behavior

- The retained image is the decoded conversion source, capped by the existing decoder at 1600 pixels per side; the original full-resolution encoded image/EXIF is not preserved.
- ASCII cells hold one grapheme. Merge bakes adjustments and keeps the upper nonblank glyph at overlap; it cannot preserve two partially overlapping glyph shapes exactly. This limitation is stated next to the action; layered exports preserve the layered rendering.
- Groups are flat and apply opacity per member rather than creating an isolated compositing surface. Masks are cell coverage values, with selection/invert/remove UI; there is no freehand pixel-mask editor or nesting UI.
- Shape matching uses the bundled artwork font's measured raster. Custom ramps and Braille keep their existing algorithms; the shape toggle is disabled for those character modes.
- Pinch/pan unit behavior is verified. Real phones, native browser gesture edge cases and color-managed output still require physical-device QA.
