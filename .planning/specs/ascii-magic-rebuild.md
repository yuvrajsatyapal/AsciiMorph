# AsciiMorph reference-parity rebuild

**Created:** 2026-10-20  
**Status:** Approved by user on 2026-10-20 — design/implementation plan preparation; production rebuild not started  
**Author:** team  
**Epic:** ascii-magic-rebuild

## Problem and user direction

AsciiMorph's conversion quality, responsiveness, and fragmented tool UI do not meet the user's reference: https://www.ascii-magic.com/. The user explicitly requests all features, a complete rebuild, the same interface appearance and interactions, and a powerful Rust engine. Follow-up clarification: “I want the UI, everything, everything to be exact same.” This supersedes earlier design decisions to retain the existing amber interface. AsciiMorph branding is the proposed identity; the user requested reference fidelity, not a new visual direction.

## Outcome

Rebuild the application as an image/video effects studio with close visual and behavioral parity to the reference's Studio and Flow workspaces, all verified feature families implemented, and a Rust-owned rendering pipeline compiled to WASM. Preserve existing character documents and their editing/export workflows through a compatibility route. Match output quality through algorithm and visual testing; language choice alone is not a quality criterion.

The entire project is in scope. Milestones below are delivery order, not permission to omit later features. No milestone is called full parity until its inventory and acceptance rows pass. Unknown reference behavior must remain marked unknown until observed or independently specified.

## Evidence and boundaries

See [investigation](../../docs/research/ascii-magic/2026-10-20/findings.md), asset-manifest.json, screenshots, and REA output in the same folder. Evidence comprises first-party documentation, actual signed-out UI inspection, public shipped JavaScript, and a read-only local source audit. No private source, signed-in/pro-only execution, AI generation, payment, reference video encoding, or comparative photographic benchmark was exercised. Public documentation contains contradictory export-tier claims and inconsistent mode totals; actual visible UI takes precedence for captured controls. No exact internal algorithm equivalence is claimed.

## User stories

- As a visual creator, I can drop an image, browse live style thumbnails, tune its look, compare against the source, and export a high-resolution result.
- As a video creator, I can apply the same look to a clip or animated still, preview motion, and export a real GIF or video with predictable timing.
- As a creator, I can reproduce a look using a recipe and reopen my saved sources/renders without losing work.
- As an advanced user, I can construct a Flow graph using the same pipeline as Studio.
- As an existing AsciiMorph user, I can reopen and edit saved character documents after the studio rebuild.
- As an AI user or agent, I can request generative restyling or use MCP once provider/account infrastructure is configured.

## Must-have: interface and interaction parity

### Studio shell

Dark neutral canvas workspace, near-black panels, thin low-contrast dividers, white foreground, restrained gray labels, compact sans-serif UI, small monospaced uppercase section labels, square controls and thumbnail cards. Replace the current amber art direction in the new studio. Font family, exact spacing, tokens, and responsive breakpoints must be measured during the design pass rather than guessed from this description.

Layout: fixed top toolbar; left resizable style catalog; large central preview; contextual properties dock on the right with vertical category icons; floating bottom action strip. Match reference control order, panel proportions, typography, states, hover behavior, menus, dialogs, empty/source-loaded states, and interaction details. Match desktop at 1440×900 and 1920×1080; separately capture reference at 390×844 and 768×1024 before approving mobile parity. The current 505px side-panel capture overflows and cannot establish intended mobile layout. Do not turn observed clipping into a new product requirement.

Top toolbar: AsciiMorph identity, Studio/Flow switch, zoom out/reset/in, crop/rotate, before/after compare, contextual on-canvas guide toggle, add text, undo/redo, recipes, account and help/menu states. Zoom changes view only, never export dimensions. Undo covers style and parameter edits; text-entry keyboard undo remains native.

Catalog: Realtime/Generative tabs; name/tag search; Explore/Favorites/Recipes tabs; grouped thumbnail cards; suggested looks based on the current source; live thumbnail previews of that source; favorite toggle and persistence; resize/collapse/restore to miniature thumbnail rail. Thumbnails update progressively without starving preview rendering. Suggested ranking is an independent implementation decision until the reference ranking is established.

