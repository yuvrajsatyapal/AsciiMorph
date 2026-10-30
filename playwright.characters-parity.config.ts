import { defineConfig } from "@playwright/test";

// Supply CHARACTERS_REFERENCE_DIR containing a complete verified capture manifest.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "characters/complete-context.spec.ts",
  grep: /pinned software Characters/,
  workers: 1,
  timeout: 120000,
  use: {
    browserName: "chromium",
    launchOptions: {
      args: [
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--disable-accelerated-2d-canvas",
      ],
    },
  },
});
