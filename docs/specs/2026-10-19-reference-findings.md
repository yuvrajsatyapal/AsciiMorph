# Reference feature findings

Date: 2026-10-19. Scope: public browser UI and first-party page text only.

The reverse-engineer-anything skill was read and applied to evidence handling.
No REA MCP tools or installed `rea` CLI were available in this session. The
following evidence is ordinary browser observation, not REA output. No source
code, private APIs, accounts, or downloaded application bundles were inspected.

## Questions and evidence

| Question | Finding | Coverage |
| --- | --- | --- |
| How does ASCII Studio begin manual creation? | Its root page opens directly to a blank character grid, with canvas dimensions, zoom, File menu, document tabs, a left tool rail, and bottom symbol/color panels. | Observed UI and screenshot at https://asciistudio.app/. Drawing correctness not exercised. |
| Which symbol categories are exposed? | Symbols, box drawing, blocks, geometric, stars, arrows, math, cards, miscellaneous, and common alphanumeric characters were present. A selected-character text field is editable. | Observed accessibility controls. Not every glyph tested. |
| How are colors presented? | Separate foreground and background grids expose hex-valued swatches. | Observed UI. Persistence and export color fidelity unknown. |
| Is there a gallery workflow? | Artwork cards expose titles/categories, preview buttons, and copy actions. | Observed controls; copying and licensing not tested. Do not reuse gallery artwork. |
| How does ASCIICraft begin conversion? | Converter route offers file drop/browse, Text, and Animation entry points. Selecting Text exposes Text, Font, Layout, Style, and Animate tabs plus a text-entry area. | Observed at https://asciicraft.com/converter. No file uploaded. |
| How does it explain comparison? | Homepage has an original/ASCII comparison slider, enlarge control, and selectable image/GIF/video examples. | Observed at https://asciicraft.com/. Conversion quality not measured. |
| What formats and variety are advertised? | First-party page text advertises 72 character sets and TXT/PNG/SVG/GIF/WebM/MP4 exports, including MP4 with audio. | Advertised claims, not verified exports. |
| Are the added tool ideas relevant to the references? | Visible navigation includes 3D ASCII and an audio visualizer; converter includes an Animation entry. | Navigation observed; GLB/OBJ support, audio behavior, exports, and internals unknown. |

## AsciiMorph design decisions drawn from these findings

- Keep selected symbols and foreground/background colors close to the canvas.
- Give every icon an accessible name; several reference tools were unlabeled in
  the accessibility tree, so their precise behavior remains unknown.
- Keep media conversion and manual creation connected through a common cell
  document, rather than inferring that either reference already supports this.
- Provide clear file, blank, template, and later text/media entry points.
- Do not inherit the references' exact panel layouts, branding, artwork, pricing,
  or account requirements.
- Treat 3D, animation, and audio as later functional milestones, never demo-only
  controls pretending those pipelines are implemented in Phase 1–2.

## Remaining verification

This was a bounded feature inventory, not a complete reverse-engineering audit.
Drawing algorithms, undo semantics, clipboard preservation, export parity,
encoder availability, memory behavior, and persistence remain unverified for
the references. AsciiMorph must validate its own implementation through tests.
