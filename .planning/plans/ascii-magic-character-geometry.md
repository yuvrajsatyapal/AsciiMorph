# Coordinated character geometry extension implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This assignment writes plans only; do not implement, commit, push, branch, create a worktree or spawn subagents.

**Goal:** Support reference character sizes 3..80 and export scale 1..4 through consistent finite logical geometry, without weakening source/cell/memory limits or changing legacy converter ranges.

**Architecture:** Widen only the new packed-character contract to logical cell width/height **1..512**, preserving fractional values. Add byte-accounted calibration admission, cache and in-flight ownership before widening allocation paths; the painter keeps independent bounded surface ownership. Existing version-one wire layouts already transport f64 geometry and integer mask extents, so no layout/version change is needed, but TS and rebuilt Rust must ship together.

**Tech Stack:** TypeScript, existing Canvas/font APIs, Rust/WASM manual ABI, Vitest, existing Rust integration tests. No dependency, route, shader or UI implementation is required.

**Dependencies:** [Project contract plan](ascii-magic-project-contract.md), [Rust core plan](ascii-magic-rust-core.md), and [character parameter semantics](../../docs/research/ascii-magic/2026-10-20/character-parameter-semantics.md). This extension is a prerequisite for the project→character adapter/UI; it does not resolve tone conversion, font alignment or full reference parity.

## Observed code and ownership

| Files to change during implementation | Responsibility |
| --- | --- |
| `src/render/character-contract.ts`, `.test.ts` | Shared 1..512 logical geometry constants/validation in settings, calibration and packed grids |
| `src/render/glyph-calibration-budget.ts`, `.test.ts` (new) | Pure safe byte estimates, fixed default limits and reservation accounting |
| `src/render/glyph-calibration.ts`, `.test.ts` | Admission before font loading, byte LRU, shared work, subscriber copies, generation-safe cancellation/clear |
| `rust/src/character.rs`, `rust/tests/character_source.rs` | New character geometry validation only; keep all numerical/cell/source budgets |
| `rust/src/session.rs`, `rust/src/glyph.rs`, `rust/tests/character_session.rs` | Audit existing checked upload/peak arithmetic; extend tests; change code only if tests reveal a geometry-related omission |
| `src/render/wasm-character.ts`, `.test.ts` | Audit exact f64 round-trip, actual mask dimensions, retained staging/replacement budget; avoid wire redesign |
| `src/render/character-paint.ts`, `.test.ts` | Small canonical Braille shapes, fractional destinations, preflight of actual mask surfaces and release of evicted owned canvases |
| `src/render/legacy-adapter.ts`, `.test.ts` | Explicit incompatible-geometry handoff rejection before allocating a legacy document; preserve existing settings adapter |
| `docs/verification/character-geometry.md` (new, at implementation acceptance) | Commands/results, budget examples, scope and remaining adapter/UI gates |

Other source work is ongoing. Inspect owned-file diffs and coordinate before editing during execution; preserve other workers' changes. `src/converter/settings.ts` stays at width 7..16/height 14..28. `src/core/document.ts` stays at width 1..64/height 1..128, font size 1..96 and existing dimension/cell limits. Existing legacy WASM exports in `rust/src/lib.rs` remain unchanged. No blanket staging/reset/deletion.

## Geometry decision

