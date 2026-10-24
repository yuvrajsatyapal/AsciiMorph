# Rebuild checkpoint — 2026-10-21

User requested commit and push directly on main, with all subsequent work on main and no new branches.

This checkpoint fixes persistent-worker cancellation/fatal-failure recovery and repairs audio decoding/final-seek behavior. Both passed independent review. A subsequent independently reviewed checkpoint adds packed character painting and explicit legacy document handoff; its review accepted both spec compliance and code quality. Browser pixel parity remains pending. This is an in-progress rebuild: the reference production UI and complete feature parity remain unfinished.

Validation across the current working tree (including the uncommitted packed painter): the full JavaScript suite passes 308 tests (one skipped); all 41 Rust tests pass; production Next.js build including TypeScript passes. ESLint reports zero errors and three existing prototype warnings. Canvas composition unit checks do not establish browser pixel parity; actual browser fixtures and performance measurements remain scheduled.

Reference evidence includes 521 UI descriptor variants across 497 keys, 55 public route checks, desktop/mobile panel lifecycle evidence, and verified character contrast/geometry semantics. Thirteen actual public-site JPEG captures are retained with hashes and viewport metadata. Desktop rasters are right-clipped to 943×900 despite DOM viewport 1280×900; the narrow homepage is 390×844. These captures do not prove full-width pixel parity.

The next production integration needs coordinated geometry support: reference default cells are 6.6×11, outside the initial core envelope. Contrast baseline is 20 and neutral is 0; the core uses a different factor, requiring explicit adapter fixtures. The strict project contract plan records these blockers rather than silently clamping controls.

Raw downloaded reference HTML, raw REA diagnostic captures, local execution handoff files and generated local Next route import changes remain local. No downloaded proprietary editor implementation is included in production source. Full production acceptance remains tracked in reference-parity.md.

## Coordinated geometry follow-up

The new character contract now supports finite fractional cell dimensions1..512 across TypeScript/Rust/WASM. Calibration admission/cache/delivery ownership is byte-bounded; clearing does not discard active reservations. Tiny Braille bins remain finite, painter resources are released on eviction/failure, and incompatible legacy-editor geometry fails explicitly. Fresh independent review accepted the delivery with no actionable high/medium findings. Checks:144 scoped TypeScript tests,44 Rust tests, rebuiltWASM, typecheck and scopedESLint passed. No new full-build/browser-parity claim; actual browser font/output fixtures remain Task8. Independent project-format implementation is underway separately and is not included in this geometry checkpoint.

## Project format and check reliability follow-up

Strict project transport/schema/resource readiness passed independent review:70 contract tests plus26 legacy regressions; all six initial style schemas remain unavailable for rendering. Project JSON is detached, bounded by canonical serialized bytes and checked without invoking accessors. Settings, effect order, text, mask identities and export choices persist as typed data; no pixel renderer is fabricated by registering a schema.

The integration check replaces fixed-delay worker completion assertions with request-specific conditions and a controlled delayed-step regression. ESLint excludes only the ephemeral SDD task workspace. Fresh review accepted both changes. Full integration:404 JavaScript tests pass with1 skipped; lint has0 errors and3 existing prototype warnings; productionbuild includingTypeScript passes. The build preceded the test/config-only reliability fix; no production code changed in that fix. Rust remains44 passing tests at the accepted geometry checkpoint.

The next native Characters-profile task has started separately; its unfinished files are excluded from this checkpoint. All work remains onmain. Full UI/feature parity remains open.

## Characters worker integration — 2026-10-22

Native glyph contracts and measured browser atlases were independently reviewed and pushed as2379847/a52005a. The additive112-byte profile ABI now carries full-frame RGBA and optional packed glyph data through the real retained-source worker/service. Legacy160-byte settings and grid calls remain separate. Shared immutable masks avoid per-frame atlas copies; optional profile failures preserve a working legacy connection.

Fresh review found and verified fixes for caller mutation across asynchronous service initialization and recoverable worker-budget validation. Scoped re-review accepted both fixes with no open findings. Final integration:486 application tests pass with1 skipped; production Next build and TypeScript pass. Native72 tests and the rebuilt WASM passed before the TypeScript-only fixes; affected54 tests and scoped lint passed afterward.

The actual Chromium module-worker diagnostic improved from2407ms to30.9ms for the same owned512×512 source/160×90 Braille job, with all475 numeric steps and byte-identical worker/direct output. This is a local diagnostic, not a distribution, full UI latency or final backend-performance acceptance. Real-worker fractional-profile and equal-scale preview/export fixtures also pass.

The new profile currently renders the transparent glyph intermediate only. Rust None/Solid/Blur composition, explicit complete-context capability, project binding and the production `/app` Studio remain pending. Global atlas replacement still cancels dependent exports; that interaction must be resolved or visibly disclosed before Studio acceptance. Full-width reference screenshots at1440×900 and1920×1080 are now retained with actual JPEG dimensions/hashes; they improve reference evidence without proving our UI parity.

