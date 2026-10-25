# Initial Studio style integration

This checkpoint integrates Characters plus the accepted independent Pixel/Mosaic profiles in the Studio controller/runtime. Public Pixel/Mosaic schema bindings remain null, dispatch 0, ready false; their catalog entries and controls are not activated. Braille and the remaining family integrations are pending. This is the first incremental Task 17 slice, not full Task 17/20 or reference parity.

Selection commits grouped edits separately, uses versioned defaults, preserves shared values only when schema domains match, and retains whole-look undo/redo without storing resource objects or pixels in history. Characters keeps its existing atlas binder; raster requests use the real style service with empty calibration identity and no dummy atlas. Source, style, project, revision and resource identity are checked before publishing a result.

Captured Characters output survives raster selection and another glyph atlas; captured raster output survives glyph selection. New sources cancel old captures. Existing output leases keep frames alive through noncancellable encoding after cancel/dispose. Source rollback, renderer retry, StrictMode retirement, history bounds and view-only zoom remain regression contracts.

Independent review found that the initial raster export estimate omitted retained Characters atlas resources. The fix charges original runtime backings, still-reachable WeakMap snapshots, selected service/worker/WASM/native resources, and queued/submitted atlas metadata until worker terminal or connection teardown. Accounting deduplicates shared ArrayBuffers within each JavaScript owner and separately charges independent copies. It adds no strong-reference atlas cache. Admission, encoder reservation and download retention all include these charges; raster export fails closed if the service cannot provide accounting metadata.

A near-cap regression first reproduced incorrect scale 3 export availability after retaining an approximately 14 MiB Characters atlas. It now rejects that export while retaining the accepted frame and smaller-export availability. The shared 256 MiB combined export policy and existing upload/source/native admission limits remain unchanged.

Task 17 initial review required this fix; scoped re-review accepted both specification and quality with no open findings. Final full JavaScript verification passed 765 tests with one existing skip using two workers. Production-route/control smoke, PNG/JPEG browser readback, responsive family controls and broader family acceptance remain pending Tasks 18/20. Native numerical verification is recorded separately in [pixel-mosaic.md](pixel-mosaic.md).

The final production Next build (including TypeScript checking) and scoped ESLint also passed after the retained-resource fix. No native source or WASM artifact changed during this integration.
