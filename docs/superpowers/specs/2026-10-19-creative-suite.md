# Complete creative suite

The user's 2026-10-19 instruction supersedes previous phase limits: implement all roadmap features in a combined release, use Rust for processing speed, then perform integrated checking. Preserve existing manual drawing and image conversion.

## Design and architecture

Continue the existing dark IBM Plex/amber design, 44px touch controls, clear focus, reduced motion, responsive single-column mobile controls, and shared validated cell documents. Add a discoverable creative hub at /create; links lead to /type, /gallery, /animate, /generate, /three and /audio. Every action produces real documents or real exports. All user media remains local. Reuse original templates, no copied gallery content.

Rust compiles to WebAssembly and handles bounded numeric sampling/filtering in the conversion hot path, with deterministic parity tests and a measured benchmark. Browser glue owns decoding and UI. WASM is reproducibly built and shipped locally. Expose failure rather than implying acceleration when unavailable; a compatible JS fallback preserves editing.

Typography uses a bundled licensed FIGlet font with text, alignment, spacing and color controls; gallery searches original templates and saved local creations, with persistent favorites and Studio handoff. Studio adds undoable layer selection/add/delete/duplicate/reorder/visibility/locking/opacity/rename and effects. Drawing targets the selected layer. Animation has a separate versioned bounded project with independent validated documents, durations, playback, onion skin, frame duplication/deletion/reordering, JSON persistence/import/export and selected-frame Studio handoff.

Media animation decodes local video and GIF to bounded frame sequences, provides cancellation/progress, and exports supported GIF/WebM/MP4 with runtime checks. Browser-supported recording may mix user-selected audio. Generative tools expose seeded noise/waves/particles/fractal parameters, deterministic snapshots and animation capture. 3D loads bounded OBJ/GLB meshes without fetching external resources, provides orbit/zoom/lighting and rasterized ASCII snapshots. Smart conversion adds directional edge characters and local enhancement. Audio accepts local files and explicit microphone activation; frequency/volume controls drive real visual response and recording. No optional paid AI service is introduced.

## Safety and acceptance

Reject malformed files before replacing work. Bound media by size, decoded dimensions, duration/frame count and total cells. Cancel processing and release media streams, audio contexts, workers and object URLs on replace/unmount. Preserve old drafts via existing save/handoff. Animated exports check actual supported encoders and MIME; report unsupported formats honestly. Layer opacity and effects must match existing rendering/export semantics. Animation JSON validates every document and duration and has a memory budget.

User requests implementation before checking: write behavior tests alongside implementation, defer all test execution and release checks until the combined feature set is implemented. Final checks: Rust tests/format/lint/build, WASM parity/performance, TypeScript unit/component tests, lint, typecheck, production build and real desktop/mobile browser flows. Record executed results and platform limitations.
