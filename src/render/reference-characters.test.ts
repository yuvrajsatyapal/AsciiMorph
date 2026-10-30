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

// Exact project binding: catches legacy parameter adaptation, stale resources and
// matching-cell atlases rasterized at the wrong actual font pixel size.
import {
  prepareCharactersGeometry,
  prepareCharactersProject,
} from "./reference-characters";
import {
  REFERENCE_MONOSPACE_STACK,
  readReferenceCalibrationIdentity,
} from "./glyph-calibration";
import type { RenderProjectV1 } from "./project";
function project(): RenderProjectV1 {
  return {
    version: 1,
    id: "project",
    name: "Fixture",
    source: { ...source },
    crop: { x: 0, y: 0, width: 1, height: 1 },
    rotation: 0,
    style: {
      id: "characters",
      parameters: { fontSize: 3, charSet: "ab ", brightness: 0, contrast: 20 },
    },
    effects: [],
    masks: [],
    text: [],
    seed: 12,
    timeUs: 99,
    export: {
      format: "png",
      scale: 4,
      fps: 30,
      durationUs: 0,
      quality: 1,
      audio: false,
    },
  };
}
function measuredAtlas(fontSize = 3, scale = 1, ramp = "ab ") {
  const a = atlas(Array.from(ramp));
  a.fontPolicy = "reference-system-monospace";
  a.calibration.cellWidth = 0.6 * fontSize * scale;
  a.calibration.cellHeight = fontSize * scale;
  a.calibration.fontKey = JSON.stringify([
    JSON.stringify([
      "reference-characters-v1",
      "input",
      "top-start-ltr",
      a.fontPolicy,
      "intentional-system-fallback",
      REFERENCE_MONOSPACE_STACK,
      fontSize * scale,
      "fixture-v1",
    ]),
    1,
    1,
    0,
    0,
  ]);
  return a;
}
function resources(a = measuredAtlas()) {
  return {
    source: { ...source },
    calibrationId: a.calibration.id,
    fontFamily: REFERENCE_MONOSPACE_STACK,
    fontRevision: "fixture-v1",
    charactersProfileVersion: 1 as const,
    charactersContextVersion: 1 as const,
    memoryBudgetBytes: 268435456,
  };
}
describe("exact complete Characters project adapter", () => {
  it("returns detached source/settings and complete fixed context without revising the project", () => {
    const p = project(),
      before = structuredClone(p),
      a = measuredAtlas();
    const result = prepareCharactersProject(p, 1, a, resources(a));
    expect(prepareCharactersProject.length).toBe(4);
    expect(result).toMatchObject({
      source: source,
      sourceId: "source",
      sourceRevision: 2,
      calibrationId: "cal-1",
      binding: { backend: "rust-cpu", dispatchId: 1 },
      settings: {
        version: 1,
        frameWidth: 5,
        frameHeight: 3,
        fontSize: 3,
        renderScale: 1,
        brightness: 0,
        contrast: 20,
        backdrop: "blur",
        styleContext: {
          version: 1,
          backdrop: "blur",
          softness: 8,
          backgroundOpacity: 100,
          blend: "source-over",
          opacity: 100,
          coverage: 100,
          invert: false,
          random: false,
          seed: 0,
        },
      },
      context: { version: 1, defaultsVersion: 1, bgBlur: 8, bgOpacity: 100 },
    });
    expect(result).not.toHaveProperty("revision");
    result.settings.crop.x = 0.1;
    result.source.width = 9;
    expect(p).toEqual(before);
  });
  it("derives clipped crop and rotated full-frame dimensions at S3 without quantizing F", () => {
    const p = project();
    p.source = { ...source, width: 11, height: 7 };
    p.crop = { x: 0.15, y: 0.2, width: 0.6, height: 0.5 };
    p.rotation = 90;
    p.style.parameters.fontSize = 3.1;
    const a = measuredAtlas(3.1, 3),
      r = { ...resources(a), source: p.source };
    expect(prepareCharactersGeometry(3.1, 3)).toEqual({
      fontPixelSize: 9.3,
      cellWidth: 5.58,
      cellHeight: 9.3,
    });
    expect(prepareCharactersProject(p, 3, a, r).settings).toMatchObject({
      fontSize: 3.1,
      renderScale: 3,
      frameWidth: 12,
      frameHeight: 24,
      rotation: 90,
      crop: p.crop,
    });
  });
  it("reads the closed measured identity and rejects wrapper/key, font and exact geometry mismatches", () => {
    const a = measuredAtlas();
    expect(readReferenceCalibrationIdentity(a)).toMatchObject({
      version: 1,
      fontFamily: REFERENCE_MONOSPACE_STACK,
      fontPixelSize: 3,
      fontRevision: "fixture-v1",
      fontPolicy: "reference-system-monospace",
    });
    const inner = JSON.parse(JSON.parse(a.calibration.fontKey)[0]);
    for (const fontSize of [2, 4]) {
      inner[6] = fontSize;
      const wrong = {
        ...a,
        calibration: {
          ...a.calibration,
          fontKey: JSON.stringify([JSON.stringify(inner), 1, 1, 0, 0]),
        },
      };
      expect(() =>
        prepareCharactersProject(project(), 1, wrong, resources(a)),
      ).toThrow(/font/i);
    }
    for (const patch of [
      { originX: 0.5 },
      { fontPolicy: "verified-family" as const },
      { calibration: { ...a.calibration, fontKey: "opaque" } },
    ])
      expect(() =>
        prepareCharactersProject(
          project(),
          1,
          { ...a, ...patch },
          resources(a),
        ),
      ).toThrow();
    const wrongCell = {
      ...a,
      calibration: { ...a.calibration, cellWidth: 1.8 },
    };
    expect(() =>
      prepareCharactersProject(project(), 1, wrongCell, resources(a)),
    ).toThrow(/geometry/i);
    const wrongRamp = measuredAtlas(3, 1, "ba ");
    expect(() =>
      prepareCharactersProject(project(), 1, wrongRamp, resources(wrongRamp)),
    ).toThrow(/ramp/i);
  });
  it("requires full context, source/atlas/font identities and enough complete-frame budget", () => {
    const a = measuredAtlas(),
      r = resources(a);
    for (const patch of [
      { charactersProfileVersion: null },
      { charactersContextVersion: null },
      { source: null },
      { source: { ...source, revision: 3 } },
      { source: { ...source, width: 6 } },
      { calibrationId: "old" },
      { fontFamily: null },
      { fontRevision: "old" },
      { memoryBudgetBytes: 100 },
      { memoryBudgetBytes: NaN },
    ])
      expect(() =>
        prepareCharactersProject(project(), 1, a, { ...r, ...patch }),
      ).toThrow();
  });
  it("rejects every unsupported feature even when disabled and never adds hidden project parameters", () => {
    const p = project(),
      a = measuredAtlas();
    const unsupported = [
      { ...p, source: null },
      { ...p, graph: undefined },
      {
        ...p,
        effects: [{ id: "fx", key: "unknown", enabled: false, parameters: {} }],
      },
      {
        ...p,
        masks: [
          {
            id: "m",
            targetId: "style",
            assetId: "a",
            invert: false,
            opacity: 0,
          },
        ],
      },
      {
        ...p,
        text: [
          {
            id: "t",
            text: "",
            x: 0,
            y: 0,
            width: 1,
            fontFamily: "monospace",
            fontSize: 11,
            color: "#ffffff",
            align: "left",
            rotation: 0,
          },
        ],
      },
      {
        ...p,
        style: {
          ...p.style,
          parameters: { ...p.style.parameters, density: 1 },
        },
      },
      { ...p, revision: 2 },
      { ...p, zoom: 2 },
    ];
    for (const value of unsupported)
      expect(() =>
        prepareCharactersProject(value, 1, a, resources(a)),
      ).toThrow();
    for (const scale of [0, 1.5, 5])
      expect(() =>
        prepareCharactersProject(p, scale as 1, a, resources(a)),
      ).toThrow();
  });
});

