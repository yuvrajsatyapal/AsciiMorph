import { graphemes } from "@/core/document";
import {
  MIN_CHARACTER_CELL_DIMENSION,
  MAX_CHARACTER_CELL_DIMENSION,
  validateGlyphCalibration,
  type GlyphCalibrationV1,
} from "./character-contract";

import {
  createCalibrationBudget,
  CalibrationBudgetError,
  DEFAULT_CALIBRATION_LIMITS,
  estimateGlyphCalibration,
  estimateReferenceMetrics,
  type CalibrationLimits,
  type CalibrationReservation,
  type CalibrationEstimate,
} from "./glyph-calibration-budget";

import {
  validateReferenceCharacterAtlas,
  type ReferenceCharacterAtlasV1,
} from "./reference-characters";

export interface GlyphCalibrationInput {
  fontFamily: string;
  fontSize: number;
  cellWidth: number;
  cellHeight: number;
  ramp: string;
  fontRevision: string;
}
export interface ReferenceCharacterCalibrationInput
  extends GlyphCalibrationInput {
  fontPolicy: ReferenceCharacterAtlasV1["fontPolicy"];
}
export const REFERENCE_MONOSPACE_STACK = '"Courier New", Courier, monospace';
/** Closed identity produced by the version-1 measured reference calibrator.
 * This reads rasterization identity; it does not attest installed system fonts.
 */
