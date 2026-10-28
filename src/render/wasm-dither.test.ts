// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createCharacterEngine } from "./wasm-character";
import { DITHER_ALGORITHMS } from "./dither-contract";
import { initialCatalogRegistry } from "./catalog/initial-schemas";
import { createStudioController } from "@/components/effects-studio/controller";
import {
  bindStyleProject,
  switchStyle,
} from "@/components/effects-studio/style-adapter";
it("reads all fifteen actual WASM algorithms, thumbnails, and chunk-invariant frames", async () => {
  const e = await createCharacterEngine(
    readFileSync("public/wasm/asciimorph_engine.wasm"),
  );
  try {
    expect(e.supportsStyle(15)).toBe(true);
    const source = { id: "dither", revision: 1, width: 31, height: 19 };
    const rgba = new Uint8ClampedArray(31 * 19 * 4);
    for (let i = 0; i < rgba.length; i += 4)
      rgba.set(
        [(i * 7) % 256, (i * 3) % 256, (i * 11) % 256, i % 28 === 0 ? 0 : 255],
        i,
      );
    e.setSource({ ...source, rgba });
    const base = createStudioController().getSnapshot().project;
    const project = {
      ...base,
      source,
      style: switchStyle(base.style, "dither"),
    };
    const hashes = new Set<string>();
    for (const algorithm of DITHER_ALGORITHMS) {
      project.style.parameters = initialCatalogRegistry.validateStyle(
        "dither",
        {
          ...project.style.parameters,
          ditherAlgorithm: algorithm,
          bgMode: "none",
        },
      );
      const s = bindStyleProject(project, 1);
      const render = (budget: number) => {
        const id = e.beginStyle(s);
        while (e.step(id, budget) === "pending") {}
        return e.takeStyleFrame(id);
      };
      const one = render(1),
        seven = render(7),
        many = render(4096);
      expect(one).toEqual(seven);
      expect(one).toEqual(many);
      expect(one.rgba.length).toBe(31 * 19 * 4);
      expect(one.rgba.some((v) => v !== 0)).toBe(true);
      hashes.add(Buffer.from(one.rgba).toString("hex"));
      const id = e.beginStyle(s);
      while (e.step(id, 4096) === "pending") {}
      e.beginThumbnail(id, 8);
      while (e.step(id, 7) === "pending") {}
      expect(e.takeThumbnail(id)).toMatchObject({ width: 8, height: 5 });
    }
    expect(hashes.size).toBeGreaterThanOrEqual(13);
  } finally {
    e.dispose();
  }
});
