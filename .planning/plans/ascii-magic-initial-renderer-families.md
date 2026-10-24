# Initial Renderer Families Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Preserve the execution method already authorized in the parent chat; do not request it again.

**Goal:** Extend the working `/app` Characters studio with genuine Rust implementations of Mixed, Block, Braille, Dots, Cross, Diamond, Lines, Diagonal, Pixel, Mosaic, LEGO, Voxel, Disco and Dither, with truthful controls, source-preserving previews and captured still exports.

**Architecture:** Keep the existing Characters context-v1 API and its fixtures intact. Add an explicitly versioned full-RGBA style-job API inside the existing retained-source Rust session and worker service; let the canonical Studio controller select the correct adapter through a prepared-resource discriminant. Implement each family behind an evidence/design gate and characteristic numerical fixtures before making its catalog entry available.

**Tech Stack:** Rust without new dependencies, WASM, Next.js 16.4.2, React 19.2, TypeScript, Vitest, Playwright and the existing Canvas image encoder.

**Spec:** [Approved rebuild spec](../specs/ascii-magic-rebuild.md), [umbrella plan Task 3](ascii-magic-rebuild.md), [Studio shell plan](ascii-magic-studio-shell.md). Existing character contracts are defined in `src/render/reference-characters.ts`, `src/render/characters-wire.ts`, `rust/src/reference_characters.rs`, `rust/src/character_backdrop.rs` and the accepted character plans.

**Status:** Planning only, 2026-10-24. Execution begins after the current Studio shell review resolves. The user approved the whole rebuild and continued execution on `main`; this document adds no approval pause, branch, worktree, commit or push authorization. Inspect the current working tree before execution and preserve concurrent edits. The complete website, remaining renderers, effects and workflows stay in the umbrella scope.

## Global Constraints

- “The entire project is in scope. Milestones below are delivery order, not permission to omit later features.”
- “A control must change rendered output.”
- “Zoom changes view only, never export dimensions.”
- “Images and video remain local for ordinary rendering.”
- “No milestone is called full parity until its inventory and acceptance rows pass.”
- All numerical sampling, geometry, dithering, shading, composition and seeded/time-dependent evaluation belong to Rust. Browser font rasterization, decoding, validated packing, painting and encoding remain browser boundaries.
- Preserve full oriented source pixels, source identity/revision, straight-alpha sRGB frames, crop-before-rotation geometry, complete output margins and source-scaled export dimensions. No viewport screenshot or silent source resize becomes export input.
- Preserve the separate admission layers: Studio uploads remain capped at **12 MiB compressed input**, **4,000,000 decoded pixels** and **8,192 pixels per side**, with the existing **192 MiB source-pipeline** reservation policy. The underlying engine's **16,384-pixel source-side** cap is an additional native limit, not permission to raise Studio admission. Keep the existing **268,435,456-byte (256 MiB)** native session policy and **256 MiB known combined export** budget, **60,000** character-cell limit and existing backing/atlas limits. Count simultaneous owned buffers and actual capacities; this plan authorizes no application-admission expansion, silent budget increase or unbounded second worker.
- Preserve one active/latest preview, bounded independent export admission, cooperative work slices, cancellation, captured atlas lifetime, immutable same-source exports, transactional source replacement and StrictMode retirement behavior.
- Preserve existing Characters context/profile/retention versions and legacy conversion ABI. Registry metadata alone never enables a renderer. All new styles return full RGBA; editable cell conversion remains an explicit later adapter.
- Reference bundles are inert investigation evidence only: never execute, import, distribute or copy their renderer bodies. `/tmp/asciimorph-ascii-magic-art-reference` is an art library, not evidence of the editor engine.
- No GPU, 4K, p95, animation-export or mobile-reference parity claim is earned by this milestone. Unsupported effects/depth/lights/masks/text remain explicit; never silently ignore active project settings.

## Review Focus

1. A captured Characters export must survive switching to a raster style, then another atlas, while a new source still cancels it: Tasks 4 and 17.
2. Nondivisible source dimensions and transparent colored edge pixels must preserve partial cells, margins and alpha without dark fringes: Tasks 5–16 and 20.
3. Valid control extrema may exceed current memory/cell limits; admission must fail before allocating and retain the prior frame/project: Tasks 3, 5 and 17.
4. A style change, grouped parameter edit, undo and redo must restore the same look and source without placing resource objects in history: Task 17.
5. Superseded thumbnails, worker recovery and route retirement must not paint a stale style/source or release an encoder-owned frame early: Tasks 4, 17 and 19.

## Evidence, scope and dependency decisions

Read `docs/research/ascii-magic/2026-10-20/{catalog-inventory.json,parameter-evidence.json,character-parameter-semantics.md,character-placement-evidence.md,character-sampling-evidence.md}` first. Their facts are static observations, not runtime-verified equivalence. Original files are under `/tmp/asciimorph-reference-2026-10-20`; preserve hashes and Unicode-offset ranges when adding findings.

Also consume `docs/research/ascii-magic/2026-10-24/initial-families/{README.md,mode-switch-controls.json,capture-manifest.json}`. Actual catalog clicks Mixed→Block→Braille changed the selected mode/property container and retained the observed shared values. Font/Block Size 3…80 step 1, five blend choices, opacity/coverage and brightness/contrast ranges are bounded UI observations; contrast 70 and blur 0 were inherited session values, **not fresh defaults**. Randomize Characters appeared for Mixed/Block and was absent from the captured Braille property tree. DOM boxes may include hidden modal descendants. The 1109×720 Braille screenshot clips the toolbar/dock and does not prove numerical rendering, full-width layout or mobile behavior; never use it as an output oracle.

Canonical IDs are `characters`, `mixed`, `block-chars`, `braille`, `dots`, `cross`, `diamond`, `lines`, `diagonal`, `pixel`, `mosaic`, `lego`, `3d`, `disco`, `dither`. Display “Block” and “Voxel” do not create new `block`/`voxel` mode IDs. ASCII Studio and the remaining catalog modes stay separate umbrella work.

**Complete Characters controls are a separate bounded follow-on.** The current UI binds four parameters (`fontSize`, `charSet`, `brightness`, `contrast`) to a deliberately frozen complete context-v1 frame. Changing that context in place would break stored assumptions and the accepted ABI. This milestone retains that behavior and extracts only reusable static geometry/composition primitives. Family-specific controls are implemented here when their semantics are established. A future Characters-context extension must cover custom/preset ramps, mapping versus image inversion, density/coverage, threshold/edges, opacity/blends, adjustable backdrop, color and glyph effects with a new context capability. Do not advertise complete Characters parity now, and do not make all advanced controls a prerequisite for an independently testable Pixel/Braille renderer.

