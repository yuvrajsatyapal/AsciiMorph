# AsciiMorph Rust rendering core implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a Rust-owned image/character pipeline behind a retained-source, persistent worker service, then extend the same contract to the approved complete style/effect/media inventory.

**Architecture:** Browser code decodes media and rasterizes browser fonts; Rust owns numeric conversion and matching. New `src/render/` contracts carry packed buffers, source revisions and bounded jobs, alongside the unchanged legacy converter until explicit migration gates pass. CPU WASM is the correctness baseline; a measured Rust GPU spike chooses the accelerated path before promising performance.

**Tech Stack:** Existing Rust 2021 `cdylib`/`rlib`, manual WASM ABI, TypeScript, module workers, Vitest, Playwright; wgpu dependency only at the capability spike after checking target/toolchain support.

**Spec:** `.planning/specs/ascii-magic-rebuild.md` (approved in chat 2026-10-20; its draft status is historical).

## Global constraints

- “The entire project is in scope. Milestones below are delivery order, not permission to omit later features.” This plan's first delivery is the numeric/character service, not product or renderer parity.
- “Images and video remain local for ordinary rendering.”
- “Source retention/serialization happens on save/export, not on every slider/frame.”
- “Transfer packed arrays instead of serializing full JS cell objects every frame.”
- “New previews supersede obsolete jobs; exports use independent bounded queues and report progress.”
- “Do not call a JS renderer the Rust engine.” Browser decoding, calibration and glue are explicitly browser-owned.
- No unlicensed shipped editor bundles/demo art enter production. Later user-supplied MIT animated-library code may inform or supply attributed ports after per-file provenance/NOTICE review; this does not license the private /app editor.
- Preserve existing dirty changes, `NumericEngine`, `convert`, `runConversion`, `Calibration`, `calibrate`, legacy WASM exports and saved document compatibility. New paths can supersede callers only after their tests pass. Never reset the tree or auto-stage unrelated changes.
- No production code, new tests, new measurements or benchmark reruns are part of writing this plan. Implementation follows its gate. No commits without reviewing exact staged paths/diff with the owner; replace routine commit steps with a reviewable checkpoint in this dirty tree.
- Read relevant installed `node_modules/next/dist/docs/` before any Next routing/config change. Engine-only modules do not require route edits.

## Review focus

1. Empty/duplicate/combining/emoji ramps and font fallback: reject unusable ramps without losing the last successful render; calibrate custom graphemes. Tests in Tasks 2 and 4.
2. Transparent colors, crop edges and rotated portraits: preserve alpha, correct geometry and independent mapping/output inversion. Tests in Tasks 3–4.
3. A canceled job inside a long WASM call: cooperative bounded steps must yield to the worker event loop; late output cannot repaint. Tests in Tasks 5–6.
4. Worker failure, memory growth and source replacement during export: recover with retained source identity and release resources without detached-array use. Tests in Tasks 5–7.
5. Preview/export equality and browser GPU loss: normalized settings/time/seed must agree within declared tolerance; unsupported acceleration reports its reason. Tests in Tasks 8–9.

## Existing source boundary (read before implementation)

`rust/src/lib.rs` currently exports `alloc`, `dealloc`, `sample_rgba` and `sobel`, with public `sample`/`gradients`; the current ABI caps input at 2048², sample output at 600×1200 and single allocations at 32,000,000 bytes. Preserve those limits/signatures for old callers. `src/converter/wasm.ts` exports `createWasmEngine(bytes: BufferSource): Promise<NumericEngine>` and `loadWasmEngine(): Promise<NumericEngine | null>`; `NumericEngine.sample(Pixels,width,height)` and `.gradients(Float32Array,width,height)` return `Float64Array`.

`src/converter/engine.ts` exports `convert(im,s,signal?,yieldRow?,calibration?,numeric?)`, `transformPixels`, `encodePixels`, `decodePixels`, `tone`, `luminance`, `gridDimensions`, `densityCharacter`; `convert` embeds a base64 source in each `AsciiDocument`. `runner.ts` creates/terminates one worker per conversion; its existing termination tests remain valid for this legacy API. `presets.ts` calibration sorts preset glyphs by coverage but skips custom sets. `src/core/document.ts` uses segmented graphemes, limits cells to 60,000, and has legacy `ConversionSource` with inline source bytes. No new preview should manufacture this object per frame.

## Planned file ownership

