/** Payload layout is fixed by initial-family-contracts.json, version 1. */
export const FAMILY_PAYLOAD_BYTES = Object.freeze({
  braille: 40,
  pixel: 32,
  mosaic: 36,
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
  brailleThreshold?: number;
  mosaicShape?: "square" | "wide" | "tall";
};
export function writeFamilyPayload(
  view: DataView,
  offset: number,
  id: FamilyId,
  p: FamilyParameters,
): void {
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
