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
