import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
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
test("actual Worker captures all style controls, thumbnails and PNG pixels", async ({
  page,
}, info) => {
  await page.goto(base);
  const result = await page.evaluate(async () => {
    const serviceUrl = "/src/render/service.ts",
      contextUrl = "/src/render/style-context.ts";
    const { createRenderService } = await import(/* @vite-ignore */ serviceUrl);
    const { STYLE_CONTEXT_DEFAULTS: d } = await import(
      /* @vite-ignore */ contextUrl
    );
    const service = createRenderService(),
      source = { id: "context", revision: 1, width: 17, height: 13 };
    const rgba = new Uint8ClampedArray(17 * 13 * 4);
    for (let i = 0; i < rgba.length; i += 4)
      rgba.set([(i * 7) % 256, (i * 3) % 256, (i * 11) % 256, 255], i);
    const same = (a: ArrayLike<number>, b: ArrayLike<number>) =>
      a.length === b.length && Array.from(a).every((v, i) => v === b[i]);
    let seq = 0;
    const cases = [];
    try {
      await service.setSource({ ...source, rgba });
      for (const styleId of ["pixel", "mosaic", "characters"] as const) {
        const atlas = {
          version: 1,
          originX: 0,
          originY: 0,
          spaceIndexOr65535: 65535,
          placement: "top-start-ltr",
          ordering: "input",
          fontPolicy: "reference-system-monospace",
          calibration: {
            version: 1,
            id: "atlas",
            fontKey: "native",
            glyphs: ["#", "."],
            cellWidth: 0.6 * 3,
            cellHeight: 3,
            maskWidth: 2,
            maskHeight: 3,
            masks: new Uint8Array([
              255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 255, 0,
            ]),
            coverage: new Float32Array([1, 1 / 6]),
            shapes: new Float32Array(18),
          },
        };
        if (styleId === "characters") await service.setAtlas(atlas);
        let baseline: Uint8Array | undefined;
        for (const [name, patch] of Object.entries({
          default: {},
          none: { backdrop: "none" },
          solid: { backdrop: "solid" },
          original: { backdrop: "original" },
          zeroBlur: { softness: 0 },
          maxBlur: { softness: 60 },
          noBackground: { backgroundOpacity: 0 },
          halfBackground: { backgroundOpacity: 50 },
          noLayer: { opacity: 0 },
          halfLayer: { opacity: 50 },
          noCoverage: { coverage: 0 },
          halfCoverage: { coverage: 50, seed: 42 },
          overlay: { blend: "overlay" },
          dodge: { blend: "color-dodge" },
          screen: { blend: "screen" },
          lighter: { blend: "lighter" },
          ...(styleId === "characters"
            ? { inverted: { invert: true }, random: { random: true, seed: 42 } }
            : {}),
        })) {
          const context = { ...d, ...patch };
          const crop = { x: 0, y: 0, width: 1, height: 1 };
          const settings =
            styleId === "characters"
              ? {
                  version: 1,
                  frameWidth: 17,
                  frameHeight: 13,
                  fontSize: 3,
                  renderScale: 1,
                  brightness: 0,
                  contrast: 20,
                  rotation: 0,
                  crop,
                  backdrop: "blur",
                  styleContext: context,
                }
              : {
                  version: 1,
                  styleId,
                  frameWidth: 17,
                  frameHeight: 13,
                  renderScale: 1,
                  rotation: 0,
                  crop,
                  seed: 42,
                  timeUs: 0,
                  parameters: {
                    fontSize: 3,
                    brightness: 0,
                    contrast: 20,
                    invert: false,
                    charOpacity: 80,
                    ...(styleId === "mosaic" ? { mosaicShape: "square" } : {}),
                  },
                  styleContext: context,
                };
          const request = {
            jobId: `p${++seq}`,
            revision: seq,
            sourceId: source.id,
            sourceRevision: 1,
            calibrationId: styleId === "characters" ? "atlas" : "",
            source,
            settings,
            timeUs: 0,
            ...(styleId !== "characters" ? { styleId } : {}),
          };
          const preview =
            styleId === "characters"
              ? await service.renderCharactersPreview(request)
              : await service.renderStylePreview(request);
          const captured =
            styleId === "characters"
              ? await service.renderCharactersExport({
                  ...request,
                  jobId: `e${seq}`,
                  outputWidth: 17,
                  outputHeight: 13,
                })
              : await service.renderStyleExport({
                  ...request,
                  jobId: `e${seq}`,
                  outputWidth: 17,
                  outputHeight: 13,
                });
          const {
            styleId: unused,
            settings: unusedSettings,
            ...thumbnailRequest
          } = request;
          void unused;
          void unusedSettings;
          const thumbnail = await service.renderThumbnail({
            ...thumbnailRequest,
            jobId: `t${seq}`,
            profile: {
              kind: styleId === "characters" ? "characters" : "style",
              settings,
            },
            maxSide: 192,
          });
          if (!baseline) baseline = preview.frame.rgba;
          const canvas = new OffscreenCanvas(17, 13),
            ctx = canvas.getContext("2d")!;
          ctx.putImageData(
            new ImageData(new Uint8ClampedArray(captured.frame.rgba), 17, 13),
            0,
            0,
          );
          const blob = await canvas.convertToBlob({ type: "image/png" }),
            bitmap = await createImageBitmap(blob);
          ctx.clearRect(0, 0, 17, 13);
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          cases.push({
            styleId,
            name,
            equal: same(preview.frame.rgba, captured.frame.rgba),
            thumbnail: same(preview.frame.rgba, thumbnail.frame.rgba),
            changed: !same(preview.frame.rgba, baseline!),
            png: same(preview.frame.rgba, ctx.getImageData(0, 0, 17, 13).data),
          });
        }
      }
      // Source crop/quarter turn/export scale uses the identical context path.
      const settings = {
        version: 1,
        styleId: "mosaic",
        frameWidth: 18,
        frameHeight: 20,
        renderScale: 2,
        rotation: 90,
        crop: { x: 0.2, y: 0.2, width: 0.5, height: 0.6 },
        seed: 12,
        timeUs: 0,
        parameters: {
          fontSize: 3,
          brightness: 7,
          contrast: 20,
          invert: false,
          charOpacity: 80,
          mosaicShape: "wide",
        },
        styleContext: {
          ...d,
          softness: 60,
          blend: "screen",
          coverage: 50,
          seed: 12,
        },
      };
      const r = {
        jobId: "geo",
        revision: 999,
        styleId: "mosaic",
        sourceId: source.id,
        sourceRevision: 1,
        calibrationId: "",
        source,
        settings,
        timeUs: 0,
      };
      // Crop extents: x3..12=9, y2..11=9 ->18x18.
      settings.frameHeight = 18;
      const p = await service.renderStylePreview(r),
        e = await service.renderStyleExport({
          ...r,
          jobId: "geo-e",
          outputWidth: 18,
          outputHeight: 18,
        });
      const capturedContext = { ...d, backdrop: "none", coverage: 0 };
      const captureRequest = {
        ...r,
        jobId: "captured-before-edit",
        settings: { ...settings, styleContext: capturedContext },
        outputWidth: 18,
        outputHeight: 18,
      };
      const capturePromise = service.renderStyleExport(captureRequest);
      capturedContext.coverage = 100;
      capturedContext.backdrop = "solid";
      const captureFrame = await capturePromise;
      const captureSurvivesEdit = captureFrame.frame.rgba.every(
        (v: number) => v === 0,
      );
      return {
        capability: service.styleContextVersion,
        captureSurvivesEdit,
        cases,
        geometry: same(p.frame.rgba, e.frame.rgba),
      };
    } finally {
      await service.dispose();
    }
  });
  await info.attach("style-context-worker.json", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  expect(result.capability).toBe(1);
  expect(result.geometry).toBe(true);
  expect(result.captureSurvivesEdit).toBe(true);
  for (const c of result.cases) {
    expect(c.equal, `${c.styleId}/${c.name} export`).toBe(true);
    expect(c.thumbnail, `${c.styleId}/${c.name} thumbnail`).toBe(true);
    if (
      ![
        "none",
        "noBackground",
        "halfBackground",
        "noLayer",
        "halfLayer",
      ].includes(c.name)
    )
      expect(c.png, `${c.styleId}/${c.name} PNG`).toBe(true);
    if (c.name !== "default")
      expect(c.changed, `${c.styleId}/${c.name} changed`).toBe(true);
  }
});
test("phone Properties controls are reachable, keyboard editable and preserve preview/export pixels", async ({
  browser,
  baseURL,
}, info) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
  });
  try {
    const page = await context.newPage();
    await page.goto("/app");
    await page
      .getByLabel("Upload image file")
      .setInputFiles(resolve("tests/fixtures/gradient.png"));
    const preview = page.locator(
      'canvas[aria-label="Rendered Characters preview"]',
    );
    await expect
      .poll(() =>
        preview.evaluate((c: HTMLCanvasElement) => [c.width, c.height]),
      )
      .toEqual([128, 64]);
    await page.getByRole("button", { name: "Controls", exact: true }).tap();
    const sheet = page.getByRole("dialog", { name: "Controls sheet" });
    await expect(sheet).toBeVisible();
    await sheet.getByLabel("Backdrop", { exact: true }).selectOption("solid");
    const coverage = sheet.getByLabel("Coverage", { exact: true });
    await coverage.focus();
    await page.keyboard.press("Home");
    await expect(coverage).toHaveValue("0");
    await sheet.getByLabel("Blend", { exact: true }).selectOption("screen");
    await sheet.getByLabel("Ramp Preset").selectOption("01");
    await expect(
      sheet.getByLabel("Character Set", { exact: true }),
    ).toHaveValue("01");
    await sheet
      .getByLabel("Backdrop", { exact: true })
      .selectOption("original");
    // Preserve the keyboard endpoint assertion above, then export a nontrivial look.
    await coverage.fill("37");
    await coverage.blur();
    await expect(coverage).toHaveValue("37");
    await sheet
      .getByRole("button", { name: "Close controls", exact: true })
      .tap();
    await expect(page.locator(".studio-stage-status")).toHaveText("");
    const capturedPreview = await preview.evaluate((c: HTMLCanvasElement) => ({
      width: c.width,
      height: c.height,
      rgba: Array.from(
        c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data,
      ),
    }));
    const uniqueColors = new Set<string>();
    for (let i = 0; i < capturedPreview.rgba.length; i += 4)
      uniqueColors.add(capturedPreview.rgba.slice(i, i + 4).join(","));
    expect(uniqueColors.size).toBeGreaterThan(16);
    const original = await page
      .locator('canvas[aria-label="Original source comparison"]')
      .evaluate((c: HTMLCanvasElement) =>
        Array.from(
          c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data,
        ),
      );
    expect(capturedPreview.rgba).not.toEqual(original);

    await page.getByRole("button", { name: "Export", exact: true }).tap();
    await page.getByLabel("Format", { exact: true }).selectOption("png");
    await page.getByLabel("Scale", { exact: true }).selectOption("1");
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export PNG", exact: true }).tap();
    const download = await downloaded;
    expect(download.suggestedFilename()).toMatch(/\.png$/i);
    const bytes = await readFile((await download.path())!);
    expect(Array.from(bytes.subarray(0, 8))).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
    const decoded = await page.evaluate(async (raw) => {
      const bitmap = await createImageBitmap(
        new Blob([Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))], {
          type: "image/png",
        }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      return {
        width: canvas.width,
        height: canvas.height,
        rgba: Array.from(
          ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        ),
      };
    }, bytes.toString("base64"));
    expect(decoded).toEqual(capturedPreview);
    const hash = (rgba: readonly number[]) =>
      rgba.reduce((h, v) => Math.imul(h ^ v, 16777619), 2166136261) >>> 0;
    expect(hash(decoded.rgba)).toBe(hash(capturedPreview.rgba));
    await info.attach("phone-export-equality", {
      body: JSON.stringify(
        {
          width: decoded.width,
          height: decoded.height,
          coverage: 37,
          backdrop: "original",
          uniqueColors: uniqueColors.size,
          previewHash: hash(capturedPreview.rgba),
          pngHash: hash(decoded.rgba),
          exactRgbaEquality: true,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    await info.attach("phone-export.png", {
      body: bytes,
      contentType: "image/png",
    });
    await page.keyboard.press("Escape");
    const screenshot = info.outputPath("phone-controls.png");
    await page.screenshot({ path: screenshot });
    const visible = await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    expect(visible).toBe(true);
    await info.attach("phone-controls", {
      path: screenshot,
      contentType: "image/png",
    });
  } finally {
    await context.close();
  }
});
