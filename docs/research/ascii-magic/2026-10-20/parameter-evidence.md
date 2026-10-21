# Parameter and default evidence

Date: 2026-10-20. Scope: captured public JavaScript and all 16 explicitly referenced lazy dependencies in `/tmp/asciimorph-reference-2026-10-20`. Canonical catalog files were not modified. [parameter-evidence.json](parameter-evidence.json) is the machine-readable ledger.

This pass separates **baseline state defaults**, **preset/tile assignments**, **renderer state reads**, and **declared shader and native UI control descriptors**. These evidence types are not interchangeable. All findings are ordinary STATIC observations, not completed REA semantic analysis or runtime verification.

## Captured versus remaining

| Evidence | Captured | Limit |
| --- | ---: | --- |
| Recipe baseline state keys | 688 | Includes 650 ordinary keys and 38 shader keys; not 688 visible controls. |
| Initial-state fields | 723 | Includes transient/source/mask/history state; all overlapping recipe values agree. |
| Shader descriptors with label, default, min, max and step | 38 across 5 modes | Declared registry schema; no executed UI validation. |
| Post-effect defaults | 121 fields across 28 effects | Follow-up captured 85 UI descriptors; composite fields and defaults remain separate. |
| Literal demo/restyle state patches | 196 | Sample assignments, not defaults or exhaustive supported values. |
| Original preset/renderer/shader state-key associations | 38 / 96 | Preserved separately from the subsequent native UI declarations. |
| Modes with declared shader parameter schema | 5 / 96 | Separate from native UI declarations; no complete runtime schema is claimed. |
| Complete runtime-verified mode schemas | 0 / 96 | All runtime behavior remains unverified. |
| Additional lazy dependency chunks captured | 16 / 16 | 1,772,993 bytes total, bounded public HTTPS retrieval, SHA-256 in `lazy-asset-manifest.json`. |
| Native UI descriptor variants | 521 across 497 state keys | 520 literal labels; 81 modes have single-mode local guard evidence. |
| Native range descriptors | 403 | 402 literal min/max pairs and 89 explicit step values; missing/dynamic attributes stay null. |
| Native select descriptors | 64 | 62 complete literal option lists; options are specific to their captured UI component. |
| Gradient source mode descriptors | 37 across 8 source modes | A different namespace from the 96 renderer modes. |

## Evidence locations

All ranges are zero-based Unicode character offsets, exclusive end, in UTF-8-decoded files. They are not byte positions. The JSON includes each source SHA-256, public captured URL and exact field/helper-call ranges. Source digests were checked against `asset-manifest.json`.

- `05tjcpn0cqaiz.js` `[11935,22476)`: `RECIPE_DEFAULTS`, including a spread of known shader defaults. Each of the 650 literal non-shader keys retains its individual property range.
- Same file `[24217,36931)`: `createDefaultState()` returned literal state object. Overlapping baseline values match the recipe defaults; the extra fields are not automatically controls.
- Same file `[22502,24136)`: `POSTFX_DEFAULTS`. Every effect field retains its own literal range.
- `2cjp552-p57it.js` shader definition object `[973,2918)`: previously captured schema, now refined to exact helper-call evidence for all 38 descriptors, with helper argument/default evidence retained.
- `09wgr6f2vxer0.js` `DITHER_ALGOS`: exported literal list of 15 supported algorithm IDs. It establishes options for `ditherAlgo`, not their display labels.

No ranges were inferred from numeric clamps, normalization factors, preset extrema or renderer arithmetic. Unknown label/min/max/step/options fields remain `null`. String values in examples are not promoted to complete enum sets.

## Mode association strength

A literal patch such as `{renderMode:"mosaic",fontSize:12,...}` proves the captured code assigns that state key to that mode in a demo/restyle preset. It does not prove a corresponding control exists, the renderer consumes it, or the mode selector initializes it to that value. The JSON records every patch value separately from baseline defaults. Pinned catalog patches retain their tile identity.

Stronger associations were captured for three named or explicitly guarded renderer paths:

| Mode | Proven mode-specific state reads | Source range |
| --- | --- | --- |
| `dither` | `ditherAlgo`, `ditherAngle`, `ditherAnimDir`, `ditherAnimSpeed`, `ditherAnimate`, `ditherCellSize`, `ditherChromaMode`, `ditherContrast`, `ditherOffsetX`, `ditherOffsetY`, `ditherPalette`, `ditherScale`, `ditherShimmer`, `ditherStrength`, `ditherThreshold` | `09wgr6f2vxer0.js` `[34270, 40463]` |
| `schematic` | `schematicColor`, `schematicColorMode`, `schematicInvertImage` | `09wgr6f2vxer0.js` `[56813, 65630]` |
| `3d` | `shape3dCellSize`, `shape3dDarkShade`, `shape3dFlip`, `shape3dHSpacing`, `shape3dLightShade`, `shape3dOutline`, `shape3dTopShade`, `shape3dVSpacing` | `09wgr6f2vxer0.js` `[115013, 117251]` |

These read sets are deliberately namespace-filtered, not exhaustive global input sets. The `3d` association additionally records the explicit `eB="3d"===eC` condition.

| Original state assignment/schema association pass | Associated keys | Labels known before UI follow-up |
| --- | ---: | ---: |
| `characters` | 14 | 0 |
| `dither` | 21 | 0 |
| `block-chars` | 6 | 0 |
| `dots` | 8 | 0 |
| `mixed` | 6 | 0 |
| `pixel` | 7 | 0 |
| `mosaic` | 10 | 0 |
| `lego` | 4 | 0 |
| `cross` | 6 | 0 |
| `diamond` | 7 | 0 |
| `lines` | 4 | 0 |
| `diagonal` | 6 | 0 |
| `braille` | 7 | 0 |
| `3d` | 13 | 0 |
| `disco` | 4 | 0 |
| `stippling` | 5 | 0 |
| `crt` | 1 | 0 |
| `lowpoly` | 3 | 0 |
| `sketch` | 2 | 0 |
| `truchet` | 2 | 0 |
| `flowfield` | 3 | 0 |
| `engraving` | 1 | 0 |
| `dreamdust` | 1 | 0 |
| `forms` | 6 | 0 |
| `schematic` | 3 | 0 |
| `lofi` | 1 | 0 |
| `mezzotint` | 2 | 0 |
| `crosshatch` | 1 | 0 |
| `neongrid` | 1 | 0 |
| `emboss` | 1 | 0 |
| `halftonecmyk` | 18 | 0 |
| `flutedglass` | 4 | 0 |
| `liquidglass` | 7 | 0 |
| `cyanotype` | 9 | 9 |
| `hexhalftone` | 6 | 6 |
| `paperstock` | 12 | 12 |
| `oilpool` | 6 | 6 |
| `anodized` | 5 | 5 |

## Shader control descriptors

These five shader registry definitions remain complete declared shader descriptor sets. The native UI follow-up below adds separately scoped declarations. Shared numeric blend indices expose 14 named choices; seed fields expose their explicit 0–999 bounds. The JSON retains every option string, state key, helper call, and exact source range.