| Files | Responsibility |
| --- | --- |
| `src/render/character-contract.ts`, `protocol.ts` | Versioned settings, source/glyph/grid types and worker messages; no React dependencies |
| `src/render/glyph-calibration.ts` | Browser font masks, grapheme dictionary and bounded calibration cache |
| `rust/src/{character,source,color,glyph,dither,session,abi}.rs` | Validated numerical pipeline, resumable session and new ABI; lib.rs exposes modules and preserves old exports |
| `src/render/{wasm-character,worker-runtime,render.worker,service}.ts` | ABI glue, testable scheduler, actual worker bootstrap and client lifetime |
| `src/render/{legacy-adapter,character-paint}.ts` | Explicit document handoff and packed-grid painting |
| `src/render/*.test.ts`, `rust/tests/*.rs`, `tests/e2e/render-service.spec.ts` | Contract, numerical, lifecycle and browser acceptance |
| `scripts/benchmark-render.mjs`, `docs/verification/rust-render-baseline.md`, `docs/verification/rust-gpu-spike.md` | Measurements and backend decision |

Shared RenderProject/registry/UI work is owned by other subsystem plans. This plan exports `CharacterSettingsV1` and a worker service that their project adapter consumes; it does not invent a second project schema. Coordinate names before either side lands. Later task files below are engine-owned; the master plan owns delivery ordering.

## First delivery: executable tasks

### Task 1: Freeze packed contracts and failure semantics

**Files:** Create `src/render/character-contract.ts`, `src/render/protocol.ts`, `src/render/character-contract.test.ts`.

**Interfaces:**
- Produces `SourceRef = { id: string; revision: number; width: number; height: number }`; `SourceUpload = SourceRef & { rgba: Uint8ClampedArray }`. RGBA is decoded, EXIF-oriented sRGB with straight alpha; browser decoder handles profile/orientation before upload.
- Produces `GlyphCalibrationV1 = { version: 1; id: string; fontKey: string; cellWidth: number; cellHeight: number; glyphs: string[]; maskWidth: number; maskHeight: number; masks: Uint8Array; coverage: Float32Array; shapes: Float32Array }`. Masks are glyph-major alpha bytes, coverage is normalized to max measured coverage, shapes are nine absolute coverage values/glyph. Glyph strings remain a one-time dictionary and are never treated as Unicode scalar IDs.
- Produces `CharacterSettingsV1 = { version: 1; width: number; height: number; cellWidth: number; cellHeight: number; crop: { x: number; y: number; width: number; height: number }; rotation: 0|90|180|270; brightness: number; contrast: number; gamma: number; saturation: number; density: number; sharpness: number; edge: number; shapeAware: boolean; smartEdges: boolean; mappingInvert: boolean; outputInvert: boolean; mode: 'monochrome'|'grayscale'|'color'; fg: number; bg: number|null; mapping: 'glyph'|'braille'; dither: 'none'|'floyd-steinberg'; seed: number }`. Dimensions are resolved before submission; preserve-aspect belongs in the project adapter. Colors are numeric `0xRRGGBB`.
- Produces `PackedGlyphGrid = { version: 1; width: number; height: number; cellWidth: number; cellHeight: number; calibrationId: string; glyphIndices: Uint16Array; foreground: Uint8Array; background: Uint8Array; alpha: Float32Array }`. Foreground/background are RGBA, four bytes/cell; null background has alpha zero. Transparent cell uses reserved glyph index 65535; Braille uses index 0–255 interpreted as U+2800+index. Dictionary is separately looked up by calibrationId. All arrays have checked lengths.
- Produces validators `validateCharacterSettings(value: unknown): CharacterSettingsV1`, `validateSource(value: unknown, maxBytes: number): SourceUpload`, `validateGrid(grid: PackedGlyphGrid): void`. First delivery cells ≤60,000, source dimension ≤16,384 each, source RGBA ≤268,435,456 bytes, peak session budget supplied by init and default 268,435,456 bytes; reject before allocation if the estimated peak exceeds budget. These are conservative product limits pending Task 9 measurement, separate from unchanged legacy limits.

- [ ] Write tests `rejects_nonfinite_and_unknown_versions`, `rejects_short_rgba_and_over_budget_source`, `checks_packed_lengths_and_sentinel`, `rejects_cell_overflow`. Assert 60,001 cells fail, 60,000 pass if other limits fit; NaN gamma fails; alpha arrays must equal cell count; unknown settings fields are rejected rather than silently applied.
- [ ] Run `npx vitest run src/render/character-contract.test.ts`; expect missing-module failure.
- [ ] Implement validators and TS types. Preserve legacy settings ranges for common numeric fields; new crop follows current normalized bounds, width/height must be positive integers and total ≤60,000. Seed must be an unsigned 32-bit integer. Calibration has 2–256 unique printable graphemes, ≤64 UTF-16 units each, input string ≤512 UTF-16 units for legacy handoff.
- [ ] Run the same command; expect all cases pass. Inspect diff for ownership and stage nothing automatically.

### Task 2: Calibrate every real browser glyph once

**Files:** Create `src/render/glyph-calibration.ts`, `src/render/glyph-calibration.test.ts`; add browser calibration assertions to `tests/e2e/render-service.spec.ts` in Task 8. Do not change existing `calibrate`.

