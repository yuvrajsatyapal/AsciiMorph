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

test("exact project adapter drives four controls and normalized S1/S3/S4 geometry in the module worker", async ({
  page,
  browser,
}, testInfo) => {
  await page.goto(base);
  const evidence = await page.evaluate(async () => {
    const serviceUrl = "/src/render/service.ts",
      calibrationUrl = "/src/render/glyph-calibration.ts",
      adapterUrl = "/src/render/reference-characters.ts";
    const { createRenderService } = (await import(
      /* @vite-ignore */ serviceUrl
    )) as typeof import("../../../src/render/service");
    const { createGlyphCalibrator, REFERENCE_MONOSPACE_STACK } = (await import(
      /* @vite-ignore */ calibrationUrl
    )) as typeof import("../../../src/render/glyph-calibration");
    const { prepareCharactersProject, prepareCharactersGeometry } =
      (await import(
        /* @vite-ignore */ adapterUrl
      )) as typeof import("../../../src/render/reference-characters");
    const source = {
        id: "owned-marker-alpha-97x67",
        revision: 1,
        width: 97,
        height: 67,
      },
      rgba = new Uint8ClampedArray(97 * 67 * 4);
    // Independently authored source: gradient, alpha edge, hidden-red transparent strip and marker pixels.
    for (let y = 0; y < 67; y++)
      for (let x = 0; x < 97; x++)
        rgba.set(
          [
            x < 12 ? 255 : Math.round((x * 255) / 96),
            Math.round((y * 255) / 66),
            Math.round(((x + y) * 255) / 162),
            x < 12 ? 0 : x < 32 ? 128 : 255,
          ],
          (y * 97 + x) * 4,
        );
    rgba.set([255, 255, 0, 255], (20 * 97 + 40) * 4);
    rgba.set([0, 0, 255, 128], (48 * 97 + 83) * 4);
    const p: import("../../../src/render/project").RenderProjectV1 = {
      version: 1,
      id: "project-browser",
      name: "Owned fixture",
      source,
      crop: { x: 0, y: 0, width: 1, height: 1 },
      rotation: 0,
      style: {
        id: "characters",
        parameters: {
          fontSize: 3.2,
          charSet: "█é ",
          brightness: 0,
          contrast: 20,
        },
      },
      effects: [],
      masks: [],
      text: [],
      seed: 9,
      timeUs: 17,
      export: {
        format: "png",
        scale: 4,
        fps: 30,
        durationUs: 0,
        quality: 1,
        audio: false,
      },
    };
    const original = JSON.stringify(p),
      originalBytes = rgba.slice(),
      calibrator = createGlyphCalibrator(),
      service = createRenderService();
    let revision = 0;
    const same = (a: ArrayLike<number>, b: ArrayLike<number>) =>
      a.length === b.length && Array.from(a).every((v, i) => v === b[i]);
    async function render(project: typeof p, scale: 1 | 3 | 4) {
      const F = project.style.parameters.fontSize as number,
        ramp = project.style.parameters.charSet as string;
      const geometry = prepareCharactersGeometry(F, scale);
      const atlas = await calibrator.calibrateReferenceCharacters({
        fontFamily: REFERENCE_MONOSPACE_STACK,
        fontSize: geometry.fontPixelSize,
        cellWidth: geometry.cellWidth,
        cellHeight: geometry.cellHeight,
        ramp,
        fontRevision: "task5-browser-v1",
        fontPolicy: "reference-system-monospace",
      });
      await service.setAtlas(atlas);
      const bound = prepareCharactersProject(project, scale, atlas, {
        source,
        calibrationId: atlas.calibration.id,
        fontFamily: REFERENCE_MONOSPACE_STACK,
        fontRevision: "task5-browser-v1",
        charactersProfileVersion: service.charactersProfileVersion,
        charactersContextVersion: service.charactersContextVersion,
        memoryBudgetBytes: 268435456,
      });
      const request = {
        source: bound.source,
        sourceId: bound.sourceId,
        sourceRevision: bound.sourceRevision,
        calibrationId: bound.calibrationId,
        settings: bound.settings,
        jobId: `preview-${++revision}`,
        revision,
        timeUs: project.timeUs,
      };
      const preview = await service.renderCharactersPreview(request);
      const exported = await service.renderCharactersExport({
        ...request,
        jobId: `export-${revision}`,
        outputWidth: bound.settings.frameWidth,
        outputHeight: bound.settings.frameHeight,
      });
      return {
        frame: preview.frame,
        parity: same(preview.frame.rgba, exported.frame.rgba),
        geometry,
        atlas,
      };
    }
    try {
      await service.setSource({ ...source, rgba });
      const baseline = await render(p, 1),
        scale3 = await render(p, 3),
        scale4 = await render(p, 4);
      const change = (parameters: Record<string, number | string>) => ({
        ...p,
        style: {
          ...p.style,
          parameters: { ...p.style.parameters, ...parameters },
        },
      });
      const larger = await render(change({ fontSize: 7.2 }), 1);
      const ramp = await render(change({ charSet: "é█ " }), 1);
      const bright = await render(change({ brightness: 30 }), 1);
      const contrast = await render(change({ contrast: -30 }), 1);
      const b = baseline.frame,
        grid = b.grid!;
      const metrics = [scale3, scale4].map((r) => ({
        scale: r.frame.width / 97,
        frame: [r.frame.width, r.frame.height],
        grid: [r.frame.grid!.width, r.frame.grid!.height],
        cell: [r.frame.grid!.cellWidth, r.frame.grid!.cellHeight],
        indicesExact: same(r.frame.grid!.glyphIndices, grid.glyphIndices),
        foregroundExact: same(r.frame.grid!.foreground, grid.foreground),
        alphaExact: same(r.frame.grid!.alpha, grid.alpha),
      }));
      const resource = {
        source,
        calibrationId: contrast.atlas.calibration.id,
        fontFamily: REFERENCE_MONOSPACE_STACK,
        fontRevision: "task5-browser-v1",
        charactersProfileVersion: service.charactersProfileVersion,
        charactersContextVersion: service.charactersContextVersion,
        memoryBudgetBytes: 268435456,
      };
      let unsupported = false;
      try {
        prepareCharactersProject(
          {
            ...p,
            effects: [
              {
                id: "unsupported",
                key: "unknown",
                enabled: false,
                parameters: {},
              },
            ],
          },
          1,
          contrast.atlas,
          resource,
        );
      } catch {
        unsupported = true;
      }
      // Real calibrator allows independent font pixels/cells: adapter must refuse the mismatch.
      const g = prepareCharactersGeometry(3.2, 1);
      const wrongFont = await calibrator.calibrateReferenceCharacters({
        fontFamily: REFERENCE_MONOSPACE_STACK,
        fontSize: 4.2,
        cellWidth: g.cellWidth,
        cellHeight: g.cellHeight,
        ramp: "█é ",
        fontRevision: "task5-browser-v1",
        fontPolicy: "reference-system-monospace",
      });
      let wrongFontRejected = false;
      try {
        prepareCharactersProject(p, 1, wrongFont, {
          ...resource,
          calibrationId: wrongFont.calibration.id,
        });
      } catch {
        wrongFontRejected = true;
      }
      return {
        browserProfile: service.charactersProfileVersion,
        context: service.charactersContextVersion,
        grid: [grid.width, grid.height],
        metrics,
        parity: [
          baseline,
          scale3,
          scale4,
          larger,
          ramp,
          bright,
          contrast,
        ].every((r) => r.parity),
        immutable: original === JSON.stringify(p) && same(rgba, originalBytes),
        unsupported,
        wrongFontRejected,
        fontSizeChangesGeometry:
          larger.frame.grid!.width !== grid.width &&
          larger.frame.grid!.cellHeight !== grid.cellHeight,
        rampChangesPaint: !same(ramp.frame.rgba, b.rgba),
        brightnessChangesPaint: !same(bright.frame.rgba, b.rgba),
        contrastChangesPaint: !same(contrast.frame.rgba, b.rgba),
        brightnessSelectionStable: same(
          bright.frame.grid!.glyphIndices,
          grid.glyphIndices,
        ),
        brightnessChangesRGB: !same(
          bright.frame.grid!.foreground,
          grid.foreground,
        ),
        contrastSelectionStable: same(
          contrast.frame.grid!.glyphIndices,
          grid.glyphIndices,
        ),
        contrastChangesRGB: !same(
          contrast.frame.grid!.foreground,
          grid.foreground,
        ),
        margin: [
          b.width - grid.width * grid.cellWidth,
          b.height - grid.height * grid.cellHeight,
        ],
        marginPainted: b.rgba[(b.width * b.height - 1) * 4 + 3] > 0,
      };
    } finally {
      await service.dispose();
      calibrator.clearGlyphCalibrationCache();
    }
  });
  await testInfo.attach("project-binding.json", {
    body: JSON.stringify(
      { browser: browser.version(), platform: process.platform, ...evidence },
      null,
      2,
    ),
    contentType: "application/json",
  });
  console.log(JSON.stringify(evidence));
  expect(evidence.browserProfile).toBe(1);
  expect(evidence.context).toBe(1);
  for (const field of [
    "parity",
    "immutable",
    "unsupported",
    "wrongFontRejected",
    "fontSizeChangesGeometry",
    "rampChangesPaint",
    "brightnessChangesPaint",
    "contrastChangesPaint",
    "brightnessSelectionStable",
    "brightnessChangesRGB",
    "contrastSelectionStable",
    "contrastChangesRGB",
    "marginPainted",
  ] as const)
    expect(evidence[field], field).toBe(true);
  expect(evidence.grid).toEqual([50, 20]);
  for (const metric of evidence.metrics) {
    expect(metric.grid).toEqual([50, 20]);
    expect(metric.frame).toEqual(metric.scale === 3 ? [291, 201] : [388, 268]);
    expect(metric.indicesExact).toBe(true);
    expect(metric.foregroundExact).toBe(true);
    expect(metric.alphaExact).toBe(true);
  }
  expect(evidence.margin[0]).toBeCloseTo(1);
  expect(evidence.margin[1]).toBeCloseTo(3);
});

