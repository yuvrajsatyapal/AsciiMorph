import { describe, expect, it } from "vitest";
import {
  validateCharacterSettings,
  validateSource,
  validateGrid,
  validateGlyphCalibration,
  type CharacterSettingsV1,
  type PackedGlyphGrid,
  type GlyphCalibrationV1,
} from "./character-contract";
const settings = (): CharacterSettingsV1 => ({
  version: 1,
  width: 2,
  height: 1,
  cellWidth: 9,
  cellHeight: 18,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  rotation: 0,
  brightness: 0,
  contrast: 0,
  gamma: 1,
  saturation: 100,
  density: 1,
  sharpness: 0,
  edge: 0,
  shapeAware: false,
  smartEdges: false,
  mappingInvert: false,
  outputInvert: false,
  mode: "color",
  fg: 0xffffff,
  bg: null,
  mapping: "glyph",
  dither: "none",
  seed: 0,
});
const calibration = (): GlyphCalibrationV1 => ({
  version: 1,
  id: "font-a",
  fontKey: "mono",
  cellWidth: 9,
  cellHeight: 18,
  glyphs: [" ", "é"],
  maskWidth: 1,
  maskHeight: 1,
  masks: new Uint8Array([0, 255]),
  coverage: new Float32Array([0, 1]),
  shapes: new Float32Array(18),
});
const grid = (): PackedGlyphGrid => ({
  version: 1,
  width: 2,
  height: 1,
  cellWidth: 9,
  cellHeight: 18,
  calibrationId: "font-a",
  glyphIndices: new Uint16Array([1, 65535]),
  foreground: new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0]),
  background: new Uint8Array(8),
  alpha: new Float32Array([1, 0]),
});
describe("packed character boundary", () => {
  it("rejects_nonfinite_and_unknown_versions", () => {
    expect(validateCharacterSettings(settings())).toEqual(settings());
    for (const patch of [
      { gamma: NaN },
      { version: 2 },
      { extra: true },
      { seed: -1 },
      { seed: 2 ** 32 },
      { fg: Infinity },
      { shapeAware: 1 },
      { crop: { x: 0, y: 0, width: 1, height: 1, extra: true } },
    ])
      expect(() =>
        validateCharacterSettings({ ...settings(), ...patch }),
      ).toThrow();
  });
  it("rejects_short_rgba_and_over_budget_source", () => {
    const source = {
      id: "source",
      revision: 0,
      width: 2,
      height: 1,
      rgba: new Uint8ClampedArray(8),
    };
    expect(validateSource(source, 8)).toBe(source);
    for (const value of [
      { ...source, rgba: new Uint8ClampedArray(7) },
      { ...source, rgba: new Uint8Array(8) },
      { ...source, width: 16385 },
      { ...source, revision: 0.5 },
      { ...source, width: Number.MAX_SAFE_INTEGER },
      { ...source, extra: 1 },
    ])
      expect(() => validateSource(value, 100)).toThrow();
    expect(() => validateSource(source, 7)).toThrow();
    expect(() => validateSource(source, NaN)).toThrow();
  });
  it("checks_packed_lengths_and_sentinel", () => {
    expect(() => validateGrid(grid(), calibration())).not.toThrow();
    for (const patch of [
      { alpha: new Float32Array(1) },
      { alpha: new Float32Array([NaN, 0]) },
      { alpha: new Float32Array([1.1, 0]) },
      { foreground: new Uint8Array(7) },
      { glyphIndices: new Uint16Array([256, 65535]) },
      { glyphIndices: new Uint16Array([1, 2]) },
      { alpha: new Float32Array([1, 1]) },
      { version: 2 },
      { extra: 1 },
    ])
      expect(() =>
        validateGrid({ ...grid(), ...patch } as PackedGlyphGrid),
      ).toThrow();
    expect(() =>
      validateGrid({ ...grid(), calibrationId: "other" }, calibration()),
    ).toThrow();
    expect(() =>
      validateGrid(
        { ...grid(), glyphIndices: new Uint16Array([2, 65535]) },
        calibration(),
      ),
    ).toThrow();
  });
  it("rejects_cell_overflow", () => {
    expect(() =>
      validateCharacterSettings({ ...settings(), width: 300, height: 200 }),
    ).not.toThrow();
    expect(() =>
      validateCharacterSettings({ ...settings(), width: 60001, height: 1 }),
    ).toThrow();
    expect(() =>
      validateCharacterSettings({
        ...settings(),
        width: Number.MAX_SAFE_INTEGER,
        height: 2,
      }),
    ).toThrow();
  });
  it("validates calibration graphemes and measured buffers", () => {
    expect(validateGlyphCalibration(calibration())).toEqual(calibration());
    for (const patch of [
      { glyphs: ["a", "a"] },
      { glyphs: ["a", "ab"] },
      { glyphs: ["a", "\n"] },
      { glyphs: ["a", "́"] },
      { glyphs: ["a"] },
      { masks: new Uint8Array(1) },
      { coverage: new Float32Array([0, NaN]) },
      { shapes: new Float32Array(17) },
      { extra: 1 },
    ])
      expect(() =>
        validateGlyphCalibration({ ...calibration(), ...patch }),
      ).toThrow();
  });
});

it("preserves finite logical geometry independently of mask extents", () => {
  for (const [cellWidth, cellHeight] of [
    [1, 1],
    [1.8, 3],
    [6.6, 11],
    [192, 320],
    [512, 512],
  ]) {
    const geometry = { cellWidth, cellHeight };
    expect(
      validateCharacterSettings({ ...settings(), ...geometry }).cellWidth,
    ).toBe(cellWidth);
    const c = { ...calibration(), ...geometry };
    expect(validateGlyphCalibration(c).maskWidth).toBe(1);
    expect(() => validateGrid({ ...grid(), ...geometry }, c)).not.toThrow();
  }
  for (const value of [0, -1, 0.999, 512.001, NaN, Infinity, -Infinity]) {
    for (const field of ["cellWidth", "cellHeight"]) {
      expect(() =>
        validateCharacterSettings({ ...settings(), [field]: value }),
      ).toThrow();
      expect(() =>
        validateGlyphCalibration({ ...calibration(), [field]: value }),
      ).toThrow();
      expect(() => validateGrid({ ...grid(), [field]: value })).toThrow();
    }
  }
});
