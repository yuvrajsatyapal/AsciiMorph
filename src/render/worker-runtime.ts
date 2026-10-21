import {
  RenderError,
  calibrationIdentityKey,
  renderIdentity,
  sameRenderIdentity,
  validateWorkerRequest,
  type RenderIdentity,
  type WorkerRequest,
  type WorkerResponse,
} from "./protocol";
import type { CharacterEngine } from "./wasm-character";

type RenderMessage = Extract<
  WorkerRequest,
  { type: "renderPreview" | "renderExport" }
>;
interface Task {
  message: RenderMessage;
  queuedAt: number;
  startedAt?: number;
  handle?: number;
  slices: number;
}
export interface WorkerRuntimeOptions {
  createEngine(memoryBudgetBytes: number): Promise<CharacterEngine>;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}
/** A worker-local scheduler. Every numeric slice yields through a macrotask. */
export function createWorkerRuntime(options: WorkerRuntimeOptions) {
  let engine: CharacterEngine | undefined;
  let loading: Promise<void> | undefined;
  let budget: number | undefined;
  let disposed = false;
  let failure: RenderError | undefined;
  let source:
    | { id: string; revision: number; width: number; height: number }
    | undefined;
  let calibration:
    | { id: string; key: string; cellWidth: number; cellHeight: number }
    | undefined;
  let preview: Task | undefined;
  let exporting: Task | undefined;
  let pendingExport: Task | undefined;
  let lastLane: "preview" | "export" = "export";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const now = () => performance.now();
  const envelope = (requestId: string) => ({ version: 1 as const, requestId });
  const tasks = () =>
    [preview, exporting, pendingExport].filter((t): t is Task => !!t);
  function error(requestId: string, cause: unknown, identity?: RenderIdentity) {
    const e =
      cause instanceof RenderError
        ? cause
        : new RenderError(
            "WorkerFailure",
            cause instanceof Error ? cause.message : "Worker operation failed",
          );
    options.postMessage({
      ...envelope(requestId),
      type: "error",
      ...(identity ? renderIdentity(identity) : {}),
      error: { code: e.code, message: e.message, recoverable: e.recoverable },
    });
  }
  function remove(task: Task) {
    if (preview === task) preview = undefined;
    if (pendingExport === task) pendingExport = undefined;
    if (exporting === task) {
      exporting = pendingExport;
      pendingExport = undefined;
    }
  }
  /** A failed engine is terminal for this worker; only a new worker may recover. */
  function fatal(requestId: string, cause: unknown, identity?: RenderIdentity) {
    if (failure) return;
    failure = new RenderError(
      "WorkerFailure",
      cause instanceof Error ? cause.message : "Worker engine failed",
    );
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const outstanding = tasks();
    preview = undefined;
    exporting = undefined;
    pendingExport = undefined;
    const failedEngine = engine;
    engine = undefined;
    source = undefined;
    calibration = undefined;
    try {
      failedEngine?.dispose();
    } catch {
      /* The worker must stop even if engine disposal traps. */
    }
    error(requestId, failure, identity);
    for (const task of outstanding)
      if (task.message.requestId !== requestId)
        error(task.message.requestId, failure, task.message);
  }
  /** Used after successful uploads, which already invalidate numeric handles. */
  function settleCancelled(task: Task) {
    remove(task);
    options.postMessage({
      ...envelope(task.message.requestId),
      type: "cancelled",
      ...renderIdentity(task.message),
    });
  }
  function cancel(task: Task) {
    if (task.handle !== undefined) {
      try {
        engine!.cancel(task.handle);
      } catch (cause) {
        fatal(task.message.requestId, cause, task.message);
        throw failure;
      }
    }
    settleCancelled(task);
  }
  function wake() {
    if (!disposed && !failure && timer === undefined && (preview || exporting))
      timer = setTimeout(runSlice, 0);
  }
  function runSlice() {
    timer = undefined;
    if (disposed || !engine) return;
    const lane =
      preview && exporting
        ? lastLane === "preview"
          ? "export"
          : "preview"
        : preview
          ? "preview"
          : "export";
    const task = lane === "preview" ? preview : exporting;
    if (!task) return;
    lastLane = lane;
    const m = task.message;
    try {
      if (task.handle === undefined) {
        task.startedAt = now();
        task.handle = engine.begin(m.settings);
      }
      const status = engine.step(task.handle, 4096);
      task.slices++;
      if (status === "complete") {
        const readbackAt = now();
        const handle = task.handle;
        // takeGrid owns release, including its failure path; don't cancel a
        // numeric handle that its readback already dropped.
        task.handle = undefined;
        const grid = engine.takeGrid(handle);
        const finishedAt = now();
        remove(task);
        options.postMessage(
          {
            ...envelope(m.requestId),
            type: "result",
            ...renderIdentity(m),
            grid,
            backend: "rust-cpu",
            timings: {
              queueMs: task.startedAt! - task.queuedAt,
              computeMs: readbackAt - task.startedAt!,
              readbackMs: finishedAt - readbackAt,
              totalMs: finishedAt - task.queuedAt,
            },
          },
          [
            grid.glyphIndices.buffer,
            grid.foreground.buffer,
            grid.background.buffer,
            grid.alpha.buffer,
          ] as ArrayBuffer[],
        );
      } else if (status === "cancelled") cancel(task);
      else
        options.postMessage({
          ...envelope(m.requestId),
          type: "progress",
          ...renderIdentity(m),
          phase: "compute",
          elapsedMs: now() - task.startedAt!,
          slices: task.slices,
        });
    } catch (cause) {
      if (failure) return;
      if (
        !(cause instanceof RenderError) ||
        cause.code === "WorkerFailure" ||
        cause.code === "CapabilityUnavailable"
      ) {
        fatal(m.requestId, cause, m);
        return;
      }
      if (task.handle !== undefined) {
        try {
          engine.cancel(task.handle);
        } catch (cleanupCause) {
          fatal(m.requestId, cleanupCause, m);
          return;
        }
      }
      remove(task);
      error(m.requestId, cause, m);
    }
    wake();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    for (const task of tasks()) settleCancelled(task);
    const ownedEngine = engine;
    engine = undefined;
    try {
      ownedEngine?.dispose();
    } catch {
      /* Disposal still settles a failed engine. */
    }
    source = undefined;
    calibration = undefined;
  }
  function receive(value: unknown) {
    let m: WorkerRequest;
    try {
      m = validateWorkerRequest(value);
    } catch (cause) {
      const id =
        value &&
        typeof value === "object" &&
        "requestId" in value &&
        typeof value.requestId === "string" &&
        value.requestId.trim()
          ? value.requestId
          : "invalid-request";
      error(id, cause);
      return;
    }
    try {
      if (m.type === "dispose") {
        dispose();
        options.postMessage({ ...envelope(m.requestId), type: "disposed" });
        return;
      }
      if (disposed)
        throw new RenderError("Disposed", "Render worker disposed", false);
      if (failure) throw failure;
      if (m.type === "initialize") {
        if (budget !== undefined && budget !== m.memoryBudgetBytes)
          throw new RenderError(
            "InvalidInput",
            "Worker already initialized with another budget",
          );
        if (!loading) {
          budget = m.memoryBudgetBytes;
          loading = options.createEngine(budget).then((created) => {
            if (disposed) created.dispose();
            else engine = created;
          });
        }
        void loading.then(
          () => {
            if (!disposed)
              options.postMessage({ ...envelope(m.requestId), type: "ready" });
          },
          (cause) => {
            if (!disposed)
              error(
                m.requestId,
                cause instanceof RenderError
                  ? cause
                  : new RenderError(
                      "CapabilityUnavailable",
                      cause instanceof Error
                        ? cause.message
                        : "WASM engine unavailable",
                    ),
              );
          },
        );
        return;
      }
      if (!engine)
        throw new RenderError(
          "CapabilityUnavailable",
          "Initialize the worker before rendering",
        );
      if (m.type === "setSource") {
        const s = m.source;
        if (
          source &&
          s.id === source.id &&
          s.revision === source.revision &&
          (s.width !== source.width || s.height !== source.height)
        )
          throw new RenderError(
            "InvalidInput",
            "Source revision changed geometry without advancing revision",
          );
        if (!source || s.id !== source.id || s.revision !== source.revision) {
          if (s.rgba.byteLength > budget!)
            throw new RenderError(
              "BudgetExceeded",
              "Source exceeds session memory budget",
            );
          engine.setSource(s);
          for (const task of tasks()) settleCancelled(task);
          source = {
            id: s.id,
            revision: s.revision,
            width: s.width,
            height: s.height,
          };
        }
        options.postMessage({
          ...envelope(m.requestId),
          type: "accepted",
          operation: "setSource",
          sourceId: s.id,
          sourceRevision: s.revision,
        });
        return;
      }
      if (m.type === "setCalibration") {
        const c = m.calibration;
        if (!calibration || calibration.id !== c.id) {
          engine.setCalibration(c);
          for (const task of tasks())
            if (task.message.settings.mapping === "glyph")
              settleCancelled(task);
          calibration = {
            id: c.id,
            key: calibrationIdentityKey(c),
            cellWidth: c.cellWidth,
            cellHeight: c.cellHeight,
          };
        } else if (calibration.key !== calibrationIdentityKey(c))
          throw new RenderError(
            "InvalidInput",
            "Calibration identity changed geometry",
          );
        options.postMessage({
          ...envelope(m.requestId),
          type: "accepted",
          operation: "setCalibration",
          calibrationId: c.id,
        });
        return;
      }
      if (m.type === "cancel") {
        const task = tasks().find(
          (t) => t.message.requestId === m.targetRequestId,
        );
        if (task && !sameRenderIdentity(task.message, m))
          throw new RenderError(
            "InvalidInput",
            "Cancellation identity mismatch",
          );
        if (task) cancel(task);
        return;
      }
      if (
        !source ||
        m.sourceId !== source.id ||
        m.sourceRevision !== source.revision
      )
        throw new RenderError(
          "MissingSource",
          "Requested source identity is not uploaded",
        );
      if (
        m.settings.mapping === "glyph" &&
        (!calibration ||
          m.calibrationId !== calibration.id ||
          m.settings.cellWidth !== calibration.cellWidth ||
          m.settings.cellHeight !== calibration.cellHeight)
      )
        throw new RenderError(
          "MissingCalibration",
          "Requested calibration identity or geometry is not uploaded",
        );
      if (tasks().some((t) => t.message.requestId === m.requestId))
        throw new RenderError(
          "InvalidInput",
          "Duplicate active request identity",
        );
      const task: Task = { message: m, queuedAt: now(), slices: 0 };
      if (m.type === "renderPreview") {
        if (preview) cancel(preview);
        preview = task;
      } else {
        if (exporting && pendingExport)
          throw new RenderError("Busy", "Export queue is full");
        if (exporting) pendingExport = task;
        else exporting = task;
      }
      options.postMessage({
        ...envelope(m.requestId),
        type: "accepted",
        operation: m.type,
        ...renderIdentity(m),
      });
      wake();
    } catch (cause) {
      if (!failure && !(cause instanceof RenderError))
        fatal(m.requestId, cause, "jobId" in m ? m : undefined);
      else error(m.requestId, failure ?? cause, "jobId" in m ? m : undefined);
    }
  }
  return { receive, dispose };
}