## Complete Rust Characters context — 2026-10-22

Rust now owns full-frame None/Solid/Blur backdrop generation and glyph composition. Alpha-weighted resizing, premultiplied three-pass blur, crop/rotation and partial margins have independent numerical fixtures. Admission reserves future scratch and serialization peaks across active jobs. A separate complete-context version distinguishes this renderer from the earlier glyph-only profile.

Fresh independent review accepted spec compliance and code quality with no actionable findings. Final checks:85 native tests,493 JavaScript tests with1 existing skip, rebuilt WASM, TypeScript, scoped ESLint and production Next build pass. Two Chromium tests exercise12 native-equivalent contexts and a measured-font1000×1000 real worker render. These establish implementation equivalence and smoke behavior, not reference pixel parity or p95 performance.

The exact four-control project adapter and production `/app` UI are next. Atlas replacement/export independence and all remaining website styles/features remain open; full website completion is not claimed.

## Exact Characters project binding — 2026-10-22

The four-control adapter now prepares the real Rust service payload with exact source/crop/rotation, render-scale geometry, measured font identity and complete-context checks. Only canonical Characters is bound, with final RGBA output. Unsupported effects (including disabled data), masks, text and Flow fail explicitly; generic project readiness remains partial preflight.

Fresh independent review passed spec and quality with no blocking findings. Verification:501 JavaScript tests pass with1 existing skip,85 native tests pass,3 real Chromium worker fixtures pass, and the final affected identity-reader46 tests plus adapter browser fixture pass after the narrow guard. TypeScript, scoped lint and production Next build pass. A minor report wording overclaim about a font-size pixel assertion was corrected to its actual geometry assertion.

Production `/app` controller/UI implementation follows this checkpoint. Full website parity, production interaction/visual acceptance, captured-export atlas independence and performance-distribution acceptance remain open.

## Studio controller — 2026-10-22

The pure production controller now owns validated Characters edits, separate monotonic request revisions, grouped current-source undo/redo, view-only zoom/panels/compare and captured asynchronous result guards. Source replacement preserves the old project/frame until success. Review found a failed-replacement preview recovery bug; four regressions and a scoped re-review verified the fix. Both spec and quality now pass with no open findings.

All36 focused controller tests, TypeScript, scoped lint and the final production build pass. Real decoding/upload rollback, React lifetimes, actual frame painting, encoding and the `/app` route are later shell tasks; injected state tests do not establish production browser acceptance. The separate final Characters integration review also accepted the combined renderer milestone without new actionable findings.

## Full-source loading and replacement — 2026-10-22

The new still decoder preserves original image dimensions, with signature checks, explicit source/pipeline limits and cleanup on cancellation or failure. A serialized source transaction uses explicit candidate acceptance and reset-before-restore rollback, including acknowledged-but-obsolete uploads and same-identity transport caching. The controller keeps the accepted project/frame until replacement succeeds. The original botanical and26 icons are copied with audited hash provenance.

Independent review found one disposal failure retaining committed pixels. The fix releases local backing even when external reset rejects, preserving the observable cleanup error; scoped re-review passed spec and quality with no open findings. Initial73 focused tests passed; after the fix,48 affected transaction/controller tests passed, with26 decoder tests unchanged. TypeScript, scoped lint and final production build pass.

The actual runtime bridge still must implement service reset/recreation and atlas-generation invalidation, account held frame bytes, and connect accepted Rust frames to React. Browser decoder/production-route acceptance remains pending. Captured atlas ownership is the next integration task before the real Studio lifecycle; full website parity remains open.

## Captured atlas ownership — 2026-10-23

Rust profile jobs now retain their own immutable calibration. Active and pending exports keep captured atlases while preview font/ramp edits use another; native capacity accounting deduplicates shared allocations and protects active future peaks. An optional retention capability distinguishes compatible modules. Legacy replacement and source cancellation remain explicit.

Independent review found a deduplicated mixed-path cancellation that reported cancellation without releasing a native handle. Physical cleanup and repeated real-WASM slot-reuse regressions fixed it; scoped re-review passed spec and quality with no open findings. Final validation:594 JavaScript tests pass with1 existing skip,89 native tests pass,4 Chromium fixtures pass, TypeScript/scoped lint pass and production build passes. The final compatibility fix additionally passes97 affected tests; native/WASM output is unchanged by that runtime-only fix.

The browser fixture uses a measured font and owned1000×1000 source. Active/pending captured exports and a changed-atlas preview match independent serialized runs exactly. This establishes renderer/service behavior, not production Studio painting, encoding, full reference pixels, GPU selection or p95 performance. The actual React runtime/Studio integration is next; full website parity remains open.

## Real Studio runtime — 2026-10-23