test("captured active and pending exports survive real measured font/ramp edits through the production module worker", async ({
  page,
  browser,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  const result = await page.evaluate(async () => {
    const serviceUrl = "/src/render/service.ts",
      calibrationUrl = "/src/render/glyph-calibration.ts";
    const { createRenderService } = (await import(
      /* @vite-ignore */ serviceUrl
    )) as typeof import("../../../src/render/service");
    const { createGlyphCalibrator } = (await import(
      /* @vite-ignore */ calibrationUrl
    )) as typeof import("../../../src/render/glyph-calibration");
    type Response = import("../../../src/render/protocol").WorkerResponse;
    type Frame =
      import("../../../src/render/reference-characters").ReferenceCharactersFrameV1;
    const face = new FontFace(
      "Captured Atlas Fixture",
      'url("/node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-italic.woff2")',
    );
    await face.load();
    document.fonts.add(face);
    const calibrator = createGlyphCalibrator();
    const measure = (fontSize: number, ramp: string) =>
      calibrator.calibrateReferenceCharacters({
        fontFamily: '"Captured Atlas Fixture"',
        fontRevision: "ibm-plex-mono-latin-400-italic-task2.5",
        fontPolicy: "verified-family",
        fontSize,
        cellWidth: 0.6 * fontSize,
        cellHeight: fontSize,
        ramp,
      });
    // Finish both font measurements before the scheduling barriers start.
    const a = await measure(9.25, "█é. "),
      b = await measure(13.5, "MW#: ");
    const width = 1000,
      height = 1000,
      rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        rgba.set(
          [
            Math.round((x * 255) / (width - 1)),
            Math.round((y * 255) / (height - 1)),
            Math.round(((x + y) * 255) / (width + height - 2)),
            x < 10 ? 0 : x < 20 ? 128 : 255,
          ],
          (y * width + x) * 4,
        );
    const source = {
      id: "owned-captured-atlas-gradient",
      revision: 1,
      width,
      height,
      rgba,
    };
    const request = (
      jobId: string,
      atlas: typeof a,
      fontSize: number,
      brightness = 0,
    ) => ({
      jobId,
      revision: 1,
      sourceId: source.id,
      sourceRevision: 1,
      calibrationId: atlas.calibration.id,
      source: { id: source.id, revision: 1, width, height },
      timeUs: 0,
      settings: {
        version: 1 as const,
        frameWidth: width,
        frameHeight: height,
        fontSize,
        renderScale: 1 as const,
        brightness,
        contrast: 20,
        crop: { x: 0, y: 0, width: 1, height: 1 },
        rotation: 0 as const,
        backdrop: "blur" as const,
      },
      outputWidth: width,
      outputHeight: height,
    });
    const activeRequest = request("active-a", a, 9.25, -10),
      pendingRequest = request("pending-a", a, 9.25, 15);
    const previewRequest = request("preview-b", b, 13.5);
    // Independent serialized sessions use only their fixed atlas/settings; no outputs from
    // concurrent scheduling serve as the expected value for another concurrent job.
    const oracle = createRenderService();
    let expectedActive: Frame, expectedPending: Frame, expectedPreview: Frame;
    try {
      await oracle.setSource(source);
      await oracle.setAtlas(a);
      expectedActive = (await oracle.renderCharactersExport(activeRequest))
        .frame;
      expectedPending = (await oracle.renderCharactersExport(pendingRequest))
        .frame;
      await oracle.setAtlas(b);
      expectedPreview = (await oracle.renderCharactersExport(previewRequest))
        .frame;
    } finally {
      await oracle.dispose();
    }
    const messages: Response[] = [];
    const watchers: {
      match(m: Response): boolean;
      resolve(m: Response): void;
    }[] = [];
    const barrier = (jobId: string, type: Response["type"]) => {
      const match = (m: Response) =>
        m.type === type && "jobId" in m && m.jobId === jobId;
      const found = messages.find(match);
      return found
        ? Promise.resolve(found)
        : new Promise<Response>((resolve) => watchers.push({ match, resolve }));
    };
    const workerUrl = "/src/render/render.worker.ts?worker";
    const { default: ProductionWorker } = (await import(
      /* @vite-ignore */ workerUrl
    )) as { default: new () => Worker };
    const service = createRenderService({
      workerFactory: () => {
        const worker = new ProductionWorker();
        worker.addEventListener("message", (event: MessageEvent<Response>) => {
          messages.push(event.data);
          for (const watcher of [...watchers])
            if (watcher.match(event.data)) {
              watchers.splice(watchers.indexOf(watcher), 1);
              watcher.resolve(event.data);
            }
        });
        return worker;
      },
    });
    const same = (x: ArrayLike<number>, y: ArrayLike<number>) =>
      x.length === y.length && Array.from(x).every((v, i) => v === y[i]);
    const equalFrame = (x: Frame, y: Frame) =>
      x.width === y.width &&
      x.height === y.height &&
      same(x.rgba, y.rgba) &&
      (x.grid === null || y.grid === null
        ? x.grid === y.grid
        : x.grid.calibrationId === y.grid.calibrationId &&
          same(x.grid.glyphIndices, y.grid.glyphIndices) &&
          same(x.grid.foreground, y.grid.foreground) &&
          same(x.grid.background, y.grid.background) &&
          same(x.grid.alpha, y.grid.alpha));
    try {
      await service.setSource(source);
      await service.setAtlas(a);
      let activeSettled = false,
        pendingSettled = false;
      const active = service.renderCharactersExport(activeRequest);
      const pending = service.renderCharactersExport(pendingRequest);
      const outcomes = Promise.all([active, pending]);
      void active
        .finally(() => {
          activeSettled = true;
        })
        .catch(() => {});
      void pending
        .finally(() => {
          pendingSettled = true;
        })
        .catch(() => {});
      await barrier("active-a", "accepted");
      await barrier("pending-a", "accepted");
      const progress = await barrier("active-a", "progress");
      const beforeAtlasEdit = { activeSettled, pendingSettled };
      await service.setAtlas(b);
      const afterAtlasAccepted = { activeSettled, pendingSettled };
      const previewInput = {
        jobId: previewRequest.jobId,
        revision: previewRequest.revision,
        sourceId: previewRequest.sourceId,
        sourceRevision: previewRequest.sourceRevision,
        calibrationId: previewRequest.calibrationId,
        source: previewRequest.source,
        timeUs: previewRequest.timeUs,
        settings: previewRequest.settings,
      };
      const preview = await service.renderCharactersPreview(previewInput);
      const [activeResult, pendingResult] = await outcomes;
      // Source revision replacement remains explicitly canceling for captured exports.
      const cancelRequest = request("source-cancel", b, 13.5);
      const cancelOutcome = service.renderCharactersExport(cancelRequest).then(
        () => "completed",
        (e) => e.code as string,
      );
      await barrier("source-cancel", "accepted");
      await barrier("source-cancel", "progress");
      await service.setSource({ ...source, revision: 2 });
      return {
        retentionVersion: service.charactersAtlasRetentionVersion,
        beforeAtlasEdit,
        afterAtlasAccepted,
        startedSlices: progress.type === "progress" ? progress.slices : 0,
        activeEqualsFixed: equalFrame(activeResult.frame, expectedActive!),
        pendingEqualsFixed: equalFrame(pendingResult.frame, expectedPending!),
        previewEqualsFixed: equalFrame(preview.frame, expectedPreview!),
        previewIdentity: preview.calibrationId,
        atlasB: b.calibration.id,
        changedFrame: !same(expectedActive!.rgba, expectedPreview!.rgba),
        oldResultIds: messages
          .filter(
            (m) =>
              m.type === "charactersResult" &&
              (m.jobId === "active-a" || m.jobId === "pending-a"),
          )
          .map((m) => ("jobId" in m ? m.jobId : "")),
        sourceReplacement: await cancelOutcome,
        atlasA: {
          width: a.calibration.maskWidth,
          height: a.calibration.maskHeight,
          glyphs: a.calibration.glyphs,
        },
        atlasBMeasured: {
          width: b.calibration.maskWidth,
          height: b.calibration.maskHeight,
          glyphs: b.calibration.glyphs,
        },
      };
    } finally {
      await service.dispose();
      calibrator.clearGlyphCalibrationCache();
      document.fonts.delete(face);
    }
  });
  const evidence = {
    browser: browser.version(),
    platform: process.platform,
    ...result,
  };
  await testInfo.attach("captured-atlas.json", {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
  console.log(JSON.stringify(evidence));
  expect(errors).toEqual([]);
  expect(result.retentionVersion).toBe(1);
  expect(result.startedSlices).toBeGreaterThan(0);
  expect(result.beforeAtlasEdit).toEqual({
    activeSettled: false,
    pendingSettled: false,
  });
  expect(result.afterAtlasAccepted).toEqual({
    activeSettled: false,
    pendingSettled: false,
  });
  expect(result.activeEqualsFixed).toBe(true);
  expect(result.pendingEqualsFixed).toBe(true);
  expect(result.previewEqualsFixed).toBe(true);
  expect(result.previewIdentity).toBe(result.atlasB);
  expect(result.changedFrame).toBe(true);
  expect(result.oldResultIds).toEqual(["active-a", "pending-a"]);
  expect(result.sourceReplacement).toBe("Cancelled");
});

test("captured Characters Worker matches independent WebGL grid bytes at every scale and exports the same frame", async ({
  page,
}) => {
  const { readFile } = await import("node:fs/promises");
  const grid = JSON.parse(
    await readFile(
      resolve("tests/fixtures/render/characters/webgl-grid.json"),
      "utf8",
    ),
  ) as { scale: 1 | 2 | 3 | 4; originX: number; originY: number }[];
  const expected = Array.from(
    await readFile(resolve("tests/fixtures/render/characters/webgl-grid.rgba")),
  );
  await page.goto(base);
  const result = await page.evaluate(
    async ({ grid, expected }) => {
      const serviceUrl = "/src/render/service.ts",
        contextUrl = "/src/render/style-context.ts";
      const { createRenderService } = (await import(
        /* @vite-ignore */ serviceUrl
      )) as typeof import("../../../src/render/service");
      const { STYLE_CONTEXT_DEFAULTS } = (await import(
        /* @vite-ignore */ contextUrl
      )) as typeof import("../../../src/render/style-context");
      const service = createRenderService();
      const source = { id: "webgl-grid", revision: 1, width: 7, height: 3 };
      const pixels = [];
      for (let y = 0; y < 3; y++)
        for (let x = 0; x < 7; x++)
          pixels.push(
            ...(x === 2
              ? [72, 160, 220, 212]
              : x === 4
                ? [220, 99, 31, 173]
                : [0, 0, 0, 255]),
          );
      const mask = [0, 0, 0, 0, 0, 17, 139, 0, 0, 241, 53, 0, 0, 0, 0, 0];
      const same = (a: ArrayLike<number>, b: ArrayLike<number>) =>
        a.length === b.length && Array.from(a).every((v, i) => v === b[i]);
      const results = [];
      let offset = 0;
      try {
        await service.setSource({
          ...source,
          rgba: new Uint8ClampedArray(pixels),
        });
        for (const [index, c] of grid.entries()) {
          const side = 4 * c.scale,
            width = 7 * c.scale,
            height = 3 * c.scale;
          const scaled = Array.from(
            { length: side * side },
            (_, i) =>
              mask[
                Math.floor(Math.floor(i / side) / c.scale) * 4 +
                  Math.floor((i % side) / c.scale)
              ],
          );
          const id = `grid-${index}`;
          await service.setAtlas({
            version: 1,
            originX: c.originX * c.scale,
            originY: c.originY * c.scale,
            spaceIndexOr65535: 65535,
            placement: "top-start-ltr",
            ordering: "input",
            fontPolicy: "reference-system-monospace",
            calibration: {
              version: 1,
              id,
              fontKey: "controlled-mask",
              glyphs: ["#", "."],
              cellWidth: 0.6 * 3 * c.scale,
              cellHeight: 3 * c.scale,
              maskWidth: side,
              maskHeight: side,
              masks: new Uint8Array([...scaled, ...scaled]),
              coverage: new Float32Array([0.5, 0.5]),
              shapes: new Float32Array(18),
            },
          });
          const request = {
            jobId: `p-${index}`,
            revision: index,
            sourceId: source.id,
            sourceRevision: 1,
            calibrationId: id,
            source,
            settings: {
              version: 1 as const,
              frameWidth: width,
              frameHeight: height,
              fontSize: 3,
              renderScale: c.scale,
              brightness: 0,
              contrast: 20,
              rotation: 0 as const,
              crop: { x: 0, y: 0, width: 1, height: 1 },
              backdrop: "none" as const,
              styleContext: {
                ...STYLE_CONTEXT_DEFAULTS,
                backdrop: "none" as const,
              },
            },
            timeUs: 0,
          };
          const preview = await service.renderCharactersPreview(request);
          const exported = await service.renderCharactersExport({
            ...request,
            jobId: `e-${index}`,
            outputWidth: width,
            outputHeight: height,
          });
          results.push({
            index,
            scale: c.scale,
            oracle: same(
              preview.frame.rgba,
              expected.slice(offset, offset + width * height * 4),
            ),
            export: same(preview.frame.rgba, exported.frame.rgba),
          });
          offset += width * height * 4;
        }
        return { results, consumed: offset };
      } finally {
        await service.dispose();
      }
    },
    { grid, expected },
  );
  expect(result.results).toHaveLength(16);
  expect(result.consumed).toBe(expected.length);
  for (const c of result.results) {
    expect(c.oracle, JSON.stringify(c)).toBe(true);
    expect(c.export, JSON.stringify(c)).toBe(true);
  }
});

test("pinned software Characters reference exports equal actual Worker frames exactly", async ({
  page,
  browser,
}, info) => {
  test.skip(
    !process.env.CHARACTERS_REFERENCE_DIR,
    "Run explicitly with the pinned reference manifest",
  );
  const { readFile } = await import("node:fs/promises");
  const sharp = (await import("sharp")).default;
  const directory = resolve(process.env.CHARACTERS_REFERENCE_DIR!);
  const manifest = JSON.parse(
    await readFile(resolve(directory, "reference-manifest.json"), "utf8"),
  ) as {
    browser: string;
    sourceSha256: string;
    backend: { rectangleAlpha: number; renderer: string };
    cases: {
      file: string;
      sha256: string;
      settings: Record<string, string>;
      fontSize: number;
      backdrop: "none" | "blur";
      scale: 1 | 2 | 3 | 4;
    }[];
  };
  expect(manifest.backend.rectangleAlpha).toBe(38);
  expect(manifest.backend.renderer).toContain("SwiftShader");
  expect(manifest.cases).toHaveLength(16);
  const { createHash } = await import("node:crypto");
  expect(manifest.browser).toBe(browser.version());
  expect(manifest.sourceSha256).toBe(
    createHash("sha256")
      .update(await readFile(resolve("tests/fixtures/gradient.png")))
      .digest("hex"),
  );
  expect(
    manifest.cases.map((c) => `${c.fontSize}-${c.backdrop}-${c.scale}`).sort(),
  ).toEqual(
    [3, 11, 17, 47]
      .flatMap((f) =>
        ["none", "blur"].flatMap((b) => [1, 2].map((s) => `${f}-${b}-${s}`)),
      )
      .sort(),
  );
  const cases = await Promise.all(
    manifest.cases.map(async (c) => {
      expect(c.settings).toMatchObject({
        bgMode: c.backdrop,
        fontSize: String(c.fontSize),
        customChars: "@#S08Xx+=-;:. ",
        brightness: "0",
        contrast: "20",
        charOpacity: "100",
        coverage: "100",
        blendMode: "source-over",
      });
      if (c.backdrop === "blur")
        expect(c.settings).toMatchObject({ bgBlur: "8", bgOpacity: "100" });
      const file = await readFile(resolve(directory, c.file));
      expect(createHash("sha256").update(file).digest("hex")).toBe(c.sha256);
      const image = await sharp(file)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([
        image.info.width,
        image.info.height,
        image.info.channels,
      ]).toEqual([128 * c.scale, 64 * c.scale, 4]);
      expect(image.data.length).toBe(128 * 64 * c.scale * c.scale * 4);
      return { ...c, rgba: Array.from(image.data) };
    }),
  );
  const sourceRgba = Array.from(
    await sharp(resolve("tests/fixtures/gradient.png"))
      .ensureAlpha()
      .raw()
      .toBuffer(),
  );
  await page.goto(base);
  const actualBackend = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(13.7, 0.5, 5.6, 10);
    const gl = document
      .createElement("canvas")
      .getContext("webgl2", { antialias: false, premultipliedAlpha: true });
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      rectangleAlpha: ctx.getImageData(13, 0, 1, 1).data[3],
      renderer: ext ? gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
    };
  });
  expect(actualBackend).toEqual(manifest.backend);
  const output = await page.evaluate(
    async ({ cases, sourceRgba }) => {
      const serviceUrl = "/src/render/service.ts",
        calibratorUrl = "/src/render/glyph-calibration.ts",
        contextUrl = "/src/render/style-context.ts";
      const { createRenderService } = (await import(
        /* @vite-ignore */ serviceUrl
      )) as typeof import("../../../src/render/service");
      const { createGlyphCalibrator } = (await import(
        /* @vite-ignore */ calibratorUrl
      )) as typeof import("../../../src/render/glyph-calibration");
      const { STYLE_CONTEXT_DEFAULTS } = (await import(
        /* @vite-ignore */ contextUrl
      )) as typeof import("../../../src/render/style-context");
      const service = createRenderService(),
        calibrator = createGlyphCalibrator();
      const source = {
        id: "reference-gradient",
        revision: 1,
        width: 128,
        height: 64,
      };
      const results = [];
      try {
        await service.setSource({
          ...source,
          rgba: new Uint8ClampedArray(sourceRgba),
        });
        for (const [index, c] of cases.entries()) {
          const font = c.fontSize * c.scale;
          const atlas = await calibrator.calibrateReferenceCharacters({
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: font,
            cellWidth: 0.6 * c.fontSize * c.scale,
            cellHeight: font,
            ramp: "@#S08Xx+=-;:. ",
            fontRevision: "software-reference",
            fontPolicy: "reference-system-monospace",
          });
          await service.setAtlas(atlas);
          const width = 128 * c.scale,
            height = 64 * c.scale;
          const request = {
            jobId: `reference-p-${index}`,
            revision: index,
            sourceId: source.id,
            sourceRevision: 1,
            calibrationId: atlas.calibration.id,
            source,
            timeUs: 0,
            settings: {
              version: 1 as const,
              frameWidth: width,
              frameHeight: height,
              fontSize: c.fontSize,
              renderScale: c.scale,
              brightness: 0,
              contrast: 20,
              rotation: 0 as const,
              crop: { x: 0, y: 0, width: 1, height: 1 },
              backdrop: c.backdrop,
              styleContext: { ...STYLE_CONTEXT_DEFAULTS, backdrop: c.backdrop },
            },
          };
          const preview = await service.renderCharactersPreview(request);
          const exported = await service.renderCharactersExport({
            ...request,
            jobId: `reference-e-${index}`,
            outputWidth: width,
            outputHeight: height,
          });
          const length = width * height * 4;
          if (
            c.rgba.length !== length ||
            preview.frame.rgba.length !== length ||
            exported.frame.rgba.length !== length ||
            preview.frame.width !== width ||
            preview.frame.height !== height ||
            exported.frame.width !== width ||
            exported.frame.height !== height
          )
            throw Error(
              "Reference/preview/export dimensions or lengths differ",
            );
          let differingBytes = 0,
            alphaErrors = 0,
            first = -1,
            previewExportDifferences = 0;
          for (let i = 0; i < c.rgba.length; i++) {
            if (preview.frame.rgba[i] !== c.rgba[i]) {
              differingBytes++;
              if (first < 0) first = i;
              if (i % 4 === 3) alphaErrors++;
            }
            if (preview.frame.rgba[i] !== exported.frame.rgba[i])
              previewExportDifferences++;
          }
          results.push({
            file: c.file,
            differingBytes,
            alphaErrors,
            first,
            actual: first < 0 ? null : preview.frame.rgba[first],
            expected: first < 0 ? null : c.rgba[first],
            previewExportDifferences,
          });
        }
        return results;
      } finally {
        await service.dispose();
        calibrator.clearGlyphCalibrationCache();
      }
    },
    { cases, sourceRgba },
  );
  await info.attach("software-reference-results.json", {
    body: JSON.stringify(output, null, 2),
    contentType: "application/json",
  });
  console.log(JSON.stringify(output));
  for (const c of output) {
    expect(c.differingBytes, JSON.stringify(c)).toBe(0);
    expect(c.previewExportDifferences, JSON.stringify(c)).toBe(0);
  }
});
