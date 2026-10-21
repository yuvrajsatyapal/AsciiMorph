import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { convert, decodePixels, type Pixels } from "@/converter/engine";
import {
  DEFAULT_SETTINGS,
  type ConversionSettings,
} from "@/converter/settings";
import { documentText } from "@/core/render";
import {
  parseDocument,
  serializeDocument,
  validateDocument,
} from "@/core/document";
import { createCharacterEngine } from "./wasm-character";
import type { GlyphCalibrationV1, PackedGlyphGrid } from "./character-contract";
import {
  attachLegacySource,
  gridToDocument,
  legacySettingsToCharacter,
} from "./legacy-adapter";

const bytes = readFileSync("public/wasm/asciimorph_engine.wasm");
const calibration = (): GlyphCalibrationV1 => ({
  version: 1,
  id: "handoff-cal",
  fontKey: "fixture-font",
  cellWidth: 9,
  cellHeight: 18,
  glyphs: [" ", "#"],
  maskWidth: 1,
  maskHeight: 1,
  masks: new Uint8Array([0, 255]),
  coverage: new Float32Array([0, 1]),
  shapes: new Float32Array(18),
});
const fixture = (): Pixels => ({
  width: 17,
  height: 13,
  data: Uint8ClampedArray.from(
    Array.from({ length: 221 }, (_, i) => {
      const v = [0, 32, 80, 176, 224, 255][i % 6];
      return [v, v, v, 255];
    }).flat(),
  ),
});
const settings = (
  patch: Partial<ConversionSettings> = {},
): ConversionSettings => ({
  ...DEFAULT_SETTINGS,
  width: 17,
  height: 13,
  preserveAspect: false,
  charset: "custom",
  custom: " #",
  ...patch,
});
async function packed(
  source: Pixels,
  s: ConversionSettings,
  c = calibration(),
): Promise<PackedGlyphGrid> {
  const e = await createCharacterEngine(bytes);
  try {
    e.setSource({
      id: "fixture",
      revision: 1,
      width: source.width,
      height: source.height,
      rgba: source.data,
    });
    if (s.charset !== "braille") e.setCalibration(c);
    const id = e.begin(
      legacySettingsToCharacter(s, {
        id: "fixture",
        revision: 1,
        width: source.width,
        height: source.height,
      }),
    );
    while (e.step(id, 1024) === "pending") {
      /* Real cooperative WASM. */
    }
    return e.takeGrid(id);
  } finally {
    e.dispose();
  }
}
afterEach(() => vi.restoreAllMocks());

