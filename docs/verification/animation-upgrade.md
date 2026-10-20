# Animation editing and export verification — 2026-10-19

Implemented by animation worker; persistence changes belong to the root worker.

## Delivered behavior

- Immutable multi-frame duplicate/delete/reorder operations and bounded 40-entry undo/redo restore active frame and selection. Deleting all frames retains one. New/open/import clears history across project IDs. JSON imports receive a fresh ID.
- Shift range selection, Ctrl/Command toggles, explicit range inputs, select all, drag ordering including drop-at-end, keyboard arrows/Home/End/Delete and undo/redo shortcuts. Repeated Shift-arrow extends from a stable anchor.
- Direct drawing/erasing on the active visible, unlocked layer with pointer capture, interpolated strokes, one history entry per stroke, and touch drawing. Frame text remains accessible. Frame/export controls collapse.
- Animation navigation registers the shared async save guard; failure blocks global navigation and remains visible. Obsolete eight-project expiry messaging removed. Workspace settings persist through the shared preferences hook.
- Shared export controls for longest side, frame-rate cap, quality, GIF loop, and maximum file size. Controls are connected in both animation and creative MotionActions.
- Adaptive per-frame GIF palettes preserve exact artwork colors within palette capacity; weighted median cut handles larger color sets. Dictionary LZW replaces literal encoding. Main browser exports run GIF palette/encoding in a cancellable worker. GIF frame-rate sampling preserves overall timing; centisecond rounding is distributed to prevent drift.
- Silent WebM uses WebCodecs VP8 with deterministic timestamps, bounded encoding queues, a real WebM container, and exact total duration. Legacy/audio/MP4 paths retain MediaRecorder with selectable frame rate/bitrate and explicit realtime limitations. Trimmed original audio supports audioOffset and waits for metadata/seek.

## Tests

Regression tests were written and observed failing before implementation: missing editing helpers; old GIF size 5,473 bytes for a solid 64×64 frame; color loss; ignored loop/budget options; missing muxer/timeline; Shift-arrow lost the anchor; frame-rate resampling missing; repeated 1/12-second GIF delays accumulated to 960ms instead of 1000ms. All are now passing.

Latest focused command:
`npm test -- src/animation src/components/animation src/creative/gif.test.ts src/creative/recording.test.ts src/creative/recording-webm.test.ts`

Result: 8 files / 33 tests passed. Coverage includes all GIF palette bit widths and dictionary resets on noisy indexed images; independent duplicate documents; selection/history; visible save failures and navigation rejection; duration-preserving sampling; container headers and timeline boundaries.

`npx tsc --noEmit` passed. ESLint on owned sources passed before the final pure GIF timing fix (same formatting and types).

## Actual Chromium workflow measurements

A temporary production server on localhost:3108 and a fresh headless Chromium context were used. The owned server has been stopped. Initial sandbox browser launch was denied by macOS Mach port sandboxing; execution with approved sandbox escalation succeeded.

- Exported two blank frames totaling 300ms: actual WebM decoded in Chromium at 360×360, reported duration **0.3 seconds**, and WebCodecs was available. File **772 bytes**; repeated full export/download/decode workflow **50–137ms**.
- Direct preview drawing produced `@` in accessible frame text; undo remained available. Preview was scrolled into view before clicking (initial off-viewport coordinate was corrected).
- Default generator workflow → animated GIF worker export → download → native browser image decode: **1,611,420 bytes**, **640×640**, repeated workflow **1.36–1.58 seconds**. This measures complete export/decode workflow; it is not a Rust speed claim or a controlled before/after benchmark.

Standalone browser verification script remains at `/tmp/asciimorph-animation-qa.cjs`. It targets localhost3108. Browser verification used the prior production build; latest timing drift fixes were verified by unit tests and require the root's final rebuild.

## Remaining limits

- Deterministic offline encoding currently covers silent WebM only. MP4 and exports with audio record in real time; they require supported browser codecs and an active tab. Unsupported encoders fail explicitly.
- GIF has a 256-color ceiling, 10ms delay granularity, 20ms minimum frame duration, 120-frame/24-megapixel export budgets and no audio. Frame-rate settings cap sample rate; unchanged holds coalesce. Resolution is capped by source size and aggregate budgets.
- File-size budgets reject oversized output; they do not automatically search settings to meet a target size.
- Artwork painting and WebCodecs submission remain on the main thread; GIF encoding is off-thread. Complex GPU/encoder and physical mobile/audio permission behavior requires device testing.
