# Captured style controls verification

2026-10-27, local macOS, Chromium desktop and touch390×844. Independently specified rendering; reference pixel parity is not claimed.

## Delivered

Characters, Pixel and Mosaic now expose none/solid-black/original/blur backdrops, softness0–60/default8, background opacity, layer opacity, Normal/Overlay/Color Dodge/Screen/Lighter, coverage and invert. Characters adds seeded random glyphs and editable canonical ramps with presets. Shared Braille composition supports the same backdrop/blend/coverage controls. Existing Pixel/Mosaic color inversion retains its v1 semantics; Characters inversion reverses selected ramp indices after the unchanged raw dark threshold and never inverts colors.

Frozen v1 wire formats and `REFERENCE_CHARACTERS_CONTEXT_V1` remain unchanged. Nondefault contexts use a64-byte SCX1 trailer through new `render_begin_{style,characters}_context_v1` exports, negotiated by `render_style_context_version`. Historical requests continue through old begin exports. Old modules fail nondefault settings before staging/sending; no new control is silently ignored. Each job captures a copied context; service request/thumbnail snapshots detach nested contexts before waiting. Thumbnail settings keys already include the entire settings object.

The registry migrates only exact complete historical parameter shapes. Complete new shapes validate strictly; partial new shapes, missing old required fields, unknown keys, null/invalid values reject. Ramps remain canonical strings. History uses the existing parameter edit transactions. Effects/masks/text remain explicitly unsupported by current binding; dot-grid overlay and advanced blur remain unimplemented, not advertised as functional controls.

## Numerical and ownership semantics

Backdrop opacity scales alpha and premultiplied channels together (straight source RGB remains unchanged). Overlay, color-dodge and screen use W3C separable formulas and source-over alpha; lighter adds premultiplied channels/alpha with clamping. Blur0 equals resized original; blur8 uses exactly the historical box radii. Other softness values use the same six cooperative box passes; maximum481 initialization taps/work unit at softness60/scale4. No new image planes, dependencies, workers or raised memory budget. Inline context bytes are charged through existing size_of estimates; all scratch/capacity reservations remain under256MiB. Coverage uses a stable cell-coordinate/seed hash; zero suppresses the entire layer,100 keeps all historically eligible cells. Characters raw threshold and ordinary-space rules still apply before opacity/composition.

## Observed RED → GREEN

- New native context test initially failed with unresolved module; then passed after implementation. Independent hand-calculated opaque blend fixtures, transparent endpoints, malformed binary fields/version/nonfinite values and seeded coverage now pass.
- New TS contract test initially failed with unresolved module; now verifies default omission, exact fields/version, nonfinite/null/accessor rejection without getter invocation, detached results and bounded old-shape migration.
- Stronger actual WASM Characters test exposed an inversion bug that changed threshold occupancy. Fixed by reversing the selected index after threshold. Foreground colors now remain identical while indices differ; random seeds are deterministic and different seeds change output. Explicit default context equals the v1 frame; blur0 and60 differ from8.
- Native budget regression admits an extended job, lowers the test budget to its complete active reservation and proves even a one-byte stage cannot borrow future scratch. Completion/release restores ownership.

## Executed checks

- Full native suite passed after initial integration, including historical exact numeric/wire fixtures: `/tmp/style-native-tests.log`. Later focused context3 tests and extended reservation regression passed; parent reruns full suite after independent review.
- Actual WASM rebuilt with `npm run build:wasm`, warning-free after removing obsolete wrapper.
- Final focused JavaScript:9 files,123 tests pass (`/tmp/style-final-focused.log`), covering new context/actual WASM/old capabilities/service/worker/UI/schema/style binding.
- Additional earlier focused wire/Characters/registry/property tests:8 files,101 tests pass; updated schema expectations reflect additive fields.
- TypeScript passed after final edits. `git diff --check` clean. Parent owns final full JS/lint/production build.
- `tests/e2e/styles/style-controls.spec.ts`: the isolated Vite fixture exercises the real service/Worker/WASM across50 control cases for Characters/Pixel/Mosaic, all with preview=export and same-size native-thumbnail equality. Every nondefault case changes an appropriate sample (tile alpha80 exposes backdrop controls). Opaque PNG encoding/readback equals preview. Includes a17×13 nondivisible source, crop/rotation90°/scale2/softness60 sample and an export request whose input context is edited immediately afterward; captured output retains the original settings.
- Original Studio phone run at390×844 verified upload128×64 gradient, Properties/backdrop/blend, keyboard Home on coverage, Binary ramp canonical input and no horizontal overflow. **Correction2026-10-28:** the earlier report incorrectly claimed that this phone run downloaded a PNG; the test had no download assertion. The separate Worker PNG readback was real, but did not establish the phone download claim. The original endpoint screenshot has been superseded by the corrected run.
- Review follow-up2026-10-28: phone test changes coverage from keyboard-tested0 to37 and backdrop to original, waits for rendered status, captures preview RGBA before export, asserts >16 distinct colors and difference from original source, taps Export, selects PNG/1×, awaits a real download, checks .png filename/signature, decodes downloaded bytes with createImageBitmap and compares dimensions plus every RGBA byte and hash against the captured preview. Parent ran `ASCIIMORPH_E2E_PRODUCTION=1 npx playwright test tests/e2e/styles/style-controls.spec.ts --project=desktop` against the optimized Next build at3107: both tests passed (4.3s). The second test creates an explicit touch/mobile390×844 browser context. Current screenshot: `docs/verification/style-controls/phone.png`.

## Final acceptance — 2026-10-28

Independent specification and code-quality review passed; its verification finding was closed by the corrected production browser result. Parent full JavaScript suite:825 passed, one existing skip across90 files. Full offline Rust suite passed. Production Next build including TypeScript passed. ESLint passed with zero errors and three existing warnings in the design prototype. Whitespace checks passed. Rebuilt WASM SHA256: `dc363938273407edb89c2ffa770a4913e772508a9b17756a700d789ccc2c0ddf`.

## Reference evidence and limits

Control names/options are present in `docs/research/ascii-magic/2026-10-26/{characters,pixel,mosaic}-ax.txt` (Backdrop, Softness, Opacity, Blend Mode, Char Opacity, Invert Mapping, Coverage; Characters also randomization/ramp choices). Those captures reuse a session (e.g. softness2/font10) and do not establish factory defaults. The approved local contract preserves8/11 and prior pixels.

The separately captured128×64 reference canvas clips under `same-input/` are lossy JPEG bytes despite .png filenames. They are visual evidence only; exact matching against exported reference files was not performed. Font/platform/algorithm differences remain open; this implementation establishes real coherent controls, not reference pixel equivalence. No Firefox/WebKit claim or performance target claim is made by this task.

## Review handoff

The implementer created no branch, commit, push or worktree. Parent handles the reviewed checkpoint. Raw research and handoff files remain preserved. New source modules: Rust `style_context.rs`, TS `style-context.ts` and catalog `style-context-schema.ts`; integration touches existing jobs/compositors/session/ABI, schema/binders/wire adapter/service/worker and Properties.