describe("explicit legacy handoff", () => {
  it.each([
    ["neutral", {}],
    ["gamma", { gamma: 1.8, brightness: -8, contrast: 15 }],
    ["dither", { dithering: true }],
    [
      "rotation/crop/aspect",
      {
        crop: { x: 0.12, y: 0.15, width: 0.7, height: 0.65 },
        rotation: 90,
        width: 11,
        preserveAspect: true,
      },
    ],
    ["mapping invert", { invert: true }],
  ] satisfies [string, Partial<ConversionSettings>][])(
    "materializes_same_cells_as_legacy: %s",
    async (_, patch) => {
      const source = fixture(),
        s = settings(patch),
        c = calibration();
      const grid = await packed(source, s, c);
      const legacy = await convert(source, s, undefined, undefined, {
        chars: c.glyphs,
        coverage: Array.from(c.coverage),
      });
      const doc = gridToDocument(grid, c, "Handoff");
      expect([doc.width, doc.height, doc.cellWidth, doc.cellHeight]).toEqual([
        legacy.width,
        legacy.height,
        legacy.cellWidth,
        legacy.cellHeight,
      ]);
      expect(doc.layers).toHaveLength(1);
      expect(doc.layers[0].cells).toEqual(legacy.layers[0].cells);
      expect(doc.conversion).toBeUndefined();
      expect(validateDocument(doc)).toEqual(doc);
    },
  );
  it("matches_color_and_grayscale_cells_after_alpha_weighted_resampling", async () => {
    const source = fixture();
    for (let i = 0; i < source.data.length; i += 4) {
      source.data[i + 1] = 255 - source.data[i];
      source.data[i + 2] = (source.data[i] * 3) % 256;
      source.data[i + 3] = [0, 64, 128, 255][(i / 4) % 4];
    }
    for (const mode of ["color", "grayscale"] as const) {
      const s = settings({
        mode,
        width: 7,
        height: 5,
        saturation: 130,
        gamma: 1.3,
      });
      const grid = await packed(source, s),
        doc = gridToDocument(grid, calibration(), mode);
      const legacy = await convert(source, s, undefined, undefined, {
        chars: [" ", "#"],
        coverage: [0, 1],
      });
      expect(doc.layers[0].cells).toEqual(legacy.layers[0].cells);
    }
  });
  it("preserves_alpha_and_independent_background_without_flattening", async () => {
    const source = {
      width: 3,
      height: 1,
      data: new Uint8ClampedArray([
        255, 255, 255, 128, 0, 0, 0, 255, 255, 0, 0, 0,
      ]),
    };
    const s = settings({ width: 3, height: 1, mode: "color", bg: "#123456" });
    const grid = await packed(source, s),
      doc = gridToDocument(grid, calibration(), "Alpha");
    const legacy = await convert(source, s, undefined, undefined, {
      chars: [" ", "#"],
      coverage: [0, 1],
    });
    expect(doc.background).toBeNull();
    expect(doc.layers).toHaveLength(2);
    expect(doc.layers[1].cells).toEqual(
      legacy.layers[0].cells.map((c) => ({ ...c, bg: null })),
    );
    expect(doc.layers[0].cells.map((c) => [c.char, c.bg, c.alpha])).toEqual([
      [" ", "#123456", 1],
      [" ", "#123456", 1],
      [" ", null, 0],
    ]);
    expect(validateDocument(doc)).toEqual(doc);
  });
  it("preview_never_encodes_source", async () => {
    const encode = vi.spyOn(globalThis, "btoa"),
      source = fixture(),
      s = settings();
    for (let i = 0; i < 3; i++)
      gridToDocument(await packed(source, s), calibration(), "Preview");
    expect(encode).not.toHaveBeenCalled();
  });
  it("attach_source_only_on_explicit_handoff", async () => {
    const source = fixture(),
      s = settings({ rotation: 270, gamma: 1.7 });
    const doc = gridToDocument(
      await packed(source, s),
      calibration(),
      "Attached",
    );
    const encode = vi.spyOn(globalThis, "btoa");
    const attached = attachLegacySource(doc, source, s);
    expect(encode).toHaveBeenCalledTimes(1);
    expect(doc.conversion).toBeUndefined();
    expect(attached.conversion?.settings).toEqual(s);
    expect(attached.conversion?.settings).not.toBe(s);
    expect(decodePixels(attached.conversion!.source.data)).toEqual(source.data);
    expect(parseDocument(serializeDocument(attached))).toEqual(attached);
    s.gamma = 2;
    expect(attached.conversion?.settings.gamma).toBe(1.7);
  });
  it("braille_packing_survives_text_export", async () => {
    const source = {
      width: 4,
      height: 4,
      data: Uint8ClampedArray.from(
        [
          255, 0, 0, 255, 0, 255, 255, 0, 255, 0, 0, 255, 0, 255, 255, 0,
        ].flatMap((v) => [v, v, v, 255]),
      ),
    };
    const s = settings({ charset: "braille", width: 2, height: 1 });
    const grid = await packed(source, s);
    expect([...grid.glyphIndices]).toEqual([149, 106]);
    // A supplied arbitrary dictionary must never reinterpret raw dot-mask indices.
    const doc = gridToDocument(grid, calibration(), "Braille");
    expect(documentText(doc)).toBe(String.fromCodePoint(0x2895, 0x286a));
    expect(doc.layers[0].cells).toEqual(
      (await convert(source, s)).layers[0].cells,
    );
  });
  it("legacy_settings_keep_mapping_invert_only", () => {
    const s = settings({
      invert: true,
      dithering: true,
      shapeAware: true,
      smartEdges: true,
      mode: "grayscale",
      fg: "#0123ab",
      bg: "#fedcba",
    });
    const mapped = legacySettingsToCharacter(s, {
      id: "source",
      revision: 0,
      width: 17,
      height: 13,
    });
    expect(mapped).toMatchObject({
      mappingInvert: true,
      outputInvert: false,
      contrast: 0,
      dither: "floyd-steinberg",
      shapeAware: true,
      smartEdges: true,
      fg: 0x0123ab,
      bg: 0xfedcba,
      mapping: "glyph",
      seed: 0,
    });
    expect(
      legacySettingsToCharacter(settings({ charset: "braille" }), {
        id: "source",
        revision: 0,
        width: 17,
        height: 13,
      }).mapping,
    ).toBe("braille");
    expect(() =>
      legacySettingsToCharacter(s, {
        id: "source",
        revision: 0,
        width: NaN,
        height: 13,
      }),
    ).toThrow(/source/i);
  });
  it("keeps_equal_cell_background_alpha_in_one_layer", async () => {
    const grid = await packed(
      {
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([255, 255, 255, 255]),
      },
      settings({ width: 1, height: 1 }),
    );
    grid.background.set([18, 52, 86, 255]);
    const doc = gridToDocument(grid, calibration(), "Shared alpha");
    expect(doc.layers).toHaveLength(1);
    expect(doc.layers[0].cells[0].bg).toBe("#123456");
  });
  it("selects_the_first_dictionary_entry_at_an_exact_mapping_tie", async () => {
    const c = calibration();
    c.glyphs = ["@", "."];
    c.coverage = new Float32Array([0.75, 0.25]);
    for (const [values, expected] of [
      [[127, 127], "."],
      [[127, 128], "@"],
      [[128, 128], "@"],
    ] as const) {
      const source = {
        width: 2,
        height: 1,
        data: Uint8ClampedArray.from(values.flatMap((v) => [v, v, v, 255])),
      };
      const s = settings({ width: 1, height: 1 });
      const doc = gridToDocument(await packed(source, s, c), c, "Boundary");
      expect(doc.layers[0].cells[0].char).toBe(expected);
      expect(doc.layers[0].cells).toEqual(
        (
          await convert(source, s, undefined, undefined, {
            chars: c.glyphs,
            coverage: Array.from(c.coverage),
          })
        ).layers[0].cells,
      );
    }
  });
  it("preserves_nonzero_background_beneath_a_transparent_glyph", async () => {
    const g = await packed(
      { width: 1, height: 1, data: new Uint8ClampedArray(4) },
      settings({ width: 1, height: 1 }),
    );
    g.background.set([18, 52, 86, 128]);
    const doc = gridToDocument(g, calibration(), "Background only");
    expect(doc.layers).toHaveLength(2);
    expect(doc.layers[0].cells[0]).toEqual({
      char: " ",
      fg: "#000000",
      bg: "#123456",
      alpha: 128 / 255,
    });
    expect(doc.layers[1].cells[0]).toMatchObject({
      char: " ",
      bg: null,
      alpha: 0,
    });
    expect(doc.background).toBeNull();
  });
  it("keeps_aspect_and_legacy_maxcell_rounding_without_source_pixels", () => {
    const source = {
      id: "reference-only",
      revision: 0,
      width: 1,
      height: 16384,
    };
    expect(
      legacySettingsToCharacter(settings({ width: 300, height: 300 }), source),
    ).toMatchObject({ width: 300, height: 200 });
    expect(
      legacySettingsToCharacter(
        settings({ width: 300, preserveAspect: true }),
        source,
      ),
    ).toMatchObject({ width: 1, height: 300 });
  });
  it("requires_calibration_identity_and_rejects_legacy_side_limits", async () => {
    const grid = await packed(fixture(), settings());
    expect(() => gridToDocument(grid, undefined, "Missing")).toThrow(
      /calibration/i,
    );
    expect(() =>
      gridToDocument(grid, { ...calibration(), id: "wrong" }, "Wrong"),
    ).toThrow(/calibration/i);
    const count = 301;
    const wide = {
      ...grid,
      width: count,
      height: 1,
      glyphIndices: new Uint16Array(count),
      foreground: new Uint8Array(count * 4).fill(255),
      background: new Uint8Array(count * 4),
      alpha: new Float32Array(count).fill(1),
    };
    expect(() => gridToDocument(wide, calibration(), "Wide")).toThrow(
      /legacy.*300|300.*legacy/i,
    );
  });
  it("rejects_oversized_or_malformed_sources_before_base64", async () => {
    const doc = gridToDocument(
        await packed(fixture(), settings()),
        calibration(),
        "Bounds",
      ),
      encode = vi.spyOn(globalThis, "btoa");
    for (const source of [
      { width: 2049, height: 1, data: new Uint8ClampedArray(8196) },
      { width: 1, height: 1, data: new Uint8ClampedArray(3) },
      { width: 1.5, height: 1, data: new Uint8ClampedArray(4) },
    ])
      expect(() => attachLegacySource(doc, source, settings())).toThrow(
        /source|pixel/i,
      );
    expect(encode).not.toHaveBeenCalled();
  });
});