| Mode | State key | Label | Default | Min | Max | Step |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `cyanotype` | `sfx_cyanotype_exposure` | Sun Time | 1 | 0.2 | 2 | 0.01 |
| `cyanotype` | `sfx_cyanotype_blue` | Prussian Depth | 0.65 | 0 | 1 | 0.01 |
| `cyanotype` | `sfx_cyanotype_age` | Yellowing | 0.5 | 0 | 1 | 0.01 |
| `cyanotype` | `sfx_cyanotype_paper` | Paper Tooth | 0.3 | 0 | 1 | 0.01 |
| `cyanotype` | `sfx_cyanotype_bleed` | Wick | 0.25 | 0 | 1 | 0.01 |
| `cyanotype` | `sfx_cyanotype_brush` | Ragged Coat | 0 | 0 | 1 | 0.01 |
| `cyanotype` | `sfx_cyanotype_rinse` | Rinse Streaks | 0 | 0 | 1 | 0.01 |
| `cyanotype` | `sfx_cyanotype_blendmode` | Blend Mode | 0 | 0 | 13 | 1 |
| `cyanotype` | `sfx_cyanotype_seed` | Seed | 0 | 0 | 999 | 1 |
| `hexhalftone` | `sfx_hexhalftone_size` | Dot Size | 13 | 3 | 40 | 0.5 |
| `hexhalftone` | `sfx_hexhalftone_angle` | Screen Angle | 0 | 0 | 60 | 1 |
| `hexhalftone` | `sfx_hexhalftone_color` | Photo Colour Ink | 0 | 0 | 1 | 0.01 |
| `hexhalftone` | `sfx_hexhalftone_paper` | Paper Tone | 0.45 | 0 | 1 | 0.01 |
| `hexhalftone` | `sfx_hexhalftone_shape` | Dot Shape | 0 | 0 | 1 | 0.01 |
| `hexhalftone` | `sfx_hexhalftone_blendmode` | Blend Mode | 0 | 0 | 13 | 1 |
| `paperstock` | `sfx_paperstock_intensity` | Paper Strength | 0.8 | 0 | 1 | 0.01 |
| `paperstock` | `sfx_paperstock_crumple` | Crush | 0.95 | 0 | 2 | 0.01 |
| `paperstock` | `sfx_paperstock_crumple_scale` | Crease Size | 5 | 1 | 10 | 0.1 |
| `paperstock` | `sfx_paperstock_flatness` | Smoothing | 7 | 1 | 60 | 0.1 |
| `paperstock` | `sfx_paperstock_displace` | Warp | 0.0016 | 0 | 0.08 | 0.0001 |
| `paperstock` | `sfx_paperstock_fiber` | Pulp Fibres | 0.44 | 0 | 1 | 0.01 |
| `paperstock` | `sfx_paperstock_fiber_scale` | Fibre Length | 1.7 | 0.5 | 4 | 0.01 |
| `paperstock` | `sfx_paperstock_light_angle` | Lamp Angle | 0.18 | 0 | 1 | 0.01 |
| `paperstock` | `sfx_paperstock_light_elev` | Lamp Height | 0.52 | 0 | 1 | 0.01 |
| `paperstock` | `sfx_paperstock_tear` | Torn Edge | 0 | 0 | 1 | 0.01 |
| `paperstock` | `sfx_paperstock_blendmode` | Blend Mode | 0 | 0 | 13 | 1 |
| `paperstock` | `sfx_paperstock_seed` | Seed | 0 | 0 | 999 | 1 |
| `oilpool` | `sfx_oilpool_scale` | Scale | 1 | 0.3 | 3 | 0.01 |
| `oilpool` | `sfx_oilpool_bands` | Bands | 0.6 | 0 | 1 | 0.01 |
| `oilpool` | `sfx_oilpool_strength` | Strength | 0.6 | 0 | 1 | 0.01 |
| `oilpool` | `sfx_oilpool_islands` | Puddle Islands | 0 | 0 | 1 | 0.01 |
| `oilpool` | `sfx_oilpool_blendmode` | Blend Mode | 0 | 0 | 13 | 1 |
| `oilpool` | `sfx_oilpool_seed` | Seed | 0 | 0 | 999 | 1 |
| `anodized` | `sfx_anodized_shift` | Oxide Shift | 0.18 | 0 | 1 | 0.01 |
| `anodized` | `sfx_anodized_brush` | Brushing | 0.5 | 0 | 1 | 0.01 |
| `anodized` | `sfx_anodized_metal` | Metal | 0.6 | 0 | 1 | 0.01 |
| `anodized` | `sfx_anodized_torch` | Torch Rings | 0 | 0 | 1 | 0.01 |
| `anodized` | `sfx_anodized_blendmode` | Blend Mode | 0 | 0 | 13 | 1 |

## Exact lazy dependencies — captured in the follow-up

The source contains import references and dependency factories for the following groups. All 16 unique URLs below were fetched successfully in the follow-up. `2lr2okzrhyxxk.js` contains the properties panels; `1e9ankkwjbloq.js` contains post-effect and gradient-source descriptor registries. Downloaded JavaScript was read and parsed as inert text only.

These are literal dependency paths, not endpoints inferred from feature names. Shared dependencies are intentionally repeated under their owning factory groups. The per-file 4 MB and 20-second limits and digests are recorded in `lazy-asset-manifest.json`.

