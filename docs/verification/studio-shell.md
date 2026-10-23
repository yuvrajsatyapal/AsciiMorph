# Production Studio verification

The first production Studio route is `/app`. It uses the retained-source Rust/WASM renderer through the accepted Studio runtime; the older `/studio` remains available separately. The complete website rebuild is still in progress. See [reference parity](reference-parity.md) for the broader open scope.

## Desktop shell and real rendering — 23 October 2026

The production build includes `/app`. Parent inspection in the Codex in-app browser verified the owned 1000×1000 botanical source reaches the actual Characters renderer. Font size, character ramp (including a trailing ordinary space), brightness, contrast and undo were exercised through visible controls. Canvas backing dimensions remained 1000×1000. Help and controls close/reopen worked, including focus returning to the visible reopen button.

Read-only DOM measurements:

| Viewport | Header | Catalog | Stage | Dock including rail | Bottom actions |
| --- | --- | --- | --- | --- | --- |
| 1440×900 | 1440×52 at 0,0 | 320×848 at 0,52 | 780×848 at 320,52 | 340×848 at 1100,52 | 568×50 at 426,828 |
| 1920×1080 | 1920×52 at 0,0 | 320×1028 at 0,52 | 1260×1028 at 320,52 | 340×1028 at 1580,52 | 568×50 at 666,1008 |

These principal bounds match the approved reference measurements. This is shell acceptance evidence, not pixel equivalence for artwork, fonts or the complete website. The botanical is owned original artwork. Unimplemented catalog styles show explicit neutral placeholders; only Characters has a real treatment. Fixed/unavailable properties and service actions remain visibly identified.

Captures: [1440×900](studio-shell-evidence/studio-1440x900.jpg), [1920×1080](studio-shell-evidence/studio-1920x1080.jpg). They show the default Characters look after editing and undoing. A later coarse-landscape breakpoint adjustment does not alter these desktop layouts; final build is checked after that change.

An actual browser failure exposed the audited SVG default taking an unsupported bitmap decode path. Only the fixed trusted asset now uses the existing Image/Blob URL decoder. Raster uploads retain their bitmap path; arbitrary user SVG remains rejected. Dedicated regressions cover success, abort, failure, preflight and resource cleanup.

## Checks and limits

- Focused component/runtime/source checks: final implementer report records exact commands and red/green evidence.
- Parent full JavaScript suite: `npm test -- --maxWorkers=2` — 645 passed, one existing skipped test across 69 files.
- The first full run overlapped a production build and additional worker tests; one unchanged legacy editor wait-for assertion timed out. Its isolated three tests passed, followed by the complete bounded-worker suite above. Timeouts and assertions were not weakened.
- Production build, independent review and final checkpoint are recorded in the rebuild checkpoint document once accepted.

Only validated favorites and panel preferences persist locally. Sources and edits belong to the current session and are lost on navigation. User uploads remain signature-validated PNG/JPEG/WebP/BMP within 12 MiB, 4 million pixels and 8192px per side; there is no silent downsizing.

At this earlier shell checkpoint, real PNG/JPEG encoding/download verification and broader production-route race/lifecycle and cross-browser/coarse-device acceptance remained open. The Task6 section below records their later evidence. Full catalog rendering, effects, media, Flow, library, account/generative services and public-site parity remain open. No complete rebuild or mobile-reference equivalence is claimed here.

## Review fixes and coarse-input regression

Independent review identified competing compact-sheet/toolbar-dialog focus traps and a CSS specificity error that left some coarse-pointer toolbar buttons narrower than 44px. The targeted fix permits a single active focus owner, restores the actual toolbar trigger after closing a dialog, and applies winning 44×44px toolbar/account minimums with compact packing.

Parent verification after the fix:

```sh
ASCIIMORPH_E2E_PRODUCTION=1 npx playwright test tests/e2e/studio-shell-accessibility.spec.ts --project=desktop
```

**4 passed** against the built `/app`, with Chromium contexts explicitly using `hasTouch: true` and `isMobile: true`: 320×740, 375×812, 390×844 and 1180×600. Assertions cover actual target bounds, hit testing, overlap/clipping, document horizontal overflow, and Styles/Controls → Menu → Tab to the legacy link → Escape with focus/scroll restoration. The production build also passed after these changes. Runner output contains the environment warning that `FORCE_COLOR` overrides `NO_COLOR`; it does not indicate an application error.

