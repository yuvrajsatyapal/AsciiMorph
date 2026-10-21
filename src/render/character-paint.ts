import { backingSize, MAX_BACKING_PIXELS } from "@/core/render";
import {
  TRANSPARENT_GLYPH_INDEX,
  validateGrid,
  type GlyphCalibrationV1,
  type PackedGlyphGrid,
} from "./character-contract";

type Surface = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
interface Dictionary {
  width: number;
  height: number;
  calibration: GlyphCalibrationV1;
  surfaces: Map<number, Surface>;
  scratch?: Surface;
  pixels: number;
}
// At most four dictionaries and 32 million retained canvas pixels, including tint
// scratch. Keys are immutable calibration snapshots or canonical Braille geometry.
const dictionaries = new Map<GlyphCalibrationV1 | string, Dictionary>();
let retainedPixels = 0;
function surface(width: number, height: number): Surface {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas rendering is unavailable");
  return { canvas, ctx };
}
function dropOldest(): void {
  const key = dictionaries.keys().next().value!;
  const d = dictionaries.get(key)!;
  retainedPixels -= d.pixels;
  dictionaries.delete(key);
}
/** Canonical 2×4 geometric dots, not platform-font calibration. */
function canonicalBraille(
  cellWidth: number,
  cellHeight: number,
): GlyphCalibrationV1 {
  const width = Math.ceil(cellWidth),
    height = Math.ceil(cellHeight);
  const masks = new Uint8Array(width * height * 256);
  const bits = [
    [0, 3],
    [1, 4],
    [2, 5],
    [6, 7],
  ];
  // Four subpixel samples per axis produce deterministic antialiased dot edges.
  const radius = Math.min(width / 5, height / 10);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const column = Math.min(1, Math.floor((x * 2) / width)),
        row = Math.min(3, Math.floor((y * 4) / height));
      const cx = ((column + 0.5) * width) / 2,
        cy = ((row + 0.5) * height) / 4;
      let inside = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          if (
            (x + (sx + 0.5) / 4 - cx) ** 2 + (y + (sy + 0.5) / 4 - cy) ** 2 <=
            radius ** 2
          )
            inside++;
        }
      if (inside)
        for (let mask = 0; mask < 256; mask++) {
          if (mask & (1 << bits[row][column]))
            masks[mask * width * height + y * width + x] = Math.round(
              (inside * 255) / 16,
            );
        }
    }
  const coverage = new Float32Array(256),
    shapes = new Float32Array(256 * 9);
  const counts = new Uint32Array(9);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      counts[
        Math.min(2, Math.floor((y * 3) / height)) * 3 +
          Math.min(2, Math.floor((x * 3) / width))
      ]++;
    }
  for (let mask = 0; mask < 256; mask++) {
    let sum = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const alpha = masks[mask * width * height + y * width + x];
        const bin =
          Math.min(2, Math.floor((y * 3) / height)) * 3 +
          Math.min(2, Math.floor((x * 3) / width));
        sum += alpha;
        shapes[mask * 9 + bin] += alpha;
      }
    coverage[mask] = sum / (width * height * 255);
    for (let bin = 0; bin < 9; bin++)
      shapes[mask * 9 + bin] /= counts[bin] * 255;
  }
  const max = coverage[255];
  if (max) for (let mask = 0; mask < 256; mask++) coverage[mask] /= max;
  return {
    version: 1,
    id: `canonical-braille:${cellWidth}:${cellHeight}`,
    fontKey: "canonical-geometric-braille-v1",
    cellWidth,
    cellHeight,
    maskWidth: width,
    maskHeight: height,
    glyphs: Array.from({ length: 256 }, (_, mask) =>
      String.fromCodePoint(0x2800 + mask),
    ),
    masks,
    coverage,
    shapes,
  };
}
function dictionary(
  grid: PackedGlyphGrid,
  calibration: GlyphCalibrationV1 | undefined,
): Dictionary {
  const key = grid.calibrationId
    ? calibration!
    : `canonical-braille:${grid.cellWidth}:${grid.cellHeight}`;
  const width = grid.calibrationId
    ? calibration!.maskWidth
    : Math.ceil(grid.cellWidth);
  const height = grid.calibrationId
    ? calibration!.maskHeight
    : Math.ceil(grid.cellHeight);
  const count = grid.calibrationId ? calibration!.glyphs.length : 256;
  backingSize(width, height);
  // Every glyph could be used, plus one tint scratch. Validate the whole bound
  // before creating even the first canvas, rather than growing without a budget.
  const pixels = width * height * (count + 1);
  if (pixels > MAX_BACKING_PIXELS)
    throw new Error("Glyph mask surface budget exceeded");
  const hit = dictionaries.get(key);
  if (hit) {
    dictionaries.delete(key);
    dictionaries.set(key, hit);
    return hit;
  }
  while (dictionaries.size >= 4 || retainedPixels + pixels > MAX_BACKING_PIXELS)
    dropOldest();
  const d: Dictionary = {
    width,
    height,
    calibration: grid.calibrationId
      ? calibration!
      : canonicalBraille(grid.cellWidth, grid.cellHeight),
    surfaces: new Map(),
    pixels,
  };
  retainedPixels += pixels;
  dictionaries.set(key, d);
  return d;
}
function glyphSurface(d: Dictionary, index: number): Surface {
  const hit = d.surfaces.get(index);
  if (hit) return hit;
  const s = surface(d.width, d.height);
  const image = s.ctx.createImageData(d.width, d.height);
  const offset = index * d.width * d.height;
  for (let i = 0; i < d.width * d.height; i++) {
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = 255;
    image.data[i * 4 + 3] = d.calibration.masks[offset + i];
  }
  s.ctx.putImageData(image, 0, 0);
  d.surfaces.set(index, s);
  return s;
}
function color(bytes: Uint8Array, offset: number): string {
  return `#${bytes[offset].toString(16).padStart(2, "0")}${bytes[offset + 1].toString(16).padStart(2, "0")}${bytes[offset + 2].toString(16).padStart(2, "0")}`;
}
/**
 * Paints over the caller's current canvas/transform/clip with source-over; caller
 * owns sizing and clearing. Foreground mask alpha multiplies exact cell alpha,
 * while background byte alpha is independent. All caller state is restored.
 * Calibrations are immutable identity snapshots: changing masks requires a new
 * calibration object. Empty calibrationId uses canonical geometric Braille dots,
 * never an unrelated coverage-sorted glyph dictionary or an unresolved font load.
 */