Initial readiness means a working documented profile, not complete reference-mode parity. Task 1 records all controls as implemented, fixed baseline, pending capture or pending later pipeline. Omitted enabled operations must cause an explicit capability error on import/binding. A mode whose default requires an unimplemented operation stays unavailable until that operation exists. Fixed inactive defaults may remain explicit profile constraints. Parameter and readiness evidence are separate fields in verification records.

Dependencies: **1 → 2 → 3 → 4** establishes transport; **1 → 5** establishes shared numerics. Tasks **6–13** consume 2–5 and their own closed evidence row; **14 → 15 → 16** owns Dither. **17** consumes 4 plus the first accepted family and preserves Characters; **18** enables each accepted family incrementally; **19** adds scheduling after 17–18; **20** closes integrated acceptance. Do not wait for all families to exercise the first real integrated path. Unresolved evidence for one family does not block independent families. Shared transport/controller files have one owner at a time.

## File ownership and shared interfaces

| Owner | Create / responsibility | Existing files changed only by this owner |
| --- | --- | --- |
| Evidence | `docs/research/ascii-magic/2026-10-20/initial-family-contracts.{md,json}`; original fixture descriptions | Verification ledger rows only |
| Style contracts | `src/render/style-contract.ts`, `style-wire.ts`, `catalog/family-schemas.ts`, `catalog/family-codecs.ts` and adjacent tests | `catalog/initial-schemas.ts`, `catalog/types.ts`, project/registry tests |
| Native dispatch | `rust/src/styles/{mod,contract,wire}.rs`, `rust/tests/style_abi.rs` | `rust/src/{lib,abi,session}.rs` |
| Service transport | `src/render/style-protocol.ts`, `style-service.test.ts`, `style-worker.test.ts`, `wasm-style.test.ts` | `protocol.ts`, `service.ts`, `worker-runtime.ts`, `wasm-character.ts` |
| Shared numerics | `rust/src/styles/{geometry,sampling,compose}.rs`, `rust/tests/style_geometry.rs` | Narrow pure-helper extraction from reference files; no profile behavior change |
| Family implementation | Named modules and native tests in Tasks 6–16; `tests/fixtures/render/styles/` owned fixtures | Only that family's codec/schema rows; native dispatch registration through its owner |
| Studio integration | `src/components/effects-studio/style-adapter.ts`, adjacent tests | `controller.ts`, `runtime.ts`, `viewport.tsx`, `export/still-image.ts` and affected tests |
| Controls/catalog | `src/components/effects-studio/parameter-control.tsx`, adjacent tests | `properties.tsx`, `catalog-data.ts`, `catalog.tsx`, `studio.tsx`, scoped CSS |
| Thumbnails | `src/render/thumbnail-scheduler.ts`, adjacent tests | Catalog/runtime integration through their owners |
| Acceptance | `tests/e2e/initial-renderer-families.spec.ts`, `docs/verification/initial-renderer-families.md` | Existing production-route regression tests and parity ledger |

New transport contracts are deliberately smaller than `RenderProjectV1`:

```ts
type InitialStyleId = 'mixed' | 'block-chars' | 'braille' | 'dots' | 'cross'
  | 'diamond' | 'lines' | 'diagonal' | 'pixel' | 'mosaic' | 'lego' | '3d' | 'disco' | 'dither';
type RgbaFrameV1 = { version: 1; width: number; height: number; rgba: Uint8Array };
type StyleSettingsV1 = {
  version: 1; styleId: InitialStyleId; frameWidth: number; frameHeight: number;
  renderScale: 1 | 2 | 3 | 4; crop: RenderProjectV1['crop'];
  rotation: RenderProjectV1['rotation']; seed: number; timeUs: number;
  parameters: ParameterMap;
};
type PreparedResources =
  | { kind: 'atlas'; generation: number; calibrationId: string }
  | { kind: 'none'; generation: number };
type StyleRenderRequest = RenderIdentity & { source: SourceRef; settings: StyleSettingsV1 };
type StyleRenderResult = RenderIdentity & {
  styleId: InitialStyleId; frame: RgbaFrameV1; backend: 'rust-cpu'; timings: RenderTimings;
};
```

`ParameterMap` is validated transport only. Each family codec owns exact typed key/enumeration/length validation in TS and Rust; no arbitrary recursive map reaches the numerical loop. `calibrationId` stays a string for compatibility: exactly `''` for atlas-free requests and an immutable matching ID for atlas-backed requests. Do not manufacture a dummy atlas to satisfy Characters validators.

Native API: `StyleJob::new(source: &SourceImage, settings: StyleSettings, atlas: Option<&ReferenceAtlas>, other_bytes: usize) -> Result<Self, RenderError>`; `step(&mut self, source: &SourceImage, atlas: Option<&ReferenceAtlas>, max_work: u32) -> Result<JobStatus, RenderError>`; `storage_bytes(&self) -> usize`; `estimated_peak_bytes(source: &SourceImage, settings: &StyleSettings, atlas: Option<&ReferenceAtlas>, other_bytes: usize) -> Result<usize, RenderError>`; `cancel(&mut self)`; `take_frame(&mut self) -> Option<StyleFrame>`. `StyleFrame` owns `width: u32`, `height: u32`, `rgba: Vec<u8>`. `StyleSettings` and its `StyleParameters` enum are owned by Task 2; typed variant fields are frozen by Task 1's family contract before implementation. No new dependency is needed for the binary protocol.

## Task 1: Close per-family evidence and algorithm-design contracts

**Files:** create `docs/research/ascii-magic/2026-10-20/initial-family-contracts.md` and `.json`; update relevant `docs/verification/reference-parity.md` rows. No production edits.

**Interfaces:** produces one version-1 contract row per canonical mode: `mode`, `dispatchId`, `resourceKind`, `controls`, `fixedContext`, `payloadFields`, `geometry`, `sampling`, `composition`, `characteristicFixtures`, `evidence`, `openGates`. Assign dispatch IDs **2–15** in `InitialStyleId` order above; existing Characters keeps **1**. `payloadFields` gives exact ordered primitive types, enum encodings, units, bounds, baseline values and evidence references. A row with open algorithm/required-default gates cannot be consumed by its implementation task.

