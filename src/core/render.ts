import { type AsciiDocument, type Cell } from "./document";
export const MAX_BACKING_PIXELS = 32_000_000;
export const MAX_BACKING_SIDE = 16_384;
export const ART_FONT = '"IBM Plex Mono"';
export interface CellDisplay extends Cell {
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  layerId: string;
  layerOpacity: number;
}
export function displayList(
  doc: AsciiDocument,
  monochrome = false,
): CellDisplay[] {
  return doc.layers
    .filter((l) => l.visible && l.opacity > 0)
    .flatMap((l) =>
      l.cells.map((c, i) => ({
        ...c,
        fg: monochrome ? "#ffffff" : c.fg,
        bg: monochrome && c.bg ? "#000000" : c.bg,
        column: i % doc.width,
        row: Math.floor(i / doc.width),
        x: (i % doc.width) * doc.cellWidth,
        y: Math.floor(i / doc.width) * doc.cellHeight,
        width: doc.cellWidth,
        height: doc.cellHeight,
        layerId: l.id,
        layerOpacity: l.opacity,
      })),
    );
}
export function documentText(doc: AsciiDocument) {
  const chars = Array<string>(doc.width * doc.height).fill(" ");
  for (const l of doc.layers)
    if (l.visible && l.opacity > 0)
      l.cells.forEach((c, i) => {
        if (c.alpha > 0) {
          if (c.bg !== null) chars[i] = " ";
          if (c.char !== " ") chars[i] = c.char;
        }
      });
  return Array.from({ length: doc.height }, (_, y) =>
    chars.slice(y * doc.width, (y + 1) * doc.width).join(""),
  ).join("\n");
}
export async function ensureArtworkFont(fontSize = 14) {
  const loaded = await document.fonts.load(`${fontSize}px ${ART_FONT}`);
  await document.fonts.ready;
  if (loaded.length === 0)
    throw new Error(
      "Artwork font failed to load. Please reload and try again.",
    );
}
function surface(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas rendering is unavailable.");
  return { canvas, ctx };
}
const paintedMode = new WeakMap<HTMLCanvasElement, string>();
export interface PaintOptions {
  monochrome?: boolean;
  previous?: AsciiDocument | null;
  pixelRatio?: number;
}
export function backingSize(
  width: number,
  height: number,
  ratio = 1,
): { width: number; height: number } {
  const pw = Math.ceil(width * ratio),
    ph = Math.ceil(height * ratio);
  if (!Number.isFinite(ratio) || ratio <= 0)
    throw new Error("Canvas pixel ratio must be a positive finite number.");
  if (
    !Number.isFinite(pw) ||
    !Number.isFinite(ph) ||
    pw < 1 ||
    ph < 1 ||
    pw > MAX_BACKING_SIDE ||
    ph > MAX_BACKING_SIDE ||
    pw * ph > MAX_BACKING_PIXELS
  )
    throw new Error(
      "Canvas image is too large. Reduce canvas size, cell dimensions, or display pixel ratio.",
    );
  return { width: pw, height: ph };
}
// Preserve logical geometry while respecting bounded backing stores on Retina/mobile.
export function previewPixelRatio(
  width: number,
  height: number,
  requested = 1,
) {
  const preferred = Number.isFinite(requested) && requested > 0 ? requested : 1;
  // A one-pixel margin accounts for backingSize's ceil on each axis.
  return Math.min(
    preferred,
    (MAX_BACKING_SIDE - 1) / width,
    (MAX_BACKING_SIDE - 1) / height,
    Math.sqrt((MAX_BACKING_PIXELS - 2 * MAX_BACKING_SIDE) / (width * height)),
  );
}
export function paint(
  canvas: HTMLCanvasElement,
  doc: AsciiDocument,
  options: PaintOptions = {},
) {
  const ratio =
      options.pixelRatio ??
      (typeof window !== "undefined" ? window.devicePixelRatio : 1) ??
      1,
    w = doc.width * doc.cellWidth,
    h = doc.height * doc.cellHeight;
  const { width: pw, height: ph } = backingSize(w, h, ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas rendering is unavailable.");
  const prev = options.previous;
  const mode = `${ratio}:${!!options.monochrome}`;
  const sameSize = canvas.width === pw && canvas.height === ph;
  let region = { x: 0, y: 0, width: w, height: h };
  if (
    sameSize &&
    paintedMode.get(canvas) === mode &&
    prev &&
    prev.width === doc.width &&
    prev.height === doc.height &&
    prev.cellWidth === doc.cellWidth &&
    prev.cellHeight === doc.cellHeight &&
    prev.fontSize === doc.fontSize &&
    prev.background === doc.background &&
    prev.layers.length === doc.layers.length &&
    prev.layers.every(
      (l, i) =>
        l.id === doc.layers[i].id &&
        l.visible === doc.layers[i].visible &&
        l.opacity === doc.layers[i].opacity,
    )
  ) {
    let x0 = doc.width,
      y0 = doc.height,
      x1 = -1,
      y1 = -1;
    doc.layers.forEach((l, j) =>
      l.cells.forEach((c, i) => {
        const p = prev.layers[j].cells[i];
        if (
          c !== p &&
          (c.char !== p.char ||
            c.fg !== p.fg ||
            c.bg !== p.bg ||
            c.alpha !== p.alpha)
        ) {
          x0 = Math.min(x0, i % doc.width);
          x1 = Math.max(x1, i % doc.width);
          y0 = Math.min(y0, Math.floor(i / doc.width));
          y1 = Math.max(y1, Math.floor(i / doc.width));
        }
      }),
    );
    if (x1 < 0) return;
    region = {
      x: x0 * doc.cellWidth,
      y: y0 * doc.cellHeight,
      width: (x1 - x0 + 1) * doc.cellWidth,
      height: (y1 - y0 + 1) * doc.cellHeight,
    };
  }
  paintedMode.set(canvas, mode);
  if (!sameSize) {
    canvas.width = pw;
    canvas.height = ph;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(region.x, region.y, region.width, region.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(region.x, region.y, region.width, region.height);
  ctx.clip();
  if (doc.background) {
    ctx.fillStyle = options.monochrome ? "#000000" : doc.background;
    ctx.fillRect(0, 0, w, h);
  }
  const cellSurface = surface(
    Math.ceil(doc.cellWidth * ratio),
    Math.ceil(doc.cellHeight * ratio),
  );
  const layerSize = backingSize(region.width, region.height, ratio);
  const layerSurface = surface(layerSize.width, layerSize.height);
  const cc = cellSurface.ctx,
    lc = layerSurface.ctx;
  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity === 0) continue;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, layerSize.width, layerSize.height);
    lc.setTransform(ratio, 0, 0, ratio, -region.x * ratio, -region.y * ratio);
    for (
      let y = Math.floor(region.y / doc.cellHeight);
      y < Math.ceil((region.y + region.height) / doc.cellHeight);
      y++
    )
      for (
        let x = Math.floor(region.x / doc.cellWidth);
        x < Math.ceil((region.x + region.width) / doc.cellWidth);
        x++
      ) {
        const c = layer.cells[y * doc.width + x];
        if (c.alpha === 0 || (c.char === " " && c.bg === null)) continue;
        cc.setTransform(1, 0, 0, 1, 0, 0);
        cc.clearRect(0, 0, cellSurface.canvas.width, cellSurface.canvas.height);
        cc.setTransform(ratio, 0, 0, ratio, 0, 0);
        cc.save();
        cc.beginPath();
        cc.rect(0, 0, doc.cellWidth, doc.cellHeight);
        cc.clip();
        if (c.bg) {
          cc.fillStyle = options.monochrome ? "#000000" : c.bg;
          cc.fillRect(0, 0, doc.cellWidth, doc.cellHeight);
        }
        cc.font = `${doc.fontSize}px ${ART_FONT}`;
        cc.textBaseline = "middle";
        cc.textAlign = "center";
        cc.fillStyle = options.monochrome ? "#ffffff" : c.fg;
        cc.fillText(c.char, doc.cellWidth / 2, doc.cellHeight / 2);
        cc.restore();
        lc.globalAlpha = c.alpha;
        lc.drawImage(
          cellSurface.canvas,
          0,
          0,
          doc.cellWidth * ratio,
          doc.cellHeight * ratio,
          x * doc.cellWidth,
          y * doc.cellHeight,
          doc.cellWidth,
          doc.cellHeight,
        );
      }
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(
      layerSurface.canvas,
      0,
      0,
      region.width * ratio,
      region.height * ratio,
      region.x,
      region.y,
      region.width,
      region.height,
    );
  }
  ctx.restore();
}
