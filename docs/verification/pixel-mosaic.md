# Pixel and Mosaic native profiles

Native style dispatch 10 (Pixel) and 11 (Mosaic) implement the closed independent version 1 contracts in [initial-family-contracts.json](../research/ascii-magic/2026-10-20/initial-family-contracts.json). Other new style dispatch IDs remain unavailable. This checkpoint does not enable their Studio catalog entries or claim reference-output equivalence.

Both profiles use exact-area, alpha-weighted sampling with unrounded intermediate RGB; rational cell pitch `3F/5 × F`; clipped partial cells; crop before quarter-turn rotation; and source-scaled output. Pixel quantizes each toned channel to six levels. Mosaic rounds toned channels once and samples complete square, wide, or tall merged rectangles. Pixel centers select half-open tile ownership. The complete result includes the shared original-source premultiplied resize, six-pass fixed blur 8 approximation, and straight-alpha source-over composition.

Hand-computed fixtures distinguish baseline opaque 128 as Pixel 153 versus Mosaic 128, merged red/blue Mosaic 128, partial edges on 17×13 and 2× output, rational boundaries, crop/rotation, hidden transparent RGB, partial alpha, opacity 0 backdrop, supported control extrema, work budgets 1/7/4096, cancellation, source identity and one-shot output. Real release WASM tests read back full Pixel/Mosaic frames through the generic 16-byte output header; malformed-output test shims remain separate.

The first independent review found a full-frame scratch allocation inside a render step. The fix allocates the compositor and moved layer at job construction, reports actual layer/scratch capacity excess to session admission, and retains those buffers through the tile-to-composition transition. A recording-allocator regression observed a 65,536-byte allocation in one work-1 step before the fix and passes afterward.

On this native host, the tiny 1×1 peak is 820 bytes, or 933 bytes with 113 bytes of retained-other reservation. Exact budgets pass and one byte below rejects for both families/all Mosaic shapes. Accounting includes source capacity/metadata, job metadata, layer, both f32 scratch planes, future RGBA serialization and 16-byte header. Native 256 MiB, aggregate active-job limits and Studio source/export admission policies remain unchanged.

Current release WASM SHA256: `dd5f8380a06617fed3e7fbed1a99561d5c7f02cc0dd791bedea2644e50eb2c2a`.

Studio selection/history/resource discrimination, schema controls, captured browser exports, actual production-route smoke, and visual/reference comparison remain pending integration work. No GPU, p95, 4K or mobile parity claim is made.

Independent fix review accepted spec and quality with no open findings. Final parent verification passed all 116 native tests, the full JavaScript suite with two workers (755 passed, one existing skip), and the production Next build. The earlier default-concurrency run timed out in worker startup and an unchanged Studio test; affected files passed in isolation, and the bounded full run passed without code changes for that timeout.