- New `MIN_CHARACTER_CELL_DIMENSION = 1`, `MAX_CHARACTER_CELL_DIMENSION = 512`; both logical dimensions finite, inclusive, possibly fractional. Reject 0, negatives, .999, 512.001, NaN and infinities; do not clamp. Font size remains independently finite 1..512.
- Reference logical geometry for font F and render scale S: height=F*S, width=.6*F*S. Examples at S=1: F3→1.8×3, F11→6.6×11, F80→48×80; at S=4 F80→192×320. All fit the new contract. Characters grid uses floor; output dimensions round; other styles' ceiling rule is not inherited.
- Calibration raster extents generated here are `ceil(cellWidth)` × `ceil(cellHeight)`; preserve logical fractions in settings/calibration/grid/painter. Existing externally supplied masks may have independent valid integer extents: do not impose equality to ceil(logical cell) or size their budgets from logical geometry. Keep existing mask-dimension and typed-array validation, but always preflight from actual maskWidth/maskHeight/count before additional allocations.
- Keep 60,000-cell cap, source side 16,384, default source/session memory 268,435,456 bytes, existing ABI staging/job bounds and canvas backing caps. Geometry acceptance is not an allocation/export guarantee. Oversized grids/output frames fail visibly without resizing.
- `paintCharacterGrid` scale is a view/composition multiplier on already resolved grid geometry. A scale-4 export adapter supplies scale-4 geometry and paints at scale 1; it must not scale glyph size twice. DPR/view scaling remains independently bounded.
- The existing centered/middle calibration placement is retained by this extension. Reference top baseline/font-stack alignment is a separate measured parity decision; no geometry change silently alters legacy glyph appearance.

## Calibration budget policy (concrete initial engineering limits)

The current code retains per-glyph measured masks/shapes, then allocates assembled masks/shapes/coverage; each subscriber receives another full copy. A sixteen-entry count alone cannot bound widened geometries. Use one default calibrator instance with these limits; expose a factory with injected limits for deterministic small-budget tests, preserving existing `calibrateGlyphs`/`clearGlyphCalibrationCache` wrappers.

```ts
export const DEFAULT_CALIBRATION_LIMITS = {
  retainedBytes: 16 * 1024 * 1024,
  workingBytes: 128 * 1024 * 1024,
  cacheBytes: 32 * 1024 * 1024,
  cacheEntries: 16,
  activeJobs: 16,
  subscribers: 16,
} as const;
```

`retainedBytes` caps one assembled result's actual typed-array B, independently of the cache total. `activeJobs` includes jobs from cleared generations and abandoned font loads until their work actually settles. `subscribers` counts all unresolved callers, including deduplicated waiters; deduplication cannot create unbounded delivery copies. Fail admission with a typed/recoverable calibration-budget error; no implicit downsample, clamp, unbounded queue or font/canvas call before admission. Configuration validates positive safe integers and cacheBytes<=workingBytes; tests inject lower limits rather than allocating huge fixtures. The 128 MiB aggregate includes pending subscriber-copy reservations, unlike a policy that counts only internal cache/measurement bytes.

For actual/generated integer raster width W, height H, and unique glyph count N (2..256), checked arithmetic defines:

```text
P = W * H
A = P * N                         mask bytes
B = A + 40*N                      assembled masks + coverage + nine shapes/glyph
C = B + 16,384                    retained cache charge including metadata allowance
D = B + 16,384                    one subscriber delivery-copy reservation
J = 2*A + 76*N + 8*P + 36 + 65,536
```

`J` conservatively covers measured and assembled mask arrays, measured/final shape arrays plus final coverage, one RGBA canvas backing estimate and one RGBA readback (4P each), nine count bins and a fixed bookkeeping allowance. Reuse count scratch instead of retaining one counts array per glyph; keep at most one live readback. Use safe integer overflow checks before any product/allocation. Each fixed allowance is an engineering charge, not an exact JS object-size measurement. Native font raster caches, engine allocator overhead, unreachable buffers awaiting GC and browser canvas implementation overhead are outside these logical owned-byte bounds; do not call this a hard process/RSS cap.

Maintain `cacheCharge + activeJobCharge + deliveryCharge <= workingBytes` and `cacheCharge <= cacheBytes`, plus count limits. Admission evicts unpinned LRU cache entries until it fits; reject if active reservations still prevent it. A cache hit reserves D before copying, and pins that cache entry while admitting/copying so eviction cannot uncharge a still-used base buffer. A new job reserves J and its first D **synchronously before** scheduling `fonts.load`; joining a job reserves another D. Never reserve J twice for the same live shared job.

Normal maximum reference export: W192,H320,N256 gives P61,440, A15,728,640, B15,738,880 (~15.01 MiB). J32,033,828 (~30.55 MiB), D/C15,755,264. One job plus one delivery fits comfortably; two such cache entries fit under 32 MiB. This admits normal F80/S4 while rejecting/evicting based on aggregate bytes. W512,H512,N256 is valid geometry but exceeds the 128 MiB job+delivery policy and must fail before font load; geometry bounds do not guarantee every ramp can be rasterized.

