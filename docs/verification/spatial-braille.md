# Spatial Braille native prerequisite

The Rust render engine now supports dispatch 4 with real spatial Braille. Each cell samples eight independent 2×4 regions using row-major bit masks `[1,8,2,16,4,32,64,128]`; a separate alpha-weighted full-cell sample supplies color. Equal-mean cells with different dot locations produce different masks. Threshold equality, transparent pixels, partial cells, mapping inversion, crop-before-rotation and export scaling have explicit numerical fixtures.

The renderer uses the existing captured 256-glyph atlas and fixed blur8 compositor. It preserves blank U+2800, complete frame margins, source/atlas identity, cooperative work limits, session admission and one-shot resource release. No new worker, session, dependency or memory-budget increase was introduced. The checked-in WASM was rebuilt from the Rust source.

Validation: the complete offline Rust suite passed. Focused actual-WASM/wire validation passed 51 tests across `wasm-braille.test.ts`, `wasm-style.test.ts` and `style-wire.test.ts`. An independent reviewer reran the native suite and 19 WASM tests and accepted specification compliance and code quality with no material findings. Coverage includes all 256 patterns, single-dot locations, equal-mean differences, alpha/threshold boundaries, quarter turns, partial cells, scaled atlases, cancellation, captured ownership, exact-budget admission and one-byte-short rejection.

This establishes an independently specified native profile. It does not establish reference font or pixel equivalence. Studio integration and controls require their own browser/export acceptance. Dither, remaining families, full controls, effects, media, library and Flow remain separate work in the full rebuild.