- [ ] Read the bounded branch and UI descriptors for each mode as inert text; record source hash/ranges for sampling, glyph set or shape rule, floor/ceil, threshold, alpha, overlap/order, backdrop, shared controls and family controls. Separate baseline defaults from mode-switch resets and tile patches. Do not infer algorithm equivalence from a name.
- [ ] Capture the live reference UI where available using original synthetic uploads: default and changed controls, switch-away/back behavior, dark/light/transparent inputs, nondivisible dimensions and 1×/2× output where accessible. Record source dimensions, visible controls, app state, viewport/input class and screenshot provenance. Do not execute downloaded bundles. Inaccessible behavior remains unknown; write an explicitly independent mathematical contract and its difference instead of claiming a capture.
- [ ] Freeze each implementable row's exact payload and fixture expectations. For each control, require both descriptor evidence and a traced numerical use. Unknown min/step/enum entries stay unknown until resolved; an independent local restriction is labeled as such. Required baseline algorithms unresolved after capture keep only that row unavailable.
- [ ] Review the JSON/Markdown together: all 15 named modes have a row including existing Characters; each enabled profile has enough equations/ordering/rounding and fixture values to implement without guessing; source code bodies are absent. Record unresolved gates at the end of this plan in the verification document as execution resolves them.

Known anchors to reuse: `fontSize` 3…80, step 1, baseline 11 (`ui-0306` and mode variants); RGB contrast −100…100 baseline 20 is distinct from Dither contrast 0…200 baseline 110; `mosaicShape` square/wide/tall (`ui-0436`); Voxel eight controls `ui-0437`…`ui-0443`, `ui-0513`; Disco uniformity 80, 0…100 step 1 (`ui-0444`). LEGO's minimum is dynamic/unknown in `ui-0449`; do not substitute 3 from another mode. `bgMode` has no complete enum in `ui-0477`. Dither UI algorithm options are complete in `ui-0001`, palette IDs in `ui-0002`, not palette RGB values.

## Task 2: Add strict style contracts and versioned packet fixtures

**Files:** create `src/render/{style-contract,style-wire}.ts`, their `.test.ts` files, `catalog/{family-schemas,family-codecs}.ts`, `rust/src/styles/{mod,contract,wire}.rs`; modify native module declarations and registry assembly. Create `tests/fixtures/render/styles/wire-v1.json`.

**Interfaces:** `validateStyleSettings(value: unknown, source: SourceRef): StyleSettingsV1`; `validateStyleFrame(value: unknown, settings: StyleSettingsV1): RgbaFrameV1`; `encodeStyleSettings(settings: StyleSettingsV1, atlas?: ReferenceCharacterAtlasV1): Uint8Array`; Rust `decode_style_settings(bytes: &[u8]) -> Result<StyleSettings, RenderError>`. Family schemas initially have `binding: null`, `ready: false`; existing Characters schema is unchanged.

- [ ] Write failing TS/native packet fixtures for one atlas-free and one atlas-backed closed contract, unknown mode/version/keys, NaN/Infinity, enum mismatch, payload length mismatch, nonzero reserved fields, malformed crop and frame overflow. Assert `3d`/`block-chars` canonical IDs, never display-name aliases.
- [ ] Run `npx vitest run src/render/style-contract.test.ts src/render/style-wire.test.ts` and `cargo test --manifest-path rust/Cargo.toml --offline styles::wire`; confirm missing API/assertion failures.
- [ ] Implement the strict validators and symmetric little-endian codec. Header is **112 bytes**: u32 fields at offsets 0 magic `0x31595453` (STY1), 4 version=1, 8 dispatchId, 12 payloadVersion=1, 16 width, 20 height, 24 scale, 28 rotation, 32 seed, 36 atlasCount; f64 at 40 timeUs, 48/56/64/72 crop x/y/width/height; u32 at 80 payloadBytes, 84 reserved=0; f64 at 88/96 atlas origin x/y; u32 at 104 literal-space-index-or-65535, 108 reserved=0. Atlas-free fields are count/origins=0 and space=65535. Payload order/types come only from the closed Task 1 row. Reject trailing bytes and checked-arithmetic overflow. Ramps remain in captured atlas dictionaries; palettes have an explicit checked count and packed RGBA entries in their family's payload.
- [ ] Rerun the two targeted commands to PASS. Compare both decoders against the same checked-in bytes, not separate encoders that could share different assumptions. Review the isolated change; leave readiness false.

## Task 3: Add native style jobs, capability discovery and bounded ownership

**Files:** modify `rust/src/{abi,session}.rs`, `rust/src/styles/mod.rs`; create `rust/tests/style_abi.rs` and style session tests.

**Interfaces:** add exports `render_style_profile_version() -> u32` (=1), `render_style_supported(dispatch_id: u32) -> u32` (0/1), `render_begin_style_v1(handle: u32, ptr: u32, len: u32) -> u32`; reuse `render_step`, `render_cancel`, `render_release` and frame accessors. Add session `begin_style_staged(&mut self, ptr: usize, len: usize) -> Result<u32, RenderError>`. Generic output header: four u32 values `[version=1,width,height,rgbaByteLength]`, followed by exactly width×height×4 bytes; no implicit glyph grid.

- [ ] Write red tests for missing capability, invalid staging ownership/span, unsupported dispatch, two-job limit, source replacement, atlas capture replacement, cancel/release/double-release, completed-output ownership and disposal. Include budget exactly sufficient versus one byte short using calculated allocations and actual vector capacities.
- [ ] Run `cargo test --manifest-path rust/Cargo.toml --offline --test style_abi`; observe missing API/behavior failures.
- [ ] Implement the new session job variant and shared lifecycle without changing old packet layouts. Keep same-source immutable captures and count unique retained calibration allocations once, including active captures. Never clone the full source for each job. Reserve future peak before scratch allocation; keep completed output until explicit release. Unsupported renderers report capability errors, not blank success. Use a test-only bounded fixture job until actual family modules are registered.
- [ ] Rerun native ABI/session tests and existing reference-context/session tests to PASS. Confirm all old capability values and outputs are unchanged. Review before transport integration.

## Task 4: Extend WASM, worker and service without requiring an atlas for pixels

**Files:** create `src/render/style-protocol.ts`, `style-service.test.ts`, `style-worker.test.ts`, `wasm-style.test.ts`; modify `protocol.ts`, `wasm-character.ts`, `worker-runtime.ts`, `service.ts`.