The runtime now connects source transactions, the measured Characters adapter and actual Rust service to controller-accepted frame publication. Atlas selection and request submission are ordered without serializing computation; tone edits reuse atlas snapshots. Explicit source recovery, service shutdown before transaction cleanup, and a retirement settlement barrier cover failed uploads and non-cancellable work across mounts. Captured output has one bounded lease, retained and counted until its caller releases it; the future encoder must release only after encoding settles.

Fresh independent review passed spec and quality with no actionable findings. All138 focused tests and the full619-test suite pass with1 existing skip; TypeScript, scoped lint and production build pass. Runtime-service tests use actual WASM and the service/protocol/source stack with transport/decoder/font boundaries replaced; they do not establish browser acceptance. SSR, StrictMode, accepted pixels, stale/export isolation and full-frame viewport painting have focused tests.

The production `/app` shell, PNG/JPEG encoding and real production-route browser/visual gate remain next. Those tasks complete the first functioning Studio milestone; all other required modes, effects, media, Flow, library and broader website services remain open beyond it.

## Production Studio shell — 23 October 2026

Actual `/app` now composes the accepted retained-source Rust/WASM runtime with the measured Studio interface, canonical 105-tile/96-mode catalog, real four-control Characters editing, upload/drop/clipboard files, history, comparison, view zoom/pan and accessible panels. Other renderers/services and export encoding remain explicitly unavailable at this checkpoint. Existing routes remain available; legacy global shortcuts/dialogs are suppressed only on `/app`.

Parent production-browser inspection found and verified a narrow trusted-default SVG decoding repair, then exercised real 1000×1000 Rust output and all four controls/undo. Desktop measurements at1440×900 and1920×1080 match the principal approved shell bounds. Captures, hashes, limitations and commands are recorded in [Studio verification](studio-shell.md).

Validation: implementer123 focused tests/typecheck/scoped lint passed; parent full JavaScript suite645 passed+1existing skip before the review fixes. Two review P2 issues (competing compact-sheet/dialog focus owners and coarse toolbar target specificity) were fixed with22 affected tests, typecheck/scoped lint, a fresh parent production build and4 actual production Chromium coarse-input tests passing. The scoped rereview approves spec compliance and quality with both findings addressed and no new important breakage. Full suites were not needlessly repeated after the narrow fixes.

The next milestone is actual immutable PNG/JPEG export from Rust full frames, followed by remaining production-route/browser acceptance. Full website/catalog/effects/media/Flow/library/services parity remains open; no complete rebuild claim is made.

## Captured PNG/JPEG export implementation — 23 October 2026

The production Studio now encodes captured full Rust frames to PNG/JPEG with scale admission/reasons, black JPEG matte, cancellation, noncancellable encoder ownership, bounded charged download URLs and real download actions. Stage zoom never determines output geometry. The initial conservative256MiB policy admits default1000²1× and small-source higher scales; large-image/4K parity remains open.

Validation:77focused tests/typecheck/scopedlint and parentproductionbuild passed; fresh independent spec+quality review approved with no actionable findings. Parent actualdownload verifiedPNG1000²RGBA/227224bytes. The JPEG tool action reported download initiation but did not yield a saved file, so actualJPEG bytes/decodedalpha-matte/crossbrowser/lifecycle gates remain Task6 work, not an inferred success. Details and screenshot: [Studio verification](studio-shell.md).

## First Studio milestone review accepted — 24 October 2026

The production Characters Studio milestone is now accepted through checkpoint `ad52bb9`, pushed to `main` and independently verified against the remote SHA. The production route includes full-frame Rust previews, four controls, transactional local uploads, history, comparison, view controls and captured PNG/JPEG exports. Real production browser checks establish native signatures/dimensions, PNG alpha, JPEG black matte, source preservation, stale-paint rejection and route cleanup; detailed results remain in [Studio verification](studio-shell.md).

The broad review found missing touch history at phone widths. Menu now provides Undo/Redo, with a real coarse390px regression proving exact preview restoration using touch and zero keyboard events. The same fix hardens the network test to known assets and rejects arbitrary same-origin API/query requests. Independent scoped rereview accepted spec and quality with no actionable findings. Fresh parent checks:23 component tests, TypeScript, scoped lint and2 production browser regressions pass. Prior broad suite/native/browser results are separately recorded; they were not repeated for the narrow Menu fix.

Next: per-family evidence/design contracts, then additive Rust RGBA jobs and real production integration. Full mode controls/reference pixels, remaining styles/effects, richer thumbnails, crop/text, library/recipes, Flow, media/video, account/AI/services and performance acceptance remain open.

The initial renderer plan and per-family contract inventory now distinguish all15 canonical modes. Independent Pixel/Mosaic/Braille payload and mathematical designs passed scoped review for incremental transport work; the other11 new family designs remain unfrozen. This is design acceptance only: all14 new renderers remain unavailable. The fixed blur baseline is retained, tone0/20 are construction defaults, and isolated transparent/neutral fixtures are not complete-profile defaults. Task2 is adding strict TypeScript/Rust codecs before any runtime capability is enabled.
