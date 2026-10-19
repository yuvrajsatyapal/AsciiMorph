# AsciiMorph

A local-first ASCII creative workspace: manual drawing, image conversion, FIGlet typography, original templates/gallery, layers, frame animation, video/GIF conversion, seeded generators, OBJ/GLB rendering and audio-reactive art.

Start at **http://localhost:3000/create** to explore all tools. Media and artwork stay in your browser; no account or server database is required.

## Run

Requires Node.js 22.22 or newer and npm.

```sh
npm ci
npm run dev
```

For production:

```sh
npm run build
npm start
```

## Rust processing

Image sampling and edge gradients run through Rust/WebAssembly inside a worker. The compiled module is bundled; normal npm setup does not require Rust. To change/rebuild the engine:

```sh
rustup target add wasm32-unknown-unknown
npm run build:wasm
npm run test:rust
cargo fmt --manifest-path rust/Cargo.toml -- --check
cargo clippy --manifest-path rust/Cargo.toml --offline --all-targets -- -D warnings
npm run bench:wasm
npm run bench:rust
```

Conversion reports its processing backend and uses JavaScript fallback if WASM is unavailable. The measured sampling workload was about 1.20× faster with WASM, including allocation/copy costs; this is not a whole-app benchmark.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
ASCIIMORPH_E2E_PRODUCTION=1 npm run test:e2e
```

Browser tests start an isolated server on port 3107 and refuse to reuse unrelated servers. Production browser tests require a fresh build.

## Saving and formats

Studio autosaves documents/recovery snapshots in IndexedDB; imports and generated artwork open as distinct projects. Animation keeps up to eight recent timelines within a bounded archive, with JSON export for long-term storage. Clear browser data only after exporting projects you want to keep.

Static export supports TXT, PNG, SVG, WebP, HTML and editable JSON. Animated export supports GIF and runtime-supported WebM/MP4, with optional soundtracks for video. Browser encoders determine MP4 availability. Imported video audio is not automatically copied; add a soundtrack or record the audio tool with source audio enabled.

See [features, formats, resource limits and architecture](docs/creative-suite.md), [verification](docs/verification/creative-suite.md), and the earlier [image conversion design](docs/phase-3.md). IBM Plex fonts ship under the SIL Open Font License; the original Morph Grid FIGlet font ships under CC0 with its source and license.
