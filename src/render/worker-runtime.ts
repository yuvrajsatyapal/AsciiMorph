import { STYLE_DISPATCH_IDS } from "./style-contract";
import { encodeStyleSettings } from "./style-wire";
import {
  RenderError,
  calibrationIdentityKey,
  atlasIdentityKey,
  renderIdentity,
  sameRenderIdentity,
  validateWorkerRequest,
  type RenderIdentity,
  type WorkerRequest,
  type WorkerResponse,
} from "./protocol";
import {
  createTimerScheduler,
  type MacrotaskScheduler,
} from "./worker-macrotask";
import {
  validateReferenceCharactersSettings,
  type ReferenceCharacterAtlasV1,
} from "./reference-characters";
import type { GlyphCalibrationV1 } from "./character-contract";
import type { CharacterEngine } from "./wasm-character";

type RenderMessage = Extract<
  WorkerRequest,
  {
    type:
      | "renderPreview"
      | "renderExport"
      | "renderCharactersPreview"
      | "renderCharactersExport"
      | "renderStylePreview"
      | "renderStyleExport"
      | "renderThumbnail";
  }
>;
interface Task {
  message: RenderMessage;
  queuedAt: number;
  startedAt?: number;
  handle?: number;
  slices: number;
  atlas?: ReferenceCharacterAtlasV1;
  converting?: boolean;
}
export interface WorkerRuntimeOptions {
  createEngine(memoryBudgetBytes: number): Promise<CharacterEngine>;
  scheduler?: MacrotaskScheduler;
  now?: () => number;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}
