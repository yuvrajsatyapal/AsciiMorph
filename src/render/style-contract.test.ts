import { describe, expect, it } from "vitest";
import fixtures from "../../tests/fixtures/render/styles/wire-v1.json";
import {
  validateStyleSettings,
  validateStyleFrame,
  STYLE_DISPATCH_IDS,
} from "./style-contract";
import { initialCatalogRegistry } from "./catalog/initial-schemas";
const sample = fixtures.cases[0];
describe("strict style contracts", () => {
  it("reserves canonical names and publishes only closed, unavailable schemas", () => {
    expect(STYLE_DISPATCH_IDS["3d"]).toBe(13);
    expect(STYLE_DISPATCH_IDS["block-chars"]).toBe(3);
    expect(STYLE_DISPATCH_IDS).not.toHaveProperty("voxel");
    expect(STYLE_DISPATCH_IDS).not.toHaveProperty("block");
    for (const id of ["pixel", "mosaic", "braille"]) {
      const s = initialCatalogRegistry.getStyle(id)!;
      expect(s.binding).toBeNull();
      expect(s.descriptor.ready).toBe(false);
      expect(
        initialCatalogRegistry.validateStyle(
          id,
          initialCatalogRegistry.styleDefaults(id),
        ),
      ).toBeDefined();
    }
    expect(
      initialCatalogRegistry.getStyle("characters")!.descriptor.ready,
    ).toBe(true);
  });
  it("validates all closed payloads and returns detached values", () => {
    for (const f of fixtures.cases)
      expect(validateStyleSettings(f.settings, f.source)).toEqual(f.settings);
    const s = validateStyleSettings(sample.settings, sample.source);
    expect(s).not.toBe(sample.settings);
    expect(s.parameters).not.toBe(sample.settings.parameters);
  });
  it.each([
    { styleId: "voxel" },
    { styleId: "3d" },
    { version: 2 },
    { extra: 1 },
    { seed: -1 },
    { timeUs: 0.5 },
    { frameWidth: 18 },
    { renderScale: 5 },
    { rotation: 45 },
    { crop: { x: 0, y: 0, width: 2, height: 1 } },
    { parameters: { ...sample.settings.parameters, fontSize: 3.5 } },
    { parameters: { ...sample.settings.parameters, brightness: NaN } },
    { parameters: { ...sample.settings.parameters, contrast: Infinity } },
    { parameters: { ...sample.settings.parameters, invert: 1 } },
    { parameters: { ...sample.settings.parameters, unknown: 1 } },
  ])("rejects malformed settings %j", (patch) =>
    expect(() =>
      validateStyleSettings({ ...sample.settings, ...patch }, sample.source),
    ).toThrow(),
  );
  it("rejects accessor values without executing them", () => {
    let calls = 0;
    const input = { ...sample.settings };
    Object.defineProperty(input, "seed", {
      get() {
        calls++;
        return 1;
      },
      enumerable: true,
    });
    expect(() => validateStyleSettings(input, sample.source)).toThrow();
    expect(calls).toBe(0);
  });
  it("checks crop before rotation and exact frame length", () => {
    const s = validateStyleSettings(
      {
        ...sample.settings,
        rotation: 90,
        frameWidth: 13,
        frameHeight: 9,
        crop: { x: 0, y: 0, width: 0.5, height: 1 },
      },
      sample.source,
    );
    const f = {
      version: 1,
      width: 13,
      height: 9,
      rgba: new Uint8Array(13 * 9 * 4),
    };
    expect(validateStyleFrame(f, s)).toBe(f);
    expect(() =>
      validateStyleFrame({ ...f, rgba: new Uint8Array(4) }, s),
    ).toThrow();
    expect(() => validateStyleFrame({ ...f, width: 0xffffffff }, s)).toThrow();
  });
  it("enforces backing/source bounds and exact payload enum domains", () => {
    for (const source of [
      { ...sample.source, width: 16385 },
      { ...sample.source, revision: -1 },
      { ...sample.source, width: 16384, height: 16384 },
    ])
      expect(() => validateStyleSettings(sample.settings, source)).toThrow();
    for (const patch of [{ mosaicShape: "diagonal" }, { mosaicShape: 1 }])
      expect(() =>
        validateStyleSettings(
          {
            ...fixtures.cases[1].settings,
            parameters: { ...fixtures.cases[1].settings.parameters, ...patch },
          },
          sample.source,
        ),
      ).toThrow();
    expect(() =>
      validateStyleSettings(
        { ...sample.settings, frameWidth: 16384, frameHeight: 16384 },
        { ...sample.source, width: 8192, height: 8192 },
      ),
    ).toThrow();
  });
  it("bounds retained RGBA backing capacity while allowing bounded offset views", () => {
    const settings = validateStyleSettings(sample.settings, sample.source);
    const byteLength = settings.frameWidth * settings.frameHeight * 4;
    const frame = {
      version: 1,
      width: settings.frameWidth,
      height: settings.frameHeight,
      rgba: new Uint8Array(new ArrayBuffer(byteLength + 32), 16, byteLength),
    };
    expect(validateStyleFrame(frame, settings)).toBe(frame);
    const oversized = {
      ...frame,
      rgba: new Uint8Array(new ArrayBuffer(268_435_457), 16, byteLength),
    };
    expect(() => validateStyleFrame(oversized, settings)).toThrow(
      "Invalid style frame",
    );
  });
});
