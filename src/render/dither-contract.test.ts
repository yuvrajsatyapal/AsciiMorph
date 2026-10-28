import { describe, expect, it } from "vitest";
import { validateStyleSettings, type StyleSettingsV1 } from "./style-contract";
import { encodeStyleSettings, decodeStyleSettings } from "./style-wire";
import { initialCatalogRegistry } from "./catalog/initial-schemas";
import { switchStyle } from "@/components/effects-studio/style-adapter";
const source = { id: "dither", revision: 1, width: 17, height: 13 };
const defaults = () => initialCatalogRegistry.styleDefaults("dither");
function settings(): StyleSettingsV1 {
  return {
    version: 1,
    styleId: "dither",
    frameWidth: 17,
    frameHeight: 13,
    renderScale: 1,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    rotation: 0,
    seed: 7,
    timeUs: 0,
    parameters: {
      fontSize: 3,
      brightness: 0,
      contrast: 0,
      invert: false,
      charOpacity: 100,
      dither: {
        algorithm: "floyd",
        palette: "mono",
        chroma: "standard",
        pixelSize: 2,
        strength: 100,
        contrast: 110,
        threshold: 50,
        angle: 0,
        customPalette: ["#000000", "#ffffff"],
        animate: false,
        shimmer: false,
        direction: "right",
        speed: 4,
      },
    },
  };
}
describe("Dither boundary", () => {
  it("roundtrips dispatch15 without a glyph atlas and detaches palette ownership", () => {
    const s = settings();
    const checked = validateStyleSettings(s, source);
    s.parameters.dither!.customPalette[0] = "#123456";
    expect(checked.parameters.dither!.customPalette[0]).toBe("#000000");
    const packet = encodeStyleSettings(checked, source);
    expect(packet.length).toBe(190);
    expect(new DataView(packet.buffer).getUint32(8, true)).toBe(15);
    expect(decodeStyleSettings(packet, source)).toEqual(checked);
  });
  it.each([
    "algorithm",
    "palette",
    "chroma",
    "pixelSize",
    "strength",
    "contrast",
    "threshold",
    "angle",
    "customPalette",
    "animate",
    "shimmer",
    "direction",
    "speed",
  ])("rejects malformed %s at transport boundary", (key) => {
    const s = settings();
    Object.assign(s.parameters.dither!, {
      [key]: key === "animate" || key === "shimmer" ? true : null,
    });
    expect(() => validateStyleSettings(s, source)).toThrow();
  });
  it("rejects fractional controls, alpha palettes, overflow, accessors and trailing packet data", () => {
    for (const customPalette of [
      ["#000000"],
      Array(65).fill("#ffffff"),
      ["#00000000", "#ffffff"],
      ["red", "#ffffff"],
    ]) {
      const s = settings();
      s.parameters.dither!.customPalette = customPalette;
      expect(() => validateStyleSettings(s, source)).toThrow();
    }
    for (const key of [
      "pixelSize",
      "strength",
      "contrast",
      "threshold",
      "angle",
      "speed",
    ]) {
      const s = settings();
      Object.assign(s.parameters.dither!, { [key]: 1.5 });
      expect(() => validateStyleSettings(s, source)).toThrow();
    }
    const s = settings();
    Object.defineProperty(s.parameters.dither!, "angle", { get: () => 0 });
    expect(() => validateStyleSettings(s, source)).toThrow();
    const packet = encodeStyleSettings(settings(), source);
    expect(() =>
      decodeStyleSettings(new Uint8Array([...packet, 0]), source),
    ).toThrow();
  });
  it("registers exact defaults and never inherits the Characters contrast domain", () => {
    const p = defaults();
    expect(p).toMatchObject({
      ditherAlgorithm: "floyd",
      ditherPalette: "mono",
      ditherContrast: 110,
      ditherPixelSize: 2,
    });
    const changed = switchStyle(
      {
        id: "characters",
        parameters: initialCatalogRegistry.styleDefaults("characters"),
      },
      "dither",
    );
    expect(changed.parameters.ditherContrast).toBe(110);
    expect(changed.parameters).not.toHaveProperty("contrast");
    expect(() =>
      initialCatalogRegistry.validateStyle("dither", {
        ...p,
        ditherCustomPalette: ["#00000000", "#ffffff"],
      }),
    ).toThrow();
    expect(() =>
      initialCatalogRegistry.validateStyle("dither", {
        ...p,
        ditherAnimate: true,
      }),
    ).toThrow();
  });
});

it("accepts worker Dither discovery while enforcing atlas-free preview identity", async () => {
  const { validateWorkerResponse, validateWorkerRequest } = await import(
    "./protocol"
  );
  expect(() =>
    validateWorkerResponse({
      version: 1,
      requestId: "ready",
      type: "ready",
      styleProfileVersion: 1,
      supportedStyleIds: ["dither"],
    }),
  ).not.toThrow();
  const request = {
    version: 1,
    requestId: "p",
    type: "renderStylePreview",
    jobId: "job",
    revision: 1,
    sourceId: source.id,
    sourceRevision: source.revision,
    calibrationId: "",
    source,
    styleId: "dither",
    settings: settings(),
    timeUs: 0,
  };
  expect(() => validateWorkerRequest(request)).not.toThrow();
  expect(() =>
    validateWorkerRequest({ ...request, calibrationId: "unexpected" }),
  ).toThrow();
});

it("matches shared native binary fixtures and rejects corrupted enums, flags, count and reserved bytes", async () => {
  const fixture = (
    await import("../../tests/fixtures/render/styles/dither-wire-v1.json")
  ).default;
  for (const c of fixture.cases) {
    const bytes = Uint8Array.from(c.hex.match(/../g)!, (b) => parseInt(b, 16));
    const s = decodeStyleSettings(bytes, fixture.source);
    expect(s.parameters.dither).toEqual(c.dither);
    expect(encodeStyleSettings(s, fixture.source)).toEqual(bytes);
    for (const [offset, value] of [
      [112, 15],
      [116, 16],
      [120, 3],
      [124, 13],
      [160, 1],
      [164, 1],
      [168, 1],
      [172, 8],
      [176, 0],
      [180, 1],
    ]) {
      const bad = bytes.slice();
      new DataView(bad.buffer).setUint32(offset, value, true);
      expect(
        () => decodeStyleSettings(bad, fixture.source),
        `offset ${offset}`,
      ).toThrow();
    }
  }
});