/** Worker-local bounded turns: 4ms or 64 numeric steps, then a cancellable macrotask. */
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
  let atlas: ReferenceCharacterAtlasV1 | undefined;
  let atlasKey: string | undefined;
  // Logical latest input validates requests; engine selection may be an old capture.
  let logicalCalibration: GlyphCalibrationV1 | undefined;
  let selectedAtlasKey: string | undefined;
  let selectedCalibrationKey: string | undefined;
  let preview: Task | undefined;
  let exporting: Task | undefined;
  let pendingExport: Task | undefined;
  let thumbnail: Task | undefined;
  let lastLane: "preview" | "export" = "export";
  let cancelTurn: (() => void) | undefined;
  const scheduler = options.scheduler ?? createTimerScheduler();
  const now = options.now ?? (() => performance.now());
  const progressed = new Set<Task>();
  const profile = (
    m: RenderMessage,
  ): m is Extract<
    RenderMessage,
    { type: "renderCharactersPreview" | "renderCharactersExport" }
  > =>
    m.type === "renderCharactersPreview" || m.type === "renderCharactersExport";
  const style = (
    m: RenderMessage,
  ): m is Extract<
    RenderMessage,
    { type: "renderStylePreview" | "renderStyleExport" }
  > => m.type === "renderStylePreview" || m.type === "renderStyleExport";
  const envelope = (requestId: string) => ({ version: 1 as const, requestId });
  const tasks = () =>
    [preview, exporting, pendingExport, thumbnail].filter(
      (t): t is Task => !!t,
    );
  function error(requestId: string, cause: unknown, identity?: RenderIdentity) {
    const e =
      cause instanceof RenderError
        ? cause
        : new RenderError(
            "WorkerFailure",
            cause instanceof Error ? cause.message : "Worker operation failed",
          );
    const payload = {
      code: e.code,
      message: e.message,
      recoverable: e.recoverable,
    };
    if (
      e.code === "CapabilityUnavailable" &&
      identity &&
      "type" in identity &&
      (identity.type === "renderCharactersPreview" ||
        identity.type === "renderCharactersExport")
    )
      options.postMessage({
        ...envelope(requestId),
        type: "charactersUnavailable",
        ...renderIdentity(identity),
        error: payload,
      });
    else
      options.postMessage({
        ...envelope(requestId),
        type: "error",
        ...(identity ? renderIdentity(identity) : {}),
        error: payload,
      });
  }
  function remove(task: Task) {
    if (thumbnail === task) thumbnail = undefined;
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
    cancelTurn?.();
    cancelTurn = undefined;
    scheduler.dispose();
    const outstanding = tasks();
    preview = undefined;
    exporting = undefined;
    pendingExport = undefined;
    thumbnail = undefined;
    const failedEngine = engine;
    engine = undefined;
    source = undefined;
    calibration = undefined;
    atlas = undefined;
    atlasKey = undefined;
    logicalCalibration = undefined;
    selectedAtlasKey = undefined;
    selectedCalibrationKey = undefined;
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
    if (!preview && !exporting && !thumbnail) {
      cancelTurn?.();
      cancelTurn = undefined;
    }
    options.postMessage({
      ...envelope(task.message.requestId),
      type: "cancelled",
      ...renderIdentity(task.message),
    });
  }
  function cancel(task: Task, allowAlreadyInvalidated = false) {
    if (task.handle !== undefined) {
      try {
        engine!.cancel(task.handle);
      } catch (cause) {
        if (
          !(
            allowAlreadyInvalidated &&
            cause instanceof RenderError &&
            cause.code === "InvalidInput"
          )
        ) {
          fatal(task.message.requestId, cause, task.message);
          throw failure;
        }
      }
    }
    settleCancelled(task);
  }
  function settleUploadInvalidations(except?: Task) {
    for (const task of tasks()) {
      if (task === except) continue;
      if (
        task.message.type === "renderThumbnail"
          ? task.message.profile.kind === "characters" &&
            engine!.charactersAtlasRetentionVersion !== 1
          : profile(task.message)
            ? engine!.charactersAtlasRetentionVersion !== 1
            : !style(task.message) && task.message.settings.mapping === "glyph"
      )
        // Setters may deduplicate without invalidating native handles. Release a
        // still-live handle; only an actual upload's already-absent status is safe.
        cancel(task, true);
    }
  }
  function selectAtlas(capture: ReferenceCharacterAtlasV1, except?: Task) {
    const key = atlasIdentityKey(capture);
    if (selectedAtlasKey === key) return;
    engine!.setAtlas(capture);
    selectedAtlasKey = key;
    selectedCalibrationKey = calibrationIdentityKey(capture.calibration);
    // Successful native upload invalidates legacy glyph handles, including those
    // displaced by internal reselection. Settle them before another numeric step.
    settleUploadInvalidations(except);
  }
  function wake() {
    if (
      !disposed &&
      !failure &&
      !cancelTurn &&
      (preview || exporting || thumbnail)
    )
      cancelTurn = scheduler.schedule(runTurn);
  }
  function runTurn() {
    cancelTurn = undefined;
    if (disposed || failure || !engine) return;
    const start = now();
    progressed.clear();
    for (
      let steps = 0;
      steps < 64 && (steps === 0 || now() - start < 4);
      steps++
    ) {
      if (
        disposed ||
        failure ||
        !engine ||
        (!preview && !exporting && !thumbnail)
      )
        break;
      runStep();
    }
    for (const task of progressed) {
      if (!failure && !disposed && tasks().includes(task))
        options.postMessage({
          ...envelope(task.message.requestId),
          type: "progress",
          ...renderIdentity(task.message),
          phase: "compute",
          elapsedMs: now() - task.startedAt!,
          slices: task.slices,
        });
    }
    progressed.clear();
    wake();
  }
  function runStep() {
    if (disposed || failure || !engine) return;
    const lane =
      preview && exporting
        ? lastLane === "preview"
          ? "export"
          : "preview"
        : preview
          ? "preview"
          : exporting
            ? "export"
            : "thumbnail";
    const task =
      lane === "preview" ? preview : lane === "export" ? exporting : thumbnail;
    if (!task) return;
    if (lane !== "thumbnail") lastLane = lane;
    const m = task.message;
    try {
      if (task.handle === undefined) {
        if (
          profile(m) ||
          (style(m) && m.settings.styleId === "braille") ||
          (m.type === "renderThumbnail" &&
            (m.profile.kind === "characters" ||
              m.profile.settings.styleId === "braille"))
        )
          selectAtlas(task.atlas!, task);
        else if (
          !style(m) &&
          m.type !== "renderThumbnail" &&
          m.settings.mapping === "glyph" &&
          selectedCalibrationKey !== calibrationIdentityKey(logicalCalibration!)
        ) {
          engine.setCalibration(logicalCalibration!);
          selectedAtlasKey = undefined;
          selectedCalibrationKey = calibrationIdentityKey(logicalCalibration!);
          settleUploadInvalidations(task);
        }
        task.startedAt = now();
        task.handle =
          m.type === "renderThumbnail"
            ? m.profile.kind === "characters"
              ? engine.beginCharacters(m.profile.settings)
              : engine.beginStyle(m.profile.settings)
            : style(m)
              ? engine.beginStyle(m.settings)
              : profile(m)
                ? engine.beginCharacters(m.settings)
                : engine.begin(m.settings);
      }
      const status = engine.step(task.handle, 4096);
      task.slices++;
      if (status === "complete") {
        if (m.type === "renderThumbnail" && !task.converting) {
          engine.beginThumbnail(task.handle, m.maxSide);
          task.converting = true;
          progressed.add(task);
          return;
        }
        // The completing turn still reports its real step count once.
        progressed.delete(task);
        options.postMessage({
          ...envelope(m.requestId),
          type: "progress",
          ...renderIdentity(m),
          phase: "compute",
          elapsedMs: now() - task.startedAt!,
          slices: task.slices,
        });
        const readbackAt = now();
        const handle = task.handle;
        // Readback owns release, including its failure path; don't cancel a
        // numeric handle that its readback already dropped.
        task.handle = undefined;
        const result =
          m.type === "renderThumbnail"
            ? {
                type: "thumbnailResult" as const,
                styleId:
                  m.profile.kind === "characters"
                    ? ("characters" as const)
                    : m.profile.settings.styleId,
                frame: engine.takeThumbnail(handle),
              }
            : style(m)
              ? {
                  type: "styleResult" as const,
                  styleId: m.styleId,
                  frame: engine.takeStyleFrame(handle),
                }
              : profile(m)
                ? {
                    type: "charactersResult" as const,
                    frame: engine.takeFrame(handle),
                  }
                : { type: "result" as const, grid: engine.takeGrid(handle) };
        const finishedAt = now();
        remove(task);
        const grid =
          result.type === "result"
            ? result.grid
            : result.type === "charactersResult"
              ? result.frame.grid
              : null;
        const transfer = grid
          ? [
              grid.glyphIndices.buffer,
              grid.foreground.buffer,
              grid.background.buffer,
              grid.alpha.buffer,
            ]
          : [];
        if (
          result.type === "charactersResult" ||
          result.type === "styleResult" ||
          result.type === "thumbnailResult"
        )
          transfer.push(result.frame.rgba.buffer);
        options.postMessage(
          {
            ...envelope(m.requestId),
            ...result,
            ...renderIdentity(m),
            backend: "rust-cpu",
            timings: {
              queueMs: task.startedAt! - task.queuedAt,
              computeMs: readbackAt - task.startedAt!,
              readbackMs: finishedAt - readbackAt,
              totalMs: finishedAt - task.queuedAt,
            },
          },
          transfer as ArrayBuffer[],
        );
      } else if (status === "cancelled") cancel(task);
      else progressed.add(task);
    } catch (cause) {
      if (failure) return;
      if (
        !(cause instanceof RenderError) ||
        cause.code === "WorkerFailure" ||
        (cause.code === "CapabilityUnavailable" &&
          !profile(m) &&
          !style(m) &&
          m.type !== "renderThumbnail")
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
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelTurn?.();
    cancelTurn = undefined;
    scheduler.dispose();
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
    atlas = undefined;
    atlasKey = undefined;
    logicalCalibration = undefined;
    selectedAtlasKey = undefined;
    selectedCalibrationKey = undefined;
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
              options.postMessage({
                ...envelope(m.requestId),
                type: "ready",
                styleProfileVersion: engine?.styleProfileVersion ?? null,
                styleContextVersion: engine?.styleContextVersion ?? null,
                thumbnailProfileVersion:
                  engine?.thumbnailProfileVersion ?? null,
                supportedStyleIds:
                  engine?.styleProfileVersion === 1
                    ? (["braille", "pixel", "mosaic"] as const).filter((id) =>
                        engine!.supportsStyle(STYLE_DISPATCH_IDS[id]),
                      )
                    : [],
                charactersProfileVersion: engine?.charactersProfileAvailable
                  ? 1
                  : null,
                charactersAtlasRetentionVersion:
                  engine?.charactersProfileAvailable
                    ? (engine.charactersAtlasRetentionVersion ?? null)
                    : null,
                charactersContextVersion: engine?.charactersProfileAvailable
                  ? (engine.charactersContextVersion ?? null)
                  : null,
              });
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
          if (thumbnail) cancel(thumbnail);
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
      if (m.type === "setAtlas") {
        const a = m.atlas,
          c = a.calibration,
          key = atlasIdentityKey(a);
        if (
          calibration?.id === c.id &&
          (calibration.key !== calibrationIdentityKey(c) ||
            (atlasKey !== undefined && atlasKey !== key))
        )
          throw new RenderError(
            "InvalidInput",
            "Atlas metadata requires a new identity",
          );
        if (!atlas || atlasKey !== key) {
          if (thumbnail) cancel(thumbnail);
          selectAtlas(a);
          // A logical replacement invalidates lazy legacy tasks even when this
          // exact atlas is already selected for a captured profile export.
          settleUploadInvalidations();
          logicalCalibration = c;
          atlas = a;
          atlasKey = key;
          calibration = {
            id: c.id,
            key: calibrationIdentityKey(c),
            cellWidth: c.cellWidth,
            cellHeight: c.cellHeight,
          };
        }
        options.postMessage({
          ...envelope(m.requestId),
          type: "accepted",
          operation: "setAtlas",
          calibrationId: c.id,
        });
        return;
      }
      if (m.type === "setCalibration") {
        const c = m.calibration;
        if (!calibration || calibration.id !== c.id) {
          if (thumbnail) cancel(thumbnail);
          engine.setCalibration(c);
          selectedAtlasKey = undefined;
          selectedCalibrationKey = calibrationIdentityKey(c);
          settleUploadInvalidations();
          logicalCalibration = c;
          atlas = undefined;
          atlasKey = undefined;
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
      if (m.type === "renderThumbnail") {
        if (engine.thumbnailProfileVersion !== 1)
          throw new RenderError(
            "CapabilityUnavailable",
            "Native thumbnail conversion is unavailable",
          );
        if (
          m.source.width !== source.width ||
          m.source.height !== source.height
        )
          throw new RenderError(
            "InvalidInput",
            "Thumbnail source geometry mismatch",
          );
        if (m.profile.settings.styleContext && engine.styleContextVersion !== 1)
          throw new RenderError(
            "CapabilityUnavailable",
            "Style context controls unavailable",
          );
        if (m.profile.kind === "style") {
          if (
            engine.styleProfileVersion !== 1 ||
            !engine.supportsStyle(
              STYLE_DISPATCH_IDS[m.profile.settings.styleId],
            )
          )
            throw new RenderError(
              "CapabilityUnavailable",
              "Thumbnail style is unsupported",
            );
          encodeStyleSettings(
            m.profile.settings,
            source,
            m.profile.settings.styleId === "braille" ? atlas : undefined,
          );
        } else if (
          !engine.charactersProfileAvailable ||
          (m.profile.settings.backdrop !== "none" &&
            engine.charactersContextVersion !== 1)
        )
          throw new RenderError(
            "CapabilityUnavailable",
            "Thumbnail Characters profile is unavailable",
          );
        if (
          (m.profile.kind === "characters" ||
            m.profile.settings.styleId === "braille") &&
          (!atlas || atlas.calibration.id !== m.calibrationId)
        )
          throw new RenderError(
            "MissingCalibration",
            "Thumbnail atlas is missing",
          );
      } else if (style(m)) {
        if (m.settings.styleContext && engine.styleContextVersion !== 1)
          throw new RenderError(
            "CapabilityUnavailable",
            "Style context controls unavailable",
          );
        if (
          engine.styleProfileVersion !== 1 ||
          !engine.supportsStyle(STYLE_DISPATCH_IDS[m.settings.styleId])
        )
          throw new RenderError(
            "CapabilityUnavailable",
            "Style is unsupported by native renderer",
          );
        if (
          m.source.width !== source.width ||
          m.source.height !== source.height
        )
          throw new RenderError(
            "InvalidInput",
            "Style retained source geometry mismatch",
          );
        if (m.settings.frameWidth * m.settings.frameHeight * 4 > budget!)
          throw new RenderError("BudgetExceeded", "Style frame exceeds budget");
        if (
          m.settings.styleId === "braille" &&
          (!atlas || atlas.calibration.id !== m.calibrationId)
        )
          throw new RenderError(
            "MissingCalibration",
            "Style requires exact captured atlas",
          );
        try {
          encodeStyleSettings(
            m.settings,
            source,
            m.settings.styleId === "braille" ? atlas : undefined,
          );
        } catch (cause) {
          throw new RenderError(
            "InvalidInput",
            cause instanceof Error ? cause.message : "Invalid style resources",
          );
        }
      } else if (profile(m)) {
        if (m.settings.styleContext && engine.styleContextVersion !== 1)
          throw new RenderError(
            "CapabilityUnavailable",
            "Style context controls unavailable",
          );
        if (
          !engine.charactersProfileAvailable ||
          (m.settings.backdrop !== "none" &&
            engine.charactersContextVersion !== 1)
        )
          throw new RenderError(
            "CapabilityUnavailable",
            "Characters profile/context is unavailable",
          );
        if (
          m.source.width !== source.width ||
          m.source.height !== source.height
        )
          throw new RenderError(
            "InvalidInput",
            "Characters retained source geometry mismatch",
          );
        // Closed/default-budget validation already passed at transport admission,
        // and the retained source above matches that exact geometry. Only this
        // session's lower budget can reject this second contract check.
        try {
          validateReferenceCharactersSettings(m.settings, source, budget);
        } catch {
          throw new RenderError(
            "BudgetExceeded",
            "Characters frame exceeds the worker session budget",
          );
        }
        if (
          !atlas ||
          m.calibrationId !== atlas.calibration.id ||
          atlasKey !== atlasIdentityKey(atlas) ||
          atlas.calibration.cellWidth !==
            0.6 * m.settings.fontSize * m.settings.renderScale ||
          atlas.calibration.cellHeight !==
            m.settings.fontSize * m.settings.renderScale
        )
          throw new RenderError(
            "MissingCalibration",
            "Requested measured Characters atlas is not uploaded",
          );
      } else if (
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
      const task: Task = {
        message: m,
        queuedAt: now(),
        slices: 0,
        ...(profile(m) ||
        (style(m) && m.settings.styleId === "braille") ||
        (m.type === "renderThumbnail" &&
          (m.profile.kind === "characters" ||
            m.profile.settings.styleId === "braille"))
          ? { atlas }
          : {}),
      };
      if (m.type === "renderThumbnail") {
        if (thumbnail) cancel(thumbnail);
        thumbnail = task;
      } else if (
        m.type === "renderPreview" ||
        m.type === "renderCharactersPreview" ||
        m.type === "renderStylePreview"
      ) {
        if (thumbnail) cancel(thumbnail);
        if (preview) cancel(preview);
        preview = task;
      } else {
        if (thumbnail) cancel(thumbnail);
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
