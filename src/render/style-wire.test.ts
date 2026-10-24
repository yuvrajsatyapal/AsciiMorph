import { describe, expect, it } from "vitest";
import fixtures from "../../tests/fixtures/render/styles/wire-v1.json";
import { decodeStyleSettings, encodeStyleSettings } from "./style-wire";
import { validateStyleSettings } from "./style-contract";
import type { ReferenceCharacterAtlasV1 } from "./reference-characters";
export function brailleAtlas(): ReferenceCharacterAtlasV1 {
  return {
    version: 1,
    originX: -1.5,
    originY: 2.25,
    placement: "top-start-ltr",
    ordering: "input",
    fontPolicy: "verified-family",
    spaceIndexOr65535: 65535,
    calibration: {
      version: 1,
      id: "braille",
      fontKey: "test",
      cellWidth: 6.6,
      cellHeight: 11,
      glyphs: Array.from({ length: 256 }, (_, i) =>
        String.fromCodePoint(0x2800 + i),
      ),
      maskWidth: 8,
      maskHeight: 12,
      masks: Uint8Array.from({ length: 256 * 96 }, (_, i) =>
        i < 96 ? 0 : 255,
      ),
      coverage: Float32Array.from({ length: 256 }, (_, i) => (i ? 1 : 0)),
      shapes: new Float32Array(256 * 9),
    },
  };
}
const bytes = (hex: string) =>
  Uint8Array.from(hex.match(/../g)!, (x) => parseInt(x, 16));
describe("style packet v1 shared fixtures", () => {
  it.each(fixtures.cases)(
    "decodes and encodes independently specified $name bytes",
    (f) => {
      const atlas = f.name === "braille" ? brailleAtlas() : undefined;
      expect(decodeStyleSettings(bytes(f.hex), f.source, atlas)).toEqual(
        f.settings,
      );
      expect(
        encodeStyleSettings(
          validateStyleSettings(f.settings, f.source),
          f.source,
          atlas,
        ),
      ).toEqual(bytes(f.hex));
    },
  );
  it.each(fixtures.malformed)("rejects $name", (f) => {
    const [index, offset, ...patch] = f.patch,
      c = fixtures.cases[index],
      b = bytes(c.hex);
    b.set(patch, offset);
    expect(() =>
      decodeStyleSettings(
        b,
        c.source,
        c.name === "braille" ? brailleAtlas() : undefined,
      ),
    ).toThrow();
  });
  it("rejects truncation, trailing data, mismatched source and resources", () => {
    const f = fixtures.cases[0],
      b = bytes(f.hex);
    for (const data of [b.slice(0, -1), new Uint8Array([...b, 0])])
      expect(() => decodeStyleSettings(data, f.source)).toThrow();
    expect(() => decodeStyleSettings(b, { ...f.source, width: 18 })).toThrow();
    expect(() => decodeStyleSettings(b, f.source, brailleAtlas())).toThrow();
    const a = brailleAtlas(),
      braille = fixtures.cases[2];
    expect(() =>
      decodeStyleSettings(bytes(braille.hex), braille.source),
    ).toThrow();
    a.calibration.glyphs.reverse();
    expect(() =>
      decodeStyleSettings(bytes(braille.hex), braille.source, a),
    ).toThrow();
  });
  it("rejects blank/full dictionary failures, geometry and captured origin mismatch", () => {
    const f = fixtures.cases[2];
    for (const change of [
      (a: ReferenceCharacterAtlasV1) => {
        a.calibration.masks[0] = 1;
      },
      (a: ReferenceCharacterAtlasV1) => {
        a.calibration.masks.fill(0, 255 * 96);
      },
      (a: ReferenceCharacterAtlasV1) => {
        a.calibration.cellHeight = 12;
      },
      (a: ReferenceCharacterAtlasV1) => {
        a.originX = 0;
      },
      (a: ReferenceCharacterAtlasV1) => {
        a.originY = NaN;
      },
    ]) {
      const a = brailleAtlas();
      change(a);
      expect(() => decodeStyleSettings(bytes(f.hex), f.source, a)).toThrow();
    }
  });
});
