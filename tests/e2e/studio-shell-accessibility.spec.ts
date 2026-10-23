import { expect, test } from "@playwright/test";

// Narrow Task4 regression: parent runs this against the production /app build.
// Input capability is set on the browser context, not inferred from screenshot width.
const phones = [
  { width: 320, height: 740 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 1180, height: 600 },
];
for (const viewport of phones) {
  test(`coarse Studio targets and sheet-to-Menu focus at ${viewport.width}x${viewport.height}`, async ({
    browser,
    browserName,
    baseURL,
  }) => {
    test.skip(
      browserName !== "chromium",
      "This regression exercises Chromium coarse-input contexts.",
    );
    const context = await browser.newContext({
      baseURL,
      viewport,
      hasTouch: true,
      isMobile: true,
    });
    try {
      const page = await context.newPage();
      await page.goto("/app");
      const menu = page.getByRole("button", { name: "Menu", exact: true });
      await expect(menu).toBeVisible();
      expect(
        await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
      ).toBe(true);
      await expect(
        page.getByRole("button", { name: "Controls", exact: true }),
      ).toBeVisible();

      const toolbar = page.locator(".studio-toolbar");
      const targets = toolbar.locator(
        ".studio-tools button:visible:enabled, .studio-account button:visible:enabled",
      );
      expect(await targets.count()).toBeGreaterThanOrEqual(4);
      const bounds = await targets.evaluateAll((buttons) =>
        buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          const center = document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          );
          return {
            label: button.getAttribute("aria-label") ?? button.textContent,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            reachable: center?.closest("button") === button,
          };
        }),
      );
      const toolbarBounds = await toolbar.boundingBox();
      expect(toolbarBounds).not.toBeNull();
      for (const target of bounds) {
        expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(
          44,
        );
        expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(
          44,
        );
        expect(
          target.x,
          `${target.label} left clipping`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          target.x + target.width,
          `${target.label} right clipping`,
        ).toBeLessThanOrEqual(viewport.width + 0.5);
        expect(target.y).toBeGreaterThanOrEqual(toolbarBounds!.y);
        expect(target.y + target.height).toBeLessThanOrEqual(
          toolbarBounds!.y + toolbarBounds!.height + 0.5,
        );
        expect(target.reachable, `${target.label} center hit target`).toBe(
          true,
        );
      }
      const ordered = [...bounds].sort((a, b) => a.x - b.x);
      const brand = await toolbar.locator(".studio-brand").boundingBox();
      expect(brand).not.toBeNull();
      expect(ordered[0].x).toBeGreaterThanOrEqual(
        brand!.x + brand!.width - 0.5,
      );
      for (let index = 1; index < ordered.length; index++) {
        expect(
          ordered[index].x,
          "toolbar buttons must not overlap",
        ).toBeGreaterThanOrEqual(
          ordered[index - 1].x + ordered[index - 1].width - 0.5,
        );
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);

      const overflow = await page
        .locator("body")
        .evaluate((body) => body.style.overflow);
      for (const sheet of ["Styles", "Controls"]) {
        await page.getByRole("button", { name: sheet, exact: true }).click();
        await expect(
          page.getByRole("dialog", { name: `${sheet} sheet` }),
        ).toBeVisible();
        await menu.click();
        await expect(page.getByRole("dialog")).toHaveCount(1);
        await expect(
          page.getByRole("dialog", { name: "Studio menu" }),
        ).toBeVisible();
        await page.keyboard.press("Tab");
        await expect(
          page.getByRole("link", { name: "Open legacy Studio" }),
        ).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(menu).toBeFocused();
        expect(
          await page.locator("body").evaluate((body) => body.style.overflow),
        ).toBe(overflow);
      }
    } finally {
      await context.close();
    }
  });
}
