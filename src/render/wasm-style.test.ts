// @vitest-environment node
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { createCharacterEngine } from "./wasm-character";
it("discovers actual Braille, Pixel and Mosaic native families", async () => {
  const e = await createCharacterEngine(
    readFileSync("public/wasm/asciimorph_engine.wasm"),
  );
  try {
    expect(e.styleProfileVersion).toBe(1);
    for (let id = 1; id <= 15; id++)
      expect(e.supportsStyle(id)).toBe(
        id === 4 || id === 10 || id === 11 || id === 15,
      );
  } finally {
    e.dispose();
  }
});
it.each(["pixel", "mosaic"] as const)(
  "converts an actual finished %s frame through the optional native thumbnail ABI",
  async (styleId) => {
    const e = await createCharacterEngine(
      readFileSync("public/wasm/asciimorph_engine.wasm"),
    );
    try {
      expect(e.thumbnailProfileVersion).toBe(1);
      e.setSource({
        ...f.source,
        rgba: new Uint8ClampedArray(
          Array.from({ length: f.source.width * f.source.height }, () => [
            128, 128, 128, 255,
          ]).flat(),
        ),
      });
      const base = styleId === "pixel" ? fixtures.cases[0] : fixtures.cases[1];
      const id = e.beginStyle(
        validateStyleSettings(
          {
            ...base.settings,
            parameters: {
              ...base.settings.parameters,
              brightness: 0,
              invert: false,
              charOpacity: 100,
              ...(styleId === "mosaic" ? { mosaicShape: "square" } : {}),
            },
          },
          f.source,
        ),
      );
      while (e.step(id, 4096) === "pending") {}
      e.beginThumbnail(id, 8);
      while (e.step(id, 1) === "pending") {}
      const frame = e.takeThumbnail(id);
      expect([frame.width, frame.height]).toEqual([8, 6]);
      const color =
        styleId === "pixel" ? [153, 153, 153, 255] : [128, 128, 128, 255];
      expect(frame.rgba.every((v, i) => v === color[i % 4])).toBe(true);
    } finally {
      e.dispose();
    }
  },
);
it("old module without thumbnail exports keeps profiles usable and rejects conversion", async () => {
  shim(["render_thumbnail_profile_version", "render_frame_thumbnail_v1"]);
  const e = await createCharacterEngine(bytes);
  try {
    expect(e.thumbnailProfileVersion).toBeNull();
    expect(e.styleProfileVersion).toBe(1);
    e.setSource({
      ...f.source,
      rgba: new Uint8ClampedArray(f.source.width * f.source.height * 4),
    });
    const id = e.beginStyle(validateStyleSettings(f.settings, f.source));
    while (e.step(id, 4096) === "pending") {}
    expect(() => e.beginThumbnail(id, 8)).toThrow(/unavailable/);
    e.takeStyleFrame(id);
  } finally {
    e.dispose();
  }
});
it("converts a real 1000 square Pixel profile with bounded thumbnail dimensions", async () => {
  const instantiate = WebAssembly.instantiate.bind(WebAssembly);
  let memory: WebAssembly.Memory | undefined;
  vi.spyOn(WebAssembly, "instantiate").mockImplementation((async (
    input: BufferSource,
    imports: WebAssembly.Imports,
  ) => {
    const result = await instantiate(input, imports);
    memory = result.instance.exports.memory as WebAssembly.Memory;
    return result;
  }) as typeof WebAssembly.instantiate);
  const e = await createCharacterEngine(bytes);
  try {
    const source = {
      id: "thousand",
      revision: 1,
      width: 1000,
      height: 1000,
      rgba: new Uint8ClampedArray(1000 * 1000 * 4),
    };
    for (let i = 0; i < source.rgba.length; i += 4) {
      source.rgba[i] = 128;
      source.rgba[i + 1] = 128;
      source.rgba[i + 2] = 128;
      source.rgba[i + 3] = 255;
    }
    e.setSource(source);
    const settings = validateStyleSettings(
      {
        ...f.settings,
        frameWidth: 1000,
        frameHeight: 1000,
        parameters: {
          ...f.settings.parameters,
          brightness: 0,
          invert: false,
          charOpacity: 100,
        },
      },
      {
        id: source.id,
        revision: source.revision,
        width: source.width,
        height: source.height,
      },
    );
    const id = e.beginStyle(settings);
    while (e.step(id, 4096) === "pending") {}
    const fullCapacity = memory!.buffer.byteLength;
    e.beginThumbnail(id, 192);
    const peakCapacity = memory!.buffer.byteLength;
    let turns = 0;
    while (e.step(id, 4096) === "pending") turns++;
    const frame = e.takeThumbnail(id);
    expect([frame.width, frame.height]).toEqual([192, 192]);
    expect(turns).toBeGreaterThan(100);
    expect(peakCapacity).toBeGreaterThanOrEqual(fullCapacity);
    expect(frame.rgba.every((v, i) => v === [153, 153, 153, 255][i % 4])).toBe(
      true,
    );
  } finally {
    e.dispose();
  }
});
import { afterEach, vi } from "vitest";
import fixtures from "../../tests/fixtures/render/styles/wire-v1.json";
import { validateStyleSettings } from "./style-contract";
const bytes = readFileSync("public/wasm/asciimorph_engine.wasm");
const f = fixtures.cases[0];
afterEach(() => vi.restoreAllMocks());
function recycledJobModule() {
  const memory = new WebAssembly.Memory({ initial: 2 });
  const exports = {
    memory,
    render_abi_version: () => 1,
    render_create: () => 1,
    render_drop: () => 1,
    render_stage: () => 64,
    render_unstage: () => 1,
    render_upload: () => 1,
    render_begin: () => 1,
    render_step: () => 2,
    render_cancel: () => 3,
    render_release: () => 1,
    render_output_ptr: () => 64,
    render_output_len: () => 16,
    render_error: () => 1,
    render_style_profile_version: () => 1,
    render_style_supported: () => 1,
    render_begin_style_v1: () => 1,
    render_frame_output_ptr: () => 64,
    render_frame_output_len: () => 16,
    render_thumbnail_profile_version: () => 1,
    render_frame_thumbnail_v1: () => 1,
  };
  vi.spyOn(WebAssembly, "instantiate").mockImplementation((async () => ({
    module: {} as WebAssembly.Module,
    instance: { exports } as unknown as WebAssembly.Instance,
  })) as unknown as typeof WebAssembly.instantiate);
}
it.each(["cancel", "source replacement"] as const)(
  "releases conversion ownership after %s before a recycled job ID is admitted",
  async (invalidation) => {
    recycledJobModule();
    const e = await createCharacterEngine(bytes);
    try {
      e.setSource({
        ...f.source,
        rgba: new Uint8ClampedArray(f.source.width * f.source.height * 4),
      });
      const first = e.beginStyle(validateStyleSettings(f.settings, f.source));
      expect(e.step(first, 1)).toBe("complete");
      e.beginThumbnail(first, 8);
      expect(e.step(first, 1)).toBe("complete");
      if (invalidation === "cancel") e.cancel(first);
      else
        e.setSource({
          ...f.source,
          revision: 2,
          rgba: new Uint8ClampedArray(f.source.width * f.source.height * 4),
        });
      const next = e.beginStyle(
        validateStyleSettings(f.settings, {
          ...f.source,
          revision: invalidation === "cancel" ? f.source.revision : 2,
        }),
      );
      expect(next).toBe(first);
      expect(e.step(next, 1)).toBe("complete");
      expect(() => e.beginThumbnail(next, 8)).not.toThrow();
    } finally {
      e.dispose();
    }
  },
);
function shim(
  omit: string[] = [],
  malformed: boolean | "pointer" | "length" = false,
  supported = false,
) {
  const instantiate = WebAssembly.instantiate;
  let released = 0;
  let outputMemory: WebAssembly.Memory | undefined;
  const spy = vi.spyOn(WebAssembly, "instantiate");
  spy.mockImplementation((async (
    input: BufferSource,
    imports: WebAssembly.Imports,
  ) => {
    const original = await instantiate(input, imports);
    const raw = original.instance.exports;
    // Test-only ABI diagnostic. It returns fixed bytes, never family numerical output.
    const memory = raw.memory as WebAssembly.Memory;
    outputMemory = memory;
    const diagnostic = () => {
      const ptr = (raw.render_stage as (...n: number[]) => number)(
        1,
        16 + f.settings.frameWidth * f.settings.frameHeight * 4,
      );
      const v = new DataView(memory.buffer, ptr);
      [
        1,
        f.settings.frameWidth,
        f.settings.frameHeight,
        f.settings.frameWidth * f.settings.frameHeight * 4,
      ].forEach((n, i) => v.setUint32(i * 4, n, true));
      new Uint8Array(
        memory.buffer,
        ptr + 16,
        f.settings.frameWidth * f.settings.frameHeight * 4,
      ).fill(37);
      if (malformed === true) v.setUint32(12, 32, true);
      return ptr;
    };
    const exports = {
      ...Object.fromEntries(
        Object.entries(raw).filter(([k]) => !omit.includes(k)),
      ),
      ...(supported
        ? {
            render_style_supported: () => 1,
            render_begin_style_v1: () => 991,
            render_step: () => 2,
            render_frame_output_ptr: () =>
              malformed === "pointer" ? 0 : diagnostic(),
            render_frame_output_len: () =>
              malformed === "length"
                ? 0
                : 16 + f.settings.frameWidth * f.settings.frameHeight * 4,
            render_release: () => {
              released++;
              return 1;
            },
          }
        : {}),
    };
    return { module: original.module, instance: { exports } };
  }) as typeof WebAssembly.instantiate);
  return { released: () => released, memory: () => outputMemory! };
}
it.each([
  "render_style_profile_version",
  "render_style_supported",
  "render_begin_style_v1",
  "render_frame_output_ptr",
  "render_frame_output_len",
])("keeps old/partial module usable when %s is missing", async (name) => {
  shim([name]);
  const e = await createCharacterEngine(bytes);
  try {
    expect(e.styleProfileVersion).toBeNull();
    expect(e.supportsStyle(10)).toBe(false);
    expect(() =>
      e.beginStyle(validateStyleSettings(f.settings, f.source)),
    ).toThrow(/unavailable/);
  } finally {
    e.dispose();
  }
});
it("reads positive real native Pixel and Mosaic frames", async () => {
  const e = await createCharacterEngine(bytes);
  try {
    e.setSource({
      ...f.source,
      rgba: new Uint8ClampedArray(
        Array.from({ length: f.source.width * f.source.height }, () => [
          128, 128, 128, 255,
        ]).flat(),
      ),
    });
    for (const styleId of ["pixel", "mosaic"] as const) {
      const base = styleId === "pixel" ? fixtures.cases[0] : fixtures.cases[1];
      const settings = validateStyleSettings(
        {
          ...base.settings,
          parameters: {
            ...base.settings.parameters,
            fontSize: 11,
            brightness: 0,
            contrast: 20,
            invert: false,
            charOpacity: 100,
            ...(styleId === "mosaic"
              ? { mosaicShape: "square" }
              : ({} as object)),
          },
        },
        f.source,
      );
      const id = e.beginStyle(settings);
      while (e.step(id, 4096) === "pending") {}
      const frame = e.takeStyleFrame(id);
      expect([frame.width, frame.height]).toEqual([17, 13]);
      expect([...frame.rgba.slice(0, 4)]).toEqual(
        styleId === "pixel" ? [153, 153, 153, 255] : [128, 128, 128, 255],
      );
      expect(
        frame.rgba.every(
          (v, i) =>
            v ===
            (styleId === "pixel" ? [153, 153, 153, 255] : [128, 128, 128, 255])[
              i % 4
            ],
        ),
      ).toBe(true);
    }
  } finally {
    e.dispose();
  }
});
it.each([false, true, "pointer", "length"] as const)(
  "decodes only16-byte style frames and releases diagnostic output (malformed=%s)",
  async (malformed) => {
    const release = shim([], malformed, true),
      e = await createCharacterEngine(bytes);
    try {
      e.setSource({
        ...f.source,
        rgba: new Uint8ClampedArray(f.source.width * f.source.height * 4),
      });
      const id = e.beginStyle(validateStyleSettings(f.settings, f.source));
      expect(() => e.takeFrame(id)).toThrow(/Not a Characters/);
      if (malformed) expect(() => e.takeStyleFrame(id)).toThrow();
      else {
        const frame = e.takeStyleFrame(id);
        expect(frame.rgba.every((n) => n === 37)).toBe(true);
        expect(frame.rgba.buffer).not.toBe(release.memory().buffer);
      }
      expect(release.released()).toBe(1);
      expect(() => e.takeStyleFrame(id)).toThrow();
    } finally {
      e.dispose();
    }
  },
);
it("captures additive backdrop, coverage, blend and opacity in actual WASM jobs", async () => {
  const e = await createCharacterEngine(
    readFileSync("public/wasm/asciimorph_engine.wasm"),
  );
  try {
    expect(e.styleContextVersion).toBe(1);
    const rgba = new Uint8ClampedArray(f.source.width * f.source.height * 4);
    for (let i = 0; i < rgba.length; i += 4)
      rgba.set([30 + (i % 190), 100, 210, 128], i);
    e.setSource({ ...f.source, rgba });
    const s = validateStyleSettings(f.settings, f.source);
    const { STYLE_CONTEXT_DEFAULTS } = await import("./style-context");
    const run = (c: typeof STYLE_CONTEXT_DEFAULTS) => {
      const id = e.beginStyle({ ...s, styleContext: c });
      while (e.step(id, 1) === "pending") {}
      return e.takeStyleFrame(id).rgba;
    };
    const original = run({
      ...STYLE_CONTEXT_DEFAULTS,
      backdrop: "original",
      coverage: 0,
    });
    expect([...original]).toEqual([...rgba]);
    expect(
      run({
        ...STYLE_CONTEXT_DEFAULTS,
        backdrop: "blur",
        softness: 0,
        coverage: 0,
      }),
    ).toEqual(original);
    expect(
      run({ ...STYLE_CONTEXT_DEFAULTS, backdrop: "none", coverage: 0 }).every(
        (v) => v === 0,
      ),
    ).toBe(true);
    expect(
      run({ ...STYLE_CONTEXT_DEFAULTS, backdrop: "solid", coverage: 0 }).every(
        (v, i) => v === (i % 4 === 3 ? 255 : 0),
      ),
    ).toBe(true);
    for (const blend of [
      "source-over",
      "overlay",
      "color-dodge",
      "screen",
      "lighter",
    ] as const) {
      expect(
        run({
          ...STYLE_CONTEXT_DEFAULTS,
          blend,
          opacity: 0,
          backdrop: "original",
        }),
      ).toEqual(original);
    }
    const id = e.beginStyle({
      ...s,
      styleContext: {
        ...STYLE_CONTEXT_DEFAULTS,
        coverage: 0,
        backdrop: "none",
      },
    });
    const second = e.beginStyle({
      ...s,
      styleContext: {
        ...STYLE_CONTEXT_DEFAULTS,
        coverage: 100,
        backdrop: "solid",
      },
    });
    while (e.step(second, 7) === "pending") {}
    while (e.step(id, 7) === "pending") {}
    expect(e.takeStyleFrame(id).rgba.every((v) => v === 0)).toBe(true);
    expect(e.takeStyleFrame(second).rgba.some((v) => v > 0)).toBe(true);
  } finally {
    e.dispose();
  }
});
it("old WASM rejects additive settings before allocating a native stage", async () => {
  shim([
    "render_style_context_version",
    "render_begin_style_context_v1",
    "render_begin_characters_context_v1",
  ]);
  const e = await createCharacterEngine(bytes);
  try {
    e.setSource({
      ...f.source,
      rgba: new Uint8ClampedArray(f.source.width * f.source.height * 4),
    });
    const { STYLE_CONTEXT_DEFAULTS } = await import("./style-context");
    expect(() =>
      e.beginStyle({
        ...validateStyleSettings(f.settings, f.source),
        styleContext: { ...STYLE_CONTEXT_DEFAULTS, coverage: 0 },
      }),
    ).toThrow(/unavailable/i);
    const id = e.beginStyle(validateStyleSettings(f.settings, f.source));
    while (e.step(id, 4096) === "pending") {}
    e.takeStyleFrame(id);
  } finally {
    e.dispose();
  }
});
