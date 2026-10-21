# Character sampling and ramp follow-up

Read-only static inspection on 2026-10-21; source SHA-256 and original character ranges are in [the evidence JSON](character-sampling-evidence.json). No downloaded implementation was executed or copied into production. These observations concern the ordinary character branch with fixed input imageData, not upstream image preparation or every optional effect.

The common path estimates a luminance range on a sampled grid, using 0.299R+0.587G+0.114B and a normalization span of 1 when the range is zero. Each cell selects an input pixel at its floored center mapped into imageData dimensions. This differs from the current Rust core's area averaging.

For fixed imageData, normalized luminance is computed before contrast/brightness adjusts the RGB channels. The later ordinary nonrandom ramp index uses that normalized luminance plus threshold/edge terms; it directly indexes the supplied ramp. No coverage-sorted dictionary selection is visible in this bounded branch. Upstream preparation, threshold/edge variants, alpha, animation, grading and style branches remain separate fixture work.

Consequently, the proved affine tone conversion is only a stage mapping. It cannot turn the current sampling/matching core into reference character-output parity by itself. A reference-style implementation or an explicit independent algorithm choice needs sampling/ramp fixtures before the production UI is described as equivalent. Geometry widening and the legacy converter remain useful independent foundations.
