# Studio Braille and crop verification

Date: 2026-10-27. Scope: accepted Studio shell; Characters binder unchanged. Native Task 7 independently reviewed before activation (parent reports SPEC PASS / QUALITY PASS, rebuilt WASM readback green).

## Implementation

Braille uses the generic Rust style service with a measured, input-ordered U+2800–U+28FF atlas. Geometry is `0.6 * fontSize * renderScale` by `fontSize * renderScale`; preview, thumbnail and captured export keep calibration identity and pass the actual captured atlas. Atlas resources participate in the shared memory ledger, including the capture lease through later style changes. Capability negotiation gates availability. Cell size, invert, opacity, local threshold, brightness and contrast use existing parameter controls. Characters preparation/binding remains unchanged.

Crop uses a local dialog draft. Percentage inputs, source-space Free/Square/4:5/3:4/9:16/16:9/4:3/3:2 presets, CW/CCW rotation, reset/cancel/apply and effective pixel dimensions follow crop-before-rotation. A source-coordinate outline depicts bounds. `setGeometry` validates the whole project and creates one history entry; invalid geometry keeps the project and accepted frame. Existing dialog focus trap, Escape and trigger restoration apply.

## RED / GREEN commands

- RED: `npx vitest run src/components/effects-studio/crop-dialog.test.tsx` failed because the component did not exist. GREEN after implementation: 3 tests; expanded to 4 including unchanged Apply closing.
- RED: `npx vitest run src/components/effects-studio/runtime-styles.test.ts src/components/effects-studio/style-adapter.test.ts` failed 3 assertions: Braille rejected, unavailable capability intersection, no Braille preview. GREEN after integration: 17 tests.
- GREEN: focused controller/style/properties/Studio/crop/runtime/style-adapter group: 7 files, 85 tests.
- GREEN: `npx vitest run src/components/effects-studio/runtime-styles.test.ts src/components/effects-studio/runtime.test.ts src/components/effects-studio/runtime-service.test.ts src/components/effects-studio/runtime-availability.test.tsx src/components/effects-studio/crop-dialog.test.tsx src/components/effects-studio/controller-styles.test.ts src/components/effects-studio/properties-styles.test.tsx src/render/style-contract.test.ts` — 8 files, 64 tests.
- GREEN: `npx tsc --noEmit`.
- Formatted owned changed files using installed Prettier.

## Actual browser / Worker / WASM

Isolated dev server: `ASCIIMORPH_BUILD_DIR=.next-e2e npm run dev -- --port 3128`.

Command: `npx playwright test --config /tmp/asciimorph-completion-playwright.config.ts --grep 'Braille uses|mobile crop'` (temporary config points the repository e2e file at port 3128 and Chromium, 1440×1000).

Desktop acceptance observes real production `styleResult` messages from the module Worker; no mocked worker/native renderer. Uploads a procedural 17×13 PNG. Braille selection succeeds. Cancel preserves preview hash and restores focus. Width 50% with 90° CW produces 13×9 backing pixels and 13×9 downloaded PNG; Undo restores the exact initial hash. Native threshold 100 vs 0 changes the hash. Decoded PNG RGBA hash equals the preview hash. No unhandled browser errors. Evidence: `docs/verification/screenshots/studio-braille-crop.png`.

## Final integration checks

Independent specification and quality review passed with no material findings. Parent verification passed the full JavaScript suite (818 tests, one existing skip), the production Next build including TypeScript, and ESLint with zero errors and three pre-existing prototype warnings. Against the optimized production build, desktop Chromium passed Braille/crop/threshold/PNG equality and narrow crop interaction tests (2 tests); the mobile Chromium profile passed the redirected Studio entry point and crop ratios/invalid draft/Escape/focus/Apply tests (2 tests). Screenshot evidence includes `studio-braille-crop.png` and `studio-crop-mobile.png`.

## Limits

These checks establish this bounded integration, not the entire rebuild. Dither, the remaining core families, full controls, post effects, text/masks/lighting, video/animation exports, recipes/library and Flow remain unfinished in the new Studio.

The crop dialog uses numeric percentage drafts and a source-coordinate outline, without pointer dragging or a full source bitmap. Ratios fit source dimensions before rotation; floor/ceil pixel bounds can differ from ideal ratios on small images. Full-suite/build/integration final verification is parent-owned and deliberately not repeated by this worker. No commits, pushes, branch/worktree changes, or native edits performed by this worker.

## Final handoff

Desktop actual-worker acceptance passed twice (latest 4.9s). Mobile smoke was added but its first isolated development run timed out before the upload input mounted; shared browser artifacts were concurrently replaced by parent verification. No mobile success is claimed here. Parent explicitly took ownership of final mobile verification against the production build and asked this worker to stop further runs.

Parent final checks reported: 818 JavaScript tests passed, 1 skipped; lint 0 errors with 3 existing prototype warnings; production build including TypeScript passed. Independent Studio review reported SPEC PASS / QUALITY PASS. These are parent-run results, separate from this worker's focused commands above.
