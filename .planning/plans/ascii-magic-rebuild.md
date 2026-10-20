# ASCII Magic parity rebuild implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild AsciiMorph into the approved reference-matched effects studio with a Rust-owned renderer and full tracked product parity.

**Architecture:** Keep React/Next.js for the interface and browser APIs. Introduce a versioned pixel-render project and persistent Rust/WASM service under `src/render/`, alongside the existing editable `AsciiDocument`. Deliver the new studio at `/app`; keep `/studio` as the manual editor and preserve `/convert` until conversion migration passes. GPU rendering, thumbnail/live/export scheduling, and media encoding have distinct resource budgets but share project semantics.

**Tech stack:** Next.js 16.4.2, React 19.2, TypeScript, Rust/WASM, Canvas and measured GPU backend, Vitest, Playwright. Read installed Next.js guides before route/component changes. GPU crates and encoding libraries are selected only at their explicit dependency gates.

**Spec:** `.planning/specs/ascii-magic-rebuild.md` (user approved 2026-10-20).

**Status:** Proposed implementation plan; production implementation awaits plan/design review. Prototype is a disposable design artifact, not the Rust studio.

## Global constraints

- “The entire project is in scope. Milestones below are delivery order, not permission to omit later features.”
- No unlicensed shipped editor bundles/demo art enter production. The subsequently supplied `ascii-magic-art` MIT library may be reused or ported after exact commit/file provenance and copyright/permission notices are retained; its two NOTICE photo-data exceptions remain separate.
- “A control must change rendered output.”
- “Zoom changes view only, never export dimensions.”
- “Images and video remain local for ordinary rendering.”
- “No milestone is called full parity until its inventory and acceptance rows pass.”
- Preserve the existing dirty working tree. Do not blanket-stage, reset, delete source, or overwrite saved document records. Review changed-file ownership before any commit.
- New service-dependent UI reports unconfigured state. No fake generation/credits/checkout, real purchase, deployment or credential entry is included in this local implementation plan approval.

## Review focus

1. Rapid source/style/route changes must never paint obsolete output or detach the retained source buffer: service tests in Task 2 and interaction tests in Task 3.
2. Unknown/Unicode recipe fields and legacy documents must round-trip or fail without altering existing projects: Tasks 1 and 5.
3. GPU/context/encoder failures must fall back visibly or preserve an exportable project: Tasks 2, 4 and 5.
4. A large image with a small viewport must retain full source export geometry and equivalent appearance: Tasks 2 and 5.
5. Graphs, masks and pixel styles must not silently flatten into character documents: Tasks 1 and 6.

## Evidence and design inputs

- `docs/research/ascii-magic/2026-10-20/catalog-inventory.json`: 105 captured tiles / 96 selectable mode IDs. Fields explicitly marked unknown remain capture work.
- `desktop-measurements.json`: observed 52px toolbar, 320px catalog, 340px properties dock including 54px icon rail, 568×50px bottom bar at 22px bottom offset; colors #000/#0a0a0a, borders white at 10%, Satoshi controls 12–13px.
- `studio-1440.jpg`, `studio-1920.jpg`, `flow-1440.jpg`, `library-1440.jpg`: observed desktop reference states.
- `studio-390-desktop-pointer.jpg`, `studio-768-desktop-pointer.jpg`: viewport observations only. The reference chooses a mobile shell using device/pointer classification; these captures use a fine-pointer browser and show the desktop shell overflowing. Do not call them mobile-shell validation.
- `.planning/design-config.md` and `.planning/design/screens/ascii-magic-rebuild/`: proposed reconstruction tokens, design and clickable prototype. Reference desktop measurements govern; phone adaptation remains provisional until captured on a suitable device.

## File boundaries

