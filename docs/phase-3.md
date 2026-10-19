# Phase 3 — Image-to-ASCII conversion

Open `/convert` from the homepage or the Studio's Convert image action.
Browse or drop one PNG, JPEG, WebP or BMP, adjust settings, then export or
choose **Edit in Studio**. Nothing uploads an image to the server.

## Architecture

`image.ts` validates file size and magic-byte headers before invoking a native
image decoder. Native EXIF orientation is applied before bounded sampling.
The decoded image becomes an RGBA working buffer of at most 1600px per side.
`use-converter.ts` owns source/result lifetimes, URLs and a 180ms debounce.
`runner.ts` starts a dedicated module Web Worker for each conversion, transfers
a copied pixel buffer, and terminates the worker on completion, failure,
settings changes, cancellation or unmount. Stale callbacks cannot publish a
result. Where workers cannot be created, the same pure engine yields every
eight rows so events and cancellation can run.

`engine.ts` returns the existing version 1 AsciiDocument. Conversion uses the
same Canvas `paint` and `exportDocument` as the manual editor; no separate art
format, rendering system, dependency, backend or account was introduced.

## Algorithms

1. Area-average RGBA samples over source rectangles. RGB is alpha-weighted;
   alpha is area-weighted. Transparent pixels do not inject dark fringe colors.
2. Grid rows = round(columns × imageHeight / imageWidth × cellWidth / cellHeight).
   Oversized rows scale columns down; area is bounded to 60,000 cells. With aspect
   unlocked, requested dimensions are used subject to the same area cap.
3. Rec.709 weighted sRGB luma (`.2126 R + .7152 G + .0722 B`). Saturation mixes
   channels around luma; brightness adds a signed offset; contrast scales around
   mid-gray; gamma applies exponent `1/gamma`. Values are clamped to 0–255.
4. Optional inversion; a clamped 3×3 unsharp filter and blended Sobel gradient
   magnitude shape glyph detail. Character density applies a separate exponent.
5. Preset glyphs are rasterized with the loaded artwork font (and system fallback
   for Unicode), sorted by actual covered alpha area, and matched by normalized
   coverage. Custom sets retain the user's sparse-to-dense order. The mapping is
   deterministic for the supplied pixels/settings/coverage; system fonts can
   change Unicode calibration between platforms.
6. Optional Floyd–Steinberg error diffusion operates in density-adjusted luma
   space with weights 7/16, 3/16, 5/16, 1/16. It skips fully transparent samples.
7. Monochrome uses the selected foreground; grayscale stores sampled gray;
   full color stores sampled RGB. Selected cell backgrounds and source alpha are
   retained. Spacing/line height are document cell metrics used by all exporters.

### Character sets

Classic ASCII, Detailed ASCII, Minimal ASCII, Blocks, Binary, Numbers,
Geometric, Stars, Matrix and Braille are registry entries in `presets.ts`.
Custom sets accept 2–256 printable graphemes, deduplicate characters, reject
control characters and obey the shared 64 UTF-16-unit per-cell bound.

Braille is specialized: each character samples a real 2×4 subgrid and forms
Unicode dot bits `[1,4; 2,5; 3,6; 7,8]`. Tone/detail/dithering act on that subgrid.
The shared model has one foreground/alpha per cell, so eight samples share
alpha-weighted average color and average alpha. Independent colors per dot
cannot be represented by version 1.

## Studio handoff and data safety

Studio's Convert image action explicitly saves its current draft before route
navigation, so unmount cannot discard a pending debounce. Handoff uses an
ordered save queue, re-saves the active draft, checks it did not change during
saving, gives the conversion a fresh UUID/timestamps, validates and saves the
new project, then opens it through the existing Zustand workspace.

