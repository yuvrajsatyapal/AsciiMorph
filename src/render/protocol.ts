import {
  validateStyleSettings,
  validateStyleFrame,
  type StyleSettingsV1,
  type RgbaFrameV1,
} from "./style-contract";
import type {
  InitialStyleId,
  StyleRenderRequest,
  StyleRenderResult,
  StyleRenderType,
} from "./style-protocol";
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

import { MAX_BACKING_PIXELS, MAX_BACKING_SIDE } from "@/core/render";
import {
  validateReferenceCharacterAtlas,
  validateReferenceCharactersSettings,
  type ReferenceCharacterAtlasV1,
  type ReferenceCharactersSettingsV1,
  type ReferenceCharactersFrameV1,
} from "./reference-characters";
export type CharactersRenderType =
  | "renderCharactersPreview"
  | "renderCharactersExport";
export interface CharactersRenderRequest extends RenderIdentity {
  source: SourceRef;
  settings: ReferenceCharactersSettingsV1;
  timeUs: number;
  outputWidth?: number;
  outputHeight?: number;
}
export interface CharactersRenderResult extends RenderIdentity {
  frame: ReferenceCharactersFrameV1;
  backend: "rust-cpu";
  timings: RenderTimings;
}
export const RENDER_PROTOCOL_VERSION = 1 as const;
export interface RenderMessageEnvelope {
  version: typeof RENDER_PROTOCOL_VERSION;
  requestId: string;
}
export type RenderErrorCode =
  | "InvalidInput"
  | "UnsupportedVersion"
  | "BudgetExceeded"
  | "MissingSource"
  | "MissingCalibration"
  | "Cancelled"
  | "Disposed"
  | "Busy"
  | "CapabilityUnavailable"
  | "WorkerFailure";
export interface RenderErrorPayload {
  code: RenderErrorCode;
  message: string;
  recoverable: boolean;
}
export class RenderError extends Error implements RenderErrorPayload {
  constructor(
    public readonly code: RenderErrorCode,
    message: string,
    public readonly recoverable = true,
  ) {
    super(message);
    this.name = "RenderError";
  }
}
export interface RenderIdentity {
  jobId: string;
  revision: number;
  sourceId: string;
  sourceRevision: number;
  calibrationId: string;
}
export interface RenderRequest extends RenderIdentity {
  settings: CharacterSettingsV1;
  timeUs: number;
  /** Export grid dimensions, required for renderExport and equal to settings. */
  outputWidth?: number;
  outputHeight?: number;
}
/** Measured wall-clock durations. Compute includes cooperative scheduling yields. */
export interface RenderTimings {
  queueMs: number;
  computeMs: number;
  readbackMs: number;
  totalMs: number;
}
export interface RenderResult extends RenderIdentity {
  grid: PackedGlyphGrid;
  backend: "rust-cpu";
  timings: RenderTimings;
}
export interface ThumbnailRenderRequest extends RenderIdentity {
  source: SourceRef;
  profile:
    | { kind: "characters"; settings: ReferenceCharactersSettingsV1 }
    | { kind: "style"; settings: StyleSettingsV1 };
  timeUs: number;
  maxSide: number;
}
export interface ThumbnailRenderResult extends RenderIdentity {
  styleId: "characters" | InitialStyleId;
  frame: RgbaFrameV1;
  backend: "rust-cpu";
  timings: RenderTimings;
}
type Envelope<T> = RenderMessageEnvelope & T;
export type WorkerRequest =
  | Envelope<{ type: "initialize"; memoryBudgetBytes: number }>
  | Envelope<{ type: "setSource"; source: SourceUpload }>
  | Envelope<{ type: "setCalibration"; calibration: GlyphCalibrationV1 }>
  | Envelope<{ type: "setAtlas"; atlas: ReferenceCharacterAtlasV1 }>
  | Envelope<StyleRenderRequest & { type: StyleRenderType }>
  | Envelope<ThumbnailRenderRequest & { type: "renderThumbnail" }>
  | Envelope<CharactersRenderRequest & { type: CharactersRenderType }>
  | Envelope<RenderRequest & { type: "renderPreview" | "renderExport" }>
  | Envelope<RenderIdentity & { type: "cancel"; targetRequestId: string }>
  | Envelope<{ type: "dispose" }>;