**Interfaces:** Consumes Task 1 glyph type. Produces `calibrateGlyphs(input: { fontFamily: string; fontSize: number; cellWidth: number; cellHeight: number; ramp: string; fontRevision: string }, signal?: AbortSignal): Promise<GlyphCalibrationV1>` and `clearGlyphCalibrationCache(): void`.

- [ ] Write failing tests `custom_graphemes_get_masks`, `font_geometry_invalidates_cache`, `duplicate_graphemes_are_deduplicated_stably`, `rejects_empty_and_single_unique_ramp`, `aborted_calibration_is_not_cached`. Use mocked alpha masks for unit arithmetic; assert an `'e\u0301'` grapheme and emoji survive as whole dictionary entries, cache hits for identical inputs, misses when cell/font/revision changes, and zero masks never produce NaN.
- [ ] Run `npx vitest run src/render/glyph-calibration.test.ts`; expect missing function/module.
- [ ] Implement browser segmentation via existing `graphemes`, await `document.fonts.load`, rasterize actual masks at cell geometry, sort by measured coverage with stable input order for ties, compute 3×3 shapes and coverage from alpha, keep a 16-entry LRU. Cache key includes all input fields and resulting glyph dictionary. Unsupported font/canvas rejects visibly; do not invent measurements.
- [ ] Run targeted tests; expect PASS. Task 8 establishes actual browser mask behavior because jsdom cannot prove glyph rasterization quality.

### Task 3: Rust source, tone and geometry pipeline

**Files:** Create `rust/src/source.rs`, `rust/src/color.rs`, `rust/src/character.rs`, `rust/tests/character_source.rs`; modify `rust/src/lib.rs` only to expose new modules.

**Interfaces:** Produces `SourceImage::new(width: u32,height: u32,rgba: Vec<u8>,budget: usize) -> Result<SourceImage,RenderError>`; `CharacterSettings` mirrors Task 1; `RenderError` enum contains `InvalidInput`, `UnsupportedVersion`, `BudgetExceeded`, `MissingSource`, `MissingCalibration`, `Cancelled`, `Disposed`. Produces `transform(source: &SourceImage, settings: &CharacterSettings) -> Result<SourceImage,RenderError>` and `tone(value: f64, brightness: f64, contrast: f64, gamma: f64) -> f64`. Rust uses checked arithmetic, never trusts JS validation.

- [ ] Write failing tests `transparent_source_does_not_bleed`, `crop_then_rotate_matches_labeled_pixels`, `tone_extrema_and_gamma`, `rejects_bad_dimensions_and_peak_budget`. Synthetic 2×1 `[red alpha0, blue alpha255]` area-samples to blue/alpha0.5; a labeled 3×2 image cropped then rotated 90° has explicit expected row order; tone(127.5,0,0,1)=127.5; invalid gamma/nonfinite rejected by settings constructor.
- [ ] Run `cargo test --manifest-path rust/Cargo.toml --offline --test character_source`; expect missing module/signature failure.
- [ ] Implement straight-alpha source retention, alpha-weighted area sampling using existing arithmetic, crop-before-rotation matching `transformPixels`, RGB/tone and Sobel/sharpen numeric stages. Retain f64 intermediate arithmetic then explicit f32 boundaries corresponding to legacy arrays for compatibility fixtures. Estimate original/transformed/intermediate/output allocations together before allocation; never copy a full transformed image when identity geometry can borrow the source.
- [ ] Run that test and `npm run test:rust`; expect new tests and existing two unit tests pass. No old ABI limits change.

### Task 4: Rust matching, diffusion and real Braille

**Files:** Create `rust/src/glyph.rs`, `rust/src/dither.rs`, `rust/tests/character_matching.rs`; extend `rust/src/character.rs`.

**Interfaces:** Consumes Task 3 source/settings. Produces `GlyphCalibration::new(glyph_count: u16, mask_width: u16, mask_height: u16, masks: Vec<u8>, coverage: Vec<f32>, shapes: Vec<f32>) -> Result<GlyphCalibration,RenderError>` and Rust `GlyphGrid` matching packed Task 1 arrays. Browser owns strings; Rust only sees indices/masks. Produces `CharacterJob::new(source: &SourceImage, settings: CharacterSettings, calibration: Option<&GlyphCalibration>) -> Result<CharacterJob,RenderError>`, `step(&mut self, source: &SourceImage, calibration: Option<&GlyphCalibration>, max_work: u32) -> Result<JobStatus,RenderError>`, `take_grid(&mut self) -> Option<GlyphGrid>`; `JobStatus = Pending | Complete | Cancelled`. Work means bounded inner-loop operations, not an unbounded full row.