it("expanded packed geometry requires explicit legacy adaptation before document allocation", () => {
  const ids = vi.spyOn(crypto, "randomUUID");
  const base: PackedGlyphGrid = {
    version: 1,
    width: 1,
    height: 1,
    cellWidth: 192,
    cellHeight: 320,
    calibrationId: "",
    glyphIndices: new Uint16Array([1]),
    foreground: new Uint8Array([255, 255, 255, 255]),
    background: new Uint8Array(4),
    alpha: new Float32Array([1]),
  };
  for (const [cellWidth, cellHeight] of [
    [64.001, 128],
    [64, 128.001],
    [192, 320],
    [512, 512],
  ]) {
    expect(() =>
      gridToDocument({ ...base, cellWidth, cellHeight }, undefined, "Large"),
    ).toThrow(/adaptation required/i);
  }
  expect(ids).not.toHaveBeenCalled();
  for (const [cellWidth, cellHeight] of [
    [1, 1],
    [1.8, 3],
    [6.6, 11],
    [64, 128],
  ]) {
    const doc = gridToDocument(
      { ...base, cellWidth, cellHeight },
      undefined,
      "Compatible",
    );
    expect(validateDocument(doc)).toEqual(doc);
  }
});
it("legacy settings retain original independent converter geometry limits", () => {
  const source = { id: "legacy", revision: 0, width: 1, height: 1 };
  for (const patch of [
    { cellWidth: 1.8 },
    { cellWidth: 6.99 },
    { cellWidth: 16.01 },
    { cellHeight: 13.99 },
    { cellHeight: 28.01 },
    { cellWidth: 192, cellHeight: 320 },
  ])
    expect(() => legacySettingsToCharacter(settings(patch), source)).toThrow();
  for (const [cellWidth, cellHeight] of [
    [7, 14],
    [16, 28],
  ])
    expect(
      legacySettingsToCharacter(settings({ cellWidth, cellHeight }), source),
    ).toMatchObject({ cellWidth, cellHeight });
});
