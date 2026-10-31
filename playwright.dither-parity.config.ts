import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "styles/dither-parity.spec.ts",
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
