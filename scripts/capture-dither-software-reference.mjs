// Real public UI capture. No reference scripts are imported or executed separately.
import { chromium, expect } from "@playwright/test";
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
const directory = resolve(
  process.argv[2] ?? "docs/research/ascii-magic/2026-10-31/dither-verified",
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
  await page.locator("select.spatial-style-select").selectOption("characters");
  await page.getByRole("button", { name: "Characters", exact: true }).click();
  console.log("source committed, Characters selected");
  async function range(id, value) {
    const control = page.locator("#" + id);
    if ((await control.inputValue()) === String(value)) return;
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
  console.log(
    "retained visible source verified against opaque Original export",
  );
  const sourceProof = {
    file: "verified-source-reference.png",
    sha256: createHash("sha256").update(sourceBytes).digest("hex"),
    width: 128,
    height: 64,
  };
  const baselineControls = await page
    .locator("input[id],select[id]")
    .evaluateAll((es) =>
      Object.fromEntries(
        es.map((e) => [e.id, e.type === "checkbox" ? e.checked : e.value]),
      ),
    );

  await page.locator("select.spatial-style-select").selectOption("dither");
  await page.locator("#bgMode").selectOption("original");
  const algorithms = [
    "bayer2",
    "bayer4",
    "bayer8",
    "bayer16",
    "halftone",
    "radial",
    "linesH",
    "linesV",
    "linesD",
    "whiteNoise",
    "blueNoise",
    "floyd",
    "atkinson",
    "stucki",
    "sierraLite",
  ];
  const identities = algorithms.map((algorithm) => ({
    algorithm,
    strength: 100,
    pixelSize: 2,
  }));
  for (const algorithm of [
    "bayer2",
    "floyd",
    "atkinson",
    "stucki",
    "sierraLite",
  ])
    for (const strength of [0, 50])
      identities.push({ algorithm, strength, pixelSize: 2 });
  for (const pixelSize of [1, 3, 12])
    identities.push({ algorithm: "floyd", strength: 0, pixelSize });
  const cases = [];
  let sourceAlphaVerified = false;
  for (const identity of identities) {
    await page.locator("#ditherAlgo").selectOption(identity.algorithm);
    await range("ditherStrength", identity.strength);
    await range("ditherScale", identity.pixelSize);
    for (const scale of scales) {
      const settings = await page
        .locator("input[id],select[id]")
        .evaluateAll((es) =>
          Object.fromEntries(
            es.map((e) => [e.id, e.type === "checkbox" ? e.checked : e.value]),
          ),
        );
      if (
        settings.ditherAlgo !== identity.algorithm ||
        settings.ditherStrength !== String(identity.strength) ||
        settings.ditherScale !== String(identity.pixelSize) ||
        settings.ditherContrast !== "110" ||
        settings.ditherThreshold !== "50" ||
        settings.ditherPalette !== "mono" ||
        settings.ditherChromaMode !== "standard" ||
        settings.bgMode !== "original"
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
      const decoded = await sharp(bytes).ensureAlpha().raw().toBuffer();
      const colors = new Set();
      for (let i = 0; i < decoded.length; i += 4)
        if (decoded[i + 3] === 255)
          colors.add(decoded.subarray(i, i + 3).join(","));
      if (!colors.has("0,0,0") || !colors.has("255,255,255"))
        throw Error("Rejected constant or non-mono Dither export");
      if (
        identity.algorithm === "floyd" &&
        identity.strength === 0 &&
        identity.pixelSize === 1 &&
        scale === 1
      ) {
        for (let i = 3; i < decoded.length; i += 4)
          if (decoded[i] !== pixels[i])
            throw Error("Retained source alpha mismatch at " + i);
        sourceAlphaVerified = true;
      }
      if (
        meta.format !== "png" ||
        meta.width !== 128 * scale ||
        meta.height !== 64 * scale
      )
        throw Error("Wrong reference dimensions");
      const file = `dither-${identity.algorithm}-${identity.strength}-${identity.pixelSize}-${scale}-reference.png`;
      await writeFile(join(directory, file), bytes);
      cases.push({
        ...identity,
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
            sourceProof,
            baselineControls,
            sourceAlphaVerified,
            complete:
              cases.length === identities.length * scales.length &&
              sourceAlphaVerified,
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
