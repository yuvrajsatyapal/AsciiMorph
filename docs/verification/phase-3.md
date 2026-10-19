# Phase 3 verification

## Phase 1–2 baseline (2026-10-19)

- ESLint passed; strict TypeScript passed; Vitest 52/52 passed (9 files).
- Production build passed (Next 16.4.2 webpack, static / and /studio).
- Corrected browser run: 15 passed, 1 intentionally skipped (mobile exact raster
  comparison assumes desktop DPR=1); desktop PNG preview/export pixel parity
  passed; touch drawing, mobile overflow/panels and all prior regressions passed.
- Harness defect confirmed: reuseExistingServer on localhost:3000 silently used
  another application. Dedicated 127.0.0.1:3107 with .next-e2e isolates tests.
  Initial wrong-app failures excluded from application regression conclusions.
- Sandbox initially prevented server binding; approved rerun executed outside it.
- No Git metadata exists in this workspace.

## Final Phase 3 checks

Executed against the final implementation on 2026-10-19:

| Check | Actual result |
| --- | --- |
| `npm run lint` | Passed; no warnings/errors |
| `npm run typecheck` | Passed, strict TypeScript |
| `npm test` | 86 passed, 15 files, no failures |
| `npm run build` | Passed; static `/`, `/studio`, `/convert` |
| Expanded converter dev-server browser run | 10/10 passed before adding the final drag/drop cases |
| `ASCIIMORPH_E2E_PRODUCTION=1 npm run test:e2e` | 27 passed, 1 existing intentional skip; 36.8s |

The production run includes the entire prior regression suite plus 12 conversion
cases (six desktop/six touch-mobile). Its converter tests collect JavaScript
page errors and console errors; all error assertions passed. Checks include:

- Local browse and drag/drop with real PNG/BMP fixtures, JPEG native orientation,
  WebP decoding, malformed data and oversized header dimension rejection.
- All processing sliders and grid/color controls, automatic updates, reset,
  comparison slider/opposing clipping masks, side-by-side, keyboard preview use.
- PNG preview/export pixel equality for converted artwork at desktop and mobile
  DPR. Existing manual-editor PNG exact-pixel test passes on desktop; its
  pre-existing mobile skip remains, independently covered for conversions.
- All six export formats, editable handoff, cell typing, undo/redo, Save/reload,
  previous Orbit project retention and existing project import/export tests.
- 60,000-cell conversion, cancellation/retry, Studio high-DPR bounded backing
  store rendering, 375px/768px containment and 44×44px mobile zoom targets.
- Existing touch drawing, tools/panels, recovery, focus and overflow regressions.

Full production build ran after the last production-code change. Subsequent
changes are documentation only. Browser tests use Chromium mobile emulation;
this is not a physical-device or Safari/WebKit run. Fullscreen failure handling
is implemented but native fullscreen behavior was not independently exercised
in a dedicated browser assertion. No heap profiler or quantitative interaction
latency benchmark was executed.

## Independent reviews

Independent Design Gate review requested concrete keyboard/text alternatives,
mobile bounds/targets, accurate derived rows and save-failure recovery. All were
implemented. Final verdict: **ACCEPT**, with final fixes verified in source.

Independent code review identified four confirmed issues:

1. High: large converted documents exceeded backing limits after high-DPR Studio
   handoff. Fixed with bounded previewPixelRatio without changing logical metrics;
   unit regression plus real 60,000-cell desktop/mobile handoff passed.
2. Medium: photograph leaked through transparent ASCII in before/after. Fixed
   with opposing clip masks; browser regression passed.
3. Medium: overlong custom graphemes conflicted with the shared model. Fixed
   validation; regression passed.
4. Medium: whitespace-only image basenames caused invalid project names. Fixed
   trim/fallback; hook regression passed.

Reviewer rechecked all four fixes and save ordering, independently executed
four targeted test files (31 tests at review time), and accepted with no remaining
high-severity findings. Implementation-side checks additionally corrected
Floyd–Steinberg diffusion to operate after density adjustment and reject unsafe
configured decoder limits before file reads; both have failing-then-passing unit
regressions. Worker fallback/termination/errors, stale results, removal/unmount
URL cleanup, invalid characters/input, transparent sampling, shared JSON round
trip, storage failure and draft preservation have unit coverage.

## Remaining limits and readiness

- Input support is bounded PNG/JPEG/static WebP/BMP. Other formats are deferred;
  Windows DIB BMP decode support depends on the native browser decoder.
- Unicode fonts vary by platform; embedded SVG/HTML font is Latin-only. Braille
  dot structure is real, but dot colors/alpha share one averaged cell value.
- Safari, Firefox, physical phones and peak heap measurements remain unverified.
- Original/full-resolution decode is bounded but cannot be aborted mid-decode;
  cancelled results are ignored and resources released when native decode ends.
- No remaining confirmed high-severity issue. Phase 4 can use the unchanged
  shared interfaces; Phase 4–8 functionality has not been started.

Architecture, complete changed-file groups and algorithm details are recorded
in `docs/phase-3.md`; design and execution plan remain in `docs/specs/` and
`docs/superpowers/plans/`. Next.js automatically added `.next-e2e` generated type
paths to tsconfig.json for the isolated test server.
