import { readFileSync } from "node:fs";
import { afterEach, describe, it, expect, vi } from "vitest";
import { createCharacterEngine } from "./wasm-character";
import type {
  CharacterSettingsV1,
  GlyphCalibrationV1,
  SourceUpload,
} from "./character-contract";
const bytes = readFileSync("public/wasm/asciimorph_engine.wasm");
const settings: CharacterSettingsV1 = {
  version: 1,
  width: 1,
  height: 1,
  cellWidth: 10,
  cellHeight: 18,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  rotation: 0,
  brightness: 0,
  contrast: 0,
  gamma: 1,
  saturation: 100,
  density: 1,
  sharpness: 0,
  edge: 0,
  shapeAware: false,
  smartEdges: false,
  mappingInvert: false,
  outputInvert: false,
  mode: "color",
  fg: 0xffffff,
  bg: null,
  mapping: "glyph",
  dither: "none",
  seed: 0,
};
const source = (): SourceUpload => ({
  id: "source",
  revision: 1,
  width: 1,
  height: 1,
  rgba: new Uint8ClampedArray([255, 255, 255, 255]),
});
const calibration = (): GlyphCalibrationV1 => ({
  version: 1,
  id: "cal",
  fontKey: "mono",
  cellWidth: 10,
  cellHeight: 18,
  glyphs: [" ", "#"],
  maskWidth: 1,
  maskHeight: 1,
  masks: new Uint8Array([0, 255]),
  coverage: new Float32Array([0, 1]),
  shapes: new Float32Array([...Array(9).fill(0), ...Array(9).fill(1)]),
});
function finish(
  e: Awaited<ReturnType<typeof createCharacterEngine>>,
  id: number,
) {
  while (e.step(id, 1024) === "pending") {
    /* Cooperative progress. */
  }
  return e.takeGrid(id);
}
interface Raw {
  memory: WebAssembly.Memory;
  render_abi_version(): number;
  render_create(budget: number): number;
  render_drop(handle: number): number;
  render_stage(handle: number, length: number): number;
  render_unstage(handle: number, ptr: number): number;
  render_upload(
    handle: number,
    kind: number,
    ptr: number,
    length: number,
  ): number;
  render_begin(handle: number, ptr: number, length: number): number;
  render_error(handle: number): number;
}
/** Forward every call to the real compiled WASM, recording only uploads. */
function instrument() {
  const instantiate = WebAssembly.instantiate.bind(WebAssembly);
  const uploads: number[] = [];
  let memory: WebAssembly.Memory | undefined;
  const spy = vi.spyOn(WebAssembly, "instantiate");
  function forward(
    input: BufferSource,
    imports?: WebAssembly.Imports,
  ): Promise<WebAssembly.WebAssemblyInstantiatedSource>;
  function forward(
    input: WebAssembly.Module,
    imports?: WebAssembly.Imports,
  ): Promise<WebAssembly.Instance>;
  async function forward(
    input: BufferSource | WebAssembly.Module,
    imports?: WebAssembly.Imports,
  ): Promise<WebAssembly.WebAssemblyInstantiatedSource | WebAssembly.Instance> {
    if (input instanceof WebAssembly.Module) return instantiate(input, imports);
    const result = await instantiate(input, imports);
    const raw = result.instance.exports as unknown as Raw;
    memory = raw.memory;
    return {
      module: result.module,
      instance: {
        exports: {
          ...result.instance.exports,
          render_upload: (...args: [number, number, number, number]) => {
            uploads.push(args[1]);
            return raw.render_upload(...args);
          },
        },
      },
    };
  }
  spy.mockImplementation(forward);
  return {
    uploads,
    memory: () => {
      if (!memory) throw new Error("Missing memory");
      return memory;
    },
  };
}
afterEach(() => vi.restoreAllMocks());
describe("character WASM session", () => {
  it("retains_source_until_revision_changes", async () => {
    const observed = instrument();
    const e = await createCharacterEngine(bytes);
    for (let i = 0; i < 100; i++) {
      e.setSource(source());
      e.setCalibration(calibration());
      const grid = finish(e, e.begin({ ...settings, seed: i }));
      expect([...grid.glyphIndices]).toEqual([1]);
      expect(grid.calibrationId).toBe("cal");
    }
    expect(observed.uploads).toEqual([1, 2]);
    e.setSource({ ...source(), revision: 2 });
    e.setCalibration({ ...calibration(), id: "cal2" });
    expect(observed.uploads).toEqual([1, 2, 1, 2]);
    e.dispose();
  });
  it("growth_does_not_detach_returned_grid", async () => {
    const observed = instrument();
    const e = await createCharacterEngine(bytes);
    e.setSource(source());
    e.setCalibration(calibration());
    const grid = finish(e, e.begin(settings));
    const before = {
      foreground: grid.foreground.slice(),
      background: grid.background.slice(),
      alpha: grid.alpha.slice(),
      indices: grid.glyphIndices.slice(),
    };
    const oldBuffer = observed.memory().buffer;
    observed.memory().grow(1);
    expect(observed.memory().buffer).not.toBe(oldBuffer);
    e.setSource({
      id: "large",
      revision: 2,
      width: 1024,
      height: 1024,
      rgba: new Uint8ClampedArray(1024 * 1024 * 4),
    });
    expect(grid.foreground).toEqual(before.foreground);
    expect(grid.background).toEqual(before.background);
    expect(grid.alpha).toEqual(before.alpha);
    expect(grid.glyphIndices).toEqual(before.indices);
    expect(finish(e, e.begin(settings)).glyphIndices[0]).toBe(65535);
    e.dispose();
  });
  it("dispose_is_idempotent and stale jobs reject", async () => {
    const e = await createCharacterEngine(bytes);
    expect(() => e.begin(settings)).toThrow();
    e.setSource(source());
    e.setCalibration(calibration());
    const id = e.begin(settings);
    e.cancel(id);
    expect(() => e.step(id, 1)).toThrow();
    expect(() => e.cancel(id)).toThrow();
    const done = e.begin(settings);
    finish(e, done);
    expect(() => e.takeGrid(done)).toThrow();
    e.dispose();
    e.dispose();
    expect(() => e.setSource(source())).toThrow();
  });
  it("validates settings and preserves identity after failed source replacement", async () => {
    const e = await createCharacterEngine(bytes);
    e.setSource(source());
    e.setCalibration(calibration());
    expect(() => e.begin({ ...settings, gamma: NaN })).toThrow();
    expect(() => e.setSource({ ...source(), width: 2 })).toThrow();
    expect(() => e.begin({ ...settings, cellWidth: 11 })).toThrow();
    expect(() => e.step(e.begin(settings), -1)).toThrow();
    expect(finish(e, e.begin(settings)).glyphIndices[0]).toBe(1);
    e.dispose();
  });
  it("keeps two independent jobs and invalidates dependent jobs on replacement", async () => {
    const e = await createCharacterEngine(bytes);
    e.setSource(source());
    const braille = e.begin({ ...settings, mapping: "braille" });
    e.setCalibration(calibration());
    const glyph = e.begin(settings);
    expect(() => e.begin(settings)).toThrow();
    e.setCalibration({ ...calibration(), id: "new" });
    expect(() => e.step(glyph, 1)).toThrow();
    expect(finish(e, braille).calibrationId).toBe("");
    const pending = e.begin(settings);
    e.setSource({ ...source(), revision: 2 });
    expect(() => e.step(pending, 1)).toThrow();
    e.dispose();
  });
  it("transports calibrated direction indices and permits Braille without calibration", async () => {
    const e = await createCharacterEngine(bytes);
    e.setSource(source());
    expect(
      finish(e, e.begin({ ...settings, mapping: "braille", smartEdges: true }))
        .calibrationId,
    ).toBe("");
    e.setCalibration(calibration());
    expect(() => e.begin({ ...settings, smartEdges: true })).toThrow();
    const c = calibration();
    e.setCalibration({
      ...c,
      id: "directions",
      glyphs: ["\\", "-", "/", "|"],
      masks: new Uint8Array([255, 170, 80, 0]),
      coverage: new Float32Array([1, 0.7, 0.3, 0]),
      shapes: new Float32Array(36).fill(0.5),
    });
    expect(
      finish(e, e.begin({ ...settings, smartEdges: true })).calibrationId,
    ).toBe("directions");
    e.dispose();
  });
  it("validates independently encoded wire spans, versions, flags, NaN and budget peaks", async () => {
    const { instance } = await WebAssembly.instantiate(bytes, {});
    const raw = instance.exports as unknown as Raw;
    const h = raw.render_create(256),
      other = raw.render_create(256);
    const ptr = raw.render_stage(h, 36);
    const view = new DataView(raw.memory.buffer, ptr, 36);
    [1, 1, 1, 1, 0, 0, 0, 0].forEach((v, i) => view.setUint32(i * 4, v, true));
    new Uint8Array(raw.memory.buffer, ptr + 32, 4).fill(255);
    expect(raw.render_upload(other, 1, ptr, 36)).toBe(0);
    expect(raw.render_upload(h, 1, ptr + 1, 35)).toBe(0);
    expect(raw.render_upload(h, 1, 0xffffffff, 36)).toBe(0);
    expect(raw.render_upload(h, 1, ptr, 36)).toBe(1);
    view.setUint32(0, 2, true);
    expect(raw.render_upload(h, 1, ptr, 36)).toBe(0);
    expect(raw.render_error(h)).toBe(2);
    expect(raw.render_unstage(h, ptr)).toBe(1);
    expect(raw.render_upload(h, 1, ptr, 36)).toBe(0);
    const cfg = raw.render_stage(h, 160);
    const block = new DataView(raw.memory.buffer, cfg, 160);
    [1, 1, 1, 0, 0, 2, 1, 0].forEach((v, i) => block.setUint32(i * 4, v, true));
    [10, 18, 0, 0, 1, 1, 0, 0, 1, 100, 1, 0, 0, 0xffffff, -1, 0].forEach(
      (v, i) => block.setFloat64(32 + i * 8, v, true),
    );
    block.setUint32(16, 16, true);
    expect(raw.render_begin(h, cfg, 160)).toBe(0);
    expect(raw.render_error(h)).toBe(1);
    block.setUint32(16, 0, true);
    block.setFloat64(96, NaN, true);
    expect(raw.render_begin(h, cfg, 160)).toBe(0);
    expect(raw.render_error(h)).toBe(1);
    block.setFloat64(96, 1, true);
    expect(raw.render_begin(h, cfg, 160)).toBe(0);
    expect(raw.render_error(h)).toBe(3);
    expect(raw.render_drop(h)).toBe(1);
    expect(raw.render_drop(h)).toBe(0);
    raw.render_drop(other);
  });
});

