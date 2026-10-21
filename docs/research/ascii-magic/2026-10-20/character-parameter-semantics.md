# Character contrast and geometry semantics

Reference capture: 2026-10-20. Analysis: 2026-10-21. **Static read-only evidence; no downloaded code executed and no production code changed.** [character-parameter-semantics.json](character-parameter-semantics.json) contains the source URLs, SHA-256 digests, exact original-source offsets, local working-tree snapshots, and all scope/unknown fields.

## Contrast: baseline 20, mathematical neutral 0

The captured recipe defaults **and** initial state declare `contrast: 20`, at `05tjcpn0cqaiz.js` `[12293,12304)` and `[24578,24589)`. The visible global slider declares bounds −100…100. **100 is not the recipe baseline or mathematical neutral.** It appears separately in declared style-node defaults and the conditional shader-exit restoration path.

For the common character-family CPU tone path, the source explicitly reads the engine contrast value `c` and calculates:

\[
K(c)=\frac{259(c+255)}{255(259-c)}
\]

For an 8-bit channel `x` and brightness `B`, that affine tone stage is:

\[
x' = \operatorname{clamp}(K(c)(x-128)+128+2.55B,\;0,\;255).
\]

At `c=0`, `K=1`, so contrast is neutral. At the recipe baseline 20, `K≈1.16867668`; at 100, `K≈2.26772722`. These values are different scopes, not interchangeable defaults or normals. A captured WebGL Ukiyoe example uploads the same factor and applies it about the normalized pivot 0.501961, adds `B/100`, clamps, then optionally inverts. That is a proved example, not a claim that every shader/effect uses the same full pipeline.

The dither setting is a different namespace: `ditherContrast` uses a factor `d/100` in its preprocessing, so **100 is neutral for that setting**, whose captured recipe baseline is 110. A shared label “Contrast” does not establish shared parameter semantics.

## Current Rust scale differs

The current local `rust/src/color.rs` divides its contrast `C` by 100 and uses `(1+q)/(1−q)`, with `C=100` specially assigned factor 255. Its pivot is 127.5, and gamma is applied after the clamped affine stage. It is also neutral at contrast 0, brightness 0, gamma 1, but feeding the same numeric reference contrast produces a different slope.

To align **only the isolated CPU affine tone stage**, algebra gives:

\[
C_{core}=100\frac{K(c)-1}{K(c)+1},\qquad
B_{core}=B+\frac{1-K(c)}{5.1},\qquad \gamma=1.
\]

The contrast transform matches the slope. The brightness term compensates for the 128 versus 127.5 pivot. This is a derived candidate stage mapping, **not implemented behavior or proof of complete renderer parity**. Validate target bounds; sampling, color/luminance order, glyph mapping, gamma, clipping and other processing remain separate concerns.

| Reference contrast | Reference factor | Slope-matched core contrast | Core brightness adjustment |
| ---: | ---: | ---: | ---: |
| -100 | 0.438527500 | -39.031057787 | 0.110092647 |
| 0 | 1.000000000 | 0.000000000 | 0.000000000 |
| 20 | 1.168676676 | 7.777861845 | -0.033073858 |
| 100 | 2.267727217 | 38.795380783 | -0.248573964 |

Ordinary mode switches retain current contrast. The forced style helper sets 0 when entering one of the five shader modes and arms a flag. On the next non-shader forced application, it restores 100 **only if that flag is armed and current contrast is exactly 0**, then clears the flag. Nonzero current contrast is retained; a stage-hold guard can skip the helper. This lifecycle is distinct from the mathematical tone mapping and the recipe baseline.

## Font size determines the reference cell geometry

The common renderer directly calculates, for UI font size `F` and caller render scale `S`:

- Cell height and font pixel size: `F × S`.
- Cell width: `0.6 × F × S`.
- Output size: rounded source width/height times `S`, with a minimum of 1.
- Characters columns/rows: floor of output width/cell width and output height/cell height.
- The listed mosaic/lego/dots/pixel/3d/block-chars/disco grid variants use ceiling instead; this must not be applied indiscriminately to Characters.

The UI declares **3…80, step 1**, baseline **11**. At scale 1 that means:

| Font size | Cell width | Cell height | Font pixels |
| ---: | ---: | ---: | ---: |
| 3 | 1.8 | 3 | 3 |
| 11 | 6.6 | 11 | 11 |
| 14 | 8.4 | 14 | 14 |
| 20 | 12 | 20 | 20 |
| 26 | 15.6 | 26 | 26 |
| 80 | 48 | 80 | 80 |

The captured family stack is `"Courier New", Courier, monospace`, with top baseline. The WebGL glyph batch receives the same scaled font size. Ordinary origins are column×cell width and row×cell height before optional depth/effect offsets. The grid is explicitly fixed from font size; it is not determined by measuring a glyph's advance. Font fallback and actual raster pixels were not verified.

The current local settings/calibration envelope is cell width **7…16**, cell height **14…28**. Calibration independently accepts font sizes 1…512; the schema does not equate its font size to either cell dimension. Direct reference geometry at scale 1 fits both current cell bounds only when **14 ≤ F ≤ 26⅔**, or UI integers **14…26**. Baseline 11 already gives **6.6×11**, outside the core envelope. The full 3…80 range therefore cannot be forwarded or clamped silently while claiming the same grid behavior.

An explicit geometry/representation decision is required for the full reference range. Cell-count and memory budgets remain separate constraints. Replacement-mode sizing, caller scale policy, and calibration alignment differences remain outside this focused proof.

## Exact evidence anchors

All ranges below are original-source Unicode character offsets with exclusive ends. Full hashes and local line anchors are in JSON.

| Observation | Source | Range |
| --- | --- | --- |
| Reference contrast factor | `09wgr6f2vxer0.js` | `[101063,101109)` |
| Reference channel application | `09wgr6f2vxer0.js` | `[106138,106291)` |
| GPU factor upload | `1w_w6bk2u9ijc.js` | `[21019,21085)` |
| GPU channel application | `1w_w6bk2u9ijc.js` | `[2165,2279)` |
| Reference cell/font calculation | `09wgr6f2vxer0.js` | `[95838,96304)` |
| Reference font stack/baseline | `09wgr6f2vxer0.js` | `[102190,102261)` |
| Local Rust tone | `rust/src/color.rs` | `[320,686)` |
| Local cell envelope | `src/render/character-contract.ts` | `[2899,3043)` |