**Interfaces:** engine gains `styleProfileVersion: 1 | null`, `supportsStyle(dispatchId: number): boolean`, `beginStyle(settings: StyleSettingsV1): number`, `takeStyleFrame(jobId: number): RgbaFrameV1`. Service gains `renderStylePreview(request: StyleRenderRequest, signal?: AbortSignal, capturedAtlas?: ReferenceCharacterAtlasV1): Promise<StyleRenderResult>` and corresponding `renderStyleExport`; expose `styleProfileVersion` and `supportedStyleIds: readonly InitialStyleId[]`. Worker adds these request types, `styleResult` response and optional capability fields in `ready`. Old module discovery yields null/empty capabilities.

- [ ] Write failing protocol/worker/service tests for atlas-free mode with empty calibration ID, glyph mode requiring exact atlas, mismatched style result, old-module fallback, unsupported mode, latest-preview supersession and independent captured export. Specifically capture Characters export A, select raster B, upload glyph atlas C: export A retains its atlas and pixels while only current preview can paint.
- [ ] Run `npx vitest run src/render/style-service.test.ts src/render/style-worker.test.ts src/render/wasm-style.test.ts`; confirm RED.
- [ ] Implement additive request validation, retained captures, native dispatch and typed frame decoding. Reuse the existing input queue/source acknowledgements and macrotask yielding. Prevent speculative `setAtlas` for raster jobs. Preserve recoverable worker restart and re-upload ordering. Source replacement cancels old jobs; style/atlas changes do not cancel a same-source captured export.
- [ ] Build WASM and rerun the new tests plus `service-characters.test.ts`, `worker-runtime.test.ts`, `wasm-character.test.ts`, `worker-macrotask.test.ts` to PASS. Test both new and old capability sets. No successful-render fixture may silently fall back to a JS numerical renderer.

## Task 5: Establish shared geometry, source sampling and complete composition

**Files:** create `rust/src/styles/{geometry,sampling,compose}.rs`, `rust/tests/style_geometry.rs`; narrowly extract reusable pure helpers from reference modules only with unchanged regression fixtures.

**Interfaces:** `FrameGeometry::new(source: &SourceImage, settings: &StyleSettings) -> Result<Self, RenderError>`; `FrameComposer` implements the shared job method set above for a supplied RGBA layer and the Task 1 fixed backdrop profile. Family jobs own their grid/sampling decisions; shared geometry never forces Characters floor rounding onto other styles.

- [ ] Write red fixtures for a **17×13** RGBA source, identity and 90° crop rotation, transparent saturated borders, fully transparent/opaque images, output smaller than a cell and scales 1/2. At unchanged logical cell size, 2× export doubles frame dimensions while preserving normalized cell placement. Assert all frame pixels, including margins/partial cells, are initialized. Assert existing Characters fixture bytes remain unchanged.
- [ ] Run `cargo test --manifest-path rust/Cargo.toml --offline --test style_geometry`; expect missing helpers/behavior.
- [ ] Implement alpha-safe sampling/composition from the closed contracts. Use explicit floor/ceil per mode. Reuse proven premultiplied interpolation and straight-alpha output boundaries; fixed blur remains the existing documented independent approximation unless new evidence explicitly changes a new profile. Pixel loops and blur passes are resumable with bounded work; no whole-frame allocation is hidden in `step`. Profile missing baseline composition remains unavailable.
- [ ] Rerun geometry/reference tests to PASS and measure calculated/native peak for the tiny fixtures and a **1000×1000** owned source. Keep limits unchanged; if admission is too conservative, optimize live buffer ownership and validate peaks before expanding any readiness claim.

## Family task pattern

Tasks 6–16 own their named modules, fixture files and exact family schema/codec rows. Each implements the shared `StyleJob` method set through its own named job type and typed `StyleParameters` variant. Its Task 1 row is a hard dependency for algorithms, numerical values and controls. Fixtures below are required characteristic assertions, supplemented by the exact numbers captured/designed in that row. A new output hash alone is never the test oracle.

Each task registers native support only after its native and wire tests pass. UI readiness waits for real production-route acceptance in Tasks 18/20. Keep per-family profile/unknowns visible in the verification ledger. Do not use the old general-purpose character matcher solely because it already has a similarly named option.

## Task 6: Mixed and Block character profiles

**Files:** create `rust/src/styles/{mixed,block_chars}.rs`, `rust/tests/style_text_variants.rs`, `tests/fixtures/render/styles/text-variants.json`; own `mixed`/`block-chars` schema and codec rows.

**Interfaces:** `MixedJob`, `BlockCharsJob`; variants `StyleParameters::Mixed` and `::BlockChars`. Atlas requirements and exact ramp/shape choice come from their closed rows.

- [ ] Write red tests that distinguish Mixed and Block from ordinary Characters using Task 1's exact dictionaries/selection rules on a grayscale ramp and quadrant/half-cell inputs. Assert declared symbol dictionary/order, selected indices or primitive occupancy, literal-space treatment, threshold boundaries and the documented ceil/floor rule. Equal-luminance different-shape inputs test whether the traced rule does or does not use shape; do not assume Mixed or Block implies shape-aware matching. Test every shipped family control at min/baseline/max and unsupported keys.
- [ ] Run `cargo test --manifest-path rust/Cargo.toml --offline --test style_text_variants`; observe RED.
- [ ] Implement the two bounded jobs and independent codecs. Calibrate actual Unicode ramps if glyph-backed; implement procedural blocks only if the contract establishes that representation. Preserve complete RGBA composition and seed stability.
- [ ] Rerun native text-variant and family wire tests to PASS; compare against unchanged Characters-context fixtures and review these two distinct outputs before registering support.

## Task 7: Spatial Braille

**Files:** create `rust/src/styles/braille.rs`, `rust/tests/style_braille.rs`, `tests/fixtures/render/styles/braille.json`; own Braille schema/codec.

**Interfaces:** `BrailleJob`, `StyleParameters::Braille`; internal `pack_braille(dots: [bool; 8]) -> u8`, with input in row-major 2×4 order.

