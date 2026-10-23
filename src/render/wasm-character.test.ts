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
function instrument(
  omitted: string[] = [],
  contextVersion?: number,
  retentionVersion?: number,
  cancellation?: { status: number; error: number },
) {
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
          ...Object.fromEntries(
            Object.entries(result.instance.exports).filter(
              ([name]) => !omitted.includes(name),
            ),
          ),
          ...(contextVersion === undefined
            ? {}
            : { render_characters_context_version: () => contextVersion }),
          ...(retentionVersion === undefined
            ? {}
            : {
                render_characters_atlas_retention_version: () =>
                  retentionVersion,
              }),
          ...(cancellation
            ? {
                render_cancel: () => cancellation.status,
                render_error: () => cancellation.error,
              }
            : {}),
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

const pSettings = {
  version: 1 as const,
  frameWidth: 5,
  frameHeight: 3,
  fontSize: 3,
  renderScale: 1 as const,
  brightness: 0,
  contrast: 0,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  rotation: 0 as const,
  backdrop: "none" as const,
};
const pSource = (): SourceUpload => ({
  id: "profile",
  revision: 1,
  width: 5,
  height: 3,
  rgba: new Uint8ClampedArray(
    Array.from({ length: 15 }, (_, i) => [
      ...(i % 5 < 2 ? [0, 0, 0] : [255, 255, 255]),
      255,
    ]).flat(),
  ),
});
const pAtlas = () => ({
  version: 1 as const,
  calibration: {
    ...calibration(),
    id: "profile-atlas",
    glyphs: [".", "#"],
    cellWidth: 0.6 * 3,
    cellHeight: 3,
    masks: new Uint8Array([0, 0]),
  },
  originX: 0,
  originY: 0,
  placement: "top-start-ltr" as const,
  ordering: "input" as const,
  fontPolicy: "reference-system-monospace" as const,
  spaceIndexOr65535: 65535,
});
function finishFrame(
  e: Awaited<ReturnType<typeof createCharacterEngine>>,
  id: number,
) {
  while (e.step(id, 1) === "pending") {}
  return e.takeFrame(id);
}
describe("additive Characters WASM profile", () => {
  it("returns independent native fixture exact empty-dot vs literal space and reuses retained uploads", async () => {
    const observed = instrument(),
      e = await createCharacterEngine(bytes);
    e.setSource(pSource());
    e.setAtlas(pAtlas());
    expect(e.charactersProfileAvailable).toBe(true);
    for (let i = 0; i < 3; i++) {
      const f = finishFrame(e, e.beginCharacters(pSettings));
      expect([...f.rgba]).toEqual(Array(60).fill(0));
      expect([...f.grid!.glyphIndices]).toEqual([65535, 0]);
      expect([...f.grid!.foreground]).toEqual([0, 0, 0, 0, 255, 255, 255, 255]);
      expect([...f.grid!.alpha]).toEqual([0, 1]);
    }
    expect(observed.uploads).toEqual([1, 2]);
    const a = pAtlas();
    a.calibration = {
      ...a.calibration,
      id: "literal-space",
      glyphs: [" ", "#"],
    };
    a.spaceIndexOr65535 = 0;
    e.setAtlas(a);
    expect([
      ...finishFrame(e, e.beginCharacters(pSettings)).grid!.glyphIndices,
    ]).toEqual([65535, 65535]);
    e.dispose();
  });
  it("separates legacy/profile readback without releasing wrong-kind handles", async () => {
    const e = await createCharacterEngine(bytes);
    e.setSource(pSource());
    e.setAtlas(pAtlas());
    const id = e.beginCharacters(pSettings);
    while (e.step(id, 4096) === "pending") {}
    expect(() => e.takeGrid(id)).toThrow();
    expect(e.takeFrame(id).width).toBe(5);
    const old = e.begin({ ...settings, mapping: "braille" });
    while (e.step(old, 4096) === "pending") {}
    expect(() => e.takeFrame(old)).toThrow();
    expect(e.takeGrid(old).width).toBe(1);
    e.dispose();
  });
  it("source/calibration replacement preserves failed jobs and invalidates successful dependent jobs", async () => {
    const e = await createCharacterEngine(bytes, { memoryBudgetBytes: 6000 });
    e.setSource(pSource());
    e.setAtlas(pAtlas());
    const a = e.beginCharacters(pSettings),
      b = e.beginCharacters(pSettings);
    expect(() => e.beginCharacters(pSettings)).toThrow();
    expect(() =>
      e.setAtlas({
        ...pAtlas(),
        calibration: {
          ...pAtlas().calibration,
          id: "huge",
          maskWidth: 100,
          maskHeight: 100,
          masks: new Uint8Array(20000),
        },
      }),
    ).toThrow();
    expect(finishFrame(e, a).width).toBe(5);
    e.cancel(b);
    const c = e.beginCharacters(pSettings);
    e.setSource({ ...pSource(), revision: 2 });
    expect(() => e.step(c, 1)).toThrow();
    const d = e.beginCharacters(pSettings);
    e.setCalibration({ ...pAtlas().calibration, id: "legacy-new" });
    expect(e.step(d, 1)).toBe("pending");
    expect(finishFrame(e, d).grid!.calibrationId).toBe("profile-atlas");
    expect(() => e.beginCharacters(pSettings)).toThrow();
    e.dispose();
  });
  it("renders complete solid/blur contexts with independently specified constant pixels", async () => {
    const e = await createCharacterEngine(bytes);
    expect(e.charactersContextVersion).toBe(1);
    e.setSource({
      ...source(),
      rgba: new Uint8ClampedArray([30, 90, 180, 128]),
    });
    e.setAtlas(pAtlas());
    for (const [backdrop, expected] of [
      ["none", [0, 0, 0, 0]],
      ["solid", [0, 0, 0, 255]],
      ["blur", [30, 90, 180, 128]],
    ] as const) {
      const f = finishFrame(
        e,
        e.beginCharacters({
          ...pSettings,
          frameWidth: 1,
          frameHeight: 1,
          backdrop,
        }),
      );
      expect([...f.rgba]).toEqual(expected);
      expect(f.grid).toBeNull();
    }
    e.dispose();
  });
  it("returns null grid full frame and protects retained metadata from caller mutations", async () => {
    const e = await createCharacterEngine(bytes);
    e.setSource({ ...source(), id: "small" });
    const a = pAtlas();
    e.setAtlas(a);
    a.calibration.glyphs[0] = " ";
    a.originX = 100;
    const f = finishFrame(
      e,
      e.beginCharacters({ ...pSettings, frameWidth: 1, frameHeight: 1 }),
    );
    expect(f.grid).toBeNull();
    expect([...f.rgba]).toEqual([0, 0, 0, 0]);
    e.dispose();
  });
});

it.each([
  "render_characters_profile_version",
  "render_begin_characters_v1",
  "render_frame_output_ptr",
  "render_frame_output_len",
])("missing optional %s leaves legacy usable", async (name) => {
  instrument([name]);
  const e = await createCharacterEngine(bytes);
  expect(e.charactersProfileAvailable).toBe(false);
  expect(e.charactersContextVersion).toBeNull();
  e.setSource(source());
  e.setCalibration(calibration());
  expect(finish(e, e.begin(settings)).width).toBe(1);
  expect(() =>
    e.beginCharacters({ ...pSettings, frameWidth: 1, frameHeight: 1 }),
  ).toThrow(expect.objectContaining({ code: "CapabilityUnavailable" }));
  e.dispose();
});
it("upgrading the same retained calibration to an atlas invalidates legacy numeric handles", async () => {
  const e = await createCharacterEngine(bytes);
  e.setSource(pSource());
  e.setCalibration(pAtlas().calibration);
  const old = e.begin({ ...settings, cellWidth: 0.6 * 3, cellHeight: 3 });
  e.setAtlas(pAtlas());
  expect(() => e.step(old, 1)).toThrow();
  const a = e.beginCharacters(pSettings),
    b = e.beginCharacters(pSettings);
  e.cancel(a);
  e.cancel(b);
  e.dispose();
});
it("same atlas identity cannot silently change origins, font policy or literal-space metadata", async () => {
  const e = await createCharacterEngine(bytes);
  e.setSource(pSource());
  e.setAtlas(pAtlas());
  const id = e.beginCharacters(pSettings);
  expect(() => e.setAtlas({ ...pAtlas(), originX: 0.5 })).toThrow(
    expect.objectContaining({ code: "InvalidInput" }),
  );
  expect(finishFrame(e, id).width).toBe(5);
  e.dispose();
});
it("profile ABI preserves exact independently expected fractional alpha and zero-area2x0 header", async () => {
  const e = await createCharacterEngine(bytes);
  e.setSource(pSource());
  const a = pAtlas();
  a.calibration.masks[0] = 255;
  a.originX = -0.5;
  a.originY = 0.5;
  e.setAtlas(a);
  const f = finishFrame(e, e.beginCharacters(pSettings)),
    expected = new Uint8Array(60);
  for (const [x, y, alpha] of [
    [1, 0, 89],
    [2, 0, 38],
    [1, 1, 89],
    [2, 1, 38],
  ])
    expected.set([255, 255, 255, alpha], (y * 5 + x) * 4);
  expect(f.rgba).toEqual(expected);
  e.setSource({
    ...pSource(),
    revision: 2,
    height: 2,
    rgba: pSource().rgba.slice(0, 40),
  });
  const empty = finishFrame(
    e,
    e.beginCharacters({ ...pSettings, frameHeight: 2 }),
  );
  expect(empty.grid).toBeNull();
  expect(empty.rgba).toEqual(new Uint8Array(40));
  e.dispose();
});
it("profile cropped rotated S2 frame agrees with independent flat-probe expected bytes", async () => {
  const e = await createCharacterEngine(bytes);
  e.setSource(pSource());
  const a = pAtlas();
  a.calibration = {
    ...a.calibration,
    id: "scale2",
    cellWidth: 0.6 * 3 * 2,
    cellHeight: 6,
  };
  e.setAtlas(a);
  const f = finishFrame(
    e,
    e.beginCharacters({
      ...pSettings,
      frameWidth: 6,
      frameHeight: 6,
      renderScale: 2,
      rotation: 90,
      crop: { x: 0.4, y: 0, width: 0.6, height: 1 },
    }),
  );
  expect(f.rgba).toEqual(new Uint8Array(144));
  expect([...f.grid!.glyphIndices]).toEqual([65535]);
  expect([
    f.grid!.width,
    f.grid!.height,
    f.grid!.cellWidth,
    f.grid!.cellHeight,
  ]).toEqual([1, 1, 0.6 * 3 * 2, 6]);
  e.dispose();
});

it("old glyph-only module retains None but cannot advertise complete context", async () => {
  instrument(["render_characters_context_version"]);
  const e = await createCharacterEngine(bytes);
  expect(e.charactersProfileAvailable).toBe(true);
  expect(e.charactersContextVersion).toBeNull();
  e.setSource(pSource());
  e.setAtlas(pAtlas());
  expect(finishFrame(e, e.beginCharacters(pSettings)).width).toBe(5);
  expect(() => e.beginCharacters({ ...pSettings, backdrop: "blur" })).toThrow(
    expect.objectContaining({ code: "CapabilityUnavailable" }),
  );
  e.dispose();
});

it("complete WASM contexts equal native frame bytes across crop rotation scale margins alpha and null grids", async () => {
  const fixture = JSON.parse(
    readFileSync(
      "tests/fixtures/render/characters/context-v1-native.json",
      "utf8",
    ),
  ) as {
    source: { width: number; height: number; rgba: number[] };
    masks: number[];
    cases: Array<{
      scale: 1 | 4;
      fontSize: number;
      rotation: 0 | 90;
      crop: { x: number; y: number; width: number; height: number };
      width: number;
      height: number;
      backdrop: "none" | "solid" | "blur";
      rgba: number[];
      grid: { indices: number[]; foreground: number[]; alpha: number[] } | null;
    }>;
  };
  const e = await createCharacterEngine(bytes);
  try {
    e.setSource({
      id: "native-fixture",
      revision: 1,
      ...fixture.source,
      rgba: new Uint8ClampedArray(fixture.source.rgba),
    });
    for (const c of fixture.cases) {
      const a = pAtlas();
      a.originX = -0.5;
      a.originY = 0.5;
      a.calibration = {
        ...a.calibration,
        id: `native-${c.scale}-${c.fontSize}`,
        cellWidth: 0.6 * c.fontSize * c.scale,
        cellHeight: c.fontSize * c.scale,
        maskWidth: 2,
        maskHeight: 2,
        masks: new Uint8Array(fixture.masks),
      };
      e.setAtlas(a);
      const f = finishFrame(
        e,
        e.beginCharacters({
          ...pSettings,
          frameWidth: c.width,
          frameHeight: c.height,
          fontSize: c.fontSize,
          renderScale: c.scale,
          rotation: c.rotation,
          crop: c.crop,
          contrast: 20,
          backdrop: c.backdrop,
        }),
      );
      expect(
        [...f.rgba],
        JSON.stringify([c.scale, c.fontSize, c.rotation, c.backdrop]),
      ).toEqual(c.rgba);
      if (c.grid) {
        expect([...f.grid!.glyphIndices]).toEqual(c.grid.indices);
        expect([...f.grid!.foreground]).toEqual(c.grid.foreground);
        expect([...f.grid!.alpha]).toEqual(c.grid.alpha);
      } else expect(f.grid).toBeNull();
    }
  } finally {
    e.dispose();
  }
});

it.each([0, 2])(
  "unknown complete-context version %s preserves glyph-only capability",
  async (version) => {
    instrument([], version);
    const e = await createCharacterEngine(bytes);
    try {
      expect(e.charactersProfileAvailable).toBe(true);
      expect(e.charactersContextVersion).toBeNull();
      e.setSource(pSource());
      e.setAtlas(pAtlas());
      expect(finishFrame(e, e.beginCharacters(pSettings)).width).toBe(5);
      expect(() =>
        e.beginCharacters({ ...pSettings, backdrop: "solid" }),
      ).toThrow(expect.objectContaining({ code: "CapabilityUnavailable" }));
    } finally {
      e.dispose();
    }
  },
);

it("captures Unicode/space dictionary and pixels across successful atlas replacement", async () => {
  const e = await createCharacterEngine(bytes);
  expect(e.charactersAtlasRetentionVersion).toBe(1);
  e.setSource(pSource());
  const a = pAtlas();
  a.calibration.glyphs = ["é", " "];
  a.spaceIndexOr65535 = 1;
  e.setAtlas(a);
  const expected = finishFrame(e, e.beginCharacters(pSettings));
  const old = e.beginCharacters(pSettings);
  e.step(old, 1);
  const b = pAtlas();
  b.calibration.id = "replacement";
  b.calibration.glyphs = [" ", "█"];
  b.spaceIndexOr65535 = 0;
  b.calibration.masks[1] = 255;
  e.setAtlas(b);
  const current = e.beginCharacters(pSettings);
  expect(finishFrame(e, old)).toEqual(expected);
  expect(finishFrame(e, current).grid!.calibrationId).toBe("replacement");
  e.dispose();
});
it.each([undefined, 0, 2])(
  "absent/unknown retention capability %s does not claim independence",
  async (version) => {
    instrument(
      ["render_characters_atlas_retention_version"],
      undefined,
      version,
    );
    const e = await createCharacterEngine(bytes);
    expect(e.charactersProfileAvailable).toBe(true);
    expect(e.charactersAtlasRetentionVersion).toBeNull();
    e.setSource(pSource());
    e.setAtlas(pAtlas());
    for (let index = 0; index < 3; index++) {
      const id = e.beginCharacters(pSettings);
      e.setAtlas({
        ...pAtlas(),
        calibration: { ...pAtlas().calibration, id: `new-${index}` },
      });
      expect(() => e.step(id, 1)).toThrow();
      expect(finishFrame(e, e.beginCharacters(pSettings)).width).toBe(5);
    }
    e.dispose();
  },
);
it("partial profile exports cannot claim atlas retention", async () => {
  instrument(["render_frame_output_len"], undefined, 1);
  const e = await createCharacterEngine(bytes);
  expect(e.charactersAtlasRetentionVersion).toBeNull();
  e.dispose();
});

it.each([
  [0, 1, false],
  [0, 3, true],
  [7, 0, true],
] as const)(
  "fallback cleanup accepts only native cancelled/already-absent status (%s,error%s)",
  async (status, error, fails) => {
    instrument(
      ["render_characters_atlas_retention_version"],
      undefined,
      undefined,
      { status, error },
    );
    const e = await createCharacterEngine(bytes);
    e.setSource(pSource());
    e.setAtlas(pAtlas());
    e.beginCharacters(pSettings);
    const replace = () =>
      e.setAtlas({
        ...pAtlas(),
        calibration: { ...pAtlas().calibration, id: "fallback-new" },
      });
    if (fails) expect(replace).toThrow(/compatibility cancellation/);
    else expect(replace).not.toThrow();
    e.dispose();
  },
);
