# AsciiMorph Studio / Flow reconstruction — design gate

Status: independently authored, design-only prototype. No production Rust implementation is implied by this artifact. Approved feature scope: `.planning/specs/ascii-magic-rebuild.md`.

## Brand Foundation
The approved visual direction is the reference shell, with AsciiMorph identity. Configuration: `.planning/design-config.md`. Desktop evidence: `docs/research/ascii-magic/2026-10-20/studio-1440.jpg`, `studio-1920.jpg`, `flow-1440.jpg` and `desktop-measurements.json`. Reference assets/bundles remain research only. Original procedural botanical engraving supplies source/thumbnail content.

## User Flows
Image/source → browse Realtime catalog → select style → tune right-dock controls → compare → export popover. Catalog search, favorites and category tabs filter the same local list. Upload accepts local images for a design preview. Inspire/Shuffle choose a deterministic botanical composition; Restyle changes local demonstration treatment. These demonstrate shell interactions, not all 96 rendering algorithms.

Studio/Flow toggles preserve chosen image/style. Flow shows Source → Style → Output with shared preview and style selection. Production graph editing, arbitrary node construction and validation remain engineering requirements; the prototype communicates layout and node selection only. Add node reports this design scope explicitly.

Generative, sign-in, pricing and remote library services display an honest unconfigured dialog. Menu contains the compatibility editor entry. This prototype never performs authentication, payment, generation or Rust rendering.

## Wireframes
Desktop Studio:
```
┌ brand  Studio Flow ───────── zoom crop compare text undo redo layers ─── pro help account menu ┐ 52
├ catalog 320 ───┬──────────────────────── black preview ───────────────┬ dock 340 ──────────┤
│ title          │                                                      │54 rail│ parameters │
│ mode switch    │                                                      │       │ backdrop   │
│ search         │                    original source                   │       │ characters │
│ tabs           │                                                      │       │ intensity  │
│ suggested 3col │                                                      │       │ blur       │
│ featured       │           Upload Inspire Restyle Shuffle Library Export       │
│ category 2col  │                         568 × 50                       │       │            │
└────────────────┴──────────────────────────────────────────────────────┴───────┴────────────┘
```
Desktop Flow retains navbar/catalog, removes property dock and places linked Source / Style / Output nodes over a dotted work area. Bottom actions become Add node / Fit content / Export.

## Components
Navbar: 52px fixed height; square workspace tabs; 32px icon controls; mono 100% readout. Dock: 340px including 54px left rail, 13px labels, 12px values, 1px separators, native range/select controls and editable values. Collapsing catalog produces 54px miniature rail. Catalog: 16px inset, 12px gaps, three suggested thumbnails then 288px featured image and two-column category cards. Card favorite is independently focusable, persists locally and does not select a card. Actions: 568×50px, square border, Export primary white; keyboard and pointer activation share handlers.

Compare is a press/toggle source view. Export popover offers PNG/JPEG and scale; downloadable prototype output is explicitly labeled demonstration and contains the local preview only. Production exporters require separate engine validation. Sliders affect preview immediately. Property categories retain their values. Empty search/favorites contain readable recovery text.

## Typography
Satoshi from Fontshare stylesheet with system sans fallback. Body 13px, controls 12px, small metadata 10–11px, wordmark 18px. Mono readout 11px. Licensing/self-host decision required before production distribution. No copied reference font files.

## Color System
Canvas #000; panel #0a0a0a; raised #111; Flow node #171717; primary text #f5f5f5; secondary white 62%; muted white 42%; borders white 10%; selected white 85%. Export reverses white/black. Original artwork can vary in treatment; shell stays neutral.

## Motion Plan
120ms hover/focus/selection transitions, 160ms sheet entry. Catalog items reveal once with short opacity transition; no animated slider lag. `prefers-reduced-motion` disables transitions/entry movement. Preview regenerates synchronously for this lightweight mock; production worker handles job revision/backpressure.

## Responsive Rules
1440px: 320px catalog, 340px dock, 52px header. 1920px same fixed shell dimensions with larger stage. 768px: compact toolbar, sidebars use overlays to preserve preview. 375px: proposed accessible adaptation with bottom Styles/Controls sheet triggers, compact header, horizontally scrollable bottom actions. **Mobile adaptation is provisional**: 390px viewport with desktop UA in captured evidence stayed desktop; pointer-coarse mobile shell has not been observed. No true-mobile parity claim.

## States
Loaded: source centered in preview. Loading: polite live-region notice when local image decoding starts. Empty: Clear source action shows upload prompt and preserves settings. Error: invalid/unsupported image decode shows recoverable dialog; current source remains. Empty catalog: search clear or favorites explanation. Unconfigured service: explicit explanation, close/retry entry. Export: preview artifact only; actual production encode progress, cancel/failure and Rust protocol remain engineering work.

## Asset List
`assets/generate-assets.py` generates original `botanical.svg` and custom 24×24 line icons. Artwork brief: original ribbed botanical fronds; centered; monochrome #000/#ddd/#aaa; black background; engraving line art; calm technical mood; 800px preview and 88px thumbnail use; no text, competitor demo imagery, stock art or logos. Icons: original monochrome 1.4px strokes, 16px use, no library assets. Reference thumbnails intentionally replaced with original source treatments; this is a known visual difference.

## Review Gaps and Tooling
Spartan Gemini/design scripts are absent in both configured search locations. No AI direction calls or Gemini image generation ran; measured approved reconstruction direction and local procedural generator used. Critic review and parent browser screenshots pending. Essential labels use 62% white for accessible contrast, a minor documented departure from measured 42% reference text. Mobile buttons/favorites use 44px targets; collection selectors are simple pressed-button groups. Source output, thumbnails, brand glyph and glyph-rendering quality differ from reference by design to avoid copying demo art and pretending engine parity. Parameter schema coverage, all styles, signed-in/pro, mobile pointer-coarse behavior, full Flow interactions and production export remain outside this design-only prototype.

### Prototype review revisions
Characters now exposes Font Size11, Standard/Extended/Binary/Blocks/custom character sets, editable ramp, blend choices, opacity, invert mapping, dot overlay and deterministic randomization. Brightness displays0 and contrast20 with normalized local transform mapping. Original botanical leaf fill was brightened for readable thumbnail/character output. Background opacity affects a blurred local backdrop. Slider hit regions and mobile controls are44px; essential text contrast uses secondary62%.

Flow shell review correction: toolbar contains zoom out/readout/in and undo/redo; catalog segment becomes Styles/Effects, retaining the previous Studio Realtime/Generative selection when returning. Effects list is explicitly design-only. Phone Styles and Controls sheets are mutually exclusive.
