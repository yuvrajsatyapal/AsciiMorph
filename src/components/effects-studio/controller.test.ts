import { describe, expect, it, vi } from "vitest";
import { validateRenderProject } from "@/render/project";
import {
  createStudioController,
  dockWidth,
  shouldHandleHistoryShortcut,
  type StudioAdapters,
  type PreviewRequest,
} from "./controller";

const source = { id: "source-1", revision: 1, width: 100, height: 80 };
const replacement = { id: "source-2", revision: 1, width: 60, height: 40 };
const accepted = { source: replacement, projectId: "project-2" };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function identity(request: PreviewRequest) {
  return {
    sourceId: request.project.source!.id,
    sourceRevision: request.project.source!.revision,
    projectId: request.project.id,
    revision: request.revision,
    calibrationId: request.atlas.calibrationId,
  };
}
function renderer(): NonNullable<StudioAdapters["renderer"]> {
  return {
    prepare: async () => ({ calibrationId: "atlas-1", generation: 1 }),
    isCurrentAtlas: () => true,
    preview: async (request) => identity(request),
  };
}
function loaded(adapters: StudioAdapters = {}) {
  const draft = createStudioController().getSnapshot().project;
  return createStudioController({
    project: { ...draft, source },
    adapters,
  });
}

describe("Studio validated project transitions", () => {
  it("uses canonical defaults and keeps request revisions outside exact project JSON", () => {
    const controller = createStudioController();
    const before = controller.getSnapshot();
    expect(before.project.style).toEqual({
      id: "characters",
      parameters: {
        fontSize: 11,
        charSet: "@#S08Xx+=-;:. ",
        brightness: 0,
        contrast: 20,
      },
    });
    expect(controller.patchParameter("brightness", 12)).toBe(true);
    const after = controller.getSnapshot();
    expect(after.revision).toBe(1);
    expect(after.project.style.parameters.brightness).toBe(12);
    expect(validateRenderProject(after.project)).toEqual(after.project);
    expect(after.history.undoCount).toBe(1);
    expect(before.project.style.parameters.brightness).toBe(0);
    expect(controller.getSnapshot()).toBe(after);
    expect(Object.isFrozen(after.project.style.parameters)).toBe(true);
  });

  it.each([
    ["charSet", "x"],
    ["charSet", "\ud800x"],
    ["blur", 1],
    ["fontSize", 81],
  ])(
    "rejects invalid/unsupported %s without changing project/revision/history",
    (key, value) => {
      const c = createStudioController();
      const before = c.getSnapshot();
      expect(c.patchParameter(key, value)).toBe(false);
      expect(c.getSnapshot()).toMatchObject({
        project: before.project,
        revision: 0,
        history: before.history,
        error: { stage: "parameter" },
      });
    },
  );

  it("no-op edits create no revision, notification or history", () => {
    const c = createStudioController();
    const notify = vi.fn();
    c.subscribe(notify);
    c.beginEdit();
    c.patchParameter("brightness", 0);
    c.commitEdit();
    expect(c.getSnapshot().revision).toBe(0);
    expect(c.getSnapshot().history.undoCount).toBe(0);
    // Edit boundary notifications are allowed; no-op patch itself is silent.
    notify.mockClear();
    c.patchParameter("brightness", 0);
    expect(notify).not.toHaveBeenCalled();
  });

  it.each(["pointerup", "pointercancel", "keyup", "blur"])(
    "groups immediate changes at %s",
    () => {
      const c = createStudioController();
      c.beginEdit();
      c.beginEdit();
      c.patchParameter("brightness", 1);
      c.patchParameter("brightness", 2);
      expect(c.getSnapshot().revision).toBe(2);
      expect(c.getSnapshot().history.undoCount).toBe(0);
      c.commitEdit();
      c.commitEdit();
      expect(c.getSnapshot().history.undoCount).toBe(1);
      c.undo();
      expect(c.getSnapshot().project.style.parameters.brightness).toBe(0);
      expect(c.getSnapshot().revision).toBe(3);
      c.redo();
      expect(c.getSnapshot().project.style.parameters.brightness).toBe(2);
      expect(c.getSnapshot().revision).toBe(4);
    },
  );

  it("toolbar undo commits a pending edit; undo/redo preserve source identity", () => {
    const c = loaded();
    c.beginEdit();
    c.patchParameter("contrast", 30);
    c.undo();
    expect(c.getSnapshot().project.source).toEqual(source);
    expect(c.getSnapshot().project.style.parameters.contrast).toBe(20);
    c.redo();
    expect(c.getSnapshot().project.style.parameters.contrast).toBe(30);
    c.undo();
    c.patchParameter("brightness", 5);
    expect(c.getSnapshot().history.redoCount).toBe(0);
  });

  it("retains at most 50 resource-free current-source history entries", () => {
    const c = loaded();
    for (let i = 1; i <= 60; i++) c.patchParameter("brightness", i);
    expect(c.getSnapshot().history.undoCount).toBe(50);
    for (let i = 0; i < 60; i++) c.undo();
    expect(c.getSnapshot().project.style.parameters.brightness).toBe(10);
    expect(c.getSnapshot().project.source).toEqual(source);
    expect(c.getSnapshot().revision).toBe(110);
  });

  it("leaves native input/textarea/contentEditable history untouched", () => {
    for (const target of [
      { tagName: "INPUT" },
      { tagName: "textarea" },
      { isContentEditable: true },
    ])
      expect(shouldHandleHistoryShortcut(target)).toBe(false);
    expect(shouldHandleHistoryShortcut({ tagName: "BUTTON" })).toBe(true);
    expect(shouldHandleHistoryShortcut(null)).toBe(true);
  });
});