describe("character WASM typed budget boundary", () => {
  it("custom_budget_rejects_peak_while_default_passes", async () => {
    const limited = await createCharacterEngine(bytes, {
      memoryBudgetBytes: 256,
    });
    limited.setSource(source());
    expect(() => limited.begin({ ...settings, mapping: "braille" })).toThrow(
      expect.objectContaining({ code: "BudgetExceeded" }),
    );
    limited.dispose();
    const normal = await createCharacterEngine(bytes);
    normal.setSource(source());
    expect(
      finish(normal, normal.begin({ ...settings, mapping: "braille" })).width,
    ).toBe(1);
    normal.dispose();
  });
  it("validates_u32_budget_and_reports_typed_missing_disposed_inputs", async () => {
    for (const memoryBudgetBytes of [0, -1, 0x100000000, NaN, 1.5])
      await expect(
        createCharacterEngine(bytes, { memoryBudgetBytes }),
      ).rejects.toMatchObject({ code: "InvalidInput" });
    const e = await createCharacterEngine(bytes);
    expect(() => e.begin(settings)).toThrow(
      expect.objectContaining({ code: "MissingSource" }),
    );
    e.setSource(source());
    expect(() => e.begin(settings)).toThrow(
      expect.objectContaining({ code: "MissingCalibration" }),
    );
    expect(() =>
      e.begin({ ...settings, version: 2 } as unknown as CharacterSettingsV1),
    ).toThrow(expect.objectContaining({ code: "UnsupportedVersion" }));
    e.dispose();
    expect(() => e.begin(settings)).toThrow(
      expect.objectContaining({ code: "Disposed" }),
    );
  });
});

