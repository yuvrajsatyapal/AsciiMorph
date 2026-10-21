# Existing audio baseline repair

Goal: restore the existing build/test baseline needed to verify the full application rebuild. This is a small compatibility repair, not a new audio product feature.

Scope: src/creative/audio.ts, src/components/creative/audio-tool.tsx and their focused tests. Preserve other workspace changes. No commits/push unless separately directed.

1. Reproduce the existing src/creative/audio-playback.test.ts failures: seeking to duration restarts instead of ending; decodeAudioFile export is missing and blocks TypeScript.
2. Fix seek while playing: pause, clamp offset; if final timestamp call onEnded once and do not restart. An explicit play from end restarts. Idle seek must not unexpectedly play. Add focused cases only where coverage is missing.
3. Implement decodeAudioFile(file,context,probe?) with duration probe injection for tests. Default probe uses an audio element/object URL metadata, cleans listeners/source/URL on success/failure, and reports unsupported decode clearly. Reject invalid or over600second metadata before file.arrayBuffer/decodeAudioData. After decode validate actual duration again. Keep existing UI file-size/type gate and use helper in AudioTool instead of duplicate post-decode duration validation.
4. TDD: existing failing tests plus focused probe cleanup/normal decode cases, then implementation. Run focused audio tests and TypeScript; no broad unrelated changes.
5. Independent scoped review before closing baseline issue; full suite rerun only after core worker/adapter changes justify the integration checkpoint.
