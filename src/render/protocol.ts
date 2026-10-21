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
} from "./character-contract";

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
type Envelope<T> = RenderMessageEnvelope & T;
export type WorkerRequest =
  | Envelope<{ type: "initialize"; memoryBudgetBytes: number }>
  | Envelope<{ type: "setSource"; source: SourceUpload }>
  | Envelope<{ type: "setCalibration"; calibration: GlyphCalibrationV1 }>
  | Envelope<RenderRequest & { type: "renderPreview" | "renderExport" }>
  | Envelope<RenderIdentity & { type: "cancel"; targetRequestId: string }>
  | Envelope<{ type: "dispose" }>;
export type WorkerResponse =
  | Envelope<{ type: "ready" | "disposed" }>
  | Envelope<{
      type: "accepted";
      operation: "setSource";
      sourceId: string;
      sourceRevision: number;
    }>
  | Envelope<{
      type: "accepted";
      operation: "setCalibration";
      calibrationId: string;
    }>
  | Envelope<
      RenderIdentity & {
        type: "accepted";
        operation: "renderPreview" | "renderExport";
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
  | Envelope<RenderIdentity & { type: "cancelled" }>
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
    case "setCalibration":
      exact(m, [...base, "calibration"]);
      version(record(m.calibration));
      contract(m.calibration, validateGlyphCalibration);
      break;
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
    case "disposed":
      exact(m, base);
      break;
    case "accepted":
      if (m.operation === "setSource") {
        exact(m, [...base, "operation", "sourceId", "sourceRevision"]);
        text(m.sourceId);
        integer(m.sourceRevision);
      } else if (m.operation === "setCalibration") {
        exact(m, [...base, "operation", "calibrationId"]);
        text(m.calibrationId);
      } else if (
        m.operation === "renderPreview" ||
        m.operation === "renderExport"
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
    case "result": {
      exact(m, [...base, ...identityKeys, "grid", "backend", "timings"]);
      identity(m);
      if (m.backend !== "rust-cpu") invalid("Invalid backend");
      contract(m.grid, (v) => validateGrid(v as PackedGlyphGrid));
      const timings = record(m.timings);
      exact(timings, ["queueMs", "computeMs", "readbackMs", "totalMs"]);
      Object.values(timings).forEach(duration);
      break;
    }
    case "error": {
      const withIdentity = identityKeys.some((k) => Object.hasOwn(m, k));
      exact(m, [...base, "error", ...(withIdentity ? identityKeys : [])]);
      if (withIdentity) identity(m);
      const e = record(m.error);
      exact(e, ["code", "message", "recoverable"]);
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