describe("Studio view state", () => {
  it("changes zoom/search/favorites/panels without changing look/history/revision", () => {
    const c = createStudioController();
    const before = c.getSnapshot();
    c.setView({
      zoom: 2,
      search: "char",
      favorites: ["characters"],
      catalogWidth: 999,
      activeGroup: "color",
      dockOpen: false,
      mobileSheet: "styles",
    });
    expect(c.getSnapshot()).toMatchObject({
      project: before.project,
      revision: 0,
      history: before.history,
      view: {
        zoom: 2,
        search: "char",
        favorites: ["characters"],
        catalogWidth: 420,
        activeGroup: "color",
      },
    });
    c.setView({
      catalogWidth: 1,
      activeGroup: "unavailable" as "characters",
      mobileSheet: "controls",
    });
    expect(c.getSnapshot().view).toMatchObject({
      catalogWidth: 240,
      activeGroup: "characters",
      mobileSheet: "controls",
    });
    c.setView({ mobileSheet: null });
    expect(c.getSnapshot().view.mobileSheet).toBeNull();
    c.setView({ zoom: Number.NaN });
    expect(c.getSnapshot().view.zoom).toBe(2);
  });
  it("retains a valid group through expanded, closed and collapsed dock states", () => {
    const c = createStudioController();
    c.setView({ activeGroup: "color" });
    expect(dockWidth(c.getSnapshot().view)).toBe(340);
    c.setView({ dockOpen: false });
    expect(dockWidth(c.getSnapshot().view)).toBe(0);
    expect(c.getSnapshot().view.dockCollapsed).toBe(false);
    c.setView({ dockOpen: true, dockCollapsed: true });
    expect(dockWidth(c.getSnapshot().view)).toBe(52);
    expect(c.getSnapshot().view.activeGroup).toBe("color");
    c.setView({ dockCollapsed: false });
    expect(dockWidth(c.getSnapshot().view)).toBe(340);
  });
  it.each(["pointerup", "pointercancel", "keyup", "blur"])(
    "releases compare on %s",
    () => {
      const c = createStudioController();
      c.setView({ compare: true });
      c.releaseCompare();
      expect(c.getSnapshot().view.compare).toBe(false);
      expect(c.getSnapshot().revision).toBe(0);
    },
  );
});

