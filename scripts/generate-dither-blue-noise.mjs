// Owned deterministic oracle: xorshift32 white noise minus a toroidal 5x5 mean.
// Float32 storage at each stage and byte normalization are part of the contract.
import { writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const size = 128;
let state = 123;
const white = new Float32Array(size * size);
for (let i = 0; i < white.length; i++) {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  state >>>= 0;
  white[i] = state / 4294967296;
}
const mean = new Float32Array(white.length);
const residual = new Float32Array(white.length);
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        sum +=
          white[((y + dy + size) % size) * size + ((x + dx + size) % size)];
    mean[y * size + x] = sum / 25;
  }
let min = Infinity,
  max = -Infinity;
for (let i = 0; i < white.length; i++) {
  residual[i] = white[i] - mean[i];
  min = Math.min(min, residual[i]);
  max = Math.max(max, residual[i]);
}
const bytes = Buffer.from(
  Array.from(residual, (v) => Math.round(((v - min) / (max - min)) * 255)),
);
const path = new URL(
  "../tests/fixtures/render/dither/blue-noise-xorshift123.bin",
  import.meta.url,
);
if (process.argv.includes("--check")) {
  if (!bytes.equals(await readFile(path)))
    throw Error("Blue-noise fixture differs");
} else {
  await writeFile(path, bytes);
}
console.log(
  JSON.stringify({
    seed: 123,
    size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }),
);
