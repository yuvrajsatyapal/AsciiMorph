# Upgrade coverage and practical limits

| Request | Delivered |
| --- | --- |
|1 Unified workspace|Persistent tool navigation, active-tool marker, guarded save-before-switch, shared settings persistence and command search. Existing tool-specific previews/export controls remain.|
|2 Project management|Combined artwork/animation library, character thumbnails, rename/duplicate/explicit delete, folders, tags, pins. No animation expiry.|
|3 Recovery/backups|Storage estimate/persistence request, weekly backup reminder, whole-library JSON export/import with freshIDs and recovery snapshots, visible save failures.|
|4 Animation editor|Undo/redo, range/multiple selection, drag ordering, keyboard navigation, direct drawing/erasing and onion skin.|
|5 Animated exports|Adaptive GIF palettes and dictionary compression in worker, size/resolution/FPS/quality/loop controls, deterministic silentWebM.|
|6 Image conversion|Crop/rotate, named visual presets, calibrated glyph-shape signatures and directional edge choices.|
|7 Non-destructive conversion|Retained decoded source/settings serialized with artwork and reopened for revised variants.|
|8 Layers|Merge, flat groups, selection masks, blend modes, reusable effects and layer thumbnails.|
|9 Processing|Mesh/GIF workers, cancellation and bounded history, complete export/decode and CPU workflow measurements. No new Rust speed claims.|
|10 Video|Source preview, trim, output dimensions, character/color presets, optional source-audioWebM, up to60seconds within frame/cell budgets.|
|11 Mobile|Compact navigation, scrolling dialogs, larger targets, collapsible editor/animation controls, pinch/pan canvas gestures.|
|12 Typography|Three originalCC0 FIGlet alphabets, previews, kerning/line spacing, outlines/gradients and placement into saved artwork.|
|13 3D|Camera presets, light direction, perspective, material color override, wireframe and off-thread rasterization.|
|14 Audio|Frequency selection, transient-energy beat accents, presets, source seeking and timestamped visualization cues.|
|15 Generators|Mode parameters, saved presets, exact-period loops, scale animation, two-generator composition/mix.|
|16 Gallery|Tags/collections, larger artwork preview and reusable custom templates preserving layers/colors.|
|17 Discovery|Three-step first-use tour, sampleOrbit project, contextual control titles and searchable commands withCtrl/CommandK.|
|18 Compatibility|Chromium/mobile/Firefox/WebKit suite, storage-failure and large-output regressions. Physical phones and real microphone permission/hardware tests remain external checks.|

## Explicit limits

- Local browser data still needs external backups. Single JSON backup limit240MB and2000projects; larger libraries must export individual projects. Cross-database restore can leave successful new copies on quota failure while preserving originals and reporting progress. Current tool settings take precedence during import; saved template/preset collections merge.
- Conversion retains the decoded source up to1600pixels, not the original compressed camera file. Revisions cannot recover pixels discarded at import.
- Groups are flat with per-member opacity. Masks operate at character cells. Merge uses one upper nonblank glyph per cell and rejects non-Normal input blend modes; this is not a pixel-perfect raster flatten.
- History has a conservative estimated24MB budget and40steps; large projects retain fewer steps and may exceed the history budget for a single snapshot.
- Deterministic offline export covers silentWebM. MP4 and audio video use realtime recording with browser codec/active-tab constraints. File-size budgets reject oversized files rather than finding optimal settings automatically. GIF retains256color/10ms limits and no audio.
- Audio accents detect rising energy, not musical tempo. New FIGlet fonts are original variants;3D color is a manual override, and existing mesh/texture/skin/external-resource limits remain.
- Performance measurements describe this host and specific workflows, not universal latency targets or a new Rust benchmark. Main-thread painting/encoder submission still has costs.
