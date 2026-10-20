# AsciiMorph workspace upgrade

Implement the user's 18-point improvement list in the existing local-first Next.js application in one continuous run. Preserve existing documents, animation archives, handoffs, accessible text previews, and visual language. No backend, account, or cloud service is introduced.

## Design

A compact persistent workspace navigation bar links every tool, the project library, and a searchable command menu. Existing tool-specific controls remain near their previews. Mobile controls collapse and the canvas keeps the available space. All new controls need labels and visible failure feedback.

The library lists artwork and animations together with text thumbnails, rename/duplicate/delete actions, folders and pins. Deletion requires explicit user action. Saving must never expire other projects. A storage dashboard shows browser usage, backup age, persistent-storage request, whole-library export/import, and conspicuous errors. Imports validate the entire archive before writing, preserve existing work by assigning new IDs, and include saved snapshots and workspace preferences.

Animation gets bounded undo/redo, multiselect and range actions, keyboard frame navigation, drag ordering and drawing on the current frame. Exports expose scale, frame rate, quality, looping and file-size budget, improve GIF palette/compression, and use deterministic video timestamps where supported with honest fallback messaging.

Conversion adds crop/rotate and named presets, shape-aware edge glyphs, retained source/settings and revisiting a conversion. Layers gain compositing controls, merge, groups, masks, adjustments and previews while preserving old files.

Creative tools gain video trim/preview/dimensions/audio options; typography font choices, layout/effects and placement in an existing document; 3D camera/light/perspective/material/wireframe controls and worker rendering; audio frequency/beat/preset/timeline controls; generator-specific controls, saved presets, loop/parameter animation and composition; gallery tags/collections and reusable custom templates.

Processing changes must be supported by workflow measurements; no unsupported Rust speed claims. Compatibility configuration includes Firefox and WebKit. Real physical-device and microphone tests can only be claimed when performed.

## Acceptance

Existing workflows still work. Regression tests prove no archive eviction, backups round-trip and reject invalid input without altering storage, animation editing preserves history, new processing controls affect real output, and all enabled actions have actual behavior. Run unit tests, typecheck, lint, build, and available browser tests. Document any platform capabilities or requirements that cannot be completed or verified; do not label them complete.
