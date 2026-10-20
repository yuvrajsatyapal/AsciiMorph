# Gate 3.5 Review

## Verdict: ACCEPT

Independent integration review completed on 2026-10-20. No outstanding material findings remain from this review.

## Resolved findings

1. **Library backup restore limits:** Export and import now enforce the same UTF-8 byte budget and 2,000-project limit. Oversized exports fail before download rather than producing an unusable backup.
2. **Generator animation handoff:** `generatorTimeline` distributes integer millisecond durations using rounded boundaries. Capped 13-, 17-, 29- and 30-second loops preserve total duration and pass animation validation.
3. **Animation history memory:** Internal animation edits preserve already validated document references. History enforces both 40 steps and an estimated combined 24 MB undo/redo budget, including retained sources and masks. The UI explains that limit. This is a conservative estimate, not a measured heap guarantee.
4. **Layer merge blending:** Merge rejects either non-normal input blend mode before mutation, with an actionable explanation. The documented single-glyph merge limitation remains explicit.
5. **Malformed recovery preferences:** Recognized template/preset/favorite collections and audio timeline entries are validated. The persistence hook validates these collections before rendering them. Collection restore merges existing saved content rather than silently skipping it.
6. **Recovery snapshot count drift:** Import replaces the temporary save snapshot with the archive's recovery rows in one transaction. A 100-snapshot archive can be imported, exported and parsed again without growing past the schema limit.

## Independent verification

- `npm test -- src/animation/editing.test.ts src/animation/project.test.ts src/workspace/library.test.ts src/workspace/preferences.test.tsx src/creative/generator-timeline.test.ts src/core/layers.test.ts` — 6 files, 36 tests passed.
- After the snapshot-count fix: `npm test -- src/workspace/library.test.ts` — 1 file, 10 tests passed, including the maximum-snapshot roundtrip regression.
- Read the upgrade spec and implementation plan, relevant integrated storage/navigation/conversion/compositing/animation/export/creative-tool paths, and the fixes addressing the findings above.
- No `.spartan/config.yaml` or rule files were found in the configured fallback locations. Review used the supplied project instructions, upgrade spec, and Gate 3.5 checklist.

## Spec compliance

The implementation covers the 18 requested improvement areas within the existing local-first architecture. Saved projects are no longer automatically evicted. Source conversion metadata remains backward compatible. Shared navigation saves pending work and surfaces failures. Backup imports preserve original project IDs by creating fresh copies. Creative controls are connected to real output paths.

The feature verification ledgers accurately describe narrower implementations and platform limits: silent WebM supports deterministic encoding; audio/MP4 fallback records in real time; groups are flat; masks are cell based; merge cannot preserve overlapping glyph shapes exactly; typography adds original font variants; material color is an override. These limitations must remain visible in final delivery reporting.

## What's clean

- Storage failures are actionable and visible, and invalid archive data is checked before project writes.
- Cross-database quota failures preserve existing projects and report partial import progress.
- Mesh/GIF workers support cancellation and cleanup.
- Export timing and generator frame construction have focused boundary regressions.
- Verification documents distinguish actual measurements from unsupported performance claims and hardware tests.

## Documentation updates needed

- Root integration owner should complete `workspace-upgrade.md` with the final whole-suite/build/browser-matrix results.
- `.memory/patterns/`: none.

## Notes

This acceptance covers the reviewed implementation and resolved findings. Final integrated build and browser compatibility execution belong to the root agent. Physical phones, real microphone permissions, varied source audio codecs, and device storage-pressure behavior cannot be claimed from unit tests or desktop mobile emulation.
