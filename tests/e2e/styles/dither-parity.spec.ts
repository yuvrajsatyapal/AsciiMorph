import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import type { ViteDevServer } from "vite";
type ReferenceCase = {
  file: string;
  algorithm: string;
  strength: number;
  pixelSize: number;
  scale: number;
  rgba: number[];
  name?: string;
  backdrop?: string;
  softness?: number;
  backgroundOpacity?: number;
};
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
test("pinned Dither reference RGBA and same-scale preview/export are exact", async ({
  page,
  browser,
}) => {
  const { readFile, writeFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const sharp = (await import("sharp")).default;
  const dir = resolve(
    process.env.DITHER_REFERENCE_DIR ??
      "docs/research/ascii-magic/2026-10-31/dither-seeded",
  );
  const manifest = JSON.parse(
    await readFile(resolve(dir, "reference-manifest.json"), "utf8"),
  );
  expect(manifest.complete).toBe(true);
  expect(manifest.randomness).toMatchObject({
    algorithm: "xorshift32",
    seed: 123,
    scope: "per-callsite",
  });
  expect(
    manifest.randomness.streams.some(
      (s: { count: number; state: number }) =>
        s.count === 16384 && s.state === 2164097990,
    ),
  ).toBe(true);
  expect(manifest.sourceAlphaVerified).toBe(true);
  expect(manifest.baselineControls).toMatchObject({
    bgMode: "original",
    bgOpacity: "100",
    blendMode: "source-over",
    charOpacity: "100",
    coverage: "100",
    brightness: "0",
    contrast: "20",
    "advBlur-type": "off",
    "crop-aspect": "free",
  });
  expect(manifest.browser).toBe(browser.version());
  expect(manifest.backend.rectangleAlpha).toBe(38);
  expect(manifest.backend.renderer).toContain("SwiftShader");
  const sourceBytes = await readFile(resolve("tests/fixtures/gradient.png"));
  expect(createHash("sha256").update(sourceBytes).digest("hex")).toBe(
    manifest.sourceSha256,
  );
  const proofBytes = await readFile(resolve(dir, manifest.sourceProof.file));
  expect(createHash("sha256").update(proofBytes).digest("hex")).toBe(
    manifest.sourceProof.sha256,
  );
  const proof = await sharp(proofBytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect([proof.info.width, proof.info.height, proof.info.channels]).toEqual([
    128, 64, 4,
  ]);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 128; x++) {
      const i = (y * 128 + x) * 4;
      expect(Array.from(proof.data.subarray(i, i + 4))).toEqual(
        x < 13 ? [0, 0, 0, 255] : [2 * x, 4 * y, 255 - 2 * x, 255],
      );
    }
  const identities = [
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
  ].map((algorithm) => ({ algorithm, strength: 100, pixelSize: 2 }));
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
  expect(
    manifest.cases
      .map(
        (c: {
          algorithm: string;
          strength: number;
          pixelSize: number;
          scale: number;
        }) => `${c.algorithm}-${c.strength}-${c.pixelSize}-${c.scale}`,
      )
      .sort(),
  ).toEqual(
    identities
      .flatMap((c) =>
        [1, 2].map(
          (scale) => `${c.algorithm}-${c.strength}-${c.pixelSize}-${scale}`,
        ),
      )
      .sort(),
  );
  const cases = [];
  for (const c of manifest.cases) {
    expect(c.settings).toMatchObject({
      bgMode: "original",
      bgOpacity: "100",
      "advBlur-type": "off",
      "crop-aspect": "free",
      ditherAlgo: c.algorithm,
      ditherStrength: String(c.strength),
      ditherScale: String(c.pixelSize),
      ditherPalette: "mono",
      ditherChromaMode: "standard",
      ditherContrast: "110",
      ditherThreshold: "50",
    });
    const bytes = await readFile(resolve(dir, c.file));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(c.sha256);
    const image = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([image.info.width, image.info.height, image.info.channels]).toEqual([
      128 * c.scale,
      64 * c.scale,
      4,
    ]);
    expect(image.data.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
    cases.push({ ...c, rgba: Array.from(image.data) });
  }
  const sourceRgba = Array.from(
    await sharp(sourceBytes).ensureAlpha().raw().toBuffer(),
  );
  await page.goto(base);
  const backend = await page.evaluate(() => {
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
  expect(backend).toEqual(manifest.backend);
  const alphaCase = cases.find(
    (c) =>
      c.algorithm === "floyd" &&
      c.strength === 0 &&
      c.pixelSize === 1 &&
      c.scale === 1,
  )!;
  for (let i = 3; i < sourceRgba.length; i += 4)
    expect(alphaCase.rgba[i]).toBe(sourceRgba[i]);
  const output = await compareCases(page, cases, sourceRgba);
  await writeFile(
    resolve(dir, "reference-results.json"),
    JSON.stringify(output, null, 2) + "\n",
  );
  for (const c of output) {
    expect.soft(c.differingBytes, c.file).toBe(0);
    expect.soft(c.previewExportDifferences, c.file + " preview/export").toBe(0);
  }
});

// Shared actual-worker path for both independently captured reference matrices.
async function compareCases(
  page: import("@playwright/test").Page,
  cases: ReferenceCase[],
  sourceRgba: number[],
) {
  return await page.evaluate(
    async ({ cases, sourceRgba }) => {
      const serviceUrl = "/src/render/service.ts",
        contextUrl = "/src/render/style-context.ts";
      const { createRenderService } = await import(
        /* @vite-ignore */ serviceUrl
      );
      const { STYLE_CONTEXT_DEFAULTS } = await import(
        /* @vite-ignore */ contextUrl
      );
      const service = createRenderService();
      const source = {
        id: "verified-dither-gradient",
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
        for (const [i, c] of cases.entries()) {
          const width = 128 * c.scale,
            height = 64 * c.scale;
          const request = {
            jobId: `dither-p-${i}`,
            revision: i,
            sourceId: source.id,
            sourceRevision: 1,
            calibrationId: "",
            source,
            styleId: "dither",
            timeUs: 0,
            settings: {
              version: 1,
              styleId: "dither",
              frameWidth: width,
              frameHeight: height,
              renderScale: c.scale,
              crop: { x: 0, y: 0, width: 1, height: 1 },
              rotation: 0,
              seed: 123,
              timeUs: 0,
              ...(c.name === "untouched"
                ? {}
                : {
                    styleContext: {
                      ...STYLE_CONTEXT_DEFAULTS,
                      backdrop: c.backdrop ?? "original",
                      softness: c.softness ?? 8,
                      backgroundOpacity: c.backgroundOpacity ?? 100,
                    },
                  }),
              parameters: {
                fontSize: 3,
                brightness: 0,
                contrast: 0,
                invert: false,
                charOpacity: 100,
                dither: {
                  algorithm: c.algorithm,
                  palette: "mono",
                  chroma: "standard",
                  pixelSize: c.pixelSize,
                  strength: c.strength,
                  contrast: 110,
                  threshold: 50,
                  angle: 0,
                  customPalette: ["#000000", "#ffffff"],
                  animate: false,
                  shimmer: false,
                  direction: "right",
                  speed: 4,
                },
              },
            },
          };
          const preview = await service.renderStylePreview(request);
          const exported = await service.renderStyleExport({
            ...request,
            jobId: `dither-e-${i}`,
            outputWidth: width,
            outputHeight: height,
          });
          const a = preview.frame.rgba,
            b = exported.frame.rgba;
          if (
            a.length !== c.rgba.length ||
            b.length !== a.length ||
            preview.frame.width !== width ||
            preview.frame.height !== height ||
            exported.frame.width !== width ||
            exported.frame.height !== height
          )
            throw Error("Frame geometry mismatch");
          let differingBytes = 0,
            alphaErrors = 0,
            previewExportDifferences = 0,
            first = -1;
          for (let j = 0; j < a.length; j++) {
            if (a[j] !== c.rgba[j]) {
              differingBytes++;
              if (j % 4 === 3) alphaErrors++;
              if (first < 0) first = j;
            }
            if (a[j] !== b[j]) previewExportDifferences++;
          }
          results.push({
            file: c.file,
            differingBytes,
            alphaErrors,
            previewExportDifferences,
            first,
            actual: first < 0 ? null : a[first],
            expected: first < 0 ? null : c.rgba[first],
          });
        }
        return results;
      } finally {
        await service.dispose();
      }
    },
    { cases, sourceRgba },
  );
}

test("Dither untouched default and selected backdrops match exact reference RGBA", async ({
  page,
  browser,
}) => {
  const { readFile, writeFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const sharp = (await import("sharp")).default;
  const dir = resolve("docs/research/ascii-magic/2026-10-31/dither-backdrops");
  const manifest = JSON.parse(
    await readFile(resolve(dir, "reference-manifest.json"), "utf8"),
  );
  expect(manifest.complete).toBe(true);
  expect(manifest.browser).toBe(browser.version());
  expect(
    manifest.cases
      .map((c: { name: string; scale: number }) => `${c.name}-${c.scale}`)
      .sort(),
  ).toEqual(
    ["untouched", "original", "none", "solid", "blur8", "original50", "blur50"]
      .flatMap((name) => [1, 2].map((scale) => `${name}-${scale}`))
      .sort(),
  );
  const source = await readFile(resolve("tests/fixtures/gradient.png"));
  expect(createHash("sha256").update(source).digest("hex")).toBe(
    manifest.sourceSha256,
  );
  const cases = [];
  for (const c of manifest.cases) {
    expect(c.settings).toMatchObject({
      bgMode: c.backdrop,
      ...(c.settings.bgOpacity !== undefined
        ? { bgOpacity: String(c.backgroundOpacity) }
        : {}),
      ...(c.backdrop === "blur" ? { bgBlur: String(c.softness) } : {}),
      ditherAlgo: "floyd",
      ditherStrength: "100",
      ditherScale: "2",
      ditherPalette: "mono",
      ditherChromaMode: "standard",
      ditherContrast: "110",
      ditherThreshold: "50",
    });
    const bytes = await readFile(resolve(dir, c.file));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(c.sha256);
    const decoded = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([
      decoded.info.width,
      decoded.info.height,
      decoded.info.channels,
    ]).toEqual([128 * c.scale, 64 * c.scale, 4]);
    cases.push({
      ...c,
      algorithm: "floyd",
      strength: 100,
      pixelSize: 2,
      rgba: Array.from(decoded.data),
    });
  }
  await page.goto(base);
  const output = await compareCases(
    page,
    cases,
    Array.from(await sharp(source).ensureAlpha().raw().toBuffer()),
  );
  await writeFile(
    resolve(dir, "reference-results.json"),
    JSON.stringify(output, null, 2) + "\n",
  );
  for (const c of output) {
    expect.soft(c.differingBytes, c.file).toBe(0);
    expect.soft(c.previewExportDifferences, c.file + " preview/export").toBe(0);
  }
});