These targeted coarse-input checks close the named interaction regressions. They do not establish complete mobile or reference parity, nor replace Task6's remaining rendering/export/lifecycle browser gate.

## Captured still export implementation — 23 October 2026

The Export dialog now exposes real PNG/JPEG output from immutable Rust frame captures, scale availability/reasons, render/encode/download stages, cancellation and retry. PNG preserves frame alpha; JPEG composites over black. Same-source look edits may continue while the captured export finishes. Source changes and disposal cancel output; native encoding settlement retains its pixel lease and encoder reservation. Completed download URLs remain charged by actual Blob size until 30-second revocation or disposal, with a 32-URL bound.

The conservative export admission policy is 256 MiB, including complete native profile work, source/atlas backings, retained frames/canvases and encoder/Blob allowances. It currently admits the default 1000×1000 source at1× and disables2×–4× with a visible reason. Small sources may admit4×. No output is downsized. This is an initial policy, not completion of reference large-image/4K support or a total-process memory guarantee.

Verification: 77 focused encoder/controller/runtime/dialog/lifecycle tests, TypeScript and scoped lint passed. Parent production build passed. Independent spec and quality review approved the implementation without actionable findings.

Parent actual-browser evidence: a production `/app` PNG download was saved as `Untitled.png`; `file` and `sips` confirm 1000×1000, 8-bit RGBA PNG, 227,224 bytes, SHA256 `658a892a40e0c53524d4f0f4977efdd797c75908d4a8fea636619efcc232880e`. The browser download API took611seconds to return the file path; this bridge delay is not a renderer benchmark. A JPEG action reached “Download started,” but the browser tool did not yield a saved JPEG file for inspection. JPEG bytes, decoded PNG alpha/JPEG matte and broader browser acceptance therefore remain explicit Task6 gates.

[Actual export dialog](studio-shell-evidence/export-dialog-1440x900.jpg), 1440×900 JPEG, SHA256 `aefa10a91471e251095171d2c5bfc817a4f0c9a8baa9c0c91f092326326c6223`. Its status records download initiation, not independent JPEG-file verification.

## Task 6 production browser gate — 23 October 2026

The built `/app` route now has owned Playwright acceptance in `tests/e2e/effects-studio.spec.ts` and `tests/e2e/render-service.spec.ts`. Successful renders use the default production service, its actual bundled Worker and `public/wasm/asciimorph_engine.wasm`; no Vite/toy route, fake successful Worker, alternate renderer or test-data dependency is introduced. Fixtures are procedural local PNGs, the owned botanical, fixed initial parameters/seed/time, measured Courier font policy and explicit input capabilities.

The source requests a module Worker (`src/render/service.ts`, `{ type: "module" }`). Next 16.4.2's webpack production build emits a classic Worker (`new Worker(..., {type:void 0})`; observed native options are not `module`). This is the real bundled render worker running Rust/WASM, not an ESM-artifact claim. The parent accepted that packaging distinction for this milestone; future ESM-only worker features require an explicit webpack-output decision and revalidation.

### Actual files and pixels

- Native PNG/JPEG downloads have the expected byte signatures and extensions; the native `toBlob` callback's actual Blob MIME is asserted independently of the test's decoding Blob. Default output is 1000×1000. Decoded PNG full RGBA bytes equal the painted preview, not a resized screenshot.
- The owned 67×53 opaque fixture is verified against every authored source pixel. Its 1× PNG equals the full preview (including the final margin pixel); scales 2/3/4 are 134×106, 201×159 and 268×212. At F11 the canonical geometry remains a 10×4 floor grid across scales; browser tests assert full-frame dimensions, while native/profile tests own detailed grid math.
- A separate fully transparent 67×53 fixture takes the normal upload/render/export path. PNG has alpha zero throughout; JPEG is alpha255 and exact black throughout. The default blurred botanical is not misrepresented as a transparency fixture. PNG export equality precedes any JPEG quantization comparison.
- A 1703×1001 fixture (1,704,703 pixels) retains those exact source, preview and PNG-export dimensions, exposing any legacy1600px shrinking. The larger 1703×1701 option remains within source limits but can exceed combined current export admission; no budget is weakened and no image is silently downsized.
- Four control edits change painted pixels while the authored retained source stays identical. A bounded test-only observer forwards native Worker calls unchanged and retains at most64 protocol identities (no buffers); actual `rust-cpu` results advance revisions while source ID/revision stay fixed across edits and undo/redo. View-only zoom does not advance that identity. Repeated keydowns form one undo group; undo/redo restore the expected pixel state. Invalid duplicate-character drafts preserve the valid frame, trailing spaces survive, and native input undo is not prevented. Compare toggle, held keyboard compare, blur and pointer cancellation release correctly. View zoom/panels/filtering preserve render pixels and 1× export dimensions.

