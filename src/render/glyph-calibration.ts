import { graphemes } from "@/core/document";
import { validateGlyphCalibration, type GlyphCalibrationV1 } from "./character-contract";

export interface GlyphCalibrationInput {
  fontFamily: string;
  fontSize: number;
  cellWidth: number;
  cellHeight: number;
  ramp: string;
  fontRevision: string;
}
const cache = new Map<string, GlyphCalibrationV1>();
interface Pending { promise: Promise<GlyphCalibrationV1>; users: number }
const pending = new Map<string, Pending>();
let generation = 0;
let nextId = 0;
export function clearGlyphCalibrationCache(): void {
  generation++;
  cache.clear();
  pending.clear();
}
function copy(c: GlyphCalibrationV1): GlyphCalibrationV1 {
  return { ...c, glyphs: [...c.glyphs], masks: c.masks.slice(), coverage: c.coverage.slice(), shapes: c.shapes.slice() };
}
function abort(): DOMException { return new DOMException("Glyph calibration aborted", "AbortError"); }
function validate(input: GlyphCalibrationInput): string[] {
  if (typeof input.fontFamily !== "string" || !input.fontFamily.trim() || input.fontFamily.length > 512 || /[;{}\n\r]/u.test(input.fontFamily) || typeof input.fontRevision !== "string" || input.fontRevision.length > 512) throw new Error("Invalid font identity");
  for (const [value, min, max] of [[input.fontSize, 1, 512], [input.cellWidth, 7, 16], [input.cellHeight, 14, 28]]) {
    if (!Number.isFinite(value) || value < min || value > max) throw new Error("Invalid font geometry");
  }
  if (typeof input.ramp !== "string" || input.ramp.length > 512) throw new Error("Invalid ramp");
  const glyphs = [...new Set(graphemes(input.ramp))];
  if (glyphs.length < 2 || glyphs.length > 256 || glyphs.some(g => g.length > 64 || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(g) || /^\p{M}/u.test(g) || /^\p{Cf}+$/u.test(g))) throw new Error("Invalid ramp graphemes");
  return glyphs;
}
/** Accept one exact CSS family, never a fallback list or escaped CSS expression. */
function fontFamilyIdentity(value: string): { name: string; generic: boolean } {
  const family = value.trim();
  const quoted = family.startsWith('"') || family.startsWith("'");
  let name = family;
  if (quoted) {
    if (family.length < 3 || family.at(-1) !== family[0]) throw new Error("Invalid font family");
    name = family.slice(1, -1);
    if (/[\\"']/u.test(name)) throw new Error("Invalid font family");
  } else if (!/^[\p{L}\p{N}_-]+(?:\s+[\p{L}\p{N}_-]+)*$/u.test(family)) {
    throw new Error("Expected one exact font family; fallback lists are unsupported");
  }
  if (!name.trim()) throw new Error("Invalid font family");
  return { name: name.toLowerCase(), generic: !quoted && ["monospace", "serif", "sans-serif", "system-ui"].includes(name.toLowerCase()) };
}
function loadedFamilyMatches(face: FontFace, name: string): boolean {
  if (face.status !== "loaded") return false;
  try { return fontFamilyIdentity(face.family).name === name; } catch { return false; }
}
async function measure(input: GlyphCalibrationInput, glyphs: string[], fontKey: string): Promise<GlyphCalibrationV1> {
  if (typeof document === "undefined" || !document.fonts?.load || !document.fonts.check) throw new Error("Browser font loading unavailable");
  const font = `${input.fontSize}px ${input.fontFamily}`;
  const family = fontFamilyIdentity(input.fontFamily);
  const loaded = await document.fonts.load(font, glyphs.join(""));
  // FontFaceSet.check alone reports true for unknown names using fallback fonts.
  const registered: FontFace[] = typeof document.fonts[Symbol.iterator] === "function" ? [...document.fonts] : [];
  if (!family.generic && ![...loaded, ...registered].some(face => loadedFamilyMatches(face, family.name))) {
    throw new Error("Named font must match a registered loaded FontFace; use a generic family or register a self-hosted font");
  }
  if (!document.fonts.check(font, glyphs.join(""))) throw new Error("Requested font unavailable");
  const canvas = document.createElement("canvas");
  const width = Math.ceil(input.cellWidth), height = Math.ceil(input.cellHeight);
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas glyph rasterization unavailable");
  ctx.font = font; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff";
  const measured = glyphs.map((glyph, order) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillText(glyph, input.cellWidth / 2, input.cellHeight / 2);
    const data = ctx.getImageData(0, 0, width, height).data;
    if (data.length !== width * height * 4) throw new Error("Invalid canvas alpha mask");
    const mask = new Uint8Array(width * height), shape = new Float32Array(9), counts = new Uint32Array(9);
    let sum = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x, alpha = data[i * 4 + 3];
      mask[i] = alpha; sum += alpha;
      const bin = Math.min(2, Math.floor(y * 3 / height)) * 3 + Math.min(2, Math.floor(x * 3 / width));
      shape[bin] += alpha; counts[bin]++;
    }
    for (let i = 0; i < 9; i++) shape[i] = counts[i] ? shape[i] / (counts[i] * 255) : 0;
    return { glyph, order, mask, shape, coverage: sum / (width * height * 255) };
  }).sort((a, b) => a.coverage - b.coverage || a.order - b.order);
  const max = measured.at(-1)!.coverage;
  const masks = new Uint8Array(width * height * glyphs.length), shapes = new Float32Array(glyphs.length * 9);
  measured.forEach((g, i) => { masks.set(g.mask, i * width * height); shapes.set(g.shape, i * 9); });
  return validateGlyphCalibration({ version: 1, id: `glyph-v1-${++nextId}`, fontKey, cellWidth: input.cellWidth, cellHeight: input.cellHeight, glyphs: measured.map(g => g.glyph), maskWidth: width, maskHeight: height, masks, coverage: Float32Array.from(measured, g => max ? g.coverage / max : 0), shapes });
}
/**
 * Browser-owned measurements; callers receive independent snapshots of cached data.
 * Accepts one family: monospace, serif, sans-serif and system-ui are intentional
 * system generics. Named families must match a loaded registered FontFace after
 * fonts.load resolves. Named OS fonts cannot be verified portably: use a generic
 * or register a self-hosted face. Unicode fallback within that primary is allowed.
 */
