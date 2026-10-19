import { describe, expect, it } from "vitest";
import {
  convert,
  luminance,
  gridDimensions,
  tone,
  densityCharacter,
} from "./engine";
import { DEFAULT_SETTINGS } from "./settings";
import { characterSet, PRESETS } from "./presets";
import { parseDocument, serializeDocument } from "@/core/document";
const image = (values: number[], width = values.length, height = 1) => ({
  width,
  height,
  data: new Uint8ClampedArray(values.flatMap((v) => [v, v, v, 255])),
});
const settings = {
  ...DEFAULT_SETTINGS,
  width: 3,
  height: 1,
  preserveAspect: false,
  charset: "custom",
  custom: " @",
};
describe("conversion math and limits", () => {
  it("uses Rec.709 luminance", () => {
    expect(luminance(255, 0, 0)).toBeCloseTo(54.213);
    expect(luminance(0, 255, 0)).toBeCloseTo(182.376);
    expect(luminance(255, 255, 255)).toBeCloseTo(255);
  });
  it("corrects cell aspect and caps rows and total area", () => {
    expect(gridDimensions(400, 200, DEFAULT_SETTINGS)).toEqual({
      width: 80,
      height: 20,
    });
    expect(
      gridDimensions(1, 8192, { ...DEFAULT_SETTINGS, width: 300 }),
    ).toEqual({ width: 1, height: 300 });
    expect(
      gridDimensions(10, 10, { ...settings, width: 300, height: 300 }).width *
        gridDimensions(10, 10, { ...settings, width: 300, height: 300 }).height,
    ).toBeLessThanOrEqual(60000);
  });
  it("adjusts brightness, contrast and gamma with predictable endpoints", () => {
    expect(tone(100, { ...DEFAULT_SETTINGS, brightness: 20 })).toBeCloseTo(151);
    expect(tone(64, { ...DEFAULT_SETTINGS, gamma: 2 })).toBeGreaterThan(120);
    expect(tone(64, { ...DEFAULT_SETTINGS, contrast: 100 })).toBe(0);
  });
  it("maps ordered coverage and density deterministically", () => {
    expect(densityCharacter(0, [" ", "@"], 1)).toBe(" ");
    expect(densityCharacter(255, [" ", "@"], 1)).toBe("@");
    expect(densityCharacter(120, [" ", ".", "@"], 2)).toBe(" ");
  });
  it("validates sets and exposes all extensible presets", () => {
    expect(PRESETS).toHaveLength(10);
    expect(characterSet("custom", "..@ @")).toEqual([".", "@", " "]);
    for (const bad of ["", "\n", "x\tx", "x".repeat(300)])
      expect(() => characterSet("custom", bad)).toThrow();
    expect(() => characterSet("missing", "")).toThrow();
  });
  it("rejects malformed input and unsafe settings", async () => {
    for (const bad of [
      image([], 0, 1),
      { ...image([0]), data: new Uint8ClampedArray(3) },
      image([0], NaN, 1),
    ])
      await expect(convert(bad, settings)).rejects.toThrow();
    for (const patch of [
      { width: NaN },
      { gamma: 0 },
      { cellHeight: Infinity },
      { width: 301 },
      { fg: "red" },
    ])
      await expect(
        convert(image([0]), { ...settings, ...patch }),
      ).rejects.toThrow();
  });
});
describe("editable output", () => {
  it("samples, inverts, preserves metrics and serializes", async () => {
    const a = await convert(image([0, 128, 255]), settings);
    expect(a.layers[0].cells.map((c) => c.char)).toEqual([" ", "@", "@"]);
    const b = await convert(image([0, 128, 255]), {
      ...settings,
      invert: true,
      cellWidth: 11,
      cellHeight: 22,
    });
    expect(b.layers[0].cells.map((c) => c.char)).toEqual(["@", " ", " "]);
    expect(b.cellWidth).toBe(11);
    expect(parseDocument(serializeDocument(b))).toEqual(b);
  });
  it("preserves source alpha without painting transparent pixels", async () => {
    const im = image([255, 255, 255]);
    im.data[3] = 0;
    im.data[7] = 128;
    const d = await convert(im, settings);
    expect(d.layers[0].cells[0]).toMatchObject({
      char: " ",
      alpha: 0,
      bg: null,
    });
    expect(d.layers[0].cells[1].alpha).toBeCloseTo(128 / 255);
  });
  it("supports monochrome, grayscale, full color and saturation", async () => {
    const im = {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255]),
    };
    const s = { ...settings, width: 1 };
    expect(
      (await convert(im, { ...s, mode: "color" })).layers[0].cells[0].fg,
    ).toBe("#ff0000");
    const gray = (await convert(im, { ...s, mode: "grayscale" })).layers[0]
      .cells[0].fg;
    expect(gray.slice(1, 3)).toBe(gray.slice(3, 5));
    expect(
      (await convert(im, { ...s, mode: "color", saturation: 0 })).layers[0]
        .cells[0].fg,
    ).toBe(gray);
    expect(
      (await convert(im, { ...s, fg: "#123456", bg: "#654321" })).layers[0]
        .cells[0],
    ).toMatchObject({ fg: "#123456", bg: "#654321" });
  });
  it("uses real Braille subpixel bit positions", async () => {
    const im = image([255, 0, 0, 0, 0, 0, 0, 0], 2, 4);
    const d = await convert(im, { ...settings, width: 1, charset: "braille" });
    expect(d.layers[0].cells[0].char).toBe("⠁");
  });
  it("diffuses quantization error across cells", async () => {
    const im = image(Array(12).fill(100));
    const plain = await convert(im, { ...settings, width: 12 });
    const dith = await convert(im, { ...settings, width: 12, dithering: true });
    expect(dith.layers[0].cells.map((c) => c.char)).not.toEqual(
      plain.layers[0].cells.map((c) => c.char),
    );
  });
  it("detects edges and sharpens a soft transition", async () => {
    const im = image([0, 80, 120, 80, 255], 5);
    const s = { ...settings, width: 5, custom: " .:-=+*#%@" };
    const base = (await convert(im, s)).layers[0].cells;
    expect(
      (await convert(im, { ...s, edge: 100 })).layers[0].cells,
    ).not.toEqual(base);
    expect(
      (await convert(im, { ...s, sharpness: 100 })).layers[0].cells,
    ).not.toEqual(base);
  });
  it("aborts cooperatively before publishing results", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      convert(image([0]), settings, ac.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    const next = new AbortController();
    await expect(
      convert(
        image(Array(100).fill(128), 10, 10),
        { ...settings, width: 10, height: 10 },
        next.signal,
        async () => {
          next.abort();
        },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
it("rejects oversized individual graphemes before shared document handoff", () => {
  expect(() => characterSet("custom", " " + "a" + "\u0301".repeat(64))).toThrow(
    /character/i,
  );
});
it("uses measured nonuniform glyph coverage", () => {
  expect(densityCharacter(100, [" ", ".", "@"], 1, [0, 0.1, 1])).toBe(".");
});
it("diffuses error in density-adjusted luminance space", async () => {
  const doc = await convert(image([160, 160, 160, 160]), {
    ...settings,
    width: 4,
    density: 2,
    dithering: true,
  });
  expect(doc.layers[0].cells.map((c) => c.char).join("")).toBe(" @  ");
});
