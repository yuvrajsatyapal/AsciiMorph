import { createDocument, type Cell, MAX_CELLS } from "@/core/document";
import { characterSet, type Calibration } from "./presets";
import type { NumericEngine } from "./wasm";
import { type ConversionSettings, validateSettings } from "./settings";
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
const clamp = (v: number) => Math.max(0, Math.min(255, v));
export const luminance = (r: number, g: number, b: number) =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;
export function tone(v: number, s: ConversionSettings) {
  const contrast = s.contrast / 100;
  const factor = contrast === 1 ? 255 : (1 + contrast) / (1 - contrast);
  return (
    255 *
    Math.pow(
      clamp((v - 127.5) * factor + 127.5 + s.brightness * 2.55) / 255,
      1 / s.gamma,
    )
  );
}
export function gridDimensions(w: number, h: number, s: ConversionSettings) {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
    throw new Error("Invalid image dimensions");
  validateSettings(s);
  let width = s.width,
    height = s.height;
  if (s.preserveAspect) {
    height = Math.max(
      1,
      Math.round((((width * h) / w) * s.cellWidth) / s.cellHeight),
    );
    if (height > 300) {
      width = Math.max(1, Math.round((width * 300) / height));
      height = 300;
    }
  }
  if (width * height > MAX_CELLS) height = Math.floor(MAX_CELLS / width);
  return { width, height };
}
export function densityCharacter(
  v: number,
  chars: string[],
  density: number,
  coverage?: number[],
) {
  const value = Math.pow(clamp(v) / 255, density);
  if (!coverage) return chars[Math.round(value * (chars.length - 1))];
  let best = 0;
  for (let i = 1; i < chars.length; i++)
    if (Math.abs(coverage[i] - value) < Math.abs(coverage[best] - value))
      best = i;
  return chars[best];
}
function abort(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException("Conversion cancelled", "AbortError");
}
const hex = (v: number) => Math.round(clamp(v)).toString(16).padStart(2, "0");
const color = (r: number, g: number, b: number) =>
  `#${hex(r)}${hex(g)}${hex(b)}`;
