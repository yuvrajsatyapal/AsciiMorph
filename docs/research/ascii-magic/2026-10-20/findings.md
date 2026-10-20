# ASCII Magic investigation and AsciiMorph gap ledger

Date: 2026-10-20. Target: https://www.ascii-magic.com/ and its public /app editor. Status: bounded investigation; complete product parity has not been established or implemented.

## Method and retained artifacts

Applied `/Users/yuvrajsatyapal/.agents/skills/reverse-engineer-anything/SKILL.md` v37. REA MCP is absent in this Codex session; pinned REA 6.4.0 CLI was obtained through npm. Doctor found missing Codex registration; CLI use does not require registering it, so no client configuration was changed. Two sandboxed analysis attempts failed during the macOS ownership helper's Swift compilation. The second changed compiler cache environment variables; the helper still used the blocked cache. A scoped escalated run also failed compiling the helper, now reporting duplicate SwiftBridging modules/toolchain incompatibility. REA remains limited to artifact inventory; no semantic analysis completed. No compiler/toolchain upgrade was attempted.

- `app.html`: public editor HTML snapshot, 1,093,328 bytes. Investigation material only.
- `asset-manifest.json`: exact URLs, local artifact paths, lengths and SHA-256 digests for 23 publicly linked /app scripts. These are a bounded initial module set, not the complete dynamic application. Bundle files live in `/tmp/asciimorph-reference-2026-10-20`; temporary files may expire. Manifest hashes permit later identity checks.
- `studio-reference.png` and `flow-reference.png`: actual side-panel browser captures at 505×901. They establish colors and visible controls at this viewport, not desktop or intended mobile parity. Both panels overflow this narrow capture. No full Flow graph was visible, so graph behavior remains unverified.
- `rea-static-evidence.json`, `rea-static-retry.json`: REA failure envelopes, including partial inventory Evidence. Do not cite them as completed semantic analysis.
- `rea-analysis.json`: escalated failure envelope. Partial inventory Evidence ID: `ev_d1e5b27336cd391e07e296e86637bdf7c9e54c591f4639b18b3ea1715996365b`, artifact SHA-256 `0dee614851056c84d92383598da8fb1828934cb37140ca9a5f5685f7a276f258`. The analyzer stopped at startup of the first source; inventory is not completed source analysis. `rea-status.json` records the limitation concisely.

Ordinary source inspection is labeled STATIC below. Only REA-returned objects supply REA Evidence IDs. Website documentation is labeled DOC; runtime UI is labeled UI. Inferences about speed are not observed comparative performance.

## Feature and UI ledger

| Question | Finding | Evidence and confidence | Remaining gap |
| --- | --- | --- | --- |
| What is the product? | Image/video effects studio, not just a text-cell converter. | DOC https://www.ascii-magic.com/docs and /docs/styles; UI /app | No reference numeric quality comparison. |
| What layout? | Compact dark top toolbar; searchable category catalog; central image stage; contextual properties and vertical category rail; floating action strip. Studio/Flow switch. | UI screenshots and accessibility controls; DOC /docs/interface | Capture wide desktop and real mobile shell before asserting exact proportions/breakpoints. |
| What actions? | Upload, Inspire, Restyle, Shuffle, Library, Export; crop, compare, add text, undo/redo, recipes, zoom. | UI /app | Export/download and clipboard correctness not exercised. |
| Which properties? | Characters/Style, Depth, Animation, Lights, Color, Post FX, Mask; style-specific labels. | UI /app | Every panel and per-style parameter set still needs focused capture. |
| How many looks? | Docs say 100 tiles/91 modes; shipped catalog structure gives 105 tiles/96 distinct selectable modes. | DOC /docs/styles; STATIC `2cjp552-p57it.js` offsets 7323–18050 | Counts differ by build; registry presence does not prove implemented runtime behavior. |
| Which effects? | 28 keyed post effects plus grading/text; character effects have their own render path. | UI Post FX panel; DOC /docs/effects; STATIC below | Pro effects were not unlocked/executed. |
| How are looks shared? | Versioned recipe delta, link, optional PNG metadata. | DOC /docs/recipes; STATIC export metadata path | Round-trip not runtime-tested; docs acknowledge Unicode/base64 defects. |
| What exports? | PNG/JPG visible for current still; scale 1×–4×. Docs describe GIF/MP4 for motion. | UI export popover; DOC /docs/export | Docs say no tier scale limit, but live UI labels 3×/4× Pro. Preserve contradiction; no actual encode tested. |
| AI generation? | Documented grouped 171-preset provider-backed workflow. | DOC /docs/generative | Signed-in prompts, provider, actual output and complete preset semantics not examined. |
| Flow? | Workspace switch changes catalog to Styles/Effects. Docs describe connected source/style/output nodes. | UI switch; DOC /docs/interface | Actual graph interaction unseen at captured narrow width. |
| Other website features? | Discovery/recipes/library/docs; text conversion/faces/glitch/blur/censor utilities; MCP/account/pricing. | Public home navigation https://www.ascii-magic.com/ | Individual utility routes and private services have not been audited. |

## Shipped renderer: ordinary static evidence

Offsets below are zero-based Unicode character offsets in the named minified file, not byte ranges or source lines. Match manifest digests before reusing them. Reference code was read as text, not executed through shell analysis.

