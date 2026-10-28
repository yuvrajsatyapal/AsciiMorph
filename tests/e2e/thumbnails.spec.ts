import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

async function upload(page: Page, variant = 0, alpha = 255) {
  const base64 = await page.evaluate(({ variant, alpha }) => {
    const canvas = document.createElement("canvas");
    canvas.width = 17;
    canvas.height = 13;
    const context = canvas.getContext("2d")!;
    const image = context.createImageData(17, 13);
    for (let y = 0; y < 13; y++) for (let x = 0; x < 17; x++) {
      const i = (y * 17 + x) * 4;
      image.data.set([(x * 17 + variant * 41) % 256, (y * 19 + variant * 29) % 256,
        (x * 7 + y * 11) % 256, alpha], i);
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  }, { variant, alpha });
  await page.getByLabel("Upload image file").setInputFiles({
    name: `thumbnail-${variant}.png`, mimeType: "image/png", buffer: Buffer.from(base64, "base64"),
  });
  await expect.poll(() => page.getByLabel("Original source comparison")
    .evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height])).toEqual([17, 13]);
}
async function pixels(page: Page, label: string) {
  const selector = label === "Rendered Characters preview"
    ? `canvas[aria-label="${label}"]` : `canvas[aria-label="${label}"]:visible`;
  return page.locator(selector).first().evaluate((canvas: HTMLCanvasElement) => {
    const { width, height } = canvas;
    if (!width || !height) return { width, height, hash: 0 };
    const rgba = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
    let hash = 2166136261;
    for (const byte of rgba) hash = Math.imul(hash ^ byte, 16777619);
    return { width, height, hash: hash >>> 0 };
  });
}
async function readyTile(page: Page, label: string) {
  // Catalog growth can move lazy thumbnails below the viewport.
  await page.getByRole("button", { name: new RegExp(`^${label} — `) }).first().scrollIntoViewIfNeeded();
  const canvas = page.locator(`canvas[aria-label="Current ${label} thumbnail"]:visible`).first();
  await expect.poll(() => canvas.evaluate((value: HTMLCanvasElement) => [value.width, value.height]))
    .toEqual([17, 13]);
  await expect(canvas).toBeVisible();
  return canvas;
}
async function exportWhileHover(page: Page, format: "png" | "jpeg") {
  await page.getByRole("button", { name: "Export", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await page.getByLabel("Format", { exact: true }).selectOption(format);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: `Export ${format.toUpperCase()}`, exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  const bytes = await readFile((await (await pending).path())!);
  await page.keyboard.press("Escape");
  return page.evaluate(async ({ raw, format }) => {
    const bytes = Uint8Array.from(atob(raw), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: `image/${format}` }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (const byte of rgba) hash = Math.imul(hash ^ byte, 16777619);
    return { width: canvas.width, height: canvas.height, hash: hash >>> 0 };
  }, { raw: bytes.toString("base64"), format });
}
test("real current-source thumbnails, transient hover, stale rejection and canonical export", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const results: string[] = [];
    Object.defineProperty(window, "__thumbnailStyles", { value: results });
    const Native = window.Worker;
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", ({ data }) => {
          if (data?.type === "thumbnailResult") results.push(data.styleId);
        });
      }
    };
  });
  await page.goto("/app");
  await upload(page);
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Styles", exact: true }).click();
  const hashes = [];
  for (const label of ["Characters", "Pixel Art", "Mosaic"]) {
    await readyTile(page, label);
    hashes.push(await pixels(page, `Current ${label} thumbnail`));
  }
  expect(new Set(hashes.map((value) => value.hash)).size).toBe(3);
  expect(await page.evaluate(() => (window as unknown as { __thumbnailStyles: string[] }).__thumbnailStyles))
    .toEqual(expect.arrayContaining(["characters", "pixel", "mosaic"]));
  const main = await pixels(page, "Rendered Characters preview");
  const tile = page.getByRole("button", { name: "Pixel Art — available" }).first();
  if (info.project.name !== "mobile") {
    await tile.hover();
    const hover = page.getByLabel("Transient style hover preview");
    await expect(hover).toBeVisible();
    await expect.poll(() => pixels(page, "Transient style hover preview"))
      .toEqual(await pixels(page, "Current Pixel Art thumbnail"));
    expect(await pixels(page, "Rendered Characters preview")).toEqual(main);
    expect(await exportWhileHover(page, "png")).toEqual(main);
    await tile.hover();
    const jpeg = await exportWhileHover(page, "jpeg");
    expect(jpeg).toMatchObject({ width: main.width, height: main.height });
    expect(jpeg.hash).not.toBe((await pixels(page, "Current Pixel Art thumbnail")).hash);
    await page.mouse.move(0, 0);
    await expect(hover).toBeHidden();
    expect(await pixels(page, "Rendered Characters preview")).toEqual(main);
    await tile.hover();
    await page.getByRole("button", { name: "Mosaic — available" }).first().hover();
    await expect.poll(() => pixels(page, "Transient style hover preview"))
      .toEqual(await pixels(page, "Current Mosaic thumbnail"));
    await upload(page, 1);
    await expect(hover).toBeHidden();
    await readyTile(page, "Pixel Art");
    expect((await pixels(page, "Current Pixel Art thumbnail")).hash).not.toBe(hashes[1].hash);
    const selectedTile = await pixels(page, "Current Pixel Art thumbnail");
    await tile.click();
    await expect.poll(() => pixels(page, "Rendered Characters preview"))
      .toEqual(selectedTile);
    await page.getByRole("button", { name: "Color controls" }).click();
    const brightness = page.getByRole("slider", { name: "Brightness" });
    await brightness.focus();
    await brightness.press("PageUp");
    await expect.poll(async () => (await pixels(page, "Current Pixel Art thumbnail")).hash)
      .not.toBe(selectedTile.hash);
  } else {
    await tile.tap();
    await page.getByRole("dialog", { name: "Styles sheet" })
      .getByRole("button", { name: "Close panel" }).click();
    await expect.poll(() => pixels(page, "Rendered Characters preview"))
      .not.toEqual(main);
  }
  expect(errors).toEqual([]);
});

