// @vitest-environment node
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { createCharacterEngine } from "./wasm-character";
import { STYLE_CONTEXT_DEFAULTS as d } from "./style-context";
it("Characters inversion changes only selected glyphs, seeded random is reproducible, and default context preserves the glyph grid", async () => {
  const e = await createCharacterEngine(
    readFileSync("public/wasm/asciimorph_engine.wasm"),
  );
  const source = { id: "ctx", revision: 1, width: 17, height: 13 };
  try {
    const rgba = new Uint8ClampedArray(17 * 13 * 4);
    for (let i = 0; i < rgba.length; i += 4)
      rgba.set([(i * 7) % 256, (i * 3) % 256, (i * 11) % 256, 255], i);
    e.setSource({ ...source, rgba });
    e.setAtlas({
      version: 1,
      originX: 0,
      originY: 0,
      spaceIndexOr65535: 65535,
      placement: "top-start-ltr",
      ordering: "input",
      fontPolicy: "reference-system-monospace",
      calibration: {
        version: 1,
        id: "atlas",
        fontKey: "ctx",
        glyphs: ["#", "."],
        cellWidth: 0.6 * 3,
        cellHeight: 3,
        maskWidth: 2,
        maskHeight: 3,
        masks: new Uint8Array([
          255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 255, 0,
        ]),
        coverage: new Float32Array([1, 1 / 6]),
        shapes: new Float32Array(18),
      },
    });
    const settings = {
      version: 1 as const,
      frameWidth: 17,
      frameHeight: 13,
      fontSize: 3,
      renderScale: 1 as const,
      brightness: 0,
      contrast: 20,
      rotation: 0 as const,
      crop: { x: 0, y: 0, width: 1, height: 1 },
      backdrop: "blur" as const,
    };
    const run = (c?: typeof d) => {
      const id = e.beginCharacters({
        ...settings,
        ...(c ? { styleContext: c } : {}),
      });
      while (e.step(id, 1) === "pending") {}
      return e.takeFrame(id);
    };
    const baseline = run(),
      extended = run({ ...d });
    // Corrected Canvas byte composition supersedes the legacy floating-point
    // backdrop blend. Glyph selection and tone must remain unchanged.
    expect(extended.grid).toEqual(baseline.grid);
    const normal = run({ ...d, backdrop: "none" }),
      inverted = run({ ...d, backdrop: "none", invert: true });
    expect(inverted.grid!.foreground).toEqual(normal.grid!.foreground);
    expect(inverted.grid!.glyphIndices).not.toEqual(normal.grid!.glyphIndices);
    const random = run({ ...d, random: true, seed: 43 });
    expect(run({ ...d, random: true, seed: 43 }).rgba).toEqual(random.rgba);
    expect(run({ ...d, random: true, seed: 44 }).rgba).not.toEqual(random.rgba);
    const transparent = run({ ...d, backdrop: "none", coverage: 0 });
    expect(transparent.rgba.every((v) => v === 0)).toBe(true);
    expect(transparent.grid!.glyphIndices.every((v) => v === 65535)).toBe(true);
    for (const softness of [0, 60]) {
      const a = run({ ...d, softness });
      expect(a.rgba).not.toEqual(baseline.rgba);
    }
  } finally {
    e.dispose();
  }
});
