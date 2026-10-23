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
  readonly charactersProfileVersion: 1 | null;
  readonly charactersContextVersion: 1 | null;
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
  let charactersProfileVersion: 1 | null = null;
  let charactersContextVersion: 1 | null = null;
  let charactersAtlasRetentionVersion: 1 | null = null;
  let connection: Connection | undefined;
  let initialization: Promise<void> | undefined;
  let inputQueue: Promise<void> = Promise.resolve();
  let retainedSource: SourceUpload | undefined;
  let retainedCalibration: GlyphCalibrationV1 | undefined;
  let retainedAtlas: ReferenceCharacterAtlasV1 | undefined;
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
    // Fatal errors belong to this connection, even after a local abort removed
    // their waiter. The listener already rejected stale worker generations.
    if (
      response.type === "error" &&
      (response.error.code === "WorkerFailure" ||
        response.error.code === "CapabilityUnavailable")
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
    const waiter = waiters.get(response.requestId);
    if (!waiter) return;
    const request = waiter.message;
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
        request.type === "renderCharactersExport") &&
      response.type === "cancelled"
    )
      settle(
        response.requestId,
        new RenderError("Cancelled", "Render cancelled"),
      );
    else if (
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
        settle(
          message.requestId,
          new RenderError("Cancelled", "Render cancelled"),
        );
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
      waiters.set(message.requestId, {
        message,
        ...(message.type === "renderCharactersPreview" ||
        message.type === "renderCharactersExport"
          ? { atlas: retainedAtlas }
          : {}),
        resolve,
        reject,
        cleanup: () => signal?.removeEventListener("abort", abort),
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
      charactersProfileVersion = null;
      charactersContextVersion = null;
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
        charactersProfileVersion = ready.charactersProfileVersion ?? null;
        charactersContextVersion = ready.charactersContextVersion ?? null;
        charactersAtlasRetentionVersion =
          ready.charactersAtlasRetentionVersion ?? null;
        alive();
        if (retainedSource) await uploadSource(retainedSource);
        if (retainedAtlas) await uploadAtlas(retainedAtlas);
        else if (retainedCalibration)
          await uploadCalibration(retainedCalibration);
        alive();
        state = "ready";
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
      settings: { ...request.settings, crop: { ...request.settings.crop } },
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
      settings: { ...request.settings, crop: { ...request.settings.crop } },
    };
    const atlasSnapshot = capturedAtlas
      ? snapshotAtlas(capturedAtlas)
      : undefined;
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
        message.settings.backdrop !== "none" &&
        charactersContextVersion !== 1
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
    get charactersProfileVersion() {
      return state === "ready" ? charactersProfileVersion : null;
    },
    get charactersAtlasRetentionVersion() {
      return state === "ready" ? charactersAtlasRetentionVersion : null;
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
      return enqueueInput(() => selectAtlas(snapshot));
    },
    renderCharactersPreview: (request, signal, atlas) =>
      renderCharacters("renderCharactersPreview", request, signal, atlas),
    renderCharactersExport: (request, signal, atlas) =>
      renderCharacters("renderCharactersExport", request, signal, atlas),
    renderPreview: (request, signal) =>
      render("renderPreview", request, signal),
    renderExport: (request, signal) => render("renderExport", request, signal),
    async dispose() {
      if (state === "disposed") return;
      state = "disposed";
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