test("translucent hover displays against stage background and restores accepted canvas", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.goto("/app");
  await upload(page, 2, 128);
  await readyTile(page, "Pixel Art");
  const accepted = page.getByLabel("Rendered Characters preview");
  const before = await pixels(page, "Rendered Characters preview");
  const hover = page.getByLabel("Transient style hover preview");
  await page.getByRole("button", { name: "Pixel Art — available" }).first().hover();
  await expect(hover).toBeVisible();
  await expect(accepted).toBeHidden();
  await expect.poll(() => hover.evaluate((canvas: HTMLCanvasElement) => {
    const alpha = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    return [...alpha].some((_, index) => index % 4 === 3 && alpha[index] > 0 && alpha[index] < 255);
  })).toBe(true);
  const displayed = await hover.screenshot();
  const displayedRaw = await sharp(displayed).ensureAlpha().raw().toBuffer();
  await accepted.evaluate((canvas: HTMLCanvasElement) => { canvas.style.visibility = "hidden"; });
  const isolated = await hover.screenshot();
  const isolatedRaw = await sharp(isolated).ensureAlpha().raw().toBuffer();
  expect(displayedRaw.equals(isolatedRaw)).toBe(true);
  await accepted.evaluate((canvas: HTMLCanvasElement) => { canvas.style.visibility = "visible"; });
  const stackedRaw = await sharp(await hover.screenshot()).ensureAlpha().raw().toBuffer();
  expect(stackedRaw.equals(isolatedRaw)).toBe(false);
  await accepted.evaluate((canvas: HTMLCanvasElement) => { canvas.style.visibility = "hidden"; });
  expect(await exportWhileHover(page, "png")).toEqual(before);
  await page.mouse.move(0, 0);
  await expect(hover).toBeHidden();
  await expect(accepted).toBeVisible();
  expect(await pixels(page, "Rendered Characters preview")).toEqual(before);
});

test("1000-square source keeps catalog output bounded to 192 and reports owned canvas capacity", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  test.setTimeout(120000);
  await page.goto("/app");
  await expect.poll(() => page.getByLabel("Original source comparison")
    .evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height])).toEqual([1000, 1000]);
  const pixel = page.locator('canvas[aria-label="Current Pixel Art thumbnail"]:visible').first();
  await expect.poll(() => pixel.evaluate((canvas: HTMLCanvasElement) =>
    [canvas.width, canvas.height]), { timeout: 90000 }).toEqual([192, 192]);
  const capacities = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll("canvas")].filter((canvas) =>
      canvas.width > 0 && canvas.height > 0);
    return {
      mountedCanvasBytes: canvases.reduce((sum, canvas) => sum + canvas.width * canvas.height * 4, 0),
      mountedCanvases: canvases.map((canvas) => ({
        label: canvas.getAttribute("aria-label"), width: canvas.width, height: canvas.height,
      })),
    };
  });
  console.log("THUMBNAIL_1000_CANVAS_CAPACITIES", JSON.stringify(capacities));
  expect(capacities.mountedCanvasBytes).toBeGreaterThanOrEqual(8_000_000);
});

test("coarse tablet and narrow layouts keep thumbnail selection usable", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop");
  for (const [name, viewport, hasTouch] of [
    ["coarse-tablet", { width: 1024, height: 768 }, true],
    ["fine-narrow", { width: 780, height: 900 }, false],
  ] as const) {
    const context = await browser.newContext({ viewport, hasTouch });
    const page = await context.newPage();
    try {
      await page.goto("/app");
      await upload(page);
      const styles = page.getByRole("button", { name: "Styles", exact: true });
      if (await styles.isVisible()) await styles.click();
      await readyTile(page, "Pixel Art");
      const expected = await pixels(page, "Current Pixel Art thumbnail");
      const tile = page.getByRole("button", { name: "Pixel Art — available" }).last();
      if (hasTouch) await tile.tap();
      else await tile.click();
      const sheet = page.getByRole("dialog", { name: "Styles sheet" });
      if (await sheet.isVisible())
        await sheet.getByRole("button", { name: "Close panel" }).click();
      await expect.poll(() => pixels(page, "Rendered Characters preview"))
        .toEqual(expected);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${name}-thumbnail.png`), fullPage: true });
    } finally { await context.close(); }
  }
});
