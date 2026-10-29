# Existing-style correction checkpoint — 29 October 2026

Pixel correction is implemented, but **full reference visual acceptance remains open**. Mosaic, Characters and Dither corrections have not been implemented in this checkpoint. All later requested work stays open in its original order.

## Reproduction and findings

Used owned `tests/fixtures/gradient.png` (128×64 RGBA) in the live reference editor. Upload tool stalled about22 minutes but eventually completed; avoid repeating this tool path. Saved the crop unchanged and explicitly normalized controls. AX `setValue` committed values reliably; batched DOM range fills followed by keys reverted to stale values. Read back complete control values into `pixel-reference-controls.json`. Reference output bounds at100% are x566,y354,128×64. At300% they are x438,y290,384×192, CSS transform scale(3).

Public source observed in current page asset inventory: `https://www.ascii-magic.com/app/_next/static/chunks/3h-myp5srmnc2.js` (renderer) and `14oy7epej0wf_.js` (backdrop). Static scripts fetched read-only for diagnosis, never executed. Diagnostic readable copies in `/tmp/asciimorph-reference-source/`. These confirm:

- Pixel retains0.6F×F pitch, center-floor sampling clamped to source, half-output-pixel insets, six levels per channel. Its ink uses charOpacity directly, independently of source alpha. Hidden transparent RGB normalizes to zero at the image-data boundary. Quantization math was already correct.
- Mosaic samples a sparse grid in the originating base cell, tones/clamps each tap before averaging, and paints rounded tiles inset1. Wide/Tall skip alternating base cells but do not sample the entire merged tile. No Mosaic implementation change is retained yet.
- Reference backdrop uses Canvas `filter=blur(softness px)` over a black canvas. Local blur is an independent multi-box approximation with clamp borders and retained alpha; broader compositing acceptance remains open.

Pixel native regressions: coverage RED255 vs64 at corner and center REDblue vsred, then GREEN. Quant thresholds already passed and retain the existing formula. Added alpha regression with old sample alpha temporarily restored: RED128 vs expected255, then restored source-independent ink alpha and GREEN. Existing gapless Pixel expectations were replaced with interior-tone assertions plus new edge coverage tests. Mosaic behavior is unchanged. Thumbnail tests independently box-integrate the actual full rendered frame, rather than assuming constant frames after inset rendering.

## Lossless reference export acquired

Reference Export menu was initially at2×. Selected1× and verified128×64. A normal Export PNG click returned “Export complete” promptly. A second click with the documented download listener returned `/Users/yuvrajsatyapal/Downloads/ascii-magic-2.png` after about75seconds despite shorter requested timeouts. Copied unchanged to `pixel-reference-export.png`. This is a real lossless reference export, unlike the28October JPEG crops.

Compared the corrected local PNG flattened onto black with the lossless reference: diagnostic RGB MAE3.0373128255. All4293 tested interior pixels match RGB exactly. Interior mask: x modulo6.6 in[1,5.1], y modulo11 in[1,9.5]. Remaining differences are on borders/gaps, especially top/bottom backdrop boundaries. Reference alpha is255 throughout; local blurred backdrop retains source alpha. Example(0,0): reference[1,1,4,255], local[5,3,36,76]. Do not declare full acceptance from the interior-only result.

`pixel-before-after.png` rows: current JPEG reference, previous local, corrected local. `pixel-metrics.json` records diagnostic screenshot RGB MAE20.5080 before,15.6769 after; JPEG artifacts are substantial. Lossless values supersede that metric for diagnosis. Historical28October captures remain unchanged.

`*-local.png` and `*-local-settings.json` were freshly captured by the existing production-route reference-comparison test. Allfour accepted frames matched current style/source/revision, browser canvas readback after equivalent premultiplication, and downloaded PNG raw bytes. Local captures of Mosaic/Characters/Dither are unchanged renderer baselines, not accepted visual corrections.

## Verification and review

- Production desktop reference-comparison test:1passed (four style preview/export checks).
- Full JavaScript suite:849passed,1existing skipped (94files); focused actual-WASM suite19passed.
- TypeScript, scoped ESLint and diff whitespace checks passed.
- Independent reviewer found no actionable issues. Independently reran3ABI,9Pixel/Mosaic integration and4Pixel parity tests, allpassed. Reviewer did not certify binary provenance or visual acceptance.
- Final native suite/binary result is recorded in `.handoff/2026-10-29-pixel-correction.md`.

Next: finish Pixel/shared backdrop visual acceptance, then Mosaic, Characters, Dither using isolated regressions; after allfour pass, Mixed,Block,Dots,Cross,Diamond,Lines,Diagonal,LEGO,Voxel,Disco; stacked effects/order/undo/export; text/masks/lights; video/animation including Dither shimmer; recipes/library/Flow. Do not treat this checkpoint as full task completion.

Final update: native161passed; rebuiltWASMSHA256`cd62fb37c1d9e999557cfda01fb876083c38d230458bead92324af4ae8093d7d`. Focused actual-WASM19tests and production desktop four-style preview/export test reran successfully against that final binary. Scope still incomplete at repository context checkpoint.