export type WorkerResponse =
  | Envelope<{
      type: "ready";
      styleProfileVersion?: 1 | null;
      supportedStyleIds?: readonly InitialStyleId[];
      charactersProfileVersion?: 1 | null;
      charactersContextVersion?: 1 | null;
      styleContextVersion?: 1 | null;
      charactersAtlasRetentionVersion?: 1 | null;
      thumbnailProfileVersion?: 1 | null;
    }>
  | Envelope<{ type: "disposed" }>
  | Envelope<{
      type: "accepted";
      operation: "setSource";
      sourceId: string;
      sourceRevision: number;
    }>
  | Envelope<{
      type: "accepted";
      operation: "setCalibration" | "setAtlas";
      calibrationId: string;
    }>
  | Envelope<
      RenderIdentity & {
        type: "accepted";
        operation:
          | "renderPreview"
          | "renderExport"
          | CharactersRenderType
          | StyleRenderType
          | "renderThumbnail";
      }
    >
  | Envelope<
      RenderIdentity & {
        type: "progress";
        phase: "compute";
        elapsedMs: number;
        slices: number;
      }
    >
  | Envelope<RenderResult & { type: "result" }>
  | Envelope<StyleRenderResult & { type: "styleResult" }>
  | Envelope<ThumbnailRenderResult & { type: "thumbnailResult" }>
  | Envelope<CharactersRenderResult & { type: "charactersResult" }>
  | Envelope<RenderIdentity & { type: "cancelled" }>
  | Envelope<
      RenderIdentity & {
        type: "charactersUnavailable";
        error: RenderErrorPayload;
      }
    >
  | Envelope<
      Partial<RenderIdentity> & { type: "error"; error: RenderErrorPayload }
    >;
