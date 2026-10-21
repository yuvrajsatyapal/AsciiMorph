import { describe, expect, it } from "vitest";
import type { GlyphCalibrationV1, SourceRef } from "./character-contract";
import {
  REFERENCE_CHARACTERS_CONTEXT_V1,
  validateReferenceCharactersContext,
  validateReferenceCharacterAtlas,
  validateReferenceCharactersSettings,
  validateReferenceCharactersFrame,
  validateReferenceGlyphLayer,
  type ReferenceCharactersSettingsV1,
  type ReferenceCharacterAtlasV1,
} from "./reference-characters";
const source: SourceRef = { id: "source", revision: 2, width: 5, height: 3 };
function settings(): ReferenceCharactersSettingsV1 {
  return {
    version: 1,
    frameWidth: 5,
    frameHeight: 3,
    fontSize: 3,
    renderScale: 1,
    brightness: 0,
    contrast: 20,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    rotation: 0,
    backdrop: "none",
  };
}
function atlas(glyphs = ["a", "b", " "]): ReferenceCharacterAtlasV1 {
  const calibration: GlyphCalibrationV1 = {
    version: 1,
    id: "cal-1",
    fontKey: "measured-test",
    cellWidth: 1.8,
    cellHeight: 3,
    glyphs,
    maskWidth: 1,
    maskHeight: 1,
    masks: new Uint8Array(glyphs.length),
    coverage: new Float32Array(glyphs.length),
    shapes: new Float32Array(glyphs.length * 9),
  };
  return {
    version: 1,
    calibration,
    originX: 0,
    originY: 0,
    placement: "top-start-ltr",
    ordering: "input",
    fontPolicy: "verified-family",
    spaceIndexOr65535: glyphs.indexOf(" ") < 0 ? 65535 : glyphs.indexOf(" "),
  };
}
function grid(a = atlas()) {
  return {
    version: 1 as const,
    width: 2,
    height: 1,
    cellWidth: 1.8,
    cellHeight: 3,
    calibrationId: a.calibration.id,
    glyphIndices: new Uint16Array([65535, 0]),
    foreground: new Uint8Array([0, 0, 0, 0, 100, 100, 100, 128]),
    background: new Uint8Array(8),
    alpha: new Float32Array([0, 128 / 255]),
  };
}
describe("strict reference profile contracts (no JS renderer or project binding)", () => {
  it("accepts fractional font sizes and source-derived floor grids at explicit scales", () => {
    expect(validateReferenceCharactersSettings(settings(), source)).toEqual(
      settings(),
    );
    for (const scale of [1, 2, 3, 4] as const) {
      expect(
        validateReferenceCharactersSettings(
          {
            ...settings(),
            frameWidth: 5 * scale,
            frameHeight: 3 * scale,
            fontSize: 3.25,
            renderScale: scale,
          },
          source,
        ).fontSize,
      ).toBe(3.25);
    }
  });
  it("rejects unknown keys/version/nonfinite/ranges/source and frame mismatches", () => {
    for (const patch of [
      { version: 2 },
      { fontSize: 2.9 },
      { fontSize: Infinity },
      { renderScale: 1.5 },
      { brightness: 101 },
      { contrast: NaN },
      { rotation: 45 },
      { backdrop: "fake" },
      { frameWidth: 6 },
      { frameHeight: 4 },
      { extra: true },
      { crop: { x: 0, y: 0, width: 1, height: 0, extra: 1 } },
    ])
      expect(() =>
        validateReferenceCharactersSettings(
          { ...settings(), ...patch },
          source,
        ),
      ).toThrow();
    expect(() =>
      validateReferenceCharactersSettings(settings(), { ...source, width: 0 }),
    ).toThrow();
    expect(() =>
      validateReferenceCharactersSettings(settings(), {
        ...source,
        revision: NaN,
      }),
    ).toThrow();
  });
  it("rejects floating collapsed crop extents at the source edge", () => {
    expect(() =>
      validateReferenceCharactersSettings(
        {
          ...settings(),
          frameWidth: 1,
          crop: { x: 1, y: 0, width: Number.MIN_VALUE, height: 1 },
        },
        source,
      ),
    ).toThrow();
  });
  it("derives crop via floor/ceil then quarter-rotation", () => {
    const s = { ...source, width: 6, height: 5 };
    expect(
      validateReferenceCharactersSettings(
        {
          ...settings(),
          frameWidth: 4,
          frameHeight: 4,
          crop: { x: 0.2, y: 0.1, width: 0.5, height: 0.6 },
          rotation: 90,
        },
        s,
      ).frameWidth,
    ).toBe(4);
  });
  it("caps cell counts, full frame backing and conservative simultaneous storage", () => {
    expect(() =>
      validateReferenceCharactersSettings(
        { ...settings(), frameWidth: 600, frameHeight: 600 },
        { ...source, width: 600, height: 600 },
      ),
    ).toThrow();
    expect(() =>
      validateReferenceCharactersSettings(
        {
          ...settings(),
          frameWidth: 16800,
          frameHeight: 16800,
          renderScale: 4,
          fontSize: 80,
        },
        { ...source, width: 4200, height: 4200 },
      ),
    ).toThrow();
    expect(() =>
      validateReferenceCharactersSettings(settings(), source, 10),
    ).toThrow();
  });
  it("freezes a closed fixed baseline context without claiming implemented blur", () => {
    expect(Object.isFrozen(REFERENCE_CHARACTERS_CONTEXT_V1)).toBe(true);
    expect(
      validateReferenceCharactersContext({
        ...REFERENCE_CHARACTERS_CONTEXT_V1,
      }),
    ).toEqual(REFERENCE_CHARACTERS_CONTEXT_V1);
    for (const patch of [
      { darkThreshold: 31 },
      { edgeEmphasis: 1 },
      { bgBlur: 0 },
      { blend: "multiply" },
      { version: 2 },
      { bogus: true },
    ])
      expect(() =>
        validateReferenceCharactersContext({
          ...REFERENCE_CHARACTERS_CONTEXT_V1,
          ...patch,
        }),
      ).toThrow();
  });
  it("preserves actual Unicode graphemes and input order independent of reversed coverage", () => {
    for (const glyphs of [
      ["é", "👨‍👩‍👧", " "],
      [" ", "👨‍👩‍👧", "é"],
    ]) {
      const a = atlas(glyphs);
      a.calibration.coverage.set([1, 0.5, 0]);
      expect(validateReferenceCharacterAtlas(a).calibration.glyphs).toEqual(
        glyphs,
      );
    }
  });
  it("requires explicit literal-space index correspondence, never coverage inference", () => {
    const a = atlas([".", " "]);
    expect(validateReferenceCharacterAtlas(a).spaceIndexOr65535).toBe(1);
    for (const spaceIndexOr65535 of [0, 2, 256, 65534, 65535])
      expect(() =>
        validateReferenceCharacterAtlas({ ...a, spaceIndexOr65535 }),
      ).toThrow();
    expect(
      validateReferenceCharacterAtlas(atlas([".", "x"])).spaceIndexOr65535,
    ).toBe(65535);
  });
  it("rejects malformed atlas metadata, ramps and actual extent origins", () => {
    const a = atlas();
    for (const patch of [
      { version: 2 },
      { ordering: "coverage" },
      { placement: "center" },
      { fontPolicy: "arbitrary" },
      { originX: NaN },
      { originX: 1.01 },
      { originY: -1.01 },
      { spaceIndexOr65535: NaN },
      { extra: true },
    ])
      expect(() =>
        validateReferenceCharacterAtlas({ ...a, ...patch }),
      ).toThrow();
    for (const glyphs of [
      ["a", "a"],
      ["a", "ab"],
      ["a", "\n"],
      ["a", "́"],
      ["a", "\u200d"],
    ])
      expect(() => validateReferenceCharacterAtlas(atlas(glyphs))).toThrow();
    expect(() =>
      validateReferenceCharacterAtlas({
        ...a,
        calibration: { ...a.calibration, maskWidth: 2 },
      }),
    ).toThrow();
    expect(() =>
      validateReferenceCharacterAtlas({
        ...a,
        calibration: {
          ...a.calibration,
          masks: new Uint8Array(new ArrayBuffer(16 * 1024 * 1024 + 1), 0, 3),
        },
      }),
    ).toThrow();
  });
  it("validates full frame with nullable zero-grid and distinct intermediate kind", () => {
    const a = atlas();
    const f = {
      version: 1,
      width: 5,
      height: 3,
      rgba: new Uint8Array(60),
      grid: grid(a),
    };
    expect(validateReferenceCharactersFrame(f, settings(), a, source)).toEqual(
      f,
    );
    expect(
      validateReferenceGlyphLayer(
        { ...f, kind: "reference-glyph-layer" },
        settings(),
        a,
        source,
      ).kind,
    ).toBe("reference-glyph-layer");
    expect(() =>
      validateReferenceGlyphLayer(f, settings(), a, source),
    ).toThrow();
    expect(() =>
      validateReferenceCharactersFrame(
        { ...f, kind: "reference-glyph-layer" },
        settings(),
        a,
        source,
      ),
    ).toThrow();
    const zero = { ...settings(), fontSize: 80 };
    expect(
      validateReferenceCharactersFrame({ ...f, grid: null }, zero, a, source)
        .grid,
    ).toBeNull();
    expect(() =>
      validateReferenceCharactersFrame(
        { ...f, grid: null },
        settings(),
        a,
        source,
      ),
    ).toThrow();
  });
  it("rejects mismatched frame/grid dimensions, glyph indices and metadata", () => {
    const a = atlas();
    const f = {
      version: 1,
      width: 5,
      height: 3,
      rgba: new Uint8Array(60),
      grid: grid(a),
    };
    for (const patch of [
      { version: 2 },
      { width: 4 },
      { rgba: new Uint8Array(59) },
      { grid: { ...grid(a), width: 1 } },
      { grid: { ...grid(a), calibrationId: "wrong" } },
      { grid: { ...grid(a), glyphIndices: new Uint16Array([65535, 3]) } },
      { grid: { ...grid(a), cellWidth: 2 } },
      { extra: 1 },
    ])
      expect(() =>
        validateReferenceCharactersFrame(
          { ...f, ...patch },
          settings(),
          a,
          source,
        ),
      ).toThrow();
  });
});

