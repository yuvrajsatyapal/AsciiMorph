# Dither Studio controls and integration plan

Extends the approved 2026-10-27 Dither contract inside the existing Studio dock. Reuse current typography, control spacing, mobile drawer and history transactions; no new screen or design tokens.

Composition remains the shared backdrop/coverage/blend section. Dither section: algorithm (15), palette (14 named + Source RGB332 + custom), chroma, pixel size, strength, contrast, threshold and angle. Custom palette appears only with custom selection: comma/space separated opaque hex input, ordered 2–64 colors, valid edits commit as one undo transaction; invalid drafts stay local with accessible error. Show the per-channel combination caveat, local RGB332 description and explicit animation/shimmer unavailability. Dither tone controls use distinct project keys to avoid the Characters contrast domain. Color rail exposes the same applicable Dither palette/chroma/contrast controls.

Execution: tests before typed codec/schema; controls/binder tests before dock integration; native implementation with numerical tests; rebuild real WASM; readback all algorithms before schema binding; verify production-worker preview/export/thumbnail, captured export, whole-look undo, mobile controls; independent spec and quality review; full Rust/TS/lint/build checks.

## Verified-export correction

Cross-browser validation found Firefox canvas PNG encoding changes translucent straight RGB: preview[18,34,51,170], file independently decoded[18,35,51,170], browser redecoded[18,36,51,170]. Implement a deterministic PNG writer from captured straight RGBA, with checked bounds, PNG chunk CRC and valid zlib stream, without new dependencies or a higher session budget. Preserve captured alpha and native colors, use existing blob/signature/download/cancellation/resource lifecycle. Keep JPEG browser encoding. RED/GREEN unit tests independently decode with Sharp across zlib block boundaries and malformed bounds; repeat production Firefox PNG/preview equality and Chromium/WebKit/mobile integration.
