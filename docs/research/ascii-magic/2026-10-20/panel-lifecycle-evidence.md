# Panel mounting and selection lifecycle evidence

Date: 2026-10-20. Status: **STATIC only**. [panel-lifecycle-evidence.json](panel-lifecycle-evidence.json) records source URLs, SHA-256 digests, exact ranges, the 96-mode mounting matrix, registry links, conditional gates, and the 28 candidate-control resolutions. The prior [parameter-evidence.json](parameter-evidence.json) was preserved byte-for-byte during this pass.

Downloaded JavaScript was parsed as inert text. No reference code was imported, executed or rendered. Generated research contains metadata and conclusions, not competitor implementation bodies. Source ranges are zero-based Unicode character offsets with exclusive ends.

## What is mounted, and in which order

The source contains **81 ordered effect groups** and **87 section registry entries**. `groupsForMode` filters the group array in its original order; each group resolves to a renderer in `SECTION_REGISTRY`.

For the regular Studio properties dock:

1. Remove `intensity` and `text` from category navigation.
2. The first remaining group with tier `style` is the primary group.
3. Keep the current active group when it still occurs in the available categories; otherwise choose the primary group. `textSelected` overrides the active group to `text`.
4. Mount one selected group at a time. When the primary group is selected, the body order is **Backdrop → primary group → Intensity when applicable → Blur**. Dither omits Intensity. A secondary category mounts its own renderer only.
5. Text has no category icon in this path. Add text and on-image text selection dispatch `selectText`; selecting another category clears text selection.

The initial panel store has `dockOpen: true`, `dockCollapsed: false`, `activeGroup: characters`, `workspace: studio`, `styleCategory: realtime`, and `textSelected: false`. Selecting another mode does **not** always return the dock to the primary group: for example, a still-valid Color category stays selected.

The desktop rail uses widths 340 (expanded), 52 (collapsed), and 0 (closed). Closing an uncollapsed rail leaves its contents mounted with zero width/opacity, `aria-hidden`, and `inert`. Collapsing replaces its content with a strip, subject to the exit animation. Desktop Flow and Generative takeover omit this properties rail entirely.

Floating panels are a separate path. Their mounting/focus order follows `panels.order`, and an ID must exist in `panels.open`. They directly render the matching registry entry without parent mode revalidation; nested component guards can still return nothing. Both structures start empty.

Compose mounts every applicable group for the selected effect in group order, instead of one category. It also uses selected-group/mode overrides and a separate state bridge. That dataflow is recorded as conditional; this pass does not claim a complete static Compose control-visibility matrix.

## Mobile shell and navigation

The mobile decision uses **the smaller viewport dimension plus input capability**. A dimension at most 700 selects phone only with coarse pointer/any-pointer or touch points. A remaining dimension at most 1100 selects tablet with coarse pointer or no hover. Otherwise the source selects desktop. A 390-pixel viewport with desktop pointer capabilities can therefore remain in the desktop shell.

The shared navbar explicitly omits its Studio/Flow workspace tabs on mobile. MobileShell mounts Canvas, a Realtime/Generative switch, a Realtime style carousel, a bottom action bar, an asset-library sheet, and a parameter sheet. It never mounts FlowStage or ComposeStage. Supplying a deep-linked workspace still reaches MobileShell under the device branch; the runtime result of such a deep link was not tested.

| Mobile surface | Declared behavior |
| --- | --- |
| Realtime/Generative tabs | Set `styleCategory`; Generative adds the stage's `is-hidden` class and mounts GenerativeGallery. |
| Style carousel | Realtime only; All/category menu; centered tile selection invokes `applyStylePick` after a 140 ms debounce. Locked direct tile actions open the Pro sheet. |
| Realtime bottom actions | Upload → Library → Inspire → current style / “Tap to tune” → Export. |
| Upload | File chooser accepts image and video and passes the selected file to `handleFile`. |
| Library | Toggles the drawer. The asset-library component mounts after boot or the first drawer activation. |
| Inspire | Calls the next-demo action, then updates UI. |
| Export | Disabled without a source; opens the export modal using the button bounds. |
| Generative bottom action | Generate / “Source, direction, size”; opens the same sheet with GenerativeConfig. |
| Parameter sheet | Initially closed; Realtime title “Style parameters”, Generative title “Generate”. Realtime PropertiesDockContent mounts only while open. |
| Sheet closing | Scrim, “Close parameters” grip, and Escape; body scrolling is locked while open and restored afterward. |

