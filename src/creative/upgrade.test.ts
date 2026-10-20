import { describe, expect, it } from "vitest";
import { generate, DEFAULT_GENERATOR } from "./generators";
import { audioFeatures, beatResponse } from "./audio";
import { renderMesh, CUBE } from "./mesh";
import { videoSampleTimes } from "./media";
import {
  typographyDocument,
  placeTypography,
  parseFiglet,
} from "@/typography/figlet";
import { createDocument } from "@/core/document";
import { readFileSync } from "node:fs";
import { saveCustomTemplate, readCustomTemplates } from "@/gallery/catalog";
describe("creative workspace upgrades", () => {
  it("renders seamless generator loops and mode parameters", () => {
    const s = {
      ...DEFAULT_GENERATOR,
      loopSeconds: 3,
      density: 64,
      frequency: 4,
      animateScale: 0.5,
    };
    expect(generate(s, 0).layers[0].cells).toEqual(
      generate(s, 3).layers[0].cells,
    );
    expect(generate({ ...s, frequency: 12 }, 0.7).layers[0].cells).not.toEqual(
      generate(s, 0.7).layers[0].cells,
    );
  });
  it("selects frequency ranges and detects energy transients", () => {
    const time = new Uint8Array(8).fill(128),
      freq = new Uint8Array([255, 255, 0, 0, 0, 0, 0, 0]);
    expect(
      audioFeatures(time, freq, {
        sampleRate: 16000,
        minHz: 4000,
        maxHz: 8000,
      }).bands.every((v) => v === 0),
    ).toBe(true);
    expect(beatResponse(0.8, 0.2, 1)).toBeGreaterThan(
      beatResponse(0.2, 0.2, 1),
    );
  });
  it("changes mesh projection, lighting and wireframe output", () => {
    const base = renderMesh(CUBE, 0.6, 0.4, 1, 1);
    expect(
      renderMesh(CUBE, 0.6, 0.4, 1, 1, "#e9b86e", {
        perspective: 1,
        wireframe: true,
        lightDirection: [1, 0, 0],
      }).layers[0].cells,
    ).not.toEqual(base.layers[0].cells);
  });
  it("trims a later video segment beyond the former twelve second ceiling", () => {
    const frames = videoSampleTimes(100, 2, 20, 30);
    expect(frames[0].time).toBe(30);
    expect(frames.reduce((sum, f) => sum + f.duration, 0)).toBe(20000);
  });
  it("adds styled typography as a new layer without mutating saved artwork", () => {
    const font = parseFiglet(
      readFileSync("public/fonts/figlet/morph-grid.flf", "utf8"),
    );
    const type = typographyDocument(font, "HI", {
      outline: true,
      gradient: "#ff0000",
      kerning: true,
      lineSpacing: 2,
    });
    const target = createDocument(80, 40, "target");
    const placed = placeTypography(target, type, 3, 4);
    expect(target.layers).toHaveLength(1);
    expect(placed.layers).toHaveLength(2);
    expect(placed.layers[1].cells.some((c) => c.char.trim())).toBe(true);
  });
  it("roundtrips reusable custom templates with tags and collections", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
    };
    saveCustomTemplate(
      createDocument(3, 3, "Reusable"),
      ["badge"],
      "Brand",
      storage,
    );
    const templates = readCustomTemplates(storage);
    expect(templates[0].tags).toEqual(["badge"]);
    expect(templates[0].collection).toBe("Brand");
  });
});

it("loops every generator and composes both mix endpoints", () => {
  for (const mode of ["noise", "waves", "particles", "fractal"] as const) {
    const s = { ...DEFAULT_GENERATOR, mode, loopSeconds: 5, animateScale: 0.4 };
    expect(generate(s, 1).layers[0].cells).toEqual(
      generate(s, 6).layers[0].cells,
    );
  }
  const primary = generate(DEFAULT_GENERATOR, 0.7).layers[0].cells;
  expect(
    generate({ ...DEFAULT_GENERATOR, combine: "noise", mix: 0 }, 0.7).layers[0]
      .cells,
  ).toEqual(primary);
  expect(
    generate({ ...DEFAULT_GENERATOR, combine: "noise", mix: 1 }, 0.7).layers[0]
      .cells,
  ).toEqual(
    generate({ ...DEFAULT_GENERATOR, mode: "noise" }, 0.7).layers[0].cells,
  );
});
it("individually applies mesh controls and rejects invalid light vectors", () => {
  const base = renderMesh(CUBE, 0.6, 0.4, 1, 1).layers[0].cells;
  for (const options of [
    { perspective: 1 },
    { wireframe: true },
    { lightDirection: [1, 0, 0] as [number, number, number] },
  ])
    expect(
      renderMesh(CUBE, 0.6, 0.4, 1, 1, "#e9b86e", options).layers[0].cells,
    ).not.toEqual(base);
  expect(() =>
    renderMesh(CUBE, 0, 0, 1, 1, "#ffffff", { lightDirection: [0, 0, 0] }),
  ).toThrow();
});
it("loads three licensed alphabets and produces real outlines and color gradients", () => {
  const fonts = ["morph-grid", "morph-wide", "morph-slim"].map((name) =>
    parseFiglet(readFileSync(`public/fonts/figlet/${name}.flf`, "utf8")),
  );
  const docs = fonts.map((font) => typographyDocument(font, "ABC"));
  expect(docs[0].width).not.toBe(docs[1].width);
  expect(docs[0].layers[0].cells.map((c) => c.char).join("")).not.toBe(
    docs[2].layers[0].cells.map((c) => c.char).join(""),
  );
  const styled = typographyDocument(fonts[0], "ABC", {
    outline: true,
    gradient: "#ff0000",
  });
  expect(styled.width).toBe(docs[0].width + 2);
  expect(new Set(styled.layers[0].cells.map((c) => c.fg)).size).toBeGreaterThan(
    1,
  );
  const target = createDocument(3, 3),
    placed = placeTypography(target, styled, -2, -1);
  expect(placed.layers[1].cells).toHaveLength(9);
});
it("rejects malformed custom template libraries without writes", () => {
  let writes = 0;
  const storage = {
    getItem: () => JSON.stringify([{ id: "broken", document: {} }]),
    setItem: () => {
      writes++;
    },
  };
  expect(() =>
    saveCustomTemplate(createDocument(2, 2), [], "test", storage),
  ).toThrow();
  expect(writes).toBe(0);
});
