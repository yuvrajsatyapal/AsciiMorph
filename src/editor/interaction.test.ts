import { describe, it, expect } from "vitest";
import { cellAt, selectionBetween, acceptsShortcut } from "./interaction";
import { createDocument } from "@/core/document";
describe("canvas input mapping", () => {
  it("maps zoomed and offset client coordinates into cells", () => {
    expect(
      cellAt(
        145,
        92,
        { left: 100, top: 20, width: 180, height: 180 },
        createDocument(10, 5),
      ),
    ).toEqual({ x: 2, y: 2 });
  });
  it("clamps outside captured pointers to canvas bounds", () => {
    expect(
      cellAt(
        -20,
        999,
        { left: 0, top: 0, width: 90, height: 90 },
        createDocument(10, 5),
      ),
    ).toEqual({ x: 0, y: 4 });
  });
  it("normalizes rectangular selection and isolates ordinary inputs", () => {
    expect(selectionBetween({ x: 4, y: 6 }, { x: 2, y: 3 })).toEqual({
      x: 2,
      y: 3,
      width: 3,
      height: 4,
    });
    expect(acceptsShortcut(document.createElement("input"))).toBe(false);
    expect(acceptsShortcut(document.createElement("canvas"))).toBe(true);
  });
});
import { stampAt } from "./interaction";
it("anchors every stamp row at its clicked column and preserves ink", () => {
  const a = stampAt(createDocument(12, 6), { x: 5, y: 2 }, "AB\nCD", {
    char: "#",
    fg: "#ff0000",
    bg: null,
    alpha: 1,
  });
  expect(a.layers[0].cells[2 * 12 + 5].char).toBe("A");
  expect(a.layers[0].cells[3 * 12 + 5]).toEqual({
    char: "C",
    fg: "#ff0000",
    bg: null,
    alpha: 1,
  });
  expect(a.layers[0].cells[3 * 12].char).toBe(" ");
});
