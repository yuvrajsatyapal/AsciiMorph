import { canvasMatchesPng, canEncodeWebp } from "./canvas-parity";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
const browserErrors = new WeakMap<import("@playwright/test").Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
});
test.afterEach(({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});
const fixture = path.resolve("tests/fixtures/gradient.png");
async function upload(page: import("@playwright/test").Page) {
  await page.goto("/convert");
  await page.getByLabel("Browse image").setInputFiles(fixture);
  await expect(page.getByTestId("conversion-status")).toContainText("Ready");
}
async function exported(page: import("@playwright/test").Page, format: string) {
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: `Export ${format}`, exact: true })
    .click();
  return readFile((await (await pending).path())!);
}
test("local conversion, settings, previews, exports and editable handoff preserve drafts", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/studio?demo=orbit&char=%40");
  await expect(page.getByTestId("ascii-canvas")).toBeVisible();
  await page
    .getByRole("button", { name: "Convert image", exact: true })
    .click();
  await expect(page).toHaveURL(/convert/);
  await page.getByLabel("Browse image").setInputFiles(fixture);
  await expect(page.getByTestId("conversion-status")).toContainText("Ready");
  const first = JSON.parse((await exported(page, "JSON")).toString());
  expect(first.width).toBe(80);
  expect(first.height).toBe(20);
  await page.getByLabel("Output width", { exact: true }).fill("40");
  await expect(page.getByTestId("conversion-status")).toContainText("40 × 10");
  await page.getByLabel("Color mode").selectOption("color");
  await expect(page.getByTestId("conversion-status")).toContainText("Ready");
  await page.getByLabel("Invert", { exact: true }).check();
  await expect(page.getByTestId("conversion-status")).toContainText("Ready");
  const converted = JSON.parse((await exported(page, "JSON")).toString());
  expect(converted.width).toBe(40);
  expect(
    converted.layers[0].cells.some((c: { fg: string }) => c.fg !== "#e9b86e"),
  ).toBe(true);
  for (const view of ["Side by side", "Before / after", "ASCII"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    if (view === "Before / after") {
      await page.getByLabel("Comparison position").fill("25");
      await expect(page.getByAltText("Original uploaded image")).toHaveCSS(
        "clip-path",
        /75%/,
      );
    }
  }
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.getByLabel("Conversion preview").focus();
  await page.keyboard.press("+");
  await page.keyboard.press("ArrowRight");
  for (const format of ["TXT", "SVG", "WebP", "HTML", "PNG"]) {
    if (format === "WebP" && !(await canEncodeWebp(page))) {
      await page.getByRole("button", { name:"Export WebP", exact:true }).click();
      await expect(page.getByRole("alert").filter({hasText:"WEBP export is unsupported"})).toBeVisible();
    } else expect((await exported(page, format)).length).toBeGreaterThan(0);
  }
  await page.screenshot({
    path: `test-results/converter-workspace-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Edit in Studio", exact: true })
    .click();
  await expect(page).toHaveURL(/studio/);
  await expect(page.getByTestId("ascii-canvas")).toBeVisible();
  const before = await page.getByTestId("document-text").textContent();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const canvas = page.getByTestId("canvas-input");
  await canvas.click({ position: { x: 20, y: 20 } });
  await canvas.press("Z");
  await expect(page.getByTestId("document-text")).toContainText("Z");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await page.getByTestId("document-text").textContent()).toBe(before);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Saved");
  await page.reload();
  await page
    .getByRole("button", { name: "Resume latest", exact: true })
    .click();
  await expect(page.getByTestId("document-text")).toContainText("Z");
  const names = await page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const r = indexedDB.open("asciimorph");
        r.onsuccess = () => {
          const q = r.result
            .transaction("documents")
            .objectStore("documents")
            .getAll();
          q.onsuccess = () => {
            resolve(q.result.map((v) => JSON.parse(v.data).name));
            r.result.close();
          };
          q.onerror = () => reject(q.error);
        };
      }),
  );
  expect(names).toContain("Orbit");
  expect(names).toContain("gradient");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `test-results/converter-${info.project.name}.png`,
    fullPage: true,
  });
});
test("validation, replacement, removal and real Braille", async ({ page }) => {
  await upload(page);
  await page.getByLabel("Browse image").setInputFiles({
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.locator(".conversion-error")).toContainText(
    /Unsupported|decode|Malformed/,
  );
  await page
    .getByLabel("Browse image")
    .setInputFiles(path.resolve("tests/fixtures/color.bmp"));
  await expect(page.getByTestId("conversion-status")).toContainText("Ready");
  await page
    .getByLabel("Character set", { exact: true })
    .selectOption("braille");
  await expect(page.getByTestId("conversion-status")).toContainText("Ready");
  const doc = JSON.parse((await exported(page, "JSON")).toString());
  expect(
    doc.layers[0].cells.some(
      (c: { char: string }) => c.char.codePointAt(0)! >= 0x2800,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Remove image", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit in Studio", exact: true }),
  ).toBeDisabled();
});
test("PNG pixel parity on all DPRs, JPEG orientation and WebP decoding", async ({
  page,
}) => {
  await upload(page);
  const png = await exported(page, "PNG");
  const equal = await canvasMatchesPng(page, "converted-canvas", png.toString("base64"));
  expect(equal).toBe(true);
  for (const format of ["jpeg", "webp"]) {
    const b64 = await page.evaluate((type) => {
      const c = document.createElement("canvas");
      c.width = 32;
      c.height = 16;
      const x = c.getContext("2d")!;
      x.fillStyle = "#e9b86e";
      x.fillRect(0, 0, 32, 16);
      return c.toDataURL("image/" + type).split(",")[1];
    }, format);
    let bytes = Buffer.from(b64, "base64");
    if (format === "jpeg") {
      const exif = Buffer.from(
        "45786966000049492a0008000000010012010300010000000600000000000000",
        "hex",
      );
      const marker = Buffer.alloc(4);
      marker.writeUInt16BE(0xffe1);
      marker.writeUInt16BE(exif.length + 2, 2);
      bytes = Buffer.concat([
        bytes.subarray(0, 2),
        marker,
        exif,
        bytes.subarray(2),
      ]);
    }
    await page.getByLabel("Browse image").setInputFiles({
      name: `orientation.${format}`,
      mimeType: `image/${format}`,
      buffer: bytes,
    });
    await expect(page.getByTestId("conversion-status")).toContainText("Ready");
    const doc = JSON.parse((await exported(page, "JSON")).toString());
    expect(doc.height).toBe(format === "jpeg" ? 80 : 20);
  }
});
test("all processing controls, reset, keyboard targets and tablet layout", async ({
  page,
}) => {
  await upload(page);
  for (const [label, value] of [
    ["Brightness", "20"],
    ["Contrast", "30"],
    ["Gamma", "1.5"],
    ["Saturation", "150"],
    ["Sharpness", "80"],
    ["Edge detection", "60"],
    ["Character density", "1.5"],
  ]) {
    await page.getByLabel(label, { exact: true }).fill(value);
    await expect(
      page.getByRole("button", { name: "Export JSON", exact: true }),
    ).toBeEnabled();
  }
  await page.getByLabel("Dithering", { exact: true }).check();
  await expect(
    page.getByRole("button", { name: "Export JSON", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Preserve aspect ratio").uncheck();
  await page.getByLabel("Output height", { exact: true }).fill("12");
  await page.getByLabel("Character spacing", { exact: true }).fill("10");
  await page.getByLabel("Line height", { exact: true }).fill("20");
  await page.getByLabel("Transparent background").uncheck();
  await page.getByLabel("Foreground", { exact: true }).fill("#123456");
  await page.getByLabel("Background", { exact: true }).fill("#654321");
  const doc = JSON.parse((await exported(page, "JSON")).toString());
  expect(doc.height).toBe(12);
  expect(doc.cellWidth).toBe(10);
  expect(doc.cellHeight).toBe(20);
  expect(
    doc.layers[0].cells.some(
      (c: { fg: string; bg: string }) =>
        c.fg === "#123456" && c.bg === "#654321",
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Reset settings" }).click();
  await expect(page.getByTestId("conversion-status")).toContainText("80 × 20");
  await expect(page.getByLabel("Output height", { exact: true })).toHaveValue(
    "20",
  );
  await page.setViewportSize({ width: 375, height: 812 });
  const zoom = await page
    .getByRole("button", { name: "Zoom in", exact: true })
    .boundingBox();
  expect(zoom!.width).toBeGreaterThanOrEqual(44);
  expect(zoom!.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole("button", { name: "Side by side", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
test("large conversion remains editable on high DPR displays and cancellation stays responsive", async ({
  page,
}) => {
  test.setTimeout(60000);
  await upload(page);
  await page.getByLabel("Preserve aspect ratio").uncheck();
  await page.getByLabel("Output height", { exact: true }).fill("200");
  await page.getByLabel("Output width", { exact: true }).fill("300");
  const cancel = page.getByRole("button", { name: "Cancel", exact: true });
  await cancel.click();
  await expect(page.getByTestId("conversion-status")).toContainText(
    "Cancelled",
  );
  await page
    .getByRole("button", { name: "Retry conversion", exact: true })
    .click();
  await expect(page.getByTestId("conversion-status")).toContainText(
    "300 × 200",
    {timeout: 30000},
  );
  await page
    .getByRole("button", { name: "Edit in Studio", exact: true })
    .click();
  await expect(page.getByTestId("ascii-canvas")).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByTestId("ascii-canvas")
        .evaluate((c: HTMLCanvasElement) => c.width * c.height),
    )
    .toBeGreaterThan(1);
  const size = await page
    .getByTestId("ascii-canvas")
    .evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
  expect(size.w * size.h).toBeLessThanOrEqual(32000000);
  await expect(page.locator(".editor-message")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("drag and drop uses local decoding and rejects oversized dimensions before decoding", async ({
  page,
}) => {
  await page.goto("/convert");
  const bytes = await readFile(fixture);
  const transfer = await page.evaluateHandle((b64) => {
    const data = new DataTransfer();
    data.items.add(
      new File(
        [Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))],
        "dropped.png",
        { type: "image/png" },
      ),
    );
    return data;
  }, bytes.toString("base64"));
  await page
    .locator(".conversion-upload")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.getByTestId("conversion-status")).toContainText("Ready");
  await transfer.dispose();
  bytes.writeUInt32BE(20000, 16);
  await page.getByLabel("Browse image").setInputFiles({
    name: "too-wide.png",
    mimeType: "image/png",
    buffer: bytes,
  });
  await expect(page.locator(".conversion-error")).toContainText(/dimensions/i);
  await expect(
    page.getByRole("button", { name: "Edit in Studio", exact: true }),
  ).toBeDisabled();
});
