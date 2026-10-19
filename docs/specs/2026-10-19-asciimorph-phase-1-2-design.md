# AsciiMorph: foundation and manual studio

Status: proposed for design approval. Date: 2026-10-19.

## Repository inspection

The supplied workspace is empty, including hidden project files. There is no
package manifest, application source, Git repository, or existing functionality
to preserve. This is a new application, not an extension of a previous build.

## Scope and recommendation

Implement Phase 1 (foundation) and Phase 2 (manual editor) as separate milestones.
Use the user's master brief as the product requirements. Conversion, typography,
gallery, animation, and additional creative tools remain subsequent milestones.
Do not add active navigation or controls that imply unimplemented workflows work.

Three approaches were considered:

1. Homepage plus full manual studio, with a shared document format: recommended.
   Establishes the brand and a useful editor while enabling later conversion.
2. Studio only: fastest path to drawing, but omits the requested Phase 1 homepage.
3. All tools at once: broad surface area, but too much implementation and
   verification for the explicitly limited Phase 1–2 change.

## Original design direction

Use a quiet, near-black creative workspace with a warm amber selection accent.
The distinctive visual element is actual editable ASCII artwork. Avoid stock
illustrations, fake statistics, invented community activity, and decorative
terminal logs. UI typography uses IBM Plex Sans; artwork uses IBM Plex Mono.
Bundle font files and SIL Open Font License notices locally, verifying terms
when acquiring the files. UI text defaults to 14px/20px at 400, labels to
13px/18px at 500, homepage heading to 64px/68px at 500 (40px/44px on mobile).
Artwork defaults to 14px in 9 × 18px cells.

Proposed tokens:

| Role | Value |
| --- | --- |
| Page background | #0C0D10 |
| Panel | #15171B |
| Raised surface | #1D2026 |
| Border | #30343C |
| Main text | #F0F1F3 |
| Secondary text | #ADB3BD |
| Accent and selection | #E9B86E |

Use 4/8px spacing increments, 6px control corners, restrained shadows, and visible
keyboard focus. Controls have text labels or accessible names and shortcut hints.
Honor reduced-motion preferences. Use Motion for user-triggered panel transitions.

### Homepage

Route `/` presents the exact headline "Your Imagination. In Characters." and the
requested subtitle. Launch Studio opens `/studio`; an interactive ASCII demo
offers a few character/appearance changes and opens that artwork in the studio.
Only completed workflows receive primary navigation. Conversion and gallery
are clearly described as upcoming until their phases ship.

### Studio

Route `/studio` opens a blank 80 × 40 document by default. A separate explicit
action loads an original bundled sample; sample art never replaces a saved draft.

```text
Logo | project name | undo redo | save | import | export | settings
----------------------------------------------------------------
Tool rail | Symbols / stamps | canvas viewport | character / color
          |                 |                 | canvas properties
----------------------------------------------------------------
Tool hint | cursor x,y | dimensions | selected symbol | zoom / grid
```

Desktop uses a narrow tool rail, collapsible library, central viewport, and
collapsible inspector. Tablet collapses the library. Mobile retains the canvas
and a compact tool rail, with Symbols, Colors, and Canvas in a bottom sheet.
No hover-only functions; mobile control hit targets are at least 44 × 44px.

## Shared document and architecture

Use Next.js App Router, strict TypeScript, Tailwind, shadcn/ui primitives, Lucide,
Motion, and Zustand. Keep these modules separate:

- Document model: versioned project, dimensions, cell metrics, metadata, layers,
  per-cell character, foreground, nullable background, and alpha.
- Grid engine: immutable, deterministic drawing and selection operations.
- Renderer: device-pixel-ratio-aware Canvas API with shared export rendering.
- Editor state: active tool, selection, caret, viewport, current colors and symbol.
- History: bounded transactions and redo invalidation.
- Import/export: validation, text parsing, serialization, and static rendering.
- Persistence: IndexedDB documents; localStorage lightweight preferences only.
- UI: panels, dialogs, keyboard commands, and accessible canvas controls.

