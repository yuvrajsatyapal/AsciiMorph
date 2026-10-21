# Character geometry extension verification

Verified locally on 2026-10-21 against the approved coordinated geometry plan. This enables the packed rendering boundary; product adapter/UI readiness remains separate.

## Accepted boundary

- New character settings, calibration and packed grids accept finite logical width/height in **1..512**, preserving fractions. Examples: 1×1, 1.8×3, 6.6×11, 192×320 and 512×512.
- Generated calibration raster extents are `ceil(width) × ceil(height)`. Externally supplied masks retain their independent validated integer extents; admission and painting use those actual extents.
- Font size remains 1..512. Existing exact family verification and centered/middle raster placement are retained.
- Existing 60,000-cell, 16,384-source-side, default 256 MiB source/session, ABI staging/job and canvas output limits remain. Accepted geometry does not guarantee every raster, grid or export fits its owner’s budget.
- The ABI stays version 1: settings remain 160 bytes, with f64 logical width/height at offsets 32/40. Upload headers, flags, integer raster fields and grid serialization are unchanged. The public WASM artifact was rebuilt with the Rust validation change.
- The old converter still accepts width 7..16 / height 14..28. Legacy documents still accept width 1..64 / height 1..128. `gridToDocument` now throws an explicit “Legacy adaptation required” error for incompatible logical cells before document/cell allocation, while retaining the 300-cell side refusal.

## Logical ownership budgets

The calibrator factory accepts validated injected limits; the existing public wrappers use the default instance. A result's typed arrays are capped at 16 MiB. Combined active jobs, cached entries and pending delivery copies are capped at 128 MiB. Cache charge is capped at 32 MiB / 16 entries, with 16 active jobs and 16 unresolved subscribers.

For raster pixels `P=W*H`, unique glyph count `N` and masks `A=P*N`:

| Charge             | Checked estimate            |
| ------------------ | --------------------------- |
| Assembled result B | A + 40N                     |
| Cache C            | B + 16,384                  |
| Pending delivery D | B + 16,384                  |
| Job J              | 2A + 76N + 8P + 36 + 65,536 |

At the maximum observed reference geometry (192×320, 256 glyphs), P=61,440, A=15,728,640, B=15,738,880, J=32,033,828, C=D=15,755,264 bytes. One job and delivery fit the aggregate cap; two cached entries fit the cache cap. Exact estimator tests cover all 256 glyphs without allocating that payload. A mocked raster test separately exercises 192×320 with two glyphs; it is not evidence of full-ramp browser performance.

A 512×512 / 256-glyph request is legal logical geometry but exceeds both result and aggregate admission policy. It rejects with `CalibrationBudgetError` before font loading or canvas creation.

Each reservation has an independent token. New jobs reserve J+D synchronously before font loading; same-key callers reserve D only. Cache hits pin the base entry while admitting/copying. Byte eviction precedes allocation. Abort releases the caller’s D and slot once; abandoned job charges survive until noncancellable font work settles. Clear advances generation and drops cache/pending lookups while retaining active tokens. Old work may deliver to existing live callers but cannot enter the new cache or remove a newer same-key lookup. Raster work yields every eight glyphs, checks live ownership, uses one count scratch and releases the canvas in finally.

Returned snapshots are caller-owned after handoff; caller retention is outside calibrator charges. Native font/cache/canvas overhead, allocator overhead and unreachable buffers waiting for GC are not claimed as bounded RSS. Worker/service, WASM retained/staged data, painter surfaces and output frames have separate owners/budgets.

Painter dictionaries retain at most four dictionaries and reserve `P*(N+2)` RGBA pixel equivalents under the existing 32,000,000 cap: every glyph, tint scratch, and one construction readback. Canonical mask/coverage/shape arrays also have a 32 MiB aggregate cap; supplied calibration arrays remain caller-owned. At 192×320×256 the painter reserves 15,851,520 pixel equivalents and 15,738,880 canonical array bytes. Eviction/failure zeros owned canvas dimensions and releases references without resetting the caller canvas or mutating supplied masks. Empty canonical Braille bins normalize to zero, retaining all eight dot positions.

With four entries, canonical arrays total at most 32,000,000 + 4×10,240 = 32,040,960 bytes under the current pixel cap, below 32 MiB. Thus pixel admission currently dominates the independent array-byte cap; a byte-only eviction fixture is unreachable with these fixed constants. Aggregate pixel eviction, canonical arithmetic, and over-budget preflight are tested. Reassess byte-only coverage if the constants change.

`paintCharacterGrid` scale remains a view/composition multiplier. A future scale-4 export adapter supplies resolved scale-4 logical geometry and paints at scale 1; it must not multiply glyph size twice.

## Executed checks

The final scoped command passed **144 tests across 10 files**:

```sh
npx vitest run src/render/character-contract.test.ts src/render/glyph-calibration-budget.test.ts src/render/glyph-calibration.test.ts src/render/wasm-character.test.ts src/render/character-paint.test.ts src/render/legacy-adapter.test.ts src/converter/engine.test.ts src/core/document.test.ts src/render/service.test.ts src/render/worker-runtime.test.ts
```

This includes real compiled WASM execution, exact f64 geometry, independent mask extents, staged replacement rejection preserving the previous calibration/job, all legacy comparison fixtures, worker/service regressions, count/byte admission, pinned hits, byte LRU, uncached results, defensive copies, aborts, clear/replacement completion orders, failure/retry, batching cancellation, tiny finite Braille, fractional destinations, painter cleanup and allocation rollback.

```sh
npm run test:rust
# 44 tests passed (2 unit + 17 character + 17 session + 8 source); 0 doc tests.
npm run build:wasm
# Offline wasm32 release build succeeded; public artifact refreshed once.
npm run typecheck
# tsc --noEmit passed.
npx eslint src/render/character-contract.ts src/render/character-contract.test.ts src/render/glyph-calibration-budget.ts src/render/glyph-calibration-budget.test.ts src/render/glyph-calibration.ts src/render/glyph-calibration.test.ts src/render/wasm-character.ts src/render/wasm-character.test.ts src/render/character-paint.ts src/render/character-paint.test.ts src/render/legacy-adapter.ts src/render/legacy-adapter.test.ts
# Passed, no diagnostics.
git diff --check
# Passed.
```

Meaningful RED/GREEN runs were retained per stage in the task workspace: narrow contract rejection, missing byte-budget module, missing lifecycle factory, Rust narrow validation and old WASM rejection, tiny Braille NaNs/resource cleanup, and missing legacy adaptation refusal. An author ownership/diff review found no further demonstrated geometry omission in `rust/src/glyph.rs`, `rust/src/session.rs` or `src/render/wasm-character.ts`; their existing checked spans and capacity/peak policy remain intact.

## Remaining acceptance gates

No actual-browser font/pixel parity smoke was executed for this delivery. Canvas/font tests use jsdom mocks; WASM tests use the actual rebuilt module. The parent schedules browser checks under Task 8: self-hosted verified font, F3/F11/F80 and S1/S4, appropriately small sources, exact logical/raster/destination checks, and visible budget failures. No browser speed, font alignment or reference pixel parity claim follows from these unit tests.

Project tone conversion, measured top-baseline/font-stack alignment, full-source export framing and product/UI wiring remain separate gates. No full application build, full repository test suite, benchmark, commit, branch, worktree or push was performed for this scoped delivery.
