import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { convert } from "./engine";
import { DEFAULT_SETTINGS } from "./settings";
import { createWasmEngine } from "./wasm";

const bytes = readFileSync(resolve("public/wasm/asciimorph_engine.wasm"));
describe("Rust WASM numeric engine", () => {
  it("matches JS alpha sampling, Sobel, colors, dithering and Braille", async () => {
    const backend = await createWasmEngine(bytes);
    const pixels = {
      width: 17,
      height: 13,
      data: new Uint8ClampedArray(17 * 13 * 4),
    };
    for (let i = 0; i < pixels.data.length; i++)
      pixels.data[i] = (i * 37 + (i % 11)) % 256;
    for (const patch of [
      {},
      { edge: 70, sharpness: 40, dithering: true },
      { charset: "braille" },
      { invert: true, saturation: 150, gamma: 1.3 },
    ]) {
      const settings = {
        ...DEFAULT_SETTINGS,
        width: 9,
        height: 7,
        preserveAspect: false,
        mode: "color" as const,
        ...patch,
      };
      const js = await convert(pixels, settings);
      const rust = await convert(
        pixels,
        settings,
        undefined,
        undefined,
        undefined,
        backend,
      );
      expect(rust.layers.map((layer) => layer.cells)).toEqual(
        js.layers.map((layer) => layer.cells),
      );
      expect([
        rust.width,
        rust.height,
        rust.cellWidth,
        rust.cellHeight,
      ]).toEqual([js.width, js.height, js.cellWidth, js.cellHeight]);
    }
  });
  it("rejects dimensions before entering WASM", async () => {
    const backend = await createWasmEngine(bytes);
    expect(() =>
      backend.sample(
        { width: 0, height: 1, data: new Uint8ClampedArray() },
        1,
        1,
      ),
    ).toThrow();
    expect(() => backend.gradients(new Float32Array(1), 2, 2)).toThrow();
  });
});