The document includes a base layer from the beginning. Full layer management,
opacity editing, and animation frames are Phase 6; the schema is versioned so
they can be added through explicit migrations. Future converters return the
same cell grid through one document creation entry point, which becomes
"Edit in Studio." Do not write a second incompatible artwork format.

Use one grapheme per cell with fixed cell metrics. Unicode symbols are supported;
wide emoji may be clipped to cell bounds and are not promised terminal alignment.
Text imports preserve spaces, empty lines, and CRLF normalization. Tabs expand
to configurable four-column tab stops. Reject unsafe dimensions and malformed
projects before replacing the current document.

## Phase 1 acceptance

- Application installs, runs, and builds reproducibly with a committed lockfile.
- Homepage, studio route, responsive shell, and design tokens are complete.
- Homepage demo is interactive and transfers real artwork into the editor.
- Shared document validation and serialization have meaningful unit tests.
- No fake login, publishing, conversion, or export actions.

## Phase 2 acceptance

### Canvas and tools

- Default 80 × 40; resize with top-left preservation or explicit reset, undoable.
- Mouse, touch, and stylus through Pointer Events and pointer capture.
- Interpolate pencil and eraser paths so fast movement does not leave gaps.
- Pencil, eraser, text, rectangular selection, line, outlined rectangle, filled
  rectangle, ellipse, contiguous flood fill, eyedropper, move, hand, and stamp.
- Brush sizes 1–8 for pencil/eraser; shape previews commit once on release.
- Eraser removes the glyph; an option also resets its background and alpha.
- Flood fill matches the complete starting cell and uses an iterative algorithm.
- Zoom 25–400%, fit-to-view, panning, grid toggle, cell dimensions, background,
  and fullscreen with browser-support fallback.
- Coordinate mapping stays correct at all zoom levels and after scrolling.

### Symbols and colors

- Searchable palettes for ASCII, alphanumerics, boxes, blocks, geometric symbols,
  arrows, stars, mathematics, braille, and Unicode art.
- Custom palettes and local favorites, with accessible character names.
- Foreground/background pickers, validated hex inputs, transparent background,
  recent colors, saved palettes, ANSI swatches, monochrome view.
- Selection recoloring modifies stored cells; monochrome view is a preview option.

### Editing and history

- Cut/copy/paste, select all, delete selection, duplicate, horizontal/vertical
  flips, clockwise rotation, arrow-key movement, clear, and find/replace.
- Internal clipboard preserves cell colors; external text clipboard preserves
  whitespace. Clipboard denial produces a usable manual-copy fallback.
- Move operates on a captured selection, clears its source, clips at boundaries,
  and commits atomically. Rotation swaps rectangular selection dimensions.
- One pointer gesture is one undo transaction. Text entry groups until caret
  navigation, tool change, or a brief inactivity boundary.
- Cap history by memory budget and expose undo/redo availability accurately.
- Keyboard commands ignore ordinary form inputs. Escape cancels a preview;
  Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z redo, Ctrl/Cmd+C/X/V/A/S and tool shortcuts.
- Canvas has a focusable keyboard caret, arrow navigation, type/draw support,
  announced tool and coordinates, and a screen-reader-readable text view.

### Persistence, import, and export

- Debounced IndexedDB autosave, explicit Save, reload recovery, visible save/error
  state, and no claim of success when storage fails or reaches quota.
- Import plain text and versioned `.asciimorph.json` with validation and limits.
- TXT, PNG, SVG, WebP, HTML, project JSON, and clipboard exports.
- Image exports share font, cell metrics, background, colors, and compositing
  with preview. Export excludes editing overlays and grid guides.
- SVG/HTML escape content; JSON imports never execute embedded markup or code.
- Show supported-format errors and preserve the open document after failed import.

## Implementation and verification sequence

1. Foundation: package setup, strict configuration, model tests first, routes,
   design tokens, homepage and studio shell.
2. Grid: tests first for coordinates, clipping, all drawing algorithms, brushes,
   selection clipboard/transforms, resize, and whitespace import.
3. State: transaction/history tests first; connect tools and keyboard commands.
4. Rendering: canvas preview, pointer gestures, pan/zoom, fullscreen, mobile UI.
5. Reliability: serialization/validation/export tests first, IndexedDB recovery,
   error states, project imports, color palettes, and symbol favorites.
