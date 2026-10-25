import { initialCatalogRegistry } from "@/render/catalog/initial-schemas";
import { switchStyle, isStudioStyleId } from "./style-adapter";
import type {
  SourceCandidate,
  StudioSourceAdapter,
} from "@/render/media/source-transaction";
import {
  validateRenderProject,
  type ParameterValue,
  type RenderProjectV1,
} from "@/render/project";

export type StudioView = {
  zoom: number;
  compare: boolean;
  catalogWidth: number;
  catalogCollapsed: boolean;
  dockOpen: boolean;
  dockCollapsed: boolean;
  activeGroup: "characters" | "color";
  mobileSheet: "styles" | "controls" | null;
  search: string;
  favorites: readonly string[];
};
export type PaintedIdentity = {
  styleId: string;
  sourceId: string;
  sourceRevision: number;
  projectId: string;
  revision: number;
  calibrationId: string;
};
export type PreparedResources =
  | { kind: "atlas"; calibrationId: string; generation: number }
  | { kind: "none"; calibrationId: ""; generation: number };
export type AtlasIdentity = Extract<PreparedResources, { kind: "atlas" }>;
export type StudioRequest = {
  /** Detached, immutable project; no worker request revision is stored in it. */
  project: RenderProjectV1;
  revision: number;
  jobId: number;
  generation: number;
};
export type PreviewRequest = StudioRequest & { resources: PreparedResources };
export type StillExportStage = "rendering" | "encoding" | "downloading";
export type StillExportOptions = {
  format: "png" | "jpeg";
  scale: 1 | 2 | 3 | 4;
};
export type StudioError = {
  stage: "parameter" | "source" | "render" | "export";
  message: string;
};
export type StudioSnapshot = Readonly<{
  project: RenderProjectV1;
  revision: number;
  view: Readonly<StudioView>;
  history: Readonly<{ undoCount: number; redoCount: number; editing: boolean }>;
  loading: boolean;
  status: "idle" | "rendering" | "ready" | "error" | "disposed";
  exportStatus: "idle" | "exporting" | "complete" | "error";
  /** Remains true after cancel until the native encoder actually settles. */
  exportBusy: boolean;
  exportStage: StillExportStage | null;
  error: Readonly<StudioError> | null;
  frame: Readonly<PaintedIdentity> | null;
}>;

/** Adapters own browser/service resources. An uploaded source candidate requires
 * synchronous acceptance after controller validation; rollback must settle before
 * any surviving-source preview. The renderer returns identities before paint.
 * No resource or pixel buffer enters snapshots/history. */
export interface StudioAdapters {
  source?: StudioSourceAdapter;
  renderer?: {
    prepare(
      request: StudioRequest,
      signal: AbortSignal,
    ): Promise<PreparedResources>;
    isCurrentResources(resources: PreparedResources): boolean;
    preview(
      request: PreviewRequest,
      signal: AbortSignal,
    ): Promise<PaintedIdentity>;
  };
  /** Resolves only after a real render/encode/download; owns late-blob cleanup.
   * A same-source captured export must survive later look/atlas changes. */
  exportStill?: (
    request: StudioRequest & { options: StillExportOptions },
    signal: AbortSignal,
    progress: (stage: StillExportStage) => void,
  ) => Promise<void>;
  dispose?: () => void | Promise<void>;
}

type Look = Pick<RenderProjectV1, "style" | "crop" | "rotation">;
function look(project: RenderProjectV1): Look {
  return {
    style: project.style,
    crop: project.crop,
    rotation: project.rotation,
  };
}
function sameLook(a: Look, b: Look): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function validate(project: unknown): RenderProjectV1 {
  const result = validateRenderProject(project);
  if (!isStudioStyleId(result.style.id))
    throw new Error("Studio style unavailable");
  return freeze(result);
}
function draft(): RenderProjectV1 {
  const schema = initialCatalogRegistry.getStyle("characters")!;
  return validate({
    version: 1,
    id: "studio-project",
    name: "Untitled",
    source: null,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    rotation: 0,
    style: {
      id: "characters",
      parameters: Object.fromEntries(
        schema.descriptor.parameters.map((p) => [p.key, p.default]),
      ),
    },
    effects: [],
    masks: [],
    text: [],
    seed: 0,
    timeUs: 0,
    export: {
      format: "png",
      scale: 1,
      fps: 30,
      durationUs: 0,
      quality: 1,
      audio: false,
    },
  });
}
export function dockWidth(
  view: Pick<StudioView, "dockOpen" | "dockCollapsed">,
): number {
  return !view.dockOpen ? 0 : view.dockCollapsed ? 52 : 340;
}
/** Pass an event target (or its editable ancestor) without needing DOM globals. */
export function shouldHandleHistoryShortcut(
  target: { tagName?: string; isContentEditable?: boolean } | null,
): boolean {
  return (
    !target?.isContentEditable &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(
      target?.tagName?.toUpperCase() ?? "",
    )
  );
}