| Observation | Artifact and offset | Implication (inference) |
| --- | --- | --- |
| WebGL2 glyph batching: 2048² Courier atlas, x/y/glyph-index/RGBA instance payload, instanced draw then Canvas composition. | `09wgr6f2vxer0.js` 16000–20900 | A cached atlas and batched geometry are relevant to live glyph speed. |
| Character bloom/chromatic and bitmap ramps use a Canvas fallback. | Same file 14400–15900, 102000–102650, 114650–115020 | GPU glyph path does not cover every configuration. |
| WebGL2 warp passes use reusable framebuffer textures and at most two ping-pong intermediates. | `347xui5sae099.js` 8000–11000 | Avoid CPU readback between effect passes. |
| GL context LRU with max eight; disposal/context-loss handling. | Same file 2900–3350 | GPU resource lifecycle matters independently of Rust math. |
| Texture key includes source identity, transform, video readiness/time and source-frame revision; upload only when changed. | Same file 48900–50300 | Repeated slider edits should not re-upload unchanged source. |
| Four-entry sampled-frame cache. | Same file 51400–52800 | Reuse derived source data across related styles. |
| Palette and animation random/phase/grid caches. | `09wgr6f2vxer0.js` 93000–93400, 102700–103500 | Seed and reuse stochastic state for motion. |
| Video can downsample near the glyph grid before reading pixels; retained edge worker. | Same file 13300–14300 | Avoid full-resolution pixel work and per-frame worker startup. |
| Preview area budgets about 1.2M pixels on phones and 2.3M elsewhere. | Same file 9800–10050 | Adaptive preview must be distinct from full-resolution output. |
| Thumbnail state isolated from stage state; hover sources capped separately around 360/720px; fetch deduplication. | Same file 133000–135150 | Style catalog can use a separate low-priority preview queue. |
| Main output is Canvas 2D; rendering uses RAF/video frame callbacks. | Same file 163150–164450, 172350–174200 | The reference is a hybrid renderer; saying everything is WebGL would be false. |
| Export scales from original/source-to-preview ratio using the same renderer, with optional recipe metadata. | `1veko_gfzd5t1.js` 24200–25200 | Preserve appearance across source-scale export. |
| Export holds/pause/restores preview and source playback. | `09wgr6f2vxer0.js` 174250–175150; `2l9zpxby2cme3.js` 5600–6350 | Export work needs explicit live-session coordination. |
| Depth estimation lazily requests Depth Anything v2 small, WebGPU fp16 with WASM/q8 fallback. | `09wgr6f2vxer0.js` 7200–7800 | Local ML depth is distinct from paid cloud generative restyling. Model license, download size and device support need assessment. |
| Additional renderer registration is lazy-loaded via `e.A(1332)`; mobile and desktop stages are also separate lazy modules. | Same file 120050–120400; `2l9zpxby2cme3.js` 450–650 | Supplied initial chunks do not cover all renderer algorithms or mobile code. |
| Five new shader mode IDs: cyanotype, hexhalftone, paperstock, oilpool, anodized. | `2cjp552-p57it.js` 560–650, 16752–18050 | Include new modes in inventory; reconcile overlapping display labels by ID. |

There is no evidence in these inspected chunks that the reference's main renderer is written in Rust. WASM strings associated with depth-model fallback do not establish Rust use.

## Current AsciiMorph audit

Read-only source audit preserved the pre-existing dirty tree.

| Area | Local evidence | Finding |
| --- | --- | --- |
| Rust | rust/src/lib.rs:3 and :45 | Area sampling and box blur/Sobel only; no full Rust conversion renderer. |
| Conversion | src/converter/engine.ts:95 | Crop/rotate, tone, shape matching, diffusion, Braille and cell/source output mostly TypeScript. |
| Worker | src/converter/runner.ts:19 and :38 | Creates and terminates a worker on every conversion, discarding module-local WASM cache. |
| Buffer boundary | src/converter/wasm.ts:65 | Allocate/copy in/copy out/free for each primitive call. |
| Glyph calibration | src/converter/presets.ts:48 | Coverage and 3×3 signatures exist; custom sets skip calibration. |
| Paint | src/core/render.ts:208 and :233 | Allocated per-cell surfaces and Canvas glyph rasterization; separate from Rust sampling. |
| Source retention | src/converter/engine.ts:327; src/creative/media.ts:154 | Full source base64 encoding per conversion; video import removes it afterward. |
| UI delay | src/converter/use-converter.ts:142 | 180ms debounce before calibration/worker conversion. |
| Existing scope | docs/superpowers/specs and plans, dated 2026-10-19 | Saved creative/workspace specs exist; this rebuild changes the UI direction and extends scope rather than starting from an empty app. |

Fresh verification by engine-audit worker:

- `npm run test:rust`: 2 passed.
- Targeted engine/WASM/transform Vitest: 21 passed.
- `npm run bench:wasm`: 1024×768 → 160×80 sampling, 30 warmed medians. JS 3.713ms; WASM 3.517ms; 1.056×; maximum absolute error 0.

This benchmark excludes worker startup, tone/matching/dithering, source persistence, paint, interactions and video. It does not support a claim of end-to-end speedup or reference visual quality parity.

## Checklist closeout

- Answered: current Rust scope; worker lifecycle; current sampling baseline; visible Studio layout/control groups; existence of recipes, Flow and AI; hybrid GPU/Canvas architecture; catalog-vs-mode distinction.
- Partially answered: full feature inventory, style implementations/defaults, post-effects semantics, thumbnail/preview/export sharing, source/media limits, recipe compatibility.
- Unresolved: per-mode pro behavior, full desktop/mobile screenshots and interactions, matching-fixture quality/performance, actual reference export/AI/MCP behavior, private service internals.

## Proposed rebuild direction

A Rust-owned render service with warm workers, reusable buffers and GPU batching; a pixel project model alongside the editable character document; exact-reference UI reconstruction through measured design tokens and screenshot review; staged full feature delivery with no placeholder claims. See the draft spec and epic in .planning. No application code was changed by this investigation.
