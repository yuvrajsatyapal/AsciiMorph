# AsciiMorph

A local-first ASCII drawing and image-conversion workspace. Phases 1–3 follow the design in `docs/specs/` and plans in `docs/superpowers/plans/`.

## Run locally

Requires Node.js 22.22 or newer and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Media and artwork stay in your browser; no account or server database is required.

```sh
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm start
```

IBM Plex fonts ship locally under the SIL Open Font License. See `public/fonts/IBM-Plex-OFL.txt`.

## Image conversion (Phase 3)

Open `/convert` or choose **Convert image** in Studio. Drop/browse a PNG, JPEG,
WebP or BMP, adjust the real conversion controls, compare previews, and export
TXT/PNG/SVG/WebP/HTML/editable JSON. **Edit in Studio** saves a new editable cell
project while preserving the previous draft. Processing stays on this device.

Uploads are bounded to 12 MiB, 24 megapixels and 8192px per side. Output is capped
at 60,000 cells. Unicode appearance depends on local font support. Read the
[architecture, algorithms and limitations](docs/phase-3.md) and
[executed verification report](docs/verification/phase-3.md).

Browser tests start their own server on port 3107 and fail rather than reuse an
unrelated server. To verify the production bundle after `npm run build`:

```sh
ASCIIMORPH_E2E_PRODUCTION=1 npm run test:e2e
```
