# Dither static closure — resume after this checkpoint

User priority: close Dither before another style, then remaining core styles → stacked effects → text/masks/lighting → animation exports → recipes/library/Flow. No later style started in this correction session. Main only; preserve historical/unrelated untracked files. This handoff records closure before the user-requested commit/push to main; consult git history for that checkpoint.

Authoritative outcome: docs/verification/dither-parity-2026-10-31.md and docs/research/ascii-magic/2026-10-31/dither-closure/verification-run.json.

- User approved controlled-randomness recapture. New dither-seeded matrix:56/56 zero-RGBA; default/selected backdrop matrix:14/14. All70 alpha and same-scale preview/export pairs exact. Existing unseeded56 PNGs and incoming32/56 report retained; intermediate54/56 diagnostic retained separately.
- Rust sampler fixed odd31×19 partial-alpha path: decoded PM bytes, lowp16.16 bilerp, ceil mips, matching recorded cache sequence1→2→3→12, stack8 permits level7. Arbitrary Chromium cache histories are not claimed.
- Diffusion f32 working color initialization before neighbor errors, three reusable rows, transparent numerical propagation/clear output. Eight independent full-plane fixtures span10rows and fractional bias.
- Halftone/Radial/WhiteNoise corrected. BlueNoise independent128×128 float32 high-pass field seeded123, static tile/no per-job allocation. TileSHA d284dd64c10567f7f8309db3ab8c6e78640b602cd5a6a0f9b2a30e86bd802029.
- Backdrop is input to dithering. Reuses FrameComposer scratch only in prepare_input mode. PNG PM rounding before filtering, floor raster sampling, half-up alpha8 then SkAlpha255To256, opacity before blur.14 Canvas input fixtures cover30/50/70%; dedicated partialalpha red79 regression.
- Native201 pass; focused26 pass after length assertions; JS854 pass+1existing skip; Next production build/typecheck pass; lint0errors3existing prototype warnings. Raw worker/production desktopChromium/Firefox/WebKit/mobile unique39pass9deliberate skips. Logs preserve interrupted/resumed run and corrected translucency fixture's focused rerun.
- Two independent read-only reviewers accepted after fixing stackdepth, alpha30/70 rounding, and partialalpha PM ordering. Browser fixture review accepted finalDitherOriginal-based translucency test.
- WASM SHA ba485d48ab847a9c1967d0eddf4bed9b4d8c9b844174da848f4f9f5f78469b1a,281642bytes. Real public3×/4× comparisons remain deferred. Animation unavailable.

Changed implementation: rust/src/styles/{dither.rs,dither_sampling.rs,dither_tables.rs,compose.rs}, public/wasm/asciimorph_engine.wasm. Repro scripts capture-dither-backdrops, generate-dither-blue-noise/backdrop-fixtures/diffusion-fixtures, controlled-RNG extension to capture-dither-software-reference. Strict gate playwright.dither-parity.config.ts nowdefaults to seeded evidence and includes14backdrops. ProductionDither test usesOriginal (None correctlyclear); translucent hover fixture usesDitherOriginal because Pixel/Mosaic ink is not source-alpha-preserving. Existing unrelated generated browser screenshots restored to HEAD.

Production server from testing remained at port3107 (PID1183 when inspected); do not indiscriminately kill user processes. Previous exec handles expired across the user's continue; resumed WebKit/mobile using /tmp/dither-production-resume.config.cjs against that existing server. This temporary config contains no app changes.

Next: continue remaining core styles with written specs/plans and independent gates; do not reopen accepted Characters/Pixel/Mosaic/Dither work without new evidence, retry Pro/auth, weaken RGBA thresholds, or equate this bounded static gate with full-site completion.