| Owner area | Files / responsibility |
| --- | --- |
| Render core | `rust/src/{project,tone,sampling,glyphs,dither,braille,filters,render,ffi}.rs`; retain compatibility exports in `rust/src/lib.rs` |
| Shared browser boundary | `src/render/{project,protocol,wasm,service,worker,calibration,capabilities,metrics}.ts`; fixtures/tests beside owned modules |
| Effects studio | `src/components/effects-studio/{studio,toolbar,catalog,viewport,properties,actions,dialogs}.tsx`, `studio.css`, hooks/state and tests; no legacy editor rewrite |
| Route integration | `src/app/app/page.tsx`; narrow pathname exclusion in `src/components/workspace/navigation.tsx`; existing `/studio` compatibility link |
| Styles/effects | Rust modules under `rust/src/styles/` and `rust/src/effects/`; matching data-only registry and controls under `src/render/catalog/` |
| GPU | `rust/src/gpu/` and independently authored shaders; `src/render/gpu/` capability/initialization boundary as required by measured backend |
| Media/exports | `src/render/media/` and `src/render/export/`; reuse working encoders only through tested adapters |
| Project/recipe library | `src/render/{recipes,library,migration}/`; use IndexedDB blob references and preserve existing stores |
| Flow | `src/render/flow/`, `src/components/effects-studio/flow/` |
| Site/services | Dedicated discovery/utility pages; `src/services/` server-only adapters and MCP package/service after their scoped plans |

## Task 1: Freeze the project contract, migration boundary and reference acceptance ledger

**Files:** create `src/render/project.ts`, `src/render/project.test.ts`, `src/render/catalog/types.ts`, `src/render/legacy-adapter.ts`, `docs/verification/reference-parity.md`; detailed Rust boundary in [Rust core plan](ascii-magic-rust-core.md).

**Interfaces:** this task owns `RenderProjectV1`; the Rust core plan owns `SourceRef`, `PackedGlyphGrid`, `GlyphCalibrationV1`, `CharacterSettingsV1` and the worker protocol. Define the project shape in `src/render/project.ts`:

```ts
type ParameterValue = number | string | boolean | null | ParameterValue[] | { [key: string]: ParameterValue };
type ParameterMap = Record<string, ParameterValue>;
type NormalizedCrop = { x: number; y: number; width: number; height: number };
type EffectState = { id: string; key: string; enabled: boolean; parameters: ParameterMap };
type MaskV1 = { id: string; targetId: string; assetId: string; invert: boolean; opacity: number };
type TextOverlayV1 = { id: string; text: string; x: number; y: number; width: number; fontFamily: string; fontSize: number; color: string; align: 'left' | 'center' | 'right'; rotation: number };
type ExportSettingsV1 = { format: 'png' | 'jpeg' | 'gif' | 'webm' | 'mp4'; scale: 1 | 2 | 3 | 4; fps: 15 | 20 | 24 | 30 | 60; durationUs: number; quality: number; audio: boolean };
type RenderProjectV1 = { version: 1; id: string; name: string; source: SourceRef | null; crop: NormalizedCrop; rotation: 0 | 90 | 180 | 270; style: { id: string; parameters: ParameterMap }; effects: EffectState[]; masks: MaskV1[]; text: TextOverlayV1[]; seed: number; timeUs: number; export: ExportSettingsV1; graph?: FlowGraphV1 };
```

All text geometry except rotation/fontSize is fractional frame coordinates; fontSize is a fraction of output height, rotation degrees. Mask assets are validated alpha planes referenced from the source store; recipe serialization excludes asset-backed masks and reports required assets. Graph is optional until Task 6 supplies its versioned model; first delivery rejects graph-bearing input with an explicit unsupported-version-feature error rather than discarding it. `ParameterMap` is a transport shape; registry validators reject unknown keys/nonfinite numbers, bound nested values and apply exact per-mode types/ranges. Initial empty source is valid in a saved draft, while a render request requires a matching uploaded source. Browser source ownership and retained bytes live in the service, not recipe JSON. `validateRenderProject(value: unknown): RenderProjectV1` is the validation entry. `gridToDocument(grid: PackedGlyphGrid, calibration: GlyphCalibrationV1 | undefined, name: string): AsciiDocument` is explicit and only accepts a glyph-compatible stage; raster effects/masks/text must report an adaptation requirement.

