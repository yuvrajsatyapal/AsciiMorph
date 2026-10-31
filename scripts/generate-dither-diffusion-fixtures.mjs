// Full-plane Float32 oracle, independent of the cooperative three-row renderer.
import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../tests/fixtures/render/dither/", import.meta.url);
const samples = await readFile(new URL("image-odd31-sample-2.rgba", root));
const kernels = {
  floyd: [
    [1, 0, 7 / 16],
    [-1, 1, 3 / 16],
    [0, 1, 5 / 16],
    [1, 1, 1 / 16],
  ],
  atkinson: [
    [1, 0, 1 / 8],
    [2, 0, 1 / 8],
    [-1, 1, 1 / 8],
    [0, 1, 1 / 8],
    [1, 1, 1 / 8],
    [0, 2, 1 / 8],
  ],
  stucki: [
    [1, 0, 8 / 42],
    [2, 0, 4 / 42],
    [-2, 1, 2 / 42],
    [-1, 1, 4 / 42],
    [0, 1, 8 / 42],
    [1, 1, 4 / 42],
    [2, 1, 2 / 42],
    [-2, 2, 1 / 42],
    [-1, 2, 2 / 42],
    [0, 2, 4 / 42],
    [1, 2, 2 / 42],
    [2, 2, 1 / 42],
  ],
  sierraLite: [
    [1, 0, 0.5],
    [-1, 1, 0.25],
    [0, 1, 0.25],
  ],
};
for (const [name, kernel] of Object.entries(kernels))
  for (const strength of [50, 100]) {
    const tone = new Uint8ClampedArray(samples.length);
    for (let i = 0; i < samples.length; i++)
      tone[i] =
        i % 4 === 3 ? samples[i] : ((samples[i] / 255 - 0.5) * 1.1 + 0.5) * 255;
    const planes = [0, 1, 2].map((k) =>
      Float32Array.from({ length: 160 }, (_, i) => tone[i * 4 + k]),
    );
    for (const plane of planes)
      for (let i = 0; i < 160; i++) plane[i] += (37 - 50) * 2.54;
    const cells = Buffer.from(tone);
    for (let y = 0; y < 10; y++)
      for (let t = 0; t < 16; t++) {
        const direction = y % 2 === 0 ? 1 : -1;
        const x = direction === 1 ? t : 15 - t,
          i = y * 16 + x;
        const values = planes.map((p) => p[i]);
        const output = values.reduce((a, b) => a + b) > 382.5 ? 255 : 0;
        for (let k = 0; k < 3; k++) {
          cells[i * 4 + k] = cells[i * 4 + 3] === 0 ? 0 : output;
          const error = ((values[k] - output) * strength) / 100;
          for (const [dx, dy, weight] of kernel) {
            const nx = x + dx * direction,
              ny = y + dy;
            if (nx >= 0 && nx < 16 && ny < 10)
              planes[k][ny * 16 + nx] += error * weight;
          }
        }
      }
    const frame = Buffer.alloc(31 * 19 * 4);
    for (let y = 0; y < 19; y++)
      for (let x = 0; x < 31; x++) {
        const i =
          (Math.floor(((y + 0.5) * 10) / 19) * 16 +
            Math.floor(((x + 0.5) * 16) / 31)) *
          4;
        frame.set(cells.subarray(i, i + 4), (y * 31 + x) * 4);
      }
    const path = new URL(`diffusion-odd31-${name}-${strength}.rgba`, root);
    if (process.argv.includes("--check")) {
      if (!frame.equals(await readFile(path))) throw Error(`Changed ${path}`);
    } else await writeFile(path, frame);
  }
