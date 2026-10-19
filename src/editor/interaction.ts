import type { AsciiDocument } from "@/core/document";
export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  width: number;
  height: number;
}
export function cellAt(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  doc: AsciiDocument,
): Point {
  return {
    x: Math.max(
      0,
      Math.min(
        doc.width - 1,
        Math.floor(((clientX - rect.left) / rect.width) * doc.width),
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        doc.height - 1,
        Math.floor(((clientY - rect.top) / rect.height) * doc.height),
      ),
    ),
  };
}
export function selectionBetween(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x) + 1,
    height: Math.abs(a.y - b.y) + 1,
  };
}
export function acceptsShortcut(target: EventTarget | null) {
  return !(
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        'input,textarea,select,[contenteditable="true"],[role="dialog"]',
      ),
    )
  );
}
import type { Cell } from "@/core/document";
import { textDocument } from "@/core/grid";
import { paste } from "@/core/selection";
export function stampAt(
  doc: AsciiDocument,
  point: Point,
  text: string,
  style: Cell,
) {
  const source = textDocument(text);
  return paste(
    doc,
    {
      width: source.width,
      height: source.height,
      cells: source.layers[0].cells.map((c) => ({ ...style, char: c.char })),
    },
    point,
  );
}
