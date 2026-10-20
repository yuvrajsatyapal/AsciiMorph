import { expect, it } from "vitest";
import { createDocument, parseDocument, serializeDocument } from "./document";
import { mergeLayerDown, resolvedLayers, setLayerMask } from "./layers";
import { convert } from "@/converter/engine";
import { DEFAULT_SETTINGS } from "@/converter/settings";
it("retains source and validated conversion settings through serialization", async () => {
  const doc = await convert(
    {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
    },
    {
      ...DEFAULT_SETTINGS,
      width: 2,
      height: 1,
      preserveAspect: false,
      rotation: 180,
    },
  );
  expect(doc.conversion?.source.width).toBe(2);
  expect(doc.layers[0].cells[0].char).not.toBe(" ");
  expect(parseDocument(serializeDocument(doc)).conversion).toEqual(
    doc.conversion,
  );
  expect(() =>
    parseDocument(
      JSON.stringify({
        ...doc,
        conversion: {
          ...doc.conversion,
          source: { width: 1, height: 1, data: [255] },
        },
      }),
    ),
  ).toThrow();
});
it("applies masks and reusable adjustments without modifying source cells", () => {
  const doc = createDocument(2, 1);
  doc.layers[0].cells[0] = { char: "X", fg: "#ffffff", bg: null, alpha: 1 };
  doc.layers[0].adjustments = ["invert"];
  const masked = setLayerMask(doc, doc.layers[0].id, [0, 1]);
  expect(resolvedLayers(masked)[0].cells[0]).toMatchObject({
    alpha: 0,
    fg: "#000000",
  });
  expect(masked.layers[0].cells[0].fg).toBe("#ffffff");
  expect(() => setLayerMask(doc, doc.layers[0].id, [1])).toThrow();
});
it("merges downward and honors hidden groups", () => {
  const doc = createDocument(1, 1);
  doc.layers[0].cells[0].char = "A";
  doc.layers.push({
    ...doc.layers[0],
    id: "top",
    name: "Top",
    cells: [{ char: "B", fg: "#ffffff", bg: null, alpha: 1 }],
  });
  expect(mergeLayerDown(doc, "top").layers[0].cells[0].char).toBe("B");
  doc.layerGroups = [{ id: "g", name: "Hidden", visible: false, opacity: 1 }];
  doc.layers[1].groupId = "g";
  expect(resolvedLayers(doc)).toHaveLength(1);
});
it("preserves masks when a canvas grows or crops", async () => {
  const { resizeDocument } = await import("./grid");
  const doc = setLayerMask(createDocument(2, 1), "missing", [0, 1]);
  const masked = setLayerMask(doc, doc.layers[0].id, [0, 1]);
  expect(resizeDocument(masked, 3, 2, true).layers[0].mask).toEqual([
    0, 1, 1, 1, 1, 1,
  ]);
  expect(resizeDocument(masked, 1, 1, true).layers[0].mask).toEqual([0]);
  expect(resizeDocument(masked, 1, 1, false).layers[0].mask).toEqual([1]);
});
