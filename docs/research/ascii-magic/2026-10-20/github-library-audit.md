# Public GitHub library audit

Audited 2026-10-20. Repository: [kailashsr38/ascii-magic-art](https://github.com/kailashsr38/ascii-magic-art). Pinned commit: **`de88962156057cbef583bd265bf55e23d6c5e30d`**. Read-only checkout: `/tmp/asciimorph-ascii-magic-art-reference`, clean when inspected. Package name `ascii-magic-art`, version **1.0.2**, ESM, Node ≥18, no declared dependencies; its published files list includes pieces, lib, runtime, bin, categories and NOTICE. [package.json:1–44](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/package.json#L1-L44)

**Finding: this repository supplies the animated ASCII pieces library, not the complete ASCII Magic image/video editor or its 96-mode rendering engine.** Its documented contract is `create() → draw(seconds) → string | {text, color}` with metadata and a palette. Its README directs photo/logo/video conversion to the separate ASCII Magic product. [README.md:65–91](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/README.md#L65-L91), [README.md:123–127](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/README.md#L123-L127)

## Inventory

Observed **634 `pieces/*.js` files and 24 declared categories**, agreeing with the README. A Python text-only inventory extracted each literal `category` or `"category"` metadata field; all 634 resolved to declared categories. No piece modules were imported or evaluated. Category IDs and labels are defined in [categories.json:1–122](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/categories.json#L1-L122).

| Category ID | Pieces | Category ID | Pieces |
| --- | ---: | --- | ---: |
| landscapes | 58 | screens | 74 |
| live-data | 28 | explainers | 36 |
| lettering | 49 | solids | 25 |
| cosmos | 18 | motion-lab | 18 |
| weather | 16 | animals | 20 |
| things | 23 | algorithms | 25 |
| demoscene | 24 | arcade | 18 |
| frames | 12 | occasions | 14 |
| cities | 22 | mascots | 22 |
| empty-states | 22 | retro | 22 |
| science | 22 | music | 22 |
| food | 22 | india | 22 |

“634 pieces” does not mean 634 image-conversion styles. For example, `spinning-torus` creates a fixed 48×24 grid, computes animated torus coordinates/normals and a light dot product, then depth-tests character placement. This is a procedural scene generator. [pieces/spinning-torus.js:4–38](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/pieces/spinning-torus.js#L4-L38)

## Useful source and Rust implications

The following are static observations. The last column is an implementation inference for AsciiMorph, not a tested port or performance result.

| Source | Observed API/math | Potential application |
| --- | --- | --- |
| [runtime/glyphs.js:11–52](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/runtime/glyphs.js#L11-L52) | Packed measured Menlo ink coverage; nominal shade-block coverage; Braille coverage from bit count; cached unique glyph ramps sorted by coverage. Eleven `LOOKS` keys, including Original, ten alternate looks. | Font calibration and ramp ordering are useful for character matching. The fixed Menlo measurements and unknown-glyph fallback of 30% should not be treated as measurements for every font. |
| [runtime/glyphs.js:99–151](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/runtime/glyphs.js#L99-L151) | Shading detector preserves ordinary text/line work; `densityGrid` combines glyph coverage with weighted RGB luminance, stretches the occupied range and applies gamma; `restyle` selects a ramp glyph or ordered 4×4 Bayer result. | A Rust frame-to-frame restyler and semantic preserve mask can share a compact cell buffer. This function consumes existing character frames, not decoded input pixels. Actual gamma fallback is **0.35** at line 128; nearby explanatory comment says 0.75. |
| [runtime/glyphs.js:159–188](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/runtime/glyphs.js#L159-L188) | Coarse-grid merge uses mean darkness and color from the darkest eligible cell; `withLook` wraps the time-to-frame function. | Reusable thumbnail reduction and deterministic time-driven template interfaces. |
| [runtime/canvas.js:115–140](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/runtime/canvas.js#L115-L140), [335–355](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/runtime/canvas.js#L335-L355) | Canvas 2D glyph/color atlas, grown on demand and reset by cell dimensions/DPR; text drawing stamps cached tiles, full blocks batch by color. | Keep glyph rasterization and atlas resource management in the browser renderer while Rust produces cell IDs/colors. This is a Canvas atlas, not evidence of a GPU instancing API. |
| [runtime/canvas.js:160–228](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/runtime/canvas.js#L160-L228), [237–243](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/runtime/canvas.js#L237-L243) | Halftone tone range uses a 512-bin percentile histogram, bilinear brightness sampling, nearest color, tone curve and ordered thresholds over dot-size levels. Small dots/pixels use direct pixel buffers; larger dots batch paths. ImageData is reused by canvas dimensions. | Rust histogram/tone/threshold math and reusable scratch buffers are useful for halftone output. No measured speedup follows from inspecting this code. |
| [runtime/canvas.js:382–432](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/runtime/canvas.js#L382-L432) | `frameFor` and `renderTo` apply a look, fit/margin/cell aspect/background, paint one existing frame, and expose nine output-size presets. | Use a shared frame model for preview and export sizing. The module paints a canvas; it does not itself encode GIF or MP4. |
| [runtime/player.js:50–133](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/runtime/player.js#L50-L133) | `play` honors reduced motion/still, caps DPR at 2, merges tiny photo cells below 5px, caches CSS measurement for 500ms, throttles FPS, staggers player phases, skips invisible rendering with IntersectionObserver, and returns cleanup. | Catalog preview scheduling and lightweight playback lifecycle are reusable design ideas. Source-frame conversion still needs a separate pipeline. |
| [lib/kit.js:19–95](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/lib/kit.js#L19-L95), [98–201](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/lib/kit.js#L98-L201) | Grid with glyph/color/depth arrays; depth-tested put; line/shape/text primitives; deterministic Mulberry32, value noise, FBM, palette interpolation, rotation and perspective helpers. | Useful foundation for original Rust procedural templates. Match JS wrapping integer operations explicitly if porting seeded math for compatibility. |
| [lib/image.js:1–40](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/lib/image.js#L1-L40) | `imagePiece(meta, data, motion)` consumes prebuilt palette-key and 0–7 level grids, with glint/twinkle/water/breathe/drift and scene overlays. | Useful for animating preprocessed image templates. This is not a JPEG/PNG/video decoder or a general live image-to-ASCII converter. |

The web component dynamically imports a selected `pieces/{slug}.js` and passes display options to `play`; it does not contain the editor shell. [runtime/ascii.js:23–65](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/runtime/ascii.js#L23-L65)

## Bounded missing functionality

This checkout's top-level files, package manifest, all `runtime`/`lib` files, CLI entry points and validator were inspected, alongside representative procedural and image-based piece metadata. Literal category fields were inventoried across all pieces; the body of every scene was not manually reviewed.

Within that boundary, there is **no complete Studio/Flow application source, 105-tile editor catalog, source media decoding/import pipeline, paid editor shader/post-effect registry, recipe/account service, or GIF/MP4 encoder implementation**. The available runtime APIs operate on generated character frames and canvases. Source searches for decoder/encoder APIs (`ImageDecoder`, `VideoDecoder`, `createImageBitmap`, `MediaRecorder`, `toBlob`) in `runtime`, `lib`, `bin`, and `scripts` found no implementations. Searches for `cyanotype`, `liquidglass`, `webgl`, `supabase` and recipe support do not establish the corresponding editor systems here. Absence in this repository does not imply those systems do not exist in the website's other code.

`lib/image.js` and photo-piece comments refer to `scripts/from-image.py`, but the tracked `scripts` directory contains only `validate.mjs` and `stress.mjs` at this commit. The image preprocessing tool therefore is not supplied in this checkout. [lib/image.js:1–6](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/lib/image.js#L1-L6), [scripts tree](https://github.com/kailashsr38/ascii-magic-art/tree/de88962156057cbef583bd265bf55e23d6c5e30d/scripts)

The validator checks frame dimensions, palette keys, safe glyph ranges, animation changes over sampled times, and an average draw-time limit of 12ms. It was **read, not run**; its budget is not a measured browser paint budget or an AsciiMorph benchmark. [scripts/validate.mjs:33–78](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/scripts/validate.mjs#L33-L78)

## Observed license and notice scope

The package declares MIT, and LICENSE grants reuse/modification/distribution subject to including its copyright and permission notice in copies or substantial portions. If source or substantial code is incorporated, retain those notices with that incorporated material. This audit has copied no source into the product. [package.json:28–29](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/package.json#L28-L29), [LICENSE:3–21](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/LICENSE#L3-L21)

NOTICE explicitly separates embedded image data in `pieces/ocean-sunset.js` and `pieces/starry-ridge.js` from MIT: it remains under the Unsplash License. NOTICE names César Couto and Vincentiu Solomon and states restrictions concerning unaltered resale and competing photo services. Preserve this exception/provenance alongside those scenes if included; do not relabel their image data MIT. This reports the repository's notice, not an independent review of the external photo license. [NOTICE:1–16](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/NOTICE#L1-L16)

`temple-sunset` also describes itself as photo-derived, but NOTICE names only the two scenes above. Its original photo provenance is not established by this bounded audit. This observation does not add a third declared license exception. [pieces/temple-sunset.js:1–4](https://github.com/kailashsr38/ascii-magic-art/blob/de88962156057cbef583bd265bf55e23d6c5e30d/pieces/temple-sunset.js#L1-L4)

## Result for the rebuild

Use this repository as evidence and, subject to the observed notices, a potential source of animated templates, glyph density/restyling math, halftone primitives, atlas strategy and playback scheduling. It does **not** remove the need to independently implement the approved Rust media/render pipeline, the editor modes and full reference UI. No package was installed, no downloaded module or validation script was executed, and no application dependency or production source was changed by this audit.
