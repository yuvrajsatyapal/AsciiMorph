// Independent Canvas input oracle. No reference application code is executed.
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const source = await readFile(
  new URL("../tests/fixtures/gradient.png", import.meta.url),
);
const root = new URL("../tests/fixtures/render/dither/", import.meta.url);
const args = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--disable-accelerated-2d-canvas",
];
const browser = await chromium.launch({ args });
try {
  const page = await browser.newPage();
  const cases = [];
  for (const name of [
    "blur8",
    "original50",
    "blur50",
    "original30",
    "blur30",
    "original70",
    "blur70",
  ])
    for (const scale of [1, 2]) {
      const rgba = await page.evaluate(
        async ({ png, name, scale }) => {
          const image = new Image();
          image.src = "data:image/png;base64," + png;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = 128 * scale;
          canvas.height = 64 * scale;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "black";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.globalAlpha =
            name === "blur8" ? 1 : Number(name.replace(/\D/g, "")) / 100;
          ctx.imageSmoothingQuality = "high";
          if (name.includes("blur")) ctx.filter = "blur(8px)";
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          return Array.from(
            ctx.getImageData(0, 0, canvas.width, canvas.height).data,
          );
        },
        { png: source.toString("base64"), name, scale },
      );
      const bytes = Buffer.from(rgba);
      const file = `backdrop-${name}-${scale}.rgba`;
      if (process.argv.includes("--check")) {
        if (!bytes.equals(await readFile(new URL(file, root))))
          throw Error(`Changed ${file}`);
      } else await writeFile(new URL(file, root), bytes);
      cases.push({
        file,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  const manifest = {
    browser: browser.version(),
    args,
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    cases,
  };
  if (!process.argv.includes("--check"))
    await writeFile(
      new URL("backdrop-inputs.json", root),
      JSON.stringify(manifest, null, 2) + "\n",
    );
  console.log(manifest);
} finally {
  await browser.close();
}
