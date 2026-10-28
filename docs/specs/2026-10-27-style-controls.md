# Captured style controls

Approved scope: extend Characters, Pixel and Mosaic and shared Braille composition without changing any v1 wire bytes or default pixels. These are independently specified algorithms, not verified reference pixel equivalence.

## Contract and semantics

A separate optional 64-byte SCX1 context trailer, version 1, is accepted only by new begin exports advertising `render_style_context_version() == 1`. Default settings continue through the historical begin exports. Every context is copied into its owning job before stepping; no session-global mutable render settings. Settings include backdrop (`none`, black `solid`, `original`, `blur`), softness 0–60 (default8), backdrop opacity 0–100 (default100), layer opacity (existing family opacity, additive Characters opacity), blend source-over/overlay/color-dodge/screen/lighter, coverage 0–100 (default100), mapping inversion and seeded random glyph selection for Characters. Ramps remain canonical editable strings; presets only replace that string.

Backdrop opacity scales premultiplied RGB and alpha together. W3C separable blends use straight source/backdrop channels with premultiplied Porter-Duff composition; lighter adds premultiplied channels and alpha with clamping. Blur0 is original; blur8 uses exactly the existing three box widths. Other blur radii use the same bounded six-pass approximation, at most481 initialization taps per work unit at scale4. Coverage uses a deterministic hash of cell position and project seed, never frame time; 0 emits no layer and100 retains all cells. Characters inversion changes ramp selection only, preserving colors. Existing tile inversion retains its historical color semantics. Existing effects/text/masks rejection remains.

## Implementation sequence

1. Add context codec/math and numerical failing tests; implement alpha-safe blends and deterministic occupancy.
2. Thread copied context into existing native jobs/compositors and add explicit ABI exports. Reuse existing scratch and admission estimates; include inline context storage through size_of, keep256MiB ceiling.
3. Add typed optional TS settings context and wire trailer. Validate exact fields/version, fail unsupported nondefault contexts before transfer. Carry context through existing service/worker/thumbnail settings identities.
4. Extend registry descriptors and bounded old-shape migration (only complete known historical required fields). Expose controls in existing parameter shell; presets write ramp strings.
5. Run focused native/TS tests, regenerate WASM, exercise actual worker controls/capture/thumbnail, geometry and phone smoke. Record verification and limitations.

## Acceptance

Historical numerical and wire fixtures unchanged. Tests cover malformed fields/version, alpha and blend endpoints, coverage endpoints, inversion independent of color, blur0/8/extrema, captured state/resource ownership, old-WASM default fallback and explicit nondefault failure, project compatibility, thumbnails and equal-scale preview/export. Parent owns independent review/full integration build.