Within the mobile parameter sheet, category navigation retains the primary style group plus `characters` and `animation`, with primary first. Other groups appear by name in **“More controls on desktop”**, after the primary body's Blur section, with a copied-look continuation action. Depth, Lights, Color, Post FX and Mask commonly fall into that notice. Text can still mount through the shared text-selected state path; actual CSS visibility of its navbar trigger on mobile remains unverified.

The Animation category stays present. For modes outside the captured `motionAllowed` set, it shows **“This style moves on desktop”** instead of normal animation controls. That set is characters, mixed, dots, pixel, lego, mosaic, braille, 3d, block-chars, disco, shapes, and dither. The separate animation-coming-soon registry is empty in the captured source.

The shared navbar also declares zoom, crop, compare, on-image guides, text, undo/redo, recipes, pricing, Help and authentication actions with workspace/source/state conditions. **Mounted JSX is not a claim of mobile CSS visibility**: stylesheet assets and runtime pixels were not inspected here.

## Mode changes retain most state

| Selection path | Directly proved behavior |
| --- | --- |
| Different-mode style tile | Reject locked mode first; snapshot history; assign `renderMode`; call forced style defaults; then apply the tile's `set` object. |
| Same-mode tile with a changed `set` value | Snapshot history and assign only the tile patch; no forced defaults call. |
| Same mode and unchanged tile patch | Returns false without state assignments in this path. |
| Dock header selector | Reject locked Pro choice first; assign mode and call forced defaults, even without an explicit same-mode equality guard. Does not apply a tile `set` patch; no history snapshot call is visible in this handler. |
| Legacy Characters Style selector | Generic `useSelect` assigns `renderMode`, checks animation, and notifies UI. It has no immediate forced-default call. A separate 900 ms ground-rules poll can later enforce its limited subset. |
| Shader panel Reset button | Explicit user action writes that mode's declared shader parameter defaults. Mode selection does not call that Reset button handler. |

`applyStyleDefaults(true)` is a **small conditional patch**, not a recipe or mode-parameter reset:

| Field | Forced target and retention rule |
| --- | --- |
| Coverage | 100 when the coverage-touch flag allows it. |
| Blend mode | `color-dodge` for pixel, lego, disco and 3d; otherwise `source-over`, subject to the blend-touch flag. |
| Brightness | 25 prism; 20 neongrid; 64 ukiyoe; 23 topography; otherwise 0. |
| Invert mapping | True for stippling and dreamdust; otherwise false. |
| Backdrop mode | `solid` for asciiStudio; otherwise `blur`, unless backdrop-touch state blocks the write. |
| Font size | 17 stippling, 14 halftone, only when the global font-size-touch flag is false; all other modes retain the current size. The captured mode-change branch does not clear that global flag. |
| Contrast | Entering one of the five shader modes forces 0 and arms a module-local transition flag. On a subsequent non-shader forced application, 100 is restored only when that flag is armed and current contrast is exactly 0. Other ordinary mode changes retain current contrast. |

A newly observed mode clears the coverage/blend touch flags and `_backdropTouched`. A stage-hold guard can skip the helper entirely. The non-forced 900 ms poll only enforces coverage 100 for mosaic, pixel, 3d, lego, disco and neongrid, and color-dodge for pixel, lego, disco and 3d, when untouched. It does not execute the forced brightness/invert/contrast/font/backdrop branch.

No mode-specific settings object, source, or `postEffects` object is reset by this helper. Tile patches can override fields after the helper, and later ground rules may act again. `styleNodeDefaults` is a separate declarative node seed; its non-shader contrast value of 100 must not be mistaken for the live mode-switch behavior above.

## Source and Pro conditions

The dock parent has no source-presence gate. A free user opening a Pro mode receives an inert controls body and lock overlay; the header mode selector remains outside the inert body. The captured free-mode set is characters, mixed, block-chars, dots, braille, dither, pixel, mosaic, lego, 3d, cross, diamond, lines, diagonal and disco. Each post-effect row has a separate entitlement check, including Levels and Curves gate keys. The JSON preserves the exact free post-effect set.

Depth is available only for its declared character-family groups. With `state.mode: video`, its enable toggle dims and ignores the action, its settings are hidden, and “Images only for now” appears. Its four numeric settings additionally require Depth to be enabled; Parallax Speed requires positive parallax. Backdrop's Solid Black option is mode-dependent; the JSON records the literal supported set and the display fallback from unsupported stored `solid` to `original`.

Source-dependent toolbar actions remain separately gated: Export requires a source; crop/compare and undo/redo have their own state checks. Local child-control conditions, collapse state, selected subtype, selected light, entitlement and data availability can further restrict controls. The mounting matrix does not erase those conditions from the prior ledger.

