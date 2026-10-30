// @vitest-environment node
import { afterEach, expect, test } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
test.each(["exact", "rgb", "alpha"])(
  "lossless gate returns a failing exit code for %s differences",
  async (kind) => {
    const dir = await mkdtemp(join(tmpdir(), "characters-lossless-"));
    directories.push(dir);
    const reference = Buffer.from([20, 40, 60, 128]);
    const local = Buffer.from(reference);
    if (kind === "rgb") local[0]++;
    if (kind === "alpha") local[3]++;
    for (const [name, data] of [
      ["reference-export", reference],
      ["local", local],
    ] as const) {
      await writeFile(
        join(dir, `characters-${name}.png`),
        await sharp(data, { raw: { width: 1, height: 1, channels: 4 } })
          .png()
          .toBuffer(),
      );
    }
    const result = spawnSync(
      process.execPath,
      [resolve("scripts/compare-lossless-reference.mjs"), dir, "characters"],
      { encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(kind === "exact" ? 0 : 1);
    const metrics = JSON.parse(
      await readFile(join(dir, "lossless-metrics.json"), "utf8"),
    );
    expect(metrics.styles.characters.exact).toBe(kind === "exact");
    expect(metrics.styles.characters.differingPixels).toBe(
      kind === "exact" ? 0 : 1,
    );
  },
);
