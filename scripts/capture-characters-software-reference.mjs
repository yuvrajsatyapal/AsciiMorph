// Real public UI capture. No reference scripts are imported or executed separately.
import { chromium, expect } from "@playwright/test";
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
const directory = resolve(
  process.argv[2] ?? "docs/research/ascii-magic/2026-10-30/characters-software",
);
const fixture = resolve("tests/fixtures/gradient.png");
const source = await readFile(fixture);
const pixels = await sharp(source).ensureAlpha().raw().toBuffer();
if (pixels.length !== 128 * 64 * 4) throw Error("Unexpected source dimensions");
for (let y = 0; y < 64; y++)
  for (let x = 0; x < 128; x++) {
    const expected = [2 * x, 4 * y, 255 - 2 * x, x < 13 ? 0 : 255];
    if (expected.some((v, c) => v !== pixels[(y * 128 + x) * 4 + c]))
      throw Error("Source is not the owned synthetic gradient");
  }
await mkdir(directory, { recursive: true });
const args = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--disable-accelerated-2d-canvas",
];
const scales = (process.env.CHARACTERS_REFERENCE_SCALES ?? "1,2")
  .split(",")
  .map(Number);
if (!["1,2", "1,2,3,4"].includes(scales.join(",")))
  throw Error("Capture requires complete scales1,2 or1,2,3,4");