// Alpha-weighted area average avoids dark fringes around transparent source pixels.
function sample(im: Pixels, x: number, y: number, w: number, h: number) {
  const x0 = (x * im.width) / w,
    x1 = ((x + 1) * im.width) / w,
    y0 = (y * im.height) / h,
    y1 = ((y + 1) * im.height) / h;
  let r = 0,
    g = 0,
    b = 0,
    alpha = 0,
    area = 0;
  for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++)
    for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
      const weight =
        (Math.min(xx + 1, x1) - Math.max(xx, x0)) *
        (Math.min(yy + 1, y1) - Math.max(yy, y0));
      const i = (yy * im.width + xx) * 4,
        a = im.data[i + 3] / 255;
      r += im.data[i] * a * weight;
      g += im.data[i + 1] * a * weight;
      b += im.data[i + 2] * a * weight;
      alpha += a * weight;
      area += weight;
    }
  return [
    alpha ? r / alpha : 0,
    alpha ? g / alpha : 0,
    alpha ? b / alpha : 0,
    area ? alpha / area : 0,
  ];
}
export async function convert(
  im: Pixels,
  s: ConversionSettings,
  signal?: AbortSignal,
  yieldRow: () => Promise<void> = () => Promise.resolve(),
  calibration?: Calibration,
  numeric?: NumericEngine,
) {
  abort(signal);
  validateSettings(s);
  if (
    !Number.isInteger(im.width) ||
    !Number.isInteger(im.height) ||
    im.width < 1 ||
    im.height < 1 ||
    im.width > 2048 ||
    im.height > 2048 ||
    im.width * im.height > 4_194_304 ||
    !(im.data instanceof Uint8ClampedArray) ||
    im.data.length !== im.width * im.height * 4
  )
    throw new Error("Invalid or oversized pixel buffer");
  const chars = characterSet(s.charset, s.custom),
    { width, height } = gridDimensions(im.width, im.height, s);
  const braille = s.charset === "braille",
    sw = width * (braille ? 2 : 1),
    sh = height * (braille ? 4 : 1),
    n = sw * sh;
  const rgb = new Float32Array(n * 3),
    alphas = new Float32Array(n),
    values = new Float32Array(n);
  const samples = numeric?.sample(im, sw, sh);
  abort(signal);
  for (let y = 0; y < sh; y++) {
    abort(signal);
    for (let x = 0; x < sw; x++) {
      const i = y * sw + x,
        [r, g, b, a] = samples ? samples.subarray(i * 4, i * 4 + 4) : sample(im, x, y, sw, sh),
        gray = luminance(r, g, b);
      const rr = tone(gray + ((r - gray) * s.saturation) / 100, s),
        gg = tone(gray + ((g - gray) * s.saturation) / 100, s),
        bb = tone(gray + ((b - gray) * s.saturation) / 100, s);
      rgb.set([rr, gg, bb], i * 3);
      alphas[i] = a;
      const l = luminance(rr, gg, bb);
      values[i] = s.invert ? 255 - l : l;
    }
    if (y % 8 === 0) await yieldRow();
  }
  const filtered = values.slice();
  const gradients = numeric?.gradients(values, sw, sh);
  const directions = s.smartEdges && !braille ? new Array<string | undefined>(n) : undefined;
  abort(signal);
  const at = (x: number, y: number) =>
    values[
      Math.max(0, Math.min(sh - 1, y)) * sw + Math.max(0, Math.min(sw - 1, x))
    ];
  for (let y = 0; y < sh; y++) {
    abort(signal);
    for (let x = 0; x < sw; x++) {
      const i = y * sw + x,
        v = values[i];
      let blur = gradients?.[i * 3] ?? 0;
      if (!gradients) for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) blur += at(x + dx, y + dy) / 9;
      const gx = gradients?.[i * 3 + 1] ?? (
        -at(x - 1, y - 1) +
        at(x + 1, y - 1) -
        2 * at(x - 1, y) +
        2 * at(x + 1, y) -
        at(x - 1, y + 1) +
        at(x + 1, y + 1));
      const gy = gradients?.[i * 3 + 2] ?? (
        -at(x - 1, y - 1) -
        2 * at(x, y - 1) -
        at(x + 1, y - 1) +
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1));
      if (directions && Math.hypot(gx, gy) >= 100) {
        const angle = ((Math.atan2(gy, gx) * 180 / Math.PI) + 180) % 180;
        directions[i] = angle < 22.5 || angle >= 157.5 ? "|" : angle < 67.5 ? "/" : angle < 112.5 ? "-" : "\\";
      }
      const sharp = clamp(v + ((v - blur) * s.sharpness) / 25);
      filtered[i] =
        255 *
        Math.pow(
          clamp(
            sharp * (1 - s.edge / 100) +
              (clamp(Math.hypot(gx, gy)) * s.edge) / 100,
          ) / 255,
          s.density,
        );
    }
    if (y % 8 === 0) await yieldRow();
  }
  const mapped: string[] = Array(n);
  const ramp = calibration?.chars ?? chars,
    cov = calibration?.coverage;
  for (let y = 0; y < sh; y++) {
    abort(signal);
    for (let x = 0; x < sw; x++) {
      const i = y * sw + x;
      if (alphas[i] === 0) {
        mapped[i] = " ";
        continue;
      }
      const value = clamp(filtered[i]);
      const char = braille
        ? value >= 127.5
          ? "1"
          : "0"
        : densityCharacter(value, ramp, 1, cov);
      mapped[i] = directions?.[i] ?? char;
      if (s.dithering) {
        const index = ramp.indexOf(char);
        const quant = braille
          ? char === "1"
            ? 255
            : 0
          : 255 * (cov ? cov[index] : index / (ramp.length - 1));
        const error = value - quant;
        for (const [dx, dy, weight] of [
          [1, 0, 7 / 16],
          [-1, 1, 3 / 16],
          [0, 1, 5 / 16],
          [1, 1, 1 / 16],
        ]) {
          if (x + dx >= 0 && x + dx < sw && y + dy < sh)
            filtered[(y + dy) * sw + x + dx] += error * weight;
        }
      }
    }
    if (y % 8 === 0) await yieldRow();
  }
  const doc = createDocument(width, height, "Converted image");
  doc.cellWidth = s.cellWidth;
  doc.cellHeight = s.cellHeight;
  const bits = [
    [0, 3],
    [1, 4],
    [2, 5],
    [6, 7],
  ];
  const cells: Cell[] = [];
  for (let y = 0; y < height; y++) {
    abort(signal);
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        mask = 0;
      for (let dy = 0; dy < (braille ? 4 : 1); dy++)
        for (let dx = 0; dx < (braille ? 2 : 1); dx++) {
          const i =
              (y * (braille ? 4 : 1) + dy) * sw + x * (braille ? 2 : 1) + dx,
            alpha = alphas[i];
          a += alpha;
          r += rgb[i * 3] * alpha;
          g += rgb[i * 3 + 1] * alpha;
          b += rgb[i * 3 + 2] * alpha;
          if (braille && mapped[i] === "1") mask |= 1 << bits[dy][dx];
        }
      if (a) {
        r /= a;
        g /= a;
        b /= a;
      }
      const gray = luminance(r, g, b);
      const fg =
        s.mode === "monochrome"
          ? s.fg
          : s.mode === "grayscale"
            ? color(gray, gray, gray)
            : color(r, g, b);
      cells.push({
        char: a
          ? braille
            ? String.fromCodePoint(0x2800 + mask)
            : mapped[y * sw + x]
          : " ",
        fg,
        bg: a ? s.bg : null,
        alpha: a / (braille ? 8 : 1),
      });
    }
    if (y % 8 === 0) await yieldRow();
  }
  abort(signal);
  doc.layers[0].cells = cells;
  return doc;
}
