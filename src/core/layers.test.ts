import { describe, expect, it } from "vitest";
import { createDocument } from "./document";
import {
  addLayer,
  selectLayer,
  updateLayer,
  duplicateLayer,
  deleteLayer,
  moveLayer,
  layerEffect,
  mergeLayerDown,
} from "./layers";
import { draw } from "./grid";
import { capture } from "./selection";
import { createWorkspace } from "@/editor/store";
describe("layer editing", () => {
  it.each(["multiply", "screen", "overlay"] as const)(
    "rejects merging either %s input before changing the artwork",
    (blendMode) => {
      let doc = addLayer(addLayer(createDocument(1, 1)));
      doc.layers[0].cells[0] = {
        char: "X",
        fg: "#203040",
        bg: "#203040",
        alpha: 1,
      };
      doc.layers[2].cells[0] = {
        char: "X",
        fg: "#ffffff",
        bg: "#ffffff",
        alpha: 1,
      };
      for (const index of [1, 2]) {
        doc = updateLayer(doc, doc.layers[index].id, { blendMode });
        const before = structuredClone(doc);
        expect(() => mergeLayerDown(doc, doc.layers[2].id)).toThrow(
          /normal.*blend/i,
        );
        expect(doc).toEqual(before);
        doc = updateLayer(doc, doc.layers[index].id, { blendMode: "normal" });
      }
      expect(mergeLayerDown(doc, doc.layers[2].id).layers[1].cells[0].bg).toBe(
        "#ffffff",
      );
    },
  );
  it("draws and copies the active layer without changing the base", () => {
    const base = createDocument(2, 1);
    const next = addLayer(base);
    const painted = draw(
      next,
      "pencil",
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { char: "X", fg: "#ffffff", bg: null, alpha: 1 },
    );
    expect(painted.layers[0]).toBe(base.layers[0]);
    expect(
      capture(painted, { x: 0, y: 0, width: 1, height: 1 }).cells[0].char,
    ).toBe("X");
    expect(
      draw(
        updateLayer(painted, painted.layers[1].id, { locked: true }),
        "pencil",
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        painted.layers[1].cells[0],
      ).layers[1].cells,
    ).toBe(painted.layers[1].cells);
  });
  it("keeps selection and layer operations undoable and independent", () => {
    const store = createWorkspace();
    const base = createDocument(2, 1);
    store.getState().open(base);
    const added = addLayer(base);
    store.getState().commit(added);
    store.getState().commit(selectLayer(added, base.layers[0].id));
    store.getState().undo();
    expect(store.getState().documents[base.id].activeLayerId).toBe(
      added.layers[1].id,
    );
    const copy = duplicateLayer(added, added.layers[1].id);
    expect(copy.layers[2].cells[0]).not.toBe(added.layers[1].cells[0]);
    expect(moveLayer(copy, copy.layers[2].id, -1).layers[1].id).toBe(
      copy.layers[2].id,
    );
    expect(deleteLayer(base, base.layers[0].id)).toBe(base);
  });
  it("bounds layers and applies effects only to the active unlocked layer", () => {
    let d = createDocument(1, 1);
    for (let i = 0; i < 12; i++) d = addLayer(d);
    expect(d.layers).toHaveLength(8);
    expect(layerEffect(d, "invert").layers[0]).toBe(d.layers[0]);
  });
});
