import { expect, it } from "vitest";
import { convert, transformPixels } from "./engine";
import { DEFAULT_SETTINGS, validateSettings } from "./settings";
const source = {
  width: 2,
  height: 2,
  data: new Uint8ClampedArray([
    10, 0, 0, 255, 20, 0, 0, 255, 30, 0, 0, 255, 40, 0, 0, 255,
  ]),
};
it("crops normalized coordinates before each clockwise rotation", () => {
  const values = (rotation: 0 | 90 | 180 | 270) =>
    Array.from(
      transformPixels(source, { ...DEFAULT_SETTINGS, rotation }).data,
    ).filter((_, i) => i % 4 === 0);
  expect(values(0)).toEqual([10, 20, 30, 40]);
  expect(values(90)).toEqual([30, 10, 40, 20]);
  expect(values(180)).toEqual([40, 30, 20, 10]);
  expect(values(270)).toEqual([20, 40, 10, 30]);
  expect(
    transformPixels(source, {
      ...DEFAULT_SETTINGS,
      crop: { x: 0.5, y: 0, width: 0.5, height: 1 },
      rotation: 90,
    }),
  ).toMatchObject({ width: 2, height: 1 });
  expect(() =>
    validateSettings({
      ...DEFAULT_SETTINGS,
      crop: { x: 0.9, y: 0, width: 0.5, height: 1 },
    }),
  ).toThrow(/crop/);
});
it("uses glyph spatial signatures to distinguish shapes with equal coverage", async () => {
  const pixels = {
    width: 3,
    height: 3,
    data: new Uint8ClampedArray(
      [0, 255, 0, 0, 255, 0, 0, 255, 0].flatMap((v) => [v, v, v, 255]),
    ),
  };
  const settings = {
    ...DEFAULT_SETTINGS,
    width: 1,
    height: 1,
    preserveAspect: false,
    charset: "custom",
    custom: " -|",
    shapeAware: true,
  };
  const doc = await convert(pixels, settings, undefined, undefined, {
    chars: [" ", "-", "|"],
    coverage: [0, 0.33, 0.33],
    shapes: [
      Array(9).fill(0),
      [0, 0, 0, 1, 1, 1, 0, 0, 0],
      [0, 1, 0, 0, 1, 0, 0, 1, 0],
    ],
  });
  expect(doc.layers[0].cells[0].char).toBe("|");
});