export function paintCharacterGrid(
  ctx: CanvasRenderingContext2D,
  grid: PackedGlyphGrid,
  calibration: GlyphCalibrationV1 | undefined,
  scale: number,
): void {
  if (grid.calibrationId && !calibration)
    throw new Error("Glyph calibration is required for packed painting");
  validateGrid(grid, grid.calibrationId ? calibration : undefined);
  backingSize(
    grid.width * grid.cellWidth,
    grid.height * grid.cellHeight,
    scale,
  );
  const d = dictionary(grid, calibration);
  ctx.save();
  try {
    ctx.scale(scale, scale);
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    for (let i = 0; i < grid.glyphIndices.length; i++) {
      const offset = i * 4,
        x = (i % grid.width) * grid.cellWidth,
        y = Math.floor(i / grid.width) * grid.cellHeight;
      if (grid.background[offset + 3]) {
        ctx.globalAlpha = grid.background[offset + 3] / 255;
        ctx.fillStyle = color(grid.background, offset);
        ctx.fillRect(x, y, grid.cellWidth, grid.cellHeight);
      }
      const index = grid.glyphIndices[i];
      if (index === TRANSPARENT_GLYPH_INDEX) continue;
      const base = glyphSurface(d, index);
      const scratch = d.scratch ?? (d.scratch = surface(d.width, d.height));
      scratch.ctx.globalCompositeOperation = "source-over";
      scratch.ctx.clearRect(0, 0, d.width, d.height);
      scratch.ctx.drawImage(base.canvas, 0, 0);
      scratch.ctx.globalCompositeOperation = "source-in";
      scratch.ctx.fillStyle = color(grid.foreground, offset);
      scratch.ctx.fillRect(0, 0, d.width, d.height);
      ctx.globalAlpha = grid.alpha[i];
      ctx.drawImage(
        scratch.canvas,
        0,
        0,
        d.width,
        d.height,
        x,
        y,
        grid.cellWidth,
        grid.cellHeight,
      );
    }
  } finally {
    ctx.restore();
  }
}
