// Independent local Canvas probe; never loads or executes reference application code.
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const cases = [];
for (const args of [
  [],
  ["--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist"],
]) {
  const browser = await chromium.launch({ args });
  try {
    const page = await browser.newPage();
    cases.push({
      browser: browser.version(),
      args,
      results: await page.evaluate(() =>
        [false, true].map((willReadFrequently) => {
          const canvas = document.createElement("canvas");
          canvas.width = 128;
          canvas.height = 64;
          const ctx = canvas.getContext("2d", { willReadFrequently });
          ctx.fillStyle = "white";
          ctx.fillRect(13.7, 0.5, 5.6, 10);
          return {
            willReadFrequently,
            pixel: Array.from(ctx.getImageData(13, 0, 1, 1).data),
          };
        }),
      ),
    });
  } finally {
    await browser.close();
  }
}
const report = JSON.stringify(cases, null, 2) + "\n";
if (process.argv[2]) await writeFile(process.argv[2], report);
console.log(report);
