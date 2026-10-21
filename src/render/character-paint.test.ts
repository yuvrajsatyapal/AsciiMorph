import { readFileSync } from "node:fs";
import { DEFAULT_SETTINGS } from "@/converter/settings";
import { createCharacterEngine } from "./wasm-character";
import { legacySettingsToCharacter } from "./legacy-adapter";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GlyphCalibrationV1, PackedGlyphGrid } from "./character-contract";
import { paintCharacterGrid } from "./character-paint";

const calibration = (): GlyphCalibrationV1 => ({
  version: 1,
  id: "paint-cal",
  fontKey: "custom-font",
  cellWidth: 9,
  cellHeight: 18,
  glyphs: [" ", "X"],
  maskWidth: 2,
  maskHeight: 2,
  masks: new Uint8Array([0, 0, 0, 0, 255, 64, 128, 0]),
  coverage: new Float32Array([0, 1]),
  shapes: new Float32Array(18),
});
const grid = (): PackedGlyphGrid => ({
  version: 1,
  width: 3,
  height: 1,
  cellWidth: 9,
  cellHeight: 18,
  calibrationId: "paint-cal",
  glyphIndices: new Uint16Array([1, 1, 65535]),
  foreground: new Uint8Array([255, 0, 0, 128, 0, 0, 255, 255, 0, 0, 0, 0]),
  background: new Uint8Array([
    10, 20, 30, 255, 40, 50, 60, 64, 70, 80, 90, 128,
  ]),
  alpha: new Float32Array([128 / 255, 1, 0]),
});
function canvasBoundary() {
  const contexts: ReturnType<typeof context>[] = [];
  function context() {
    const c = {
      globalAlpha: 0.37,
      globalCompositeOperation: "xor",
      fillStyle: "#beef00",
      imageSmoothingEnabled: false,
      filter: "blur(2px)",
      shadowBlur: 2,
      shadowColor: "red",
      shadowOffsetX: 3,
      shadowOffsetY: 4,
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      scale: vi.fn(),
      clearRect: vi.fn(),
      createImageData: vi.fn((w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      })),
      putImageData: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
    };
    const stack: Record<string, unknown>[] = [];
    c.save.mockImplementation(() => {
      stack.push({
        globalAlpha: c.globalAlpha,
        globalCompositeOperation: c.globalCompositeOperation,
        fillStyle: c.fillStyle,
        imageSmoothingEnabled: c.imageSmoothingEnabled,
        filter: c.filter,
        shadowBlur: c.shadowBlur,
        shadowColor: c.shadowColor,
        shadowOffsetX: c.shadowOffsetX,
        shadowOffsetY: c.shadowOffsetY,
      });
    });
    c.restore.mockImplementation(() => {
      Object.assign(c, stack.pop());
    });
    return c;
  }
  const create = vi.spyOn(document, "createElement");
  const original = document.createElement.bind(document);
  create.mockImplementation(((tag: string) => {
    if (tag !== "canvas") return original(tag);
    const c = context();
    contexts.push(c);
    return {
      width: 0,
      height: 0,
      getContext: () => c,
    } as unknown as HTMLCanvasElement;
  }) as typeof document.createElement);
  return { contexts, create, output: context() };
}
afterEach(() => vi.restoreAllMocks());