Right dock: only controls relevant to the selected style, organized into Characters/Style, Depth, Animation, Lights, Color, Post FX, and Mask as supported. A control must change rendered output. Sliders, toggles, selects, XY pads, dials, gradients, levels, and curves need keyboard access, readable values, focus states, and undo grouping. Build a typed registry that generates both controls and validation.

Bottom actions: Upload, Inspire, Restyle, Shuffle, Library, Export. Inspire changes source and look; Restyle retains source and changes look; Shuffle retains look and changes source. Use owned/licensed demos. Library contains photos, renders, videos, recipes and user imports with real persistence. Export is an adaptive popover/sheet, not an inert button.

### Canvas and editing

Drag/drop, file picker, image paste; fit and zoom; compare; crop/rotate with free and standard aspect ratios; responsive pointer/touch handling. Text overlays support content, typography, color, positioning, dragging, alignment guides, and export-scaled placement. Contextual on-image handles support center/radius/angle where relevant. Masks need an explicit model and real rendering behavior. Depth/lights/animation behavior needs per-mode capture; names alone do not define their implementation.

### Flow

A functioning source → style → effects → output graph using the exact same project and rendering contracts as Studio. Nodes expose controls and connections; graph changes produce visible output; no cycles or incompatible connections are silently accepted. Graph layout, pan/zoom, selection, deletion, undo, and save/load are required. Switching Studio/Flow preserves the project. A graph that Studio cannot represent must show an explicit adaptation boundary without silently flattening it. Detailed Flow parity remains to be observed at desktop width before its feature spec is approved.

## Must-have: rendering inventory

Reference docs currently list 100 tiles and 91 render modes; ordinary static inspection of the shipped registry yields 105 tiles and 96 distinct selectable modes. These are registry counts, not runtime-verified renderer coverage. Track concrete IDs and behavior rather than treating a marketing count as acceptance. Each entry requires its own implementation, defaults, parameter validation, representative output fixture, and preview/export tests. Include the five appended shader mode IDs cyanotype, hexhalftone, paperstock, oilpool and anodized; reconcile their display names and overlapping tiles by canonical ID. Multiple tiles may share a genuine renderer with different pinned parameters. Do not relabel one filter as many styles.

| Family | Required named looks from inspected UI/docs |
| --- | --- |
| ASCII & Text | Characters, ASCII Studio, Block, Dots, Mixed, Braille |
| Pixel & Blocks | Pixel Art, Mosaic, LEGO, Voxel, Hex Mosaic, LED Matrix |
| Print & Paper | Dither, Stippling, Risograph, Comic, Sketch, Engraving, Warhol, Blueprint, Cyanotype, Halftone, Woodblock, Posterize, Mezzotint, Pointillize, Crosshatch, CMYK Drops, Honeycomb Screen, Crumpled Print |
| Geometric | Cross, Diamond, Lines, Diagonal, Specimen, Low Poly, Droste, Truchet, Iso Extrude, Flow Field, Lattice, Topography, Forms, Schematic, Neon Grid |
| Distort | Smudge, Pinch, Spherize, Twirl, ZigZag, Ripple, Polar, Shear |
| Blur & Focus | Motion Blur, Tilt-Shift, Gaussian Blur, Radial Blur |
| Glitch & Signal | CRT Screen, Pixel Sort, Forensics, Digital Distortion, Datamosh, Lofi, RGB Split, Scanline, Thermal, Beacon |
| Light & Color | Disco, Anaglyph 3D, Gradient Map, Prism, Dreamdust, Light Wind, Kaleidoscope, Warpbloom, Duotone, Edge Glow, Aberration |
| Glass | Frosted Glass, Tinted Glass, Shatter, Vitrine, Glass Orb, Fluted Glass, Cross Reeded, Hammered, Diamond Glass, Hexagon, Ripple Glass, Ice Crackle, Chevron Prism, Seedy Bubbles, Glass Pixel, Jello |
| Material & Texture | Waves, Oil Paint, Watercolor, Chrome, Thin-Film, Marble, Molten Metal, Crystallize, Emboss, Petrol Sheen, Heat Tint |

