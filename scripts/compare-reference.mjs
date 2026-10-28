// Compare saved evidence only. JPEG metrics describe differences, never a parity verdict.
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
const dir = resolve(
  process.argv[2] ?? "docs/research/ascii-magic/2026-10-28/same-input",
);
const styles = ["characters", "pixel", "mosaic", "dither"];
const bounds = { left: 566, top: 354, width: 128, height: 64 };
const metrics = {
  method:
    "RGB MAE after local alpha is flattened onto black; lossy JPEG reference; no automatic pass/fail",
  bounds,
  rows: {},
};
const panels = [];
const escape = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
for (const [row, style] of styles.entries()) {
  const referencePath = join(dir, `${style}-reference-full.jpg`);
  const referenceMetadata = await sharp(referencePath).metadata();
  if (referenceMetadata.width !== 966 || referenceMetadata.height !== 720)
    throw new Error(
      `${style}: reference viewport changed; remeasure canvas bounds before comparing`,
    );
  const localMetadata = await sharp(join(dir, `${style}-local.png`)).metadata();
  if (
    localMetadata.width !== bounds.width ||
    localMetadata.height !== bounds.height
  )
    throw new Error(
      `${style}: local frame dimensions do not match recorded reference bounds`,
    );
  const reference = await sharp(referencePath)
    .extract(bounds)
    .removeAlpha()
    .png()
    .toBuffer();
  await writeFile(join(dir, `${style}-reference-canvas.png`), reference);
  const localPath = join(dir, `${style}-local.png`);
  const local = await sharp(localPath)
    .flatten({ background: "#000000" })
    .removeAlpha()
    .png()
    .toBuffer();
  const a = await sharp(reference).raw().toBuffer(),
    b = await sharp(local).raw().toBuffer();
  const diff = Buffer.alloc(a.length);
  const channelMin = [255, 255, 255],
    channelMax = [0, 0, 0];
  let sum = 0,
    maximum = 0,
    min = 255,
    max = 0;
  for (let i = 0; i < a.length; i++) {
    diff[i] = Math.abs(a[i] - b[i]);
    sum += diff[i];
    maximum = Math.max(maximum, diff[i]);
    min = Math.min(min, a[i]);
    max = Math.max(max, a[i]);
    const channel = i % 3;
    channelMin[channel] = Math.min(channelMin[channel], a[i]);
    channelMax[channel] = Math.max(channelMax[channel], a[i]);
  }
  if (!channelMax.some((value, channel) => value > channelMin[channel]))
    throw new Error(
      `${style}: flat reference capture; reject the capture instead of treating it as a renderer oracle`,
    );
  metrics.rows[style] = {
    rgbMAE: sum / a.length,
    maxRGBError: maximum,
    referenceRange: [min, max],
    referenceSha256: createHash("sha256")
      .update(await readFile(referencePath))
      .digest("hex"),
    localSha256: createHash("sha256")
      .update(await readFile(localPath))
      .digest("hex"),
  };
  const difference = await sharp(diff, {
    raw: { width: 128, height: 64, channels: 3 },
  })
    .png()
    .toBuffer();
  for (const [col, input] of [reference, local, difference].entries())
    panels.push({
      input: await sharp(input)
        .resize(512, 256, { kernel: "nearest" })
        .png()
        .toBuffer(),
      left: col * 520,
      top: row * 292 + 34,
    });
}
const labels = `<svg width="1560" height="1168">${styles.map((s, i) => ["Reference (JPEG; black background)", "Local (black background)", "Absolute RGB difference"].map((heading, j) => `<text x="${j * 520 + 4}" y="${i * 292 + 23}" fill="white" font-family="sans-serif" font-size="16">${escape(s)} · ${heading}</text>`).join("")).join("")}</svg>`;
await sharp({
  create: { width: 1560, height: 1168, channels: 3, background: "#202020" },
})
  .composite([...panels, { input: Buffer.from(labels), left: 0, top: 0 }])
  .png()
  .toFile(join(dir, "comparison.png"));
await writeFile(
  join(dir, "metrics.json"),
  JSON.stringify(metrics, null, 2) + "\n",
);
console.log(JSON.stringify(metrics.rows, null, 2));
