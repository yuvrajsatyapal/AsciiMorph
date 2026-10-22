import {
  DEFAULT_MEMORY_BUDGET_BYTES,
  validateCharacterSettings,
  validateGlyphCalibration,
  validateGrid,
  validateSource,
  type CharacterSettingsV1,
  type GlyphCalibrationV1,
  type PackedGlyphGrid,
  type SourceUpload,
  type SourceRef,
} from "./character-contract";

import {
  encodeCharactersSettings,
  decodeCharactersFrame,
} from "./characters-wire";
import {
  validateReferenceCharacterAtlas,
  validateReferenceCharactersSettings,
  type ReferenceCharacterAtlasV1,
  type ReferenceCharactersSettingsV1,
  type ReferenceCharactersFrameV1,
} from "./reference-characters";

import {
  RenderError,
  atlasIdentityKey,
  type RenderErrorCode,
} from "./protocol";

export class CharacterEngineError extends RenderError {
  constructor(code: RenderErrorCode, message: string) {
    super(code, message, code !== "Disposed");
    this.name = "CharacterEngineError";
  }
}
function validateInput<T>(input: unknown, validator: (value: unknown) => T): T {
  if (
    input &&
    typeof input === "object" &&
    "version" in input &&
    input.version !== 1
  )
    throw new CharacterEngineError(
      "UnsupportedVersion",
      "Unsupported character version",
    );
  try {
    return validator(input);
  } catch (error) {
    if (error instanceof CharacterEngineError) throw error;
    throw new CharacterEngineError(
      "InvalidInput",
      error instanceof Error ? error.message : "Invalid character input",
    );
  }
}

/** ABI v1, all fields little endian. Upload: 8 u32 [version,kind,width,height,
 * count,maskWidth,maskHeight,flags], then RGBA (kind1) or masks, 4-byte padding,
 * count f32 coverage, count*9 f32 shapes (kind2). Calibration flags bit0 adds
 * four u32 direction indices in |,/,-,\\ order. No other flags are defined.
 * Settings: 8 u32 [version,width,height,rotation,flags,mode,mapping,seed], then
 * 16 f64 [cellWidth,cellHeight,cropX,cropY,cropW,cropH,brightness,contrast,gamma,
 * saturation,density,sharpness,edge,fg,bgOrMinus1,dither]. Flags 0..3 represent
 * shapeAware,smartEdges,mappingInvert,outputInvert. Modes mono=0,gray=1,color=2;
 * mapping glyph=0,braille=1; dither none=0,FS=1.
 * One live staging span and two retained jobs per session; at most 16 live sessions
 * per WASM instance. Vector budgets exclude this bounded bookkeeping overhead.
 * Output: 8 u32 [version,width,height,glyphOffset,fgOffset,bgOffset,alphaOffset,
 * totalBytes], then n u16 indices, n*4 u8 foreground, n*4 u8 background, n f32
 * alpha. Offsets are relative to output start, monotonically packed, with
 * foreground/background/alpha aligned to 4 bytes. Rust owns every stage/output.
 */