**Caller ownership:** Keep defensive copies. A returned snapshot's arrays/strings belong to the caller and are excluded from module-owned charges after promise handoff; callers retaining many snapshots can exceed this module's budget. D accounts allocation while pending/delivering, not an untrackable lifetime after return. Worker/service retained copies, WASM staged/retained calibration, painter surfaces and output frames have their own budgets. Document them separately; a 128 MiB calibration budget does not mean total render memory is 128 MiB. Do not claim aggregate caller memory is bounded without an explicit future release/lease API.

## Reservation lifecycle (must be implemented as ownership, not counters reset by clear)

| Event | Required accounting/behavior |
| --- | --- |
| New key | Evict to admit J+D; insert active job token and pending lookup; only then begin asynchronous font work |
| Same-key waiter | Admit one D and subscriber slot; share J/font/canvas work; one caller abort does not cancel another |
| Caller abort | Release that caller's D/slot exactly once; if users reach zero mark job abandoned and remove only its matching pending lookup; J stays charged until final cleanup |
| Font await resumes | Recheck live users/abandoned flag before canvas allocation; all-aborted work stops without canvas/cache. Font loads themselves are not cancellable |
| Raster work | Own J until all scratch is dropped; check abandonment between bounded glyph batches (e.g. eight glyphs, yield with setTimeout(0)); all canvas resources released/reset in finally |
| Successful current job | Drop measurement scratch, then atomically transition owned result from J to C if it fits cache policy and has users. Evict LRU as needed; if C itself is too large, keep result under job reservation only through delivery and do not cache |
| Delivery | Copy only with that subscriber's D held; release D/slot once when handed to caller or rejected; no cache-array sharing. Release result/J after all required copies when uncached |
| Font/canvas/validation/copy failure | Reject live waiters, release their D/slots and job J exactly once, leave old valid cached entries intact; a retry can create fresh work |
| Clear | Advance generation and drop cache C; detach pending lookups for new calls, **retain all active J/D/count reservations**. Existing live callers may complete and receive snapshots, but old-generation results cannot enter the new cache |
| Old completion/finally | Remove a lookup only when `pending.get(key) === thisJob`; never erase a newer same-key job. Release this job's reservation once, not all reservations for its key/generation |

Track an independent Set/Map of active job tokens; `pending.size` is not the authoritative active count after clear. Clear is not cancellation and must not free reservations for unresolved work. No code path assigns accounting totals to zero while old work is alive. Transferring result ownership from J to C is atomic bookkeeping with no extra array allocation; retain J during the synchronous uncached-copy path. An aborted caller racing completion must not decrement twice.

## Task 1: Widen only the new typed geometry and record compatibility boundaries

- [ ] Write failing `src/render/character-contract.test.ts` cases for settings/calibration/grids at 1×1, 1.8×3, 6.6×11, 192×320, 512×512; reject boundary violations/nonfinite values. Fixtures may use independent 1×1 masks: geometry tests must not accidentally allocate 64 MiB. Assert exact fractions and unchanged 60,000/60,001-cell behavior.
- [ ] Run `npx vitest run src/render/character-contract.test.ts`; expect current narrow-geometry rejection. Export/use the two constants in new-contract geometry validation; add separate positive checks in Rust later. Keep independent mask extents valid. Run targeted tests to PASS; existing legacy settings still reject new converter geometries in regression tests.

## Task 2: Implement pure estimates and byte reservations before widened rasterization

