// Independent Canvas sampling oracle; no public application code is executed.
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const args = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--disable-accelerated-2d-canvas",
];
const browser = await chromium.launch({ args });
try {
  const page = await browser.newPage();
  const rgba = Array.from(
    await sharp("tests/fixtures/gradient.png").ensureAlpha().raw().toBuffer(),
  );
  const png = (await readFile("tests/fixtures/gradient.png")).toString(
    "base64",
  );
  const oddRgba = Buffer.alloc(31 * 19 * 4);
  for (let y = 0; y < 19; y++)
    for (let x = 0; x < 31; x++)
      oddRgba.set(
        [
          (x * 29 + y * 17) % 256,
          (x * 11 + y * 37) % 256,
          (x * 47 + y * 7) % 256,
          (x * 13 + y * 31) % 256,
        ],
        (y * 31 + x) * 4,
      );
  const oddPng = await sharp(oddRgba, {
    raw: { width: 31, height: 19, channels: 4 },
  })
    .png()
    .toBuffer();
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
    throw Error("Wrong sampler backend");
  const cases = await page.evaluate(
    async ({ rgba, png, oddPng }) => {
      const src = document.createElement("canvas");
      src.width = 128;
      src.height = 64;
      src
        .getContext("2d")
        .putImageData(
          new ImageData(new Uint8ClampedArray(rgba), 128, 64),
          0,
          0,
        );
      const image = new Image();
      image.src = "data:image/png;base64," + png;
      await image.decode();
      const out = [];
      for (const sourceType of ["canvas", "image"])
        for (const pixelSize of [1, 2, 3, 12]) {
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(128 / pixelSize));
          canvas.height = Math.max(1, Math.round(64 / pixelSize));
          const ctx = canvas.getContext("2d");
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(
            sourceType === "canvas" ? src : image,
            0,
            0,
            canvas.width,
            canvas.height,
          );
          out.push({
            sourceType,
            pixelSize,
            width: canvas.width,
            height: canvas.height,
            rgba: Array.from(
              ctx.getImageData(0, 0, canvas.width, canvas.height).data,
            ),
          });
        }
      const odd = new Image();
      odd.src = "data:image/png;base64," + oddPng;
      await odd.decode();
      for (const pixelSize of [1, 2, 3, 12]) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(31 / pixelSize));
        canvas.height = Math.max(1, Math.round(19 / pixelSize));
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(odd, 0, 0, canvas.width, canvas.height);
        out.push({
          sourceType: "image-odd31",
          pixelSize,
          width: canvas.width,
          height: canvas.height,
          rgba: Array.from(
            ctx.getImageData(0, 0, canvas.width, canvas.height).data,
          ),
        });
      }
      return out;
    },
    { rgba, png, oddPng: oddPng.toString("base64") },
  );
  await mkdir("tests/fixtures/render/dither", { recursive: true });
  for (const c of cases) {
    await writeFile(
      `tests/fixtures/render/dither/${c.sourceType}-sample-${c.pixelSize}.rgba`,
      Buffer.from(c.rgba),
    );
    c.sha256 = createHash("sha256").update(Buffer.from(c.rgba)).digest("hex");
    delete c.rgba;
  }
  await writeFile(
    "tests/fixtures/render/dither/canvas-sampling.json",
    JSON.stringify(
      {
        browser: browser.version(),
        args,
        backend,
        sourceSha256: createHash("sha256")
          .update(Buffer.from(png, "base64"))
          .digest("hex"),
        oddSourceRgbaSha256: createHash("sha256").update(oddRgba).digest("hex"),
        cases,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(cases);
} finally {
  await browser.close();
}