6. QA: run lint, strict type checks, unit tests, and production build after each
   phase. Exercise real browser drawing, drag interpolation, undo/redo, selection,
   import/export/reopen, reload recovery, mobile panels, and keyboard editing.

Use a design-critic review before implementation and an independent code review
before completion, as required by the supplied frontend workflow. Record actual
test results and limitations; never substitute an unexecuted checklist for checks.

## Later roadmap, including the added creative tools

| Phase | Deliverable and integration |
| --- | --- |
| 3 | Image conversion: luminance/aspect correction, worker-based processing, controls, presets, comparison, and Edit in Studio. |
| 4 | Licensed FIGlet typography, original templates, searchable local gallery, favorites, and saved creations. |
| 5 | Video/GIF frame pipeline, playback/timing, selected-frame handoff, supported animated exports with runtime encoder checks. |
| 6 | Layer management, frame animation, onion skin, effects, presets, and multi-project persistence. |
| 7 | Responsive/accessibility/performance review and export parity across supported browsers. |
| 8A | Generative ASCII: seeded noise, waves, particles, fractals, parameter controls, snapshot to Studio and frame export. |
| 8B | 3D ASCII: GLB/OBJ loading, bounded model resources, orbit controls, lighting, rendered-frame conversion, Studio snapshot and animation export. |
| 8C | Smart ASCII: edge-aware characters and enhancement first; local background/subject segmentation evaluated separately; optional AI clearly opt-in later. |
| 8D | Audio-reactive ASCII: local audio files first, frequency/volume analysis, tunable visual response, then explicit microphone opt-in and supported recording. |

Keep each added tool as an independently reviewable milestone using the shared
cell format and export pipeline. No paid API or mandatory account is required.

## Approval boundary

### Design review resolutions

The independent design review identified four gaps. Resolve them as follows:

- Component states: 2px accent focus ring with 2px offset; raised-surface hover;
  accent outline plus check/icon for selection; secondary text for disabled
  controls without opacity reduction; #FF9C9C errors with text and an icon.
  Sheet shadow is `0 12px 40px #00000066`. Verify text contrast at 4.5:1 and
  control/focus contrast at 3:1 in the rendered interface.
- Responsive composition: at 1440px use a 56px tool rail, 224px library, flexible
  canvas, and 272px inspector. At 768px use a 48px rail, flexible canvas, 240px
  inspector, and library sheet. At 375px use a 48px header, full-width canvas,
  56px tool strip, and tabbed bottom sheet. File actions collapse into a menu.
  Sheets contain focus, close with Escape, and restore focus to the trigger.
- Keyboard behavior: in Move mode arrows move the captured selection; otherwise
  arrows move the caret. Alt+arrows pan, +/- zoom, and 0 fits the canvas. Space
  temporarily activates Hand outside text entry. Text mode accepts normal spaces.
- Rendering contract: document background is a separate nullable color. A null
  cell background reveals lower content; a space may still paint a background.
  Cell alpha applies to background and glyph together. Composite layers bottom
  to top with visibility and layer opacity. JSON preserves the complete model.
  PNG/WebP preserve alpha. TXT intentionally loses color, opacity, and fonts.
  SVG embeds the artwork font and license in a self-contained file; HTML uses
  the same font as a data URL. Preview and exports wait for the font to load;
  font failure is reported. Oversized image exports give a reduce-scale error.
- Draft recovery: demos and imports create new project IDs and retain the prior
  draft. If its pending save fails, offer download before switching. Imports
  validate in temporary state with progress and replace the view only on success.
  Startup waits for IndexedDB, then offers Resume or Start blank for a saved
  draft. A corrupt draft offers raw download and a new document without silent
  overwrite. Storage denial keeps editing/export available with an unsaved state.

This document is a concrete design proposal, not an implementation claim.
The brainstorming skill requires design approval before scaffolding or production
code. After approval, create the detailed implementation plan and begin Phase 1,
then Phase 2, with tests written before their corresponding behavior.