Existing IndexedDB read/write transactions preserve save ordering. Neither the
old project nor its recovery snapshots are replaced. A failed save leaves the
current workspace and conversion intact, displays the real error, and allows
retry or an independent JSON download of the current Studio draft. Handoff and
export use a busy lock. The imported grid uses the normal tools, selection,
recoloring, bounded history, autosave, recovery and export pipeline.

## Formats and preview

- Input: PNG, JPEG (including native EXIF orientation), WebP (VP8/VP8L/VP8X,
  excluding animation), BMP with Windows DIB headers supported by the browser.
- Decode errors remain errors; extensions/MIME labels do not bypass signatures.
- Other formats (including GIF, AVIF, SVG, HEIC) are explicitly deferred because
  they do not yet have safe pre-decode dimension validation here.
- Output: TXT, PNG, SVG, WebP, HTML and `.asciimorph.json`, using existing exports.
  TXT intentionally discards styles. JSON preserves all supported cell data.
- Preview: original, ASCII, side by side, opposing clipped before/after views,
  zoom/pan, fit, fullscreen with an explicit unsupported error, and ASCII text.
  Arrow keys pan; +/− zoom; 0 fits. Settings automatically update the result.
- Converter preview renders at ratio 1, matching raster export pixels. Studio
  caps display pixel density to bounded backing sizes without altering logical
  cell geometry. Export excludes editing guides and selection overlays.

## Boundaries and compatibility

Default/hard upload ceilings are 12 MiB, 24 million decoded pixels, 8192px per
side. `ImageLimits` can lower size/area/side limits through `decodeImage` and the
upload hook. Invalid limits are rejected before reading bytes; the ceilings
cannot be raised by a caller. Output is at most 300 cells per side and 60,000
cells overall. Braille uses at most 480,000 subpixel samples. The working buffer
is at most 1600×1600×4 bytes. Existing raster/backing budgets remain 32 million
pixels and 16,384px per side. Large files/documents still consume substantial
native decoder, Canvas and export memory; no universal device-memory guarantee
or heap profiling is claimed. Resource caps are deterministic, not adaptive RAM
estimates.

Verified browser runtime is Chromium on desktop and an emulated touch/mobile
viewport, plus 375px and 768px layout checks. Real iOS Safari, Firefox and physical
mobile devices have not been executed. Feature fallback paths are covered by
unit tests; native format/fullscreen support varies by browser. Native decoding
cannot be interrupted halfway through, but cancelled results are discarded and
bitmap resources close when decoding finishes.

IBM Plex Mono ships locally for ASCII. Braille, Matrix and symbol characters may
use a system fallback font, so Unicode appearance and SVG/HTML portability vary.
The embedded export font covers Latin; additional Unicode fonts are deferred.
Static image conversion only; no animation, video, GIF, 3D, audio or AI features.

## Files added or changed

- Added `src/converter/{engine,settings,presets,image,runner,worker,handoff,use-converter}.ts`
  and engine/image/runner/handoff/hook tests.
- Added `src/components/converter/{converter,preview,settings}.tsx`, scoped
  `converter.css`, settings component test, and `src/app/convert/page.tsx`.
- Updated `src/components/home.tsx` with the converter entry; updated
  `src/components/editor/{editor,canvas}.tsx`, `editor.css`, and editor tests
  for saved navigation and bounded high-DPR rendering.
- Updated `src/core/render.ts` and renderer tests for bounded preview DPR.
- Added `tests/e2e/converter.spec.ts` and generated local PNG/BMP fixtures.
- Updated `playwright.config.ts` to isolate the application under test and offer
  production-server verification through `ASCIIMORPH_E2E_PRODUCTION=1`.
- Added Phase 3 design, implementation plan, architecture and verification docs;
  updated README. Next-generated TypeScript metadata remains generated output.

See [verification/phase-3.md](verification/phase-3.md) for actual executed results.
Phase 4 can build on the unchanged shared document and editor interfaces; it
has not been started. Its licensed typography/templates/gallery scope remains
separate, including any decision to expand bundled Unicode font coverage.
