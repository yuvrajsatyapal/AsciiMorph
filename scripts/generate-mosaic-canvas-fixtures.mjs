// Independent Canvas oracles. Run explicitly when reviewing renderer changes:
// node scripts/generate-mosaic-canvas-fixtures.mjs
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const masks = await page.evaluate(() =>
    ["square", "wide", "tall"].map((shape) => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 20; col++) {
          if ((shape === "wide" && col % 2) || (shape === "tall" && row % 2))
            continue;
          const width = 6.6 * (shape === "wide" ? 2 : 1);
          const height = 11 * (shape === "tall" ? 2 : 1);
          ctx.beginPath();
          ctx.roundRect(
            col * 6.6 + 1,
            row * 11 + 1,
            width - 2,
            height - 2,
            0.2 * Math.min(width, height),
          );
          ctx.fill();
        }
      }
      return {
        shape,
        alpha: Array.from(ctx.getImageData(0, 0, 128, 64).data).filter(
          (_, i) => i % 4 === 3,
        ),
      };
    }),
  );
  for (const { shape, alpha } of masks) {
    await writeFile(
      new URL(
        `../tests/fixtures/render/styles/mosaic-${shape}-canvas.alpha`,
        import.meta.url,
      ),
      Buffer.from(alpha),
    );
  }
  console.log(
    `Generated three 128×64 alpha masks with Chromium ${browser.version()}`,
  );
} finally {
  await browser.close();
}
