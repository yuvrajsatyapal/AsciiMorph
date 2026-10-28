import {
  DITHER_ALGORITHMS,
  DITHER_PALETTES,
  DITHER_CHROMA,
  DITHER_DIRECTIONS,
  type DitherParameters,
} from "../dither-contract";
/** Payload layout is fixed by initial-family-contracts.json, version 1. */
export const FAMILY_PAYLOAD_BYTES = Object.freeze({
  braille: 40,
  pixel: 32,
  mosaic: 36,
  dither: 72,
});
export type FamilyId = keyof typeof FAMILY_PAYLOAD_BYTES;
export interface CommonFamilyParameters {
  fontSize: number;
  brightness: number;
  contrast: number;
  invert: boolean;
  charOpacity: number;
}
export type FamilyParameters = CommonFamilyParameters & {
  dither?: DitherParameters;
  brailleThreshold?: number;
  mosaicShape?: "square" | "wide" | "tall";
};
export function familyPayloadBytes(id: FamilyId, p: FamilyParameters): number {
  return (
    FAMILY_PAYLOAD_BYTES[id] +
    (id === "dither" ? 3 * p.dither!.customPalette.length : 0)
  );
}
export function writeFamilyPayload(
  view: DataView,
  offset: number,
  id: FamilyId,
  p: FamilyParameters,
): void {
  if (id === "dither") {
    const d = p.dither!;
    for (const [o, v] of [
      [0, DITHER_ALGORITHMS.indexOf(d.algorithm)],
      [4, DITHER_PALETTES.indexOf(d.palette)],
      [8, DITHER_CHROMA.indexOf(d.chroma)],
      [12, d.pixelSize],
      [48, d.customPalette.length],
      [52, 0],
      [56, 0],
      [60, DITHER_DIRECTIONS.indexOf(d.direction)],
      [64, d.speed],
      [68, 0],
    ])
      view.setUint32(offset + o, v, true);
    for (const [o, v] of [
      [16, d.strength],
      [24, d.contrast],
      [32, d.threshold],
      [40, d.angle],
    ])
      view.setFloat64(offset + o, v, true);
    d.customPalette.forEach((color, i) => {
      for (let c = 0; c < 3; c++)
        view.setUint8(
          offset + 72 + i * 3 + c,
          parseInt(color.slice(1 + c * 2, 3 + c * 2), 16),
        );
    });
    return;
  }
  view.setUint32(offset, p.fontSize, true);
  view.setFloat64(offset + 4, p.brightness, true);
  view.setFloat64(offset + 12, p.contrast, true);
  view.setUint32(offset + 20, p.invert ? 1 : 0, true);
  view.setFloat64(offset + 24, p.charOpacity, true);
  if (id === "braille") view.setFloat64(offset + 32, p.brailleThreshold!, true);
  if (id === "mosaic")
    view.setUint32(
      offset + 32,
      ["square", "wide", "tall"].indexOf(p.mosaicShape!),
      true,
    );
}
export function readFamilyPayload(
  view: DataView,
  offset: number,
  id: FamilyId,
): FamilyParameters {
  if (id === "dither") {
    const u = (n: number) => view.getUint32(offset + n, true),
      f = (n: number) => view.getFloat64(offset + n, true);
    const count = u(48);
    if (
      count < 2 ||
      count > 64 ||
      u(52) !== 0 ||
      u(56) !== 0 ||
      u(68) !== 0 ||
      view.byteLength !== offset + 72 + count * 3
    )
      throw new Error("Invalid Dither packet");
    const customPalette = Array.from(
      { length: count },
      (_, i) =>
        "#" +
        Array.from({ length: 3 }, (_, c) =>
          view
            .getUint8(offset + 72 + i * 3 + c)
            .toString(16)
            .padStart(2, "0"),
        ).join(""),
    );
    return {
      fontSize: 3,
      brightness: 0,
      contrast: 0,
      invert: false,
      charOpacity: 100,
      dither: {
        algorithm: DITHER_ALGORITHMS[u(0)],
        palette: DITHER_PALETTES[u(4)],
        chroma: DITHER_CHROMA[u(8)],
        pixelSize: u(12),
        strength: f(16),
        contrast: f(24),
        threshold: f(32),
        angle: f(40),
        customPalette,
        animate: false,
        shimmer: false,
        direction: DITHER_DIRECTIONS[u(60)],
        speed: u(64),
      },
    };
  }
  const invert = view.getUint32(offset + 20, true);
  if (invert > 1) throw new Error("Invalid style invert");
  const p: FamilyParameters = {
    fontSize: view.getUint32(offset, true),
    brightness: view.getFloat64(offset + 4, true),
    contrast: view.getFloat64(offset + 12, true),
    invert: invert === 1,
    charOpacity: view.getFloat64(offset + 24, true),
  };
  if (id === "braille") p.brailleThreshold = view.getFloat64(offset + 32, true);
  if (id === "mosaic") {
    const shape = view.getUint32(offset + 32, true);
    if (shape > 2) throw new Error("Invalid style mosaicShape");
    p.mosaicShape = (["square", "wide", "tall"] as const)[shape];
  }
  return p;
}