Characters: adjustable cell geometry and font size, measured glyph coverage and shape matching, predefined and custom Unicode ramps, density/coverage, source/monochrome color, invert mapping separately from finished-image inversion, opacity and blend modes. Browser font rasterization supplies calibrated glyph masks; Rust performs numerical matching. Preserve Braille's actual 2×4 spatial dot mapping. Custom ramps receive calibration too.

Dither: ordered Bayer 2/4/8/16, clustered halftone, radial, horizontal/vertical/diagonal lines, deterministic white and blue noise, Floyd–Steinberg, Atkinson, Stucki, Sierra Lite. Add documented palette choices and custom palettes with verified actual colors; the docs' palette descriptions are visibly mismatched and must not be trusted as RGB definitions. Ordered patterns and seeded randomness provide stable video output; error diffusion is available with known temporal tradeoffs. Animated dither phase is a real parameter.

Backdrops: solid, source, blurred source, transparent; blur/opacity/color. Depth, lighting, animation, color grading, and masks integrate before export. Include local ML depth estimation as a distinct optional model-backed pipeline (the reference statically loads Depth Anything v2 small), with a model license/capability/download audit and a visible unsupported state. Levels and monotone curves operate per channel/composite. Expose reference blend operations and character-specific glow/chromatic behavior.

## Must-have: effects

A deterministic ordered pipeline shared by preview/export/Flow: color overlay and grayscale → blur → vignette/scanlines/bloom → chromatic/RGB split/CRT/glitch/grain → pixelate/halftone → geometric warps → reduction passes → dust/sharpen/noise → saturation/hue/levels/curves → text. Verify precise order with fixtures. Glyph bloom and glyph chromatic rendering occur during glyph composition.

Inventory: vignette; scanlines; CRT curvature; chromatic aberration; bloom; character bloom; character chromatic; film grain; glitch; RGB split; pixelate; halftone; ASCII pass; diffuse; threshold; noise reduction; pinch; spherize; twirl; zigzag; ripple; polar; shear; fragment; film dust; noise; sharpen; advanced blur. Additional color overlay/grayscale/saturation/hue/levels/curves/text are separately tracked. Preserve style-independent effect settings when changing styles. Confirm the reference's swapped ripple/zigzag labels before implementing recipe import compatibility; use unambiguous internal names.

## Must-have: media, export, recipes

Images and video remain local for ordinary rendering. Support documented image and browser-decodable video formats with real decode validation; report unsupported codecs. Keep original source dimensions distinct from adaptive preview resolution. Persistent workers, bounded decoded frame caches, frame backpressure, deterministic timestamps, cancel/progress, and resource cleanup are required.

Still exports: PNG/JPEG and 1×–4× source scale with device-aware bounds. Transparent PNG; JPEG/video alpha flattening must be explicit. Animated stills: GIF and MP4 at selectable duration/fps. Video source: processed video export with correct trim/timing and explicit audio controls. Use WebCodecs and a real container muxer where supported; never rename WebM as MP4. Preserve existing text/SVG/ANSI exports for editable cell documents. Effects and text positions scale consistently; preview zoom never changes output dimensions. Feature availability must follow actual capability detection and show a clear reason when unavailable.

Recipes: versioned, validated project-independent look settings; shareable code/link; reset defaults before applying; favorites and curated recipes; optional embedded PNG metadata; reimport restores settings. Use UTF-8 and URL-safe base64; preserve compatibility with reference recipes only for explicitly mapped fields and report unsupported values. Do not reproduce the reference's documented Unicode/base64 bugs. Version the defaults so looks remain reproducible across upgrades.

## Must-have: broader website and services

“All features” includes the non-studio surface: landing page sections and before/after demonstration, style and recipe discovery/detail pages, template/library views, text-to-ASCII, image/video entry points, text faces, glitch/blur/censor text utilities, help/docs/changelog/search, and account/pricing entry points. Audit these routes individually before claiming parity. External linked products (backgrounds.supply and dotforge) are separate products; equivalent source-library capability is included, but rebuilding those entire products is not inferred.

