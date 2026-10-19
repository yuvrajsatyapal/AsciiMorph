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
} from "./layers";
import { draw } from "./grid";
import { capture } from "./selection";
import { createWorkspace } from "@/editor/store";
describe("layer editing", () => {
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