- [ ] Write tests `coverage_order_is_measured_not_character_order`, `shape_error_selects_matching_orientation`, `tie_uses_stable_first_index`, `braille_all_eight_dot_positions`, `diffusion_crosses_step_boundaries`, `mapping_and_output_invert_are_independent`, `transparent_cell_is_sentinel`. Eight separate 2×4 fixtures must produce U+2801,2802,2804,2840,2808,2810,2820,2880 in row-major sample order. Shape score matches current MSE/9 + coverage-distance×0.3 for compatibility profile. Step budgets 1 and 4096 must produce identical packed output.
- [ ] Run `cargo test --manifest-path rust/Cargo.toml --offline --test character_matching`; expect missing job/matching API.
- [ ] Implement Rust tone→sharpen/edge→density→matching/diffusion→packed output, alpha-weighted cell color and actual 2×4 Braille. Glyph mapping inversion changes matching luminance; output inversion changes finished foreground/background RGB with alpha unchanged. Maintain diffusion/error buffers across steps. Include edge-oriented `| / - \\` in calibration dictionary when smartEdges is enabled, or reject settings if unavailable; never emit indices absent from dictionary.
- [ ] Run Task 3–4 tests and all Rust tests; expect PASS. Review photographed visual improvement later against fixed fixtures; numerical equality alone is not quality parity.

### Task 5: Versioned WASM session ABI with reusable ownership

**Files:** Create `rust/src/session.rs`, `rust/src/abi.rs`, `rust/tests/character_session.rs`, `src/render/wasm-character.ts`, `src/render/wasm-character.test.ts`; expose modules in `lib.rs`. Modify `scripts/build-wasm.mjs` only if generated output needs validation; do not replace legacy build artifact naming.

**Interfaces:** Produce `createCharacterEngine(bytes: BufferSource): Promise<CharacterEngine>` with methods `setSource(source: SourceUpload): void`, `setCalibration(calibration: GlyphCalibrationV1): void`, `begin(settings: CharacterSettingsV1): number`, `step(jobId: number,maxWork: number): 'pending'|'complete'|'cancelled'`, `takeGrid(jobId: number): PackedGlyphGrid`, `cancel(jobId: number): void`, `dispose(): void`. Source/calibration transfer into WASM once per changed revision/id. Grid arrays are copied out once per completed result, never aliasing growable WASM memory.

ABI v1 exports `render_abi_version()->u32`, `render_create(budget:u32)->u32`, `render_drop(handle:u32)->u32`, `render_upload(handle:u32,kind:u32,ptr:u32,len:u32)->u32`, `render_begin(handle:u32,ptr:u32,len:u32)->u32`, `render_step(handle:u32,job:u32,max_work:u32)->u32`, `render_cancel(handle:u32,job:u32)->u32`, `render_output_ptr(handle:u32,job:u32)->u32`, `render_output_len(handle:u32,job:u32)->u32`, `render_error(handle:u32)->u32`. Retain existing alloc/dealloc for staging. Status codes: error0, pending1, complete2, cancelled3. Handles/job IDs start at1; stale IDs reject. Only existing valid alloc spans are passed into unsafe upload/begin calls; JS wrapper verifies offsets/length and Rust validates decoded content. New safe internal session APIs never take caller pointers.

Upload binary layouts: little-endian u32 header `[version,kind,width,height,count,maskWidth,maskHeight,reserved]` then packed payload. kind1 source payload RGBA; kind2 calibration payload masks followed by coverage f32 then shapes f32 with explicit 4-byte alignment/padding. Source identity/dictionary remain wrapper metadata, not repeated numeric payload. Settings are a 160-byte block: eight u32 `[version,width,height,rotation,flags,mode,mapping,seed]` then sixteen f64 `[cellWidth,cellHeight,cropX,cropY,cropWidth,cropHeight,brightness,contrast,gamma,saturation,density,sharpness,edge,fg,bgOrMinus1,dither]`. Flags bits0–3 = shapeAware, smartEdges, mappingInvert, outputInvert. Modes0–2 mono/gray/color; mapping0glyph/1braille; dither0none/1FS. Output header eight u32 `[version,width,height,glyphIndexOffset,foregroundOffset,backgroundOffset,alphaOffset,totalBytes]`, typed arrays sized by cell count/aligned to their element size. Geometry/calibration metadata stays in wrapper. Document these layouts alongside wrapper constants; tests encode bytes independently.

