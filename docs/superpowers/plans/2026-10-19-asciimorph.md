# AsciiMorph Phase 1–2 Implementation Plan

> For agentic workers: use subagent-driven-development or executing-plans to execute dependency-ordered tasks. This plan is authorized for continuous execution by the user on 2026-10-19; no further design gate is required.

**Goal:** Ship an original homepage and a working local-first manual ASCII studio.

**Architecture:** A versioned document is independent of the UI. Pure grid operations feed transaction history; preview and exports share rendering primitives. Workspace state holds documents by ID and an active ID, initially showing one document; persistence stores autosaves and bounded recovery snapshots independently.

**Tech stack:** Next.js App Router, strict TypeScript, Tailwind, shadcn-style Radix primitives, Lucide, Motion, Zustand, Canvas API, IndexedDB, Vitest, Testing Library, Playwright.

## Constraints

Preserve all requirements in the approved `docs/specs/2026-10-19-asciimorph-phase-1-2-design.md`. No converters, gallery backend, animation, full layer UI, AI, audio, or 3D implementation. No fake controls. Fonts ship locally with license notices. Test behavior before corresponding implementation; run each new suite red, then green. Configuration itself does not require behavior tests.

## Task 1 — Build configuration and document model (Phase 1)

Files: `package.json`, lockfile, `tsconfig.json`, Next/Tailwind/ESLint/Vitest configs, `src/core/document.ts`, `src/core/document.test.ts`.

- [ ] Install compatible dependencies with pinned lockfile; define dev/build/start/lint/typecheck/test scripts.
- [ ] Write tests for 80×40 defaults, independent cells, dimension limits, malformed/version-mismatched JSON, immutable round trips, and background/alpha preservation. Run `npm test -- src/core/document.test.ts`; expect failure before model exists.
- [ ] Implement `Cell { char, fg, bg, alpha }`, `Layer { id,name,visible,locked,opacity,cells }`, `AsciiDocument { version,id,name,width,height,cellWidth,cellHeight,fontSize,background,layers,createdAt,updatedAt }`. Validate finite metrics, IDs, color syntax, bounded dimensions/cell counts, grapheme limits, exact grid lengths, version and layer count before admitting input.
- [ ] Run model tests; correct failures before shell work.

## Task 2 — Homepage and responsive studio shell (Phase 1)

Files: `src/app/{layout,page,globals.css}`, `src/app/studio/page.tsx`, `src/components/{home,studio-shell,ui/*}`, `public/fonts/*`, `src/components/home.test.tsx`.

- [ ] Write homepage tests for approved headline/subtitle, Studio navigation, demo symbol/color changes, and transfer payload. Write shell tests for accessible canvas region and named panel controls. Run tests red.
- [ ] Bundle IBM Plex Sans/Mono and licenses. Implement approved tokens, responsive compositions (375/768/1440), local font faces, skip link, reduced motion, accessible controls, and real ASCII demo. Persist demo transfer under a distinct project identity.
- [ ] Implement `/studio` shell only; do not claim manual tool functionality at this milestone. Route all completed entry points correctly and describe future features as upcoming text.
- [ ] Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Fix errors. Record Phase 1 verification before implementing Task 3.

## Task 3 — Pure drawing and selection engine (Phase 2, depends on 1–2)

Files: `src/core/{grid,selection}.ts` and corresponding `.test.ts` files.

- [ ] Tests first: clipped Bresenham lines in all octants, brush coverage, eraser reset/preserve colors, rectangle outline/fill including reversed endpoints, ellipse degenerate cases, contiguous flood fill matching whole cells, text whitespace/tabs/CRLF, stamp placement, resize preserve/reset.
- [ ] Tests first: capture, cut, colored paste, source-clearing overlapping move, duplicate, recolor, horizontal/vertical flip, rotation width/height swap, boundary clipping, find/replace.
- [ ] Implement pure operations that copy only touched cell arrays; all operations honor active-layer lock and canvas bounds. Iterative fill avoids recursion limits. Text uses grapheme segmentation and tab stops.
- [ ] Run `npm test -- src/core`; all expected tests must pass.

## Task 4 — State, history, autosave, recovery (depends on 3)

Files: `src/editor/{store,persistence}.ts` and tests.

