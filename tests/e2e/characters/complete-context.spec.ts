import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import type { ViteDevServer } from "vite";
import fixture from "../../fixtures/render/characters/context-v1-native.json";
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
    res.end(
      "<!doctype html><title>Complete Characters numeric fixture</title>",
    );
  });
  await server.listen();
  base = server.resolvedUrls!.local[0];
});
test.afterAll(async () => {
  await server?.close();
});
test("production module worker None Solid Blur equal native frames and same-scale preview/export", async ({
  page,
  browser,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  const result = await page.evaluate(async (data) => {
    const url = "/src/render/service.ts";
    const { createRenderService } = (await import(
      /* @vite-ignore */ url
    )) as typeof import("../../../src/render/service");
    const service = createRenderService();
    try {
      await service.setSource({
        id: "native-fixture",
        revision: 1,
        width: data.source.width,
        height: data.source.height,
        rgba: new Uint8ClampedArray(data.source.rgba),
      });
      const cases = [];
      for (let index = 0; index < data.cases.length; index++) {
        const c = data.cases[index];
        const id = `native-${c.scale}-${c.fontSize}`;
        await service.setAtlas({
          version: 1,
          originX: -0.5,
          originY: 0.5,
          spaceIndexOr65535: 65535,
          placement: "top-start-ltr",
          ordering: "input",
          fontPolicy: "reference-system-monospace",
          calibration: {
            version: 1,
            id,
            fontKey: "native-fixture",
            glyphs: ["#", "."],
            cellWidth: 0.6 * c.fontSize * c.scale,
            cellHeight: c.fontSize * c.scale,
            maskWidth: 2,
            maskHeight: 2,
            masks: new Uint8Array(data.masks),
            coverage: new Float32Array([0.5, 0]),
            shapes: new Float32Array(18),
          },
        });
        const request = {
          jobId: `preview-${index}`,
          revision: index,
          sourceId: "native-fixture",
          sourceRevision: 1,
          calibrationId: id,
          source: { id: "native-fixture", revision: 1, width: 5, height: 3 },
          settings: {
            version: 1 as const,
            frameWidth: c.width,
            frameHeight: c.height,
            fontSize: c.fontSize,
            renderScale: c.scale as 1 | 4,
            brightness: 0,
            contrast: 20,
            rotation: c.rotation as 0 | 90,
            crop: c.crop,
            backdrop: c.backdrop as "none" | "solid" | "blur",
          },
          timeUs: 0,
        };
        const preview = await service.renderCharactersPreview(request);
        const exported = await service.renderCharactersExport({
          ...request,
          jobId: `export-${index}`,
          outputWidth: c.width,
          outputHeight: c.height,
        });
        const frame = preview.frame;
        const same = (a: ArrayLike<number>, b: ArrayLike<number>) =>
          a.length === b.length && Array.from(a).every((v, i) => v === b[i]);
        cases.push({
          index,
          backdrop: c.backdrop,
          scale: c.scale,
          nullGrid: frame.grid === null,
          nativeBytes: same(frame.rgba, c.rgba),
          previewExportBytes: same(frame.rgba, exported.frame.rgba),
          nativeGrid:
            c.grid === null
              ? frame.grid === null
              : frame.grid !== null &&
                same(frame.grid.glyphIndices, c.grid.indices) &&
                same(frame.grid.foreground, c.grid.foreground) &&
                same(frame.grid.alpha, new Float32Array(c.grid.alpha)),
        });
      }
      return {
        profileVersion: service.charactersProfileVersion,
        contextVersion: service.charactersContextVersion,
        cases,
      };
    } finally {
      await service.dispose();
    }
  }, fixture);
  const evidence = {
    browser: browser.version(),
    platform: process.platform,
    ...result,
  };
  await testInfo.attach("complete-context.json", {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
  console.log(JSON.stringify(evidence));
  expect(errors).toEqual([]);
  expect(result.profileVersion).toBe(1);
  expect(result.contextVersion).toBe(1);
  expect(result.cases).toHaveLength(12);
  for (const c of result.cases) {
    expect(c.nativeBytes).toBe(true);
    expect(c.previewExportBytes).toBe(true);
    expect(c.nativeGrid).toBe(true);
  }
});

test("default-sized Blur completes through the actual calibrator and worker then releases ownership", async ({
  page,
  browser,
}, testInfo) => {
  let opened = 0,
    closed = 0;
  page.on("worker", (worker) => {
    opened++;
    worker.on("close", () => {
      closed++;
    });
  });
  await page.goto(base);
  const result = await page.evaluate(async () => {
    const serviceUrl = "/src/render/service.ts",
      calibratorUrl = "/src/render/glyph-calibration.ts";
    const { createRenderService } = (await import(
      /* @vite-ignore */ serviceUrl
    )) as typeof import("../../../src/render/service");
    const { createGlyphCalibrator } = (await import(
      /* @vite-ignore */ calibratorUrl
    )) as typeof import("../../../src/render/glyph-calibration");
    const service = createRenderService(),
      calibrator = createGlyphCalibrator();
    const width = 1000,
      height = 1000,
      rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        rgba.set(
          [
            Math.round((x * 255) / 999),
            Math.round((y * 255) / 999),
            Math.round(((x + y) * 255) / 1998),
            255,
          ],
          (y * width + x) * 4,
        );
    const start = performance.now();
    let output;
    try {
      const atlas = await calibrator.calibrateReferenceCharacters({
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 11,
        cellWidth: 0.6 * 11,
        cellHeight: 11,
        ramp: "@#S08Xx+=-;:. ",
        fontRevision: "task4-smoke-system",
        fontPolicy: "reference-system-monospace",
      });
      await service.setSource({
        id: "owned-gradient-1000",
        revision: 1,
        width,
        height,
        rgba,
      });
      await service.setAtlas(atlas);
      const beforeRender = performance.now();
      const result = await service.renderCharactersPreview({
        jobId: "default-blur",
        revision: 1,
        sourceId: "owned-gradient-1000",
        sourceRevision: 1,
        calibrationId: atlas.calibration.id,
        source: { id: "owned-gradient-1000", revision: 1, width, height },
        timeUs: 0,
        settings: {
          version: 1,
          frameWidth: width,
          frameHeight: height,
          fontSize: 11,
          renderScale: 1,
          brightness: 0,
          contrast: 20,
          crop: { x: 0, y: 0, width: 1, height: 1 },
          rotation: 0,
          backdrop: "blur",
        },
      });
      const renderWallMs = performance.now() - beforeRender,
        frame = result.frame;
      let alphaErrors = 0;
      for (let i = 3; i < frame.rgba.length; i += 4)
        if (frame.rgba[i] !== 255) alphaErrors++;
      output = {
        width: frame.width,
        height: frame.height,
        bytes: frame.rgba.length,
        columns: frame.grid?.width,
        rows: frame.grid?.height,
        alphaErrors,
        corners: [0, 999, 999000, 999999].map((i) =>
          Array.from(frame.rgba.slice(i * 4, i * 4 + 4)),
        ),
        extent: [atlas.calibration.maskWidth, atlas.calibration.maskHeight],
        profileVersion: service.charactersProfileVersion,
        contextVersion: service.charactersContextVersion,
        timings: result.timings,
        renderWallMs,
        calibrationUploadRenderMs: performance.now() - start,
      };
    } finally {
      await service.dispose();
      calibrator.clearGlyphCalibrationCache();
    }
    return {
      ...output,
      state: service.state,
      calibrationOwnedBytes: calibrator.usage.totalBytes,
    };
  });
  const evidence = {
    browser: browser.version(),
    platform: process.platform,
    samples: 1,
    ...result,
  };
  await testInfo.attach("default-sized-blur-smoke.json", {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
  console.log(JSON.stringify(evidence));
  expect(result.width).toBe(1000);
  expect(result.height).toBe(1000);
  expect(result.bytes).toBe(4000000);
  expect(result.columns).toBe(151);
  expect(result.rows).toBe(90);
  expect(result.alphaErrors).toBe(0);
  expect(result.contextVersion).toBe(1);
  expect(result.state).toBe("disposed");
  expect(result.calibrationOwnedBytes).toBe(0);
  expect(opened).toBe(1);
  await expect.poll(() => closed).toBe(1);
});
