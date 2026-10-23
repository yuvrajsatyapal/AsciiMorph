import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const css = readFileSync("src/components/effects-studio/studio.css", "utf8");
it("scopes measured desktop geometry and removes movement for reduced motion", () => {
  expect(css).toMatch(
    /\.effects-studio \.studio-toolbar\s*\{[^}]*height: 52px/s,
  );
  expect(css).toMatch(
    /\.effects-studio \.studio-properties\s*\{[^}]*width: 340px/s,
  );
  expect(css).toMatch(
    /\.effects-studio \.studio-actions\s*\{[^}]*bottom: 22px[^}]*width: 568px[^}]*height: 50px/s,
  );
  const reduced = css.slice(
    css.indexOf("@media (prefers-reduced-motion: reduce)"),
  );
  expect(reduced).toMatch(/animation: none !important/);
  expect(reduced).toMatch(/transition: none !important/);
  expect(css).not.toMatch(/(^|\n)(:root|body|button|input)\s*\{/);
});

it("gives coarse toolbar targets an override as specific as the narrow-screen rules", () => {
  const coarse = css.slice(
    css.indexOf("@media (pointer: coarse)"),
    css.indexOf("@media (prefers-reduced-motion: reduce)"),
  );
  expect(coarse).toMatch(
    /\.effects-studio \.studio-tools button,\s*\.effects-studio \.studio-account button\s*\{[^}]*min-width: 44px[^}]*min-height: 44px[^}]*flex-shrink: 0/s,
  );
  // The existing narrowest packing hides Zoom in instead of shrinking targets.
  expect(css).toMatch(
    /@media \(max-width: 350px\)\s*\{\s*\.effects-studio \.studio-tools button\[aria-label="Zoom in"\]\s*\{\s*display: none/s,
  );
});