### DesktopStage — import `8797`

Import reference: `2l9zpxby2cme3.js` `[504, 513]`. Factory: `1ipw8y2wcivpy.js` `[28904, 29366]`. All its listed chunks are now in the local captured set.

- [2p8lqnc5r1wt7.js](https://www.ascii-magic.com/app/_next/static/chunks/2p8lqnc5r1wt7.js)
- [2bpjqlb3d7pan.js](https://www.ascii-magic.com/app/_next/static/chunks/2bpjqlb3d7pan.js)
- [3xbkq75mfrlgb.js](https://www.ascii-magic.com/app/_next/static/chunks/3xbkq75mfrlgb.js)
- [3cr1q6k-0qp_q.js](https://www.ascii-magic.com/app/_next/static/chunks/3cr1q6k-0qp_q.js)
- [1e9ankkwjbloq.js](https://www.ascii-magic.com/app/_next/static/chunks/1e9ankkwjbloq.js)
- [3kyu52o0ubrsv.js](https://www.ascii-magic.com/app/_next/static/chunks/3kyu52o0ubrsv.js)
- [2lr2okzrhyxxk.js](https://www.ascii-magic.com/app/_next/static/chunks/2lr2okzrhyxxk.js)
- [1an2_4t60qzr1.js](https://www.ascii-magic.com/app/_next/static/chunks/1an2_4t60qzr1.js)
- [1w_w6bk2u9ijc.js](https://www.ascii-magic.com/app/_next/static/chunks/1w_w6bk2u9ijc.js)
- [1citd-91emiv-.js](https://www.ascii-magic.com/app/_next/static/chunks/1citd-91emiv-.js)
- [3r_arwvnmlqld.js](https://www.ascii-magic.com/app/_next/static/chunks/3r_arwvnmlqld.js)
- [35duo3c5unmuj.js](https://www.ascii-magic.com/app/_next/static/chunks/35duo3c5unmuj.js)

### MobileShell — import `8240`

Import reference: `2l9zpxby2cme3.js` `[544, 553]`. Factory: `1ipw8y2wcivpy.js` `[29367, 29564]`. All its listed chunks are now in the local captured set.

- [1l91ih9mmvrji.js](https://www.ascii-magic.com/app/_next/static/chunks/1l91ih9mmvrji.js)
- [2p8lqnc5r1wt7.js](https://www.ascii-magic.com/app/_next/static/chunks/2p8lqnc5r1wt7.js)
- [3cr1q6k-0qp_q.js](https://www.ascii-magic.com/app/_next/static/chunks/3cr1q6k-0qp_q.js)
- [3r_arwvnmlqld.js](https://www.ascii-magic.com/app/_next/static/chunks/3r_arwvnmlqld.js)

### additional pro renderers — import `1332`

Import reference: `09wgr6f2vxer0.js` `[120176, 120185]`. Factory: `1ipw8y2wcivpy.js` `[27573, 27771]`. All its listed chunks are now in the local captured set.

- [25m7tjigtxes6.js](https://www.ascii-magic.com/app/_next/static/chunks/25m7tjigtxes6.js)
- [3nkw2beysazoh.js](https://www.ascii-magic.com/app/_next/static/chunks/3nkw2beysazoh.js)
- [1w_w6bk2u9ijc.js](https://www.ascii-magic.com/app/_next/static/chunks/1w_w6bk2u9ijc.js)
- [2d-1l54v26p8c.js](https://www.ascii-magic.com/app/_next/static/chunks/2d-1l54v26p8c.js)

## Remaining questions

- Verify parent mounting, panel ordering, responsive layouts, source conditions and entitlement rules. The native declaration pass establishes local mode guards only.
- Analyze the captured additional pro renderer dependencies to establish state-to-output behavior. Downloading renderer source and parsing controls does not close that semantic gap.
- Establish each mode selector’s initialization/reset behavior. Global recipe and initial-state defaults are captured; the mode-switch defaults remain explicitly unknown.
- Record actual UI control visibility and dependencies at desktop/mobile sizes, including Pro controls and source-dependent sections.
- Preserve renderer-supported IDs separately from display labels and compatibility defaults. Do not generate production slider limits from this ledger’s sample values.

Method: restricted parser of literal objects, arrays, strings, numbers and booleans; explicit known shader-spread expansion; inert text searches for named renderer paths and dependency factory arrays. No downloaded code was imported, evaluated or rendered; no installs, production edits, or canonical inventory changes were made.


## Lazy UI follow-up: exact declarations with explicit scope

The machine-readable additions are `nativeUiControls`, `postEffectControlSchemas`, `gradientSourceSchemas`, `fontEvidence`, and `skippedUiCandidates`. No renderer bodies, shaders or competitor implementation were copied into the ledger. Original literal preset assignments remain in `presetPatches`; their values have not been promoted to slider bounds or defaults.

Each native UI record has a state `key`, exact literal `label` where resolvable, baseline `default` with `defaultScope`, explicit `min`/`max`/`step`, complete literal `options` or `null`, and exact original-source ranges. Records represent descriptor variants: a shared key may use different labels and bounds across modes. Existing top-level parameter fields are refined only where every captured variant agrees. A native range with no `step` attribute retains `step: null`; the browser's implicit behavior is not claimed as a captured declaration.

`locallyPermittedModes` records only the result of literal mode guards inside the declaring component. A 96-mode set means no local mode restriction was established, not that the control is mounted or visible in every mode. `conditionalVisibilityUnknown` and `unresolvedVisibilityRanges` preserve unresolved state/source conditions. Parent component mounting and actual rendered visibility were not evaluated. All `modeSwitchDefaults`, `completeControlSchema` and runtime verification values remain unknown/false.

The extraction expanded literal array maps, safely resolved mode-only conditionals, honored parameter shadowing, and read two known numeric helper declarations. It skipped 28 candidates whose scalar state key was not established, including structured light fields, custom palette entries and dynamic shader/post-effect plumbing. Existing shader descriptors and the new separate post-effect registry cover some dynamic plumbing without pretending the skipped native callbacks were resolved.

### Exact descriptor examples

These defaults are recipe baselines, not proven mode-switch resets. A dash means an unknown or inapplicable field.

| Local mode | Key | Label | Baseline default | Min | Max | Step |
| --- | --- | --- | --- | --- | --- | --- |
| dither | ditherScale | Pixel Size | 2 | 1 | 12 | — |
| crt | crtIntensity | Effect Strength | 100 | 0 | 200 | — |
| lens | lensdCount | Layers | 35 | 2 | 50 | 1 |
| halftonecmyk | hcContrast | Contrast | 1.25 | 0 | 2 | 0.01 |
| twirl | distortAmount | Amount | 50 | -300 | 300 | — |
| polar | distortAmount | Rotation | 50 | 0 | 100 | — |
| ripple | distortWavelength | Wavelength | 40 | 5 | 100 | — |
| glassorb | orbRefraction | Refraction | 55 | 0 | 100 | — |

### Post-effects and gradient sources

`1e9ankkwjbloq.js` declares 85 post-effect controls across all 28 existing effect keys. Literal labels, ranges and option objects are preserved. Composite XY controls retain their axis keys and separate baseline values. Omitted descriptor steps remain null; where the shared renderer explicitly falls back to step 1, that fallback is separately scoped to its component evidence. No preset named “Default” is used as baseline evidence.

The same chunk declares eight gradient-source modes: `soft`, `mesh`, `smoke`, `aurora`, `plasma`, `marble`, `waves`, and `iridescent`, totaling 37 uniform descriptors. These have explicit own defaults and bounds. They are source-generation schemas, not additions or aliases to the 96 rendering modes; `marble` and `waves` in these two namespaces must remain distinct.

### Font evidence

The captured text-overlay dropdown uses state key `textFont`, baseline `Inter`, and 27 exact options: Inter, Poppins, Montserrat, Work Sans, DM Sans, Space Grotesk, Archivo, Bebas Neue, Anton, Oswald, Alfa Slab One, Righteous, Bungee, Playfair Display, Instrument Serif, DM Serif Display, Libre Baskerville, Cormorant Garamond, JetBrains Mono, IBM Plex Mono, Space Mono, Courier Prime, Roboto Mono, Caveat, Permanent Marker, Shadows Into Light, and Pacifico. This is the overlay font picker, not the ASCII glyph family.

No `fontFamily` baseline state key or ASCII glyph font-family dropdown was established in the captured properties panel. Fixed renderer font-family substrings are recorded separately: `"Courier New", Courier, monospace` in the general atlas and beacon paths, and `ui-monospace, Menlo, Consolas, monospace` in an ASCII compose path. Those fixed family reads do not establish selectable options or a font-family control default.

### Modes with locally single-mode UI declarations

The following counts exclude shared/multi-mode descriptor records and the separate five shader registries. Counts show captured declaration variants, not completeness or simultaneous visibility.

| Mode | UI descriptor variants | Distinct keys |
| --- | ---: | ---: |
| `asciiStudio` | 3 | 3 |
| `dither` | 12 | 12 |
| `dots` | 1 | 1 |
| `frostedglass` | 6 | 6 |
| `motionblur` | 1 | 1 |
| `pixel` | 1 | 1 |
| `mosaic` | 1 | 1 |
| `lego` | 1 | 1 |
| `3d` | 8 | 8 |
| `disco` | 2 | 2 |
| `stippling` | 4 | 4 |
| `waves` | 7 | 6 |
| `risograph` | 5 | 5 |
| `crt` | 7 | 7 |
| `specimen` | 10 | 10 |
| `smudge` | 6 | 6 |
| `twirl` | 1 | 1 |
| `ripple` | 1 | 1 |
| `zigzag` | 1 | 1 |
| `polar` | 2 | 2 |
| `shear` | 1 | 1 |
| `pixelsort` | 6 | 6 |
| `oilpaint` | 3 | 3 |
| `lowpoly` | 4 | 4 |
| `comic` | 5 | 5 |
| `sketch` | 6 | 6 |
| `watercolor` | 5 | 5 |
| `chrome` | 5 | 5 |
| `hexmosaic` | 4 | 4 |
| `stainedglass` | 7 | 7 |
| `anaglyph` | 4 | 4 |
| `droste` | 5 | 5 |
| `tiltshift` | 5 | 5 |
| `gaussianblur` | 1 | 1 |
| `radialblur` | 4 | 4 |
| `thinfilm` | 5 | 5 |
| `truchet` | 5 | 5 |
| `isoextrude` | 9 | 9 |
| `flowfield` | 5 | 5 |
| `engraving` | 5 | 5 |
| `gradientmap` | 5 | 5 |
| `warhol` | 5 | 5 |
| `shatter` | 5 | 5 |
| `lattice` | 8 | 8 |
| `blueprint` | 5 | 5 |
| `topography` | 4 | 4 |
| `prism` | 4 | 4 |
| `marble` | 4 | 4 |
| `dreamdust` | 9 | 9 |
| `forms` | 8 | 7 |
| `halftone` | 9 | 8 |
| `schematic` | 2 | 2 |
| `forensics` | 10 | 10 |
| `glitch` | 8 | 8 |
| `datamosh` | 8 | 8 |
| `ukiyoe` | 8 | 8 |
| `molten` | 11 | 11 |
| `vitrine` | 7 | 7 |
| `lightwind` | 6 | 6 |
| `starburst` | 8 | 8 |
| `warpbloom` | 6 | 6 |
| `lofi` | 3 | 3 |
| `rgbsplit` | 4 | 4 |
| `duotone` | 4 | 4 |
| `edgeglow` | 5 | 5 |
| `posterize` | 1 | 1 |
| `crystallize` | 4 | 4 |
| `mezzotint` | 4 | 4 |
| `pointillize` | 5 | 5 |
| `scanline` | 6 | 6 |
| `crosshatch` | 4 | 4 |
| `neongrid` | 5 | 5 |
| `ledmatrix` | 7 | 7 |
| `thermal` | 6 | 6 |
| `beacon` | 7 | 7 |
| `emboss` | 6 | 6 |
| `halftonecmyk` | 23 | 23 |
| `lens` | 21 | 21 |
| `glassorb` | 6 | 6 |
| `flutedglass` | 14 | 14 |
| `liquidglass` | 9 | 8 |
