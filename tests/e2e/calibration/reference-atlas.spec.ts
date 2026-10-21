import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import type { ViteDevServer } from "vite";
let server: ViteDevServer;
let base: string;
test.beforeAll(async () => {
  const { createServer } = await import("vite");
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    resolve: { alias: { "@": resolve(process.cwd(), "src") } },
    server: { host: "127.0.0.1", port: 0 },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  server.middlewares.use((req, res, next) => {
    if (req.url !== "/") return next();
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html><title>Calibration fixture</title>");
  });
  await server.listen();
  base = server.resolvedUrls!.local[0];
});
test.afterAll(async () => {
  await server?.close();
});
test("production reference atlas agrees with independent full-frame top/start text within fractional resampling tolerance", async ({
  page,
  browser,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  const result = await page.evaluate(async () => {
    // A variable import URL lets Vite serve the actual production module without a test shim.
    const url = "/src/render/glyph-calibration.ts";
    const { createGlyphCalibrator } = (await import(
      /* @vite-ignore */ url
    )) as typeof import("../../../src/render/glyph-calibration");
    const face = new FontFace(
      "Atlas Fixture",
      'url("/node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-italic.woff2")',
    );
    await face.load();
    document.fonts.add(face);
    const c = createGlyphCalibrator();
    const input = {
      fontFamily: '"Atlas Fixture"',
      fontSize: 31.5,
      cellWidth: 10,
      cellHeight: 31.5,
      ramp: "fÁQ ",
      fontRevision: "ibm-plex-mono-latin-400-italic",
      fontPolicy: "verified-family" as const,
    };
    const a = await c.calibrateReferenceCharacters(input);
    const direct = document.createElement("canvas"),
      composed = document.createElement("canvas");
    direct.width = composed.width = 220;
    direct.height = composed.height = 100;
    const d = direct.getContext("2d")!,
      p = composed.getContext("2d")!;
    d.font = `${input.fontSize}px ${input.fontFamily}`;
    d.textBaseline = "top";
    d.textAlign = "start";
    d.direction = "ltr";
    d.fillStyle = "#fff";
    const metrics = [...input.ramp].map((g) => d.measureText(g));
    for (let i = 0; i < a.calibration.glyphs.length; i++) {
      const x = 30.25 + i * 40,
        y = 24.5;
      d.fillText(a.calibration.glyphs[i], x, y);
      const mask = document.createElement("canvas");
      mask.width = a.calibration.maskWidth;
      mask.height = a.calibration.maskHeight;
      const m = mask.getContext("2d")!,
        data = m.createImageData(mask.width, mask.height);
      for (let j = 0; j < mask.width * mask.height; j++) {
        data.data.set(
          [
            255,
            255,
            255,
            a.calibration.masks[i * mask.width * mask.height + j],
          ],
          j * 4,
        );
      }
      m.putImageData(data, 0, 0);
      p.drawImage(mask, x + a.originX, y + a.originY);
    }
    const da = d.getImageData(0, 0, 220, 100).data,
      pa = p.getImageData(0, 0, 220, 100).data;
    let mass = 0,
      pmass = 0,
      error = 0,
      dx = 0,
      dy = 0,
      px = 0,
      py = 0;
    for (let i = 0; i < 220 * 100; i++) {
      const v = da[i * 4 + 3],
        w = pa[i * 4 + 3];
      mass += v;
      pmass += w;
      error += Math.abs(v - w);
      dx += (i % 220) * v;
      dy += Math.floor(i / 220) * v;
      px += (i % 220) * w;
      py += Math.floor(i / 220) * w;
    }
    const stack = '"Courier New", Courier, monospace';
    const fallback = await c.calibrateReferenceCharacters({
      ...input,
      fontFamily: stack,
      fontPolicy: "reference-system-monospace",
    });
    const generic = await c.calibrateReferenceCharacters({
      ...input,
      fontFamily: "monospace",
    });
    let missing = false,
      list = false;
    try {
      await c.calibrateReferenceCharacters({
        ...input,
        fontFamily: "Unregistered Fixture Missing",
      });
    } catch {
      missing = true;
    }
    try {
      await c.calibrateReferenceCharacters({ ...input, fontFamily: stack });
    } catch {
      list = true;
    }
    c.clearGlyphCalibrationCache();
    return {
      origin: [a.originX, a.originY],
      extent: [a.calibration.maskWidth, a.calibration.maskHeight],
      glyphs: a.calibration.glyphs,
      measuredLeft: Math.min(
        0,
        ...metrics.map((m) => -m.actualBoundingBoxLeft),
      ),
      measuredTop: Math.min(
        0,
        ...metrics.map((m) => -m.actualBoundingBoxAscent),
      ),
      overhang: metrics.some(
        (m) =>
          m.actualBoundingBoxLeft > 0 ||
          m.actualBoundingBoxRight > input.cellWidth,
      ),
      fractional: !Number.isInteger(a.originX) || !Number.isInteger(a.originY),
      normalizedAlphaError: error / mass,
      massError: Math.abs(pmass - mass) / mass,
      centroidError: Math.hypot(dx / mass - px / pmass, dy / mass - py / pmass),
      fallbackKey: fallback.calibration.fontKey,
      genericPolicy: generic.fontPolicy,
      missing,
      list,
      remaining: c.usage.totalBytes,
    };
  });
  await testInfo.attach("measured-atlas.json", {
    body: JSON.stringify(
      { browser: browser.version(), platform: process.platform, ...result },
      null,
      2,
    ),
    contentType: "application/json",
  });
  console.log(
    JSON.stringify({
      browser: browser.version(),
      platform: process.platform,
      ...result,
    }),
  );
  expect(errors).toEqual([]);
  expect(result.glyphs).toEqual(["f", "Á", "Q", " "]);
  expect(result.origin).toEqual([result.measuredLeft, result.measuredTop]);
  expect(result.overhang).toBe(true);
  expect(result.fractional).toBe(true);
  // Fractional atlas origins and cell anchors exercise resampling; hinting need not be pixel exact.
  expect(result.normalizedAlphaError).toBeLessThan(0.35);
  expect(result.massError).toBeLessThan(0.08);
  expect(result.centroidError).toBeLessThan(0.8);
  expect(result.fallbackKey).toContain("intentional-system-fallback");
  expect(result.fallbackKey).toContain("Courier New");
  expect(result.genericPolicy).toBe("verified-family");
  expect(result.missing && result.list).toBe(true);
  expect(result.remaining).toBe(0);
});