- [ ] Write red single-dot tests: row-major inputs map to bit masks **[1,8,2,16,4,32,64,128]**, all off→0 and all on→255. Add two source cells with equal mean luminance but different dot locations and assert different packed patterns. Pin threshold/alpha sampling and partial cells to the closed contract; enumerate all 256 patterns without conflating U+2800 blank with an opaque filled cell.
- [ ] Run `cargo test --manifest-path rust/Cargo.toml --offline --test style_braille`; observe RED.
- [ ] Implement true 2×4 spatial sampling plus established glyph-mask or procedural-dot rasterization. Reuse legacy Braille only if the new characteristic tests prove compatible semantics. Preserve empty/transparent cells and full output margins.
- [ ] Rerun native Braille and wire tests to PASS; verify equal-scale preview/export pixels and release behavior before native registration.

## Task 8: Dots

**Files:** create `rust/src/styles/dots.rs`, `rust/tests/style_dots.rs`, `tests/fixtures/render/styles/dots.json`; own Dots schema/codec.

**Interfaces:** `DotsJob`, `StyleParameters::Dots`.

- [ ] Write red fixtures for a centered radial dot, axis symmetry at fixed cell geometry, established tone-to-size direction, transparent gaps and clipped boundary cells. Assert the documented source color/opacity behavior and fontSize `ui-0447` values rather than an arbitrary circle filter.
- [ ] Run `cargo test --manifest-path rust/Cargo.toml --offline --test style_dots`; observe RED.
- [ ] Implement independently authored circle coverage/sampling from the closed Dots contract with bounded per-cell work and scaled geometry.
- [ ] Rerun native Dots/wire tests to PASS and review min/baseline/max output; register native support.

## Task 9: Cross, Diamond, Lines and Diagonal

**Files:** create `rust/src/styles/geometric_marks.rs`, `rust/tests/style_geometric_marks.rs`, `tests/fixtures/render/styles/geometric-marks.json`; own four schema/codec rows.

**Interfaces:** `GeometricMarksJob`; typed `MarkKind::{Cross,Diamond,Lines,Diagonal}` within `StyleParameters::GeometricMarks`. Dispatch IDs remain distinct. This shared module implements genuine shape/ramp branches, not four labels on one result.

- [ ] Write red fixtures asserting cross-arm occupancy versus diagonals, diamond edge orientation versus axis edges, line orientation/spacing and diagonal sign/orientation from each closed row. If the reference uses glyph ramps, compare the declared glyph choices and synthetic atlas masks rather than pretending mathematical primitives are identical. Assert each pair differs on at least one characteristic source and test clipped/transparent cells.
- [ ] Run `cargo test --manifest-path rust/Cargo.toml --offline --test style_geometric_marks`; observe RED.
- [ ] Implement the independently specified marks, shared only where equations agree. Preserve per-mode atlas requirement, geometry and control visibility; randomization is deterministic only if included by the closed profile.
- [ ] Rerun the native/wire tests to PASS and review all four profiles individually before native registration.

## Task 10: Pixel and Mosaic

**Files:** create `rust/src/styles/{pixel,mosaic}.rs`, `rust/tests/style_pixel_mosaic.rs`, `tests/fixtures/render/styles/pixel-mosaic.json`; own two schema/codec rows.

**Interfaces:** `PixelJob`, `MosaicJob`; `StyleParameters::{Pixel,Mosaic}`. Both return atlas-free full RGBA.

- [ ] Write red solid-color and color-quadrant fixtures proving piecewise constant Pixel cells and Mosaic's distinct tile geometry/composition. Test square/wide/tall (`ui-0436`) with exact aspect/spacing derived in Task 1; assert complete partial edge cells for 17×13 source and transparent boundaries. A color-only change cannot satisfy the Mosaic geometry test.
- [ ] Run `cargo test --manifest-path rust/Cargo.toml --offline --test style_pixel_mosaic`; observe RED.
- [ ] Implement cell sampling and tile coverage in Rust; preserve fixed source-alpha/backdrop rules and exported geometry. No HTML/CSS tile renderer.
- [ ] Rerun native/wire tests to PASS and register each accepted implementation separately.

## Task 11: LEGO

**Files:** create `rust/src/styles/lego.rs`, `rust/tests/style_lego.rs`, `tests/fixtures/render/styles/lego.json`; own LEGO schema/codec.

**Interfaces:** `LegoJob`, `StyleParameters::Lego`.

- [ ] Write red tests for block base, stud placement/shape and highlight/shadow ordering on an otherwise flat-color source. Assert a stud-bearing cell differs structurally from Pixel/Mosaic, with clipped studs at edges and correct alpha/scale. Require the resolved dynamic lower bound from `ui-0449`; reject any smaller unsupported value before allocation.
- [ ] Run `cargo test --manifest-path rust/Cargo.toml --offline --test style_lego`; observe RED.
- [ ] Implement the closed independent LEGO geometry/shading contract with bounded work and no texture copied from reference artwork.
- [ ] Rerun native/wire tests to PASS; review baseline and smallest admitted block before support registration.

## Task 12: Voxel (`3d`)

**Files:** create `rust/src/styles/voxel.rs`, `rust/tests/style_voxel.rs`, `tests/fixtures/render/styles/voxel.json`; own `3d` schema/codec.

**Interfaces:** `VoxelJob`, `StyleParameters::Voxel`; canonical ID remains `3d`.

- [ ] Write red projected-cube fixtures with distinct top/light/dark faces, explicit overlap order and outline coverage. Test Flip Light swaps side lighting without moving geometry; horizontal/vertical spacing alter the corresponding projected centers. Pin `shape3dCellSize` **12, 4…60 step 1**, H/V spacing **100, 60…200 step 5**, top shade **135, 50…200 step 5**, light **100, 30…150 step 5**, dark **55, 20…150 step 5**, outline **0, 0…50 step 5**, flip **false**. Derived face equations/order still require the closed row.
- [ ] Run `cargo test --manifest-path rust/Cargo.toml --offline --test style_voxel`; observe RED.
- [ ] Implement rasterized faces and cooperative projection/composition in Rust. This is the observed 2D output contract; do not invent a WebGL scene or ML depth dependency.
- [ ] Rerun native/wire tests to PASS including clipped overlapping cubes and alpha; register native support.

## Task 13: Disco

**Files:** create `rust/src/styles/disco.rs`, `rust/tests/style_disco.rs`, `tests/fixtures/render/styles/disco.json`; own Disco schema/codec.

**Interfaces:** `DiscoJob`, `StyleParameters::Disco`.