export const CHARACTER_ABI_VERSION = 1;
const HEADER_BYTES = 32;
const SETTINGS_BYTES = 160;
const align4 = (n: number) => Math.ceil(n / 4) * 4;
type NumericExport = (...args: number[]) => number;
interface CharacterWasm extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  render_abi_version: NumericExport;
  render_create: NumericExport;
  render_drop: NumericExport;
  render_stage: NumericExport;
  render_unstage: NumericExport;
  render_upload: NumericExport;
  render_begin: NumericExport;
  render_step: NumericExport;
  render_cancel: NumericExport;
  render_release: NumericExport;
  render_output_ptr: NumericExport;
  render_output_len: NumericExport;
  render_error: NumericExport;
}
export type CharacterStepStatus = "pending" | "complete" | "cancelled";
export interface CharacterEngine {
  readonly charactersProfileAvailable: boolean;
  setAtlas(atlas: ReferenceCharacterAtlasV1): void;
  beginCharacters(settings: ReferenceCharactersSettingsV1): number;
  takeFrame(jobId: number): ReferenceCharactersFrameV1;
  setSource(source: SourceUpload): void;
  setCalibration(calibration: GlyphCalibrationV1): void;
  begin(settings: CharacterSettingsV1): number;
  step(jobId: number, maxWork: number): CharacterStepStatus;
  takeGrid(jobId: number): PackedGlyphGrid;
  cancel(jobId: number): void;
  dispose(): void;
}
function uint(value: number, field: string, min = 0): void {
  if (!Number.isInteger(value) || value < min || value > 0xffffffff)
    throw new CharacterEngineError("InvalidInput", `Invalid ${field}`);
}
export async function createCharacterEngine(
  bytes: BufferSource,
  options: { memoryBudgetBytes?: number } = {},
): Promise<CharacterEngine> {
  const budget = options.memoryBudgetBytes ?? DEFAULT_MEMORY_BUDGET_BYTES;
  uint(budget, "memoryBudgetBytes", 1);
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const wasm = instance.exports as CharacterWasm;
  for (const name of [
    "render_abi_version",
    "render_create",
    "render_drop",
    "render_stage",
    "render_unstage",
    "render_upload",
    "render_begin",
    "render_step",
    "render_cancel",
    "render_release",
    "render_output_ptr",
    "render_output_len",
    "render_error",
  ]) {
    if (typeof wasm[name] !== "function")
      throw new CharacterEngineError(
        "CapabilityUnavailable",
        `Missing character ABI export ${name}`,
      );
  }
  if (
    !(wasm.memory instanceof WebAssembly.Memory) ||
    wasm.render_abi_version() !== CHARACTER_ABI_VERSION
  )
    throw new CharacterEngineError(
      "UnsupportedVersion",
      "Unsupported character ABI",
    );
  const handle = wasm.render_create(budget);
  if (!handle)
    throw new CharacterEngineError(
      "CapabilityUnavailable",
      "Cannot create character session",
    );
  let disposed = false;
  let sourceIdentity = "";
  let source: SourceRef | undefined;
  let atlas: ReferenceCharacterAtlasV1 | undefined;
  let uploadingAtlas = false;
  const profileNames = [
    "render_characters_profile_version",
    "render_begin_characters_v1",
    "render_frame_output_ptr",
    "render_frame_output_len",
  ];
  const profileAvailable =
    profileNames.every((name) => typeof wasm[name] === "function") &&
    (wasm.render_characters_profile_version as NumericExport)() === 1;
  type CalibrationIdentity = Pick<
    GlyphCalibrationV1,
    "id" | "cellWidth" | "cellHeight" | "glyphs"
  >;
  let calibration: CalibrationIdentity | undefined;
  let calibrationIdentity = "";
  const jobs = new Map<
    number,
    | {
        kind: "legacy";
        settings: CharacterSettingsV1;
        calibration?: CalibrationIdentity;
      }
    | {
        kind: "characters";
        settings: ReferenceCharactersSettingsV1;
        atlas: ReferenceCharacterAtlasV1;
        source: SourceRef;
      }
  >();
  function alive() {
    if (disposed)
      throw new CharacterEngineError("Disposed", "Character session disposed");
  }
  function check(value: number): number {
    if (!value) {
      const code = wasm.render_error(handle);
      const codes: RenderErrorCode[] = [
        "InvalidInput",
        "InvalidInput",
        "UnsupportedVersion",
        "BudgetExceeded",
        "MissingSource",
        "MissingCalibration",
        "Cancelled",
        "Disposed",
      ];
      throw new CharacterEngineError(
        codes[code] ?? "InvalidInput",
        `Character WASM error ${code}`,
      );
    }
    return value >>> 0;
  }
  function span(ptr: number, len: number): void {
    uint(ptr, "pointer", 1);
    uint(len, "length", 1);
    if (ptr > wasm.memory.buffer.byteLength - len)
      throw new Error("Invalid WASM span");
  }
  function transfer(
    length: number,
    write: (view: DataView, data: Uint8Array) => void,
    consume: (ptr: number) => number,
  ): number {
    alive();
    uint(length, "length", 1);
    const ptr = check(wasm.render_stage(handle, length));
    try {
      // A stage allocation may grow memory. Borrow all views only afterward.
      span(ptr, length);
      write(
        new DataView(wasm.memory.buffer, ptr, length),
        new Uint8Array(wasm.memory.buffer, ptr, length),
      );
      return check(consume(ptr));
    } finally {
      check(wasm.render_unstage(handle, ptr));
    }
  }
  function job(id: number) {
    alive();
    uint(id, "jobId", 1);
    const value = jobs.get(id);
    if (!value)
      throw new CharacterEngineError("InvalidInput", "Unknown character job");
    return value;
  }
  const engine: CharacterEngine = {
    charactersProfileAvailable: profileAvailable,
    setAtlas(input) {
      alive();
      const a = validateInput(input, validateReferenceCharacterAtlas);
      const c = a.calibration;
      if (
        atlas?.calibration.id === c.id &&
        atlasIdentityKey(atlas) !== atlasIdentityKey(a)
      )
        throw new CharacterEngineError(
          "InvalidInput",
          "Atlas metadata requires a new identity",
        );
      if (atlas && atlasIdentityKey(atlas) === atlasIdentityKey(a)) return;
      uploadingAtlas = true;
      try {
        engine.setCalibration(c);
      } finally {
        uploadingAtlas = false;
      }
      // One immutable upload-time snapshot; no per-frame source or mask clones.
      atlas = {
        ...a,
        calibration: {
          ...c,
          glyphs: [...c.glyphs],
          masks: c.masks.slice(),
          coverage: c.coverage.slice(),
          shapes: c.shapes.slice(),
        },
      };
    },
    beginCharacters(input) {
      alive();
      if (!profileAvailable)
        throw new CharacterEngineError(
          "CapabilityUnavailable",
          "Characters profile ABI unavailable",
        );
      if (!source)
        throw new CharacterEngineError(
          "MissingSource",
          "Missing Characters source",
        );
      const s = validateInput(input, (v) =>
        validateReferenceCharactersSettings(v, source!, budget),
      );
      if (s.backdrop !== "none")
        throw new CharacterEngineError(
          "CapabilityUnavailable",
          "Characters backdrop composition is unavailable",
        );
      if (
        !atlas ||
        atlas.calibration.id !== calibration?.id ||
        atlas.calibration.cellWidth !== 0.6 * s.fontSize * s.renderScale ||
        atlas.calibration.cellHeight !== s.fontSize * s.renderScale
      )
        throw new CharacterEngineError(
          "MissingCalibration",
          "Missing measured Characters atlas",
        );
      const block = encodeCharactersSettings(s, atlas, source);
      const id = transfer(
        112,
        (_v, b) => b.set(block),
        (ptr) =>
          (wasm.render_begin_characters_v1 as NumericExport)(handle, ptr, 112),
      );
      jobs.set(id, {
        kind: "characters",
        settings: { ...s, crop: { ...s.crop } },
        atlas,
        source,
      });
      return id;
    },
    takeFrame(id) {
      const metadata = job(id);
      if (metadata.kind !== "characters")
        throw new CharacterEngineError(
          "InvalidInput",
          "Not a Characters frame job",
        );
      const ptr = check(
        (wasm.render_frame_output_ptr as NumericExport)(handle, id),
      );
      const length = check(
        (wasm.render_frame_output_len as NumericExport)(handle, id),
      );
      try {
        span(ptr, length);
        return decodeCharactersFrame(
          new Uint8Array(wasm.memory.buffer, ptr, length),
          metadata.settings,
          metadata.atlas,
          metadata.source,
        );
      } finally {
        check(wasm.render_release(handle, id));
        jobs.delete(id);
      }
    },
    setSource(input) {
      alive();
      const s = validateInput(input, (value) =>
        validateSource(value, DEFAULT_MEMORY_BUDGET_BYTES),
      );
      if (s.rgba.byteLength > budget)
        throw new CharacterEngineError(
          "BudgetExceeded",
          "Source exceeds session memory budget",
        );
      const identity = JSON.stringify([s.id, s.revision, s.width, s.height]);
      if (identity === sourceIdentity) return;
      const length = HEADER_BYTES + s.rgba.length;
      transfer(
        length,
        (v, b) => {
          [1, 1, s.width, s.height, 0, 0, 0, 0].forEach((value, i) =>
            v.setUint32(i * 4, value, true),
          );
          b.set(s.rgba, HEADER_BYTES);
        },
        (ptr) => wasm.render_upload(handle, 1, ptr, length),
      );
      sourceIdentity = identity;
      source = {
        id: s.id,
        revision: s.revision,
        width: s.width,
        height: s.height,
      };
      jobs.clear();
    },
    setCalibration(input) {
      alive();
      const c = validateInput(input, validateGlyphCalibration);
      const identity = JSON.stringify([
        c.id,
        c.fontKey,
        c.cellWidth,
        c.cellHeight,
        c.glyphs,
        c.maskWidth,
        c.maskHeight,
      ]);
      if (identity === calibrationIdentity && !uploadingAtlas) return;
      const directions = ["|", "/", "-", "\\"].map((g) => c.glyphs.indexOf(g));
      const directional = directions.every((i) => i >= 0);
      const coverageOffset = align4(HEADER_BYTES + c.masks.length);
      const shapesOffset = coverageOffset + c.coverage.length * 4;
      const directionsOffset = shapesOffset + c.shapes.length * 4;
      const length = directionsOffset + (directional ? 16 : 0);
      transfer(
        length,
        (v, b) => {
          [
            1,
            2,
            0,
            0,
            c.glyphs.length,
            c.maskWidth,
            c.maskHeight,
            Number(directional),
          ].forEach((value, i) => v.setUint32(i * 4, value, true));
          b.set(c.masks, HEADER_BYTES);
          c.coverage.forEach((value, i) =>
            v.setFloat32(coverageOffset + i * 4, value, true),
          );
          c.shapes.forEach((value, i) =>
            v.setFloat32(shapesOffset + i * 4, value, true),
          );
          if (directional)
            directions.forEach((value, i) =>
              v.setUint32(directionsOffset + i * 4, value, true),
            );
        },
        (ptr) => wasm.render_upload(handle, 2, ptr, length),
      );
      // Numeric arrays remain caller-owned; grid validation needs immutable identity/dictionary.
      calibration = {
        id: c.id,
        cellWidth: c.cellWidth,
        cellHeight: c.cellHeight,
        glyphs: [...c.glyphs],
      };
      calibrationIdentity = identity;
      atlas = undefined;
      for (const [id, j] of jobs)
        if (j.kind === "characters" || j.settings.mapping === "glyph")
          jobs.delete(id);
    },
    begin(input) {
      alive();
      const s = validateInput(input, validateCharacterSettings);
      if (!sourceIdentity)
        throw new CharacterEngineError(
          "MissingSource",
          "Missing character source",
        );
      if (
        s.mapping === "glyph" &&
        (!calibration ||
          s.cellWidth !== calibration.cellWidth ||
          s.cellHeight !== calibration.cellHeight)
      )
        throw new CharacterEngineError(
          "MissingCalibration",
          "Missing or mismatched glyph calibration",
        );
      const flags =
        Number(s.shapeAware) |
        (Number(s.smartEdges) << 1) |
        (Number(s.mappingInvert) << 2) |
        (Number(s.outputInvert) << 3);
      const id = transfer(
        SETTINGS_BYTES,
        (v) => {
          [
            1,
            s.width,
            s.height,
            s.rotation,
            flags,
            ["monochrome", "grayscale", "color"].indexOf(s.mode),
            Number(s.mapping === "braille"),
            s.seed,
          ].forEach((value, i) => v.setUint32(i * 4, value, true));
          [
            s.cellWidth,
            s.cellHeight,
            s.crop.x,
            s.crop.y,
            s.crop.width,
            s.crop.height,
            s.brightness,
            s.contrast,
            s.gamma,
            s.saturation,
            s.density,
            s.sharpness,
            s.edge,
            s.fg,
            s.bg ?? -1,
            Number(s.dither === "floyd-steinberg"),
          ].forEach((value, i) =>
            v.setFloat64(HEADER_BYTES + i * 8, value, true),
          );
        },
        (ptr) => wasm.render_begin(handle, ptr, SETTINGS_BYTES),
      );
      jobs.set(id, {
        kind: "legacy",
        settings: { ...s, crop: { ...s.crop } },
        calibration: s.mapping === "glyph" ? calibration : undefined,
      });
      return id;
    },
    step(id, maxWork) {
      job(id);
      uint(maxWork, "maxWork");
      const code = check(wasm.render_step(handle, id, maxWork));
      if (code === 1) return "pending";
      if (code === 2) return "complete";
      if (code === 3) return "cancelled";
      throw new Error("Invalid character status");
    },
    takeGrid(id) {
      const metadata = job(id);
      if (metadata.kind !== "legacy")
        throw new CharacterEngineError("InvalidInput", "Not a legacy grid job");
      const ptr = check(wasm.render_output_ptr(handle, id));
      const length = check(wasm.render_output_len(handle, id));
      try {
        span(ptr, length);
        if (length < HEADER_BYTES) throw new Error("Invalid grid header");
        const view = new DataView(wasm.memory.buffer, ptr, length);
        const header = Array.from({ length: 8 }, (_, i) =>
          view.getUint32(i * 4, true),
        );
        const [
          version,
          width,
          height,
          glyphOffset,
          fgOffset,
          bgOffset,
          alphaOffset,
          total,
        ] = header;
        const s = metadata.settings;
        const n = width * height;
        if (
          version !== 1 ||
          width !== s.width ||
          height !== s.height ||
          glyphOffset !== 32 ||
          fgOffset !== align4(32 + n * 2) ||
          bgOffset !== fgOffset + n * 4 ||
          alphaOffset !== bgOffset + n * 4 ||
          total !== alphaOffset + n * 4 ||
          total !== length
        )
          throw new Error("Invalid grid offsets");
        // Each result array is copied once; none aliases growable WASM memory.
        const glyphIndices = new Uint16Array(n),
          foreground = new Uint8Array(n * 4),
          background = new Uint8Array(n * 4),
          alpha = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          glyphIndices[i] = view.getUint16(glyphOffset + i * 2, true);
          alpha[i] = view.getFloat32(alphaOffset + i * 4, true);
        }
        foreground.set(
          new Uint8Array(wasm.memory.buffer, ptr + fgOffset, n * 4),
        );
        background.set(
          new Uint8Array(wasm.memory.buffer, ptr + bgOffset, n * 4),
        );
        const grid: PackedGlyphGrid = {
          version: 1,
          width,
          height,
          cellWidth: s.cellWidth,
          cellHeight: s.cellHeight,
          calibrationId: metadata.calibration?.id ?? "",
          glyphIndices,
          foreground,
          background,
          alpha,
        };
        validateGrid(grid);
        if (
          metadata.calibration &&
          grid.glyphIndices.some(
            (i) => i !== 65535 && i >= metadata.calibration!.glyphs.length,
          )
        )
          throw new Error("Invalid glyph index");
        return grid;
      } finally {
        check(wasm.render_release(handle, id));
        jobs.delete(id);
      }
    },
    cancel(id) {
      job(id);
      check(wasm.render_cancel(handle, id));
      jobs.delete(id);
    },
    dispose() {
      if (disposed) return;
      check(wasm.render_drop(handle));
      disposed = true;
      jobs.clear();
      calibration = undefined;
      atlas = undefined;
      source = undefined;
      sourceIdentity = "";
      calibrationIdentity = "";
    },
  };
  return engine;
}