describe("packed character paint", () => {
  it("preview_never_encodes_source_for_real_wasm_packed_output", async () => {
    const b = canvasBoundary(),
      c = calibration(),
      encode = vi.spyOn(globalThis, "btoa");
    const e = await createCharacterEngine(
      readFileSync("public/wasm/asciimorph_engine.wasm"),
    );
    try {
      const source = { id: "paint-source", revision: 0, width: 1, height: 1 };
      e.setSource({
        ...source,
        rgba: new Uint8ClampedArray([255, 255, 255, 128]),
      });
      e.setCalibration(c);
      const s = legacySettingsToCharacter(
        {
          ...DEFAULT_SETTINGS,
          width: 1,
          height: 1,
          preserveAspect: false,
          charset: "custom",
          custom: " X",
          mode: "color",
          bg: "#123456",
        },
        source,
      );
      for (let render = 0; render < 3; render++) {
        const id = e.begin(s);
        while (e.step(id, 1024) === "pending") {
          /* Real WASM output. */
        }
        const g = e.takeGrid(id);
        expect(g.glyphIndices[0]).toBe(1);
        paintCharacterGrid(
          b.output as unknown as CanvasRenderingContext2D,
          g,
          c,
          1,
        );
      }
      expect(encode).not.toHaveBeenCalled();
      expect(b.create).toHaveBeenCalledTimes(2);
    } finally {
      e.dispose();
    }
  });
  it("paint_reuses_glyph_surfaces_and_tints_each_full_color_cell", () => {
    const b = canvasBoundary(),
      c = calibration(),
      g = grid();
    const colors: unknown[] = [],
      alphas: number[] = [];
    b.output.drawImage.mockImplementation(() => {
      alphas.push(b.output.globalAlpha);
    });
    paintCharacterGrid(
      b.output as unknown as CanvasRenderingContext2D,
      g,
      c,
      2,
    );
    const initial = b.create.mock.calls.length;
    expect(initial).toBe(2); // One used glyph mask and one reusable tint scratch.
    expect(
      b.contexts.flatMap((ctx) => ctx.putImageData.mock.calls),
    ).toHaveLength(1);
    const mask = b.contexts.flatMap(
      (ctx) => ctx.putImageData.mock.calls,
    )[0][0] as ImageData;
    expect([...mask.data].filter((_, i) => i % 4 === 3)).toEqual([
      255, 64, 128, 0,
    ]);
    expect(alphas).toEqual([g.alpha[0], 1]);
    const scratch = b.contexts.find(
      (ctx) => ctx.putImageData.mock.calls.length === 0,
    )!;
    scratch.fillRect.mockImplementation(() => {
      colors.push(scratch.fillStyle);
    });
    for (let i = 0; i < 20; i++)
      paintCharacterGrid(
        b.output as unknown as CanvasRenderingContext2D,
        g,
        c,
        2,
      );
    expect(b.create).toHaveBeenCalledTimes(initial);
    expect(colors.slice(0, 2)).toEqual(["#ff0000", "#0000ff"]);
    expect(
      b.contexts.flatMap((ctx) => ctx.putImageData.mock.calls),
    ).toHaveLength(1);
    expect(b.output.fillText).not.toHaveBeenCalled();
    expect(b.output.clearRect).not.toHaveBeenCalled();
    expect(b.output.scale).toHaveBeenCalledWith(2, 2);
  });
  it("paints_background_independently_even_for_a_transparent_foreground", () => {
    const b = canvasBoundary(),
      fills: unknown[] = [];
    b.output.fillRect.mockImplementation((...args: unknown[]) => {
      fills.push([b.output.fillStyle, b.output.globalAlpha, ...args]);
    });
    paintCharacterGrid(
      b.output as unknown as CanvasRenderingContext2D,
      grid(),
      calibration(),
      1,
    );
    expect(fills).toEqual([
      ["#0a141e", 1, 0, 0, 9, 18],
      ["#28323c", 64 / 255, 9, 0, 9, 18],
      ["#46505a", 128 / 255, 18, 0, 9, 18],
    ]);
  });
  it("restores_caller_state_and_restores_on_draw_failure", () => {
    const b = canvasBoundary(),
      ctx = b.output as unknown as CanvasRenderingContext2D;
    const before = {
      globalAlpha: ctx.globalAlpha,
      globalCompositeOperation: ctx.globalCompositeOperation,
      fillStyle: ctx.fillStyle,
      filter: ctx.filter,
      shadowBlur: ctx.shadowBlur,
      shadowOffsetX: ctx.shadowOffsetX,
      shadowOffsetY: ctx.shadowOffsetY,
      shadowColor: ctx.shadowColor,
    };
    paintCharacterGrid(ctx, grid(), calibration(), 1);
    expect(ctx).toMatchObject(before);
    b.output.drawImage.mockImplementationOnce(() => {
      throw new Error("draw failed");
    });
    expect(() => paintCharacterGrid(ctx, grid(), calibration(), 1)).toThrow(
      "draw failed",
    );
    expect(ctx).toMatchObject(before);
    expect(b.output.save).toHaveBeenCalledTimes(2);
    expect(b.output.restore).toHaveBeenCalledTimes(2);
  });
  it("rejects_invalid_geometry_calibration_and_output_budget_before_allocating", () => {
    const b = canvasBoundary(),
      ctx = b.output as unknown as CanvasRenderingContext2D;
    for (const scale of [0, -1, NaN, Infinity, 100000])
      expect(() =>
        paintCharacterGrid(ctx, grid(), calibration(), scale),
      ).toThrow();
    expect(() => paintCharacterGrid(ctx, grid(), undefined, 1)).toThrow(
      /calibration/i,
    );
    expect(() =>
      paintCharacterGrid(ctx, grid(), { ...calibration(), id: "wrong" }, 1),
    ).toThrow(/calibration/i);
    expect(() =>
      paintCharacterGrid(
        ctx,
        { ...grid(), glyphIndices: new Uint16Array([2, 1, 65535]) },
        calibration(),
        1,
      ),
    ).toThrow(/glyph/i);
    const tooLarge = {
      ...calibration(),
      maskWidth: 16384,
      maskHeight: 16384,
      masks: new Uint8Array(0),
    };
    expect(() => paintCharacterGrid(ctx, grid(), tooLarge, 1)).toThrow(/mask/i);
    const oversizedMasks = {
      ...calibration(),
      maskWidth: 4096,
      maskHeight: 3000,
      masks: new Uint8Array(4096 * 3000 * 2),
    };
    expect(() => paintCharacterGrid(ctx, grid(), oversizedMasks, 1)).toThrow(
      /mask.*budget/i,
    );
    expect(b.create).not.toHaveBeenCalled();
    expect(b.output.save).not.toHaveBeenCalled();
  });
  it("uses_canonical_braille_geometry_and_ignores_an_unrelated_glyph_dictionary", () => {
    const b = canvasBoundary(),
      c = calibration();
    const g = {
      ...grid(),
      calibrationId: "",
      glyphIndices: new Uint16Array([1, 8, 65535]),
    };
    paintCharacterGrid(
      b.output as unknown as CanvasRenderingContext2D,
      g,
      c,
      1,
    );
    const masks = b.contexts
      .flatMap((ctx) => ctx.putImageData.mock.calls)
      .map((call) => call[0] as ImageData);
    expect(masks).toHaveLength(2);
    expect(masks.every((m) => m.width === 9 && m.height === 18)).toBe(true);
    const centroidX = (m: ImageData) => {
      let sum = 0,
        weighted = 0;
      for (let i = 3; i < m.data.length; i += 4) {
        sum += m.data[i];
        weighted += m.data[i] * (((i - 3) / 4) % m.width);
      }
      return weighted / sum;
    };
    expect(centroidX(masks[0])).toBeLessThan(4);
    expect(centroidX(masks[1])).toBeGreaterThan(4);
    const count = b.create.mock.calls.length;
    paintCharacterGrid(
      b.output as unknown as CanvasRenderingContext2D,
      g,
      undefined,
      2,
    );
    expect(b.create).toHaveBeenCalledTimes(count);
    expect(b.output.fillText).not.toHaveBeenCalled();
  });
  it("bounds_retained_mask_dictionaries_when_calibrations_change", () => {
    const b = canvasBoundary(),
      ctx = b.output as unknown as CanvasRenderingContext2D,
      first = calibration();
    paintCharacterGrid(ctx, grid(), first, 1);
    for (let i = 0; i < 20; i++) {
      const c = { ...calibration(), id: `churn-${i}` };
      paintCharacterGrid(ctx, { ...grid(), calibrationId: c.id }, c, 1);
    }
    const before = b.create.mock.calls.length;
    paintCharacterGrid(ctx, grid(), first, 1);
    expect(b.create.mock.calls.length).toBeGreaterThan(before); // Old dictionaries were evicted.
  });
});