## The 28 previously skipped candidates

**24 now have a proved scalar, structured, action, or registry association; 4 remain parametric.** Candidate source ranges and conclusions live in `candidateResolutions`; the old ledger has not been rewritten.

- Character-set preset and custom text controls target `charSet`. ASCII Studio Chars also writes `charSet`; its named Shape selector assigns `asciiShapeCombo` arrays.
- ASCII Studio Variation assigns `asciiConfettiSeed` and calls the randomization action. Its local initial displayed value is **42**, while the recipe baseline is **1**. These are recorded separately.
- Animation Speed is a discrete UI index 0–7, not a 0–7 millisecond value. Multipliers .25, .5, .75, 1, 1.5, 2, 3 and 4 assign 12000, 6000, 4000, 3000, 2000, 1500, 1000 and 750 milliseconds.
- Light Radius/Size uses a 5–100 UI range and divides by 100 for `lights[activeLight].radius`. Light Intensity targets the selected structured light. Empty light arrays disable both controls.
- The inline Blur type picker has **ten** choices, including Off, Lens, Tilt-Shift, Directional, Radial, Glassy and Perspective. This is distinct from the shorter generic post-effect registry picker. Its Amount, Angle, Focus, Near side and Far side controls have explicit type-dependent visibility and structured `postEffects.advBlur` keys.
- Shader templates instantiate 30 ordinary ranges, 5 blend selects and 3 seed ranges across the five captured registries. They instantiate no checkbox or position gizmo in this capture; the reusable branches still exist.
- Photo Filter and Presets are multi-field actions; the Hex tint editor targets normalized `overlayColor`. Gradient-stop colour edits target the selected stop inside a serialized, caller-parameterized stops field.
- Three palette-helper candidates still require caller-specific array expansion, and the generic numeric draft editor still lacks enumerated caller-specific state keys and bounds.

## Evidence anchors

| Observation | Source | Character range |
| --- | --- | --- |
| Ordered effect-group array | `3kyu52o0ubrsv.js` | `[8348, 14702)` |
| Section registry | `2lr2okzrhyxxk.js` | `[361135, 366036)` |
| Properties dock | `35duo3c5unmuj.js` | `[98454, 104803)` |
| Desktop parent | `3xbkq75mfrlgb.js` | `[37194, 38348)` |
| Mobile parent | `1l91ih9mmvrji.js` | `[13314, 14757)` |
| Shared navbar | `3r_arwvnmlqld.js` | `[34452, 44830)` |
| Forced defaults | `09wgr6f2vxer0.js` | `[123080, 123871)` |
| Default enforcement/touch tracking | `09wgr6f2vxer0.js` | `[123871, 124408)` |
| Style tile selection | `09wgr6f2vxer0.js` | `[124657, 125000)` |
| Generic select hook | `09wgr6f2vxer0.js` | `[183153, 183250)` |
| Device classifier | `05tjcpn0cqaiz.js` | `[272, 692)` |

## Studio mode/category matrix

These are declaration-derived categories and initial primary choices for the 96 catalog modes. Saved valid selections can override the initial primary. The JSON also records each primary body order, secondary body order, omitted mobile notices, matching group ranges and forced defaults. `shaderfx` resolves to that mode's own 5-mode descriptor registry.