export interface ReferenceCalibrationIdentityV1 {
  version: 1;
  fontPolicy: ReferenceCharacterAtlasV1["fontPolicy"];
  fontFamily: string;
  fontPixelSize: number;
  fontRevision: string;
}
export function readReferenceCalibrationIdentity(
  atlas: ReferenceCharacterAtlasV1,
): ReferenceCalibrationIdentityV1 {
  const a = validateReferenceCharacterAtlas(atlas);
  const invalid = (): never => {
    throw new Error("Invalid measured reference font identity");
  };
  let outer: unknown, inner: unknown;
  try {
    outer = JSON.parse(a.calibration.fontKey);
    inner =
      Array.isArray(outer) && typeof outer[0] === "string"
        ? JSON.parse(outer[0])
        : null;
  } catch {
    return invalid();
  }
  if (
    !Array.isArray(outer) ||
    outer.length !== 5 ||
    outer[1] !== a.calibration.maskWidth ||
    outer[2] !== a.calibration.maskHeight ||
    outer[3] !== a.originX ||
    outer[4] !== a.originY ||
    !Array.isArray(inner) ||
    inner.length !== 8 ||
    inner[0] !== "reference-characters-v1" ||
    inner[1] !== "input" ||
    inner[2] !== "top-start-ltr" ||
    inner[3] !== a.fontPolicy ||
    inner[4] !==
      (a.fontPolicy === "reference-system-monospace"
        ? "intentional-system-fallback"
        : "exact-family") ||
    typeof inner[5] !== "string" ||
    !inner[5].trim() ||
    inner[5].length > 512 ||
    /[;{}\n\r]/u.test(inner[5]) ||
    typeof inner[6] !== "number" ||
    !Number.isFinite(inner[6]) ||
    inner[6] < 1 ||
    inner[6] > 512 ||
    typeof inner[7] !== "string" ||
    inner[7].length > 512
  )
    return invalid();
  if (a.fontPolicy === "reference-system-monospace") {
    if (inner[5] !== REFERENCE_MONOSPACE_STACK) return invalid();
  } else fontFamilyIdentity(inner[5]);
  return {
    version: 1,
    fontPolicy: a.fontPolicy,
    fontFamily: inner[5],
    fontPixelSize: inner[6],
    fontRevision: inner[7],
  };
}
type CalibrationValue = GlyphCalibrationV1 | ReferenceCharacterAtlasV1;
function isAtlas(c: CalibrationValue): c is ReferenceCharacterAtlasV1 {
  return "calibration" in c;
}
function snapshotValue(c: CalibrationValue): CalibrationValue {
  return isAtlas(c) ? { ...c, calibration: copy(c.calibration) } : copy(c);
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
async function loadFont(
  input: GlyphCalibrationInput,
  glyphs: string[],
  live: () => boolean,
  controlled = false,
): Promise<void> {
  if (
    typeof document === "undefined" ||
    !document.fonts?.load ||
    !document.fonts.check
  )
    throw new Error("Browser font loading unavailable");
  const font = `${input.fontSize}px ${input.fontFamily}`;
  const family = controlled
    ? { name: "", generic: true }
    : fontFamilyIdentity(input.fontFamily);
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
}
async function rasterize(
  input: GlyphCalibrationInput,
  glyphs: string[],
  fontKey: string,
  live: () => boolean,
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  reference?: { originX: number; originY: number },
): Promise<GlyphCalibrationV1> {
  const font = `${input.fontSize}px ${input.fontFamily}`;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas glyph rasterization unavailable");
  ctx.font = font;
  ctx.textAlign = reference ? "start" : "center";
  ctx.textBaseline = reference ? "top" : "middle";
  if (reference) ctx.direction = "ltr";
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
    ctx.fillText(
      glyph,
      reference ? -reference.originX : input.cellWidth / 2,
      reference ? -reference.originY : input.cellHeight / 2,
    );
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
  if (!reference)
    measured.sort((a, b) => a.coverage - b.coverage || a.order - b.order);
  const max = Math.max(...measured.map((g) => g.coverage));
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
    coverage: Float32Array.from(measured, (g) => (max ? g.coverage / max : 0)),
    shapes,
  });
}
async function measure(
  input: GlyphCalibrationInput,
  glyphs: string[],
  fontKey: string,
  live: () => boolean,
): Promise<GlyphCalibrationV1> {
  await loadFont(input, glyphs, live);
  const canvas = document.createElement("canvas");
  const width = Math.ceil(input.cellWidth),
    height = Math.ceil(input.cellHeight);
  canvas.width = width;
  canvas.height = height;
  try {
    return await rasterize(input, glyphs, fontKey, live, canvas, width, height);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
/** Metrics only precede measured admission. Native font/measureText allocations are
 * browser owned and excluded; the 16x16 surface is bounded and reused for raster.
 */
async function measureReference(
  input: ReferenceCharacterCalibrationInput,
  glyphs: string[],
  fontKey: string,
  live: () => boolean,
  admit: (e: CalibrationEstimate) => void,
): Promise<ReferenceCharacterAtlasV1> {
  await loadFont(
    input,
    glyphs,
    live,
    input.fontPolicy === "reference-system-monospace",
  );
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas glyph rasterization unavailable");
    ctx.font = `${input.fontSize}px ${input.fontFamily}`;
    ctx.textAlign = "start";
    ctx.textBaseline = "top";
    ctx.direction = "ltr";
    let left = 0,
      top = 0,
      right = input.cellWidth,
      bottom = input.cellHeight;
    for (const glyph of glyphs) {
      const m = ctx.measureText(glyph);
      const bounds = [
        m.actualBoundingBoxLeft,
        m.actualBoundingBoxRight,
        m.actualBoundingBoxAscent,
        m.actualBoundingBoxDescent,
      ];
      if (!bounds.every(Number.isFinite))
        throw new Error("Invalid glyph metrics");
      left = Math.min(left, -bounds[0]);
      right = Math.max(right, bounds[1]);
      top = Math.min(top, -bounds[2]);
      bottom = Math.max(bottom, bounds[3]);
    }
    const width = Math.ceil(right - left),
      height = Math.ceil(bottom - top);
    // Same retained dimensions/origin envelope as the accepted atlas contract.
    if (
      width > 16384 ||
      height > 16384 ||
      !Number.isFinite(left) ||
      !Number.isFinite(top) ||
      Math.abs(left) > width ||
      Math.abs(top) > height
    )
      throw new Error("Invalid glyph metric extent/origin");
    const estimate = estimateGlyphCalibration(width, height, glyphs.length);
    // The profile cap is fixed even when a factory uses larger legacy test limits.
    if (estimate.retainedBytes > DEFAULT_CALIBRATION_LIMITS.retainedBytes)
      throw new CalibrationBudgetError(
        "Reference atlas retained-result budget exceeded",
      );
    if (!live()) throw abort();
    admit(estimate); // Atomically revise J and all current D before full allocation.
    canvas.width = width;
    canvas.height = height;
    const geometry = { originX: left, originY: top };
    const actualKey = JSON.stringify([fontKey, width, height, left, top]);
    const calibration = await rasterize(
      input,
      glyphs,
      actualKey,
      live,
      canvas,
      width,
      height,
      geometry,
    );
    const space = glyphs.indexOf(" ");
    return validateReferenceCharacterAtlas({
      version: 1,
      calibration,
      ...geometry,
      ...(input.fontPolicy === "reference-system-monospace" &&
      Number.isInteger(left) &&
      Number.isInteger(top) &&
      left >= -2 &&
      top >= -2 &&
      left + width + 2 <= Math.ceil(1.1 * input.fontSize) + 4 &&
      top + height + 2 <= Math.ceil(1.3 * input.fontSize) + 4 &&
      glyphs.length <=
        Math.floor(2048 / (Math.ceil(1.1 * input.fontSize) + 4)) *
          Math.floor(2048 / (Math.ceil(1.3 * input.fontSize) + 4))
        ? { softwareWebglBatch: true as const }
        : {}),
      placement: "top-start-ltr",
      ordering: "input",
      fontPolicy: input.fontPolicy,
      spaceIndexOr65535: space < 0 ? 65535 : space,
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
    value: CalibrationValue;
    estimate: CalibrationEstimate;
    token: CalibrationReservation;
  }
  interface Subscriber {
    token: CalibrationReservation;
    deliver: (value?: CalibrationValue, error?: unknown) => void;
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
  async function calibrate(
    input: GlyphCalibrationInput | ReferenceCharacterCalibrationInput,
    signal?: AbortSignal,
    reference = false,
  ): Promise<CalibrationValue> {
    const snapshot = { ...input },
      glyphs = validate(snapshot);
    const policy = "fontPolicy" in snapshot ? snapshot.fontPolicy : undefined;
    if (reference) {
      if (
        policy !== "verified-family" &&
        policy !== "reference-system-monospace"
      )
        throw new Error("Invalid reference font policy");
      if (graphemes(snapshot.ramp).length !== glyphs.length)
        throw new Error("Duplicate reference ramp graphemes");
      if (policy === "reference-system-monospace") {
        if (snapshot.fontFamily !== REFERENCE_MONOSPACE_STACK)
          throw new Error("Expected exact controlled reference font stack");
      } else fontFamilyIdentity(snapshot.fontFamily);
    } else fontFamilyIdentity(snapshot.fontFamily);
    if (signal?.aborted) throw abort();
    const estimate = reference
      ? estimateReferenceMetrics()
      : estimateGlyphCalibration(
          Math.ceil(snapshot.cellWidth),
          Math.ceil(snapshot.cellHeight),
          glyphs.length,
        );
    const fontKey = JSON.stringify([
      ...(reference
        ? [
            "reference-characters-v1",
            "input",
            "top-start-ltr",
            policy,
            policy === "reference-system-monospace"
              ? "intentional-system-fallback"
              : "exact-family",
          ]
        : []),
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
        delivery = budget.reserveDelivery(hit.estimate);
        return snapshotValue(hit.value);
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
    } else delivery = budget.reserveDelivery(job.estimate);
    const current = job;
    const result = new Promise<CalibrationValue>((resolve, reject) => {
      let done = false;
      const subscriber: Subscriber = {
        token: delivery,
        deliver(value, error) {
          if (done) return;
          done = true;
          signal?.removeEventListener("abort", onAbort);
          current.users.delete(subscriber);
          try {
            if (error !== undefined) reject(error);
            else resolve(snapshotValue(value!));
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
          const live = () => !current.abandoned && current.users.size > 0;
          const value = reference
            ? await measureReference(
                snapshot as ReferenceCharacterCalibrationInput,
                glyphs,
                fontKey,
                live,
                (actual) => {
                  budget.reviseJob(
                    current.token,
                    [...current.users].map((u) => u.token),
                    actual,
                  );
                  current.estimate = actual;
                },
              )
            : await measure(snapshot, glyphs, fontKey, live);
          if (
            current.epoch === generation &&
            current.users.size > 0 &&
            !current.abandoned
          ) {
            cached = budget.cache(current.token, current.estimate, () => {
              cache.delete(key);
            });
            if (cached)
              cache.set(key, {
                value,
                estimate: current.estimate,
                token: current.token,
              });
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
  function calibrateGlyphs(
    input: GlyphCalibrationInput,
    signal?: AbortSignal,
  ): Promise<GlyphCalibrationV1> {
    return calibrate(input, signal) as Promise<GlyphCalibrationV1>;
  }
  function calibrateReferenceCharacters(
    input: ReferenceCharacterCalibrationInput,
    signal?: AbortSignal,
  ): Promise<ReferenceCharacterAtlasV1> {
    return calibrate(input, signal, true) as Promise<ReferenceCharacterAtlasV1>;
  }
  return {
    calibrateGlyphs,
    calibrateReferenceCharacters,
    clearGlyphCalibrationCache,
    get usage() {
      return budget.usage;
    },
    limits: budget.limits,
  };
}
const defaultCalibrator = createGlyphCalibrator();
export const calibrateGlyphs = defaultCalibrator.calibrateGlyphs;
export const calibrateReferenceCharacters =
  defaultCalibrator.calibrateReferenceCharacters;
export const clearGlyphCalibrationCache =
  defaultCalibrator.clearGlyphCalibrationCache;