### Races, failures and ownership

The rapid-change race gate now holds an actual older native Worker response while newer source/atlas/parameter work produces a real result and canvas paint, then releases that same event to the original service callback. A bounded history of native preview `putImageData` readbacks forbids the old source/hash from painting, ties every paint to the current real request/result, and spans release, animation-frame drainage and a further actual native render/paint. The original eventual-convergence/200ms check was insufficient and has been replaced. Invalid SVG with an external image reference and a malformed PNG preserve the old source/frame; browser-context network observation permits same-origin assets/WASM/local Blob URLs and the exact official Fontshare UI CSS/CDN font requests, with no source-dependent network traffic. WASM blocking, UI-font blocking and calibrated-font failure are injected only for failure paths; subsequent successes run the real service and native font measurement.

The WASM failure gate uncovered a concrete empty-source recovery gap. Initial worker initialization failed during source upload and exposed an error without an action. `Retry sample image` now re-runs the owned botanical load only when no committed source exists. Rejected user files can be uploaded again; the sample button is not presented as retrying that user's file and never replaces a committed source after a failed upload. Existing-source render recovery continues through the retained runtime.

The legacy-menu link now uses Next Link. A strengthened browser regression first failed because the plain anchor created a new document and reset the resource monitor. The passing regression requires the same document token, nonempty original Worker/canvas records, actual Worker termination, four owned canvases reset to zero and revocation of the completed download URL, followed by a fresh1000px sample after leaving an uploaded67px source. Empty arrays cannot satisfy its cleanup assertions.

Native `toBlob` is delegated unchanged and its callback is delayed in cancellation/lifetime tests. Explicit cancellation stays busy through settlement, source replacement independently cancels another pending encode, and late bytes never download. Another gate unmounts while a native encode is pending: the same-document encoder canvas remains1000×1000 until its callback settles, then becomes0×0. Same-source undo changes the live preview/atlas while immutable captured output still exports the earlier pixels; only one encoder runs. Production has no development StrictMode effect replay, so StrictMode-specific retirement is covered by the existing real-hook Vitest lifecycle cases, separately from production browser unmount proof.

### Browser/device and visual evidence

Playwright1.64.1 uses Chromium156.0.8078.4, Firefox157.0 and WebKit27.2. The `mobile` project uses iPhone13 emulation on Chromium, not Safari/iOS hardware. Explicit Chromium contexts additionally cover coarse390×844 (`hasTouch:true`, `isMobile:true`), coarse768×1024, and fine-pointer390×844 (`hasTouch:false`, `isMobile:false`). They assert the coarse media query, render/edit/export, sheet focus/scroll restoration and no horizontal document overflow. These are proposed compact-layout checks, not verified equivalence with a mobile reference. The existing four Task4 coarse-toolbar/focus regressions remain separately recorded above.

Fresh PNG captures: [1440×900 fine](studio-shell-evidence/task6-chromium-fine-1440x900.png), [1920×1080 fine](studio-shell-evidence/task6-chromium-fine-1920x1080.png), [390×844 fine](studio-shell-evidence/task6-chromium-fine-390x844.png), [768×1024 fine](studio-shell-evidence/task6-chromium-fine-768x1024.png), [390×844 coarse after edit](studio-shell-evidence/task6-chromium-coarse-phone-390x844.png), [768×1024 coarse after edit](studio-shell-evidence/task6-chromium-coarse-tablet-768x1024.png), [390×844 explicit fine after edit](studio-shell-evidence/task6-chromium-fine-narrow-390x844.png). The [manifest](studio-shell-evidence/task6-manifest.json) records actual PNG headers/dimensions/byte lengths/SHA256; screenshots are not inferred from a tool's display format.