const identityKeys = [
  "jobId",
  "revision",
  "sourceId",
  "sourceRevision",
  "calibrationId",
];
const errorCodes: RenderErrorCode[] = [
  "InvalidInput",
  "UnsupportedVersion",
  "BudgetExceeded",
  "MissingSource",
  "MissingCalibration",
  "Cancelled",
  "Disposed",
  "Busy",
  "CapabilityUnavailable",
  "WorkerFailure",
];
type RecordValue = Record<string, unknown>;
function invalid(message: string): never {
  throw new RenderError("InvalidInput", message);
}
function record(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("Expected transport object");
  return value as RecordValue;
}
function exact(value: RecordValue, keys: string[]) {
  if (
    Reflect.ownKeys(value).some(
      (k) => typeof k !== "string" || !keys.includes(k),
    ) ||
    keys.some((k) => !Object.hasOwn(value, k))
  )
    invalid("Invalid transport fields");
}
function text(value: unknown, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && !value.trim()))
    invalid("Invalid transport identity");
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER, min = 0) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    invalid("Invalid transport integer");
}
function duration(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    invalid("Invalid duration");
}
function version(value: RecordValue) {
  if (value.version !== 1)
    throw new RenderError(
      "UnsupportedVersion",
      "Unsupported transport version",
    );
}
function identity(value: RecordValue) {
  text(value.jobId);
  text(value.sourceId);
  text(value.calibrationId, true);
  integer(value.revision);
  integer(value.sourceRevision);
}
function contract<T>(value: unknown, validate: (input: unknown) => T): T {
  try {
    return validate(value);
  } catch (error) {
    if (error instanceof RenderError) throw error;
    throw new RenderError(
      "InvalidInput",
      error instanceof Error ? error.message : "Invalid input",
    );
  }
}
export function validateWorkerRequest(value: unknown): WorkerRequest {
  const m = record(value);
  version(m);
  text(m.requestId);
  const base = ["version", "requestId", "type"];
  switch (m.type) {
    case "initialize":
      exact(m, [...base, "memoryBudgetBytes"]);
      integer(m.memoryBudgetBytes, 0xffffffff, 1);
      break;
    case "setSource":
      exact(m, [...base, "source"]);
      contract(m.source, (v) => validateSource(v, DEFAULT_MEMORY_BUDGET_BYTES));
      break;
    case "setAtlas":
      exact(m, [...base, "atlas"]);
      contract(m.atlas, validateReferenceCharacterAtlas);
      break;
    case "setCalibration":
      exact(m, [...base, "calibration"]);
      version(record(m.calibration));
      contract(m.calibration, validateGlyphCalibration);
      break;
    case "renderStylePreview":
    case "renderStyleExport": {
      exact(m, [
        ...base,
        ...identityKeys,
        "source",
        "styleId",
        "settings",
        "timeUs",
        ...(m.type === "renderStyleExport"
          ? ["outputWidth", "outputHeight"]
          : []),
      ]);
      identity(m);
      const src = record(m.source);
      if (src.id !== m.sourceId || src.revision !== m.sourceRevision)
        invalid("Style source identity mismatch");
      const s = contract(m.settings, (v) =>
        validateStyleSettings(v, m.source as SourceRef),
      );
      if (m.styleId !== s.styleId || m.timeUs !== s.timeUs)
        invalid("Style request identity/time mismatch");
      if (s.styleId === "braille" ? !m.calibrationId : m.calibrationId !== "")
        invalid("Style resource identity mismatch");
      if (
        m.type === "renderStyleExport" &&
        (m.outputWidth !== s.frameWidth || m.outputHeight !== s.frameHeight)
      )
        invalid("Style export dimensions mismatch");
      break;
    }
    case "renderThumbnail": {
      exact(m, [
        ...base,
        ...identityKeys,
        "source",
        "profile",
        "timeUs",
        "maxSide",
      ]);
      identity(m);
      integer(m.maxSide, 192, 1);
      integer(m.timeUs);
      const src = record(m.source);
      if (src.id !== m.sourceId || src.revision !== m.sourceRevision)
        invalid("Thumbnail source identity mismatch");
      const profile = record(m.profile);
      exact(profile, ["kind", "settings"]);
      if (profile.kind === "style") {
        const s = contract(profile.settings, (v) =>
          validateStyleSettings(v, m.source as SourceRef),
        );
        if (
          s.renderScale !== 1 ||
          s.timeUs !== m.timeUs ||
          (s.styleId === "braille" ? !m.calibrationId : m.calibrationId !== "")
        )
          invalid("Thumbnail style identity or scale mismatch");
      } else if (profile.kind === "characters") {
        const s = contract(profile.settings, (v) =>
          validateReferenceCharactersSettings(v, m.source as SourceRef),
        );
        if (s.renderScale !== 1 || !m.calibrationId)
          invalid("Thumbnail Characters identity or scale mismatch");
      } else invalid("Unknown thumbnail profile");
      break;
    }
    case "renderCharactersPreview":
    case "renderCharactersExport": {
      exact(m, [
        ...base,
        ...identityKeys,
        "source",
        "settings",
        "timeUs",
        ...(m.type === "renderCharactersExport"
          ? ["outputWidth", "outputHeight"]
          : []),
      ]);
      identity(m);
      integer(m.timeUs);
      text(m.calibrationId);
      const src = record(m.source);
      if (src.id !== m.sourceId || src.revision !== m.sourceRevision)
        invalid("Characters source identity mismatch");
      const s = contract(m.settings, (v) =>
        validateReferenceCharactersSettings(v, m.source as SourceRef),
      );
      if (
        m.type === "renderCharactersExport" &&
        (m.outputWidth !== s.frameWidth || m.outputHeight !== s.frameHeight)
      )
        invalid("Characters export dimensions mismatch");
      break;
    }
    case "renderPreview":
    case "renderExport": {
      const output =
        m.type === "renderExport" ? ["outputWidth", "outputHeight"] : [];
      exact(m, [...base, ...identityKeys, "settings", "timeUs", ...output]);
      identity(m);
      integer(m.timeUs);
      version(record(m.settings));
      const s = contract(m.settings, validateCharacterSettings);
      if (s.mapping === "glyph" && !m.calibrationId)
        invalid("Missing calibration identity");
      if (s.mapping === "braille" && m.calibrationId !== "")
        invalid("Braille calibration identity must be empty");
      if (
        m.type === "renderExport" &&
        (m.outputWidth !== s.width || m.outputHeight !== s.height)
      )
        invalid("Export dimensions must equal settings dimensions");
      break;
    }
    case "cancel":
      exact(m, [...base, ...identityKeys, "targetRequestId"]);
      identity(m);
      text(m.targetRequestId);
      break;
    case "dispose":
      exact(m, base);
      break;
    default:
      invalid("Unknown transport request");
  }
  return value as WorkerRequest;
}
export function validateWorkerResponse(value: unknown): WorkerResponse {
  const m = record(value);
  version(m);
  text(m.requestId);
  const base = ["version", "requestId", "type"];
  switch (m.type) {
    case "ready":
      exact(m, [
        ...base,
        ...("styleContextVersion" in m ? ["styleContextVersion"] : []),
        ...("styleProfileVersion" in m ? ["styleProfileVersion"] : []),
        ...("supportedStyleIds" in m ? ["supportedStyleIds"] : []),
        ...("charactersProfileVersion" in m
          ? ["charactersProfileVersion"]
          : []),
        ...("charactersAtlasRetentionVersion" in m
          ? ["charactersAtlasRetentionVersion"]
          : []),
        ...("charactersContextVersion" in m
          ? ["charactersContextVersion"]
          : []),
        ...("thumbnailProfileVersion" in m ? ["thumbnailProfileVersion"] : []),
      ]);
      if (
        "styleProfileVersion" in m &&
        m.styleProfileVersion !== 1 &&
        m.styleProfileVersion !== null
      )
        invalid("Invalid style capability");
      if ("supportedStyleIds" in m) {
        if (
          !Array.isArray(m.supportedStyleIds) ||
          m.supportedStyleIds.some(
            (id) => !["braille", "pixel", "mosaic"].includes(id),
          ) ||
          new Set(m.supportedStyleIds).size !== m.supportedStyleIds.length ||
          (m.supportedStyleIds.length > 0 && m.styleProfileVersion !== 1)
        )
          invalid("Invalid supported styles");
      }
      for (const key of [
        "styleContextVersion",
        "charactersProfileVersion",
        "charactersContextVersion",
        "charactersAtlasRetentionVersion",
      ])
        if (key in m && m[key] !== null && m[key] !== 1)
          invalid("Invalid Characters capability version");
      if (
        m.charactersAtlasRetentionVersion === 1 &&
        m.charactersProfileVersion !== 1
      )
        invalid("Atlas retention requires profile version1");
      if (m.charactersContextVersion === 1 && m.charactersProfileVersion !== 1)
        invalid("Complete context requires profile version1");
      if (
        "thumbnailProfileVersion" in m &&
        m.thumbnailProfileVersion !== null &&
        m.thumbnailProfileVersion !== 1
      )
        invalid("Invalid thumbnail capability");
      break;
    case "disposed":
      exact(m, base);
      break;
    case "accepted":
      if (m.operation === "setSource") {
        exact(m, [...base, "operation", "sourceId", "sourceRevision"]);
        text(m.sourceId);
        integer(m.sourceRevision);
      } else if (
        m.operation === "setCalibration" ||
        m.operation === "setAtlas"
      ) {
        exact(m, [...base, "operation", "calibrationId"]);
        text(m.calibrationId);
      } else if (
        m.operation === "renderPreview" ||
        m.operation === "renderExport" ||
        m.operation === "renderCharactersPreview" ||
        m.operation === "renderCharactersExport" ||
        m.operation === "renderStylePreview" ||
        m.operation === "renderStyleExport" ||
        m.operation === "renderThumbnail"
      ) {
        exact(m, [...base, "operation", ...identityKeys]);
        identity(m);
      } else invalid("Invalid acceptance operation");
      break;
    case "progress":
      exact(m, [...base, ...identityKeys, "phase", "elapsedMs", "slices"]);
      identity(m);
      if (m.phase !== "compute") invalid("Invalid phase");
      duration(m.elapsedMs);
      integer(m.slices);
      break;
    case "cancelled":
      exact(m, [...base, ...identityKeys]);
      identity(m);
      break;
    case "thumbnailResult":
    case "styleResult":
    case "charactersResult":
    case "result": {
      exact(m, [
        ...base,
        ...identityKeys,
        m.type === "result" ? "grid" : "frame",
        ...(m.type === "styleResult" || m.type === "thumbnailResult"
          ? ["styleId"]
          : []),
        "backend",
        "timings",
      ]);
      identity(m);
      if (m.backend !== "rust-cpu") invalid("Invalid backend");
      if (m.type === "result")
        contract(m.grid, (v) => validateGrid(v as PackedGlyphGrid));
      else if (m.type === "thumbnailResult") {
        if (
          !["characters", "braille", "pixel", "mosaic"].includes(
            m.styleId as string,
          )
        )
          invalid("Invalid thumbnail style identity");
        if (
          m.styleId === "characters" || m.styleId === "braille"
            ? !m.calibrationId
            : m.calibrationId !== ""
        )
          invalid("Invalid thumbnail resource identity");
        const f = record(m.frame);
        exact(f, ["version", "width", "height", "rgba"]);
        version(f);
        integer(f.width, 192, 1);
        integer(f.height, 192, 1);
        if (
          !(f.rgba instanceof Uint8Array) ||
          f.rgba.length !== (f.width as number) * (f.height as number) * 4
        )
          invalid("Invalid thumbnail frame");
      } else if (m.type === "styleResult") {
        if (!["braille", "pixel", "mosaic"].includes(m.styleId as string))
          invalid("Invalid style result identity");
        if (m.styleId === "braille" ? !m.calibrationId : m.calibrationId !== "")
          invalid("Invalid style resource identity");
        const f = record(m.frame);
        contract(m.frame, (v) =>
          validateStyleFrame(v, {
            frameWidth: f.width,
            frameHeight: f.height,
          } as import("./style-contract").StyleSettingsV1),
        );
      } else {
        const f = record(m.frame);
        exact(f, ["version", "width", "height", "rgba", "grid"]);
        version(f);
        integer(f.width, MAX_BACKING_SIDE, 1);
        integer(f.height, MAX_BACKING_SIDE, 1);
        const pixels = (f.width as number) * (f.height as number);
        if (
          pixels > MAX_BACKING_PIXELS ||
          !(f.rgba instanceof Uint8Array) ||
          f.rgba.length !== pixels * 4 ||
          f.rgba.buffer.byteLength > DEFAULT_MEMORY_BUDGET_BYTES
        )
          invalid("Invalid Characters frame");
        if (f.grid !== null)
          contract(f.grid, (v) => validateGrid(v as PackedGlyphGrid));
      }
      const timings = record(m.timings);
      exact(timings, ["queueMs", "computeMs", "readbackMs", "totalMs"]);
      Object.values(timings).forEach(duration);
      break;
    }
    case "charactersUnavailable":
    case "error": {
      const withIdentity =
        m.type === "charactersUnavailable" ||
        identityKeys.some((k) => Object.hasOwn(m, k));
      exact(m, [...base, "error", ...(withIdentity ? identityKeys : [])]);
      if (withIdentity) identity(m);
      const e = record(m.error);
      exact(e, ["code", "message", "recoverable"]);
      if (
        m.type === "charactersUnavailable" &&
        e.code !== "CapabilityUnavailable"
      )
        invalid("Invalid Characters capability response");
      if (
        !errorCodes.includes(e.code as RenderErrorCode) ||
        typeof e.message !== "string" ||
        typeof e.recoverable !== "boolean"
      )
        invalid("Invalid error payload");
      break;
    }
    default:
      invalid("Unknown transport response");
  }
  return value as WorkerResponse;
}
export function renderIdentity(value: RenderIdentity): RenderIdentity {
  return {
    jobId: value.jobId,
    revision: value.revision,
    sourceId: value.sourceId,
    sourceRevision: value.sourceRevision,
    calibrationId: value.calibrationId,
  };
}
export function sameRenderIdentity(
  a: RenderIdentity,
  b: RenderIdentity,
): boolean {
  return identityKeys.every(
    (k) => a[k as keyof RenderIdentity] === b[k as keyof RenderIdentity],
  );
}

