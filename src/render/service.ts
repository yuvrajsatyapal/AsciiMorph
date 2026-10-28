import { validateStyleSettings, validateStyleFrame } from "./style-contract";
import { encodeStyleSettings } from "./style-wire";
import {
  validateStyleRenderRequest,
  type InitialStyleId,
  type StyleRenderType,
  type StyleRenderRequest,
  type StyleRenderResult,
} from "./style-protocol";
export type { StyleRenderRequest, StyleRenderResult } from "./style-protocol";
import {
  DEFAULT_MEMORY_BUDGET_BYTES,
  type GlyphCalibrationV1,
  type SourceUpload,
} from "./character-contract";
import {
  RenderError,
  calibrationIdentityKey,
  atlasIdentityKey,
  validateCharactersRenderRequest,
  type CharactersRenderRequest,
  type CharactersRenderResult,
  type CharactersRenderType,
  validateRenderRequest,
  renderIdentity,
  sameRenderIdentity,
  validateWorkerRequest,
  validateWorkerResponse,
  type RenderRequest,
  type RenderResult,
  type WorkerRequest,
  type WorkerResponse,
  type ThumbnailRenderRequest,
  type ThumbnailRenderResult,
} from "./protocol";

import {
  validateReferenceCharactersSettings,
  validateReferenceCharactersFrame,
  type ReferenceCharacterAtlasV1,
} from "./reference-characters";

export type {
  CharactersRenderRequest,
  CharactersRenderResult,
  RenderRequest,
  RenderResult,
} from "./protocol";
export type RenderServiceState =
  | "idle"
  | "initializing"
  | "ready"
  | "recoverable-error"
  | "disposed";