The desktop tests measure52px header,320px catalog,340px dock including54px rail, full remaining stage,568×50 actions22px above the bottom at1440/1920. These match approved shell geometry from the inherited MosaicC70 reference captures. The screenshots use owned original botanical artwork, explicit unavailable placeholders and the system-monospace measurement policy; they do not establish exact reference artwork/font pixels. Coarse headers and compact sheets intentionally differ. Forced-colors/reduced-motion keyboard-focus and help-dialog scroll restoration are exercised; blocked UI-font usability is separate from reference font appearance. Desktop1440/1920 and edited coarse390/768 captures were visually inspected for clipping/visibility; the narrow action row can scroll horizontally after Export receives focus.

### Commands and results

The final production build ID is `XEQ3WqceSUr-e_Omu-gKY`, based on accepted checkpoint `06ebfb902de4baef8dee3f7983f7184129fd6d84` plus the two narrow shell fixes. Browser runs explicitly use `ASCIIMORPH_E2E_PRODUCTION=1` and a fresh `next start` on 3107. A sandbox listener `EPERM` required authorized escalation; unrelated listeners were preserved.

- `npm run test:rust`: **89 passed** across seven native suites; no ignored tests.
- `npm run build:wasm`: **PASS**; WASM SHA256 `fc60bdc6ad2b4ba80481dd7736e733d92b0c71c5503eddd82883815f0558cfd9`.
- `npx vitest run src/components/effects-studio src/render/export/still-image.test.ts src/render/media/still-source.test.ts src/render/media/source-transaction.test.ts src/render/service-characters.test.ts src/render/wasm-character.test.ts src/render/worker-runtime.test.ts`: **15 files,230 tests passed**.
- `npm run typecheck`, scoped ESLint over both new specs plus modified shell/component test, `git diff --check`: **PASS**. Checks were repeated after final test-only refinements.
- `npm run build`: **PASS**, includes production `/app`; no renderer/ABI changes.
- `ASCIIMORPH_E2E_PRODUCTION=1 npx playwright test tests/e2e/effects-studio.spec.ts tests/e2e/render-service.spec.ts --project=desktop`: **20 passed,26.7s** on the final build.
- `ASCIIMORPH_E2E_PRODUCTION=1 npx playwright test tests/e2e/effects-studio.spec.ts tests/e2e/render-service.spec.ts --project=firefox --project=webkit --project=mobile`: **39 passed,21 intentionally skipped,1.3min**. Each engine executes13 functional flows; the four fixed screenshot sizes and three explicit Chromium capability contexts run once in the desktop project. Initial test-only corrections (real pointer IDs, visible sheet selectors and WebKit FontFaceSet prototype interception) are disclosed in the task report; no earlier failing probe is counted as a product pass.

The earlier 611-second in-app download-path delay is a bridge observation, not a renderer or codec benchmark. Automated browser durations are test durations, not performance certification. Resource accounting retains the declared session/encoder limitations from Task5; browser/GPU/RSS uncertainty remains.

This closes only the first Characters Studio browser milestone after independent review. Full family rendering/thumbnails/hover, crop/text/guides, mode shared-state persistence, library/recipes, Flow, video/animation/export codecs, account/AI/public-site surfaces, GPU/performance targets and verified mobile-reference equivalence remain subsequent milestones in the [open parity ledger](reference-parity.md). No full website completion is claimed.

Final test-only protocol refinement: the native metadata/download and four-control flows were rerun on desktop/Firefox/WebKit/mobile using `--grep 'four controls|production native PNG'`: **8 passed,26.3s**. Typecheck and scoped lint passed after that refinement; production source/build stayed unchanged. The bounded observer proves actual `rust-cpu` revision/source metadata without adding product diagnostics.

Task6 review fix1 (P2), unchanged production build: the focused `render-service.spec.ts --grep 'deferred obsolete response'` run across desktop/Firefox/WebKit/mobile passed **4/4 in14.5s**; strict single-file TypeScript and scoped lint passed. No broad suite/build was repeated. Parent separately confirmed `npm test -- --maxWorkers=2`: **674 passed,1 existing skip,71 files,18.13s**, recorded in `/tmp/asciimorph-studio-final-tests.log`. The Task6 report describes the native callback-deferral/paint-history contract and the initial cross-engine event-redispatch probe correction.
