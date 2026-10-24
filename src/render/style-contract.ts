import { MAX_BACKING_PIXELS, MAX_BACKING_SIDE } from "@/core/render";
import {
  DEFAULT_MEMORY_BUDGET_BYTES,
  MAX_SOURCE_DIMENSION,
  type SourceRef,
} from "./character-contract";
import type { FamilyId, FamilyParameters } from "./catalog/family-codecs";
export const STYLE_DISPATCH_IDS = Object.freeze({
  characters: 1,
  mixed: 2,
  "block-chars": 3,
  braille: 4,
  dots: 5,
  cross: 6,
  diamond: 7,
  lines: 8,
  diagonal: 9,
  pixel: 10,
  mosaic: 11,
  lego: 12,
  "3d": 13,
  disco: 14,
  dither: 15,
});
export interface StyleSettingsV1 {
  version: 1;
  styleId: FamilyId;
  frameWidth: number;
  frameHeight: number;
  renderScale: 1 | 2 | 3 | 4;
  crop: { x: number; y: number; width: number; height: number };
  rotation: 0 | 90 | 180 | 270;
  seed: number;
  timeUs: number;
  parameters: FamilyParameters;
}
export interface RgbaFrameV1 {
  version: 1;
  width: number;
  height: number;
  rgba: Uint8Array;
}
export function styleObject(
  value: unknown,
  keys: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid style object");
  const expected = keys.split(" "),
    own = Reflect.ownKeys(value);
  if (
    own.length !== expected.length ||
    own.some((k) => typeof k !== "string" || !expected.includes(k))
  )
    throw new Error("Invalid style keys");
  const result: Record<string, unknown> = {};
  for (const k of expected) {
    const d = Object.getOwnPropertyDescriptor(value, k);
    if (!d || !("value" in d)) throw new Error("Invalid style accessor");
    result[k] = d.value;
  }
  return result;
}
export function styleNumber(
  v: unknown,
  min: number,
  max: number,
  integer = false,
): number {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    v < min ||
    v > max ||
    (integer && !Number.isInteger(v))
  )
    throw new Error("Invalid style number");
  return v;
}
/** Detached values, with exact crop-before-rotation source geometry; not runtime admission. */
export function validateStyleSettings(
  value: unknown,
  source: SourceRef,
): StyleSettingsV1 {
  const o = styleObject(
    value,
    "version styleId frameWidth frameHeight renderScale crop rotation seed timeUs parameters",
  );
  if (
    o.version !== 1 ||
    !["braille", "pixel", "mosaic"].includes(o.styleId as string)
  )
    throw new Error("Unsupported style profile");
  const id = o.styleId as FamilyId;
  const src = styleObject(source, "id revision width height");
  if (typeof src.id !== "string" || !src.id.trim())
    throw new Error("Invalid style source id");
  styleNumber(src.revision, 0, Number.MAX_SAFE_INTEGER, true);
  const sw = styleNumber(src.width, 1, MAX_SOURCE_DIMENSION, true),
    sh = styleNumber(src.height, 1, MAX_SOURCE_DIMENSION, true);
  if (sw * sh * 4 > DEFAULT_MEMORY_BUDGET_BYTES)
    throw new Error("Style source budget");
  const w = styleNumber(o.frameWidth, 1, MAX_BACKING_SIDE, true),
    h = styleNumber(o.frameHeight, 1, MAX_BACKING_SIDE, true);
  if (w * h > MAX_BACKING_PIXELS) throw new Error("Style frame overflow");
  if (
    ![1, 2, 3, 4].includes(o.renderScale as number) ||
    ![0, 90, 180, 270].includes(o.rotation as number)
  )
    throw new Error("Invalid style geometry");
  const scale = o.renderScale as StyleSettingsV1["renderScale"],
    rotation = o.rotation as StyleSettingsV1["rotation"];
  const c = styleObject(o.crop, "x y width height");
  const crop = {
    x: styleNumber(c.x, 0, 1),
    y: styleNumber(c.y, 0, 1),
    width: styleNumber(c.width, Number.MIN_VALUE, 1),
    height: styleNumber(c.height, Number.MIN_VALUE, 1),
  };
  if (crop.x + crop.width > 1 || crop.y + crop.height > 1)
    throw new Error("Invalid style crop");
  const cw =
      Math.min(sw, Math.ceil((crop.x + crop.width) * sw)) -
      Math.floor(crop.x * sw),
    ch =
      Math.min(sh, Math.ceil((crop.y + crop.height) * sh)) -
      Math.floor(crop.y * sh);
  const swap = rotation === 90 || rotation === 270;
  if (
    cw <= 0 ||
    ch <= 0 ||
    w !== (swap ? ch : cw) * scale ||
    h !== (swap ? cw : ch) * scale
  )
    throw new Error("Invalid style source-derived frame");
  const p = styleObject(
    o.parameters,
    "fontSize brightness contrast invert charOpacity" +
      (id === "braille"
        ? " brailleThreshold"
        : id === "mosaic"
          ? " mosaicShape"
          : ""),
  );
  if (typeof p.invert !== "boolean") throw new Error("Invalid style invert");
  const parameters: FamilyParameters = {
    fontSize: styleNumber(p.fontSize, 3, 80, true),
    brightness: styleNumber(p.brightness, -100, 100),
    contrast: styleNumber(p.contrast, -100, 100),
    invert: p.invert,
    charOpacity: styleNumber(p.charOpacity, 0, 100),
  };
  if (id === "braille")
    parameters.brailleThreshold = styleNumber(p.brailleThreshold, 0, 100);
  if (id === "mosaic") {
    if (!["square", "wide", "tall"].includes(p.mosaicShape as string))
      throw new Error("Invalid style mosaicShape");
    parameters.mosaicShape = p.mosaicShape as FamilyParameters["mosaicShape"];
  }
  return {
    version: 1,
    styleId: id,
    frameWidth: w,
    frameHeight: h,
    renderScale: scale,
    crop,
    rotation,
    seed: styleNumber(o.seed, 0, 0xffffffff, true),
    timeUs: styleNumber(o.timeUs, 0, Number.MAX_SAFE_INTEGER, true),
    parameters,
  };
}
export function validateStyleFrame(
  value: unknown,
  settings: StyleSettingsV1,
): RgbaFrameV1 {
  const o = styleObject(value, "version width height rgba");
  const w = styleNumber(o.width, 1, MAX_BACKING_SIDE, true),
    h = styleNumber(o.height, 1, MAX_BACKING_SIDE, true);
  if (
    o.version !== 1 ||
    w * h > MAX_BACKING_PIXELS ||
    w !== settings.frameWidth ||
    h !== settings.frameHeight ||
    !(o.rgba instanceof Uint8Array) ||
    o.rgba.byteLength !== w * h * 4 ||
    o.rgba.buffer.byteLength > DEFAULT_MEMORY_BUDGET_BYTES
  )
    throw new Error("Invalid style frame");
  return value as RgbaFrameV1;
}
