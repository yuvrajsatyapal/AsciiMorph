# Rebuilt Studio entry point

Problem: the local home route still renders the original landing page, whose generic Studio links open the legacy manual editor at `/studio`. The rebuilt effects Studio is mounted at `/app`, making the new application easy to miss.

Required behavior: visiting `/` redirects to `/app`. Generic Open Studio and Launch Studio links in the retained homepage component also target `/app`. Explicit manual-drawing and editable Orbit links keep their existing destinations because their document formats belong to the legacy editor. Existing creative routes stay reachable directly.

Implementation plan: first add a failing root redirect test and failing generic-link assertions; update the root page and two links; update the obsolete homepage browser acceptance to check the new default Studio route; document the launch URL; run focused tests, type checking and a real browser entry-point check. No new screen or renderer is introduced.

Verification: both new route/link assertions failed before the change and passed afterward. Full Vitest: 810 passed, one existing skip. TypeScript, scoped ESLint and diff whitespace checks passed. Desktop Chromium and mobile Chromium entry-point tests both passed, including redirected URL, nonempty rendered canvas, viewport overflow and uncaught page-error checks. Manual in-app browser inspection also confirmed the new Studio and actual Characters preview at `http://127.0.0.1:3000/app`; screenshot: `docs/verification/screenshots/2026-10-26-studio-entry.png`.

The earlier landing page and manual editor were not redesigned. Remaining style/service availability is unchanged. No fresh production build or full reference-parity claim is made.