it("rejects retained oversized output backing buffers even for a small view", () => {
  const a = atlas();
  const f = {
    version: 1,
    width: 5,
    height: 3,
    rgba: new Uint8Array(new ArrayBuffer(268435457), 0, 60),
    grid: grid(a),
  };
  expect(() =>
    validateReferenceCharactersFrame(f, settings(), a, source),
  ).toThrow();
});
it("rejects painted empty-grid glyph intermediates while allowing future backdrop frames", () => {
  const a = atlas();
  const s = { ...settings(), fontSize: 80 };
  const f = {
    version: 1,
    width: 5,
    height: 3,
    rgba: new Uint8Array(60).fill(255),
    grid: null,
  };
  expect(() =>
    validateReferenceGlyphLayer(
      { ...f, kind: "reference-glyph-layer" },
      s,
      a,
      source,
    ),
  ).toThrow();
  expect(
    validateReferenceCharactersFrame(f, { ...s, backdrop: "blur" }, a, source),
  ).toEqual(f);
});

describe.each(["complete frame", "glyph layer"] as const)(
  "%s source boundary",
  (kind) => {
    const mismatches: [string, ReferenceCharactersSettingsV1][] = [
      [
        "forged source-derived width",
        { ...settings(), fontSize: 80, frameWidth: 6 },
      ],
      [
        "rotation without oriented frame",
        { ...settings(), fontSize: 80, rotation: 90 },
      ],
      [
        "scale without scaled frame",
        { ...settings(), fontSize: 80, renderScale: 2 },
      ],
      [
        "collapsed source-edge crop",
        {
          ...settings(),
          fontSize: 80,
          frameWidth: 1,
          crop: { x: 1, y: 0, width: Number.MIN_VALUE, height: 1 },
        },
      ],
    ];
    it.each(mismatches)(
      "rejects %s even when result matches forged settings",
      (_label, s) => {
        const f = {
          version: 1,
          width: s.frameWidth,
          height: s.frameHeight,
          rgba: new Uint8Array(s.frameWidth * s.frameHeight * 4),
          grid: null,
        };
        expect(() =>
          kind === "complete frame"
            ? validateReferenceCharactersFrame(f, s, atlas(), source)
            : validateReferenceGlyphLayer(
                { ...f, kind: "reference-glyph-layer" },
                s,
                atlas(),
                source,
              ),
        ).toThrow();
      },
    );
    it("accepts the correctly source-derived rotated frame", () => {
      const s: ReferenceCharactersSettingsV1 = {
        ...settings(),
        fontSize: 80,
        frameWidth: 3,
        frameHeight: 5,
        rotation: 90,
      };
      const f = {
        version: 1,
        width: 3,
        height: 5,
        rgba: new Uint8Array(60),
        grid: null,
      };
      const result =
        kind === "complete frame"
          ? validateReferenceCharactersFrame(f, s, atlas(), source)
          : validateReferenceGlyphLayer(
              { ...f, kind: "reference-glyph-layer" },
              s,
              atlas(),
              source,
            );
      expect(result.rgba).toBe(f.rgba);
    });
  },
);