- [ ] Write failing ABI/session tests `stale_handles_reject`, `growth_does_not_detach_returned_grid`, `retains_source_until_revision_changes`, `budget_rejection_preserves_previous_source`, `dispose_is_idempotent`, `cancel_releases_job_scratch`. Track source upload count: 100 settings renders use one source/calibration upload. Invalid version, bad offsets, unknown flags, NaN and overflow fail before numerical execution. Preserve memory of last source when replacement allocation fails.
- [ ] Run `cargo test --manifest-path rust/Cargo.toml --offline --test character_session` and `npx vitest run src/render/wasm-character.test.ts`; expect new ABI missing.
- [ ] Implement safe session state and manual ABI. Use a per-session arena with explicit active job ownership and allocation accounting; reborrow memory views after any alloc/grow. Decode byte blocks explicitly without casting unaligned pointers. Reject render before source; Braille may omit calibration; every other mapping requires it. `takeGrid` releases job-owned output after one copy. `drop` frees all retained memory.
- [ ] Run `npm run build:wasm`, `npm run test:rust`, then `npx vitest run src/render/wasm-character.test.ts src/converter/wasm.test.ts`; expect PASS including all legacy export tests.

### Task 6: Persistent worker scheduler, cancellation and backpressure

**Files:** Create `src/render/worker-runtime.ts`, `src/render/render.worker.ts`, `src/render/service.ts`, `src/render/service.test.ts`, `src/render/worker-runtime.test.ts`; extend `protocol.ts`.

**Interfaces:** Consumes Task 5 engine. Produces messages with common `{version:1, requestId:string}` and discriminants `initialize`, `setSource`, `setCalibration`, `renderPreview`, `renderExport`, `cancel`, `dispose`. initialize carries memoryBudgetBytes; setSource carries SourceUpload; setCalibration carries GlyphCalibrationV1. render carries `{jobId:string, revision:number, sourceId:string, sourceRevision:number, calibrationId:string, settings:CharacterSettingsV1,timeUs:number}`; export additionally carries output dimensions. Result discriminants `ready`, `accepted`, `progress`, `result`, `cancelled`, `error`, `disposed`; each echoes request/job/revision identities where applicable; result carries `grid`, `backend:'rust-cpu'`, and phase timings; error carries typed code plus recoverable boolean. Missing identity or mismatched source revision rejects, never silently renders another source.

Produces `createRenderService(options?: { memoryBudgetBytes?:number; workerFactory?:()=>Worker }): RenderService`; methods `initialize():Promise<void>`, `setSource(source:SourceUpload):Promise<void>`, `setCalibration(calibration:GlyphCalibrationV1):Promise<void>`, `renderPreview(request:RenderRequest, signal?:AbortSignal):Promise<RenderResult>`, `renderExport(request:RenderRequest,signal?:AbortSignal):Promise<RenderResult>`, `dispose():Promise<void>`. RenderRequest is the render-message fields without version/requestId; RenderResult echoes jobId/revision and carries PackedGlyphGrid/backend/timings. No silent JS fallback for the new service: unavailable WASM returns a visible capability error; legacy fallback remains unchanged.

- [ ] Write tests `one_worker_and_initialization_for_100_renders`, `preview_supersedes_active_and_pending`, `cancel_processed_between_wasm_steps`, `late_result_is_ignored`, `export_queue_is_bounded`, `source_change_cancels_stale_jobs`, `worker_failure_rejects_all_waiters`, `dispose_cleans_listeners_and_terminates_once`. Fake engine completes in multiple steps; enqueue cancellation from a timer and assert it is observed before the final step. Export queue allows one active/one pending and rejects a third with Busy. Dispose rejects requests with Disposed and discards late messages.
- [ ] Run `npx vitest run src/render/service.test.ts src/render/worker-runtime.test.ts`; expect missing service/runtime.
- [ ] Implement newest-preview scheduling with at most one queued preview, one active WASM job, one pending export; export and preview keep separate logical queues, alternate work slices so exports do not freeze preview. Call `step(...,4096)` then yield via worker `setTimeout(0)`; measure slices in Task 9 before increasing work. No SharedArrayBuffer/headers required. Source replacement cancels jobs referencing prior source. Service owns a retained recovery copy outside transferred buffers; wrapper/worker owns the transfer copy. On worker error expose recoverable state; caller retry recreates worker and reuploads retained source/calibration, no automatic infinite retry.
- [ ] Run tests; expect PASS. Transfer actual grid ArrayBuffers in result transfer list; close/release discarded future image resources. Do not terminate worker on ordinary cancellation.

### Task 7: Explicit legacy document materialization and packed painting

**Files:** Create `src/render/legacy-adapter.ts`, `src/render/legacy-adapter.test.ts`, `src/render/character-paint.ts`, `src/render/character-paint.test.ts`. Existing converter code remains untouched at this checkpoint.

**Interfaces:** `legacySettingsToCharacter(settings:ConversionSettings,source:SourceRef):CharacterSettingsV1`; `gridToDocument(grid:PackedGlyphGrid,calibration:GlyphCalibrationV1|undefined,name:string):AsciiDocument`; `attachLegacySource(doc:AsciiDocument,source:Pixels,settings:ConversionSettings):AsciiDocument`; `paintCharacterGrid(ctx:CanvasRenderingContext2D,grid:PackedGlyphGrid,calibration:GlyphCalibrationV1|undefined,scale:number):void`. Browser glyph masks compose once per glyph; no per-cell canvas allocation. Braille uses a generated calibrated U+2800–28FF dictionary for paint, while numeric Rust still outputs dot masks.