const browser = await chromium.launch({ args });
let page;
try {
  page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  const backend = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(13.7, 0.5, 5.6, 10);
    const gl = document
      .createElement("canvas")
      .getContext("webgl2", { antialias: false, premultipliedAlpha: true });
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      rectangleAlpha: ctx.getImageData(13, 0, 1, 1).data[3],
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
    };
  });
  if (
    backend.rectangleAlpha !== 38 ||
    !backend.renderer?.includes("SwiftShader")
  )
    throw Error("Wrong reference backend");
  await page.goto("https://www.ascii-magic.com/app", {
    waitUntil: "domcontentloaded",
  });
  await page.addLocatorHandler(
    page.getByRole("dialog", { name: "Welcome to ASCII Magic V2" }),
    async (d) => {
      await d
        .getByRole("button", { name: "Close", exact: true })
        .click({ force: true });
    },
  );
  await page.waitForTimeout(2000); // Wait for the public upload handler to hydrate.
  const choosing = page.waitForEvent("filechooser").then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  const chosen = await choosing;
  if (chosen.error) throw chosen.error;
  await chosen.value.setFiles(fixture);
  await expect
    .poll(
      () =>
        page
          .locator("canvas")
          .evaluateAll((es) =>
            es.some(
              (c) =>
                c.width === 128 &&
                c.height === 64 &&
                !String(c.className).includes("ss-tile"),
            ),
          ),
      { timeout: 30000 },
    )
    .toBe(true);
  await page.locator("select.spatial-style-select").selectOption("characters");
  await page.getByRole("button", { name: "Characters", exact: true }).click();
  console.log("source committed, Characters selected");
  async function range(id, value) {
    const control = page.locator("#" + id);
    const { min, max, step } = await control.evaluate((e) => ({
      min: Number(e.min),
      max: Number(e.max),
      step: Number(e.step) || 1,
    }));
    const fromMin = value - min <= max - value;
    await control.press(fromMin ? "Home" : "End");
    await expect(control).toHaveValue(String(fromMin ? min : max));
    const count = Math.round((fromMin ? value - min : max - value) / step);
    for (let i = 0; i < count; i++) {
      await control.press(fromMin ? "ArrowRight" : "ArrowLeft");
      await expect(control).toHaveValue(
        String((fromMin ? min : max) + (fromMin ? 1 : -1) * (i + 1) * step),
      );
    }
    await expect(control).toHaveValue(String(value));
    console.log(id, value);
  }
  await range("brightness", 0);
  await range("contrast", 20);
  await range("bgBlur", 8);
  await range("bgOpacity", 100);
  await range("charOpacity", 100);
  await range("coverage", 100);
  await page.locator("#blendMode").selectOption("source-over");
  await page.locator("#charPreset").selectOption("standard");
  // Prove the retained source via the actual original-image export, not just dimensions.
  await range("charOpacity", 0);
  await page.locator("#bgMode").selectOption("original");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "1×", exact: true }).click();
  const sourceDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const sourceBytes = await readFile(await (await sourceDownload).path());
  const decodedSource = await sharp(sourceBytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (decodedSource.info.width !== 128 || decodedSource.info.height !== 64)
    throw Error("Retained reference source geometry mismatch");
  for (let i = 0; i < pixels.length; i += 4)
    for (let k = 0; k < 4; k++) {
      const expected = k === 3 ? 255 : pixels[i + 3] === 0 ? 0 : pixels[i + k];
      if (decodedSource.data[i + k] !== expected)
        throw Error("Retained reference source bytes mismatch at " + (i + k));
    }
  await writeFile(
    join(directory, "verified-source-reference.png"),
    sourceBytes,
  );
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await range("charOpacity", 100);
  console.log("exact retained reference source verified");
  const cases = [];
  for (const fontSize of [3, 11, 17, 47]) {
    await range("fontSize", fontSize);
    for (const backdrop of ["none", "blur"]) {
      await page.locator("#bgMode").selectOption(backdrop);
      for (const scale of scales) {
        const settings = await page
          .locator(
            "#bgMode,#bgBlur,#bgOpacity,#fontSize,#customChars,#blendMode,#charOpacity,#coverage,#brightness,#contrast",
          )
          .evaluateAll((es) =>
            Object.fromEntries(es.map((e) => [e.id, e.value])),
          );
        if (
          settings.contrast !== "20" ||
          settings.brightness !== "0" ||
          settings.fontSize !== String(fontSize) ||
          settings.bgMode !== backdrop ||
          (backdrop === "blur" && settings.bgBlur !== "8") ||
          settings.customChars !== "@#S08Xx+=-;:. " ||
          settings.charOpacity !== "100" ||
          settings.coverage !== "100" ||
          settings.blendMode !== "source-over" ||
          (backdrop === "blur" && settings.bgOpacity !== "100")
        )
          throw Error("Reference settings drift " + JSON.stringify(settings));
        await page.getByRole("button", { name: "Export", exact: true }).click();
        await page
          .getByRole("button", { name: scale + "×", exact: true })
          .click();
        if (
          await page.getByRole("dialog", { name: "Upgrade to Pro" }).isVisible()
        )
          throw Error(
            `${scale}× reference export requires Pro; no output at this scale was accepted`,
          );
        const pending = page.waitForEvent("download").then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
        await page
          .getByRole("button", { name: "Export PNG", exact: true })
          .click();
        let download;
        try {
          const result = await pending;
          if (result.error) throw result.error;
          download = result.value;
        } catch (error) {
          await page.screenshot({
            path: join(directory, "capture-failure.png"),
            fullPage: true,
          });
          await writeFile(
            join(directory, "capture-failure.txt"),
            await page.locator("body").innerText(),
          );
          throw error;
        }
        const bytes = await readFile(await download.path());
        const metadata = await sharp(bytes).metadata();
        if (
          metadata.format !== "png" ||
          metadata.width !== 128 * scale ||
          metadata.height !== 64 * scale
        )
          throw Error(
            "Unexpected reference export geometry " + JSON.stringify(metadata),
          );
        const file = `characters-${fontSize}-${backdrop}-${scale}-reference-export.png`;
        await writeFile(join(directory, file), bytes);
        cases.push({
          file,
          fontSize,
          backdrop,
          scale,
          settings,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
        console.log(file);
        await page.getByRole("button", { name: "Export", exact: true }).click();
        await expect(
          page.getByRole("button", { name: "Export PNG", exact: true }),
        ).toBeHidden();
      }
    }
  }
  await writeFile(
    join(directory, "reference-manifest.json"),
    JSON.stringify(
      {
        url: page.url(),
        browser: browser.version(),
        args,
        backend,
        sourceSha256: createHash("sha256").update(source).digest("hex"),
        cases,
      },
      null,
      2,
    ) + "\n",
  );
} catch (error) {
  if (page) {
    await page.screenshot({
      path: join(directory, "capture-failure.png"),
      fullPage: true,
    });
    await writeFile(
      join(directory, "capture-failure.txt"),
      await page.locator("body").innerText(),
    );
  }
  throw error;
} finally {
  await browser.close();
}
