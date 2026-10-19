import { describe, it, expect } from "vitest";
import { generate, DEFAULT_GENERATOR } from "./generators";
import { parseObj, parseGlb, renderMesh, CUBE } from "./mesh";
describe("creative engines", () => {
  it("seed and time determine cells for every generator", () => {
    for (const mode of ["noise", "waves", "particles", "fractal"] as const) {
      const s = { ...DEFAULT_GENERATOR, mode };
      expect(generate(s, 0).layers[0].cells).toEqual(
        generate(s, 0).layers[0].cells,
      );
      expect(generate(s, 1).layers[0].cells).not.toEqual(
        generate(s, 0).layers[0].cells,
      );
    }
  });
  it("rejects unbounded/nonfinite parameters", () => {
    expect(() => generate({ ...DEFAULT_GENERATOR, width: 999 })).toThrow();
    expect(() => generate({ ...DEFAULT_GENERATOR, scale: NaN })).toThrow();
  });
  it("parses OBJ polygons and negative indices and rejects invalid meshes", () => {
    expect(
      parseObj("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf -4 -3 -2 -1").faces,
    ).toHaveLength(2);
    expect(() => parseObj("v NaN 0 0\nf 1 2 3")).toThrow();
    expect(() => parseGlb(new ArrayBuffer(20))).toThrow();
  });
  it("rasterizes real mesh faces with lighting and orbit", () => {
    const a = renderMesh(CUBE, 0.5, 0.3, 1, 1);
    expect(a.layers[0].cells.some((c) => c.char !== " ")).toBe(true);
    expect(renderMesh(CUBE, 1, 0.3, 1, 1).layers[0].cells).not.toEqual(
      a.layers[0].cells,
    );
  });
});
it("reads embedded GLB vertex buffers and node translation without network resources", () => {
  const json = JSON.stringify({
    asset: { version: "2.0" },
    buffers: [{ byteLength: 42 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    nodes: [{ mesh: 0, translation: [1, 0, 0] }],
    scenes: [{ nodes: [0] }],
  });
  const encoded = new TextEncoder().encode(json),
    len = Math.ceil(encoded.length / 4) * 4,
    buf = new ArrayBuffer(12 + 8 + len + 8 + 44),
    view = new DataView(buf);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, buf.byteLength, true);
  view.setUint32(12, len, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buf, 20, len).fill(32);
  new Uint8Array(buf, 20, encoded.length).set(encoded);
  view.setUint32(20 + len, 44, true);
  view.setUint32(24 + len, 0x004e4942, true);
  new Float32Array(buf, 28 + len, 9).set([-1, -1, 0, 1, -1, 0, 0, 1, 0]);
  new Uint16Array(buf, 64 + len, 3).set([0, 1, 2]);
  const mesh = parseGlb(buf);
  expect(mesh.vertices).toHaveLength(3);
  expect(mesh.faces).toEqual([[0, 1, 2]]);
});
it("rejects meshes whose projected raster work exceeds budget", () => {
  expect(() =>
    renderMesh(
      { vertices: CUBE.vertices, faces: Array(50000).fill([4, 5, 6]) },
      0,
      0,
      1,
      1,
    ),
  ).toThrow(/budget/);
});
it("every generator seed changes rendered pixels", () => {
  for (const mode of ["noise", "waves", "particles", "fractal"] as const)
    expect(
      generate({ ...DEFAULT_GENERATOR, mode, seed: 1 }).layers[0].cells,
    ).not.toEqual(
      generate({ ...DEFAULT_GENERATOR, mode, seed: 2 }).layers[0].cells,
    );
});
it("rejects oversized OBJ lines before splitting their tokens", () => {
  expect(() => parseObj("f " + "1 ".repeat(10000))).toThrow(/line/);
});