- [ ] Write tests red for document map/active ID, atomic gesture history, undo/redo invalidation, memory-bound history, transient cancellation, grouped typing, project switching, snapshot retention, autosave failure, corrupt input, and recovery without overwriting source.
- [ ] Implement Zustand workspace with one visible document, document map/active ID and document-local history. Keep UI state separate from serialized artwork. Use pending transactions for drag previews and grouped text.
- [ ] IndexedDB stores documents and bounded snapshots. Save transactional project data before announcing success. Debounce changes; snapshot meaningful saved revisions; recovery creates a new ID. Keep storage-denied editing/export available. Existing drafts remain intact when opening demo/import.
- [ ] Run state/persistence tests green, including IndexedDB with fake-indexeddb.

## Task 5 — Rendering, export and import (depends on 3–4)

Files: `src/core/{render,exports}.ts`, corresponding tests, browser rendering tests.

- [ ] Write tests red for glyph/background/alpha composition, escaped SVG/HTML, TXT whitespace, JSON round trip, transparent pixels, format constraints, and overlay exclusion.
- [ ] Build a shared render display list consumed by Canvas/SVG/HTML. Include document background separately from nullable cell backgrounds; composite visible layers correctly. Embed local font data in SVG and HTML; await font load for raster rendering. Reject oversized output. TXT flattens visible characters and intentionally loses styles.
- [ ] Dirty-region rendering compares cell/layer references and viewport settings; changed cells clear/redraw their complete composite region. Full redraw when dimensions, font, backgrounds, layer structure, or preview settings change. Keep selection/grid/caret on a separate overlay.
- [ ] Expose TXT, PNG, SVG, WebP, HTML, project JSON, copy, and validated TXT/JSON import. Verify actual WebP MIME support. Clipboard failure uses a selectable text dialog.
- [ ] Automated browser test compares preview and raster-export pixels after font loading, with colored/transparent cells and overlays excluded. Unit tests compare SVG/display-list geometry and styles.

## Task 6 — Complete manual studio integration (depends on 3–5)

Files: `src/components/editor/*`, `src/editor/{commands,palettes}.ts`, component and browser tests.

- [ ] Tests first for tool switching, Pointer Event coordinate mapping, keyboard edit/history, selection/copy/paste, shape commit/cancel, and form-input shortcut isolation.
- [ ] Wire pencil, eraser, text, selection, line, rectangle, filled rectangle, ellipse, bucket, eyedropper, move, hand, and stamp to real model operations. Pointer capture and interpolated brush paths; one history transaction per gesture.
- [ ] Add symbol categories/search/custom palettes/favorites; foreground/background hex validation, recent/saved/ANSI colors, eraser mode, monochrome view, brush size, stamps.
- [ ] Add resize preserve/reset, cell metrics, background, pan/zoom 25–400%, fit/grid/fullscreen fallback, accessible caret/text view, and collapsible panels with focus-safe mobile sheets.
- [ ] Add selection actions, find/replace, clear, shortcuts/help, project rename/save/import/export, resume/new startup flow, recoverable snapshots, error states. Saves and imports never silently replace unsaved work.
- [ ] Run all tests green, lint/typecheck/build; fix discovered errors.

## Task 7 — QA and independent review (depends on all)

Files: `tests/e2e/*`, `README.md`, `docs/verification.md`.

- [ ] Run headless browser flows on desktop and touch mobile: homepage demo transfer, blank drawing, all tools, zoom coordinates, selection transforms, undo/redo, keyboard text, reload recovery, snapshot restore, imports, every export format, modal focus and panel behavior.
- [ ] Check console/network failures, horizontal overflow at 375/768/1440, focus contrast, font loading, and preview/export consistency. Save screenshots of final UI.
- [ ] Run independent spec review, then code-quality review. Fix actionable findings with regression tests, rerun relevant checks, and re-review.
- [ ] Run fresh `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`. Record actual output and remaining browser limitations.
- [ ] Document `npm ci`, `npm run dev`, production build/start, test commands, data recovery/export safeguards, and supported format limitations. Deliver only Phase 1–2.

## Execution log

Plan approved for execution by the user's latest instruction. Checklist status and verification evidence will be updated as work progresses.
