# Reference investigation — 2026-10-20

Start with [findings.md](findings.md). The [rebuild spec](../../../../.planning/specs/ascii-magic-rebuild.md) and [epic](../../../../.planning/epics/ascii-magic-rebuild.md) are draft approval artifacts.

Only documentation/research files were added or edited during this investigation. Existing application changes were preserved. Engine verification was bounded: 2 Rust tests and 21 conversion tests passed; a sampling-only benchmark measured 1.056× WASM/JS speed ratio on this run. No new implementation, full-suite result, reference rendering parity, or complete REA semantic analysis is claimed.

REA was attempted through its pinned CLI because no MCP connection was present. The macOS helper failed compilation. `rea-status.json` summarizes the retained partial inventory and limitations. Detailed failure envelopes are diagnostic data. Public bundles were inspected separately as inert text; these findings are not mislabeled REA semantic output.

The screenshots show the actual narrow side-panel viewport. Wide desktop and intended mobile captures are still required before visual parity review. Temporary public JS files are listed and hashed in asset-manifest.json; they are not production dependencies or licensed reusable implementation code.
