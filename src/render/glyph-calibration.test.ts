import { beforeEach, expect, it, vi } from "vitest";
import {
  calibrateGlyphs,
  clearGlyphCalibrationCache,
  createGlyphCalibrator,
} from "./glyph-calibration";

const input = {
  fontFamily: "Test Mono",
  fontSize: 14,
  cellWidth: 9,
  cellHeight: 18,
  ramp: " e\u0301😀",
  fontRevision: "1",
};
let painted = "";
let load: ReturnType<typeof vi.fn>;
let raster: ReturnType<typeof vi.fn>;
beforeEach(() => {
  clearGlyphCalibrationCache();
  load = vi.fn().mockResolvedValue([]);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      load,
      check: () => true,
      [Symbol.iterator]: function* () {
        yield { family: "Test Mono", status: "loaded" };
        yield { family: "Other", status: "loaded" };
      },
    },
  });
  raster = vi.fn((_x: number, _y: number, width: number, height: number) => ({
    data: Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) =>
      i % 4 === 3 ? (painted === " " ? 0 : painted === "😀" ? 255 : 128) : 0,
    ),
  }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    clearRect: vi.fn(),
    fillText: (s: string) => {
      painted = s;
    },
    getImageData: raster,
  } as unknown as CanvasRenderingContext2D);
});
it("custom_graphemes_get_masks", async () => {
  const c = await calibrateGlyphs(input);
  expect(c.glyphs).toEqual([" ", "e\u0301", "😀"]);
  expect([...c.coverage]).toEqual([0, expect.closeTo(128 / 255), 1]);
  expect(c.masks.length).toBe(486);
  expect([...c.shapes.slice(18)]).toEqual(Array(9).fill(1));
  expect(load).toHaveBeenCalledWith("14px Test Mono", input.ramp);
});
it("font_geometry_invalidates_cache", async () => {
  const c = await calibrateGlyphs(input);
  expect((await calibrateGlyphs(input)).id).toBe(c.id);
  expect(load).toHaveBeenCalledTimes(1);
  for (const patch of [
    { cellWidth: 10 },
    { cellHeight: 19 },
    { fontSize: 15 },
    { fontFamily: "Other" },
    { fontRevision: "2" },
  ]) {
    expect((await calibrateGlyphs({ ...input, ...patch })).id).not.toBe(c.id);
  }
});
it("duplicate_graphemes_are_deduplicated_stably", async () => {
  expect((await calibrateGlyphs({ ...input, ramp: "😀é😀é" })).glyphs).toEqual([
    "é",
    "😀",
  ]);
  expect((await calibrateGlyphs({ ...input, ramp: "ababa" })).glyphs).toEqual([
    "a",
    "b",
  ]);
});
it("rejects_empty_and_single_unique_ramp", async () => {
  for (const ramp of ["", "aaa", "\na", "\u0301a", "a".repeat(513)])
    await expect(calibrateGlyphs({ ...input, ramp })).rejects.toThrow();
  for (const patch of [
    { fontSize: NaN },
    { cellWidth: 0 },
    { cellHeight: Infinity },
    { fontFamily: "" },
  ])
    await expect(calibrateGlyphs({ ...input, ...patch })).rejects.toThrow();
});
it("aborted_calibration_is_not_cached", async () => {
  const controller = new AbortController();
  load.mockImplementationOnce(async () => {
    controller.abort();
    return [];
  });
  await expect(calibrateGlyphs(input, controller.signal)).rejects.toMatchObject(
    { name: "AbortError" },
  );
  await calibrateGlyphs(input);
  expect(load).toHaveBeenCalledTimes(2);
});
it("zero masks remain finite and cached arrays cannot be poisoned", async () => {
  raster.mockImplementation(() => ({ data: new Uint8ClampedArray(648) }));
  const c = await calibrateGlyphs(input);
  expect([...c.coverage, ...c.shapes].every((v) => v === 0)).toBe(true);
  c.masks[0] = 255;
  c.glyphs[0] = "poison";
  expect((await calibrateGlyphs(input)).masks[0]).toBe(0);
  expect((await calibrateGlyphs(input)).glyphs[0]).toBe(" ");
});
it("deduplicates inflight work without sharing cancellation", async () => {
  let finish!: () => void;
  load.mockImplementationOnce(
    () =>
      new Promise<FontFace[]>((resolve) => {
        finish = () => resolve([]);
      }),
  );
  const controller = new AbortController();
  const a = calibrateGlyphs(input, controller.signal);
  const b = calibrateGlyphs(input);
  await Promise.resolve();
  controller.abort();
  finish();
  await expect(a).rejects.toMatchObject({ name: "AbortError" });
  await expect(b).resolves.toHaveProperty("version", 1);
  expect(load).toHaveBeenCalledTimes(1);
});
it("failed font loads are retryable and unsupported canvas rejects", async () => {
  load.mockRejectedValueOnce(new Error("font failed"));
  await expect(calibrateGlyphs(input)).rejects.toThrow("font failed");
  await expect(calibrateGlyphs(input)).resolves.toHaveProperty("version", 1);
  clearGlyphCalibrationCache();
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
  await expect(calibrateGlyphs(input)).rejects.toThrow(/canvas/i);
});
it("evicts least recently used entries at sixteen", async () => {
  for (let i = 0; i < 16; i++)
    await calibrateGlyphs({ ...input, fontRevision: String(i) });
  await calibrateGlyphs({ ...input, fontRevision: "0" });
  await calibrateGlyphs({ ...input, fontRevision: "16" });
  await calibrateGlyphs({ ...input, fontRevision: "0" });
  expect(load).toHaveBeenCalledTimes(17);
  await calibrateGlyphs({ ...input, fontRevision: "1" });
  expect(load).toHaveBeenCalledTimes(18);
});
it("awaits_font_load_before_rasterization_and_snapshots_input", async () => {
  let finish!: () => void;
  load.mockImplementationOnce(
    () =>
      new Promise<FontFace[]>((resolve) => {
        finish = () => resolve([]);
      }),
  );
  const mutable = { ...input };
  const work = calibrateGlyphs(mutable);
  await Promise.resolve();
  expect(raster).not.toHaveBeenCalled();
  mutable.ramp = "xy";
  finish();
  expect((await work).glyphs).toEqual([" ", "é", "😀"]);
});
it("shapes_are_absolute_local_alpha_coverage", async () => {
  raster.mockImplementation(
    (_x: number, _y: number, width: number, height: number) => {
      const data = new Uint8ClampedArray(width * height * 4);
      if (painted !== " ")
        for (let y = 0; y < height / 3; y++)
          for (let x = 0; x < width / 3; x++)
            data[(y * width + x) * 4 + 3] = 255;
      return { data };
    },
  );
  const c = await calibrateGlyphs(input);
  expect([...c.shapes.slice(9, 18)]).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]);
  expect([...c.coverage]).toEqual([0, 1, 1]);
});
it("rejects_unavailable_font_capability", async () => {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: undefined,
  });
  await expect(calibrateGlyphs(input)).rejects.toThrow(/font/i);
});
it("rejects_unregistered_named_font_even_when_check_claims_success", async () => {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      load: vi.fn().mockResolvedValue([]),
      check: () => true,
      [Symbol.iterator]: function* () {},
    },
  });
  await expect(
    calibrateGlyphs({ ...input, fontFamily: "Misspelled Font" }),
  ).rejects.toThrow(/registered.*font|font.*registered/i);
});
it("allows_intentionally_supported_generic_font_without_font_faces", async () => {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      load: vi.fn().mockResolvedValue([]),
      check: () => true,
      [Symbol.iterator]: function* () {},
    },
  });
  await expect(
    calibrateGlyphs({ ...input, fontFamily: "monospace" }),
  ).resolves.toHaveProperty("version", 1);
});
it("matches_loaded_face_family_exactly_and_accepts_load_results", async () => {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      load: vi
        .fn()
        .mockResolvedValue([{ family: '"Test Mono"', status: "loaded" }]),
      check: () => true,
    },
  });
  await expect(calibrateGlyphs(input)).resolves.toHaveProperty("version", 1);
  await expect(
    calibrateGlyphs({ ...input, fontFamily: "Test" }),
  ).rejects.toThrow(/registered/i);
});
it("rejects_loading_faces_and_ambiguous_family_lists", async () => {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      load: vi
        .fn()
        .mockResolvedValue([{ family: "Test Mono", status: "loading" }]),
      check: () => true,
    },
  });
  await expect(calibrateGlyphs(input)).rejects.toThrow(/registered/i);
  await expect(
    calibrateGlyphs({ ...input, fontFamily: "Test Mono, monospace" }),
  ).rejects.toThrow(/exact font family/i);
});