- [ ] Write failing project-contract tests: schema version rejection; non-finite values; missing sources; retained crop/rotation/effect ordering; custom Unicode ramps; malformed masks; source/preview/export sizes distinct. Write a pixel-style-to-document rejection test.
- [ ] Run `npx vitest run src/render/project.test.ts`; verify the new contract is missing/fails the named assertions.
- [ ] Implement contract/validator and explicit glyph document adapter according to the Rust plan. Do not change old `AsciiDocument` version or limits.
- [ ] Populate acceptance ledger for every canonical mode/tile/effect and workflow: evidence status, implementation path, tests, visual fixtures, current gaps. Registry-only entries stay incomplete.
- [ ] Re-run contract tests and existing `src/core/document`/converter handoff tests. Review isolated diff before an optional scoped commit.

## Task 2: Implement Rust core, warm worker service and measured GPU foundation

**Files/interfaces:** follow [ascii-magic-rust-core.md](ascii-magic-rust-core.md), including exact ABI/worker signatures, source revisions, packed output and ownership. This task has its own detailed red/green steps and is not fulfilled by exporting the old sampler under a new name.

- [ ] Implement Rust tone/filter/matching/diffusion/Braille with scalar golden fixtures, independent of browser object models.
- [ ] Preserve current WASM exports until old callers pass. Build versioned full-stage exports and validate all dimensions/offsets/capacities at both boundaries.
- [ ] Test warm worker lifetime, source uploads once per revision, latest-preview coalescing, job progress/cancel, stale-message suppression, dispose/remount, allocation cleanup and WASM load failure. Do not falsely promise preemption of a synchronous WASM call: use cooperative chunks and bounded job budgets.
- [ ] Benchmark complete decode/calibration/upload/processing/paint for fixed fixtures before and after. Retain cold/warm metrics and source copies, not just sampling averages.
- [ ] Build GPU capability/performance spike for an atlas and a multipass warp. Measure WebGPU/wgpu feasibility and fallback on Chromium, Firefox and WebKit. Record backend choice, supported limits, CPU/GPU parity tolerances, upload/readback/texture pressure, and dependency impact before selecting crates.
- [ ] Test device/context loss and CPU fallback, including alpha and full-source exports. Run `npm run test:rust`, `npm run build:wasm`, the new Rust/worker/ABI tests and unchanged converter regressions.

## Task 3: Ship the reference Studio shell with first working renderer families

**Files:** new effects-studio components/hooks/state/CSS; `src/app/app/page.tsx`; narrow navigation exclusion; `tests/e2e/effects-studio.spec.ts` and component tests.

**Interfaces:** `EffectsStudio` consumes `RenderProjectV1` and the service defined in Task 2; `Catalog` consumes validated `StyleDescriptor[]` with explicit readiness; `Properties` consumes descriptors/values and emits validated parameter patches. Main-thread state stores serializable project/history plus service-owned source handles. All event paths update the same project revision.

- [ ] Write failing state/component tests for upload → select real style → tune → rendered revision, favorite/search filtering, compare, history grouping, view-only zoom, selected text keyboard undo, and route unmount while rendering.
- [ ] Build measured desktop shell and approved responsive adaptation; import tokens from the design doc. Use independently sourced font files with checked license before claiming font parity.
- [ ] Wire initial real families: Characters/Mixed/Block/Braille, Dots/Cross/Diamond/Lines/Diagonal and Pixel/Mosaic/LEGO/Voxel/Disco plus Dither as their Rust renderers pass fixtures. Entries without an implementation do not masquerade as working styles.
- [ ] Build bounded low-priority current-source thumbnails and hover previews, catalog resize/collapse, meaningful suggested ranking, contextual controls and keyboard focus. Main stage is never replaced by a stale thumbnail revision.
- [ ] Wire real upload/paste/drop, original preview/compare, crop/rotate, overlay text and guides, source/look randomization using licensed local demos, and usable error/empty/loading states. A legacy editor link in Menu opens `/studio` without discarding the saved pixel project.
- [ ] Add `/app` route; suppress only its old global workspace bar. Keep existing routes and saved projects operational.
- [ ] Run component/state tests, typecheck/lint/build, browser flow and 1440/1920 visual checks. Test phone and tablet sheets independently; record the true mobile reference gap until resolved. Review with designer + critic.

## Task 4: Complete all renderer families and effects

