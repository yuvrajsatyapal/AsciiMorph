# Parameter and default evidence

Date: 2026-10-20. Scope: already captured public JavaScript in `/tmp/asciimorph-reference-2026-10-20`. Canonical catalog files were not modified. [parameter-evidence.json](parameter-evidence.json) is the machine-readable ledger.

This pass separates **baseline state defaults**, **preset/tile assignments**, **renderer state reads**, and **declared shader control descriptors**. These evidence types are not interchangeable. All findings are ordinary STATIC observations, not completed REA semantic analysis or runtime verification.

## Captured versus remaining

| Evidence | Captured | Limit |
| --- | ---: | --- |
| Recipe baseline state keys | 688 | Includes 650 ordinary keys and 38 shader keys; not 688 visible controls. |
| Initial-state fields | 723 | Includes transient/source/mask/history state; all overlapping recipe values agree. |
| Shader descriptors with label, default, min, max and step | 38 across 5 modes | Declared registry schema; no executed UI validation. |
| Post-effect defaults | 121 fields across 28 effects | Labels, slider ranges and enum alternatives unknown. |
| Literal demo/restyle state patches | 196 | Sample assignments, not defaults or exhaustive supported values. |
| Modes with any bounded state-key association | 38 / 96 | Remaining 58 have no established association in this extraction. |
| Modes with declared shader parameter schema | 5 / 96 | The other 91 mode control schemas remain uncaptured. |
| Complete runtime-verified mode schemas | 0 / 96 | All runtime behavior remains unverified. |
| Additional lazy dependency chunks identified | 16 unique | Exact static paths, not fetched by this pass. |

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

| Mode with bounded state assignment/schema evidence | Associated keys | Known labels |
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

These five mode definitions are the only complete declared descriptor sets currently established. Shared numeric blend indices expose 14 named choices; seed fields expose their explicit 0–999 bounds. The JSON retains every option string, state key, helper call, and exact source range.

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

## Exact next capture targets

The source contains import references and dependency factories for the following groups. A stage group may contain control panels, but individual contained component identities are unknown until those chunks are captured. The URLs below combine the literal dependency paths with the public `/app/_next/` chunk base established by the captured asset manifest; availability and live network execution have not been verified.

These are **next capture targets**, not endpoints inferred from feature names. Shared dependencies are intentionally repeated under their owning factory groups.

### DesktopStage — import `8797`

Import reference: `2l9zpxby2cme3.js` `[504, 513]`. Factory: `1ipw8y2wcivpy.js` `[28904, 29366]`. None of its listed chunks is in the local captured set.

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

Import reference: `2l9zpxby2cme3.js` `[544, 553]`. Factory: `1ipw8y2wcivpy.js` `[29367, 29564]`. None of its listed chunks is in the local captured set.

- [1l91ih9mmvrji.js](https://www.ascii-magic.com/app/_next/static/chunks/1l91ih9mmvrji.js)
- [2p8lqnc5r1wt7.js](https://www.ascii-magic.com/app/_next/static/chunks/2p8lqnc5r1wt7.js)
- [3cr1q6k-0qp_q.js](https://www.ascii-magic.com/app/_next/static/chunks/3cr1q6k-0qp_q.js)
- [3r_arwvnmlqld.js](https://www.ascii-magic.com/app/_next/static/chunks/3r_arwvnmlqld.js)

### additional pro renderers — import `1332`

Import reference: `09wgr6f2vxer0.js` `[120176, 120185]`. Factory: `1ipw8y2wcivpy.js` `[27573, 27771]`. None of its listed chunks is in the local captured set.

- [25m7tjigtxes6.js](https://www.ascii-magic.com/app/_next/static/chunks/25m7tjigtxes6.js)
- [3nkw2beysazoh.js](https://www.ascii-magic.com/app/_next/static/chunks/3nkw2beysazoh.js)
- [1w_w6bk2u9ijc.js](https://www.ascii-magic.com/app/_next/static/chunks/1w_w6bk2u9ijc.js)
- [2d-1l54v26p8c.js](https://www.ascii-magic.com/app/_next/static/chunks/2d-1l54v26p8c.js)

## Remaining questions

- Capture DesktopStage/MobileShell dependencies and identify the actual properties-panel modules before claiming exact panel labels, ordering, ranges, conditions or per-mode enum choices.
- Capture the additional pro renderer dependencies to prove how state maps to output for replacement modes. Current preset assignments do not close that gap.
- Establish each mode selector’s initialization/reset behavior. Global recipe and initial-state defaults are captured; the mode-switch defaults remain explicitly unknown.
- Record actual UI control visibility and dependencies at desktop/mobile sizes, including Pro controls and source-dependent sections.
- Preserve renderer-supported IDs separately from display labels and compatibility defaults. Do not generate production slider limits from this ledger’s sample values.

Method: restricted parser of literal objects, arrays, strings, numbers and booleans; explicit known shader-spread expansion; inert text searches for named renderer paths and dependency factory arrays. No downloaded code was imported, evaluated or rendered; no installs, production edits, or canonical inventory changes were made.
