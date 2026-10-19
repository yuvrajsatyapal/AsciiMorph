export interface Cell {
  char: string;
  fg: string;
  bg: string | null;
  alpha: number;
}
export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  cells: Cell[];
}
export interface AsciiDocument {
  version: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  fontSize: number;
  background: string | null;
  layers: Layer[];
  createdAt: string;
  updatedAt: string;
}
export const DEFAULT_FOREGROUND = "#E9B86E";
export const MAX_CELLS = 60000;
export function graphemes(text: string): string[] {
  return Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
    (item) => item.segment,
  );
}
export function blankCell(): Cell {
  return { char: " ", fg: DEFAULT_FOREGROUND, bg: null, alpha: 1 };
}
function fail(message: string): never {
  throw new Error(`Invalid project: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("expected an object");
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string, max = 120): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail(`${label} must contain 1–${max} characters`);
  return value;
}
function number(
  value: unknown,
  label: string,
  min: number,
  max: number,
  integer = false,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    fail(`${label} is out of range`);
  return value;
}
function color(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (
    typeof value !== "string" ||
    !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
  )
    fail("colors must be hex colors");
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") fail("expected boolean");
  return value;
}
function timestamp(value: unknown): string {
  const result = string(value, "timestamp", 40);
  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(result) ||
    !Number.isFinite(Date.parse(result))
  )
    fail("invalid timestamp");
  return result;
}
function dimensions(width: unknown, height: unknown): [number, number] {
  const w = number(width, "width", 1, 300, true),
    h = number(height, "height", 1, 300, true);
  if (w * h > MAX_CELLS) fail("maximum canvas area is 60,000 cells");
  return [w, h];
}
export function createDocument(
  width = 80,
  height = 40,
  name = "Untitled artwork",
): AsciiDocument {
  const [w, h] = dimensions(width, height);
  string(name, "name");
  const now = new Date().toISOString();
  return {
    version: 1,
    id: crypto.randomUUID(),
    name,
    width: w,
    height: h,
    cellWidth: 9,
    cellHeight: 18,
    fontSize: 14,
    background: null,
    layers: [
      {
        id: crypto.randomUUID(),
        name: "Base layer",
        visible: true,
        locked: false,
        opacity: 1,
        cells: Array.from({ length: w * h }, blankCell),
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}
export function validateDocument(value: unknown): AsciiDocument {
  const d = object(value);
  if (d.version !== 1) fail("unsupported version");
  const [width, height] = dimensions(d.width, d.height);
  if (!Array.isArray(d.layers) || d.layers.length < 1 || d.layers.length > 8)
    fail("expected 1–8 layers");
  const layerIds = new Set<string>();
  const layers: Layer[] = d.layers.map((item) => {
    const l = object(item),
      id = string(l.id, "layer id", 128);
    if (layerIds.has(id)) fail("duplicate layer id");
    layerIds.add(id);
    if (!Array.isArray(l.cells) || l.cells.length !== width * height)
      fail("cell count does not match dimensions");
    return {
      id,
      name: string(l.name, "layer name"),
      visible: boolean(l.visible),
      locked: boolean(l.locked),
      opacity: number(l.opacity, "opacity", 0, 1),
      cells: l.cells.map((item) => {
        const c = object(item);
        if (
          typeof c.char !== "string" ||
          c.char.length > 64 ||
          /[\r\n\t\u0000-\u001f\u007f]/.test(c.char) ||
          (c.char !== "" && graphemes(c.char).length !== 1)
        )
          fail("each cell needs one printable grapheme");
        return {
          char: c.char || " ",
          fg: color(c.fg) as string,
          bg: color(c.bg, true),
          alpha: number(c.alpha, "alpha", 0, 1),
        };
      }),
    };
  });
  return {
    version: 1,
    id: string(d.id, "id", 128),
    name: string(d.name, "name"),
    width,
    height,
    cellWidth: number(d.cellWidth, "cell width", 1, 64),
    cellHeight: number(d.cellHeight, "cell height", 1, 128),
    fontSize: number(d.fontSize, "font size", 1, 96),
    background: color(d.background, true),
    layers,
    createdAt: timestamp(d.createdAt),
    updatedAt: timestamp(d.updatedAt),
  };
}
export function serializeDocument(doc: AsciiDocument): string {
  return JSON.stringify(validateDocument(doc));
}
export function parseDocument(text: string): AsciiDocument {
  if (text.length > 40_000_000) fail("project file is too large");
  return validateDocument(JSON.parse(text));
}
