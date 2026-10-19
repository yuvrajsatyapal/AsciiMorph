import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function blank(page: import("@playwright/test").Page) {
  await page.goto("/studio");
  const fresh = page.getByRole("button", { name: "Start blank", exact: true });
  if (await fresh.isVisible()) await fresh.click();
  await expect(page.getByTestId("ascii-canvas")).toBeVisible();
}
test("manual drawing, history, typing, and saved project exports", async ({
  page,
}) => {
  await blank(page);
  await page
    .getByRole("textbox", { name: "Project name" })
    .fill("My constellation");
  await page.getByRole("button", { name: "Pencil", exact: true }).click();
  const canvas = page.getByTestId("canvas-input");
  await canvas.click({ position: { x: 25, y: 25 } });
  await expect(page.getByTestId("document-text")).toContainText("#");
  await expect(page.locator(".canvas-topline")).toContainText(
    "My constellation",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("document-text")).not.toContainText("#");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("document-text")).toContainText("#");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await canvas.click({ position: { x: 45, y: 45 } });
  await canvas.press("A");
  await expect(page.getByTestId("document-text")).toContainText("A");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download project JSON", exact: true })
    .click();
  const download = await pending;
  const file = await download.path();
  const doc = JSON.parse(await readFile(file!, "utf8"));
  expect(doc.version).toBe(1);
  expect(
    doc.layers[0].cells.some((c: { char: string }) => c.char === "A"),
  ).toBe(true);
});
test("demo transfer, save and reload recovery", async ({ page }) => {
  await page.goto("/studio?demo=orbit&char=%40&color=91D3BD");
  await expect(page.getByTestId("document-text")).toContainText("@");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Saved");
  await page.goto("/studio");
  await page
    .getByRole("button", { name: "Resume latest", exact: true })
    .click();
  await expect(page.getByTestId("document-text")).toContainText("@");
});
test("PNG export matches preview pixels without editing overlays", async ({
  page,
}, info) => {
  test.skip(
    info.project.name === "mobile",
    "Exact backing pixels use the desktop 1x pixel ratio.",
  );
  await page.goto("/studio?demo=orbit&char=%40&color=91D3BD");
  await expect(page.getByTestId("ascii-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG", exact: true }).click();
  const path = await (await pending).path();
  const base64 = (await readFile(path!)).toString("base64");
  const equal = await page.evaluate(async (b64) => {
    const preview = document.querySelector(
      '[data-testid="ascii-canvas"]',
    ) as HTMLCanvasElement;
    const im = new Image();
    im.src = "data:image/png;base64," + b64;
    await im.decode();
    const c = document.createElement("canvas");
    c.width = im.width;
    c.height = im.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(im, 0, 0);
    const a = ctx.getImageData(0, 0, c.width, c.height).data,
      b = preview
        .getContext("2d")!
        .getImageData(0, 0, preview.width, preview.height).data;
    return a.length === b.length && a.every((n, i) => n === b[i]);
  }, base64);
  expect(equal).toBe(true);
});
test("tools, zoom alignment, focus exit, and responsive panel access", async ({
  page,
}, info) => {
  await blank(page);
  const input = page.getByTestId("canvas-input");
  for (const name of [
    "Pencil",
    "Eraser",
    "Text",
    "Selection",
    "Line",
    "Rectangle",
    "Filled rectangle",
    "Ellipse",
    "Fill bucket",
    "Eyedropper",
    "Move",
    "Hand",
    "Stamp",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await input.click({ position: { x: 25, y: 25 } });
  await input.press("Tab");
  await expect(input).not.toBeFocused();
  await input.focus();
  await input.press("Shift+Tab");
  await expect(input).not.toBeFocused();
  const before = await page.getByTestId("ascii-canvas").boundingBox();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const after = await page.getByTestId("ascii-canvas").boundingBox(),
    hit = await input.boundingBox();
  expect(after!.width).toBeCloseTo(before!.width * 1.25, 0);
  expect(after!.width).toBeCloseTo(hit!.width, 0);
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Symbols", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Character library", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close settings" }).click();
    await page.getByRole("button", { name: "Canvas", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Canvas settings", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close settings" }).click();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("imports text, performs shape gestures, and exports all supported formats", async ({
  page,
}) => {
  await blank(page);
  await page.locator("input[type=file]").setInputFiles({
    name: "test.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(" A\nBC\n"),
  });
  await expect(page.getByTestId("document-text")).toContainText("BC");
  const input = page.getByTestId("canvas-input");
  for (const name of ["Line", "Rectangle", "Filled rectangle", "Ellipse"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await input.hover({ position: { x: 4, y: 4 } });
    await page.mouse.down();
    await input.hover({ position: { x: 14, y: 30 } });
    await page.mouse.up();
    await expect(page.getByTestId("document-text")).toContainText("#");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
  }
  await page.getByRole("button", { name: "Export", exact: true }).click();
  for (const [label, ext] of [
    ["TXT", "txt"],
    ["SVG", "svg"],
    ["WebP", "webp"],
    ["HTML", "html"],
  ]) {
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: `Download ${label.toUpperCase()}`,
        exact: true,
      })
      .click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(new RegExp("\\." + ext + "$"));
    expect((await readFile((await download.path())!)).length).toBeGreaterThan(
      0,
    );
  }
});
test("recovery snapshots reopen as distinct editable documents", async ({
  page,
}) => {
  await page.goto("/studio?demo=orbit");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Saved");
  const mobile = page.getByRole("button", { name: "Canvas", exact: true });
  if (await mobile.isVisible()) await mobile.click();
  const recovery = page.getByRole("button", {
    name: "Recovery & projects",
    exact: true,
  });
  if (await recovery.isVisible()) {
    await recovery.click();
    await expect(
      page.getByRole("dialog", { name: "Recovery & projects" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /^Restore / })
      .first()
      .click();
    await expect(
      page.getByRole("textbox", { name: "Project name" }),
    ).toHaveValue(/recovered/);
  }
});
test("actual touch drawing and final responsive page health", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.setViewportSize(
    info.project.name === "mobile"
      ? { width: 375, height: 812 }
      : { width: 1440, height: 900 },
  );
  await blank(page);
  await page.getByRole("button", { name: "Pencil", exact: true }).click();
  const input = page.getByTestId("canvas-input");
  if (info.project.name === "mobile")
    await input.tap({ position: { x: 24, y: 24 } });
  else await input.click({ position: { x: 24, y: 24 } });
  await expect(page.getByTestId("document-text")).toContainText("#");
  await page.goto("/studio?demo=orbit&char=%40&color=91D3BD");
  await expect(page.getByTestId("ascii-canvas")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `docs/screenshots/studio-${info.project.name}.png`,
  });
  expect(errors).toEqual([]);
  if (info.project.name === "desktop") {
    await page.setViewportSize({ width: 768, height: 1024 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Symbols", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Character library", exact: true }),
    ).toBeVisible();
  }
});
