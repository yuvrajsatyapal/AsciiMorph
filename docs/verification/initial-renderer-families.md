# Task 19 thumbnail and hover verification

The current-source catalog requests actual Characters, Pixel Art, and Mosaic
profiles through the single production Worker/WASM session. Only reviewed
bindings intersected with current service capability may request thumbnails.
Inactive looks use registry defaults; the selected look uses its current
validated settings. Rust renders the full source-scale profile and performs
the 192-pixel-longest-side conversion. The JavaScript path does no numerical
resize.

The scheduler admits one native job and at most six pending requests. Exact
keys include source ID/revision, style, canonical settings, seed, time,
output dimensions, and atlas identity. It coalesces identical requests and
retains at most 24 frames and 4 MiB of actual ArrayBuffer capacity, evicting
least recently used frames. Source, settings, capability, resource changes,
and retirement invalidate cached work. An aborted active request remains
reserved until the worker sends its terminal result or the worker is retired.

Hover paints a separate bounded canvas over the stage. It does not publish
to the accepted frame or controller project/history. Pointer leave, focus
loss, source/style changes, capability loss, and disposal clear it. Touch
still selects a style directly. PNG/JPEG exports capture the canonical
project and accepted pipeline, including while hover is displayed.

## Ownership and 1000×1000 observation

Before starting native work, the runtime checks the existing 256 MiB combined
policy with three retained source copies, actual accepted/staged/captured and
cached frame backings, atlas originals/snapshots/selected/in-flight copies,
all retained canvas capacities, and the full source-scale native profile plus
conversion/readback reservation. Canvas paint separately admits its next
backing before changing canvas dimensions. The source decoder's separate
192 MiB source-pipeline policy also reads these held bytes. The native 256 MiB
session policy remains in force.

For the original 1000×1000 source, the final built `/app` run measured mounted
canvas capacity **8,147,456 bytes**: 4,000,000 each for the selected stage
and original comparison, plus 147,456 for the completed visible Pixel tile.
An earlier run sampled after Mosaic also completed and measured **8,294,912
bytes** with two tile canvases. The selected 1000-square RGBA frame contributes
at least 4,000,000 bytes; one or two cached thumbnails contribute 147,456 or
294,912 bytes respectively; three
conservatively charged source copies contribute 12,000,000 bytes. An active
1000-square raster thumbnail reserves **53,626,112 bytes** for its full
52-byte-per-pixel profile policy, 44-byte-per-thumbnail-pixel
conversion/readback/canvas peak, and 4096 bytes overhead. Those named owners
sum to **77,921,024–78,215,936 bytes** for the one/two-tile samples before variable measured atlas/grid resources and
any other live outputs. The check uses actual backing capacities at runtime,
not this example sum. Task 19a's actual WASM fixture observed **45,481,984
bytes** of linear-memory allocator capacity after the full 1000-square frame,
unchanged by thumbnail conversion. Allocator capacity is distinct from the
conservative combined-owner reservation and must not be added as another
independent source copy.

Production Playwright acceptance is in `tests/e2e/thumbnails.spec.ts`. It
checks distinct actual Worker/WASM result styles and current-source pixels,
hover/restore and stale rejection, changed source/selected parameter pixels,
canonical PNG pixels and JPEG dimensions during hover, touch selection,
desktop/Firefox/WebKit/mobile paths, and coarse-tablet/fine-narrow layouts.
The 1000-square run verifies bounded 192-square tiles and reports canvas
capacities. The full-source render is intentionally idle work; these tests
make no latency, GPU, or reference-parity claim.

Task 19 review closure: coalesced callers abort independently, and the last
live caller cancels shared native work while its reservation lasts through
terminal settlement. Budget-denied work releases its input owner. Translucent
hover hides the accepted canvas visually while retaining its backing; an
alpha-128 production browser fixture checks isolated composition, detects the
incorrect stacked control, verifies canonical PNG export, and restores the
selected frame. Independent scoped review approved both fix rounds. Final
unit verification: **809 passed, one existing skip**; focused TypeScript/lint
and production build passed. The browser evidence above remains scoped to
these profiles and does not establish full-site parity.