- [ ] Write tests `materializes_same_cells_as_legacy`, `preview_never_encodes_source`, `attach_source_only_on_explicit_handoff`, `braille_packing_survives_text_export`, `legacy_settings_keep_mapping_invert_only`, `paint_reuses_glyph_surfaces`. Compare cells/grid geometry against `convert` on deterministic 17×13 data and existing alpha/rotation/gamma/dither fixtures. Spy on encode/base64: zero during renders; once during attach. `gridToDocument` leaves conversion undefined; attached document validates with current schema.
- [ ] Run `npx vitest run src/render/legacy-adapter.test.ts src/render/character-paint.test.ts`; expect missing functions.
- [ ] Implement adapters; use existing grid/aspect limits and document constructors, but only create JS cells when user explicitly requests the editor/text export. Keep legacy entry points and source base64 format unchanged. For numerical differences near mapping ties use explicit boundary fixtures and document selected result; never relax all assertions to hide a regression.
- [ ] Run new tests plus `npx vitest run src/converter/engine.test.ts src/converter/runner.test.ts src/converter/wasm.test.ts src/converter/transform.test.ts src/converter/use-converter.test.ts`; expect PASS. UI migration consumes new service in the shell plan after these contracts pass.

### Task 8: Real-browser integration and normalized preview/export

**Files:** Create/extend `tests/e2e/render-service.spec.ts`, `tests/fixtures/render/manifest.json`; create `src/render/export-equivalence.test.ts`. Fixture images must be owned/generated and identify license/source in manifest.

**Interfaces:** Consumes `RenderService`, paint adapter and the shell's actual integration harness. Produces acceptance evidence for the new core, not mode inventory parity. Tests must exercise a real module worker and compiled WASM, not a mocked worker in browser.

- [ ] Write failing tests `custom_unicode_uses_loaded_font`, `rapid_slider_changes_paint_latest_revision`, `preview_export_same_grid_at_equal_dimensions`, `zoom_does_not_change_grid`, `worker_restart_preserves_source`, `repeated_upload_cancel_dispose_does_not_accumulate`. For equal dimensions/settings/time/seed assert identical packed arrays; changed output dimensions compare normalized edge/alpha/tone metrics with tolerances recorded per fixture, not arbitrary global pixel equality. Browser numeric output identical across engines; glyph rasterization tolerances documented by browser/font.
- [ ] Run `npx playwright test tests/e2e/render-service.spec.ts --project=desktop`; expect missing integration/harness or assertion failures, never mark a skipped harness test passing.
- [ ] Wire the new service through the shell plan's testable render entry point; keep routes/font assets owned by that plan and coordinate any required edit. Assert actual real-font calibration with no missing-glyph image for supported test font characters; label OS-dependent unsupported emoji rather than assuming font availability.
- [ ] Run `npm run build:wasm`, new Vitest tests, and Playwright projects desktop/firefox/webkit. Record codec/GPU capabilities separately; CPU WASM character tests must pass on all supported browsers. Use profile counts and worker/listener/source-resource instrumentation for leak acceptance; no assertion against unstable universal browser heap numbers.

### Task 9: Measured end-to-end baseline and Rust GPU decision gate

**Files:** Create `scripts/benchmark-render.mjs`, `docs/verification/rust-render-baseline.md`, `docs/verification/rust-gpu-spike.md`; spike isolated under `rust/gpu-spike/` with its own manifest/lockfile and `src/render/gpu-spike.ts`. Do not replace production backend at spike time.

**Interfaces:** Benchmark consumes real service/paint entry and records `{hardware,browser,build,sourceFixture,sourceSize,gridSize,coldWarm,sampleCount,p50,p95,inputToPaintMs,workerMs,uploadBytes,readbackBytes,calibrationMs,rustMs,paintMs,peakLiveBytes}`. Warm each case then collect ≥100 samples; record source-decode separately. Spike `probeRustGpu(canvas:HTMLCanvasElement):Promise<{supported:boolean; reason?:string; timings?:{uploadMs:number;computeMs:number;readbackMs:number;paintMs:number}; limits?:Record<string,number>}>` consumes packed grid/source and performs Rust-owned glyph batching plus one independently authored effect pass. Browser glue may provide surface; Rust creates GPU pipeline/commands.

