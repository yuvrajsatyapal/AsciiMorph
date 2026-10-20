# Creative tools upgrade verification

Task 4 implemented in the existing creative tools, typography and gallery. No dependencies were added.

## Delivered behavior

- Video/GIF import: trim start and duration, native source-video preview, explicit reconversion, output columns/rows, character/color presets. Imports permit up to 60 seconds at an appropriate sample rate while preserving the 120-frame and one-million-output-cell budgets. GIF trim clips original delays; video samples are sought at the trim offset. Per-frame conversion source metadata is removed to avoid duplicating raw image data into animations.
- Source audio: converted-video WebM export can use the original local video file as its soundtrack, with the shared animation export's `audioOffset` set to the trim used during conversion. GIFs and saved frame projects cannot embed audio. UI explicitly explains real-time recording and tab-visibility constraints.
- 3D: named camera presets, perspective, adjustable light direction, material color override, wireframe. Preview and orbit exports call a dedicated mesh worker; superseded previews terminate their workers. Errors, cancellation, clone failures and timeout release workers. The existing triangle/raster budgets remain in force.
- Audio: selectable FFT frequency range, three visual presets, rising-energy beat accents, source seeking, and timestamped visualization cues. Controls and cues persist across tool navigation. Frequency ranges affect spectral bands/ring energy; raw waveform display remains the source waveform. These are energy-transient accents, not musical tempo estimation.
- Generators: wave frequency, particle count, fractal iteration count, saved named presets, exact-period loops, scale animation, two-generator composition and blend mix. Motion frames span the chosen period within the existing 120-frame cap.
- Typography: three original CC0 FIGlet alphabets (Grid, Wide, Slim), immediate font preview, side-bearing kerning, line spacing, character outlines, vertical color gradients. Placement into a selected existing saved project creates a clipped new layer, preserves old layers, saves a recovery snapshot, and synchronizes the in-memory document to prevent stale Studio state overwriting the new layer.
- Gallery: visible/searchable tags, collections, reusable custom templates preserving colors and layers, and explicit custom-template removal. Whole-library backup integration must include `asciimorph.gallery.templates.v1` and `asciimorph.gallery.favorites.v1` (communicated to root).
- Creative settings, typography settings and generator presets use the shared workspace persistence hook.

## Regression evidence

The initial six upgrade regressions failed against the old implementation: generator loop/parameters, frequency ranges, mesh options, video trim, typography placement and custom-template roundtrip. All now pass.

An additional GIF regression first demonstrated that an out-of-range trim returned an empty successful import; it now rejects the selection before conversion. Worker lifecycle regression first demonstrated a worker leak when `postMessage` throws; it now terminates the worker.

Follow-up GIF trim regression observed a failing 10 ms leading fragment when trimming 90 ms into a 100 ms source frame. The importer now coalesces that time into the next frame and rounds trim offsets to integer milliseconds. Coverage also checks final fragments and coalesced delays crossing the 10,000 ms project limit, preserving total selected time with every frame inside the 20–10,000 ms bounds. `npx vitest run src/creative/media.test.ts src/creative/upgrade.test.ts` — **20 passed**; scoped ESLint for `media.ts` and `media.test.ts` passed.

Focused command: `npx vitest run src/creative/media.test.ts src/creative/upgrade.test.ts src/creative/generators.test.ts src/creative/audio.test.ts src/typography/figlet.test.ts src/components/typography/typography.test.tsx src/gallery/catalog.test.ts` — **38 passed**. Separate mesh-runner lifecycle suite — **3 passed**. Scoped ESLint completed without errors before final formatting; root owns final integrated lint/typecheck/build. The last global TypeScript attempt was blocked only by the concurrently edited animation test's unsupported `exact` option; no Task 4 TypeScript errors remained at that time.

## Workflow measurements

Reproduce with `ASCII_PROFILE=1 npx vitest run src/creative/workflow-profile.test.ts --reporter=verbose --silent=false`. The profiling test is skipped in the ordinary suite. Measured on this host in Vitest/jsdom; timings include actual generation, full document validation and serialization, not only sampling. One completed run:

| Workflow                                                               |     Elapsed | Serialized bytes |
| ---------------------------------------------------------------------- | ----------: | ---------------: |
| 30 composed waves/64-particle frames + serialization                   | 1,006.25 ms |        4,619,370 |
| 36 perspective cube orbit frames + serialization                       | 1,000.52 ms |        5,543,100 |
| 120 FFT analyses + audio visual frames + serialization                 | 1,763.07 ms |        8,892,240 |
| Font parse → styled lettering → layer placement → template save/reload |   233.36 ms |          307,759 |

These are CPU workflow measurements under jsdom, not browser frame-rate or encoding benchmarks and not a before/after speed claim. A concurrent-load run was slower, demonstrating that host load materially affects the measurements. Worker routing moves mesh raster work off the browser UI thread; worker startup and structured-clone costs have not been benchmarked. No Rust performance claim is made.

## Browser and platform limits

A direct headless Chromium launch was attempted but the filesystem sandbox denied the macOS MachPort bootstrap before browser navigation. Therefore no independent browser QA success is claimed here; root owns the final escalated production Chromium/Firefox/WebKit run.

Physical phones, real microphones, complex third-party meshes, source videos with varied audio codecs, and storage exhaustion for the custom-template quota have not been exercised by this subtask. Audio retention depends on the browser decoding the source video's audio track through HTMLAudio and supporting MediaRecorder WebM audio. Live recording can drift or drop frames when the browser throttles the tab; deterministic soundtrack muxing is not introduced. The 3D parser still excludes textures, skins and external resources; material color is a manual override rather than imported GLB materials. New fonts are original variants of the bundled alphabet, not an external font catalog. Generator preset and custom-template storage is bounded and surfaces failures through the shared settings error UI or local alerts.
