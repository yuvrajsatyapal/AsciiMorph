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

Real PNG/JPEG encoding/download verification, broader production-route race/lifecycle tests and cross-browser/coarse-device acceptance are subsequent gates. Full catalog rendering, effects, media, Flow, library, account/generative services and public-site parity remain open. No complete rebuild or mobile-reference equivalence is claimed here.

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
