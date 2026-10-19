import { blankCell, type AsciiDocument, type Cell } from "./document";
import { editCells, inside, type Point, type Rect } from "./grid";
export interface Clipboard {
  width: number;
  height: number;
  cells: Cell[];
}
export function capture(doc: AsciiDocument, r: Rect): Clipboard {
  return {
    width: r.width,
    height: r.height,
    cells: Array.from({ length: r.width * r.height }, (_, i) => {
      const x = r.x + (i % r.width),
        y = r.y + Math.floor(i / r.width);
      return inside(doc, x, y)
        ? { ...doc.layers[0].cells[y * doc.width + x] }
        : blankCell();
    }),
  };
}
export function paste(doc: AsciiDocument, clip: Clipboard, p: Point) {
  return editCells(doc, (cells) =>
    clip.cells.forEach((c, i) => {
      const x = p.x + (i % clip.width),
        y = p.y + Math.floor(i / clip.width);
      if (inside(doc, x, y)) cells[y * doc.width + x] = { ...c };
    }),
  );
}
export function cut(doc: AsciiDocument, r: Rect) {
  return editCells(doc, (cells) => {
    for (
      let y = Math.max(0, r.y);
      y < Math.min(doc.height, r.y + r.height);
      y++
    )
      for (
        let x = Math.max(0, r.x);
        x < Math.min(doc.width, r.x + r.width);
        x++
      )
        cells[y * doc.width + x] = blankCell();
  });
}
export function move(doc: AsciiDocument, r: Rect, p: Point) {
  return paste(cut(doc, r), capture(doc, r), p);
}
export function recolor(
  doc: AsciiDocument,
  r: Rect,
  fg: string,
  bg: string | null,
) {
  return editCells(doc, (cells) => {
    for (
      let y = Math.max(0, r.y);
      y < Math.min(doc.height, r.y + r.height);
      y++
    )
      for (
        let x = Math.max(0, r.x);
        x < Math.min(doc.width, r.x + r.width);
        x++
      ) {
        const i = y * doc.width + x;
        cells[i] = { ...cells[i], fg, bg };
      }
  });
}
export function transform(
  clip: Clipboard,
  kind: "horizontal" | "vertical" | "rotate",
): Clipboard {
  const width = kind === "rotate" ? clip.height : clip.width,
    height = kind === "rotate" ? clip.width : clip.height;
  const cells = Array.from({ length: width * height }, blankCell);
  clip.cells.forEach((c, i) => {
    const x = i % clip.width,
      y = Math.floor(i / clip.width);
    const nx =
        kind === "horizontal"
          ? clip.width - 1 - x
          : kind === "rotate"
            ? clip.height - 1 - y
            : x,
      ny =
        kind === "vertical" ? clip.height - 1 - y : kind === "rotate" ? x : y;
    cells[ny * width + nx] = { ...c };
  });
  return { width, height, cells };
}
