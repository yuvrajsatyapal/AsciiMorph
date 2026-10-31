// Real public UI capture. No reference scripts are imported or executed separately.
import { chromium, expect } from "@playwright/test";
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
const directory = resolve(
  process.argv[2] ?? "docs/research/ascii-magic/2026-10-31/dither-backdrops",
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
  const randomSeed =
    process.env.DITHER_RANDOM_SEED === undefined
      ? null
      : Number(process.env.DITHER_RANDOM_SEED);
  if (randomSeed !== null) {
    if (
      !Number.isInteger(randomSeed) ||
      randomSeed <= 0 ||
      randomSeed > 0xffffffff
    )
      throw Error("DITHER_RANDOM_SEED must be a nonzero uint32");
    // Give each Math.random caller its own reproducible stream. Unrelated UI
    // draws cannot shift the noise tile's stream. No app code/state is accessed.
    await page.addInitScript((seed) => {
      const streams = new Map();
      Math.random = function controlledRandom() {
        const caller = new Error().stack.split("\n")[2].trim();
        const stream = streams.get(caller) ?? { state: seed, count: 0 };
        let value = stream.state;
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        stream.state = value >>> 0;
        stream.count++;
        streams.set(caller, stream);
        return stream.state / 4294967296;
      };
      window.__ditherRandomStreams = () =>
        Array.from(streams, ([caller, value]) => ({ caller, ...value }));
    }, randomSeed);
  }
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
  console.log("public page loaded");
  page.setDefaultTimeout(30000);
  const welcome = page.getByRole("dialog", {
    name: "Welcome to ASCII Magic V2",
  });
  await welcome.waitFor({ state: "visible", timeout: 30000 });
  await welcome
    .getByRole("button", { name: "Close", exact: true })
    .click({ force: true, noWaitAfter: true, timeout: 60000 });
  await welcome.waitFor({ state: "hidden" });
  await page.waitForTimeout(2000);
  console.log("welcome closed and upload ready");
  const choosing = page.waitForEvent("filechooser").then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await page
    .getByRole("button", { name: "Upload", exact: true })
    .click({ force: true });
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
  await page.locator("select.spatial-style-select").selectOption("dither");
  const cases = [];
  async function range(id, value) {
    const control = page.locator("#" + id);
    if ((await control.inputValue()) === String(value)) return;
    const { min, step } = await control.evaluate((e) => ({
      min: Number(e.min),
      step: Number(e.step) || 1,
    }));
    await control.press("Home");
    await expect(control).toHaveValue(String(min));
    for (let i = 0; i < Math.round((value - min) / step); i++) {
      await control.press("ArrowRight");
      await expect(control).toHaveValue(String(min + (i + 1) * step));
    }
    await expect(control).toHaveValue(String(value));
  }
  for (const context of [
    {
      name: "untouched",
      backdrop: "blur",
      backgroundOpacity: 100,
      softness: 0,
    },
    {
      name: "original",
      backdrop: "original",
      backgroundOpacity: 100,
      softness: 8,
    },
    { name: "none", backdrop: "none", backgroundOpacity: 100, softness: 8 },
    { name: "solid", backdrop: "solid", backgroundOpacity: 100, softness: 8 },
    { name: "blur8", backdrop: "blur", backgroundOpacity: 100, softness: 8 },
    {
      name: "original50",
      backdrop: "original",
      backgroundOpacity: 50,
      softness: 8,
    },
    { name: "blur50", backdrop: "blur", backgroundOpacity: 50, softness: 8 },
  ]) {
    if (context.name !== "untouched") {
      await page.locator("#bgMode").selectOption(context.backdrop);
      if (await page.locator("#bgOpacity").count())
        await range("bgOpacity", context.backgroundOpacity);
      if (context.backdrop === "blur") await range("bgBlur", context.softness);
    }
    for (const scale of scales) {
      const settings = await page
        .locator("input[id],select[id]")
        .evaluateAll((es) =>
          Object.fromEntries(
            es.map((e) => [e.id, e.type === "checkbox" ? e.checked : e.value]),
          ),
        );
      if (
        settings.ditherAlgo !== "floyd" ||
        settings.ditherContrast !== "110" ||
        settings.ditherStrength !== "100" ||
        settings.ditherScale !== "2" ||
        settings.bgMode !== context.backdrop ||
        (settings.bgOpacity !== undefined &&
          settings.bgOpacity !== String(context.backgroundOpacity)) ||
        (context.backdrop === "blur" &&
          settings.bgBlur !== String(context.softness))
      )
        throw Error("Settings drift " + JSON.stringify(settings));
      await page.getByRole("button", { name: "Export", exact: true }).click();
      await page
        .getByRole("button", { name: scale + "×", exact: true })
        .click();
      const pending = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Export PNG", exact: true })
        .click();
      const bytes = await readFile(await (await pending).path());
      const meta = await sharp(bytes).metadata();
      if (meta.width !== 128 * scale || meta.height !== 64 * scale)
        throw Error("Wrong dimensions");
      const file = `dither-backdrop-${context.name}-${scale}-reference.png`;
      await writeFile(join(directory, file), bytes);
      cases.push({
        ...context,
        scale,
        file,
        settings,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
      await writeFile(
        join(directory, "reference-manifest.json"),
        JSON.stringify(
          {
            url: page.url(),
            browser: browser.version(),
            args,
            backend,
            sourceSha256: createHash("sha256").update(source).digest("hex"),
            complete: cases.length === 7 * scales.length,
            cases,
          },
          null,
          2,
        ) + "\n",
      );
      console.log(file);
      await page.getByRole("button", { name: "Export", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Export PNG", exact: true }),
      ).toBeHidden();
    }
  }
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