describe("typed source and render adapters", () => {
  it("commits accepted source as a fresh project with current look and reset history", async () => {
    const pending = deferred<typeof accepted>();
    const c = loaded({
      source: {
        loadFile: () => pending.promise,
        loadOwnedDefault: async () => accepted,
      },
      renderer: renderer(),
    });
    c.setView({ activeGroup: "color" });
    c.patchParameter("brightness", 3);
    const load = c.loadFile(new File(["test"], "test.png"));
    expect(c.getSnapshot().project.source).toEqual(source);
    c.patchParameter("contrast", 25);
    pending.resolve(accepted);
    expect(await load).toBe(true);
    expect(c.getSnapshot()).toMatchObject({
      revision: 3,
      loading: false,
      history: { undoCount: 0, redoCount: 0 },
      project: {
        id: "project-2",
        source: replacement,
        style: { parameters: { brightness: 3, contrast: 25 } },
      },
      view: { activeGroup: "color" },
    });
    c.undo();
    expect(c.getSnapshot().project.source).toEqual(replacement);
  });

  it("source failure preserves old project/source/frame and exposes a recoverable error", async () => {
    const c = loaded({
      renderer: renderer(),
      source: {
        loadFile: async () => {
          throw new Error("Upload rejected");
        },
        loadOwnedDefault: async () => accepted,
      },
    });
    await c.retryRenderer();
    const before = c.getSnapshot();
    expect(await c.loadFile(new File([], "bad.png"))).toBe(false);
    expect(c.getSnapshot()).toMatchObject({
      project: before.project,
      frame: before.frame,
      revision: before.revision,
      error: { stage: "source", message: "Upload rejected" },
      loading: false,
    });
  });

  it("renders the latest preserved-source look after replacement failure", async () => {
    const pendingSource = deferred<typeof accepted>();
    const resumedFrame = deferred<ReturnType<typeof identity>>();
    const requests: PreviewRequest[] = [];
    const c = loaded({
      renderer: {
        ...renderer(),
        preview: (request) => {
          requests.push(request);
          return requests.length === 1
            ? Promise.resolve(identity(request))
            : resumedFrame.promise;
        },
      },
      source: {
        loadFile: () => pendingSource.promise,
        loadOwnedDefault: async () => accepted,
      },
    });
    await c.retryRenderer();
    const previousFrame = c.getSnapshot().frame;
    const replacing = c.loadFile(new File([], "replacement.png"));
    c.patchParameter("brightness", 17);
    expect(requests).toHaveLength(1);
    pendingSource.reject(new Error("Replacement rejected"));
    expect(await replacing).toBe(false);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({
      revision: 1,
      project: { source, style: { parameters: { brightness: 17 } } },
    });
    expect(c.getSnapshot()).toMatchObject({
      loading: false,
      status: "rendering",
      frame: previousFrame,
      error: { stage: "source", message: "Replacement rejected" },
    });
    resumedFrame.resolve(identity(requests[1]));
    await resumedFrame.promise;
    expect(c.getSnapshot()).toMatchObject({
      status: "ready",
      revision: 1,
      project: { source },
      frame: { sourceId: source.id, revision: 1 },
      error: { stage: "source", message: "Replacement rejected" },
    });
  });

  it("restarts an interrupted preview when replacement fails without another look edit", async () => {
    const pendingSource = deferred<typeof accepted>();
    const interruptedFrame = deferred<ReturnType<typeof identity>>();
    const requests: PreviewRequest[] = [];
    const c = loaded({
      renderer: {
        ...renderer(),
        preview: (request) => {
          requests.push(request);
          return requests.length === 1
            ? interruptedFrame.promise
            : Promise.resolve(identity(request));
        },
      },
      source: {
        loadFile: () => pendingSource.promise,
        loadOwnedDefault: async () => accepted,
      },
    });
    const interrupted = c.retryRenderer();
    await Promise.resolve();
    const replacing = c.loadFile(new File([], "replacement.png"));
    pendingSource.reject(new Error("Upload failed"));
    await replacing;
    expect(requests).toHaveLength(2);
    expect(requests[1].jobId).toBeGreaterThan(requests[0].jobId);
    expect(requests[1].generation).toBeGreaterThan(requests[0].generation);
    await Promise.resolve();
    expect(c.getSnapshot()).toMatchObject({
      status: "ready",
      frame: { sourceId: source.id, revision: 0 },
    });
    const recovered = c.getSnapshot();
    interruptedFrame.resolve(identity(requests[0]));
    expect(await interrupted).toBe(false);
    expect(c.getSnapshot()).toBe(recovered);
  });

  it("does not resume a preview for a superseded source failure", async () => {
    const obsolete = deferred<typeof accepted>();
    const newest = deferred<typeof accepted>();
    let calls = 0;
    const preview = vi.fn<NonNullable<StudioAdapters["renderer"]>["preview"]>(
      async (request) => identity(request),
    );
    const c = loaded({
      renderer: { ...renderer(), preview },
      source: {
        loadFile: () => (++calls === 1 ? obsolete.promise : newest.promise),
        loadOwnedDefault: async () => accepted,
      },
    });
    await c.retryRenderer();
    const oldLoad = c.loadFile(new File([], "old.png"));
    const newLoad = c.loadFile(new File([], "new.png"));
    obsolete.reject(new Error("Obsolete rejection"));
    expect(await oldLoad).toBe(false);
    expect(c.getSnapshot().loading).toBe(true);
    expect(preview).toHaveBeenCalledTimes(1);
    newest.resolve(accepted);
    expect(await newLoad).toBe(true);
    await Promise.resolve();
    expect(preview).toHaveBeenCalledTimes(2);
    expect(c.getSnapshot()).toMatchObject({
      project: { source: replacement },
      frame: { sourceId: replacement.id },
    });
  });

  it("does not resume a preview when a replacement rejects after disposal", async () => {
    const pendingSource = deferred<typeof accepted>();
    const preview = vi.fn<NonNullable<StudioAdapters["renderer"]>["preview"]>(
      async (request) => identity(request),
    );
    const c = loaded({
      renderer: { ...renderer(), preview },
      source: {
        loadFile: () => pendingSource.promise,
        loadOwnedDefault: async () => accepted,
      },
    });
    await c.retryRenderer();
    const replacing = c.loadFile(new File([], "replacement.png"));
    c.patchParameter("brightness", 17);
    await c.dispose();
    const disposed = c.getSnapshot();
    pendingSource.reject(new Error("Late rejection"));
    expect(await replacing).toBe(false);
    expect(preview).toHaveBeenCalledTimes(1);
    expect(c.getSnapshot()).toBe(disposed);
  });

  it("does not invent source/render/export success when adapters are missing", async () => {
    const c = loaded();
    expect(await c.loadOwnedDefault()).toBe(false);
    expect(c.getSnapshot().error?.stage).toBe("source");
    expect(await c.retryRenderer()).toBe(false);
    expect(c.getSnapshot().frame).toBeNull();
    expect(c.getSnapshot().status).toBe("error");
    expect(await c.exportStill({ format: "png", scale: 1 })).toBe(false);
    expect(c.getSnapshot().exportStatus).toBe("error");
  });

  it("captures request/atlas identity and rejects obsolete or mismatched preview results", async () => {
    const old = deferred<ReturnType<typeof identity>>();
    const requests: PreviewRequest[] = [];
    const c = loaded({
      renderer: {
        ...renderer(),
        preview: (request) => {
          requests.push(request);
          return requests.length === 1
            ? old.promise
            : Promise.resolve(identity(request));
        },
      },
    });
    const first = c.retryRenderer();
    await Promise.resolve();
    c.patchParameter("brightness", 4);
    await c.retryRenderer();
    old.resolve(identity(requests[0]));
    await first;
    expect(c.getSnapshot().frame?.revision).toBe(1);
    expect(requests[0].project.style.parameters.brightness).toBe(0);
    expect(requests.at(-1)!.jobId).toBeGreaterThan(requests[0].jobId);
    expect(requests[0].atlas).toEqual({
      calibrationId: "atlas-1",
      generation: 1,
    });
    const wrong = loaded({
      renderer: {
        ...renderer(),
        preview: async (r) => ({ ...identity(r), sourceId: "wrong" }),
      },
    });
    expect(await wrong.retryRenderer()).toBe(false);
    expect(wrong.getSnapshot().frame).toBeNull();
  });

  it("rejects late accepted source and render results after disposal", async () => {
    const pending = deferred<typeof accepted>();
    const dispose = vi.fn();
    const c = loaded({
      source: {
        loadFile: () => pending.promise,
        loadOwnedDefault: () => pending.promise,
      },
      dispose,
    });
    const load = c.loadOwnedDefault();
    c.dispose();
    c.dispose();
    pending.resolve(accepted);
    await load;
    expect(c.getSnapshot().project.source).toEqual(source);
    expect(c.getSnapshot().status).toBe("disposed");
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(c.patchParameter("brightness", 10)).toBe(false);
  });

  it("disposes an injected owner once and exposes cleanup failures to its caller", async () => {
    const dispose = vi.fn(async () => {
      throw new Error("cleanup failed");
    });
    const c = loaded({ dispose });
    const cleanup = c.dispose();
    expect(c.dispose()).toBe(cleanup);
    await expect(cleanup).rejects.toThrow("cleanup failed");
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("allows a disposal subscriber to request the same cleanup without reentry", async () => {
    const dispose = vi.fn();
    const c = loaded({ dispose });
    let cleanup: Promise<void> | undefined;
    c.subscribe(() => {
      if (c.getSnapshot().status === "disposed") cleanup = c.dispose();
    });
    const result = c.dispose();
    expect(result).toBe(cleanup);
    await result;
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("ignores a late preview after disposal without notifying subscribers again", async () => {
    const pending = deferred<ReturnType<typeof identity>>();
    let request!: PreviewRequest;
    const c = loaded({
      renderer: {
        ...renderer(),
        preview: (r) => {
          request = r;
          return pending.promise;
        },
      },
    });
    const rendering = c.retryRenderer();
    await Promise.resolve();
    await c.dispose();
    const disposed = c.getSnapshot();
    const listener = vi.fn();
    c.subscribe(listener);
    pending.resolve(identity(request));
    expect(await rendering).toBe(false);
    expect(c.getSnapshot()).toBe(disposed);
    expect(listener).not.toHaveBeenCalled();
  });

  it("rejects a prepared atlas that changes while preview runs", async () => {
    const pending = deferred<ReturnType<typeof identity>>();
    let current = true;
    let request!: PreviewRequest;
    const c = loaded({
      renderer: {
        ...renderer(),
        isCurrentAtlas: () => current,
        preview: (r) => {
          request = r;
          return pending.promise;
        },
      },
    });
    const rendering = c.retryRenderer();
    await Promise.resolve();
    current = false;
    pending.resolve(identity(request));
    expect(await rendering).toBe(false);
    expect(c.getSnapshot().frame).toBeNull();
    expect(c.getSnapshot().error?.message).toMatch(/atlas/i);
  });

  it("rejects superseded source acceptance and keeps the newest source commit", async () => {
    const first = deferred<typeof accepted>();
    const second = deferred<typeof accepted>();
    let calls = 0;
    const c = loaded({
      source: {
        loadFile: () => (++calls === 1 ? first.promise : second.promise),
        loadOwnedDefault: async () => accepted,
      },
    });
    const old = c.loadFile(new File([], "old.png"));
    const recent = c.loadFile(new File([], "new.png"));
    second.resolve(accepted);
    expect(await recent).toBe(true);
    first.resolve({ source, projectId: "obsolete-project" });
    expect(await old).toBe(false);
    expect(c.getSnapshot().project.id).toBe("project-2");
    expect(c.getSnapshot().project.source).toEqual(replacement);
  });
});

describe("captured still-export transitions", () => {
  it("keeps look/revision/options immutable while same-source edits and zoom continue", async () => {
    const pending = deferred<void>();
    const exportStill = vi.fn<NonNullable<StudioAdapters["exportStill"]>>(
      () => pending.promise,
    );
    const c = loaded({ exportStill });
    const settings = { format: "png" as const, scale: 2 as const };
    const exporting = c.exportStill(settings);
    expect(c.getSnapshot().exportStatus).toBe("exporting");
    c.patchParameter("brightness", 5);
    c.setView({ zoom: 3 });
    expect(await c.exportStill(settings)).toBe(false);
    expect(exportStill).toHaveBeenCalledTimes(1);
    expect(exportStill.mock.calls[0][0]).toMatchObject({
      revision: 0,
      options: { format: "png", scale: 2 },
      project: { source, style: { parameters: { brightness: 0 } } },
    });
    expect(Object.isFrozen(exportStill.mock.calls[0][0].options)).toBe(true);
    pending.resolve();
    expect(await exporting).toBe(true);
    expect(c.getSnapshot().exportStatus).toBe("complete");
    expect(c.getSnapshot().frame).toBeNull();
    c.cancelExport();
    expect(c.getSnapshot().exportStatus).toBe("idle");
  });

  it("cancels an export on source replacement and rejects late completion", async () => {
    const pending = deferred<void>();
    let signal!: AbortSignal;
    const c = loaded({
      exportStill: (_request, s) => {
        signal = s;
        return pending.promise;
      },
      source: {
        loadFile: async () => accepted,
        loadOwnedDefault: async () => accepted,
      },
    });
    const exporting = c.exportStill({ format: "jpeg", scale: 1 });
    await c.loadOwnedDefault();
    expect(signal.aborted).toBe(true);
    pending.resolve();
    expect(await exporting).toBe(false);
    expect(c.getSnapshot().exportStatus).toBe("idle");
  });

  it("exposes adapter failure and allows explicit retry", async () => {
    const exportStill = vi
      .fn<NonNullable<StudioAdapters["exportStill"]>>()
      .mockRejectedValueOnce(new Error("Encoder unavailable"))
      .mockResolvedValueOnce();
    const c = loaded({ exportStill });
    expect(await c.exportStill({ format: "png", scale: 4 })).toBe(false);
    expect(c.getSnapshot()).toMatchObject({
      exportStatus: "error",
      error: { stage: "export", message: "Encoder unavailable" },
    });
    expect(await c.exportStill({ format: "png", scale: 1 })).toBe(true);
    expect(c.getSnapshot().error).toBeNull();
  });
});