export function createStudioController(
  options: { project?: unknown; adapters?: StudioAdapters } = {},
) {
  const adapters = options.adapters ?? {};
  let project =
    options.project === undefined ? draft() : validate(options.project);
  let revision = 0;
  let generation = 0;
  let jobId = 0;
  let view: StudioView = {
    zoom: 1,
    compare: false,
    catalogWidth: 320,
    catalogCollapsed: false,
    dockOpen: true,
    dockCollapsed: false,
    activeGroup: "characters",
    mobileSheet: null,
    search: "",
    favorites: [],
  };
  let undoStack: Look[] = [],
    redoStack: Look[] = [];
  let editStart: Look | null = null;
  let loading = false;
  let status: StudioSnapshot["status"] = "idle";
  let exportStatus: StudioSnapshot["exportStatus"] = "idle";
  let exportBusy = false;
  let exportStage: StillExportStage | null = null;
  let exportDrain: Promise<void> | undefined;
  let error: StudioError | null = null;
  let frame: PaintedIdentity | null = null;
  let sourceAbort: AbortController | undefined;
  let previewAbort: AbortController | undefined;
  let exportAbort: AbortController | undefined;
  let disposal: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  let snapshot: StudioSnapshot;
  const alive = () => status !== "disposed";
  function publish() {
    snapshot = freeze({
      project,
      revision,
      view,
      loading,
      status,
      exportStatus,
      exportBusy,
      exportStage,
      error,
      frame,
      history: {
        undoCount: undoStack.length,
        redoCount: redoStack.length,
        editing: editStart !== null,
      },
    });
    for (const listener of listeners) listener();
  }
  function fail(stage: StudioError["stage"], reason: unknown) {
    error = {
      stage,
      message: reason instanceof Error ? reason.message : String(reason),
    };
  }
  function clearError(stage: StudioError["stage"]) {
    if (error?.stage === stage) error = null;
  }
  function remember(value: Look) {
    undoStack.push(value);
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
  }
  function commitEdit() {
    if (!alive() || !editStart) return;
    if (!sameLook(editStart, look(project))) remember(editStart);
    editStart = null;
    publish();
  }
  function changed() {
    revision++;
    publish();
    if (project.source && !loading) void retryRenderer();
  }
  function capture(): StudioRequest {
    return freeze({ project, revision, jobId: ++jobId, generation });
  }
  async function retryRenderer(): Promise<boolean> {
    if (
      !alive() ||
      loading ||
      (adapters.source && !adapters.source.isReady(project.source))
    )
      return false;
    previewAbort?.abort();
    const abort = new AbortController();
    previewAbort = abort;
    const request = capture();
    const current = () =>
      alive() &&
      !abort.signal.aborted &&
      previewAbort === abort &&
      generation === request.generation &&
      revision === request.revision &&
      project === request.project;
    try {
      if (!adapters.renderer) throw new Error("Renderer adapter unavailable");
      if (!project.source) throw new Error("A committed source is required");
      status = "rendering";
      clearError("render");
      publish();
      const resources = freeze({
        ...(await adapters.renderer.prepare(request, abort.signal)),
      });
      if (!current()) return false;
      if (
        !["atlas", "none"].includes(resources.kind) ||
        (resources.kind === "atlas"
          ? !resources.calibrationId
          : resources.calibrationId !== "") ||
        !Number.isSafeInteger(resources.generation) ||
        resources.generation < 0 ||
        !adapters.renderer.isCurrentResources(resources)
      )
        throw new Error(
          `Prepared ${resources.kind} resources are no longer current`,
        );
      const result = await adapters.renderer.preview(
        freeze({ ...request, resources }),
        abort.signal,
      );
      if (!current()) return false;
      if (!adapters.renderer.isCurrentResources(resources))
        throw new Error(
          `Rendered ${resources.kind} resources are no longer current`,
        );
      const expected: PaintedIdentity = {
        styleId: request.project.style.id,
        sourceId: request.project.source!.id,
        sourceRevision: request.project.source!.revision,
        projectId: request.project.id,
        revision: request.revision,
        calibrationId: resources.calibrationId,
      };
      if (
        Object.keys(expected).some(
          (key) =>
            result[key as keyof PaintedIdentity] !==
            expected[key as keyof PaintedIdentity],
        )
      )
        throw new Error("Renderer returned a mismatched frame identity");
      frame = expected;
      status = "ready";
      clearError("render");
      publish();
      return true;
    } catch (reason) {
      if (current()) {
        status = "error";
        fail("render", reason);
        publish();
      }
      return false;
    }
  }
  function cancelExport() {
    if (!alive()) return;
    exportAbort?.abort();
    exportAbort = undefined;
    exportStage = null;
    if (exportStatus !== "idle") {
      exportStatus = "idle";
      clearError("export");
      publish();
    }
  }
  async function load(kind: "file" | "default", file?: File): Promise<boolean> {
    if (!alive()) return false;
    if (!adapters.source) {
      fail("source", new Error("Source adapter unavailable"));
      publish();
      return false;
    }
    sourceAbort?.abort();
    previewAbort?.abort();
    cancelExport();
    generation++;
    const abort = new AbortController();
    sourceAbort = abort;
    loading = true;
    status = frame ? "ready" : "idle";
    clearError("source");
    publish();
    const current = () =>
      alive() && sourceAbort === abort && !abort.signal.aborted;
    let candidate: SourceCandidate | undefined;
    try {
      const accepted = (candidate =
        kind === "file"
          ? await adapters.source.loadFile(file!, abort.signal)
          : await adapters.source.loadOwnedDefault(abort.signal));
      if (!current()) {
        await accepted.rollback();
        return false;
      }
      if (accepted.projectId === project.id)
        throw new Error("Source replacement requires a fresh project identity");
      const next = validate({
        ...project,
        id: accepted.projectId,
        source: accepted.source,
        crop: { x: 0, y: 0, width: 1, height: 1 },
        rotation: 0,
      });
      if (!accepted.accept())
        throw new Error("Source candidate is no longer current");
      project = next;
      undoStack = [];
      redoStack = [];
      editStart = null;
      frame = null;
      loading = false;
      sourceAbort = undefined;
      status = "idle";
      clearError("source");
      changed();
      return true;
    } catch (reason) {
      if (candidate) {
        try {
          await candidate.rollback();
        } catch (failure) {
          reason = failure;
        }
      }
      if (current()) {
        loading = false;
        sourceAbort = undefined;
        fail("source", reason);
        publish();
        // Replacement aborted the old preview and suppressed look renders while
        // loading. Once rollback settles, render the surviving source's latest
        // project; keep its previous frame and the source error during recovery.
        if (project.source && adapters.renderer) void retryRenderer();
      }
      return false;
    }
  }
  async function exportStill(settings: StillExportOptions): Promise<boolean> {
    if (
      !alive() ||
      loading ||
      exportBusy ||
      (adapters.source && !adapters.source.isReady(project.source))
    )
      return false;
    const abort = new AbortController();
    exportAbort = abort;
    const request = capture();
    exportBusy = true;
    let finish!: () => void;
    exportDrain = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const current = () =>
      alive() &&
      exportAbort === abort &&
      !abort.signal.aborted &&
      generation === request.generation;
    try {
      if (!adapters.exportStill)
        throw new Error("Still export adapter unavailable");
      if (!project.source) throw new Error("A committed source is required");
      if (
        !["png", "jpeg"].includes(settings.format) ||
        ![1, 2, 3, 4].includes(settings.scale)
      )
        throw new Error("Unsupported still export settings");
      exportStatus = "exporting";
      exportStage = "rendering";
      clearError("export");
      publish();
      await adapters.exportStill(
        freeze({ ...request, options: { ...settings } }),
        abort.signal,
        (stage) => {
          if (current()) {
            exportStage = stage;
            publish();
          }
        },
      );
      if (!current()) return false;
      exportAbort = undefined;
      exportStatus = "complete";
      clearError("export");
      publish();
      return true;
    } catch (reason) {
      if (current()) {
        exportAbort = undefined;
        exportStatus = "error";
        fail("export", reason);
        publish();
      }
      return false;
    } finally {
      exportBusy = false;
      exportStage = null;
      exportDrain = undefined;
      finish();
      if (alive()) publish();
    }
  }
  publish();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (!alive()) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    patchParameter(key: string, value: ParameterValue): boolean {
      if (!alive()) return false;
      let next: RenderProjectV1;
      try {
        next = validate({
          ...project,
          style: {
            ...project.style,
            parameters: { ...project.style.parameters, [key]: value },
          },
        });
      } catch (reason) {
        fail("parameter", reason);
        publish();
        return false;
      }
      if (sameLook(look(project), look(next))) return false;
      if (!editStart) remember(look(project));
      project = next;
      clearError("parameter");
      changed();
      return true;
    },
    selectStyle(id: string): boolean {
      if (!alive() || id === project.style.id) return false;
      let next: RenderProjectV1;
      try {
        next = validate({ ...project, style: switchStyle(project.style, id) });
      } catch (reason) {
        fail("parameter", reason);
        publish();
        return false;
      }
      commitEdit();
      remember(look(project));
      project = next;
      clearError("parameter");
      changed();
      return true;
    },
    beginEdit() {
      if (alive() && !editStart) {
        editStart = look(project);
        publish();
      }
    },
    commitEdit,
    undo() {
      if (!alive()) return;
      commitEdit();
      const previous = undoStack.pop();
      if (!previous) return;
      redoStack.push(look(project));
      project = validate({ ...project, ...previous });
      changed();
    },
    redo() {
      if (!alive()) return;
      commitEdit();
      const next = redoStack.pop();
      if (!next) return;
      undoStack.push(look(project));
      project = validate({ ...project, ...next });
      changed();
    },
    setView(patch: Partial<StudioView>) {
      if (!alive()) return;
      const next = {
        ...view,
        ...patch,
        favorites: [...(patch.favorites ?? view.favorites)],
      };
      next.zoom = Number.isFinite(next.zoom)
        ? Math.min(8, Math.max(0.1, next.zoom))
        : view.zoom;
      next.catalogWidth = Number.isFinite(next.catalogWidth)
        ? Math.min(420, Math.max(240, next.catalogWidth))
        : view.catalogWidth;
      if (!["characters", "color"].includes(next.activeGroup))
        next.activeGroup = "characters";
      if (
        next.mobileSheet !== null &&
        !["styles", "controls"].includes(next.mobileSheet)
      )
        next.mobileSheet = null;
      if (JSON.stringify(next) === JSON.stringify(view)) return;
      view = next;
      publish();
    },
    releaseCompare() {
      if (alive() && view.compare) {
        view = { ...view, compare: false };
        publish();
      }
    },
    loadFile: (file: File) => load("file", file),
    loadOwnedDefault: () => load("default"),
    retryRenderer,
    /** Resource owners notify when a retained download budget becomes available. */
    refreshExportAvailability() {
      if (alive()) publish();
    },
    exportStill,
    cancelExport,
    dispose(): Promise<void> {
      if (disposal) return disposal;
      const draining = exportDrain;
      disposal = Promise.all([
        Promise.resolve().then(() => adapters.dispose?.()),
        draining,
      ]).then(() => {});
      generation++;
      sourceAbort?.abort();
      previewAbort?.abort();
      exportAbort?.abort();
      sourceAbort = previewAbort = exportAbort = undefined;
      loading = false;
      status = "disposed";
      exportStatus = "idle";
      exportStage = null;
      editStart = null;
      undoStack = [];
      redoStack = [];
      frame = null;
      publish();
      listeners.clear();
      // The resource owner can await cleanup and report a failure; repeated calls
      // share the same completion and cannot dispose a newer mounted controller.
      return disposal;
    },
  };
}

export type StudioController = ReturnType<typeof createStudioController>;
