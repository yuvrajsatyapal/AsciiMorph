# Phase 3 — Local image conversion

The user supplied the feature specification and authorized planning and execution.
Only Phase 3 is in scope. Preserve the manual editor and version 1 document.

## Workspace design

Use the existing charcoal surfaces, amber accent, IBM Plex fonts, borders,
buttons and Radix dialog conventions. `/convert` has a compact header, a broad
preview area and a 288px settings column. Below 900px settings follow the preview;
at 375px actions wrap and each comparison pane remains inside its scroll region.
Upload has empty, decoding, ready and error states. Results have processing,
ready and failure states. Disable exports and handoff when settings are stale.
Preview offers original, ASCII, side by side and a clipped before/after overlay.
A shared zoom/pan viewport keeps the overlay aligned. Native fullscreen has an
explicit unsupported error. All controls have labels and keyboard access.

## Architecture and decisions

- Pure bounded RGBA-to-cell engine in `src/converter/engine.ts`; reusable preset
  registry with ordered density ramps and browser font coverage calibration.
- Braille uses real 2x4 subpixel dot masks, not ordinary character substitution.
  Other Unicode ramps are best-effort system fallback glyphs; terminal alignment
  and portable Unicode font embedding are not guaranteed.
- Decode PNG/JPEG/WebP/BMP locally with header dimension preflight before native
  decoding. Other formats explicitly deferred: broad decoder acceptance would
  undermine pre-decode resource bounds. Default limit 12MiB, 24 megapixels,
  8192px per side; configurable downward/upward within hard safe ceilings.
- Browser orientation via createImageBitmap(imageOrientation: from-image),
  bounded working image, area sampling. Output max 300 per axis / 60,000 cells.
  Cell metrics participate in aspect ratio, renderer and export consistently.
- Brightness, contrast, gamma, saturation, invert, unsharp filter, Sobel edges,
  Floyd–Steinberg dithering and density exponent are deterministic. Transparent
  regions retain alpha. Color modes preserve foreground and selected background.
- A dedicated worker per conversion is terminated on replacement, settings
  changes, cancellation and unmount. Debounce 180ms; stale callbacks are ignored.
  Unsupported workers use cooperative row-yield processing on the main thread.
- Reuse shared paint/exportDocument. No backend, network upload or dependency.
- Handoff snapshots current workspace, serializes saves, persists old and new
  projects, then opens the new ID. Never navigate after a failed save. Editor
  link to converter flushes current changes before unmount, including debounce.

## Verification

Baseline and final lint/typecheck/unit/build/browser runs recorded separately.
Tests first for processing math, limits, transparent pixels, specialized mapping,
cancellation, serialization and safe handoff. Real raster fixture browser tests
exercise worker processing, settings, exports, editable handoff/history/reload,
draft preservation, responsive layout and console errors. Independent review
focuses on memory, lifecycle, export fidelity and data loss.

## Design Gate resolutions

- Native labeled comparison range announces percentage. Focusable viewport uses
  arrow keys to pan, +/- to zoom and 0 to fit. Show a collapsible text alternative.
- Preview is 480px tall desktop, 360px tablet and 300px mobile, with min-width:0
  and contained overflow. Mobile actions/inputs have at least 44px touch targets.
  Handoff/export remain above settings. No motion is needed.
- Handoff has a busy lock; failed saves retain the result, display a persistent
  alert and allow Retry through the same action. Download current draft remains
  available on failure, independently of storage. No navigation on failed saves.
- Group controls into Grid, Characters, Tone/detail and Color. Width/height 1–300
  default 80/40; aspect lock derives actual height. Cell width 7–16 default 9,
  line height 14–28 default 18. Density 0.25–3 default 1. Brightness/contrast
  -100–100 default 0, gamma 0.1–3 default 1, saturation 0–200 default 100,
  sharpness/edge 0–100 default 0. Invert/dithering default off. Color defaults
  amber on transparent, monochrome. Custom input 2–256 printable graphemes,
  deduplicated, ordered sparse to dense. Disable custom input outside Custom.
  Color picker explains sampled foreground in full-color/grayscale modes.
- Status is aria-live polite; errors use role=alert. Exports await font readiness,
  expose busy state and report actual failures. Aspect-locked height is disabled
  and actual derived dimensions are displayed alongside the preview.
