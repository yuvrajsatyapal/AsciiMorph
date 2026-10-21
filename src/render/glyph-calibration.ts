import { graphemes } from "@/core/document";
import {
  MIN_CHARACTER_CELL_DIMENSION,
  MAX_CHARACTER_CELL_DIMENSION,
  validateGlyphCalibration,
  type GlyphCalibrationV1,
} from "./character-contract";

import {
  createCalibrationBudget,
  estimateGlyphCalibration,
  type CalibrationLimits,
  type CalibrationReservation,
  type CalibrationEstimate,
} from "./glyph-calibration-budget";

export interface GlyphCalibrationInput {
  fontFamily: string;
  fontSize: number;
  cellWidth: number;
  cellHeight: number;
  ramp: string;
  fontRevision: string;
}
let nextId = 0;
function copy(c: GlyphCalibrationV1): GlyphCalibrationV1 {
  return {
    ...c,
    glyphs: [...c.glyphs],
    masks: c.masks.slice(),
    coverage: c.coverage.slice(),
    shapes: c.shapes.slice(),
  };
}
function abort(): DOMException {
  return new DOMException("Glyph calibration aborted", "AbortError");
}
function validate(input: GlyphCalibrationInput): string[] {
  if (
    typeof input.fontFamily !== "string" ||
    !input.fontFamily.trim() ||
    input.fontFamily.length > 512 ||
    /[;{}\n\r]/u.test(input.fontFamily) ||
    typeof input.fontRevision !== "string" ||
    input.fontRevision.length > 512
  )
    throw new Error("Invalid font identity");
  for (const [value, min, max] of [
    [input.fontSize, 1, 512],
    [
      input.cellWidth,
      MIN_CHARACTER_CELL_DIMENSION,
      MAX_CHARACTER_CELL_DIMENSION,
    ],
    [
      input.cellHeight,
      MIN_CHARACTER_CELL_DIMENSION,
      MAX_CHARACTER_CELL_DIMENSION,
    ],
  ]) {
    if (!Number.isFinite(value) || value < min || value > max)
      throw new Error("Invalid font geometry");
  }
  if (typeof input.ramp !== "string" || input.ramp.length > 512)
    throw new Error("Invalid ramp");
  const glyphs = [...new Set(graphemes(input.ramp))];
  if (
    glyphs.length < 2 ||
    glyphs.length > 256 ||
    glyphs.some(
      (g) =>
        g.length > 64 ||
        /[\p{Cc}\p{Zl}\p{Zp}]/u.test(g) ||
        /^\p{M}/u.test(g) ||
        /^\p{Cf}+$/u.test(g),
    )
  )
    throw new Error("Invalid ramp graphemes");
  return glyphs;
}
/** Accept one exact CSS family, never a fallback list or escaped CSS expression. */
function fontFamilyIdentity(value: string): { name: string; generic: boolean } {
  const family = value.trim();
  const quoted = family.startsWith('"') || family.startsWith("'");
  let name = family;
  if (quoted) {
    if (family.length < 3 || family.at(-1) !== family[0])
      throw new Error("Invalid font family");
    name = family.slice(1, -1);
    if (/[\\"']/u.test(name)) throw new Error("Invalid font family");
  } else if (!/^[\p{L}\p{N}_-]+(?:\s+[\p{L}\p{N}_-]+)*$/u.test(family)) {
    throw new Error(
      "Expected one exact font family; fallback lists are unsupported",
    );
  }
  if (!name.trim()) throw new Error("Invalid font family");
  return {
    name: name.toLowerCase(),
    generic:
      !quoted &&
      ["monospace", "serif", "sans-serif", "system-ui"].includes(
        name.toLowerCase(),
      ),
  };
}
function loadedFamilyMatches(face: FontFace, name: string): boolean {
  if (face.status !== "loaded") return false;
  try {
    return fontFamilyIdentity(face.family).name === name;
  } catch {
    return false;
  }
}
async function measure(
  input: GlyphCalibrationInput,
  glyphs: string[],
  fontKey: string,
  live: () => boolean,
): Promise<GlyphCalibrationV1> {
  if (
    typeof document === "undefined" ||
    !document.fonts?.load ||
    !document.fonts.check
  )
    throw new Error("Browser font loading unavailable");
  const font = `${input.fontSize}px ${input.fontFamily}`;
  const family = fontFamilyIdentity(input.fontFamily);
  const loaded = await document.fonts.load(font, glyphs.join(""));
  if (!live()) throw abort();
  // FontFaceSet.check alone reports true for unknown names using fallback fonts.
  const registered: FontFace[] =
    typeof document.fonts[Symbol.iterator] === "function"
      ? [...document.fonts]
      : [];
  if (
    !family.generic &&
    ![...loaded, ...registered].some((face) =>
      loadedFamilyMatches(face, family.name),
    )
  ) {
    throw new Error(
      "Named font must match a registered loaded FontFace; use a generic family or register a self-hosted font",
    );
  }
  if (!document.fonts.check(font, glyphs.join("")))
    throw new Error("Requested font unavailable");
  const canvas = document.createElement("canvas");
  const width = Math.ceil(input.cellWidth),
    height = Math.ceil(input.cellHeight);
  canvas.width = width;
  canvas.height = height;
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas glyph rasterization unavailable");
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    const measured: {
      glyph: string;
      order: number;
      mask: Uint8Array;
      shape: Float32Array;
      coverage: number;
    }[] = [];
    const counts = new Uint32Array(9);
    for (let order = 0; order < glyphs.length; order++) {
      if (order && order % 8 === 0)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (!live()) throw abort();
      const glyph = glyphs[order];
      counts.fill(0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillText(glyph, input.cellWidth / 2, input.cellHeight / 2);
      const data = ctx.getImageData(0, 0, width, height).data;
      if (data.length !== width * height * 4)
        throw new Error("Invalid canvas alpha mask");
      const mask = new Uint8Array(width * height),
        shape = new Float32Array(9);
      let sum = 0;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const i = y * width + x,
            alpha = data[i * 4 + 3];
          mask[i] = alpha;
          sum += alpha;
          const bin =
            Math.min(2, Math.floor((y * 3) / height)) * 3 +
            Math.min(2, Math.floor((x * 3) / width));
          shape[bin] += alpha;
          counts[bin]++;
        }
      for (let i = 0; i < 9; i++)
        shape[i] = counts[i] ? shape[i] / (counts[i] * 255) : 0;
      measured.push({
        glyph,
        order,
        mask,
        shape,
        coverage: sum / (width * height * 255),
      });
    }
    measured.sort((a, b) => a.coverage - b.coverage || a.order - b.order);
    const max = measured.at(-1)!.coverage;
    const masks = new Uint8Array(width * height * glyphs.length),
      shapes = new Float32Array(glyphs.length * 9);
    measured.forEach((g, i) => {
      masks.set(g.mask, i * width * height);
      shapes.set(g.shape, i * 9);
    });
    return validateGlyphCalibration({
      version: 1,
      id: `glyph-v1-${++nextId}`,
      fontKey,
      cellWidth: input.cellWidth,
      cellHeight: input.cellHeight,
      glyphs: measured.map((g) => g.glyph),
      maskWidth: width,
      maskHeight: height,
      masks,
      coverage: Float32Array.from(measured, (g) =>
        max ? g.coverage / max : 0,
      ),
      shapes,
    });
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
/**
 * Browser-owned measurements; callers receive independent snapshots of cached data.
 * Accepts one family: monospace, serif, sans-serif and system-ui are intentional
 * system generics. Named families must match a loaded registered FontFace after
 * fonts.load resolves. Named OS fonts cannot be verified portably: use a generic
 * or register a self-hosted face. Unicode fallback within that primary is allowed.
 */
export function createGlyphCalibrator(limits: Partial<CalibrationLimits> = {}) {
  const budget = createCalibrationBudget(limits);
  interface CacheEntry {
    value: GlyphCalibrationV1;
    token: CalibrationReservation;
  }
  interface Subscriber {
    deliver: (value?: GlyphCalibrationV1, error?: unknown) => void;
  }
  interface Job {
    token: CalibrationReservation;
    estimate: CalibrationEstimate;
    users: Set<Subscriber>;
    epoch: number;
    abandoned: boolean;
  }
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, Job>();
  let generation = 0;
  function clearGlyphCalibrationCache() {
    generation++;
    budget.clearCache();
    pending.clear();
  }
  async function calibrateGlyphs(
    input: GlyphCalibrationInput,
    signal?: AbortSignal,
  ): Promise<GlyphCalibrationV1> {
    const snapshot = { ...input },
      glyphs = validate(snapshot);
    fontFamilyIdentity(snapshot.fontFamily);
    if (signal?.aborted) throw abort();
    const estimate = estimateGlyphCalibration(
      Math.ceil(snapshot.cellWidth),
      Math.ceil(snapshot.cellHeight),
      glyphs.length,
    );
    const fontKey = JSON.stringify([
      snapshot.fontFamily,
      snapshot.fontSize,
      snapshot.fontRevision,
    ]);
    const key = JSON.stringify([
      fontKey,
      snapshot.cellWidth,
      snapshot.cellHeight,
      snapshot.ramp,
      glyphs,
    ]);
    const hit = cache.get(key);
    if (hit) {
      const unpin = budget.pin(hit.token);
      let delivery: CalibrationReservation | undefined;
      try {
        delivery = budget.reserveDelivery(estimate);
        return copy(hit.value);
      } finally {
        if (delivery) budget.release(delivery);
        unpin();
      }
    }
    let job = pending.get(key),
      delivery: CalibrationReservation;
    let start = false;
    if (!job) {
      const [token, d] = budget.reserveJob(estimate);
      delivery = d;
      job = {
        token,
        estimate,
        users: new Set(),
        epoch: generation,
        abandoned: false,
      };
      pending.set(key, job);
      start = true;
    } else delivery = budget.reserveDelivery(estimate);
    const current = job;
    const result = new Promise<GlyphCalibrationV1>((resolve, reject) => {
      let done = false;
      const subscriber: Subscriber = {
        deliver(value, error) {
          if (done) return;
          done = true;
          signal?.removeEventListener("abort", onAbort);
          current.users.delete(subscriber);
          try {
            if (error !== undefined) reject(error);
            else resolve(copy(value!));
          } catch (error) {
            reject(error);
          } finally {
            budget.release(delivery);
          }
        },
      };
      const onAbort = () => {
        subscriber.deliver(undefined, abort());
        if (!current.users.size) {
          current.abandoned = true;
          if (pending.get(key) === current) pending.delete(key);
        }
      };
      current.users.add(subscriber);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
    if (start) {
      // Reservations and the pending token exist synchronously before any font API.
      void Promise.resolve().then(async () => {
        let cached = false;
        try {
          const value = await measure(
            snapshot,
            glyphs,
            fontKey,
            () => !current.abandoned && current.users.size > 0,
          );
          if (
            current.epoch === generation &&
            current.users.size > 0 &&
            !current.abandoned
          ) {
            cached = budget.cache(current.token, current.estimate, () => {
              cache.delete(key);
            });
            if (cached) cache.set(key, { value, token: current.token });
          }
          for (const subscriber of [...current.users])
            subscriber.deliver(value);
        } catch (error) {
          for (const subscriber of [...current.users])
            subscriber.deliver(undefined, error);
        } finally {
          if (pending.get(key) === current) pending.delete(key);
          if (!cached) budget.release(current.token);
        }
      });
    }
    return result;
  }
  return {
    calibrateGlyphs,
    clearGlyphCalibrationCache,
    get usage() {
      return budget.usage;
    },
    limits: budget.limits,
  };
}
const defaultCalibrator = createGlyphCalibrator();
export const calibrateGlyphs = defaultCalibrator.calibrateGlyphs;
export const clearGlyphCalibrationCache =
  defaultCalibrator.clearGlyphCalibrationCache;
