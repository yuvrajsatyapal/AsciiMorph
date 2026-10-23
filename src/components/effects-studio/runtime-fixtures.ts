import type { ReferenceCharacterCalibrationInput } from "@/render/glyph-calibration";
import type { ReferenceCharacterAtlasV1 } from "@/render/reference-characters";
export function measuredAtlasFixture(
  input: ReferenceCharacterCalibrationInput,
): ReferenceCharacterAtlasV1 {
  return {
    version: 1,
    placement: "top-start-ltr",
    ordering: "input",
    fontPolicy: input.fontPolicy,
    originX: 0,
    originY: 0,
    spaceIndexOr65535: input.ramp.includes(" ")
      ? [...input.ramp].indexOf(" ")
      : 65535,
    calibration: {
      version: 1,
      id: `atlas-${input.fontSize}-${input.ramp}`,
      fontKey: JSON.stringify([
        JSON.stringify([
          "reference-characters-v1",
          "input",
          "top-start-ltr",
          input.fontPolicy,
          "intentional-system-fallback",
          input.fontFamily,
          input.fontSize,
          input.fontRevision,
        ]),
        1,
        1,
        0,
        0,
      ]),
      cellWidth: input.cellWidth,
      cellHeight: input.cellHeight,
      glyphs: [...input.ramp],
      maskWidth: 1,
      maskHeight: 1,
      masks: new Uint8Array(input.ramp.length),
      coverage: new Float32Array(input.ramp.length),
      shapes: new Float32Array(input.ramp.length * 9),
    },
  };
}