- [ ] Write red fixtures that prove the closed Disco cell/facet geometry and `discoUniformity` behavior at **0/80/100**, preserving source-derived color and deterministic seed/time. Use structural assertions from the closed algorithm, not merely a saturation/glow hash. `lightsEnabled` baseline is false (`ui-0520`); enabling glares must be rejected until actual light behavior is implemented.
- [ ] Run `cargo test --manifest-path rust/Cargo.toml --offline --test style_disco`; observe RED.
- [ ] Implement the independently authored baseline Disco job. If glints are necessary even with lights disabled, include those traced baseline operations before registration; otherwise record glares as the later lights-pipeline dependency.
- [ ] Rerun native/wire tests to PASS and compare two seeds/times according to the closed profile's deterministic rules; register native support.

## Task 14: Dither palettes, preprocessing and Bayer family

**Files:** create `rust/src/styles/dither/{mod,palette,ordered}.rs`, `rust/tests/style_dither_ordered.rs`, `tests/fixtures/render/styles/dither-palettes.json`, `dither-ordered.json`; own Dither schema/codec foundation.

**Interfaces:** `DitherJob`, `StyleParameters::Dither`; `Palette::from_rgba(colors: &[[u8; 4]]) -> Result<Self, RenderError>`; `bayer_rank(size: u8, x: u32, y: u32) -> Result<u16, RenderError>`. Dither support remains unavailable until its baseline `floyd` algorithm passes Task 16.

- [ ] Write red tests for Bayer 2 matrix **[[0,2],[3,1]]**, rank permutations over 4²/8²/16² cells, periodicity and monotonic fill fractions. Pin palette RGB fixtures from traced literals; every named palette resolves to its exact fixture, never prose descriptions. Test original/custom palette behavior, zero-strength identity, straight alpha and preprocess contrast **110** with mathematical neutral **100** rather than Characters' scale.
- [ ] Run `cargo test --manifest-path rust/Cargo.toml --offline --test style_dither_ordered`; observe RED.
- [ ] Implement palette validation/nearest-color tie rule and ordered dithering from the closed contract. UI values: Pixel Size **2, 1…12**, strength **100, 0…100**, contrast **110, 0…200**, threshold **50, 0…100**, angle **0, 0…180** (`ui-0004`…`ui-0008`); steps are not captured declarations and need explicit UI-component evidence or a documented independent step. Chroma options are `standard/luminance/perChannel`. Preserve custom palette capacity validation at both boundaries.
- [ ] Rerun native/wire tests to PASS; review original/custom/transparent results and palette provenance. Keep Dither catalog readiness false.

## Task 15: Dither clustered, directional, noise and matrix phase

**Files:** create `rust/src/styles/dither/{patterns,noise}.rs`, `rust/tests/style_dither_patterns.rs`, `tests/fixtures/render/styles/dither-patterns.json`; extend Dither's typed algorithm/animation codec.

**Interfaces:** `pattern_threshold(kind: PatternKind, x: u32, y: u32, settings: &DitherSettings) -> f64`; `PatternKind::{Halftone,Radial,LinesH,LinesV,LinesD,WhiteNoise,BlueNoise}`. `DitherSettings` is the typed payload frozen in Tasks 1/2.

- [ ] Write red tests for clustered occupancy, radial symmetry, horizontal/vertical/diagonal periodic orientation and deterministic white-noise coordinates. Blue noise requires a separately authored/generated deterministic tile with measured low-frequency suppression against the white-noise fixture; a renamed PRNG fails acceptance. Assert fixed `(seed,timeUs)` repeats exactly and animated phase changes by the closed direction/speed rule independent of job chunk size.
- [ ] Run `cargo test --manifest-path rust/Cargo.toml --offline --test style_dither_patterns`; observe RED.
- [ ] Implement independently authored patterns/noise and integer-timestamp phase. Preserve Dither algorithm IDs and eight direction IDs from `ui-0475`; speed **4, 1…4** (`ui-0476`). Missing offset/cell-size control bounds remain fixed documented context until resolved. Shimmer requires explicit deterministic semantics before accepting `true`.
- [ ] Rerun native/wire tests to PASS; record spectral metric methodology and temporal differences. Matrix animation is numerical capability, not a claim of video-export or playback UI completion.

## Task 16: Dither diffusion and complete initial Dither binding

**Files:** create `rust/src/styles/dither/diffusion.rs`, `rust/tests/style_dither_diffusion.rs`, `tests/fixtures/render/styles/dither-diffusion.json`; inspect `rust/src/dither.rs` for narrowly reusable legacy Floyd diffusion without changing old semantics.

**Interfaces:** typed `DiffusionKind::{Floyd,Atkinson,Stucki,SierraLite}` inside Dither settings; `DiffusionState` retains only required error rows and cursor across `step` calls.

- [ ] Write red impulse tests for exact neighbor weights, border clipping and traversal order from the closed contract; distinguish all four kernels. Include a tiny grayscale ramp with hand-calculated output, palette diffusion, transparent-pixel policy and each chroma mode. Run the same fixture with work budgets 1/7/4096 and assert identical bytes; cancel mid-row releases all error buffers.
- [ ] Run `cargo test --manifest-path rust/Cargo.toml --offline --test style_dither_diffusion`; observe RED.
- [ ] Implement the four kernels with bounded rolling buffers, correct error precision and source-alpha treatment. Default algorithm is `floyd`; all fifteen algorithm IDs must now resolve to their actual implementation. Do not advertise the baseline Dither mode while substituting Bayer for Floyd.
- [ ] Rerun all three Dither native suites and Dither wire fixtures to PASS. Validate exact known palettes and supported custom/original cases; register Dither native support and document error-diffusion temporal tradeoffs without claiming stable motion for changing sources.

## Task 17: Generalize canonical controller, runtime and captured export

**Files:** create `src/components/effects-studio/style-adapter.ts` and `.test.ts`, `controller-styles.test.ts`, `runtime-styles.test.ts`; modify `controller.ts`, `runtime.ts`, `viewport.tsx`, `src/render/export/still-image.ts` and affected tests.

**Interfaces:** controller adds `selectStyle(id: string): boolean`. Renderer adapters become `prepare(request: StudioRequest, signal: AbortSignal): Promise<PreparedResources>`, `isCurrentResources(resources: PreparedResources): boolean`, `preview(request: StudioRequest & { resources: PreparedResources }, signal: AbortSignal): Promise<PaintedIdentity>`. `PaintedIdentity` gains `styleId: string`; empty calibration ID is valid only for `kind:'none'`. `bindStyleProject(project: RenderProjectV1, scale: 1|2|3|4): StyleSettingsV1` rejects unsupported active operations. `AcceptedStudioFrame` and `CapturedStill.frame` consume `RgbaFrameV1` structurally; Characters frames remain compatible supersets.