**Files:** `rust/src/styles/`, `rust/src/effects/`, `src/render/catalog/`, matching test fixtures, controls, golden snapshots and per-family plans.

**Interfaces:** define `ParameterDescriptor={key:string,label:string,type: 'number'|'boolean'|'color'|'select'|'text'|'curve'|'point',default:ParameterValue,min?:number,max?:number,step?:number,options?:{value:string,label:string}[]}`; `StyleDescriptor={id:string,mode:string,name:string,category:string,tags:string[],parameters:ParameterDescriptor[],ready:boolean,output:'glyph'|'rgba',dispatchId:number}` with canonical IDs/defaults/parameter definitions/readiness/outputs plus Rust dispatch ID; `EffectDescriptor` fixed-order key/defaults/parameters/phase. Descriptors power controls, validation, recipes and MCP; shader variants are pinned parameter patches to genuine renderers.

- [ ] Split catalog by family into bounded follow-on task lists. Before implementing each family, capture supported controls/defaults and representative reference output; unresolved pro behavior becomes an explicit independent algorithm design, not a verified equivalence claim.
- [ ] For each distinct renderer, write a red test that identifies its characteristic behavior on an independently constructed fixture (geometry, quantization, contour, texture or displacement), not merely a changed output hash. Implement and verify before registering it ready.
- [ ] Cover Print/Paper, Geometric, Distort, Blur/Focus, Glitch/Signal, Light/Color, Glass variants and Material/Texture, including the five appended shader modes. All 96 canonical captured modes must have checked rows before catalog parity is complete.
- [ ] Implement the 28 keyed post effects plus grading/overlays in the approved fixed order, separately testing compositional order, parameter extremes, source transparency, glyph-only glow/chromatic behavior, effect scaling and temporal seed/time.
- [ ] Build real masks/lights/depth/animation controls from per-mode capability descriptors. Audit local depth model license/size/device support; use real model output when configured, not a disguised luminance map.
- [ ] Test visual fixtures at normalized source size/time/seed and preview/export scales; verify settings persistence across style changes and GPU fallback within documented tolerances. Review each family before marking rows done.

## Task 5: Complete recipes, library, image/video export and legacy migration

**Files:** `src/render/recipes/`, `library/`, `migration/`, `media/`, `export/`; corresponding dialogs and E2E fixtures.

**Interfaces:** `encodeRecipe(project: RenderProjectV1): string`; `decodeRecipe(code: string): RecipeV1`; `applyRecipe(project, recipe): RenderProjectV1` resets look fields to versioned defaults. `saveRenderProject(project, sourceBlob)` stores source blobs separately. Export service receives full-source project/time/scale/format and returns honest MIME/extension/actual size/progress/cancel.

- [ ] Write red tests for UTF-8/base64url round-trip, unknown version/field rejection, default reset, oversized payloads and mapped reference-recipe import. Test PNG metadata round-trip without altering pixels.
- [ ] Implement recipes and source/render/video/recipe library with owned/licensed demos, favorites, search and persistence. Test quota errors preserve old entries.
- [ ] Write migration fixtures for existing editor documents, retained conversions, animation/project backups and interrupted imports. New render projects use a new store; old stores remain readable until explicit migration passes.
- [ ] Implement PNG/JPEG source-scale exports with a checked maximum dimension/memory budget; test alpha handling and preview zoom independence.
- [ ] Add incremental frame decode/seek/render with bounded queues and deterministic timestamps. Integrate real GIF/WebM/MP4 encoders/muxers through capability checks; preserve audio/trim controls. Test cancellation, unsupported codecs, odd video dimensions, timestamp/audio drift and export resume/restore of preview.
- [ ] Inspect exported files with real metadata/readback tests. Run media, recipe, migration and browser round-trips before enabling format choices.

## Task 6: Build executable Flow

**Files:** `src/render/flow/{model,validate,evaluate,studio-adapter}.ts`, tests; `src/components/effects-studio/flow/`.

**Interfaces:** `validateGraph(value): FlowGraphV1`; `compileGraph(graph, project): RenderPlan` for the same renderer; `projectToGraph(project)` and `graphToStudio(graph)` return an explicit representability result. No hidden flattening.