- [ ] Create failing `src/render/glyph-calibration-budget.test.ts` for exact P/A/B/C/D/J arithmetic, overflow, bad counts/dimensions, B at/beyond retainedBytes, max-reference admission, 512×512×256 rejection, byte-based LRU eviction below 16 entries, pinned-hit exclusion and J+D aggregate admission. Test scaled-down injected limits; do not allocate the estimated payload to test the estimator.
- [ ] Run `npx vitest run src/render/glyph-calibration-budget.test.ts`; expect missing module. Implement checked estimator and token-based ledger with reserve/release/transfer/pin; duplicate release throws internally during tests rather than silently making totals negative. Expose read-only usage from the factory for diagnostics/tests; do not add test-only global counter reset APIs.
- [ ] Re-run to PASS. Assert admission fails without invoking font loader or canvas factory. Preserve count limits as additional safeguards rather than substituting counts for byte accounting.

## Task 3: Integrate calibration, cache/copy ownership and safe generations

- [ ] Extend `src/render/glyph-calibration.test.ts` with deferred-font tests proving reservation occurs before font loading; an oversized request calls neither `fonts.load` nor `createElement`. Cover successful max-reference geometry with a reduced ramp in actual-raster tests and the 256-glyph size through exact estimator/admission tests; never fake full 256-glyph rendering acceptance from a reduced fixture.
- [ ] Write failure scenarios: two byte-large jobs exceed aggregate budget; same-key waiter costs D but not J; count and bytes both constrain subscribers; cache hit copies cannot mutate cached arrays; bytes evict before the 16th entry; too-large-for-cache results deliver uncached if J+D fit. Existing exact font identity and ramp validation tests remain required.
- [ ] Add deferred-font lifecycle matrix tests: one of two waiters aborts; all waiters abort before font resolves; failure/retry; clear with old live job; clear then same-key replacement; old resolves first and old resolves last; abort/clear/resolve races; canvas/copy exception; batching cancellation after partial raster. Assert counters after each step, no obsolete cache insertion, no lost new lookup, no negative/double-release and no canvas for all-aborted font work.
- [ ] Run `npx vitest run src/render/glyph-calibration-budget.test.ts src/render/glyph-calibration.test.ts`; expect admission/lifecycle failures. Implement the lifecycle table, shared instance/factory and byte LRU. Change calibration geometry validation to 1..512 only after admission exists. Release/reset the owned scratch canvas in finally; measurement uses actual ceil extents and validates returned calibration. Re-run both files to PASS. Returned snapshots remain independent caller-owned values; retain current Unicode deduplication behavior here rather than changing it as part of geometry.

## Task 4: Match Rust validation and prove unchanged ABI layout/budgets

- [ ] Add Rust tests in `rust/tests/character_source.rs` for exact fractional/new-boundary geometry and invalid min/max/nonfinite values. Add a 1×1 job at 192×320 geometry so source/cell budgets stay small. Run `cargo test --manifest-path rust/Cargo.toml --offline --test character_source`; expect current narrow validation failure. Update only new `CharacterSettings::validate` bounds to 1..512, keeping strict >0/min1 and every other setting/resource bound.
- [ ] In `rust/tests/character_session.rs` independently encode f64 settings at existing byte offsets and assert accepted fractions/extremes, malformed byte values rejected, output/session budgets still count original source, existing calibration, staging, replacement and jobs. Use actual maskWidth/maskHeight in upload tests, including independent extents; unchanged calibration integer fields fit current u16 because their separate max remains 16,384. Budget rejection must preserve the previous source/calibration/jobs.
- [ ] Run `npm run test:rust`; audit `glyph.rs`/`session.rs` checked arithmetic and vector-capacity accounting, changing them only for demonstrated omissions. ABI header/settings lengths, flags, offsets and version remain unchanged. Run `npm run build:wasm`, then add/run `src/render/wasm-character.test.ts` for 6.6×11 and 192×320 exact round-trip, mismatched calibration rejection, custom mask dimensions, and a tight-budget staged replacement failure that preserves the previous calibration. No raw reference UI settings reach this adapter yet.

## Task 5: Fix tiny canonical Braille and bound actual painter allocations