- [ ] Write red controller tests for Characters→Pixel→Braille→undo→redo with unchanged source, incremented revision and complete look restoration; same-style no-op; unavailable-style rejection; grouped edit then switch creates separate history entries; native text undo remains native. Assert no pixels/atlases/workers in snapshots/history.
- [ ] Write red runtime/export tests for captured Characters export surviving Pixel then a new atlas, captured raster export surviving a glyph selection, new-source cancellation, source rollback, stale result style/resource identity, worker retry and StrictMode retirement. Admit encoder scratch plus retained frames/source/atlas/captures under the existing 256 MiB policy; budget failure preserves the last accepted frame and exportability.
- [ ] Run `npx vitest run src/components/effects-studio/controller-styles.test.ts src/components/effects-studio/runtime-styles.test.ts src/components/effects-studio/style-adapter.test.ts`; observe RED.
- [ ] Implement atomic selection using schema defaults plus validated retained common keys and explicit target patches. Task 1's captured switch policy governs proven behavior; otherwise document the independent policy: preserve shared keys only when both schemas accept identical meaning/range, initialize target-only keys from versioned defaults, never copy keys merely because labels match. Effects/masks/text are preserved in project validation and rejected by binding when unsupported, never dropped by selection. No hidden per-mode history store.
- [ ] Replace atlas-only preparation assumptions with the discriminant; use existing Characters adapter unchanged for `characters`, new style service for accepted families. Capture resource handles and output leases independently of preview selection. Paint full RGBA after all identities match; encode from the captured output, retaining its lease through noncancellable encoding even after cancellation/disposal.
- [ ] Rerun new tests plus existing controller/runtime/lifecycle/source-transaction/still-image suites to PASS. Confirm 50-entry history, source replacement reset and export view independence remain unchanged.

## Task 18: Enable truthful family controls and catalog selection

**Files:** create `src/components/effects-studio/parameter-control.tsx`, `.test.tsx`, `properties-styles.test.tsx`; modify `properties.tsx`, `catalog-data.ts`, `catalog.tsx`, `studio.tsx`, scoped `studio.css` and existing tests.

**Interfaces:** `ParameterControl({ descriptor, value, onChange, onBeginEdit, onCommitEdit })`, with descriptor/value from the checked registry and callbacks to the canonical controller. Group/control ordering and labels use Task 1 records. Catalog availability is the intersection of a reviewed binding, runtime capability and supported profile; `ready` is not hardcoded from `id === 'characters'`.

- [ ] Read installed Next guides `node_modules/next/dist/docs/01-app/01-getting-started/{05-server-and-client-components,11-css}.md` before component integration. Keep browser resources in committed client effects and the existing thin `/app` server page; no new Next API or global stylesheet mechanism is required.
- [ ] Write red component tests for selecting each accepted mode, only applicable controls, range/select/boolean/color/palette validation, grouped keyboard/pointer edits and accessible error text. Unsupported controls are explained as unavailable instead of inert enabled sliders. Active group remains if valid, otherwise moves to the mode's primary group; phone/tablet sheets share identical project state and retain focus behavior.
- [ ] Run `npx vitest run src/components/effects-studio/parameter-control.test.tsx src/components/effects-studio/properties-styles.test.tsx src/components/effects-studio/catalog.test.tsx`; observe RED.
- [ ] Implement schema-driven supported controls and style selection. Preserve original catalog IDs/order/search/favorites; update availability summary from actual counts. Separate implemented-profile labels from complete-reference claims. For each mode, its first real production-route smoke test must render through built WASM before turning its schema binding/ready on.
- [ ] Rerun component tests and `npm run typecheck` to PASS; inspect 1440×900 and 1920×1080 plus coarse phone/tablet layouts. Preserve measured shell tokens and report unresolved control visibility/mobile evidence separately.

## Task 19: Bounded current-source thumbnails and hover previews

**Files:** create `src/render/thumbnail-scheduler.ts`, `.test.ts`, `rust/tests/style_thumbnails.rs`; modify catalog/runtime integration and native/session/worker/service adapters through their owners; add thumbnail cases to `runtime-styles.test.ts`.

**Interfaces:** `createThumbnailScheduler({ render, release, maxBytes })` returns `request(key: ThumbnailKey): Promise<RgbaFrameV1>`, `invalidate(sourceId: string, sourceRevision: number): void`, `dispose(): void`. `ThumbnailKey` contains source identity/revision, style ID, canonical parameter key, seed, timeUs, dimensions and resource identity. Cache at most **24** frames, **4 MiB** total (both limits enforced), longest side **192** pixels. Cache memory is included in the existing total budget. Add capability `render_thumbnail_profile_version() -> u32` (=1) and native `render_frame_thumbnail_v1(handle: u32, job: u32, max_side: u32) -> u32`; this admits a resumable thumbnail phase on an already-complete retained frame (success=1, error=0), rejects active/absent/released jobs, and returns the job to pending until existing `render_step` completes conversion to generic RGBA wire format. Service `renderThumbnail(request: RenderIdentity & { source: SourceRef; profile: { kind: 'characters'; settings: ReferenceCharactersSettingsV1 } | { kind: 'style'; settings: StyleSettingsV1 }; maxSide: 192 }, signal?: AbortSignal, capturedAtlas?: ReferenceCharacterAtlasV1): Promise<RenderIdentity & { styleId: string; frame: RgbaFrameV1; timings: RenderTimings }>` uses its own message/result kind. Export messages cannot request thumbnail output.

