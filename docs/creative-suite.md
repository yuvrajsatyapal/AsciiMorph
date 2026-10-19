# Creative suite (phases 4–8)

All tools share validated version 1 ASCII documents, the existing Canvas/SVG/HTML rendering contract and the draft-preserving Studio handoff. The interface remains React/Next.js; numeric image sampling and Sobel gradients execute in a local Rust WebAssembly module inside the conversion worker.

## Tools

- `/create`: the entry point for all tools.
- `/type`: original CC0 Morph Grid FIGlet font, printable ASCII, multiline alignment, spacing, colors, preview, copy and six static exports. Lowercase renders as capitals; kerning/smushing is disabled. Font source and license ship in `public/fonts/figlet/`.
- `/gallery`: ten original templates, text/tag/category search, persistent favorites, and saved IndexedDB Studio projects. Open a copy in Studio without replacing the previous draft.
- `/studio`: up to eight independently selected layers, add/duplicate/delete/rename/reorder, visibility, locking, opacity and invert/grayscale/fade effects. Operations participate in existing document undo/redo. Imported v1 documents without an active layer still target their base layer.
- `/animate`: timed frames, playback, previous/next onion skin, blank/current-Studio/duplicate frames, reordering/deletion, validated JSON import/export, saved-animation picker and optional soundtrack. Editing a selected frame in Studio provides an explicit Update animation frame action. A stale timeline is rejected rather than overwritten.
- `/generate`: seeded noise, waves, particles and Julia fractals with scale/speed/color/time controls, manually started playback, static export and editable/encoded motion sequences.
- `/three`: local OBJ polygons or GLB 2.0 embedded triangle meshes, scene transforms, normalization, CPU triangle rasterization with z-buffer and Lambert lighting, drag/slider orbit, zoom, tilt, light and color. Still and turntable exports feed Studio and animation. No textures, skins, material rendering or external buffers are fetched.
- `/convert`: existing enhancement controls plus smart directional edge glyphs. Processing status reports Rust/WASM or JavaScript fallback explicitly.
- `/audio`: local audio or explicit microphone opt-in; real FFT bands, RMS volume and waveform feed bars/rings/wave modes. Gain, smoothing, sensitivity and color controls; capture stills or record WebM/MP4 with optional source audio. Audio starts paused, reduced motion needs an explicit live-motion opt-in, and stopping releases the source.

## Media and encoding

Video decoding uses the browser's local decoder, bounded seeking, native frame capture and the Rust-backed conversion worker. Headerless browser-recorded WebM duration is discovered with a bounded seek. GIF87a/89a decoding handles LZW, palettes, interlacing, transparency and disposal. GIF delays are preserved; video is sampled at the selected rate. Import keeps the existing animation until conversion and saving succeed.

GIF export uses a bundled literal-LZW GIF89a encoder with a fixed RGB332 palette, per-frame delays and infinite looping. GIF timing is quantized to 10 ms, output is opaque over the workspace background, and color is quantized to 256 colors. Animated export fits within 640 px per side; GIF automatically scales to a 24 megapixel aggregate budget before allocating frame pixels and writes bounded typed buffers.

WebM and MP4 recording use native MediaRecorder after runtime codec detection. These exports run in real time and can include a separately selected local soundtrack; GIF cannot contain audio. Original video audio is not implicitly copied. Short frame durations may be sampled/merged by the browser recorder (30 fps). Encoding quality, MP4 availability and background-tab scheduling depend on the browser. Cancellation stops streams and recording, closes audio contexts and revokes object URLs; preparation also times out.

## Resource limits

| Input | Limit |
|---|---|
| Static image | Existing 12 MiB, 24 MP, 8192 px per side; bounded decode |
| Video/GIF import | 40 MiB, 12 seconds, 120 resulting frames; video 1–20 fps |
| GIF decode | 2048 px per side, 2 MP per frame, 24 MP total, 120 source frames |
| Animation project | 120 frames, 20–10,000 ms each, 120 seconds, 1,000,000 total layer cells, 80 MB JSON |
| Animation archive | Eight most recent projects within 80 million serialized characters; older projects expire automatically |
| OBJ/GLB | OBJ 12 MiB/200,000 lines/16,000 characters per line; GLB 20 MiB; 50,000 vertices and triangles |
| Mesh raster work | 1,000,000 projected triangle pixel tests per frame; excessive views report a simplify/zoom-out error |
| Audio | 50 MiB, ten minutes; live recording 1–30 seconds |
| Soundtrack | 40 MiB; only WebM/MP4 |

## Rust engine

`rust/` has no external crate dependencies. `npm run build:wasm` compiles release-mode `wasm32-unknown-unknown` and copies the module to `public/wasm/asciimorph_engine.wasm`. A small typed bridge validates dimensions before allocation, copies results out of linear memory and frees both allocations. Rust uses f64 arithmetic for alpha-weighted area integration and Sobel gradients to match the existing JavaScript pipeline. UI, font calibration, tone mapping, character selection, dithering, media decoding and document creation remain TypeScript/browser code.

The checked-in module allows ordinary npm setup without a Rust toolchain. When changing Rust source, rebuild it and run native tests, Clippy and JS/WASM parity tests. If WASM fails to load, conversion uses the compatible JS path and reports the fallback. The benchmark includes allocations and copies and measures one workload, not whole-application speed.

See `verification/creative-suite.md` for executed checks and remaining platform limits.
