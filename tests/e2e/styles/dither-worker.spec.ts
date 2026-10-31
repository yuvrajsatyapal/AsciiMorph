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
test("all15 actual-worker algorithms, immutable capture, thumbnails and PNG readback", async ({
  page,
}, info) => {
  await page.goto(base);
  const report = await page.evaluate(async () => {
    const serviceUrl = "/src/render/service.ts",
      ditherUrl = "/src/render/dither-contract.ts",
      adapterUrl = "/src/components/effects-studio/style-adapter.ts",
      controllerUrl = "/src/components/effects-studio/controller.ts";
    const { createRenderService } = await import(/* @vite-ignore */ serviceUrl);
    const { DITHER_ALGORITHMS } = await import(/* @vite-ignore */ ditherUrl);
    const { bindStyleProject, switchStyle } = await import(
      /* @vite-ignore */ adapterUrl
    );
    const { createStudioController } = await import(
      /* @vite-ignore */ controllerUrl
    );
    const service = createRenderService();
    const source = {
      id: "dither-owned-synthetic",
      revision: 1,
      width: 31,
      height: 19,
    };
    const rgba = new Uint8ClampedArray(31 * 19 * 4);
    for (let i = 0; i < rgba.length; i += 4)
      rgba.set([(i * 7) % 256, (i * 3) % 256, (i * 11) % 256, 255], i);
    const c = createStudioController(),
      base = c.getSnapshot().project;
    const project = {
      ...base,
      source,
      style: switchStyle(base.style, "dither"),
    };
    project.style.parameters.bgMode = "original";
    let seq = 0;
    const results = [];
    const same = (a: ArrayLike<number>, b: ArrayLike<number>) =>
      a.length === b.length && Array.from(a).every((v, i) => v === b[i]);
    function request(settings: unknown) {
      return {
        jobId: `d${++seq}`,
        revision: seq,
        sourceId: source.id,
        sourceRevision: 1,
        calibrationId: "",
        source,
        styleId: "dither",
        settings,
        timeUs: 0,
      };
    }
    try {
      await service.setSource({ ...source, rgba });
      for (const algorithm of DITHER_ALGORITHMS) {
        project.style.parameters.ditherAlgorithm = algorithm;
        const settings = bindStyleProject(project, 1),
          r = request(settings);
        const preview = await service.renderStylePreview(r);
        const capture = service.renderStyleExport({
          ...r,
          jobId: `capture${++seq}`,
          outputWidth: 31,
          outputHeight: 19,
        });
        settings.parameters.dither!.algorithm =
          algorithm === "floyd" ? "bayer2" : "floyd";
        settings.parameters.dither!.customPalette[0] = "#123456";
        const captured = await capture;
        const {
          styleId: _id,
          settings: _settings,
          ...thumbRequest
        } = request(bindStyleProject(project, 1));
        void _id;
        void _settings;
        const thumbnail = await service.renderThumbnail({
          ...thumbRequest,
          profile: { kind: "style", settings: bindStyleProject(project, 1) },
          maxSide: 192,
        });
        const canvas = new OffscreenCanvas(31, 19),
          ctx = canvas.getContext("2d")!;
        ctx.putImageData(
          new ImageData(new Uint8ClampedArray(captured.frame.rgba), 31, 19),
          0,
          0,
        );
        const bitmap = await createImageBitmap(
          await canvas.convertToBlob({ type: "image/png" }),
        );
        ctx.clearRect(0, 0, 31, 19);
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        results.push({
          algorithm,
          styleId: preview.styleId,
          revision: preview.revision,
          exportEqual: same(preview.frame.rgba, captured.frame.rgba),
          thumbnailEqual: same(preview.frame.rgba, thumbnail.frame.rgba),
          pngEqual: same(
            preview.frame.rgba,
            ctx.getImageData(0, 0, 31, 19).data,
          ),
          hash:
            Array.from(preview.frame.rgba as Uint8Array).reduce(
              (h, v) => Math.imul(h ^ v, 16777619),
              2166136261,
            ) >>> 0,
        });
      }
      return { supported: service.supportedStyleIds, results };
    } finally {
      service.dispose();
    }
  });
  expect(report.supported).toContain("dither");
  expect(report.results).toHaveLength(15);
  for (const r of report.results) {
    expect(r.styleId).toBe("dither");
    expect(r.exportEqual, r.algorithm + " captured export").toBe(true);
    expect(r.thumbnailEqual, r.algorithm + " thumbnail").toBe(true);
    expect(r.pngEqual, r.algorithm + " PNG").toBe(true);
  }
  expect(
    new Set(report.results.map((r) => r.hash)).size,
  ).toBeGreaterThanOrEqual(13);
  await info.attach("dither-worker-verification", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
});