/** Validates the public request before adding the service-owned envelope. */
export function validateRenderRequest(
  value: unknown,
  type: "renderPreview" | "renderExport",
): RenderRequest {
  const request = record(value);
  exact(request, [
    ...identityKeys,
    "settings",
    "timeUs",
    ...(type === "renderExport" ? ["outputWidth", "outputHeight"] : []),
  ]);
  validateWorkerRequest({
    ...request,
    version: 1,
    requestId: "request-validation",
    type,
  });
  return value as RenderRequest;
}
export function calibrationIdentityKey(
  calibration: GlyphCalibrationV1,
): string {
  return JSON.stringify([
    calibration.id,
    calibration.fontKey,
    calibration.cellWidth,
    calibration.cellHeight,
    calibration.glyphs,
    calibration.maskWidth,
    calibration.maskHeight,
  ]);
}

export function validateCharactersRenderRequest(
  value: unknown,
  type: CharactersRenderType,
): CharactersRenderRequest {
  const request = record(value);
  exact(request, [
    ...identityKeys,
    "source",
    "settings",
    "timeUs",
    ...(type === "renderCharactersExport"
      ? ["outputWidth", "outputHeight"]
      : []),
  ]);
  validateWorkerRequest({
    ...request,
    version: 1,
    requestId: "request-validation",
    type,
  });
  return value as CharactersRenderRequest;
}
/** The complete measured wrapper is one immutable identity, including placement policy. */
export function atlasIdentityKey(atlas: ReferenceCharacterAtlasV1): string {
  return JSON.stringify([
    calibrationIdentityKey(atlas.calibration),
    atlas.version,
    atlas.originX,
    atlas.originY,
    atlas.spaceIndexOr65535,
    atlas.ordering,
    atlas.placement,
    atlas.fontPolicy,
  ]);
}