- [ ] Add `src/render/character-paint.test.ts` cases at 1×1 and 1.8×3 for canonical masks/coverage/shapes, including empty 3×3 bins; all values must be finite [0,1]. The current unconditional division by zero must fail. Implement `counts[bin] ? sum/(counts[bin]*255) : 0`, preserve all eight dot bit positions and zero-mask behavior. Use an exported pure canonical-calibration helper only if needed for direct arithmetic testing; do not expose mutable painter cache internals.
- [ ] Test actual fractional `drawImage` destination geometry and scale1 vs view scale; F80/S4 mask192×320 paints without geometry truncation. Keep viewport/backing checks before dictionary/canvas construction. Oversized independent mask extents must be checked using their actual dimensions, regardless of small logical cells.
- [ ] Preserve MAX_BACKING_PIXELS=32,000,000 and four-dictionary limit. Charge `P*(N+2)` pixels conservatively for all glyph RGBA surfaces, tint scratch and one transient ImageData; the old N+1 omitted construction readback. Add a separate 32 MiB cap for painter-owned canonical mask/coverage/shape arrays; externally supplied calibration arrays stay caller-owned and must not be double-counted as painter allocations. Evict LRU until both owned bounds fit before canonical generation/first surface. Normal 192×320×256 remains valid (15,851,520 reserved pixel equivalents, ~15.01 MiB canonical arrays); fail larger requests before allocation without clamping. Native canvas overhead/target canvas/source/calibrator cache remain separate ownership, not a claimed combined heap limit.
- [ ] On eviction/failure release painter-owned surfaces by clearing references and zeroing their backing dimensions; never reset the caller's output canvas or mutate supplied calibration masks. Add tests for pixel/byte eviction, no canvas on over-budget input, creation failure rollback and caller-state restoration. Run `npx vitest run src/render/character-paint.test.ts`; require PASS plus existing alpha/tint/dictionary-reuse tests.

## Task 6: Protect legacy handoff and verify the coordinated delivery

- [ ] Write `src/render/legacy-adapter.test.ts` regression cases: `legacySettingsToCharacter` still validates original converter ranges and produces unchanged existing settings; `gridToDocument` rejects logical cells outside unchanged document width1..64/height1..128, plus existing >300-side refusal, before creating cells/documents. Expanded packed geometry may paint without being representable in the legacy editor. Return an explicit adaptation-required error; never resize/clamp or widen `AsciiDocument` for convenience. Preserve old successful handoffs and calibrated-font fidelity caveat.
- [ ] Implement only that explicit handoff guard; run `npx vitest run src/render/character-contract.test.ts src/render/glyph-calibration-budget.test.ts src/render/glyph-calibration.test.ts src/render/wasm-character.test.ts src/render/character-paint.test.ts src/render/legacy-adapter.test.ts src/converter/engine.test.ts src/core/document.test.ts`. Add legacy settings-range assertions to the existing adapter tests; there is no standalone converter/settings test file.
- [ ] Run Rust tests, rebuild WASM and the existing worker/service regressions after the coordinated changes; run `npm run typecheck` and scoped ESLint on owned TS files. Record exact commands/results and resource examples in `docs/verification/character-geometry.md`. Real-browser calibration/paint smoke checks use a self-hosted verified font at F3/F11/F80 and S1/S4 with an appropriately small source under cell/backing limits; fixtures must distinguish browser/font differences from geometry corruption. Do not infer reference glyph alignment or speed from mocked Canvas unit tests. No benchmark is required to write or accept the range/budget contract.
- [ ] Review exact owned diffs, preserve unrelated work and report completion limits. This delivery enables compatible geometry and bounded internal calibration ownership; project tone adapter, top-baseline alignment, full-source export framing and product/UI readiness remain their own acceptance gates. No automatic commit/push.

## Planning report

The proposed 1..512 logical geometry supports all observed F3..80/S1..4 values while leaving legacy contracts unchanged. Calibration uses a 16 MiB assembled-result cap, 128 MiB aggregate owned/reserved budget including pending delivery copies, 32 MiB byte LRU and bounded job/subscriber counts; clear cannot erase old-generation reservations. Caller snapshot retention after handoff and independent WASM/painter/source/output allocations are explicitly outside that module budget. Tiny canonical Braille zero-bin normalization and incompatible legacy handoff are required regressions, not optional polish. This document contains no production changes or executed test results.