it("expanded f64 geometry survives real WASM with independent raster extents", async () => {
  const e = await createCharacterEngine(bytes);
  e.setSource(source());
  for (const [cellWidth, cellHeight] of [
    [1.8, 3],
    [6.6, 11],
    [192, 320],
    [512, 512],
  ]) {
    const c = {
      ...calibration(),
      id: `geometry-${cellWidth}`,
      cellWidth,
      cellHeight,
      maskWidth: 3,
      maskHeight: 2,
      masks: new Uint8Array(12).fill(255),
    };
    e.setCalibration(c);
    expect(() =>
      e.begin({
        ...settings,
        cellWidth: cellWidth === 512 ? 511.9 : cellWidth + 0.1,
        cellHeight,
      }),
    ).toThrow(/calibration/i);
    const g = finish(e, e.begin({ ...settings, cellWidth, cellHeight }));
    expect([g.cellWidth, g.cellHeight]).toEqual([cellWidth, cellHeight]);
    expect(g.calibrationId).toBe(c.id);
  }
  e.dispose();
});
it("staged replacement peak preserves previous real WASM calibration and job", async () => {
  const e = await createCharacterEngine(bytes, { memoryBudgetBytes: 1000 });
  e.setSource(source());
  e.setCalibration(calibration());
  const id = e.begin(settings);
  expect(() =>
    e.setCalibration({
      ...calibration(),
      id: "large",
      maskWidth: 180,
      masks: new Uint8Array(360),
    }),
  ).toThrow(expect.objectContaining({ code: "BudgetExceeded" }));
  expect(finish(e, id).calibrationId).toBe("cal");
  expect(finish(e, e.begin(settings)).calibrationId).toBe("cal");
  e.dispose();
});
