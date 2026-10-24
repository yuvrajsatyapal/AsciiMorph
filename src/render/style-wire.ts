import type { SourceRef } from "./character-contract";
import {
  validateReferenceCharacterAtlas,
  type ReferenceCharacterAtlasV1,
} from "./reference-characters";
import {
  STYLE_DISPATCH_IDS,
  validateStyleSettings,
  type StyleSettingsV1,
} from "./style-contract";
import {
  FAMILY_PAYLOAD_BYTES,
  readFamilyPayload,
  writeFamilyPayload,
  type FamilyId,
} from "./catalog/family-codecs";
const HEADER = 112,
  MAGIC = 0x31595453;
function atlasFields(
  s: StyleSettingsV1,
  atlas?: ReferenceCharacterAtlasV1,
): [number, number, number, number] {
  if (s.styleId !== "braille") {
    if (atlas) throw new Error("Unexpected style atlas");
    return [0, 0, 0, 65535];
  }
  const a = validateReferenceCharacterAtlas(atlas),
    c = a.calibration;
  if (
    c.glyphs.length !== 256 ||
    c.glyphs.some((g, i) => g !== String.fromCodePoint(0x2800 + i)) ||
    a.spaceIndexOr65535 !== 65535 ||
    c.cellWidth !== 0.6 * s.parameters.fontSize * s.renderScale ||
    c.cellHeight !== s.parameters.fontSize * s.renderScale
  )
    throw new Error("Invalid Braille atlas dictionary/geometry");
  const stride = c.maskWidth * c.maskHeight;
  if (
    c.masks.subarray(0, stride).some((v) => v !== 0) ||
    !c.masks.subarray(255 * stride, 256 * stride).some((v) => v !== 0)
  )
    throw new Error("Invalid Braille blank/full masks");
  return [256, a.originX, a.originY, 65535];
}
export function encodeStyleSettings(
  settings: StyleSettingsV1,
  source: SourceRef,
  atlas?: ReferenceCharacterAtlasV1,
): Uint8Array {
  const s = validateStyleSettings(settings, source),
    [count, x, y, space] = atlasFields(s, atlas);
  const bytes = new Uint8Array(HEADER + FAMILY_PAYLOAD_BYTES[s.styleId]),
    v = new DataView(bytes.buffer);
  for (const [offset, value] of [
    [0, MAGIC],
    [4, 1],
    [8, STYLE_DISPATCH_IDS[s.styleId]],
    [12, 1],
    [16, s.frameWidth],
    [20, s.frameHeight],
    [24, s.renderScale],
    [28, s.rotation],
    [32, s.seed],
    [36, count],
    [80, FAMILY_PAYLOAD_BYTES[s.styleId]],
    [104, space],
  ])
    v.setUint32(offset, value, true);
  for (const [offset, value] of [
    [40, s.timeUs],
    [48, s.crop.x],
    [56, s.crop.y],
    [64, s.crop.width],
    [72, s.crop.height],
    [88, x],
    [96, y],
  ])
    v.setFloat64(offset, value, true);
  writeFamilyPayload(v, HEADER, s.styleId, s.parameters);
  return bytes;
}
export function decodeStyleSettings(
  bytes: Uint8Array,
  source: SourceRef,
  atlas?: ReferenceCharacterAtlasV1,
): StyleSettingsV1 {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < HEADER)
    throw new Error("Invalid style packet");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    u = (o: number) => v.getUint32(o, true),
    f = (o: number) => v.getFloat64(o, true);
  const id = (
    { 4: "braille", 10: "pixel", 11: "mosaic" } as Record<number, FamilyId>
  )[u(8)];
  if (
    u(0) !== MAGIC ||
    u(4) !== 1 ||
    u(12) !== 1 ||
    u(84) !== 0 ||
    u(108) !== 0 ||
    !id ||
    u(80) !== FAMILY_PAYLOAD_BYTES[id] ||
    bytes.byteLength !== HEADER + u(80)
  )
    throw new Error("Invalid style packet header");
  const s = validateStyleSettings(
    {
      version: 1,
      styleId: id,
      frameWidth: u(16),
      frameHeight: u(20),
      renderScale: u(24),
      rotation: u(28),
      seed: u(32),
      timeUs: f(40),
      crop: { x: f(48), y: f(56), width: f(64), height: f(72) },
      parameters: readFamilyPayload(v, HEADER, id),
    },
    source,
  );
  const expected = atlasFields(s, atlas);
  if ([u(36), f(88), f(96), u(104)].some((n, i) => n !== expected[i]))
    throw new Error("Invalid style atlas header");
  return s;
}
