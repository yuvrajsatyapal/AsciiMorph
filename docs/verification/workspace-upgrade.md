# Workspace upgrade verification ledger

Plan: docs/superpowers/plans/2026-10-19-workspace-upgrade.md

## Decisions

- User requested all improvements in one continuous run; proceeding through planning and implementation without intermediate approval gates.
- Work stays in the existing checkout on codex/workspace-upgrade. No commit, push or publication requested.
- Backup import adds fresh project IDs. All input is validated before writes. Cross-database imports are not globally atomic; quota failures report the imported count and preserve originals, leaving successful new copies available.
- Library thumbnails use character previews. They do not require expensive rasterizing of every saved document.
- Retain local-first storage and runtime feature detection. Physical phones and real microphone hardware cannot be verified by desktop browser emulation.

## Workspace/storage tests

- Regression observed automatic eviction fail: 14 saves produced only 8 retained animations. Eviction removed; retention and explicit deletion regressions pass.
- Backup tests verify document/animation/snapshot roundtrip, fresh IDs, folder/pin retention, malformed data rejected before writes, explicit duplicate/rename/delete, dotted gallery preference keys, quota failure preserving old artwork.
- Shared navigation guard tests verify failed saves block navigation; tool preference tests verify remount restoration and malformed types.
- Production Chromium desktop/mobile workspace flows: 4 passed (library rename/folder/pin, download/import backup, delete, command menu, cross-tool settings).
- First development-server attempt had transient navigation timeouts during concurrent source edits. Production rerun passed all four; initial failures retained as investigation evidence.

## Integration

Pending final suite/build, compatibility run, and independent review.

## Review fixes

Independent review accepted all six material findings after regression fixes (see workspace-review.md):
- Bounded animation undo/redo to an estimated24MB combined budget and40steps; internal edits reuse unchanged documents.
- Integer generator frame durations preserve exact supported loop lengths at the120frame limit.
- Reject unsupported non-Normal layer merges before changing cells.
- Validate restored template/preset/audio cue collections; merge reusable collections instead of skipping existing keys.
- Export and import share a240MB UTF8/2000project budget; oversized exports fail before download.
- Import restores exact snapshot count, including100snapshot boundary, without accumulating the initial autosave snapshot.

Design review fixes: inline dialog errors, viewport-bounded dialog scrolling,44px mobile workspace/library targets, fixed-width scrollable navigation links.

First expanded browser matrix found Firefox translucent-PNG normalization, a Chromium-only project-name assertion, unsupported WebP encoding in WebKit, WebKit speculative-prefetch cancellation errors, and a WebKit audio recording issue. PNG parity now compares exported pixels with a browser-encoded preview PNG; alpha-weighted Firefox normalization was measured below2/255. Tests check explicit unsupported-codec feedback. Navigation speculative prefetch is disabled during local editor workflows. Final reruns pending.