Generative: searchable/grouped preset browser, multiple demo subjects, prompt, strength, resolution, generation progress, errors, regeneration, result reuse/library. Full preset inventory must be audited; 171 is a documented count, not verified prompt equivalence. Requires a real provider adapter and server-held keys; local procedural generators do not satisfy this requirement. Provider choice and cost must be resolved before live execution. Build against a provider contract with automated test doubles until credentials are configured; production UI must state unavailable rather than fake success.

Account/credits/pricing: real authentication, usage tracking and provider credit accounting/refunds when enabled. Model rate limits and payment webhooks explicitly in a later backend spec. No invented plan prices or real checkout can be shipped as functional parity before the user selects their commercial policy. This is a later provisioning gate; it does not block the local Rust studio.

MCP: documented, versioned discovery/catalogue, render/stylize, recipe encode/decode, export, generation operations with input validation and authentication. Browser and server adapters must share the same deterministic Rust engine and schemas. Do not couple it to the reference service or its accounts.

## Proposed technical architecture (builder decisions, not claims about the reference)

Keep Next.js/React/TypeScript for the shell, browser decoding, font rasterization and media APIs. Read the installed Next.js 16.4 documentation before implementation. Build fresh Rust modules under rust/ and a typed versioned WASM protocol; existing numeric exports remain compatible until migrated callers pass parity tests.

Rust owns sampling/resizing, tone/color transforms, convolution/edges, glyph matching, dithering, Braille packing, seeded animation, style logic, effects parameter evaluation and validation. A persistent rendering service retains the source, WASM module, glyph atlas, scratch buffers and frame caches. Transfer packed arrays instead of serializing full JS cell objects every frame. Source retention/serialization happens on save/export, not on every slider/frame.

Use a Rust GPU backend through wgpu/WebGPU with fallback selected by an early browser capability/performance spike. A Rust-driven WebGL2 compatibility backend or CPU WASM raster path may be selected where WebGPU is unavailable; choose based on measured compatibility, not presumed browser support. Shader programs are independently authored. Bindings/glue may be TS; do not call a JS renderer the Rust engine. Document CPU/GPU ownership, fallback behavior, pixel-readback costs, texture limits and resource disposal. SIMD/threads are optional optimizations after profiling; shared-memory headers must not be introduced without checking imported media/asset compatibility.

A RenderProject carries schemaVersion, source descriptor, crop/rotation, style ID/settings, effect blocks, masks, text overlays, seed/time, optional Flow graph, and export configuration. Packed GlyphGrid is an optional intermediate for text styles. AsciiDocument stays a versioned compatibility model. Conversion to a character document is explicit for compatible styles; glass/voxel/post-effect pixels must never silently discard their appearance when opened in the cell editor.

Worker protocol: initialize, setSource, renderPreview(jobId, revision, settings, time), renderExport, cancel, dispose. New previews supersede obsolete jobs; exports use independent bounded queues and report progress. A busy job cannot hold slider input hostage. Recover from worker/context loss with visible state and retry.

Persistence: migrate without overwriting older records; keep source blobs outside JSON with IndexedDB references; recipe codes never embed source bytes. Existing backup/import formats remain supported. Add golden migration fixtures and interrupted-import recovery before routing existing users to the new studio.

No downloaded competitor code or demo artwork is part of the production implementation. Saved bundles are investigation evidence only. UI reference measurements inform independently implemented components.

## Performance and quality acceptance

Targets below are proposed engineering budgets, not measured claims. Record hardware/browser/build/sample counts and cold/warm behavior. Establish a full conversion-to-paint baseline before optimization.

