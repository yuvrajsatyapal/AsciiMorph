import {
  DEFAULT_MEMORY_BUDGET_BYTES,
  type GlyphCalibrationV1,
  type SourceUpload,
} from "./character-contract";
import {
  RenderError,
  calibrationIdentityKey,
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

export type { RenderRequest, RenderResult } from "./protocol";
export type RenderServiceState =
  | "idle"
  | "initializing"
  | "ready"
  | "recoverable-error"
  | "disposed";
export interface RenderService {
  readonly state: RenderServiceState;
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
  dispose(): Promise<void>;
}
interface Waiter {
  message: WorkerRequest;
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
  let connection: Connection | undefined;
  let initialization: Promise<void> | undefined;
  let inputQueue: Promise<void> = Promise.resolve();
  let retainedSource: SourceUpload | undefined;
  let retainedCalibration: GlyphCalibrationV1 | undefined;
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
    if (response.type === "error") {
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
      request.type === "setCalibration" &&
      response.type === "accepted" &&
      response.operation === "setCalibration" &&
      response.calibrationId === request.calibration.id
    )
      settle(response.requestId, undefined, response);
    else if (
      (request.type === "renderPreview" || request.type === "renderExport") &&
      response.type === "cancelled"
    )
      settle(
        response.requestId,
        new RenderError("Cancelled", "Render cancelled"),
      );
    else if (
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
  async function initialize(): Promise<void> {
    alive();
    if (state === "ready") return;
    if (initialization) return initialization;
    // Assign before any asynchronous boundary; all concurrent callers share one attempt.
    const attempt = async () => {
      state = "initializing";
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
        await send({ ...envelope(), type: "initialize", memoryBudgetBytes });
        alive();
        if (retainedSource) await uploadSource(retainedSource);
        if (retainedCalibration) await uploadCalibration(retainedCalibration);
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
  function enqueueInput(operation: () => Promise<void>): Promise<void> {
    const epoch = failureEpoch;
    const pending = inputQueue.then(() => {
      alive();
      if (epoch !== failureEpoch) throw lastFailure!;
      return operation();
    });
    inputQueue = pending.catch(() => {});
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
  return {
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
      });
    },
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
    },
  };
}