it("uses Rust's exact S3 operation order and rejects alternate one-ULP cell geometry", () => {
  const p = project();
  p.style.parameters.fontSize = 3.2;
  const a = measuredAtlas(3.2, 3),
    r = resources(a);
  expect(prepareCharactersGeometry(3.2, 3)).toEqual({
    fontPixelSize: 9.600000000000001,
    cellWidth: 5.76,
    cellHeight: 9.600000000000001,
  });
  expect(prepareCharactersProject(p, 3, a, r).settings.renderScale).toBe(3);
  a.calibration.cellWidth = 5.760000000000001;
  expect(() => prepareCharactersProject(p, 3, a, r)).toThrow(/geometry/i);
});

it("keeps generic readiness a partial preflight while exact adapter rejects schema-valid text and masks", async () => {
  const { getProjectReadiness, validateRenderProject } = await import(
    "./project"
  );
  const { initialCatalogRegistry } = await import("./catalog/initial-schemas");
  const p = project(),
    a = measuredAtlas();
  p.text = [
    {
      id: "t",
      text: "hello",
      x: 0,
      y: 0,
      width: 1,
      fontFamily: "monospace",
      fontSize: 11,
      color: "#ffffff",
      align: "left",
      rotation: 0,
    },
  ];
  p.masks = [
    { id: "m", targetId: "style", assetId: "mask", invert: false, opacity: 0 },
  ];
  const validated = validateRenderProject(p);
  expect(
    getProjectReadiness(validated, initialCatalogRegistry, {
      source,
      maskAssets: new Map([
        ["mask", { width: 1, height: 1, alpha: new Uint8Array(1) }],
      ]),
      supportsBinding: () => true,
    }),
  ).toEqual({ ready: true });
  expect(() => prepareCharactersProject(validated, 1, a, resources(a))).toThrow(
    /unsupported masks/i,
  );
  p.masks = [];
  expect(() => prepareCharactersProject(p, 1, a, resources(a))).toThrow(
    /unsupported text/i,
  );
});
