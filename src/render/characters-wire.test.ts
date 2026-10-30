import { describe, it, expect } from "vitest";
import { STYLE_CONTEXT_DEFAULTS } from "./style-context";
import {
  encodeCharactersSettings,
  decodeCharactersFrame,
} from "./characters-wire";
import type {
  ReferenceCharacterAtlasV1,
  ReferenceCharactersSettingsV1,
} from "./reference-characters";
export const profileSource = { id: "s", revision: 1, width: 5, height: 3 };
export const profileSettings: ReferenceCharactersSettingsV1 = {
  version: 1,
  frameWidth: 5,
  frameHeight: 3,
  fontSize: 3,
  renderScale: 1,
  brightness: 0,
  contrast: 0,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  rotation: 0,
  backdrop: "none",
};
export function profileAtlas(): ReferenceCharacterAtlasV1 {
  return {
    version: 1,
    originX: 0,
    originY: 0,
    placement: "top-start-ltr",
    ordering: "input",
    fontPolicy: "reference-system-monospace",
    spaceIndexOr65535: 65535,
    calibration: {
      version: 1,
      id: "a",
      fontKey: "measured",
      cellWidth: 0.6 * 3,
      cellHeight: 3,
      glyphs: [".", "#"],
      maskWidth: 1,
      maskHeight: 1,
      masks: new Uint8Array([0, 255]),
      coverage: new Float32Array([0, 1]),
      shapes: new Float32Array(18),
    },
  };
}
// Independently encoded 5x3 RGBA + 2x1 empty-dot grid, matching native fixture.
function frameBytes() {
  const b = new Uint8Array(152),
    v = new DataView(b.buffer);
  [1, 5, 3, 2, 1, 32, 92, 152].forEach((n, i) => v.setUint32(i * 4, n, true));
  [1, 2, 1, 32, 36, 44, 52, 60].forEach((n, i) =>
    v.setUint32(92 + i * 4, n, true),
  );
  v.setUint16(124, 65535, true);
  v.setUint16(126, 0, true);
  b.set([255, 255, 255, 255], 132);
  v.setFloat32(148, 1, true);
  return b;
}
describe("profile wire", () => {
  it("keeps mode zero for a batch-capable atlas without extended context", () => {
    const atlas = { ...profileAtlas(), softwareWebglBatch: true as const };
    expect(
      new DataView(
        encodeCharactersSettings(profileSettings, atlas, profileSource).buffer,
      ).getUint32(24, true),
    ).toBe(0);
  });
  it("carries the explicit captured WebGL batch raster mode", () => {
    const atlas = { ...profileAtlas(), softwareWebglBatch: true as const };
    const bytes = encodeCharactersSettings(
      {
        ...profileSettings,
        styleContext: { ...STYLE_CONTEXT_DEFAULTS, backdrop: "none" },
      },
      atlas,
      profileSource,
    );
    expect(new DataView(bytes.buffer).getUint32(24, true)).toBe(1);
  });
  it("encodes exact separate112 bytes and literal space at offset28", () => {
    const a = profileAtlas(),
      b = encodeCharactersSettings(profileSettings, a, profileSource),
      v = new DataView(b.buffer);
    expect(b.length).toBe(112);
    expect(
      Array.from({ length: 8 }, (_, i) => v.getUint32(i * 4, true)),
    ).toEqual([1, 5, 3, 0, 2, 0, 0, 65535]);
    expect(
      Array.from({ length: 10 }, (_, i) => v.getFloat64(32 + i * 8, true)),
    ).toEqual([3, 1, 0, 0, 0, 0, 1, 1, 0, 0]);
    a.calibration.glyphs = [" ", "#"];
    a.spaceIndexOr65535 = 0;
    expect(
      new DataView(
        encodeCharactersSettings(profileSettings, a, profileSource).buffer,
      ).getUint32(28, true),
    ).toBe(0);
  });
  it("decodes an independently specified frame and owns output", () => {
    const b = frameBytes(),
      f = decodeCharactersFrame(
        b,
        profileSettings,
        profileAtlas(),
        profileSource,
      );
    expect([f.width, f.height]).toEqual([5, 3]);
    expect([...f.grid!.glyphIndices]).toEqual([65535, 0]);
    expect([...f.grid!.alpha]).toEqual([0, 1]);
    expect(f.rgba).toEqual(new Uint8Array(60));
    b.fill(255);
    expect(f.rgba.every((v) => v === 0)).toBe(true);
  });
  it("rejects malformed/truncated/padded/overflow/noncanonical headers before copy", () => {
    for (const [offset, value] of [
      [0, 2],
      [4, 0xffffffff],
      [12, 1],
      [16, 0],
      [20, 36],
      [24, 0],
      [24, 0xfffffffc],
      [28, 151],
      [104, 0],
      [108, 40],
      [112, 48],
      [116, 56],
      [120, 64],
    ]) {
      const b = frameBytes();
      new DataView(b.buffer).setUint32(offset, value, true);
      expect(() =>
        decodeCharactersFrame(
          b,
          profileSettings,
          profileAtlas(),
          profileSource,
        ),
      ).toThrow();
    }
    for (const b of [
      frameBytes().slice(0, 151),
      new Uint8Array(153),
      new Uint8Array(31),
    ])
      expect(() =>
        decodeCharactersFrame(
          b,
          profileSettings,
          profileAtlas(),
          profileSource,
        ),
      ).toThrow();
  });
  it("validates source geometry and space correspondence and zero-grid frame", () => {
    expect(() =>
      encodeCharactersSettings(
        { ...profileSettings, frameWidth: 6 },
        profileAtlas(),
        profileSource,
      ),
    ).toThrow();
    const a = profileAtlas();
    a.spaceIndexOr65535 = 0;
    expect(() =>
      encodeCharactersSettings(profileSettings, a, profileSource),
    ).toThrow();
    const b = new Uint8Array(36),
      v = new DataView(b.buffer);
    [1, 1, 1, 0, 0, 32, 0, 36].forEach((n, i) => v.setUint32(i * 4, n, true));
    const f = decodeCharactersFrame(
      b,
      { ...profileSettings, frameWidth: 1, frameHeight: 1 },
      profileAtlas(),
      { ...profileSource, width: 1, height: 1 },
    );
    expect(f.grid).toBeNull();
    v.setUint32(24, 36, true);
    expect(() =>
      decodeCharactersFrame(
        b,
        { ...profileSettings, frameWidth: 1, frameHeight: 1 },
        profileAtlas(),
        { ...profileSource, width: 1, height: 1 },
      ),
    ).toThrow();
  });
});
it("rejects nonzero canonical packed-grid alignment padding", () => {
  const b = new Uint8Array(116),
    v = new DataView(b.buffer);
  [1, 3, 3, 1, 1, 32, 68, 116].forEach((n, i) => v.setUint32(i * 4, n, true));
  [1, 1, 1, 32, 36, 40, 44, 48].forEach((n, i) =>
    v.setUint32(68 + i * 4, n, true),
  );
  v.setUint16(100, 65535, true);
  const settings = { ...profileSettings, frameWidth: 3 },
    source = { ...profileSource, width: 3 };
  expect(
    decodeCharactersFrame(b, settings, profileAtlas(), source).grid!
      .glyphIndices[0],
  ).toBe(65535);
  b[102] = 1;
  expect(() =>
    decodeCharactersFrame(b, settings, profileAtlas(), source),
  ).toThrow(/offsets/);
});