function deferredFont() {
  let resolve!: (faces: FontFace[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<FontFace[]>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve: () => resolve([]), reject };
}
it("admits before fonts/canvas, preserves ceil extents and fractional geometry", async () => {
  const c = createGlyphCalibrator();
  const font = deferredFont();
  load.mockReturnValueOnce(font.promise);
  const work = c.calibrateGlyphs({ ...input, cellWidth: 1.8, cellHeight: 3 });
  expect(c.usage.activeJobs).toBe(1);
  expect(c.usage.subscribers).toBe(1);
  expect(load).not.toHaveBeenCalled();
  await Promise.resolve();
  font.resolve();
  const result = await work;
  expect([
    result.cellWidth,
    result.cellHeight,
    result.maskWidth,
    result.maskHeight,
  ]).toEqual([1.8, 3, 2, 3]);
  const create = vi.spyOn(document, "createElement");
  const before = load.mock.calls.length;
  await expect(
    c.calibrateGlyphs({
      ...input,
      cellWidth: 512,
      cellHeight: 512,
      ramp: Array.from({ length: 256 }, (_, i) =>
        String.fromCodePoint(0x2800 + i),
      ).join(""),
    }),
  ).rejects.toMatchObject({ name: "CalibrationBudgetError" });
  expect(load).toHaveBeenCalledTimes(before);
  expect(create).not.toHaveBeenCalled();
  c.clearGlyphCalibrationCache();
  expect(c.usage.totalBytes).toBe(0);
});
it("rasterizes maximum reference geometry with a small actual ramp", async () => {
  const c = createGlyphCalibrator();
  const result = await c.calibrateGlyphs({
    ...input,
    cellWidth: 192,
    cellHeight: 320,
    ramp: " 😀",
  });
  expect(result.masks.length).toBe(192 * 320 * 2);
  expect(result.cellHeight).toBe(320);
  c.clearGlyphCalibrationCache();
});
it("same-key joins charge delivery only; aborted subscribers release once", async () => {
  const c = createGlyphCalibrator({ subscribers: 2 });
  const font = deferredFont();
  load.mockReturnValueOnce(font.promise);
  const ac = new AbortController();
  const a = c.calibrateGlyphs(input, ac.signal);
  const bytes = c.usage.activeJobBytes;
  const b = c.calibrateGlyphs(input);
  expect(c.usage.activeJobBytes).toBe(bytes);
  expect(c.usage.subscribers).toBe(2);
  await expect(c.calibrateGlyphs(input)).rejects.toMatchObject({
    name: "CalibrationBudgetError",
  });
  const rejected = expect(a).rejects.toMatchObject({ name: "AbortError" });
  ac.abort();
  await rejected;
  expect(c.usage.subscribers).toBe(1);
  await Promise.resolve();
  font.resolve();
  await b;
  expect(c.usage.activeJobs).toBe(0);
  expect(c.usage.subscribers).toBe(0);
  c.clearGlyphCalibrationCache();
});
it("all-aborted font loads keep job charges until settled and skip canvas", async () => {
  const c = createGlyphCalibrator({ activeJobs: 1 });
  const font = deferredFont();
  load.mockReturnValueOnce(font.promise);
  const ac = new AbortController();
  const a = c.calibrateGlyphs(input, ac.signal);
  await Promise.resolve();
  const rejected = expect(a).rejects.toMatchObject({ name: "AbortError" });
  ac.abort();
  await rejected;
  c.clearGlyphCalibrationCache();
  expect(c.usage.activeJobs).toBe(1);
  expect(c.usage.subscribers).toBe(0);
  await expect(c.calibrateGlyphs(input)).rejects.toMatchObject({
    name: "CalibrationBudgetError",
  });
  const create = vi.spyOn(document, "createElement");
  font.resolve();
  await new Promise((r) => setTimeout(r, 0));
  expect(create).not.toHaveBeenCalled();
  expect(c.usage.totalBytes).toBe(0);
});
it.each([true, false])(
  "clear retains active ownership and same-key replacement when old resolves first=%s",
  async (oldFirst) => {
    const c = createGlyphCalibrator();
    const old = deferredFont(),
      fresh = deferredFont();
    load.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const a = c.calibrateGlyphs(input);
    await Promise.resolve();
    c.clearGlyphCalibrationCache();
    expect(c.usage.activeJobs).toBe(1);
    const b = c.calibrateGlyphs(input);
    await Promise.resolve();
    expect(c.usage.activeJobs).toBe(2);
    if (oldFirst) {
      old.resolve();
      await a;
      const waiter = c.calibrateGlyphs(input);
      fresh.resolve();
      expect((await waiter).id).toBe((await b).id);
    } else {
      fresh.resolve();
      await b;
      old.resolve();
      await a;
    }
    const cached = await c.calibrateGlyphs(input);
    expect(cached.id).toBe((await b).id);
    expect(load).toHaveBeenCalledTimes(2);
    expect(c.usage.activeJobs).toBe(0);
    c.clearGlyphCalibrationCache();
    expect(c.usage.totalBytes).toBe(0);
  },
);
it("uncached deliveries, byte eviction and aggregate jobs use injected limits", async () => {
  const { estimateGlyphCalibration: e } = await import(
    "./glyph-calibration-budget"
  );
  const estimate = e(9, 18, 3);
  const c = createGlyphCalibrator({
    cacheBytes: estimate.cacheBytes,
    workingBytes:
      estimate.jobBytes + estimate.deliveryBytes + estimate.cacheBytes - 1,
  });
  await c.calibrateGlyphs(input);
  await c.calibrateGlyphs({ ...input, fontRevision: "b" });
  expect(c.usage.cacheEntries).toBe(1);
  await c.calibrateGlyphs(input);
  expect(load).toHaveBeenCalledTimes(3);
  c.clearGlyphCalibrationCache();
  const uncached = createGlyphCalibrator({ cacheBytes: 1 });
  await uncached.calibrateGlyphs(input);
  expect(uncached.usage.totalBytes).toBe(0);
  const font = deferredFont();
  load.mockReturnValueOnce(font.promise);
  const a = c.calibrateGlyphs(input);
  await expect(
    c.calibrateGlyphs({ ...input, fontRevision: "other" }),
  ).rejects.toMatchObject({ name: "CalibrationBudgetError" });
  await Promise.resolve();
  font.resolve();
  await a;
  c.clearGlyphCalibrationCache();
});
it("font/canvas/copy failures release reservations and retry", async () => {
  const c = createGlyphCalibrator();
  load.mockRejectedValueOnce(new Error("font failure"));
  await expect(c.calibrateGlyphs(input)).rejects.toThrow("font failure");
  expect(c.usage.totalBytes).toBe(0);
  raster.mockImplementationOnce(() => {
    throw new Error("raster failure");
  });
  await expect(c.calibrateGlyphs(input)).rejects.toThrow("raster failure");
  expect(c.usage.totalBytes).toBe(0);
  const slice = vi
    .spyOn(Uint8Array.prototype, "slice")
    .mockImplementationOnce(() => {
      throw new Error("copy failure");
    });
  await expect(c.calibrateGlyphs(input)).rejects.toThrow("copy failure");
  slice.mockRestore();
  expect(c.usage.subscribers).toBe(0);
  expect(c.usage.activeJobs).toBe(0);
  await expect(c.calibrateGlyphs(input)).resolves.toHaveProperty("version", 1);
  c.clearGlyphCalibrationCache();
});
it("batch cancellation stops partial raster and releases backing canvas", async () => {
  const c = createGlyphCalibrator();
  const ac = new AbortController();
  const create = vi.spyOn(document, "createElement");
  const work = c.calibrateGlyphs(
    { ...input, ramp: " abcdefghijklmnop" },
    ac.signal,
  );
  const rejected = expect(work).rejects.toMatchObject({ name: "AbortError" });
  await new Promise((r) => setTimeout(r, 0));
  expect(raster.mock.calls.length).toBe(8);
  ac.abort();
  await rejected;
  await new Promise((r) => setTimeout(r, 0));
  expect(raster.mock.calls.length).toBe(8);
  expect(c.usage.totalBytes).toBe(0);
  const canvas = create.mock.results.find(
    (r) => r.type === "return" && r.value instanceof HTMLCanvasElement,
  )!.value as HTMLCanvasElement;
  expect(canvas.width).toBe(0);
  expect(canvas.height).toBe(0);
});
it("joining subscribers must fit delivery bytes as well as count slots", async () => {
  const { estimateGlyphCalibration } = await import(
    "./glyph-calibration-budget"
  );
  const e = estimateGlyphCalibration(9, 18, 3);
  const c = createGlyphCalibrator({
    workingBytes: e.jobBytes + 2 * e.deliveryBytes - 1,
    cacheBytes: 1,
  });
  const font = deferredFont();
  load.mockReturnValueOnce(font.promise);
  const work = c.calibrateGlyphs(input);
  await expect(c.calibrateGlyphs(input)).rejects.toMatchObject({
    name: "CalibrationBudgetError",
  });
  expect(c.usage.subscribers).toBe(1);
  await Promise.resolve();
  font.resolve();
  await work;
  expect(c.usage.totalBytes).toBe(0);
});
