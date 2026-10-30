# Padded font22 batch oracle

`font22-batch.mask` contains14 input-order14×22 Courier alpha masks. `font22-batch.json` contains those masks plus the selected grid for the owned128×64 gradient, font11 at2×, contrast20. The grid selects scene content; it does not supply expected raster bytes.

`font22-batch.rgba` is the independently drawn full256×128 browser result:2048² RGBA8 texture,29×33 slots in first-appearance order, instanced triangle-strip quads, LINEAR sampling, premultiplied blending and Canvas readback. `node scripts/generate-characters-font22-fixture.mjs` regenerates it and compares every byte against the real reference export. Chromium156.0.8078.4 with the pinned software/SwiftShader flags gives zero differences. Native regression first failed at byte6048 (255 versus244), then passed all131072bytes. The separate RGBA32F probe is `scripts/probe-characters-sampler.mjs`.

The live32-case independent GL/Canvas oracle in `tests/e2e/characters/webgl-batch-oracle.ts` covers fonts3/11/17/47, scales1–4 and None/Blur. It validates rasterization/composition using measured masks and the selected native grid; it does not replace real public-app selection/atlas verification at3×/4×, which the user deferred because exports require Pro.