- [ ] Write failing graph tests for source/style/output, effect ordering, disconnected outputs, duplicate IDs, cycles, invalid sockets, and non-representable graphs.
- [ ] Implement graph model/validation/compiler and serialize it in the pixel project. Use the shared renderer and source handles.
- [ ] Build measured source/style/output nodes, ports/edges, selection/drag/pan/zoom, add/delete, fit, parameter controls, output size and export bar. Pointer actions and keyboard actions share history commands.
- [ ] Test Studio → Flow → Studio preserves supported project semantics; preserve unrepresentable graphs with explicit explanation and separate Studio adaptation action.
- [ ] Run graph tests and browser editing/save/export fixtures, then compare screenshot state to captured Flow. Do not equate a static node diagram with working Flow.

## Task 7: Rebuild the surrounding website, utilities and MCP

**Files:** scoped discovery/library/recipe/style/detail/utility routes, landing components, docs/search, server-only MCP adapter/package and contract tests.

- [ ] Audit first-party routes one by one and record inputs/outputs/interaction coverage in the ledger. Keep linked third-party products outside the product boundary.
- [ ] Audit adapter integration of the user-supplied MIT animated library at commit `de88962156057cbef583bd265bf55e23d6c5e30d`: `src/creative/template-library.ts` owns eligible metadata and `create()->draw(t)` frame adaptation; `THIRD_PARTY_NOTICES.md` retains license/provenance and records the two photo-data exceptions. Test frame dimensions, palette mapping, reduced-motion stills, deterministic time, and no network fetch on playback. Port glyph/restyle math to Rust only after fixture agreement; package library does not replace image conversion.
- [ ] Write bounded route/utility plans with tests before implementation. Reuse existing typography/generator/gallery logic only where it genuinely satisfies the reference behavior.
- [ ] Rebuild landing/discovery/detail/library/tools/help/changelog/search with measured reference styling and original content/artwork. All shown utilities need real output/copy/export behavior.
- [ ] Create MCP discovery/catalogue/render/export/recipe contracts using the same schemas and Rust engine. Test known fixtures through the non-browser adapter. Add authenticated transport and controlled source access before hosting; no coupling to the competitor account/service.
- [ ] Run utility output tests, link/navigation/accessibility checks and MCP contract/integration tests. No public deployment is included here.

## Task 8: Integrate generative/account services, then close parity

**Files:** provider/server adapters, authentication/session/credit ledger/payment integration modules and their scoped service plan; generative picker UI and tests.

- [ ] Inventory generative presets/groups/demo subject behavior. Independently define prompts with honest provenance; do not claim identical stochastic results.
- [ ] Define and test provider adapter requests/results/progress/cancel/error with test doubles. Browser UI must never pretend an unconfigured provider succeeded.
- [ ] Present a concrete provider/hosting/auth/commercial setup for user selection before credentials/spending/deployment. Draft schema/API/credit/idempotency/refund/webhook tests in that scoped backend plan before production integration.
- [ ] Integrate configured provider, real authentication/credits/rate limiting/refunds and commercial policy. Keep ordinary image/video rendering local.
- [ ] Execute full parity ledger across captured viewports, all ready catalog modes/effects, real media exports, Flow, recipes, library/migration, all site utilities and configured AI/MCP services.
- [ ] Run complete Rust + Vitest + typecheck + lint + production build + Chromium/Firefox/WebKit regression suites, profile p95 end-to-end latency/memory, review quality on fixed licensed visual/motion fixtures, and resolve blocking findings. Report any hardware/device/service limitations as open rows rather than “complete”.

## Plan self-review and execution

The Rust plan specifies the first implementation boundary in detail; later domain tasks explicitly require bounded plans before their code. Every approved subsystem is mapped above. Unknown reference behavior, real mobile-shell capture, GPU backend choice and external services are prerequisites for affected tasks, not blanket blockers for independent local work.

Recommended execution: subagent-driven with strict file ownership and sequential integration at contract boundaries; independent visual/catalog capture can run alongside engine work. Begin with Task 1 and the first Rust-core tasks after plan and screen-design approval. Optional commits must include only reviewed task-owned files; never commit unrelated pre-existing work.
