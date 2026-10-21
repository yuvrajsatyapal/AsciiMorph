/** Conservative first-delivery limits, independent of the legacy converter. */
export const MIN_CHARACTER_CELL_DIMENSION = 1;
export const MAX_CHARACTER_CELL_DIMENSION = 512;
export const MAX_CHARACTER_CELLS = 60_000;
export const MAX_SOURCE_DIMENSION = 16_384;
export const DEFAULT_MEMORY_BUDGET_BYTES = 268_435_456;
export const TRANSPARENT_GLYPH_INDEX = 65_535;
export interface SourceRef {
  id: string;
  revision: number;
  width: number;
  height: number;
}
/** Decoded, EXIF-oriented sRGB pixels with straight alpha. */
export interface SourceUpload extends SourceRef {
  rgba: Uint8ClampedArray;
}
export interface GlyphCalibrationV1 {
  version: 1;
  id: string;
  fontKey: string;
  cellWidth: number;
  cellHeight: number;
  glyphs: string[];
  maskWidth: number;
  maskHeight: number;
  masks: Uint8Array;
  coverage: Float32Array;
  shapes: Float32Array;
}
export interface CharacterSettingsV1 {
  version: 1;
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  crop: { x: number; y: number; width: number; height: number };
  rotation: 0 | 90 | 180 | 270;
  brightness: number;
  contrast: number;
  gamma: number;
  saturation: number;
  density: number;
  sharpness: number;
  edge: number;
  shapeAware: boolean;
  smartEdges: boolean;
  mappingInvert: boolean;
  outputInvert: boolean;
  mode: "monochrome" | "grayscale" | "color";
  fg: number;
  bg: number | null;
  mapping: "glyph" | "braille";
  dither: "none" | "floyd-steinberg";
  seed: number;
}
export interface PackedGlyphGrid {
  version: 1;
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  calibrationId: string;
  glyphIndices: Uint16Array;
  foreground: Uint8Array;
  background: Uint8Array;
  alpha: Float32Array;
}
type RecordValue = Record<string, unknown>;
function fail(field: string): never {
  throw new Error(`Invalid ${field}`);
}
function object(value: unknown, keys: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("object");
  const result = value as RecordValue;
  const allowed = keys.split(" ");
  if (
    Reflect.ownKeys(result).some(
      (key) => typeof key !== "string" || !allowed.includes(key),
    ) ||
    allowed.some((key) => !Object.hasOwn(result, key))
  )
    fail("fields");
  return result;
}
function number(
  value: unknown,
  min: number,
  max: number,
  field: string,
  integer = false,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    fail(field);
  return value;
}
function text(value: unknown, field: string): void {
  if (typeof value !== "string" || !value.trim()) fail(field);
}
function dimensions(value: RecordValue, limit: number): number {
  const w = number(value.width, 1, limit, "width", true),
    h = number(value.height, 1, limit, "height", true);
  if (w > Math.floor(limit / h)) fail("cell count");
  return w * h;
}
function geometry(value: RecordValue): void {
  number(
    value.cellWidth,
    MIN_CHARACTER_CELL_DIMENSION,
    MAX_CHARACTER_CELL_DIMENSION,
    "cellWidth",
  );
  number(
    value.cellHeight,
    MIN_CHARACTER_CELL_DIMENSION,
    MAX_CHARACTER_CELL_DIMENSION,
    "cellHeight",
  );
}
function version(value: RecordValue): void {
  if (value.version !== 1) fail("version");
}
export function validateCharacterSettings(value: unknown): CharacterSettingsV1 {
  const s = object(
    value,
    "version width height cellWidth cellHeight crop rotation brightness contrast gamma saturation density sharpness edge shapeAware smartEdges mappingInvert outputInvert mode fg bg mapping dither seed",
  );
  version(s);
  dimensions(s, MAX_CHARACTER_CELLS);
  geometry(s);
  const c = object(s.crop, "x y width height");
  number(c.x, 0, 1, "crop.x");
  number(c.y, 0, 1, "crop.y");
  number(c.width, Number.MIN_VALUE, 1, "crop.width");
  number(c.height, Number.MIN_VALUE, 1, "crop.height");
  if (
    (c.x as number) + (c.width as number) > 1.000001 ||
    (c.y as number) + (c.height as number) > 1.000001
  )
    fail("crop");
  for (const [key, min, max] of [
    ["brightness", -100, 100],
    ["contrast", -100, 100],
    ["gamma", 0.1, 3],
    ["saturation", 0, 200],
    ["density", 0.25, 3],
    ["sharpness", 0, 100],
    ["edge", 0, 100],
  ] as const)
    number(s[key], min, max, key);
  for (const key of [
    "shapeAware",
    "smartEdges",
    "mappingInvert",
    "outputInvert",
  ])
    if (typeof s[key] !== "boolean") fail(key);
  if (![0, 90, 180, 270].includes(s.rotation as number)) fail("rotation");
  if (!["monochrome", "grayscale", "color"].includes(s.mode as string))
    fail("mode");
  if (!["glyph", "braille"].includes(s.mapping as string)) fail("mapping");
  if (!["none", "floyd-steinberg"].includes(s.dither as string)) fail("dither");
  number(s.fg, 0, 0xffffff, "fg", true);
  if (s.bg !== null) number(s.bg, 0, 0xffffff, "bg", true);
  number(s.seed, 0, 0xffffffff, "seed", true);
  return value as CharacterSettingsV1;
}
/** Checks retained-source bytes only. Session peak allocations require a separate preflight. */
export function validateSource(value: unknown, maxBytes: number): SourceUpload {
  number(maxBytes, 1, Number.MAX_SAFE_INTEGER, "maxBytes", true);
  const s = object(value, "id revision width height rgba");
  text(s.id, "id");
  number(s.revision, 0, Number.MAX_SAFE_INTEGER, "revision", true);
  const w = number(s.width, 1, MAX_SOURCE_DIMENSION, "width", true),
    h = number(s.height, 1, MAX_SOURCE_DIMENSION, "height", true);
  const bytes = w * h * 4;
  if (bytes > DEFAULT_MEMORY_BUDGET_BYTES || bytes > maxBytes)
    fail("source budget");
  if (!(s.rgba instanceof Uint8ClampedArray) || s.rgba.length !== bytes)
    fail("rgba");
  return value as SourceUpload;
}
export function validateGlyphCalibration(value: unknown): GlyphCalibrationV1 {
  const c = object(
    value,
    "version id fontKey cellWidth cellHeight glyphs maskWidth maskHeight masks coverage shapes",
  );
  version(c);
  text(c.id, "id");
  text(c.fontKey, "fontKey");
  geometry(c);
  if (!Array.isArray(c.glyphs) || c.glyphs.length < 2 || c.glyphs.length > 256)
    fail("glyphs");
  const seen = new Set<string>(),
    segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let units = 0;
  for (const glyph of c.glyphs) {
    if (
      typeof glyph !== "string" ||
      !glyph.length ||
      glyph.length > 64 ||
      /[\p{Cc}\p{Zl}\p{Zp}]/u.test(glyph) ||
      /^\p{M}/u.test(glyph) ||
      /^\p{Cf}+$/u.test(glyph) ||
      [...segmenter.segment(glyph)].length !== 1 ||
      seen.has(glyph)
    )
      fail("glyph");
    seen.add(glyph);
    units += glyph.length;
  }
  if (units > 512) fail("glyph input length");
  const w = number(c.maskWidth, 1, MAX_SOURCE_DIMENSION, "maskWidth", true),
    h = number(c.maskHeight, 1, MAX_SOURCE_DIMENSION, "maskHeight", true);
  const length = w * h * c.glyphs.length;
  if (
    length > DEFAULT_MEMORY_BUDGET_BYTES ||
    !(c.masks instanceof Uint8Array) ||
    c.masks.length !== length
  )
    fail("masks");
  for (const [key, length] of [
    ["coverage", c.glyphs.length],
    ["shapes", c.glyphs.length * 9],
  ] as const) {
    const array = c[key];
    if (!(array instanceof Float32Array) || array.length !== length) fail(key);
    for (const v of array) number(v, 0, 1, key);
  }
  return value as GlyphCalibrationV1;
}
/**
 * Foreground byte alpha equals rounded cell alpha; background alpha is independent.
 * Pass the dictionary to verify identity, geometry and indices. Without it, indices
 * are bounded to 0–255 (also Braille's implicit dictionary); empty ID is for Braille.
 */
