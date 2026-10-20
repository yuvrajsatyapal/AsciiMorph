import { activeLayer } from "./layers";
import {
  blankCell,
  createDocument,
  graphemes,
  validateDocument,
  type AsciiDocument,
  type Cell,
} from "./document";
export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  width: number;
  height: number;
}
export type DrawTool =
  | "pencil"
  | "eraser"
  | "line"
  | "rectangle"
  | "filled-rectangle"
  | "ellipse";
export function editCells(
  doc: AsciiDocument,
  edit: (cells: Cell[]) => void,
): AsciiDocument {
  const layer = activeLayer(doc);
  if (layer.locked) return doc;
  const cells = layer.cells.slice();
  edit(cells);
  if (cells.every((c, i) => c === layer.cells[i])) return doc;
  return {
    ...doc,
    layers: doc.layers.map((l) => (l.id === layer.id ? { ...l, cells } : l)),
    updatedAt: new Date().toISOString(),
  };
}
export function inside(doc: AsciiDocument, x: number, y: number) {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < doc.width &&
    y < doc.height
  );
}
function line(a: Point, b: Point, plot: (x: number, y: number) => void) {
  let x = Math.round(a.x),
    y = Math.round(a.y);
  const bx = Math.round(b.x),
    by = Math.round(b.y),
    dx = Math.abs(bx - x),
    dy = -Math.abs(by - y),
    sx = x < bx ? 1 : -1,
    sy = y < by ? 1 : -1;
  let e = dx + dy;
  for (;;) {
    plot(x, y);
    if (x === bx && y === by) break;
    const twice = 2 * e;
    if (twice >= dy) {
      e += dy;
      x += sx;
    }
    if (twice <= dx) {
      e += dx;
      y += sy;
    }
  }
}
export function draw(
  doc: AsciiDocument,
  tool: DrawTool,
  start: Point,
  end: Point,
  cell: Cell,
  brush = 1,
  reset = true,
): AsciiDocument {
  if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) return doc;
  return editCells(doc, (cells) => {
    const size = Math.max(1, Math.min(8, Math.round(brush)));
    const plot = (x: number, y: number) => {
      const n = tool === "pencil" || tool === "eraser" ? size : 1;
      for (let yy = y - Math.floor(n / 2); yy < y - Math.floor(n / 2) + n; yy++)
        for (
          let xx = x - Math.floor(n / 2);
          xx < x - Math.floor(n / 2) + n;
          xx++
        )
          if (inside(doc, xx, yy)) {
            const i = yy * doc.width + xx;
            cells[i] =
              tool === "eraser"
                ? reset
                  ? blankCell()
                  : { ...cells[i], char: " " }
                : { ...cell };
          }
    };
    const x0 = Math.round(Math.min(start.x, end.x)),
      x1 = Math.round(Math.max(start.x, end.x)),
      y0 = Math.round(Math.min(start.y, end.y)),
      y1 = Math.round(Math.max(start.y, end.y));
    if (tool === "rectangle" || tool === "filled-rectangle") {
      for (let y = Math.max(0, y0); y <= Math.min(doc.height - 1, y1); y++)
        for (let x = Math.max(0, x0); x <= Math.min(doc.width - 1, x1); x++)
          if (
            tool === "filled-rectangle" ||
            x === x0 ||
            x === x1 ||
            y === y0 ||
            y === y1
          )
            plot(x, y);
    } else if (tool === "ellipse" && x1 !== x0 && y1 !== y0) {
      const rx = (x1 - x0) / 2,
        ry = (y1 - y0) / 2,
        cx = x0 + rx,
        cy = y0 + ry;
      const steps = Math.ceil(2 * Math.PI * Math.max(rx, ry) * 2);
      let prev = { x: Math.round(cx + rx), y: Math.round(cy) };
      for (let i = 1; i <= steps; i++) {
        const p = {
          x: Math.round(cx + rx * Math.cos((i / steps) * 2 * Math.PI)),
          y: Math.round(cy + ry * Math.sin((i / steps) * 2 * Math.PI)),
        };
        line(prev, p, plot);
        prev = p;
      }
    } else line(start, end, plot);
  });
}
function same(a: Cell, b: Cell) {
  return (
    a.char === b.char && a.fg === b.fg && a.bg === b.bg && a.alpha === b.alpha
  );
}
export function fill(doc: AsciiDocument, point: Point, cell: Cell) {
  if (!inside(doc, point.x, point.y)) return doc;
  return editCells(doc, (cells) => {
    const first = point.y * doc.width + point.x,
      target = cells[first];
    if (same(target, cell)) return;
    const stack = [first],
      visited = new Uint8Array(cells.length);
    while (stack.length) {
      const i = stack.pop()!;
      if (visited[i]) continue;
      visited[i] = 1;
      if (!same(cells[i], target)) continue;
      cells[i] = { ...cell };
      const x = i % doc.width;
      if (x > 0) stack.push(i - 1);
      if (x < doc.width - 1) stack.push(i + 1);
      if (i >= doc.width) stack.push(i - doc.width);
      if (i < cells.length - doc.width) stack.push(i + doc.width);
    }
  });
}
export function expandText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((row) => {
      let col = 0;
      return graphemes(row)
        .map((c) => {
          if (c === "\t") {
            const spaces = 4 - (col % 4);
            col += spaces;
            return " ".repeat(spaces);
          }
          if (/[\u0000-\u001f\u007f]/.test(c)) return "";
          col++;
          return c;
        })
        .join("");
    });
}
export function putText(
  doc: AsciiDocument,
  point: Point,
  text: string,
  styleCell: Cell,
) {
  return editCells(doc, (cells) => {
    expandText(text).forEach((row, dy) =>
      graphemes(row).forEach((char, dx) => {
        const x = (dy === 0 ? point.x : 0) + dx,
          y = point.y + dy;
        if (inside(doc, x, y))
          cells[y * doc.width + x] = { ...styleCell, char };
      }),
    );
  });
}
export function textDocument(text: string, name = "Imported artwork") {
  const rows = expandText(text),
    width = Math.max(1, ...rows.map((r) => graphemes(r).length));
  const d = createDocument(width, rows.length, name);
  return putText(d, { x: 0, y: 0 }, rows.join("\n"), blankCell());
}
export function resizeDocument(
  doc: AsciiDocument,
  width: number,
  height: number,
  preserve: boolean,
) {
  const fresh = createDocument(width, height, doc.name);
  const result = {
    ...doc,
    width,
    height,
    layers: doc.layers.map((l) => ({
      ...l,
      ...(l.mask
        ? {
            mask: fresh.layers[0].cells.map((_, i) => {
              const x = i % width,
                y = Math.floor(i / width);
              return preserve && x < doc.width && y < doc.height
                ? l.mask![y * doc.width + x]
                : 1;
            }),
          }
        : {}),
      cells: fresh.layers[0].cells.map((c, i) => {
        const x = i % width,
          y = Math.floor(i / width);
        return preserve && x < doc.width && y < doc.height
          ? { ...l.cells[y * doc.width + x] }
          : { ...c };
      }),
    })),
    updatedAt: new Date().toISOString(),
  };
  return validateDocument(result);
}
export function findReplace(
  doc: AsciiDocument,
  find: string,
  replacement: string,
) {
  const chars = graphemes(replacement);
  if (graphemes(find).length !== 1 || chars.length > 1) return doc;
  return editCells(doc, (cells) =>
    cells.forEach((c, i) => {
      if (c.char === find) cells[i] = { ...c, char: chars[0] || " " };
    }),
  );
}
