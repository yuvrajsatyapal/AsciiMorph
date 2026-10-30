/** Separate profile v1 wire format. No legacy settings fields are reinterpreted. */
import type { SourceRef, PackedGlyphGrid } from "./character-contract";
import {
  validateReferenceCharacterAtlas,
  validateReferenceCharactersSettings,
  validateReferenceCharactersFrame,
  type ReferenceCharacterAtlasV1,
  type ReferenceCharactersSettingsV1,
  type ReferenceCharactersFrameV1,
} from "./reference-characters";
export function encodeCharactersSettings(
  settings: ReferenceCharactersSettingsV1,
  atlas: ReferenceCharacterAtlasV1,
  source: SourceRef,
): Uint8Array {
  const s = validateReferenceCharactersSettings(settings, source),
    a = validateReferenceCharacterAtlas(atlas),
    b = new Uint8Array(112),
    v = new DataView(b.buffer);
  [
    1,
    s.frameWidth,
    s.frameHeight,
    s.rotation,
    a.calibration.glyphs.length,
    ["none", "solid", "blur"].indexOf(s.backdrop),
    a.softwareWebglBatch && s.styleContext ? 1 : 0,
    a.spaceIndexOr65535,
  ].forEach((n, i) => v.setUint32(i * 4, n, true));
  [
    s.fontSize,
    s.renderScale,
    s.brightness,
    s.contrast,
    s.crop.x,
    s.crop.y,
    s.crop.width,
    s.crop.height,
    a.originX,
    a.originY,
  ].forEach((n, i) => v.setFloat64(32 + i * 8, n, true));
  return b;
}
export function decodeCharactersFrame(
  bytes: Uint8Array,
  settings: ReferenceCharactersSettingsV1,
  atlas: ReferenceCharacterAtlasV1,
  source: SourceRef,
): ReferenceCharactersFrameV1 {
  const s = validateReferenceCharactersSettings(settings, source),
    a = validateReferenceCharacterAtlas(atlas);
  const bad = (): never => {
    throw new Error("Invalid Characters frame offsets");
  };
  if (bytes.byteLength < 32) bad();
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    u = (at: number) => v.getUint32(at, true);
  const columns = Math.floor(s.frameWidth / (0.6 * s.fontSize * s.renderScale)),
    rows = Math.floor(s.frameHeight / (s.fontSize * s.renderScale)),
    n = columns * rows,
    rgbaLength = s.frameWidth * s.frameHeight * 4;
  const rgbaOffset = 32,
    gridOffset = n > 0 ? 32 + rgbaLength : 0,
    fg = Math.ceil((32 + n * 2) / 4) * 4,
    bg = fg + n * 4,
    alpha = bg + n * 4,
    gridLength = n > 0 ? alpha + n * 4 : 0;
  const total = 32 + rgbaLength + gridLength;
  if (
    u(0) !== 1 ||
    u(4) !== s.frameWidth ||
    u(8) !== s.frameHeight ||
    u(12) !== columns ||
    u(16) !== rows ||
    u(20) !== rgbaOffset ||
    u(24) !== gridOffset ||
    u(28) !== total ||
    bytes.byteLength !== total
  )
    bad();
  let grid: PackedGlyphGrid | null = null;
  if (n > 0) {
    const expected = [1, columns, rows, 32, fg, bg, alpha, gridLength];
    if (expected.some((value, i) => u(gridOffset + i * 4) !== value)) bad();
    // Canonical packed padding is zero, rather than accepting arbitrary hidden bytes.
    for (let at = gridOffset + 32 + n * 2; at < gridOffset + fg; at++)
      if (bytes[at] !== 0) bad();
    const indices = new Uint16Array(n),
      opacity = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      indices[i] = v.getUint16(gridOffset + 32 + i * 2, true);
      opacity[i] = v.getFloat32(gridOffset + alpha + i * 4, true);
    }
    grid = {
      version: 1,
      width: columns,
      height: rows,
      cellWidth: 0.6 * s.fontSize * s.renderScale,
      cellHeight: s.fontSize * s.renderScale,
      calibrationId: a.calibration.id,
      glyphIndices: indices,
      foreground: bytes.slice(gridOffset + fg, gridOffset + bg),
      background: bytes.slice(gridOffset + bg, gridOffset + alpha),
      alpha: opacity,
    };
  }
  const frame: ReferenceCharactersFrameV1 = {
    version: 1,
    width: s.frameWidth,
    height: s.frameHeight,
    rgba: bytes.slice(32, 32 + rgbaLength),
    grid,
  };
  return validateReferenceCharactersFrame(frame, s, a, source);
}