export function validateGrid(
  grid: PackedGlyphGrid,
  calibration?: GlyphCalibrationV1,
): void {
  const g = object(
    grid,
    "version width height cellWidth cellHeight calibrationId glyphIndices foreground background alpha",
  );
  version(g);
  const cells = dimensions(g, MAX_CHARACTER_CELLS);
  geometry(g);
  if (typeof g.calibrationId !== "string") fail("calibrationId");
  let count = 256;
  if (calibration) {
    validateGlyphCalibration(calibration);
    count = calibration.glyphs.length;
    if (
      g.calibrationId !== calibration.id ||
      g.cellWidth !== calibration.cellWidth ||
      g.cellHeight !== calibration.cellHeight
    )
      fail("calibration identity");
  }
  if (
    !(g.glyphIndices instanceof Uint16Array) ||
    g.glyphIndices.length !== cells
  )
    fail("glyphIndices");
  if (!(g.alpha instanceof Float32Array) || g.alpha.length !== cells)
    fail("alpha");
  for (const key of ["foreground", "background"])
    if (!(g[key] instanceof Uint8Array) || g[key].length !== cells * 4)
      fail(key);
  const fg = g.foreground as Uint8Array;
  for (let i = 0; i < cells; i++) {
    const alpha = number(g.alpha[i], 0, 1, "alpha"),
      index = g.glyphIndices[i];
    if (index !== TRANSPARENT_GLYPH_INDEX && index >= count)
      fail("glyph index");
    if (
      (index === TRANSPARENT_GLYPH_INDEX) !== (alpha === 0) ||
      fg[i * 4 + 3] !== Math.round(alpha * 255)
    )
      fail("cell alpha");
  }
}