- [ ] Write failing benchmark-schema tests in `src/render/benchmark-schema.test.ts`: rejects missing hardware/sample count/paint timing and nonfinite measurements. Write backend contract cases in `src/render/backend-contract.test.ts`: no GPU -> CPU with reason; texture limit -> CPU or explicit size error; device loss -> disposed GPU and reinitializable CPU; identical seed/settings/time -> stable output; compare bounded RGB error ≤2/255 and exact alpha for the initial non-font effect fixture.
- [ ] Run targeted Vitest; expect schema/probe missing. Implement data collection and a wgpu spike after checking installed Rust target and crate/browser feature compatibility. No toolchain upgrade or presumed WebGPU availability. Keep GPU crate acquisition scoped and record versions/toolchain. CPU-only baseline remains runnable without GPU dependencies.
- [ ] At implementation time only, measure 512²,1920×1080,portrait,4K source fixtures; 80/160/300 columns; 1280×720 and stacked effect preview, cold/warm. Report raw samples, sample count, device/browser, CPU/GPU command/readback/paint separately where timing extensions permit. Never reuse the historical 1.056× sampling-only result as end-to-end evidence.
- [ ] Gate decision: choose Rust wgpu only if feature/device-loss tests pass and measured common warm input-to-paint p95≤50ms at720p (heavy≤100ms), memory fits measured budget and supported browser coverage is explicit. If it fails, document CPU adaptive preview or measure a Rust-driven WebGL2 path before selecting it; do not silently delegate effects to a JS renderer. Declare 30fps720p motion unproven until media task tests it. Export dimensions remain original requested values; if budget exceeded, reject with actionable limit. Record an operational memory budget using measured worst-case live allocations and browser/device headroom, update Task1 defaults only through reviewed settings/version tests.
- [ ] Run `npm run test:rust`, `npm run build:wasm`, targeted new/legacy tests, `npm run typecheck`, `npm run lint`, `npm run build`, and browser integration suite after changes. Record outcomes and unresolved limits; review staged paths before any commit.

## Later required deliveries: map the complete approved engine scope

The first delivery must not advertise all styles/effects. The following tasks require separate detailed plans once their cited inventory/semantics gates resolve; they remain required work. No placeholder render IDs or generic repeated filters satisfy these rows.

### Task 10: Full dither, palette and character composition delivery

**Files:** Extend `rust/src/dither.rs`, create `rust/src/palette.rs`, `rust/tests/dither_patterns.rs`, `rust/src/composite.rs`, `rust/tests/composite.rs`; extend versioned renderer settings, not legacy defaults.

**Interfaces:** `quantize(image:&Image,palette:&[[u8;4]],method:&DitherMethod,seed:u32,time_us:u64)->Result<Image,RenderError>`; `DitherMethod` has Bayer2/4/8/16, clustered, radial, horizontal/vertical/diagonal, seeded white/blue noise, FS/Atkinson/Stucki/SierraLite. `compose_glyphs(grid:&GlyphGrid,atlas:&GlyphAtlas,options:&GlyphComposition)->Result<Image,RenderError>` owns opacity, blend operations, glyph glow/chromatic and measured backdrop behavior. Browser rasterizes glyph atlas; Rust composes it.

- [ ] Before coding, expand failing tests with explicit Bayer matrices, exact diffusion weight fixtures, deterministic seed/time, palette actual RGBA fixtures, alpha-safe blends and per-glyph-vs-whole-image chromatic distinction. Verify Bayer matrix order mathematically; obtain palette colors from observed/independently defined inventory, not contradictory labels.
- [ ] Run `cargo test --manifest-path rust/Cargo.toml --offline --test dither_patterns --test composite` red; implement each independently reviewable algorithm; rerun green and normalized preview/export tests. Dither phase must affect output at pinned timestamps without unseeded noise.

### Task 11: All style families with explicit canonical inventory

**Files:** Create `rust/src/styles/{mod,ascii,pixel,print,geometry,distort,blur,signal,light,glass,material}.rs`, `rust/tests/style_inventory.rs`, `tests/fixtures/render/styles/`; shared TS registry lives in registry plan.

**Interfaces:** `render_style(source:&Image,style:&ValidatedStyle,context:&FrameContext)->Result<Image,RenderError>`; `FrameContext` carries seed/time/output geometry/optional depth/capabilities. `ValidatedStyle` is generated/mapped from canonical registry; every ID has documented defaults/ranges and backend availability.

- [ ] First reconcile all 105 tiles/96 selectable mode IDs including cyanotype/hexhalftone/paperstock/oilpool/anodized against captures. Approve independent algorithms for still-unknown semantics; do not assert unknown reference equivalence.
- [ ] For each family create a separate red→green implementation task with pinned distinct output fixtures, effect of every exposed parameter, alpha behavior, same seed/time and preview/export tests; commands `cargo test --manifest-path rust/Cargo.toml --offline --test style_inventory <family>` and corresponding browser cases. Keep an acceptance row per mode/tile preset; a registration count without real renderer does not pass.

