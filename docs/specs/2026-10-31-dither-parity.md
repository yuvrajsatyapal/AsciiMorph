# Dither reference parity correction

Continue the approved style sequence after Characters. Real 3×/4× public exports remain deferred. Use the owned 128×64 synthetic gradient, pinned Chromium software Canvas/SwiftShader and verified Original Image export. Capture genuine 1×/2× PNGs and manifest settings, backend, browser version, source/PNG hashes and dimensions. Historical captures remain diagnostics.

## Plan and gates

1. Capture default and Strength 0/50/100, isolate sampling with pixel sizes 1/2/3/12, all four diffusion kernels and ordered patterns. Validate retained source before accepting PNGs.
2. Compare actual WASM complete RGBA against independently decoded reference PNGs. Preserve failing reports. Require zero differing RGBA bytes and exact same-scale preview/export for every accepted case.
3. Record numerical findings, write failing independent native regressions first, then correct sampling, strength and diffusion. Keep all 15 algorithms genuine; preserve resource admission, cooperative stepping, source identity, crop/rotation, cancellation and deterministic output. No tolerance increases or new budget allowances.
4. Rebuild WASM and run native, JS and browser gates; review changes independently before closure. Update the superseded local identity rule only with verified evidence.
5. Continue remaining core styles, stacked effects, text/masks/lighting, animation exports, then recipes/library/Flow in that order.

## Initial hypotheses (not accepted reference evidence)

Read-only public source inspection suggests browser high-quality downsampling to rounded source/pixelSize dimensions, nearest enlargement, quantization at every strength, strength-scaled pattern threshold/error, serpentine diffusion, and byte-clamped contrast before diffusion. These must be established by independent tests and genuine public captures before closure.

## Controlled closure evidence

The user authorized a new reference capture with controlled randomness on 31 October. Preserve the previous unseeded 56 PNGs as historical evidence. The replacement `dither-seeded` capture overrides only the standard `Math.random` primitive with a recorded xorshift32 seed 123 per callsite; unrelated UI consumers cannot advance the noise generator's stream. The manifest records the 16,384 draws used by the reference's 128×128 noise tile. Generate the local static tile independently as float32 white noise minus its toroidal 5×5 mean, then normalize to bytes. The tile is fixed for deterministic preview/export; no additional runtime allocation or noise-seed control is introduced.

Also require the 14 independent `dither-backdrops` PNGs: untouched default, Original, None, Solid, selected Blur 8, Original 50% and Blur 50%, each at 1×/2×. Untouched Dither samples the retained source; a selected backdrop is prepared before dithering. Apply image opacity before blur, and bypass the family post-compositor for this completed Dither frame. Preserve captured common-control evidence rather than assuming Characters composition semantics.

The 31×19 sampling fixture records sequential draws at pixel sizes 1, 2, 3, 12. Chromium's image decode cache changes odd-size results according to preceding draws. The local renderer uses the deterministic ceil-mip path matching that recorded sequence; this is not a promise to reproduce every browser cache history. Keep full-frame byte regressions for both the even and odd sampling fixtures, all four float32 diffusion kernels across recycled rows, transparent error propagation, prepared-input RGBA and bounded/cancellable preparation.