export async function calibrateGlyphs(input: GlyphCalibrationInput, signal?: AbortSignal): Promise<GlyphCalibrationV1> {
  const snapshot = { ...input }, glyphs = validate(snapshot);
  if (signal?.aborted) throw abort();
  const fontKey = JSON.stringify([snapshot.fontFamily, snapshot.fontSize, snapshot.fontRevision]);
  const key = JSON.stringify([fontKey, snapshot.cellWidth, snapshot.cellHeight, snapshot.ramp, glyphs]);
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return copy(hit); }
  let entry = pending.get(key);
  if (!entry) {
    if (pending.size >= 16) throw new Error("Glyph calibration queue is full");
    const epoch = generation;
    entry = { users: 0, promise: Promise.resolve().then(() => measure(snapshot, glyphs, fontKey)) };
    const current = entry;
    entry.promise = entry.promise.then(c => {
      if (epoch === generation && current.users > 0) {
        cache.set(key, c);
        if (cache.size > 16) cache.delete(cache.keys().next().value!);
      }
      return c;
    }).finally(() => { if (pending.get(key) === current) pending.delete(key); });
    pending.set(key, entry);
  }
  entry.users++;
  const current = entry;
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = () => { done = true; current.users--; signal?.removeEventListener("abort", onAbort); };
    const onAbort = () => { if (!done) { finish(); reject(abort()); } };
    signal?.addEventListener("abort", onAbort, { once: true });
    current.promise.then(c => { if (!done) { finish(); resolve(copy(c)); } }, error => { if (!done) { finish(); reject(error); } });
  });
}