### Task 12: Ordered effects, grading, masks and text

**Files:** Create `rust/src/effects/{mod,color,convolution,signal,warp,reduction,grading}.rs`, `rust/src/{mask,text}.rs`, `rust/tests/{effect_order,masks,grading}.rs`.

**Interfaces:** `render_effects(image:Image,passes:&[ValidatedEffect],context:&FrameContext)->Result<Image,RenderError>` and `rasterize_mask(mask:&ValidatedMask,geometry:OutputGeometry)->Result<AlphaMask,RenderError>`. Text layout/glyph rasterization is browser-owned, packed atlas placement and composition Rust-owned. Typed registry values are validated again in Rust.

- [ ] Expand red fixtures proving noncommuting pass order, identity settings, premultiplied-alpha-safe blur, clipping/border policy, per-channel monotone curves, mask coordinates and text position scaling. Implement order: overlay/grayscale → blur → vignette/scanlines/bloom → chromatic/RGB/CRT/glitch/grain → pixelate/halftone → warps → reduction → dust/sharpen/noise → saturation/hue/levels/curves → text. Test every named effect in the approved spec individually; swapped ripple/zigzag recipe labels need explicit compatibility mapping.
- [ ] Run specific Rust integration test binaries red, implement one pass/family per reviewed task, rerun green plus backend agreement fixtures. Maintain GPU ping-pong textures and avoid intermediate CPU readback once accelerated path passes Task9.

### Task 13: Depth, lights, seeded motion and bounded media frames

**Files:** Create `src/render/depth-adapter.ts`, `src/render/frame-source.ts`, `rust/src/{depth,lighting,animation}.rs`, `rust/tests/motion_determinism.rs`, browser media tests.

**Interfaces:** `FrameContext` time is integer microseconds, seeded sampling is reproducible; depth is a typed single-channel field with dimensions/model identity; `setFrame(source:SourceRef,frame:VideoFrame,timestampUs:number):Promise<void>` is a versioned media extension, not reusing source identity without frame revision.

- [ ] Audit actual model license/size/runtime support before model acquisition, use honest unavailable state, then write red tests for missing depth, pinned depth/light fixtures, seek/end/fps mapping, bounded four-frame cache, frame close on cancel, latest-preview backpressure, and deterministic motion frame hashes at fixed timestamps.
- [ ] Implement model inference as a separate capability adapter; Rust owns field sampling/lights/animation math. Run Rust tests and real video browser tests red→green; measure30fps720p at specified hardware through decode→Rust→paint. Encoder/container/audio control belongs to export plan but consumes these exact processed frames, never renamed media.

### Task 14: Flow, export and MCP share one deterministic evaluator

**Files:** Create `rust/src/graph.rs`, `rust/tests/graph.rs`; adapters under `src/render/graph-adapter.ts`, `src/render/export-adapter.ts`; MCP server files named by backend plan.

**Interfaces:** `evaluate(graph:&ValidatedGraph,sources:&SourceStore,context:&FrameContext)->Result<RenderedFrame,RenderError>` delegates to same style/effect modules; compile the same crate natively for server adapter. `RenderedFrame` is packed glyphs or RGBA with output geometry, alpha, seed/time/backend metadata, not encoded media bytes.

- [ ] Write failing tests for cycle/type rejection, deterministic branch order, Studio↔representable Flow roundtrip, explicit nonrepresentable graph state, equal preview/export normalized frame, canceled export queue cleanup, native/WASM result agreement and malformed MCP inputs.
- [ ] Implement graph evaluator/adapters under later approved Flow/backend contracts, then run `cargo test --manifest-path rust/Cargo.toml --offline --test graph`, TS adapters and browser roundtrips red→green. Export plan owns PNG/JPEG/GIF/real MP4 muxing, bounds/audio/metadata; persistence plan owns source blobs/migrations. AI provider responses enter as new local sources through the same source contract; no provider call is part of this plan.

## Coverage and handoff

Tasks1–9 supply retained source/calibration, full numerical character conversion, packed output, resumable cancellation, explicit legacy handoff, CPU correctness and measured backend choice. Tasks10–14 map every later rendering family/effect/depth/media/Flow/server requirement from the approved spec. Studio UI/catalog/mobile measurements, non-studio website routes, recipes/persistence, real encoders, AI provider/auth/credits/pricing and service provisioning remain owned by their subsystem plans; this document does not claim they have shipped.

Self-review: every first-delivery type/function has an owning task; no pipeline stage calls a nonexistent earlier interface. New render service does not change per-conversion termination semantics of old runner tests. Font rasterization, source decode and final paint are explicitly measured browser work. No benchmark or production mutation was performed for this plan. Before implementation, review contract naming against master project/registry/UI plans, then receive the plan gate through the parent workflow.
