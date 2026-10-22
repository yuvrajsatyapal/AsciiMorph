# Worker scheduling diagnostic — 2026-10-21

One local headless Chromium sample used the actual production render service, module worker and accepted WASM binary at main2379847. Production TypeScript modules were served by an isolated local Vite server; no application route or source was modified. The temporary server and browser were closed afterward.

Input: owned512×512 opaque RGB gradient;160×90 Braille grid;4096 work units per numeric step. No font calibration was needed. Both paths used identical input/settings and the same WASM binary.

| Path | Observed duration | Steps |
| --- | ---: | ---: |
| Persistent worker result |2407ms total;2401.3ms compute including yields;5.1ms readback |475 |
| Direct browser WASM loop |38.9ms including begin/step/readback |475 |

The current worker schedules each4096-unit slice with `setTimeout(...,0)` and posts a progress message after each pending slice. Nested timer delay and message overhead are plausible contributors to the observed gap. This sample does not isolate each contributor, prove a universal ratio, measure complete UI/decode/paint latency, or establish p50/p95 performance. It does justify addressing scheduling before attaching a much larger full-frame profile to the worker.

The next worker integration should use a cancellable macrotask scheduler that avoids repeated nested timer clamping, bound compute per turn, and preserve preview/export fairness, cancellation, fatal recovery and disposal. Browser measurements must verify the actual production scheduler. The full pipeline benchmark/backend decision remains open; a faster direct Rust loop alone is insufficient acceptance.

Reproduction script for this local diagnostic: `/tmp/asciimorph-worker-yield-diagnostic.cjs` (ephemeral). It imports `src/render/service.ts` and `src/render/wasm-character.ts`, constructs the real `src/render/render.worker.ts`, and obtains both returned service timings and direct wall-clock timing. No reference-site code or user media was executed.

## Task 3 — bounded channel scheduling, 2026-10-22

The actual production `render.worker.ts` now injects `createMessageChannelScheduler`. Each posted turn performs at most64 numeric steps of4096 work units and checks a4ms wall-clock quantum between steps. Available preview/export lanes alternate after each numeric step. Progress is coalesced per active task per turn, including one actual final step-count update. Cancelled callbacks have unique discarded tokens; disposal/fatal failure clears callbacks and closes both ports. The timer adapter exists for injected runtimes/tests; the actual module worker uses MessageChannel.

Final rebuilt-WASM headless Chromium156.0.8078.4 diagnostic, same owned512×512 gradient and160×90 Braille settings:

| Path | Observed duration | Steps |
| --- | ---: | ---: |
| Bounded production worker |30.9ms total;28.9ms compute including yields;1.7ms readback;0.3ms queue |475 |
| Direct browser WASM loop |28.6ms including begin/step/readback |475 |

All four returned legacy grid arrays match the direct loop element-for-element. The actual production module worker also passes the independently specified fractional-mask profile RGBA fixture, equal preview/export frames, visible unavailable Blur context without losing the ready connection, and a5×2 frame whose2×0 floor grid is null. Browser page errors:0. Temporary Vite server/browser closed in finally. Reproduction: `/tmp/asciimorph-task3-browser-diagnostic.cjs`; full output `/tmp/asciimorph-task3-browser.log` (ephemeral local artifacts).

An earlier post-change check before the last conservative admission-preflight reorder observed33.8ms worker/27.8ms direct, also475steps and identical arrays. These are diagnostic samples, not a distribution or an isolated controlled benchmark. The previous2407ms/38.9ms observation and new30.9ms/28.6ms observation support removing the nested-timer scheduling bottleneck on this local case; they do not establish a universal speedup, p50/p95, decode/calibration/paint latency or the final CPU/GPU choice. Task9 remains the100-sample full-pipeline/backend gate. A turn can overrun4ms by one bounded numeric step or admitted begin/readback/serialization work; allocation initialization and output copies are not preemptible browser tasks.
