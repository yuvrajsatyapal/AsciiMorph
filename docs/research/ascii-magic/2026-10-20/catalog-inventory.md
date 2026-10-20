# ASCII Magic catalog inventory

Captured 2026-10-20 from the public shipped editor bundle. This is a bounded static inventory, not a runtime parity claim. The canonical machine-readable data is [catalog-inventory.json](catalog-inventory.json).

## Verified counts

| Registry | Tiles | Distinct modes |
| --- | ---: | ---: |
| Literal style registry | 90 | 90 |
| Glass helper expansion | 10 | 1 |
| Shader registry expansion | 5 | 5 |
| Total browse catalog | **105** | **96** |

The ten glass tiles select `liquidglass` with different pinned state patches. The mode picker deduplicates by mode and labels this shared mode “Glass”. Registry entries are selectable-mode declarations; they do not establish that every renderer works.

## Category coverage

| Category ID | Display label | Tiles |
| --- | --- | ---: |
| `ascii` | ASCII & Text | 6 |
| `pixel` | Pixel & Blocks | 6 |
| `print` | Print & Paper | 18 |
| `geometric` | Geometric | 15 |
| `distort` | Distort | 8 |
| `blur` | Blur & Focus | 4 |
| `glitch` | Glitch & Signal | 10 |
| `light` | Light & Color | 11 |
| `glass` | Glass | 16 |
| `material` | Material & Texture | 11 |

## Identity and evidence

STATIC source `catalog-bundle`: `2cjp552-p57it.js` from the captured manifest. SHA-256: `2fa1a9c48e2be92a5d2dec4249877599900cec1df4ab2694495278cc22fc3149`. The original capture is `/tmp/asciimorph-reference-2026-10-20/2cjp552-p57it.js`; that temporary file may expire. The JSON retains its public URL, byte length and digest.

Evidence ranges are zero-based Unicode character offsets, with exclusive end, after UTF-8 decoding. They are not byte offsets:

- Literal style array: `[7325, 16753)`.
- Glass calls: `[16917, 17547)`. The inspected helper immediately before it assigns `liquidglass`, `glass-${style}` IDs, Glass category, `isNew`, and default pinned `glassFrost=20`, `fontSize=45`.
- Shader definition object: `[973, 2918)`. The helper `o(key,label,default,min=0,max=1,step=.01)`, seed helper and blend helper immediately before it establish 38 parameter descriptors across five modes.
- Final composition and deduplication immediately follow the glass array: `g=[...l,...n,...d]`; picker preserves the first tile for each mode.

Extraction used a restricted parser for object/array/string/number/boolean data plus named helper-call records. It did not evaluate, import or run the downloaded JavaScript. The source digest was checked against `asset-manifest.json`; counts and unique tile IDs were asserted. No REA semantic analysis was rerun. These STATIC observations do not have REA Evidence IDs; existing REA failure evidence is documented in [findings.md](findings.md).

## Presets and parameter coverage

Every tile records exact mode ID, unique tile ID, label, category, tags, glyph when present, order, new badge when declared, and a source range. The JSON preserves pinned state patches for CMYK Drops and ten glass variants. A pinned patch is not a complete default configuration.

Shader defaults and parameter bounds are established for `cyanotype`, `hexhalftone`, `paperstock`, `oilpool`, and `anodized`. Their renderer behavior is unverified. Defaults and parameter sets for the other 91 modes remain `null` in this bounded inventory.

Featured tile: `cyanotype`. The declared “new this week” sequence is `cyanotype`, `anodized`, `oilpool`, `hexhalftone`, `paperstock`, `blueprint`.

Preserve IDs independently of display names: `ripple` is labeled “ZigZag”, while `zigzag` is labeled “Ripple”. The two Ripple labels (`zigzag` and `glass-ripple`) select different modes. `3d` is displayed as “Voxel”; `starburst` as “Kaleidoscope”. These are observed registry mappings, not naming corrections.

## Remaining gaps

- Runtime behavior, renderer support, exact previews and visual parity for all 96 modes remain unverified.
- Parameter/default/behavior fields that this pass did not establish remain explicitly unknown. No guessed renderer families or fabricated defaults are supplied.
- Additional lazy-loaded modules or future registry changes could alter the catalog. Unknown dynamic tile count is `null`, not zero.
- Entitlements, depth/masks/animation compatibility, recipe round trips, export parity and performance need separate evidence.
- Public documentation previously described 100 tiles / 91 modes; this captured shipped registry establishes 105 / 96 for this specific digest. It does not resolve the documentation revision history.
