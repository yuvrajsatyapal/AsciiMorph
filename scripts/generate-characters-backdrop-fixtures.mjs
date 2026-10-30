// Independent software Canvas scaled-image/filter oracle. No application renderer.
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const args = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--disable-accelerated-2d-canvas",
];
const browser = await chromium.launch({ args });
try {
  const page = await browser.newPage();
  const cases = await page.evaluate(() => {
    const src = document.createElement("canvas");
    src.width = 128;
    src.height = 64;
    const ctx = src.getContext("2d");
    const data = ctx.createImageData(128, 64);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 128; x++)
        data.data.set(
          [2 * x, 4 * y, 255 - 2 * x, x < 13 ? 0 : 255],
          (y * 128 + x) * 4,
        );
    ctx.putImageData(data, 0, 0);
    const out = [];
    for (const scale of [1, 2, 3, 4])
      for (const blur of ["low", "low-scaled"]) {
        const c = document.createElement("canvas");
        c.width = 128 * scale;
        c.height = 64 * scale;
        const t = c.getContext("2d");
        t.fillStyle = "black";
        t.fillRect(0, 0, c.width, c.height);
        t.imageSmoothingEnabled = true;
        t.imageSmoothingQuality = "high";
        if (blur === "low") t.filter = "blur(8px)";
        const intermediate = document.createElement("canvas");
        intermediate.width = c.width;
        intermediate.height = c.height;
        const m = intermediate.getContext("2d");
        m.imageSmoothingQuality = "low";
        m.drawImage(src, 0, 0, c.width, c.height);
        t.drawImage(intermediate, 0, 0);
        out.push({
          scale,
          blur,
          rgba: Array.from(t.getImageData(0, 0, c.width, c.height).data),
        });
      }
    return out;
  });
  for (const c of cases)
    await writeFile(
      `tests/fixtures/render/backdrop/canvas-gradient-${c.blur === "low" ? "low-blur8" : "low-scaled"}-${c.scale}.rgba`,
      Buffer.from(c.rgba),
    );
  console.log(
    `Generated ${cases.length} Canvas fixtures, Chromium ${browser.version()}`,
  );
} finally {
  await browser.close();
}
