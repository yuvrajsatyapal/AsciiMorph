import { describe, it, expect } from "vitest";
import { createDocument, blankCell } from "./document";
import {
  draw,
  fill,
  textDocument,
  resizeDocument,
  putText,
  findReplace,
} from "./grid";
import { capture, paste, cut, transform, move, recolor } from "./selection";
const ink = { char: "#", fg: "#ff0000", bg: null, alpha: 1 };
const ch = (d: ReturnType<typeof createDocument>, x: number, y: number) =>
  d.layers[0].cells[y * d.width + x].char;
describe("drawing engine", () => {
  it("interpolates and clips diagonal pencil paths without mutating source", () => {
    const a = createDocument(6, 6);
    const b = draw(a, "pencil", { x: -1, y: -1 }, { x: 5, y: 5 }, ink, 1);
    expect(ch(a, 2, 2)).toBe(" ");
    for (let i = 0; i < 6; i++) expect(ch(b, i, i)).toBe("#");
  });
  it("draws outlined and filled rectangles with reversed corners", () => {
    const a = createDocument(5, 5);
    const b = draw(a, "rectangle", { x: 3, y: 3 }, { x: 1, y: 1 }, ink, 1);
    expect(ch(b, 2, 2)).toBe(" ");
    expect(ch(b, 1, 2)).toBe("#");
    expect(
      ch(
        draw(a, "filled-rectangle", { x: 3, y: 3 }, { x: 1, y: 1 }, ink, 1),
        2,
        2,
      ),
    ).toBe("#");
  });
  it("draws lines and degenerate ellipses", () => {
    const a = createDocument(5, 5);
    expect(
      ch(draw(a, "line", { x: 0, y: 1 }, { x: 4, y: 1 }, ink, 1), 2, 1),
    ).toBe("#");
    expect(
      ch(draw(a, "ellipse", { x: 2, y: 0 }, { x: 2, y: 4 }, ink, 1), 2, 2),
    ).toBe("#");
  });
  it("draws elliptical outline and brush footprint", () => {
    const a = createDocument(7, 7);
    expect(
      ch(draw(a, "ellipse", { x: 1, y: 1 }, { x: 5, y: 5 }, ink, 1), 3, 1),
    ).toBe("#");
    expect(
      ch(draw(a, "pencil", { x: 3, y: 3 }, { x: 3, y: 3 }, ink, 3), 2, 2),
    ).toBe("#");
  });
  it("erases glyph and optionally resets cell styles", () => {
    const a = draw(
      createDocument(3, 3),
      "pencil",
      { x: 1, y: 1 },
      { x: 1, y: 1 },
      { ...ink, bg: "#ffffff" },
      1,
    );
    const b = draw(a, "eraser", { x: 1, y: 1 }, { x: 1, y: 1 }, ink, 1, false);
    expect(b.layers[0].cells[4]).toEqual({ ...ink, char: " ", bg: "#ffffff" });
    expect(
      draw(a, "eraser", { x: 1, y: 1 }, { x: 1, y: 1 }, ink, 1, true).layers[0]
        .cells[4],
    ).toEqual(blankCell());
  });
  it("flood fills only contiguous matching complete cells", () => {
    let a = createDocument(5, 3);
    a = draw(a, "line", { x: 2, y: 0 }, { x: 2, y: 2 }, ink, 1);
    const b = fill(a, { x: 0, y: 0 }, { ...ink, char: "." });
    expect(ch(b, 1, 2)).toBe(".");
    expect(ch(b, 3, 0)).toBe(" ");
    expect(ch(b, 2, 0)).toBe("#");
  });
  it("respects locked layers", () => {
    const a = createDocument(3, 3);
    a.layers[0].locked = true;
    expect(draw(a, "pencil", { x: 1, y: 1 }, { x: 1, y: 1 }, ink, 1)).toEqual(
      a,
    );
  });
  it("imports CRLF tabs and empty lines preserving columns", () => {
    const a = textDocument(" a\r\n\tX\n");
    expect(a.width).toBe(5);
    expect(a.height).toBe(3);
    expect(ch(a, 4, 1)).toBe("X");
    expect(ch(a, 0, 2)).toBe(" ");
  });
  it("types graphemes, newlines and clips outside bounds", () => {
    const a = putText(createDocument(4, 3), { x: 1, y: 0 }, "AB\nC", ink);
    expect(ch(a, 1, 0)).toBe("A");
    expect(ch(a, 0, 1)).toBe("C");
  });
  it("resizes preserving or resetting artwork", () => {
    const a = putText(createDocument(4, 3), { x: 0, y: 0 }, "ab", ink);
    expect(ch(resizeDocument(a, 2, 2, true), 1, 0)).toBe("b");
    expect(ch(resizeDocument(a, 2, 2, false), 1, 0)).toBe(" ");
  });
  it("finds and replaces characters without destroying colors", () => {
    const a = putText(createDocument(3, 2), { x: 0, y: 0 }, "a a", ink);
    const b = findReplace(a, "a", "@");
    expect(ch(b, 2, 0)).toBe("@");
    expect(b.layers[0].cells[2].fg).toBe(ink.fg);
  });
});
describe("selection operations", () => {
  const fixture = () =>
    putText(createDocument(6, 4), { x: 0, y: 0 }, "ab\ncd", ink);
  it("captures and pastes colored cells and cuts atomically", () => {
    const a = fixture();
    const clip = capture(a, { x: 0, y: 0, width: 2, height: 2 });
    expect(clip.cells[0]).toEqual({ ...ink, char: "a" });
    expect(ch(paste(a, clip, { x: 4, y: 2 }), 5, 3)).toBe("d");
    expect(ch(cut(a, { x: 0, y: 0, width: 2, height: 2 }), 1, 1)).toBe(" ");
  });
  it("moves overlapping selections using captured source", () => {
    const a = move(
      fixture(),
      { x: 0, y: 0, width: 2, height: 2 },
      { x: 1, y: 0 },
    );
    expect(ch(a, 0, 0)).toBe(" ");
    expect(ch(a, 1, 0)).toBe("a");
    expect(ch(a, 2, 0)).toBe("b");
  });
  it("flips and rotates a non-square region", () => {
    const clip = capture(fixture(), { x: 0, y: 0, width: 2, height: 3 });
    expect(transform(clip, "horizontal").cells[0].char).toBe("b");
    const rot = transform(clip, "rotate");
    expect(rot.width).toBe(3);
    expect(rot.height).toBe(2);
    expect(rot.cells.map((c) => c.char).join("")).toBe(" ca db");
  });
  it("recolors only selected cells", () => {
    const a = recolor(
      fixture(),
      { x: 0, y: 0, width: 1, height: 1 },
      "#ffffff",
      null,
    );
    expect(a.layers[0].cells[0].fg).toBe("#ffffff");
    expect(a.layers[0].cells[1].fg).toBe(ink.fg);
  });
});
