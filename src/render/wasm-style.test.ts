// @vitest-environment node
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { createCharacterEngine } from "./wasm-character";
it("discovers actual release style ABI without activating any family", async () => {
  const e = await createCharacterEngine(
    readFileSync("public/wasm/asciimorph_engine.wasm"),
  );
  try {
    expect(e.styleProfileVersion).toBe(1);
    for (let id = 1; id <= 15; id++) expect(e.supportsStyle(id)).toBe(false);
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
it("rejects unsupported actual release style without producing a frame", async () => {
  const e = await createCharacterEngine(bytes);
  try {
    e.setSource({
      ...f.source,
      rgba: new Uint8ClampedArray(f.source.width * f.source.height * 4),
    });
    expect(() =>
      e.beginStyle(validateStyleSettings(f.settings, f.source)),
    ).toThrow(/unsupported/);
    expect(() => e.takeStyleFrame(1)).toThrow();
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
