# Workspace Upgrade Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement all 18 requested improvement areas as an integrated local-first creative workspace.
**Architecture:** Preserve current document and animation APIs with backward-compatible optional fields. Add shared workspace navigation and library services; extend existing engines and tool UIs rather than introducing parallel tool implementations.
**Tech Stack:** Next.js 16.4, React 19, TypeScript, IndexedDB, Vitest, Playwright, Canvas, browser encoders.
**Spec:** docs/superpowers/specs/2026-10-19-workspace-upgrade.md

## Global Constraints

- Never automatically delete saved projects, overwrite unvalidated backup data, or silently swallow save failures.
- Existing documents and animation archives must remain readable.
- Use the existing palette, controls and font style; accessible labels and responsive layouts required.
- Add tests before production changes and observe failure then success.
- No publish/push or external service required. Work in the existing checkout on a feature branch.

## Review Focus

- Storage quota errors must preserve earlier projects and display actionable errors.
- Invalid backup data must be rejected before any write; imports must not replace IDs.
- History and frame selection must remain valid after delete/reorder/undo.
- Optional new document fields must survive validation and serialization.
- Unsupported browser encoder paths must explain their limitations.

### Task 1: Workspace, library, recovery and discovery (root)

Files: src/workspace/_, src/components/workspace/_, src/app/layout.tsx, src/app/projects/page.tsx, src/animation/persistence.ts, src/editor/persistence.ts, playwright.config.ts.
Produces: shared navigation; library management and backup APIs; workspace preferences hook.

- [ ] Add failing regression for retaining more than eight animations and backup validation/roundtrip.
- [ ] Remove eviction, add explicit delete and project CRUD, export/import including recovery data.
- [ ] Build shared navigation, projects/storage UI, searchable commands and onboarding.
- [ ] Add compatibility projects, browser regressions, and verification evidence.

### Task 2: Animation editing and exports

Files owned: src/components/animation/_, src/animation/project_ and new editing helpers, src/creative/gif*, src/creative/recording*, src/components/creative/motion-actions.tsx. Do not edit persistence (root owns it).
Consumes: existing AnimationProject, saveAnimation/loadAnimation.

- [ ] Write failing tests for multiframe operations/history and export options.
- [ ] Add history, selection/ranges, reorder, keyboard navigation and direct drawing.
- [ ] Add real export controls, palette/compression improvements, deterministic timing where feasible.
- [ ] Run focused tests, report unsupported capabilities explicitly.

### Task 3: Conversion, layers and mobile canvas

Files owned: src/converter/_, src/core/document.ts, src/core/layers_, src/core/render*, src/components/converter/*, src/components/editor/layers.tsx, src/components/editor/canvas.tsx, src/components/editor/editor.css, src/editor/store.ts. Coordinate if additional editor files needed.
Produces: backward-compatible source/settings metadata and layer semantics.

- [ ] Write failing tests for retained metadata, compositing and transformed conversion.
- [ ] Add crop/rotate/presets/shape-aware conversion and source/settings revision.
- [ ] Add merge/groups/masks/blend/adjustments/thumbnails and mobile pinch/pan.
- [ ] Run focused tests and document changes for integration.

### Task 4: Creative tools and gallery

Files owned: src/components/creative/_ except motion-actions.tsx and shell.tsx, src/creative/_ except gif* and recording*, src/typography/_, src/components/typography/_, src/gallery/_, src/components/gallery/_, public/fonts/\*.

- [ ] Add failing tests for new engine options and output behavior.
- [ ] Add video trim/preview/dimensions/audio controls and creative setting persistence.
- [ ] Add 3D controls/worker, audio frequency/beat/timeline/presets, generator parameters/loops/composition/presets.
- [ ] Add licensed typography choices/effects/existing-project placement and gallery tags/collections/custom templates.
- [ ] Run focused tests and supply workflow performance evidence.

### Task 5: Integration and review

- [ ] Resolve type/interface conflicts and verify the complete unit suite, lint, typecheck, build.
- [ ] Run available Chromium, Firefox, WebKit regressions and record environment limits honestly.
- [ ] Independently review each task and the whole diff, fix material findings with regression tests.
- [ ] Update docs/verification/workspace-upgrade.md with completed behavior and remaining limits.
