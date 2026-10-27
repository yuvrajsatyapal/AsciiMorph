// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createCharacterEngine } from "./wasm-character";
import { validateStyleSettings } from "./style-contract";
import type { ReferenceCharacterAtlasV1 } from "./reference-characters";
import fixtures from "../../tests/fixtures/render/styles/wire-v1.json";
function atlas(scale = 1): ReferenceCharacterAtlasV1 {
  return {
    version: 1,
    originX: 0,
    originY: 0,
    placement: "top-start-ltr",
    ordering: "input",
    fontPolicy: "verified-family",
    spaceIndexOr65535: 65535,
    calibration: {
      version: 1,
      id: `braille-${scale}`,
      fontKey: "fixture",
      cellWidth: 6.6 * scale,
      cellHeight: 11 * scale,
      glyphs: Array.from({ length: 256 }, (_, i) =>
        String.fromCodePoint(0x2800 + i),
      ),
      maskWidth: 1,
      maskHeight: 1,
      masks: Uint8Array.from({ length: 256 }, (_, i) => (i ? 255 : 0)),
      coverage: Float32Array.from({ length: 256 }, (_, i) => (i ? 1 : 0)),
      shapes: new Float32Array(256 * 9),
    },
  };
}
it("reads real native Braille preview/export, thumbnail, atlas capture and release", async () => {
  const e = await createCharacterEngine(
    readFileSync("public/wasm/asciimorph_engine.wasm"),
  );
  const source = {
    id: "braille",
    revision: 1,
    width: 17,
    height: 13,
    rgba: new Uint8ClampedArray(0),
  };
  source.rgba = new Uint8ClampedArray(
    Array.from({ length: 17 * 13 }, () => [128, 128, 128, 255]).flat(),
  );
  try {
    expect(e.supportsStyle(4)).toBe(true);
    e.setSource(source);
    for (const scale of [1, 2] as const) {
      e.setAtlas(atlas(scale));
      const settings = validateStyleSettings(
        {
          ...fixtures.cases[2].settings,
          frameWidth: 17 * scale,
          frameHeight: 13 * scale,
          renderScale: scale,
          parameters: {
            fontSize: 11,
            brightness: 0,
            contrast: 20,
            invert: false,
            charOpacity: 100,
            brailleThreshold: 50,
          },
        },
        {
          id: source.id,
          revision: source.revision,
          width: source.width,
          height: source.height,
        },
      );
      const id = e.beginStyle(settings);
      while (e.step(id, 7) === "pending") {}
      const frame = e.takeStyleFrame(id);
      expect([frame.width, frame.height]).toEqual([17 * scale, 13 * scale]);
      expect(
        frame.rgba.every((v, i) => v === [128, 128, 128, 255][i % 4]),
      ).toBe(true);
      expect(() => e.takeStyleFrame(id)).toThrow();
      const thumbnail = e.beginStyle(settings);
      while (e.step(thumbnail, 4096) === "pending") {}
      e.beginThumbnail(thumbnail, 8);
      while (e.step(thumbnail, 1) === "pending") {}
      const image = e.takeThumbnail(thumbnail);
      expect([image.width, image.height]).toEqual([8, 6]);
      expect(
        image.rgba.every((v, i) => v === [128, 128, 128, 255][i % 4]),
      ).toBe(true);
      const cancelled = e.beginStyle(settings);
      e.cancel(cancelled);
      expect(() => e.takeStyleFrame(cancelled)).toThrow();
    }
  } finally {
    e.dispose();
  }
});
it("readback selects spatial Braille glyphs for equal-mean sources", async () => {
  const e = await createCharacterEngine(
    readFileSync("public/wasm/asciimorph_engine.wasm"),
  );
  try {
    const a = atlas();
    a.calibration.cellWidth = 12;
    a.calibration.cellHeight = 20;
    a.calibration.maskWidth = 8;
    a.calibration.masks = Uint8Array.from({ length: 256 * 8 }, (_, i) =>
      (i >> 3) & (1 << i % 8) ? 255 : 0,
    );
    a.calibration.coverage = Float32Array.from(
      { length: 256 },
      (_, g) =>
        Array.from({ length: 8 }, (_, b) => (g >> b) & 1).reduce(
          (x, y) => x + y,
          0,
        ) / 8,
    );
    e.setAtlas(a);
    const outputs: Uint8Array[] = [];
    for (const pattern of [1, 8, 0, 255]) {
      const source = {
        id: "spatial",
        revision: pattern + 1,
        width: 12,
        height: 20,
      };
      const rgba = new Uint8ClampedArray(12 * 20 * 4);
      for (let y = 0; y < 20; y++)
        for (let x = 0; x < 12; x++) {
          const bit = [1, 8, 2, 16, 4, 32, 64, 128][
            Math.floor(y / 5) * 2 + Math.floor(x / 6)
          ];
          const i = (y * 12 + x) * 4;
          rgba.set(
            [
              pattern & bit ? 128 : 0,
              pattern & bit ? 128 : 0,
              pattern & bit ? 128 : 0,
              255,
            ],
            i,
          );
        }
      e.setSource({ ...source, rgba });
      const rendered = [];
      for (const opacity of [0, 100]) {
        const s = validateStyleSettings(
          {
            ...fixtures.cases[2].settings,
            frameWidth: 12,
            frameHeight: 20,
            parameters: {
              fontSize: 20,
              brightness: 30,
              contrast: 0,
              invert: false,
              charOpacity: opacity,
              brailleThreshold: 50,
            },
          },
          source,
        );
        const id = e.beginStyle(s);
        while (e.step(id, 3) === "pending") {}
        rendered.push(e.takeStyleFrame(id).rgba);
      }
      for (let bit = 0; bit < 8; bit++)
        expect(rendered[1][bit * 4] > rendered[0][bit * 4]).toBe(
          Boolean(pattern & (1 << bit)),
        );
      outputs.push(rendered[1]);
    }
    expect(outputs[0]).not.toEqual(outputs[1]);
  } finally {
    e.dispose();
  }
});