- [ ] Write red tests for source/style invalidation, duplicate-key coalescing, LRU byte eviction, late completion disposal and main-preview/export priority. Rapid hover never changes project/history or accepted main-stage identity. No thumbnail work starts while a higher-priority render is queued; a user preview cancels/supersedes thumbnail work at the next cooperative yield.
- [ ] Run `npx vitest run src/render/thumbnail-scheduler.test.ts`; observe RED.
- [ ] Implement idle thumbnail jobs through the same accounted session: render the immutable profile at source scale 1, then downsample the **finished** frame in Rust with alpha-safe area averaging. Let `q=min(1,192/max(width,height))`; thumbnail dimensions are `max(1,round(width*q))` and `max(1,round(height*q))`. This preserves the look's original cell layout and requires no new source/render-scale semantics. Before allocating, reserve the existing full output plus thumbnail scratch/output; replace/release the full retained output only after successful conversion. Test all-transparent borders and exact constant-color preservation in `style_thumbnails`. Initially this deliberately costs a full render; it runs only when idle, remains cooperatively cancellable, and makes no thumbnail-latency claim. No second worker/session is created. Record measured peak before enabling the queue.
- [ ] Rerun scheduler/runtime tests to PASS, then exercise real current-source thumbnail/hover in `/app`. Restore the selected preview when hover ends without a project edit; a late hover result cannot replace a newer selected-source result.

## Task 20: Real integrated family acceptance and honest parity ledger

**Files:** create `tests/e2e/initial-renderer-families.spec.ts`, `docs/verification/initial-renderer-families.md`; update `docs/verification/reference-parity.md` and affected production-route regression tests. Own generated original fixture images under `tests/fixtures/render/styles/` with provenance.

**Interfaces:** existing real `/app` controller/runtime, actual built Worker/WASM artifacts and downloaded PNG/JPEG readback. The source requests a module worker, but the accepted webpack build emits the tested classic worker artifact; verification must exercise that actual artifact and must not claim emitted ESM. Existing read-only bounded diagnostics may expose accepted style/resource identities; never add a test-only render path.

- [ ] Write failing browser tests selecting every accepted canonical family on original **17×13**, portrait, transparency, diagonal-edge, flat-color and grayscale-ramp sources. Assert the characteristic output property recorded by each native fixture and a changed control's actual pixels, not only labels/revision numbers. Test Characters regression, undo/redo across families, rapid style/upload races and route unmount/remount.
- [ ] Run the new spec against the production build and observe missing behavior before enabling the family under test. Integrate incrementally as Tasks 6–18 pass.
- [ ] Verify real PNG/JPEG signatures, dimensions, PNG alpha and explicit JPEG black matte; compare preview/export at equal source scale/seed/time, plus 2× normalized placement. Preserve nondivisible full frames and view-zoom independence. Test captured export during style/atlas changes, denied memory admission, font fallback and worker failure/retry.
- [ ] Run `npm run test:rust`, `npm run build:wasm`, targeted changed Vitest suites, `npm run typecheck`, scoped ESLint and `npm run build`; require PASS. Then run `ASCIIMORPH_E2E_PRODUCTION=1 npx playwright test tests/e2e/initial-renderer-families.spec.ts tests/e2e/effects-studio.spec.ts tests/e2e/render-service.spec.ts --project=desktop`. Use the repository's configured Firefox/WebKit/mobile projects for affected paths and explicit coarse-tablet/fine-narrow contexts; record actual runs rather than assuming a project name exists.
- [ ] Record browser/hardware/build/source sizes, cold/warm timing and peak ownership for Characters and each family. Measure 512×512, 1000×1000, 1920×1080, portrait and a 4K admission probe; rejected cases are measured limits, not successful 4K claims. Optimize buffer reuse/chunking if needed within current policy, then rerun only affected checks. Do not invent GPU timings or a p95 claim from a few samples.
- [ ] Complete per-family ledger rows with evidence status, controls/profile omissions, native/wire/browser results, screenshots, export checks and resource bounds. Human visual comparison is required before reference-output equivalence; static evidence plus independent fixtures only establishes an independently implemented profile. Review each bounded family and shared lifetime change before accepting this milestone. All other umbrella tasks remain open.

## Unresolved evidence gates at plan creation

| Gate | Required resolution / affected tasks |
| --- | --- |
| Mode initialization and visible controls | Baseline state is known; selector reset/retention, parent mounting, conditional sections and entitlement/mobile visibility are not established. Task 1 captures them or explicitly documents independent policy; Tasks 17–18 do not claim exact interaction parity until closed. |
| Mixed/Block and geometric symbol semantics | Exact mode dictionaries, random/coverage rules, sample-to-symbol/shape mapping, glyph versus procedural rendering and alpha behavior need bounded branch analysis plus characteristic contracts. Blocks/geometric work cannot be satisfied by aliasing Characters. Tasks 6/9. |
| Braille | Existing legacy packing is not proof of the reference's sampling thresholds, dot sizing or blank-cell appearance. Preserve true bit layout while separately proving/rendering its profile. Task 7. |
| LEGO/Mosaic/Disco geometry | LEGO dynamic minimum, studs/shading; Mosaic aspect/gaps; Disco cell/facet/uniformity and disabled-light behavior require contracts. Named controls are insufficient. Tasks 10/11/13. |
| Voxel projection | Eight static controls and state reads are captured, but exact projection, overlap/culling, sample locations and scale need fixtures. Task 12. |
| Dither palette/custom and temporal semantics | Palette names do not establish colors; custom editing callback schema was skipped in the original evidence pass. Noise construction, traversal, chroma/alpha semantics, offsets/cell size and matrix/shimmer timing need independent explicit contracts. Tasks 14–16. |
| Common default context | `bgMode` enum and mode-specific backdrop/blur/grading paths need tracing. Required active defaults cannot be silently dropped; retain the existing Characters-v1 approximation and report its known limit. Tasks 1/5. |
| Resource/performance extent | Current session limits can reject large exports and concurrent captures. Measure real capacities and browser encoder allowance before widening availability; no silent budget or source-size change. Tasks 3/5/17/19/20. |

## Self-review and handoff

Self-reviewed against umbrella Task 3 and the approved spec: all fifteen named initial modes are accounted for, including the existing Characters profile; each new family has characteristic fixtures and a native job boundary; the shared ABI/service/controller/export/thumbnail ownership changes have explicit tests. Common static composition is a prerequisite, while full Characters controls and shared effects/lights/depth/animation UI remain tracked follow-ons rather than implied completion. Exact unknown algorithms/control ranges are explicit evidence/design gates, not invented verified values. Types and dispatch IDs are shared above; old Characters output is a structural RGBA superset and never relabeled as a generic glyph document. The five review-focus conditions map to tests in the named tasks.

The plan contains **20 independently reviewable tasks**. No production code, tests, git state or reference execution was changed while writing it. Continue under the existing approved execution method on `main` after the current shell review, beginning with Task 1 and the additive contract tests; no new user approval question is required.
