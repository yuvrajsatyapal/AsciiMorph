// Compare real lossless exports, preserving alpha and original captures.
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";

const directory = resolve(
  process.argv[2] ?? "docs/research/ascii-magic/2026-10-30",
);
const styles = process.argv.slice(3);
if (!styles.length) styles.push("pixel", "mosaic");
const metrics = { method: "Unflattened lossless RGBA; full frame", styles: {} };
const panels = [];
for (const [row, style] of styles.entries()) {
  const paths = ["reference-export", "local"].map((name) =>
    join(directory, `${style}-${name}.png`),
  );
  const decoded = await Promise.all(
    paths.map(async (path) => {
      const file = await readFile(path);
      const image = await sharp(file)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return {
        ...image,
        hash: createHash("sha256").update(file).digest("hex"),
      };
    }),
  );
  const [reference, local] = decoded;
  const { width, height } = reference.info;
  if (local.info.width !== width || local.info.height !== height)
    throw new Error(`${style}: dimensions differ`);
  let rgbError = 0,
    maxRGBError = 0,
    maxAlphaError = 0,
    differingPixels = 0;
  const difference = Buffer.alloc(reference.data.length);
  for (let i = 0; i < difference.length; i += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const error = Math.abs(
        reference.data[i + channel] - local.data[i + channel],
      );
      changed ||= error !== 0;
      if (channel < 3) {
        rgbError += error;
        maxRGBError = Math.max(maxRGBError, error);
        difference[i + channel] = Math.min(255, error * 8);
      } else maxAlphaError = Math.max(maxAlphaError, error);
    }
    difference[i + 3] = 255;
    differingPixels += Number(changed);
  }
  metrics.styles[style] = {
    width,
    height,
    rgbMAE: rgbError / (width * height * 3),
    maxRGBError,
    maxAlphaError,
    differingPixels,
    exact: differingPixels === 0,
    referenceSha256: reference.hash,
    localSha256: local.hash,
  };
  for (const [column, data] of [
    reference.data,
    local.data,
    difference,
  ].entries()) {
    panels.push({
      input: await sharp(data, { raw: { width, height, channels: 4 } })
        .resize(512, 256, { kernel: "nearest" })
        .png()
        .toBuffer(),
      left: column * 520,
      top: row * 292 + 32,
    });
  }
}
const labels = Buffer.from(
  `<svg width="1560" height="${styles.length * 292}">${styles
    .map((style, row) =>
      ["Lossless reference", "Local", "RGB error ×8"]
        .map(
          (label, column) =>
            `<text x="${column * 520 + 4}" y="${row * 292 + 22}" fill="white" font-family="sans-serif" font-size="16">${style} · ${label}</text>`,
        )
        .join(""),
    )
    .join("")}</svg>`,
);
await sharp({
  create: {
    width: 1560,
    height: styles.length * 292,
    channels: 4,
    background: "#202020",
  },
})
  .composite([...panels, { input: labels, left: 0, top: 0 }])
  .png()
  .toFile(join(directory, "lossless-comparison.png"));
await writeFile(
  join(directory, "lossless-metrics.json"),
  JSON.stringify(metrics, null, 2) + "\n",
);
console.log(JSON.stringify(metrics.styles, null, 2));
// This is an acceptance gate: any differing channel (including alpha) fails.
if (Object.values(metrics.styles).some((result) => !result.exact))
  process.exitCode = 1;