| Mode | Primary | Desktop category order | Mobile category order |
| --- | --- | --- | --- |
| `characters` | `characters` | characters, depth, animation, lights, color, postfx, mask | characters, animation |
| `asciiStudio` | `asciiStudio` | asciiStudio, animation, lights, color, postfx, mask | asciiStudio, animation |
| `dither` | `dither` | dither, animation, color, postfx, mask | dither, animation |
| `block-chars` | `characters` | characters, depth, animation, lights, color, postfx, mask | characters, animation |
| `dots` | `characters` | characters, depth, animation, lights, color, postfx, mask | characters, animation |
| `frostedglass` | `frostedglass` | frostedglass, animation, color, postfx, mask | frostedglass, animation |
| `motionblur` | `motionblur` | motionblur, animation, color, postfx, mask | motionblur, animation |
| `mixed` | `characters` | characters, depth, animation, lights, color, postfx, mask | characters, animation |
| `pixel` | `characters` | characters, depth, animation, lights, color, postfx, mask | characters, animation |
| `mosaic` | `characters` | characters, depth, animation, lights, color, postfx, mask | characters, animation |
| `lego` | `characters` | characters, depth, animation, lights, color, postfx, mask | characters, animation |
| `cross` | `characters` | characters, depth, animation, lights, color, postfx, mask | characters, animation |
| `diamond` | `characters` | characters, depth, animation, lights, color, postfx, mask | characters, animation |
| `lines` | `characters` | characters, depth, animation, lights, color, postfx, mask | characters, animation |
| `diagonal` | `characters` | characters, depth, animation, lights, color, postfx, mask | characters, animation |
| `braille` | `characters` | characters, depth, animation, lights, color, postfx, mask | characters, animation |
| `3d` | `characters` | characters, animation, lights, color, postfx, mask | characters, animation |
| `disco` | `characters` | characters, animation, lights, color, postfx, mask | characters, animation |
| `stippling` | `characters` | characters, animation, color, postfx, mask | characters, animation |
| `waves` | `waves` | waves, animation, color, postfx, mask | waves, animation |
| `risograph` | `risograph` | risograph, animation, color, postfx, mask | risograph, animation |
| `crt` | `crt` | crt, animation, color, postfx, mask | crt, animation |
| `specimen` | `specimen` | specimen, animation, color, postfx, mask | specimen, animation |
| `smudge` | `smudge` | smudge, animation, color, postfx, mask | smudge, animation |
| `pinch` | `distort` | distort, animation, color, postfx, mask | distort, animation |
| `spherize` | `distort` | distort, animation, color, postfx, mask | distort, animation |
| `twirl` | `distort` | distort, animation, color, postfx, mask | distort, animation |
| `ripple` | `distort` | distort, animation, color, postfx, mask | distort, animation |
| `zigzag` | `distort` | distort, animation, color, postfx, mask | distort, animation |
| `polar` | `distort` | distort, animation, color, postfx, mask | distort, animation |
| `shear` | `distort` | distort, animation, color, postfx, mask | distort, animation |
| `pixelsort` | `pixelsort` | pixelsort, animation, color, postfx, mask | pixelsort, animation |
| `oilpaint` | `oilpaint` | oilpaint, animation, color, postfx, mask | oilpaint, animation |
| `lowpoly` | `lowpoly` | lowpoly, animation, color, postfx, mask | lowpoly, animation |
| `comic` | `comic` | comic, animation, color, postfx, mask | comic, animation |
| `sketch` | `sketch` | sketch, animation, color, postfx, mask | sketch, animation |
| `watercolor` | `watercolor` | watercolor, animation, color, postfx, mask | watercolor, animation |
| `chrome` | `chrome` | chrome, animation, color, postfx, mask | chrome, animation |
| `hexmosaic` | `hexmosaic` | hexmosaic, animation, color, postfx, mask | hexmosaic, animation |
| `stainedglass` | `stainedglass` | stainedglass, animation, color, postfx, mask | stainedglass, animation |
| `anaglyph` | `anaglyph` | anaglyph, animation, color, postfx, mask | anaglyph, animation |
| `droste` | `droste` | droste, animation, color, postfx, mask | droste, animation |
| `tiltshift` | `tiltshift` | tiltshift, animation, color, postfx, mask | tiltshift, animation |
| `gaussianblur` | `gaussianblur` | gaussianblur, animation, color, postfx, mask | gaussianblur, animation |
| `radialblur` | `radialblur` | radialblur, animation, color, postfx, mask | radialblur, animation |
| `thinfilm` | `thinfilm` | thinfilm, animation, color, postfx, mask | thinfilm, animation |
| `truchet` | `truchet` | truchet, animation, color, postfx, mask | truchet, animation |
| `isoextrude` | `isoextrude` | isoextrude, animation, color, postfx, mask | isoextrude, animation |
| `flowfield` | `flowfield` | flowfield, animation, color, postfx, mask | flowfield, animation |
| `engraving` | `engraving` | engraving, animation, color, postfx, mask | engraving, animation |
| `gradientmap` | `gradientmap` | gradientmap, animation, color, postfx, mask | gradientmap, animation |
| `warhol` | `warhol` | warhol, animation, color, postfx, mask | warhol, animation |
| `shatter` | `shatter` | shatter, animation, color, postfx, mask | shatter, animation |
| `lattice` | `lattice` | lattice, animation, color, postfx, mask | lattice, animation |
| `blueprint` | `blueprint` | blueprint, animation, color, postfx, mask | blueprint, animation |
| `topography` | `topography` | topography, animation, color, postfx, mask | topography, animation |
| `prism` | `prism` | prism, animation, color, postfx, mask | prism, animation |
| `marble` | `marble` | marble, animation, color, postfx, mask | marble, animation |
| `dreamdust` | `dreamdust` | dreamdust, animation, color, postfx, mask | dreamdust, animation |
| `forms` | `forms` | forms, animation, color, postfx, mask | forms, animation |
| `halftone` | `halftone` | halftone, animation, color, postfx, mask | halftone, animation |
| `schematic` | `characters` | characters, animation, color, postfx, mask | characters, animation |
| `forensics` | `forensics` | forensics, animation, color, postfx, mask | forensics, animation |
| `glitch` | `glitch` | glitch, animation, color, postfx, mask | glitch, animation |
| `datamosh` | `datamosh` | datamosh, animation, color, postfx, mask | datamosh, animation |
| `ukiyoe` | `ukiyoe` | ukiyoe, animation, color, postfx, mask | ukiyoe, animation |
| `molten` | `molten` | molten, animation, color, postfx, mask | molten, animation |
| `vitrine` | `vitrine` | vitrine, animation, color, postfx, mask | vitrine, animation |
| `lightwind` | `lightwind` | lightwind, animation, color, postfx, mask | lightwind, animation |
| `starburst` | `starburst` | starburst, animation, color, postfx, mask | starburst, animation |
| `warpbloom` | `warpbloom` | warpbloom, animation, color, postfx, mask | warpbloom, animation |
| `lofi` | `lofi` | lofi, animation, color, postfx, mask | lofi, animation |
| `rgbsplit` | `rgbsplit` | rgbsplit, animation, color, postfx, mask | rgbsplit, animation |
| `duotone` | `duotone` | duotone, animation, color, postfx, mask | duotone, animation |
| `edgeglow` | `edgeglow` | edgeglow, animation, color, postfx, mask | edgeglow, animation |
| `posterize` | `posterize` | posterize, animation, color, postfx, mask | posterize, animation |
| `crystallize` | `crystallize` | crystallize, animation, color, postfx, mask | crystallize, animation |
| `mezzotint` | `mezzotint` | mezzotint, animation, color, postfx, mask | mezzotint, animation |
| `pointillize` | `pointillize` | pointillize, animation, color, postfx, mask | pointillize, animation |
| `scanline` | `scanline` | scanline, animation, color, postfx, mask | scanline, animation |
| `crosshatch` | `crosshatch` | crosshatch, animation, color, postfx, mask | crosshatch, animation |
| `neongrid` | `neongrid` | neongrid, animation, color, postfx, mask | neongrid, animation |
| `ledmatrix` | `ledmatrix` | ledmatrix, animation, color, postfx, mask | ledmatrix, animation |
| `thermal` | `thermal` | thermal, animation, color, postfx, mask | thermal, animation |
| `beacon` | `beacon` | beacon, animation, color, postfx, mask | beacon, animation |
| `emboss` | `emboss` | emboss, animation, color, postfx, mask | emboss, animation |
| `halftonecmyk` | `halftonecmyk` | halftonecmyk, animation, color, postfx, mask | halftonecmyk, animation |
| `lens` | `lens` | lens, animation, color, postfx, mask | lens, animation |
| `glassorb` | `glassorb` | glassorb, animation, color, postfx, mask | glassorb, animation |
| `flutedglass` | `flutedglass` | flutedglass, animation, color, postfx, mask | flutedglass, animation |
| `liquidglass` | `liquidglass` | liquidglass, animation, color, postfx, mask | liquidglass, animation |
| `cyanotype` | `shaderfx` | shaderfx, animation, color, postfx, mask | shaderfx, animation |
| `hexhalftone` | `shaderfx` | shaderfx, animation, color, postfx, mask | shaderfx, animation |
| `paperstock` | `shaderfx` | shaderfx, animation, color, postfx, mask | shaderfx, animation |
| `oilpool` | `shaderfx` | shaderfx, animation, color, postfx, mask | shaderfx, animation |
| `anodized` | `shaderfx` | shaderfx, animation, color, postfx, mask | shaderfx, animation |

The group registry additionally names `retrostitch` and `shapes`, which are outside the captured 96-mode catalog. Registry entries `styles`, `tune`, `stippling`, `cutout`, `backdrop` and `blur` are not direct members of the group array; Backdrop and Blur are mounted inline through the parent path described above. Their existence alone does not prove a selectable catalog mode/category.

Remaining gaps are runtime/CSS visibility, complete Compose state bridging, the four parametric candidates, and broader recipe/history/demo-restoration side effects. Complete runtime-verified schemas remain **zero**.