- Warm common glyph/grid styles: target p95 input-to-painted-preview <=50 ms at 1280×720; minimum interactive target <=100 ms for heavier supported effects. Aim 30 fps for 720p motion on the measured desktop, with adaptive preview resolution if required. Never reduce exported dimensions silently.
- Benchmark 512×512, 1920×1080, portrait and 4K sources; 80/160/300-column glyph outputs; basic and stacked styles; image and video. Include worker overhead, copies, glyph calibration, GPU upload/readback and paint. Report CPU and GPU time separately where available.
- Compare output on fixed licensed portraits, hair/fur, gradients, fine type, diagonal edges, flat color, transparency and low-light fixtures. Check tone ordering, clipping, edge orientation, color error, font geometry, shape fidelity, alpha and temporal flicker. Pixel diffs need tolerances for font/GPU variance; human visual review is required for reference-quality claims.
- Render preview and export at normalized scale/time/seed and compare. Repeated seeded frames must be deterministic within documented backend tolerance. Repeated uploads/style changes/exports must release old sources, workers and GPU buffers; establish and enforce a measured memory budget.
- Current sampling-only benchmark: JS 3.713 ms, WASM 3.517 ms (1.056×), zero numerical error. This excludes the rest of conversion, worker lifecycle and painting; it does not prove an end-to-end speedup.

## Edge cases

Transparent/color-profile/EXIF-oriented images; malformed or huge media; Unicode/combining glyphs and empty ramps; superseded jobs; rapid route changes; decode and encoder failure; unsupported GPU/texture size; context loss; canceled export; video end/seek/fps mismatch; alpha flattening; storage full; corrupt recipes/backups; offline state; missing AI configuration; provider failure/refund retry; invalid graphs; old document migration. Provide clear recovery and preserve the user's current project.

## Testing and delivery gates

TDD for Rust math/protocol/persistence/recipes and state behavior. Add contract tests proving CPU/GPU/fallback agreement on specified fixtures. UI interaction and browser tests cover upload → style → controls → compare → recipe → export/reimport; Flow round-trip; saved legacy documents; failed/canceled jobs; real media metadata. Run Rust tests, Vitest, typecheck, lint, production build and Chromium/Firefox/WebKit tests appropriate to each milestone. Visual checks use fixed viewport, source, font, state and seed.

Before production code: user approves this full description, then screen design/prototype and feature implementation plans receive their required gates. Each delivery feature gets its own acceptance ledger. A style registry with unimplemented IDs, fake controls, generic filtered thumbnails, renamed encodes, unconfigured AI buttons, or an inert Flow graph cannot pass.

## Dependencies and remaining decisions

Rust/WASM target and GPU crates, browser codec/muxer availability, licensed demos/font assets, full reference desktop/mobile captures, GPU fallback spike, AI provider credentials, backend hosting/auth, pricing/payment policy, MCP hosting. Builder may choose internal file organization, caches, algorithm optimizations and batching within the requirements. User decisions about external services/spending are deferred until a concrete service setup is reviewable. Local development and independent implementation continue without those services.

## Nice-to-have and exclusions

Nice-to-have after parity: native Rust CLI/batch rendering, extra SIMD/threads, more styles and alternate layouts. Excluded from this rebuild approval: deployment, purchases, opening paid accounts, destructive removal of existing source/documents, exact reproduction of unknown private backend behavior, unrelated external linked products. No feature in the verified reference inventory is dropped merely because it is difficult.

## Builder review

Independent reviewer found no further user decisions needed to begin capture/design/architecture. Before affected implementation plans: capture real desktop/mobile/Flow states; build a canonical 105-tile/96-mode registry inventory with unknown fields explicit; establish fixed-source reference output baselines; inventory individual non-studio routes and services; include the legacy editor entry point in the design without changing the requested Studio layout. These remain required work, not completed acceptance checks.

## Additional user-supplied source, 2026-10-20

The user supplied https://github.com/kailashsr38/ascii-magic-art and instructed continued work. Pinned audit: commit `de88962156057cbef583bd265bf55e23d6c5e30d`, package1.0.2, 634 animated pieces/24 categories. It is the template library/runtime, not the main /app image/video editor. See `docs/research/ascii-magic/2026-10-20/github-library-audit.md`.

The independent-implementation rule still applies to unlicensed shipped editor bundles. Eligible code/pieces from this explicitly supplied MIT repository may be reused or ported with its copyright/permission notice retained, provenance/version recorded, and its NOTICE exceptions audited. `ocean-sunset` and `starry-ridge` contain separately licensed photo data; do not silently treat them as MIT. This source improves library/glyph behavior evidence but does not establish the missing editor/GPU/mobile algorithms.
