import sharp from "sharp";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
async function pixels(page: Page) {
  return page
    .getByLabel("Rendered Characters preview")
    .evaluate((c: HTMLCanvasElement) => ({
      width: c.width,
      height: c.height,
      rgba:
        c.width && c.height
          ? Array.from(
              c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data,
            )
          : [],
    }));
}
async function controls(page: Page) {
  const open = page.getByRole("button", { name: "Controls", exact: true });
  if (await open.isVisible()) await open.click();
}
async function closeControls(page: Page) {
  const sheet = page.getByRole("dialog", { name: "Controls sheet" });
  if (await sheet.isVisible())
    await sheet
      .getByRole("button", { name: "Close controls", exact: true })
      .click();
}
async function undo(page: Page) {
  const button = page
    .locator(".studio-toolbar")
    .getByRole("button", { name: "Undo", exact: true });
  if (await button.isVisible()) return button.click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Studio menu" });
  await menu.getByRole("button", { name: "Undo", exact: true }).click();
  await menu.getByRole("button", { name: "Close Studio menu" }).click();
}
test("Dither actual Worker controls, whole-look undo and exact PNG/JPEG downloads", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const results: { styleId: string; revision: number; rgba: number[] }[] = [];
    Object.defineProperty(window, "__ditherResults", { value: results });
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", ({ data }) => {
          if (data?.type === "styleResult")
            results.push({
              styleId: data.styleId,
              revision: data.revision,
              rgba: Array.from(data.frame.rgba),
            });
        });
      }
    };
  });
  await page.goto("/app");
  await page
    .getByLabel("Upload image file")
    .setInputFiles(resolve("tests/fixtures/gradient.png"));
  await expect
    .poll(async () => [...(await pixels(page)).rgba].length)
    .toBe(128 * 64 * 4);
  const styles = page.getByRole("button", { name: "Styles", exact: true });
  if (await styles.isVisible()) await styles.click();
  await page
    .getByRole("button", { name: "Dither — available", exact: true })
    .first()
    .click();
  const styleSheet = page.getByRole("dialog", { name: "Styles sheet" });
  if (await styleSheet.isVisible())
    await styleSheet.getByRole("button", { name: "Close panel" }).click();
  async function current(after = -1) {
    await expect
      .poll(() =>
        page.evaluate((after) => {
          const r = (
            window as unknown as {
              __ditherResults: { styleId: string; revision: number }[];
            }
          ).__ditherResults.at(-1);
          return r?.styleId === "dither" && r.revision > after
            ? r.revision
            : -1;
        }, after),
      )
      .toBeGreaterThan(after);
    await expect(page.locator(".studio-stage-status")).toHaveText("");
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    return page.evaluate(
      () =>
        (
          window as unknown as { __ditherResults: { revision: number }[] }
        ).__ditherResults.at(-1)!.revision,
    );
  }
  let rev = await current();
  await controls(page);
  expect(
    await page
      .getByRole("combobox", { name: "Algorithm", exact: true })
      .locator("option")
      .count(),
  ).toBe(15);
  await page
    .getByLabel("Backdrop", { exact: true })
    .filter({ visible: true })
    .selectOption("none");
  rev = await current(rev);
  const initial = await pixels(page);
  let beforeStrength = initial;
  let previous = initial;
  for (const [label, value] of [
    ["Algorithm", "bayer8"],
    ["Palette", "pico8"],
    ["Pixel Size", "3"],
    ["Strength", "70"],
  ]) {
    if (label === "Strength") beforeStrength = await pixels(page);
    const input = page
      .getByLabel(label, { exact: true })
      .filter({ visible: true });
    if (await input.evaluate((e) => e.tagName === "SELECT"))
      await input.selectOption(value);
    else await input.fill(value);
    await input.blur();
    rev = await current(rev);
    const next = await pixels(page);
    expect(next.rgba, label).not.toEqual(previous.rgba);
    previous = next;
  }
  const edited = await pixels(page);
  expect(edited.rgba).not.toEqual(initial.rgba);
  await closeControls(page);
  await undo(page);
  rev = await current(rev);
  expect(await pixels(page)).toEqual(beforeStrength);
  await controls(page);
  await expect(
    page.getByLabel("Strength", { exact: true }).filter({ visible: true }),
  ).toHaveValue("100");
  await page
    .getByLabel("Palette", { exact: true })
    .filter({ visible: true })
    .selectOption("custom");
  rev = await current(rev);
  const custom = page
    .getByLabel("Custom Palette", { exact: true })
    .filter({ visible: true });
  await custom.fill("#112233, #aabbcc, #ff6600");
  await custom.blur();
  rev = await current(rev);
  await page
    .getByLabel("Chroma", { exact: true })
    .filter({ visible: true })
    .selectOption("perChannel");
  rev = await current(rev);
  await expect(
    page
      .getByText(/output colors can fall outside the palette/i)
      .filter({ visible: true }),
  ).toBeVisible();
  await closeControls(page);
  const preview = await pixels(page);
  for (const format of ["png", "jpeg"] as const) {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page
      .getByLabel("Format", { exact: true })
      .filter({ visible: true })
      .selectOption(format);
    await page
      .getByLabel("Scale", { exact: true })
      .filter({ visible: true })
      .selectOption("1");
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: `Export ${format.toUpperCase()}`,
        exact: true,
      })
      .click();
    const bytes = await readFile((await (await pending).path())!);
    expect(bytes.subarray(0, format === "png" ? 8 : 3).toString("hex")).toBe(
      format === "png" ? "89504e470d0a1a0a" : "ffd8ff",
    );
    const decoded = await page.evaluate(
      async ({ raw, format }) => {
        const image = await createImageBitmap(
          new Blob([Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))], {
            type: `image/${format}`,
          }),
        );
        const c = document.createElement("canvas");
        c.width = image.width;
        c.height = image.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        image.close();
        return {
          width: c.width,
          height: c.height,
          rgba: Array.from(ctx.getImageData(0, 0, c.width, c.height).data),
        };
      },
      { raw: bytes.toString("base64"), format },
    );
    expect([decoded.width, decoded.height]).toEqual([128, 64]);
    if (format === "png") {
      const raw = await sharp(bytes).ensureAlpha().raw().toBuffer();
      const captured = await page.evaluate(
        () =>
          (
            window as unknown as { __ditherResults: { rgba: number[] }[] }
          ).__ditherResults.at(-1)!.rgba,
      );
      expect(
        Array.from(raw),
        "PNG preserves captured straight RGBA bytes",
      ).toEqual(captured);
      expect(decoded).toEqual(preview);
    } else
      expect(
        decoded.rgba.filter((_, i) => i % 4 === 3).every((a) => a === 255),
      ).toBe(true);
    await info.attach(`dither-export.${format}`, {
      body: bytes,
      contentType: `image/${format}`,
    });
    await page.keyboard.press("Escape");
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await info.attach("dither-studio", {
    body: await page.screenshot({ path: info.outputPath("dither-studio.png") }),
    contentType: "image/png",
  });
});
