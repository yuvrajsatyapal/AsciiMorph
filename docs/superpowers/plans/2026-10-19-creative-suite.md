# Creative Suite Implementation Plan

> Use subagent-driven-development for isolated implementation responsibilities and independent design/code review. The user authorizes combined execution without intermediate gates. Defer verification until implementation is complete, per the latest instruction.

**Goal:** Implement remaining phases 4–8 with Rust acceleration and existing document compatibility.
**Architecture:** Existing Next.js routes and document renderer; Rust/WASM numeric engine; bounded independent animation documents; browser-native media, audio and mesh decoding.
**Stack:** Existing React/TypeScript/Canvas/IndexedDB/Vitest/Playwright, Rust cdylib/wasm32, native browser encoders.

- [x] Rust: own rust/, scripts/build-wasm.*, src/converter/wasm.ts and numeric engine integration. Add tests before implementation; alpha-weighted sampling and Sobel filtering retain parity and support directional edges. Add package scripts and measured benchmark after coordinating package edits.
- [x] Typography/gallery: own src/typography/, src/gallery/, src/components/typography/, src/components/gallery/, src/app/type/, src/app/gallery/ and licensed font assets. Tests for FIGlet layout, gallery/favorite validation, document handoff; implement functional responsive routes.
- [x] Studio layers/frames: own editor/core changes and src/animation/, src/components/animation/, src/app/animate/. Add tests for active layer, immutable operations, frame validation and timing. Provide layer controls/effects and animation playback/onion skin/import/export; coordinate media frames through an exported openAnimation(frames) handoff.
- [x] Creative media: own src/creative/, src/components/creative/, routes /create,/generate,/three,/audio and media UI. Tests for seeded determinism, mesh parsing/bounds, sequence limits; implement parameterized generators, local OBJ/GLB rendering, audio frequency visualization, video/GIF decoding, GIF/browser recording exports and shared Studio snapshot.
- [x] Integration: connect homepage, Studio and converter navigation. Ensure no unsaved draft replacement and all routes discoverable. Keep existing font/design tokens and accessible text view.
- [x] Checking: run all suites after implementation, fix failures, run independent spec then quality review, then fresh lint/typecheck/unit/e2e/production build. Update README and verification report with actual outcomes and limitations.

Completed with executed verification in `docs/verification/creative-suite.md`. Browser compatibility and encoding limits are documented in `docs/creative-suite.md`.
