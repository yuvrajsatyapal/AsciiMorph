import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "complete-context.spec.ts",
  workers: 1,
  timeout: 30000,
  use: { headless: true },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