export interface RenderService {
  readonly state: RenderServiceState;
  /** Metadata-only state/capability changes, including idle worker failure. */
  subscribeStatus(listener: () => void): () => void;
  /** Selected service snapshot, queued atlas inputs, and submitted atlas jobs
   * through worker terminal response. Bytes deduplicate views of one backing. */
  readonly atlasResourceUsage: Readonly<{
    selected: Readonly<{ calibrationId: string; backingBytes: number }> | null;
    inFlight: readonly Readonly<{
      calibrationId: string;
      backingBytes: number;
    }>[];
  }>;
  readonly styleProfileVersion: 1 | null;
  readonly supportedStyleIds: readonly InitialStyleId[];
  readonly thumbnailProfileVersion: 1 | null;
  /** A submitted native thumbnail retains its budget until terminal reply. */
  readonly thumbnailResourceUsage: Readonly<{ inFlight: boolean }>;
  /** Includes callers waiting for input admission, not only worker jobs. */
  readonly highPriorityBusy: boolean;
  renderThumbnail(
    request: ThumbnailRenderRequest,
    signal?: AbortSignal,
    capturedAtlas?: ReferenceCharacterAtlasV1,
  ): Promise<ThumbnailRenderResult>;
  renderStylePreview(
    request: StyleRenderRequest,
    signal?: AbortSignal,
    capturedAtlas?: ReferenceCharacterAtlasV1,
  ): Promise<StyleRenderResult>;
  renderStyleExport(
    request: StyleRenderRequest,
    signal?: AbortSignal,
    capturedAtlas?: ReferenceCharacterAtlasV1,
  ): Promise<StyleRenderResult>;
  readonly charactersProfileVersion: 1 | null;
  readonly charactersContextVersion: 1 | null;
  readonly styleContextVersion?: 1 | null;
  readonly charactersAtlasRetentionVersion: 1 | null;
  initialize(): Promise<void>;
  setSource(source: SourceUpload): Promise<void>;
  setCalibration(calibration: GlyphCalibrationV1): Promise<void>;
  renderPreview(
    request: RenderRequest,
    signal?: AbortSignal,
  ): Promise<RenderResult>;
  renderExport(
    request: RenderRequest,
    signal?: AbortSignal,
  ): Promise<RenderResult>;
  setAtlas(atlas: ReferenceCharacterAtlasV1): Promise<void>;
  /** Optional immutable atlas capture selects/uploads and sends in one input
   * admission turn. The queue releases before numerical completion. First use
   * snapshots data; same input object+metadata reuses that owned snapshot.
   * Byte changes require a fresh atlas identity/object, as with setAtlas. */
  renderCharactersPreview(
    request: CharactersRenderRequest,
    signal?: AbortSignal,
    capturedAtlas?: ReferenceCharacterAtlasV1,
  ): Promise<CharactersRenderResult>;
  renderCharactersExport(
    request: CharactersRenderRequest,
    signal?: AbortSignal,
    capturedAtlas?: ReferenceCharacterAtlasV1,
  ): Promise<CharactersRenderResult>;
  dispose(): Promise<void>;
}
interface Waiter {
  message: WorkerRequest;
  atlas?: ReferenceCharacterAtlasV1;
  resolve(response: WorkerResponse): void;
  reject(error: RenderError): void;
  cleanup(): void;
  aborted?: boolean;
}
interface Connection {
  worker: Worker;
  message: (event: MessageEvent<unknown>) => void;
  failure: () => void;
}
function copySource(source: SourceUpload): SourceUpload {
  return { ...source, rgba: source.rgba.slice() };
}
function copyCalibration(calibration: GlyphCalibrationV1): GlyphCalibrationV1 {
  return {
    ...calibration,
    glyphs: [...calibration.glyphs],
    masks: calibration.masks.slice(),
    coverage: calibration.coverage.slice(),
    shapes: calibration.shapes.slice(),
  };
}
/** Retains recovery copies; each worker upload gets its own transferable arrays. */
export function createRenderService(
  options: { memoryBudgetBytes?: number; workerFactory?: () => Worker } = {},
): RenderService {
  const memoryBudgetBytes =
    options.memoryBudgetBytes ?? DEFAULT_MEMORY_BUDGET_BYTES;
  const factory =
    options.workerFactory ??
    (() =>
      new Worker(new URL("./render.worker.ts", import.meta.url), {
        type: "module",
      }));
  let state: RenderServiceState = "idle";
  const statusListeners = new Set<() => void>();
  const notifyStatus = () => {
    for (const listener of statusListeners) listener();
  };
  let styleProfileVersion: 1 | null = null;
  let thumbnailProfileVersion: 1 | null = null;
  let supportedStyleIds: readonly InitialStyleId[] = Object.freeze([]);
  let charactersProfileVersion: 1 | null = null;
  let charactersContextVersion: 1 | null = null;
  let styleContextVersion: 1 | null = null;
  let charactersAtlasRetentionVersion: 1 | null = null;
  let connection: Connection | undefined;
  let initialization: Promise<void> | undefined;
  let inputQueue: Promise<void> = Promise.resolve();
  let retainedSource: SourceUpload | undefined;
  let retainedCalibration: GlyphCalibrationV1 | undefined;
  let retainedAtlas: ReferenceCharacterAtlasV1 | undefined;
  const atlasBackings = (atlas: ReferenceCharacterAtlasV1) =>
    [
      ...new Set([
        atlas.calibration.masks.buffer,
        atlas.calibration.coverage.buffer,
        atlas.calibration.shapes.buffer,
      ]),
    ].reduce((sum, buffer) => sum + buffer.byteLength, 0);
  // Metadata only: no extra atlas or ArrayBuffer ownership. A local abort does
  // not release a worker/native request; its terminal reply or detach does.
  const inFlightAtlases = new Map<
    string,
    { calibrationId: string; backingBytes: number }
  >();
  const pendingAtlasInputs = new Map<
    symbol,
    { calibrationId: string; backingBytes: number }
  >();
  function pendingAtlas(atlas: ReferenceCharacterAtlasV1) {
    const token = Symbol("atlas-input");
    pendingAtlasInputs.set(token, {
      calibrationId: atlas.calibration.id,
      backingBytes: atlasBackings(atlas),
    });
    return () => pendingAtlasInputs.delete(token);
  }
  // Atlas IDs denote immutable calibration data. First capture snapshots bytes;
  // repeated calls with the same input object+metadata reuse that owned capture,
  // never the caller's mutable arrays. Weak keys do not form an atlas registry.
  let atlasSnapshots = new WeakMap<
    ReferenceCharacterAtlasV1,
    { key: string; snapshot: ReferenceCharacterAtlasV1 }
  >();
  function snapshotAtlas(atlas: ReferenceCharacterAtlasV1) {
    validateWorkerRequest({ ...envelope(), type: "setAtlas", atlas });
    const key = atlasIdentityKey(atlas),
      prior = atlasSnapshots.get(atlas);
    if (prior?.key === key) return prior.snapshot;
    const snapshot = {
      ...atlas,
      calibration: copyCalibration(atlas.calibration),
    };
    atlasSnapshots.set(atlas, { key, snapshot });
    return snapshot;
  }
  let counter = 0;
  let failureEpoch = 0;
  let lastFailure: RenderError | undefined;
  const waiters = new Map<string, Waiter>();
  // Keep lane identity through local abort until the worker's terminal response.
  // This lets late unsupported-style errors remain recoverable.
  const styleRequests = new Set<string>();
  const thumbnailRequests = new Set<string>();
  let highPriorityRequests = 0;
  async function highPriority<T>(work: () => Promise<T>): Promise<T> {
    highPriorityRequests++;
    try {
      return await work();
    } finally {
      highPriorityRequests--;
    }
  }
  const envelope = () => ({
    version: 1 as const,
    requestId: String(++counter),
  });
  const disposedError = () =>
    new RenderError("Disposed", "Render service disposed", false);
  const isDisposed = () => state === "disposed";
  function alive() {
    if (isDisposed()) throw disposedError();
  }
  function settle(
    requestId: string,
    error?: RenderError,
    response?: WorkerResponse,
  ) {
    const waiter = waiters.get(requestId);
    if (!waiter) return;
    waiters.delete(requestId);
    waiter.cleanup();
    if (error) waiter.reject(error);
    else waiter.resolve(response!);
  }
  function detach() {
    styleRequests.clear();
    thumbnailRequests.clear();
    inFlightAtlases.clear();
    pendingAtlasInputs.clear();
    const current = connection;
    connection = undefined;
    if (!current) return;
    current.worker.removeEventListener("message", current.message);
    current.worker.removeEventListener("error", current.failure);
    current.worker.removeEventListener("messageerror", current.failure);
    current.worker.terminate();
  }
  function fail(error: RenderError) {
    if (state === "disposed") return;
    state = "recoverable-error";
    notifyStatus();
    failureEpoch++;
    lastFailure = error;
    detach();
    for (const id of [...waiters.keys()]) settle(id, error);
  }
  function handle(value: unknown) {
    let response: WorkerResponse;
    try {
      response = validateWorkerResponse(value);
    } catch {
      fail(
        new RenderError(
          "WorkerFailure",
          "Worker returned invalid transport data",
        ),
      );
      return;
    }
    if (
      [
        "charactersResult",
        "styleResult",
        "thumbnailResult",
        "result",
        "cancelled",
        "error",
        "charactersUnavailable",
      ].includes(response.type)
    )
      inFlightAtlases.delete(response.requestId);
    if (["thumbnailResult", "cancelled", "error"].includes(response.type))
      thumbnailRequests.delete(response.requestId);
    // Fatal errors belong to this connection, even after a local abort removed
    // their waiter. The listener already rejected stale worker generations.
    if (
      response.type === "error" &&
      (response.error.code === "WorkerFailure" ||
        (response.error.code === "CapabilityUnavailable" &&
          !("jobId" in response && styleRequests.has(response.requestId))))
    ) {
      fail(
        new RenderError(
          response.error.code,
          response.error.message,
          response.error.recoverable,
        ),
      );
      return;
    }
    if (
      ["error", "cancelled", "styleResult", "thumbnailResult"].includes(
        response.type,
      )
    )
      styleRequests.delete(response.requestId);
    const waiter = waiters.get(response.requestId);
    if (!waiter) return;
    const request = waiter.message;
    if (
      waiter.aborted &&
      ["thumbnailResult", "cancelled", "error"].includes(response.type)
    ) {
      settle(
        response.requestId,
        new RenderError("Cancelled", "Render cancelled"),
      );
      return;
    }
    if ("jobId" in request) {
      if (
        !("jobId" in response) ||
        response.jobId === undefined ||
        !sameRenderIdentity(request, response as RenderResult)
      )
        return;
    } else if (response.type === "error" && "jobId" in response) return;
    if (
      response.type === "error" ||
      response.type === "charactersUnavailable"
    ) {
      const error = new RenderError(
        response.error.code,
        response.error.message,
        response.error.recoverable,
      );
      settle(response.requestId, error);
      return;
    }
    if (request.type === "initialize" && response.type === "ready")
      settle(response.requestId, undefined, response);
    else if (
      request.type === "setSource" &&
      response.type === "accepted" &&
      response.operation === "setSource" &&
      response.sourceId === request.source.id &&
      response.sourceRevision === request.source.revision
    )
      settle(response.requestId, undefined, response);
    else if (
      (request.type === "setCalibration" || request.type === "setAtlas") &&
      response.type === "accepted" &&
      response.operation === request.type &&
      response.calibrationId ===
        (request.type === "setAtlas"
          ? request.atlas.calibration.id
          : request.calibration.id)
    )
      settle(response.requestId, undefined, response);
    else if (
      (request.type === "renderPreview" ||
        request.type === "renderExport" ||
        request.type === "renderCharactersPreview" ||
        request.type === "renderCharactersExport" ||
        request.type === "renderStylePreview" ||
        request.type === "renderStyleExport" ||
        request.type === "renderThumbnail") &&
      response.type === "cancelled"
    )
      settle(
        response.requestId,
        new RenderError("Cancelled", "Render cancelled"),
      );
    else if (
      request.type === "renderThumbnail" &&
      response.type === "thumbnailResult"
    ) {
      const expectedStyle =
        request.profile.kind === "characters"
          ? "characters"
          : request.profile.settings.styleId;
      if (
        response.styleId !== expectedStyle ||
        response.frame.width > request.maxSide ||
        response.frame.height > request.maxSide
      ) {
        fail(
          new RenderError(
            "WorkerFailure",
            "Thumbnail result identity or size mismatch",
          ),
        );
        return;
      }
      settle(response.requestId, undefined, response);
    } else if (
      (request.type === "renderStylePreview" ||
        request.type === "renderStyleExport") &&
      response.type === "styleResult"
    ) {
      try {
        if (response.styleId !== request.styleId)
          throw new Error("Style result identity mismatch");
        validateStyleFrame(response.frame, request.settings);
      } catch {
        fail(
          new RenderError(
            "WorkerFailure",
            "Worker style frame does not match requested style/settings",
          ),
        );
        return;
      }
      settle(response.requestId, undefined, response);
    } else if (
      (request.type === "renderCharactersPreview" ||
        request.type === "renderCharactersExport") &&
      response.type === "charactersResult"
    ) {
      try {
        if (
          !retainedSource ||
          !waiter.atlas ||
          retainedSource.id !== request.sourceId ||
          retainedSource.revision !== request.sourceRevision ||
          waiter.atlas.calibration.id !== request.calibrationId
        )
          throw new Error("Characters retained identity mismatch");
        const source = {
          id: retainedSource.id,
          revision: retainedSource.revision,
          width: retainedSource.width,
          height: retainedSource.height,
        };
        validateReferenceCharactersFrame(
          response.frame,
          request.settings,
          waiter.atlas,
          source,
        );
      } catch {
        fail(
          new RenderError(
            "WorkerFailure",
            "Worker Characters frame does not match retained source, settings or atlas",
          ),
        );
        return;
      }
      settle(response.requestId, undefined, response);
    } else if (
      (request.type === "renderPreview" || request.type === "renderExport") &&
      response.type === "result"
    ) {
      const grid = response.grid,
        s = request.settings;
      if (
        grid.width !== s.width ||
        grid.height !== s.height ||
        grid.cellWidth !== s.cellWidth ||
        grid.cellHeight !== s.cellHeight ||
        grid.calibrationId !== request.calibrationId
      ) {
        fail(
          new RenderError(
            "WorkerFailure",
            "Worker grid does not match requested geometry or calibration",
          ),
        );
        return;
      }
      settle(response.requestId, undefined, response);
    }
  }
  function send(
    message: WorkerRequest,
    transfer: Transferable[] = [],
    signal?: AbortSignal,
  ): Promise<WorkerResponse> {
    alive();
    validateWorkerRequest(message);
    const current = connection;
    if (!current)
      return Promise.reject(
        new RenderError(
          "WorkerFailure",
          "Worker is unavailable; retry initialization",
        ),
      );
    if (signal?.aborted)
      return Promise.reject(new RenderError("Cancelled", "Render cancelled"));
    return new Promise((resolve, reject) => {
      const abort = () => {
        if (message.type === "renderThumbnail") {
          const waiter = waiters.get(message.requestId);
          if (waiter) waiter.aborted = true;
        } else {
          settle(
            message.requestId,
            new RenderError("Cancelled", "Render cancelled"),
          );
        }
        if (connection !== current || !("jobId" in message)) return;
        try {
          current.worker.postMessage({
            ...envelope(),
            type: "cancel",
            targetRequestId: message.requestId,
            ...renderIdentity(message),
          } satisfies WorkerRequest);
        } catch {
          fail(
            new RenderError("WorkerFailure", "Cannot send worker cancellation"),
          );
        }
      };
      if (
        message.type === "renderStylePreview" ||
        message.type === "renderStyleExport"
      )
        styleRequests.add(message.requestId);
      if (message.type === "renderThumbnail")
        styleRequests.add(message.requestId);
      if (message.type === "renderThumbnail")
        thumbnailRequests.add(message.requestId);
      waiters.set(message.requestId, {
        message,
        ...(message.type === "renderCharactersPreview" ||
        message.type === "renderCharactersExport" ||
        (message.type === "renderThumbnail" &&
          (message.profile.kind === "characters" ||
            message.profile.settings.styleId === "braille")) ||
        ((message.type === "renderStylePreview" ||
          message.type === "renderStyleExport") &&
          message.settings.styleId === "braille")
          ? { atlas: retainedAtlas }
          : {}),
        resolve,
        reject,
        cleanup: () => signal?.removeEventListener("abort", abort),
      });
      if (
        (message.type === "renderCharactersPreview" ||
          message.type === "renderCharactersExport" ||
          (message.type === "renderThumbnail" &&
            (message.profile.kind === "characters" ||
              message.profile.settings.styleId === "braille")) ||
          ((message.type === "renderStylePreview" ||
            message.type === "renderStyleExport") &&
            message.settings.styleId === "braille")) &&
        retainedAtlas
      )
        inFlightAtlases.set(message.requestId, {
          calibrationId: retainedAtlas.calibration.id,
          backingBytes: atlasBackings(retainedAtlas),
        });
      signal?.addEventListener("abort", abort, { once: true });
      try {
        current.worker.postMessage(message, transfer);
      } catch {
        fail(new RenderError("WorkerFailure", "Cannot send worker request"));
      }
    });
  }
  function uploadSource(source: SourceUpload) {
    const transfer = copySource(source);
    return send({ ...envelope(), type: "setSource", source: transfer }, [
      transfer.rgba.buffer,
    ]);
  }
  function uploadCalibration(calibration: GlyphCalibrationV1) {
    const transfer = copyCalibration(calibration);
    return send(
      { ...envelope(), type: "setCalibration", calibration: transfer },
      [transfer.masks.buffer, transfer.coverage.buffer, transfer.shapes.buffer],
    );
  }
  function uploadAtlas(atlas: ReferenceCharacterAtlasV1) {
    const transfer = {
        ...atlas,
        calibration: copyCalibration(atlas.calibration),
      },
      c = transfer.calibration;
    return send({ ...envelope(), type: "setAtlas", atlas: transfer }, [
      c.masks.buffer,
      c.coverage.buffer,
      c.shapes.buffer,
    ]);
  }
  async function initialize(): Promise<void> {
    alive();
    if (state === "ready") return;
    if (initialization) return initialization;
    // Assign before any asynchronous boundary; all concurrent callers share one attempt.
    const attempt = async () => {
      state = "initializing";
      notifyStatus();
      styleProfileVersion = null;
      thumbnailProfileVersion = null;
      supportedStyleIds = Object.freeze([]);
      charactersProfileVersion = null;
      charactersContextVersion = null;
      styleContextVersion = null;
      charactersAtlasRetentionVersion = null;
      try {
        validateWorkerRequest({
          ...envelope(),
          type: "initialize",
          memoryBudgetBytes,
        });
        const worker = factory();
        const current: Connection = {
          worker,
          message: (event) => {
            if (connection === current) handle(event.data);
          },
          failure: () => {
            if (connection === current)
              fail(new RenderError("WorkerFailure", "Render worker failed"));
          },
        };
        connection = current;
        worker.addEventListener("message", current.message);
        worker.addEventListener("error", current.failure);
        worker.addEventListener("messageerror", current.failure);
        const ready = await send({
          ...envelope(),
          type: "initialize",
          memoryBudgetBytes,
        });
        if (ready.type !== "ready")
          throw new RenderError("WorkerFailure", "Worker did not initialize");
        styleProfileVersion = ready.styleProfileVersion ?? null;
        thumbnailProfileVersion = ready.thumbnailProfileVersion ?? null;
        supportedStyleIds = Object.freeze([...(ready.supportedStyleIds ?? [])]);
        charactersProfileVersion = ready.charactersProfileVersion ?? null;
        charactersContextVersion = ready.charactersContextVersion ?? null;
        styleContextVersion = ready.styleContextVersion ?? null;
        charactersAtlasRetentionVersion =
          ready.charactersAtlasRetentionVersion ?? null;
        alive();
        if (retainedSource) await uploadSource(retainedSource);
        if (retainedAtlas) await uploadAtlas(retainedAtlas);
        else if (retainedCalibration)
          await uploadCalibration(retainedCalibration);
        alive();
        state = "ready";
        notifyStatus();
      } catch (cause) {
        const error =
          cause instanceof RenderError
            ? cause
            : new RenderError(
                "CapabilityUnavailable",
                cause instanceof Error
                  ? cause.message
                  : "Render worker unavailable",
              );
        if (!isDisposed()) fail(error);
        throw error;
      }
    };
    initialization = attempt();
    try {
      await initialization;
    } finally {
      initialization = undefined;
    }
  }
  function enqueueInput<T>(operation: () => Promise<T>): Promise<T> {
    const epoch = failureEpoch;
    const pending = inputQueue.then(() => {
      alive();
      if (epoch !== failureEpoch) throw lastFailure!;
      return operation();
    });
    inputQueue = pending.then(
      () => {},
      () => {},
    );
    return pending;
  }
  async function render(
    type: "renderPreview" | "renderExport",
    request: RenderRequest,
    signal?: AbortSignal,
  ): Promise<RenderResult> {
    alive();
    validateRenderRequest(request, type);
    const message = {
      ...envelope(),
      type,
      ...request,
      settings: {
        ...request.settings,
        crop: { ...request.settings.crop },
        ...("styleContext" in request.settings && request.settings.styleContext
          ? { styleContext: { ...request.settings.styleContext } }
          : {}),
      },
    };
    validateWorkerRequest(message);
    await initialize();
    const response = await send(message, [], signal);
    if (response.type !== "result")
      throw new RenderError("WorkerFailure", "Worker did not return a grid");
    const { grid, backend, timings } = response;
    return { ...renderIdentity(response), grid, backend, timings };
  }
  async function renderCharacters(
    type: CharactersRenderType,
    request: CharactersRenderRequest,
    signal?: AbortSignal,
    capturedAtlas?: ReferenceCharacterAtlasV1,
  ): Promise<CharactersRenderResult> {
    alive();
    validateCharactersRenderRequest(request, type);
    const message = {
      ...envelope(),
      ...request,
      type,
      source: { ...request.source },
      settings: {
        ...request.settings,
        crop: { ...request.settings.crop },
        ...("styleContext" in request.settings && request.settings.styleContext
          ? { styleContext: { ...request.settings.styleContext } }
          : {}),
      },
    };
    const atlasSnapshot = capturedAtlas
      ? snapshotAtlas(capturedAtlas)
      : undefined;
    const releasePendingAtlas = atlasSnapshot
      ? pendingAtlas(atlasSnapshot)
      : undefined;
    try {
      if (atlasSnapshot)
        validateWorkerRequest({
          ...envelope(),
          type: "setAtlas",
          atlas: atlasSnapshot,
        });
      const { response: pendingResponse } = await enqueueInput(async () => {
        await initialize();
        if (atlasSnapshot) await selectAtlas(atlasSnapshot);
        if (
          !retainedSource ||
          retainedSource.id !== message.sourceId ||
          retainedSource.revision !== message.sourceRevision
        )
          throw new RenderError(
            "MissingSource",
            "Requested Characters source is not retained",
          );
        const source = {
          id: retainedSource.id,
          revision: retainedSource.revision,
          width: retainedSource.width,
          height: retainedSource.height,
        };
        if (
          message.source.width !== source.width ||
          message.source.height !== source.height
        )
          throw new RenderError(
            "InvalidInput",
            "Characters retained source geometry mismatch",
          );
        try {
          validateReferenceCharactersSettings(
            message.settings,
            source,
            memoryBudgetBytes,
          );
        } catch (cause) {
          throw new RenderError(
            "InvalidInput",
            cause instanceof Error
              ? cause.message
              : "Invalid Characters settings",
          );
        }
        if (
          (message.settings.styleContext && styleContextVersion !== 1) ||
          (message.settings.backdrop !== "none" &&
            charactersContextVersion !== 1)
        )
          throw new RenderError(
            "CapabilityUnavailable",
            "Complete Characters context version1 is unavailable",
          );
        if (
          !retainedAtlas ||
          retainedAtlas.calibration.id !== message.calibrationId
        )
          throw new RenderError(
            "MissingCalibration",
            "Requested Characters atlas is not selected",
          );
        return { response: send(message, [], signal) };
      });
      const response = await pendingResponse;
      if (response.type !== "charactersResult")
        throw new RenderError(
          "WorkerFailure",
          "Worker did not return a Characters frame",
        );
      return {
        ...renderIdentity(response),
        frame: response.frame,
        backend: response.backend,
        timings: response.timings,
      };
    } finally {
      releasePendingAtlas?.();
    }
  }
  async function renderStyle(
    type: StyleRenderType,
    request: StyleRenderRequest,
    signal?: AbortSignal,
    capturedAtlas?: ReferenceCharacterAtlasV1,
  ): Promise<StyleRenderResult> {
    alive();
    validateStyleRenderRequest(request, type);
    const settings = validateStyleSettings(request.settings, request.source);
    const message = {
      ...envelope(),
      ...request,
      type,
      source: { ...request.source },
      settings,
    };
    const usesAtlas = settings.styleId === "braille";
    if (!usesAtlas && capturedAtlas)
      throw new RenderError(
        "InvalidInput",
        "Raster style cannot capture atlas",
      );
    const capture =
      usesAtlas && capturedAtlas ? snapshotAtlas(capturedAtlas) : undefined;
    const releasePendingAtlas = capture ? pendingAtlas(capture) : undefined;
    try {
      const { response: pending } = await enqueueInput(async () => {
        await initialize();
        if (
          (settings.styleContext && styleContextVersion !== 1) ||
          styleProfileVersion !== 1 ||
          !supportedStyleIds.includes(message.styleId)
        )
          throw new RenderError(
            "CapabilityUnavailable",
            "Style is unsupported by native renderer",
          );
        if (
          !retainedSource ||
          retainedSource.id !== message.sourceId ||
          retainedSource.revision !== message.sourceRevision
        )
          throw new RenderError(
            "MissingSource",
            "Style source is not retained",
          );
        if (
          retainedSource.width !== message.source.width ||
          retainedSource.height !== message.source.height
        )
          throw new RenderError(
            "InvalidInput",
            "Style retained source geometry mismatch",
          );
        const exactAtlas = capture ?? retainedAtlas;
        if (
          usesAtlas &&
          (!exactAtlas || exactAtlas.calibration.id !== message.calibrationId)
        )
          throw new RenderError(
            "MissingCalibration",
            "Style requires exact captured atlas",
          );
        try {
          encodeStyleSettings(
            settings,
            message.source,
            usesAtlas ? exactAtlas : undefined,
          );
        } catch (cause) {
          throw new RenderError(
            "InvalidInput",
            cause instanceof Error ? cause.message : "Invalid style resource",
          );
        }
        if (capture) await selectAtlas(capture);
        return { response: send(message, [], signal) };
      });
      const response = await pending;
      if (response.type !== "styleResult")
        throw new RenderError(
          "WorkerFailure",
          "Worker did not return style frame",
        );
      return {
        ...renderIdentity(response),
        styleId: response.styleId,
        frame: response.frame,
        backend: response.backend,
        timings: response.timings,
      };
    } finally {
      releasePendingAtlas?.();
    }
  }
  async function renderThumbnail(
    request: ThumbnailRenderRequest,
    signal?: AbortSignal,
    capturedAtlas?: ReferenceCharacterAtlasV1,
  ): Promise<ThumbnailRenderResult> {
    alive();
    const message = {
      ...envelope(),
      ...request,
      type: "renderThumbnail" as const,
      source: { ...request.source },
      profile:
        request.profile.kind === "characters"
          ? {
              kind: "characters" as const,
              settings: {
                ...request.profile.settings,
                crop: { ...request.profile.settings.crop },
                ...(request.profile.settings.styleContext
                  ? {
                      styleContext: {
                        ...request.profile.settings.styleContext,
                      },
                    }
                  : {}),
              },
            }
          : {
              kind: "style" as const,
              settings: {
                ...request.profile.settings,
                crop: { ...request.profile.settings.crop },
                ...(request.profile.settings.styleContext
                  ? {
                      styleContext: {
                        ...request.profile.settings.styleContext,
                      },
                    }
                  : {}),
                parameters: { ...request.profile.settings.parameters },
              },
            },
    };
    validateWorkerRequest(message);
    const needsAtlas =
      message.profile.kind === "characters" ||
      message.profile.settings.styleId === "braille";
    if (!needsAtlas && capturedAtlas)
      throw new RenderError(
        "InvalidInput",
        "Raster thumbnail cannot capture atlas",
      );
    const capture =
      needsAtlas && capturedAtlas ? snapshotAtlas(capturedAtlas) : undefined;
    const releasePendingAtlas = capture ? pendingAtlas(capture) : undefined;
    try {
      const { response: pending } = await enqueueInput(async () => {
        if (highPriorityRequests)
          throw new RenderError(
            "Cancelled",
            "Higher-priority render is queued",
          );
        await initialize();
        if (message.profile.settings.styleContext && styleContextVersion !== 1)
          throw new RenderError(
            "CapabilityUnavailable",
            "Style context controls unavailable",
          );
        if (thumbnailProfileVersion !== 1)
          throw new RenderError(
            "CapabilityUnavailable",
            "Native thumbnail conversion is unavailable",
          );
        if (
          !retainedSource ||
          retainedSource.id !== message.sourceId ||
          retainedSource.revision !== message.sourceRevision
        )
          throw new RenderError(
            "MissingSource",
            "Thumbnail source is not retained",
          );
        if (
          retainedSource.width !== message.source.width ||
          retainedSource.height !== message.source.height
        )
          throw new RenderError(
            "InvalidInput",
            "Thumbnail source geometry mismatch",
          );
        const styleId =
          message.profile.kind === "characters"
            ? "characters"
            : message.profile.settings.styleId;
        if (
          styleId === "characters"
            ? charactersProfileVersion !== 1
            : styleProfileVersion !== 1 || !supportedStyleIds.includes(styleId)
        )
          throw new RenderError(
            "CapabilityUnavailable",
            "Thumbnail profile is unavailable",
          );
        const exactAtlas = capture ?? retainedAtlas;
        if (
          needsAtlas &&
          (!exactAtlas || exactAtlas.calibration.id !== message.calibrationId)
        )
          throw new RenderError(
            "MissingCalibration",
            "Thumbnail requires exact atlas",
          );
        if (message.profile.kind === "style")
          encodeStyleSettings(
            message.profile.settings,
            message.source,
            needsAtlas ? exactAtlas : undefined,
          );
        if (capture) await selectAtlas(capture);
        return { response: send(message, [], signal) };
      });
      const response = await pending;
      if (response.type !== "thumbnailResult")
        throw new RenderError(
          "WorkerFailure",
          "Worker did not return thumbnail",
        );
      return {
        ...renderIdentity(response),
        styleId: response.styleId,
        frame: response.frame,
        backend: response.backend,
        timings: response.timings,
      };
    } finally {
      releasePendingAtlas?.();
    }
  }
  async function selectAtlas(atlas: ReferenceCharacterAtlasV1): Promise<void> {
    await initialize();
    if (retainedAtlas?.calibration.id === atlas.calibration.id) {
      if (atlasIdentityKey(retainedAtlas) !== atlasIdentityKey(atlas))
        throw new RenderError(
          "InvalidInput",
          "Atlas metadata requires a new identity",
        );
      return;
    }
    if (
      retainedCalibration?.id === atlas.calibration.id &&
      calibrationIdentityKey(retainedCalibration) !==
        calibrationIdentityKey(atlas.calibration)
    )
      throw new RenderError(
        "InvalidInput",
        "Atlas calibration requires a new identity",
      );
    await uploadAtlas(atlas);
    alive();
    retainedAtlas = atlas;
    retainedCalibration = undefined;
  }
  return {
    subscribeStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    get atlasResourceUsage() {
      return {
        selected: retainedAtlas
          ? {
              calibrationId: retainedAtlas.calibration.id,
              backingBytes: atlasBackings(retainedAtlas),
            }
          : null,
        inFlight: [
          ...inFlightAtlases.values(),
          ...pendingAtlasInputs.values(),
        ].map((entry) => ({ ...entry })),
      };
    },
    get styleProfileVersion() {
      return state === "ready" ? styleProfileVersion : null;
    },
    get thumbnailProfileVersion() {
      return state === "ready" ? thumbnailProfileVersion : null;
    },
    get thumbnailResourceUsage() {
      return { inFlight: thumbnailRequests.size > 0 };
    },
    get highPriorityBusy() {
      return highPriorityRequests > 0;
    },
    renderThumbnail,
    get supportedStyleIds() {
      return state === "ready" ? supportedStyleIds : Object.freeze([]);
    },
    renderStylePreview: (request, signal, atlas) =>
      highPriority(() =>
        renderStyle("renderStylePreview", request, signal, atlas),
      ),
    renderStyleExport: (request, signal, atlas) =>
      highPriority(() =>
        renderStyle("renderStyleExport", request, signal, atlas),
      ),
    get charactersProfileVersion() {
      return state === "ready" ? charactersProfileVersion : null;
    },
    get charactersAtlasRetentionVersion() {
      return state === "ready" ? charactersAtlasRetentionVersion : null;
    },
    get styleContextVersion() {
      return state === "ready" ? styleContextVersion : null;
    },
    get charactersContextVersion() {
      return state === "ready" ? charactersContextVersion : null;
    },
    get state() {
      return state;
    },
    initialize,
    setSource(source) {
      let snapshot: SourceUpload;
      try {
        alive();
        validateWorkerRequest({ ...envelope(), type: "setSource", source });
        snapshot = copySource(source);
      } catch (cause) {
        return Promise.reject(cause);
      }
      return enqueueInput(async () => {
        await initialize();
        if (
          retainedSource?.id === snapshot.id &&
          retainedSource.revision === snapshot.revision
        ) {
          if (
            snapshot.width !== retainedSource.width ||
            snapshot.height !== retainedSource.height
          )
            throw new RenderError(
              "InvalidInput",
              "Source geometry requires a new revision",
            );
          return;
        }
        await uploadSource(snapshot);
        alive();
        retainedSource = snapshot;
      });
    },
    setCalibration(calibration) {
      let snapshot: GlyphCalibrationV1;
      try {
        alive();
        validateWorkerRequest({
          ...envelope(),
          type: "setCalibration",
          calibration,
        });
        snapshot = copyCalibration(calibration);
      } catch (cause) {
        return Promise.reject(cause);
      }
      return enqueueInput(async () => {
        await initialize();
        if (retainedAtlas?.calibration.id === snapshot.id) {
          if (
            calibrationIdentityKey(retainedAtlas.calibration) !==
            calibrationIdentityKey(snapshot)
          )
            throw new RenderError(
              "InvalidInput",
              "Calibration metadata requires a new identity",
            );
          return;
        }
        if (retainedCalibration?.id === snapshot.id) {
          if (
            calibrationIdentityKey(snapshot) !==
            calibrationIdentityKey(retainedCalibration)
          )
            throw new RenderError(
              "InvalidInput",
              "Calibration metadata requires a new identity",
            );
          return;
        }
        await uploadCalibration(snapshot);
        alive();
        retainedCalibration = snapshot;
        retainedAtlas = undefined;
      });
    },
    setAtlas(atlas) {
      let snapshot: ReferenceCharacterAtlasV1;
      try {
        alive();
        snapshot = snapshotAtlas(atlas);
      } catch (cause) {
        return Promise.reject(cause);
      }
      const releasePendingAtlas = pendingAtlas(snapshot);
      return enqueueInput(() => selectAtlas(snapshot)).finally(
        releasePendingAtlas,
      );
    },
    renderCharactersPreview: (request, signal, atlas) =>
      highPriority(() =>
        renderCharacters("renderCharactersPreview", request, signal, atlas),
      ),
    renderCharactersExport: (request, signal, atlas) =>
      highPriority(() =>
        renderCharacters("renderCharactersExport", request, signal, atlas),
      ),
    renderPreview: (request, signal) =>
      highPriority(() => render("renderPreview", request, signal)),
    renderExport: (request, signal) =>
      highPriority(() => render("renderExport", request, signal)),
    async dispose() {
      if (state === "disposed") return;
      state = "disposed";
      notifyStatus();
      statusListeners.clear();
      for (const id of [...waiters.keys()]) settle(id, disposedError());
      try {
        connection?.worker.postMessage({
          ...envelope(),
          type: "dispose",
        } satisfies WorkerRequest);
      } catch {
        /* Termination still settles an unresponsive worker. */
      }
      detach();
      retainedSource = undefined;
      retainedCalibration = undefined;
      retainedAtlas = undefined;
      atlasSnapshots = new WeakMap();
    },
  };
}
