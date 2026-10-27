import { describe, expect, it, vi } from "vitest";
import type {
  RenderService,
  CharactersRenderRequest,
  StyleRenderRequest,
} from "@/render/service";
import { measuredAtlasFixture } from "./runtime-fixtures";
import type { ReferenceCharacterAtlasV1 } from "@/render/reference-characters";
import { createStudioRuntime } from "./runtime";

const timings = { queueMs: 0, computeMs: 0, readbackMs: 0, totalMs: 0 };
function harness(width = 3, height = 2) {
  const statusListeners = new Set<() => void>();
  const jobs: StyleRenderRequest[] = [];
  const measure = vi.fn(
    async (input: Parameters<typeof measuredAtlasFixture>[0]) =>
      measuredAtlasFixture(input),
  );
  let selectedAtlas: ReferenceCharacterAtlasV1 | undefined;
  const setAtlas = vi.fn(async (atlas: ReferenceCharacterAtlasV1) => {
    selectedAtlas = atlas;
  });
  const renderStylePreview = vi.fn(async (r: StyleRenderRequest) => {
    jobs.push(r);
    return {
      jobId: r.jobId,
      revision: r.revision,
      sourceId: r.sourceId,
      sourceRevision: r.sourceRevision,
      calibrationId: r.calibrationId,
      styleId: r.styleId,
      backend: "rust-cpu" as const,
      timings,
      frame: {
        version: 1 as const,
        width: r.settings.frameWidth,
        height: r.settings.frameHeight,
        rgba: new Uint8Array(
          r.settings.frameWidth * r.settings.frameHeight * 4,
        ).fill(18),
      },
    };
  });
  const renderStyleExport = vi.fn(async (r: StyleRenderRequest) =>
    renderStylePreview(r),
  );
  const service = {
    state: "ready",
    subscribeStatus(listener: () => void) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    get atlasResourceUsage() {
      const c = selectedAtlas?.calibration;
      return {
        selected: c
          ? {
              calibrationId: c.id,
              backingBytes: [
                ...new Set([
                  c.masks.buffer,
                  c.coverage.buffer,
                  c.shapes.buffer,
                ]),
              ].reduce((sum, backing) => sum + backing.byteLength, 0),
            }
          : null,
        inFlight: [],
      };
    },
    styleProfileVersion: 1,
    thumbnailProfileVersion: 1,
    thumbnailResourceUsage: { inFlight: false },
    highPriorityBusy: false,
    supportedStyleIds: ["pixel", "mosaic"],
    charactersProfileVersion: 1,
    charactersContextVersion: 1,
    charactersAtlasRetentionVersion: 1,
    initialize: vi.fn(async () => {}),
    setSource: vi.fn(async () => {}),
    setAtlas,
    renderCharactersPreview: vi.fn(async (r: CharactersRenderRequest) => ({
      jobId: r.jobId,
      revision: r.revision,
      sourceId: r.sourceId,
      sourceRevision: r.sourceRevision,
      calibrationId: r.calibrationId,
      backend: "rust-cpu" as const,
      timings,
      frame: {
        version: 1 as const,
        width: r.settings.frameWidth,
        height: r.settings.frameHeight,
        rgba: new Uint8Array(
          r.settings.frameWidth * r.settings.frameHeight * 4,
        ).fill(7),
        grid: null,
      },
    })),
    renderCharactersExport: vi.fn(async (r: CharactersRenderRequest) => ({
      jobId: r.jobId,
      revision: r.revision,
      sourceId: r.sourceId,
      sourceRevision: r.sourceRevision,
      calibrationId: r.calibrationId,
      backend: "rust-cpu" as const,
      timings,
      frame: {
        version: 1 as const,
        width: r.settings.frameWidth,
        height: r.settings.frameHeight,
        rgba: new Uint8Array(
          r.settings.frameWidth * r.settings.frameHeight * 4,
        ).fill(33),
        grid: null,
      },
    })),
    renderStylePreview,
    renderStyleExport,
    renderThumbnail: vi.fn(
      async (r: Parameters<RenderService["renderThumbnail"]>[0]) => ({
        jobId: r.jobId,
        revision: r.revision,
        sourceId: r.sourceId,
        sourceRevision: r.sourceRevision,
        calibrationId: r.calibrationId,
        styleId:
          r.profile.kind === "characters"
            ? "characters"
            : r.profile.settings.styleId,
        backend: "rust-cpu" as const,
        timings,
        frame: {
          version: 1 as const,
          width: 2,
          height: 1,
          rgba: new Uint8Array(8).fill(
            r.profile.kind === "characters"
              ? 7
              : r.profile.settings.styleId === "pixel"
                ? 17
                : 27,
          ),
        },
      }),
    ),
    dispose: vi.fn(async () => {}),
  } as unknown as RenderService;
  let id = 0;
  const runtime = createStudioRuntime({
    createService: () => service,
    calibrate: measure,
    decodeFile: async () => ({
      width,
      height,
      rgba: new Uint8ClampedArray(width * height * 4).fill(4),
    }),
    createId: () => `source-${++id}`,
  });
  return {
    runtime,
    service,
    jobs,
    measure,
    setAtlas,
    renderStylePreview,
    renderStyleExport,
    emitStatus: () => {
      for (const listener of statusListeners) listener();
    },
  };
}

describe("Studio raster service integration", () => {
  it("renders current-source catalog styles with defaults and keeps hover transient", async () => {
    const h = harness();
    try {
      await h.runtime.controller.loadFile(new File(["x"], "a.png"));
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().status).toBe("ready"),
      );
      const before = h.runtime.getSnapshot();
      const accepted = h.runtime.getFrame();
      const pixel = await h.runtime.requestThumbnail("pixel");
      const mosaic = await h.runtime.requestThumbnail("mosaic");
      expect(pixel?.rgba[0]).toBe(17);
      expect(mosaic?.rgba[0]).toBe(27);
      await h.runtime.hoverStyle("pixel");
      expect(h.runtime.getHoverFrame()?.rgba[0]).toBe(17);
      expect(h.runtime.getSnapshot().project).toEqual(before.project);
      expect(h.runtime.getSnapshot().history).toEqual(before.history);
      expect(h.runtime.getFrame()).toBe(accepted);
      h.runtime.clearHover();
      expect(h.runtime.getHoverFrame()).toBeNull();
      expect(h.runtime.getFrame()).toBe(accepted);
    } finally {
      await h.runtime.dispose();
    }
  });
  it("denies a thumbnail before native work and releases its input owner", async () => {
    const h = harness();
    try {
      await h.runtime.controller.loadFile(new File(["x"], "a.png"));
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().status).toBe("ready"),
      );
      const accepted = h.runtime.getFrame();
      const huge = { width: 8192, height: 8192 };
      const release = h.runtime.retainCanvas(huge);
      await expect(h.runtime.requestThumbnail("pixel")).rejects.toThrow(
        /budget/,
      );
      expect(h.service.renderThumbnail).not.toHaveBeenCalled();
      expect(h.runtime.getFrame()).toBe(accepted);
      release();
      await expect(h.runtime.requestThumbnail("mosaic")).resolves.toMatchObject(
        { width: 2 },
      );
      await expect(h.runtime.requestThumbnail("pixel")).resolves.toMatchObject({
        width: 2,
      });
      const calls = vi.mocked(h.service.renderThumbnail).mock.calls;
      expect(calls).toHaveLength(2);
      expect(Number(calls[1][0].jobId.split("-").at(-1))).toBeGreaterThan(
        Number(calls[0][0].jobId.split("-").at(-1)),
      );
    } finally {
      await h.runtime.dispose();
    }
  });
  it("holds the full native reservation after local cancellation until service terminal settlement", async () => {
    const h = harness();
    try {
      await h.runtime.controller.loadFile(new File(["x"], "a.png"));
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().status).toBe("ready"),
      );
      const baseline = h.runtime.heldFrameBytes;
      let finish!: (
        value: Awaited<ReturnType<RenderService["renderThumbnail"]>>,
      ) => void;
      const held = new Promise<
        Awaited<ReturnType<RenderService["renderThumbnail"]>>
      >((resolve) => {
        finish = resolve;
      });
      vi.mocked(h.service.renderThumbnail).mockImplementationOnce(() => held);
      const abort = new AbortController();
      const request = h.runtime.requestThumbnail("pixel", abort.signal);
      await vi.waitFor(() =>
        expect(h.service.renderThumbnail).toHaveBeenCalledTimes(1),
      );
      expect(h.runtime.heldFrameBytes).toBeGreaterThan(baseline);
      abort.abort();
      await expect(request).rejects.toThrow();
      expect(h.runtime.heldFrameBytes).toBeGreaterThan(baseline);
      const submitted = vi.mocked(h.service.renderThumbnail).mock.calls[0][0];
      finish({
        ...submitted,
        styleId: "pixel",
        backend: "rust-cpu",
        timings,
        frame: { version: 1, width: 2, height: 1, rgba: new Uint8Array(8) },
      });
      await vi.waitFor(() => expect(h.runtime.heldFrameBytes).toBe(baseline));
    } finally {
      await h.runtime.dispose();
    }
  });
  it("settles each coalesced caller on its own abort without cancelling a live caller", async () => {
    const h = harness();
    let finish!: (
      value: Awaited<ReturnType<RenderService["renderThumbnail"]>>,
    ) => void;
    try {
      await h.runtime.controller.loadFile(new File(["x"], "a.png"));
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().status).toBe("ready"),
      );
      const held = new Promise<
        Awaited<ReturnType<RenderService["renderThumbnail"]>>
      >((resolve) => {
        finish = resolve;
      });
      vi.mocked(h.service.renderThumbnail).mockImplementationOnce(() => held);
      const firstAbort = new AbortController();
      const secondAbort = new AbortController();
      const first = h.runtime.requestThumbnail("pixel", firstAbort.signal);
      const second = h.runtime.requestThumbnail("pixel", secondAbort.signal);
      await vi.waitFor(() =>
        expect(h.service.renderThumbnail).toHaveBeenCalledTimes(1),
      );
      const nativeSignal = vi.mocked(h.service.renderThumbnail).mock
        .calls[0][1]!;
      firstAbort.abort();
      await expect(first).rejects.toMatchObject({ name: "AbortError" });
      expect(nativeSignal.aborted).toBe(false);
      const submitted = vi.mocked(h.service.renderThumbnail).mock.calls[0][0];
      finish({
        ...submitted,
        styleId: "pixel",
        backend: "rust-cpu",
        timings,
        frame: {
          version: 1,
          width: 2,
          height: 1,
          rgba: new Uint8Array(8).fill(17),
        },
      });
      expect((await second)?.rgba[0]).toBe(17);
      expect(nativeSignal.aborted).toBe(false);
    } finally {
      await h.runtime.dispose();
    }
  });
  it("cancels after the last coalesced abort, settles both, and holds the native reservation until terminal", async () => {
    const h = harness();
    let finish!: (
      value: Awaited<ReturnType<RenderService["renderThumbnail"]>>,
    ) => void;
    try {
      await h.runtime.controller.loadFile(new File(["x"], "a.png"));
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().status).toBe("ready"),
      );
      const baseline = h.runtime.heldFrameBytes;
      const held = new Promise<
        Awaited<ReturnType<RenderService["renderThumbnail"]>>
      >((resolve) => {
        finish = resolve;
      });
      vi.mocked(h.service.renderThumbnail).mockImplementationOnce(() => held);
      const firstAbort = new AbortController();
      const secondAbort = new AbortController();
      const first = h.runtime.requestThumbnail("pixel", firstAbort.signal);
      const second = h.runtime.requestThumbnail("pixel", secondAbort.signal);
      await vi.waitFor(() =>
        expect(h.service.renderThumbnail).toHaveBeenCalledTimes(1),
      );
      const nativeSignal = vi.mocked(h.service.renderThumbnail).mock
        .calls[0][1]!;
      expect(h.runtime.heldFrameBytes).toBeGreaterThan(baseline);
      firstAbort.abort();
      await expect(first).rejects.toMatchObject({ name: "AbortError" });
      expect(nativeSignal.aborted).toBe(false);
      secondAbort.abort();
      await expect(second).rejects.toMatchObject({ name: "AbortError" });
      expect(nativeSignal.aborted).toBe(true);
      expect(h.runtime.heldFrameBytes).toBeGreaterThan(baseline);
      const late = h.runtime.requestThumbnail("pixel");
      expect(h.service.renderThumbnail).toHaveBeenCalledTimes(1);
      const submitted = vi.mocked(h.service.renderThumbnail).mock.calls[0][0];
      finish({
        ...submitted,
        styleId: "pixel",
        backend: "rust-cpu",
        timings,
        frame: {
          version: 1,
          width: 2,
          height: 1,
          rgba: new Uint8Array(8).fill(17),
        },
      });
      expect((await late)?.rgba[0]).toBe(17);
      expect(h.service.renderThumbnail).toHaveBeenCalledTimes(2);
      await vi.waitFor(() =>
        expect(h.runtime.heldFrameBytes).toBe(baseline + 8),
      );
    } finally {
      await h.runtime.dispose();
    }
  });
  it("retires an atlas-changed hover and refuses stale completion after capability loss", async () => {
    const h = harness();
    try {
      await h.runtime.controller.loadFile(new File(["x"], "a.png"));
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().status).toBe("ready"),
      );
      let finish!: (
        value: Awaited<ReturnType<RenderService["renderThumbnail"]>>,
      ) => void;
      const held = new Promise<
        Awaited<ReturnType<RenderService["renderThumbnail"]>>
      >((resolve) => {
        finish = resolve;
      });
      vi.mocked(h.service.renderThumbnail).mockImplementationOnce(() => held);
      const hover = h.runtime.hoverStyle("pixel");
      await vi.waitFor(() =>
        expect(h.service.renderThumbnail).toHaveBeenCalledTimes(1),
      );
      h.runtime.controller.patchParameter("charSet", "@#.");
      expect(h.runtime.getHoverFrame()).toBeNull();
      const submitted = vi.mocked(h.service.renderThumbnail).mock.calls[0][0];
      finish({
        ...submitted,
        styleId: "pixel",
        backend: "rust-cpu",
        timings,
        frame: {
          version: 1,
          width: 2,
          height: 1,
          rgba: new Uint8Array(8).fill(17),
        },
      });
      await hover;
      expect(h.runtime.getHoverFrame()).toBeNull();
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().status).toBe("ready"),
      );
      await h.runtime.hoverStyle("characters");
      expect(h.runtime.getHoverFrame()?.rgba[0]).toBe(7);
      const capability = h.service as unknown as {
        thumbnailProfileVersion: 1 | null;
      };
      capability.thumbnailProfileVersion = null;
      h.emitStatus();
      expect(h.runtime.getHoverFrame()).toBeNull();
      expect(await h.runtime.requestThumbnail("pixel")).toBeNull();
      capability.thumbnailProfileVersion = 1;
      h.emitStatus();
      expect((await h.runtime.requestThumbnail("mosaic"))?.rgba[0]).toBe(27);
    } finally {
      await h.runtime.dispose();
    }
  });
  it("keeps a replaced-source thumbnail reservation until terminal and rejects its old pixels", async () => {
    const h = harness();
    try {
      await h.runtime.controller.loadFile(new File(["x"], "one.png"));
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().status).toBe("ready"),
      );
      let finish!: (
        value: Awaited<ReturnType<RenderService["renderThumbnail"]>>,
      ) => void;
      const held = new Promise<
        Awaited<ReturnType<RenderService["renderThumbnail"]>>
      >((resolve) => {
        finish = resolve;
      });
      vi.mocked(h.service.renderThumbnail).mockImplementationOnce(() => held);
      const old = h.runtime.requestThumbnail("pixel").catch((error) => error);
      await vi.waitFor(() =>
        expect(h.service.renderThumbnail).toHaveBeenCalledTimes(1),
      );
      const submitted = vi.mocked(h.service.renderThumbnail).mock.calls[0][0];
      expect(
        await h.runtime.controller.loadFile(new File(["y"], "two.png")),
      ).toBe(true);
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().status).toBe("ready"),
      );
      expect(h.runtime.getSnapshot().project.source?.id).not.toBe(
        submitted.sourceId,
      );
      expect(h.runtime.heldFrameBytes).toBeGreaterThan(
        h.runtime.getFrame()!.frame.rgba.buffer.byteLength,
      );
      finish({
        ...submitted,
        styleId: "pixel",
        backend: "rust-cpu",
        timings,
        frame: {
          version: 1,
          width: 2,
          height: 1,
          rgba: new Uint8Array(8).fill(17),
        },
      });
      expect(await old).toMatchObject({ name: "AbortError" });
      expect((await h.runtime.requestThumbnail("pixel"))?.rgba[0]).toBe(17);
      expect(
        vi.mocked(h.service.renderThumbnail).mock.calls.at(-1)?.[0].sourceId,
      ).toBe(h.runtime.getSnapshot().project.source?.id);
    } finally {
      await h.runtime.dispose();
    }
  });
  it("publishes only currently negotiated reviewed bindings and responds to lost/recovered capability", async () => {
    const h = harness();
    const capability = h.service as unknown as {
      styleProfileVersion: 1 | null;
      supportedStyleIds: string[];
      charactersProfileVersion: 1 | null;
    };
    try {
      expect(h.runtime.getAvailableStyleIds()).toEqual([
        "characters",
        "pixel",
        "mosaic",
      ]);
      capability.supportedStyleIds = ["pixel", "braille"];
      expect(h.runtime.getAvailableStyleIds()).toEqual([
        "characters",
        "pixel",
        "braille",
      ]);
      capability.styleProfileVersion = null;
      expect(h.runtime.getAvailableStyleIds()).toEqual(["characters"]);
      capability.charactersProfileVersion = null;
      expect(h.runtime.getAvailableStyleIds()).toEqual([]);
      capability.styleProfileVersion = 1;
      capability.supportedStyleIds = ["mosaic"];
      expect(h.runtime.getAvailableStyleIds()).toEqual(["mosaic"]);
    } finally {
      await h.runtime.dispose();
    }
  });
  it("prepares ordered Braille atlas and retains its identity in previews, thumbnails and captured exports", async () => {
    const h = harness(41, 27);
    (
      h.service as unknown as { supportedStyleIds: string[] }
    ).supportedStyleIds.push("braille");
    try {
      await h.runtime.controller.loadFile(new File(["x"], "braille.png"));
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().status).toBe("ready"),
      );
      h.runtime.controller.selectStyle("braille");
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().frame?.styleId).toBe("braille"),
      );
      const input = h.measure.mock.calls.at(-1)![0];
      expect(input.ramp).toBe(
        Array.from({ length: 256 }, (_, i) =>
          String.fromCodePoint(0x2800 + i),
        ).join(""),
      );
      expect(input.cellWidth).toBe(6.6);
      expect(input.cellHeight).toBe(11);
      const id = h.runtime.getSnapshot().frame!.calibrationId;
      expect(id).not.toBe("");
      expect(h.jobs.at(-1)?.calibrationId).toBe(id);
      expect(
        vi.mocked(h.service.renderStylePreview).mock.calls.at(-1)?.[2],
      ).toBeDefined();
      await h.runtime.requestThumbnail("braille");
      expect(
        vi.mocked(h.service.renderThumbnail).mock.calls.at(-1)?.[0]
          .calibrationId,
      ).not.toBe("");
      const s = h.runtime.getSnapshot();
      const captured = await h.runtime.renderCaptured(
        { project: s.project, revision: s.revision, jobId: 89, generation: 1 },
        2,
        new AbortController().signal,
      );
      expect(captured.result.frame.width).toBe(82);
      expect(captured.result.calibrationId).not.toBe("");
      expect(h.measure.mock.calls.at(-1)![0].cellWidth).toBe(13.2);
      h.runtime.controller.selectStyle("characters");
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().frame?.styleId).toBe("characters"),
      );
      expect(captured.result.frame.width).toBe(82);
      captured.release();
      h.runtime.controller.undo();
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().frame?.styleId).toBe("braille"),
      );
      const accepted = h.runtime.getFrame();
      h.renderStylePreview.mockRejectedValueOnce(new Error("native failure"));
      h.runtime.controller.patchParameter("brailleThreshold", 75);
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().status).toBe("error"),
      );
      expect(h.runtime.getFrame()).toBe(accepted);
    } finally {
      await h.runtime.dispose();
    }
  });
  it("prepares none, renders Pixel then Mosaic without dummy calibration", async () => {
    const h = harness();
    try {
      expect(
        await h.runtime.controller.loadFile(new File(["x"], "a.png")),
      ).toBe(true);
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().status).toBe("ready"),
      );
      h.measure.mockClear();
      h.setAtlas.mockClear();
      expect(h.runtime.controller.selectStyle("pixel")).toBe(true);
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().frame?.styleId).toBe("pixel"),
      );
      expect(h.runtime.getSnapshot().frame?.calibrationId).toBe("");
      expect(h.runtime.getFrame()?.frame.rgba[0]).toBe(18);
      expect(h.measure).not.toHaveBeenCalled();
      expect(h.setAtlas).not.toHaveBeenCalled();
      expect(h.jobs.at(-1)?.settings.styleId).toBe("pixel");
      h.runtime.controller.selectStyle("mosaic");
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().frame?.styleId).toBe("mosaic"),
      );
      expect(h.jobs.at(-1)?.settings.parameters.mosaicShape).toBe("square");
      expect(
        h.runtime.exportAvailability({ format: "png", scale: 2 }),
      ).toMatchObject({ available: true, width: 6, height: 4 });
    } finally {
      await h.runtime.dispose();
    }
  });

  it("rejects stale style identity before publication", async () => {
    const h = harness();
    try {
      await h.runtime.controller.loadFile(new File(["x"], "a.png"));
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().status).toBe("ready"),
      );
      h.renderStylePreview.mockImplementationOnce(async (r) => ({
        jobId: r.jobId,
        revision: r.revision,
        sourceId: r.sourceId,
        sourceRevision: r.sourceRevision,
        calibrationId: "",
        styleId: "mosaic",
        backend: "rust-cpu",
        timings,
        frame: {
          version: 1,
          width: r.settings.frameWidth,
          height: r.settings.frameHeight,
          rgba: new Uint8Array(
            r.settings.frameWidth * r.settings.frameHeight * 4,
          ),
        },
      }));
      h.runtime.controller.selectStyle("pixel");
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().status).toBe("error"),
      );
      expect(h.runtime.getSnapshot().frame?.styleId).toBe("characters");
      expect(h.runtime.getFrame()?.identity.styleId).toBe("characters");
    } finally {
      await h.runtime.dispose();
    }
  });

  it("retains a captured Characters output through Pixel selection and another atlas", async () => {
    const h = harness();
    try {
      await h.runtime.controller.loadFile(new File(["x"], "a.png"));
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().status).toBe("ready"),
      );
      const snapshot = h.runtime.getSnapshot();
      const capture = await h.runtime.renderCaptured(
        {
          project: snapshot.project,
          revision: snapshot.revision,
          jobId: 99,
          generation: 1,
        },
        1,
        new AbortController().signal,
      );
      expect(capture.result.frame.rgba[0]).toBe(33);
      h.runtime.controller.selectStyle("pixel");
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().frame?.styleId).toBe("pixel"),
      );
      h.runtime.controller.selectStyle("characters");
      h.runtime.controller.patchParameter("charSet", "@#.");
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().frame?.styleId).toBe("characters"),
      );
      expect(h.measure).toHaveBeenCalled();
      expect(capture.result.frame.rgba[0]).toBe(33);
      capture.release();
    } finally {
      await h.runtime.dispose();
    }
  });

  it("retains a captured raster output through glyph selection", async () => {
    const h = harness();
    try {
      await h.runtime.controller.loadFile(new File(["x"], "a.png"));
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().status).toBe("ready"),
      );
      h.runtime.controller.selectStyle("mosaic");
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().frame?.styleId).toBe("mosaic"),
      );
      const snapshot = h.runtime.getSnapshot();
      const capture = await h.runtime.renderCaptured(
        {
          project: snapshot.project,
          revision: snapshot.revision,
          jobId: 101,
          generation: 1,
        },
        1,
        new AbortController().signal,
      );
      h.runtime.controller.selectStyle("characters");
      h.runtime.controller.patchParameter("charSet", "@#.");
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().frame?.styleId).toBe("characters"),
      );
      expect(capture.result.frame.rgba[0]).toBe(18);
      capture.release();
    } finally {
      await h.runtime.dispose();
    }
  });

  it("keeps the accepted raster frame exportable after an oversized export is refused", async () => {
    const h = harness(600, 600);
    try {
      await h.runtime.controller.loadFile(new File(["x"], "large.png"));
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().status).toBe("ready"),
      );
      h.runtime.controller.selectStyle("pixel");
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().frame?.styleId).toBe("pixel"),
      );
      const accepted = h.runtime.getFrame();
      expect(
        h.runtime.exportAvailability({ format: "png", scale: 4 }),
      ).toMatchObject({ available: false });
      expect(h.runtime.getFrame()).toBe(accepted);
      expect(
        h.runtime.exportAvailability({ format: "png", scale: 1 }),
      ).toMatchObject({ available: true });
    } finally {
      await h.runtime.dispose();
    }
  });

  it("charges a retained large Characters atlas before admitting a near-cap raster export", async () => {
    const h = harness(600, 600);
    h.measure.mockImplementation(async (input) => {
      const base = measuredAtlasFixture(input);
      const maskWidth = 1024;
      const maskHeight = 1024;
      const key = JSON.parse(base.calibration.fontKey) as unknown[];
      key[1] = maskWidth;
      key[2] = maskHeight;
      return {
        ...base,
        calibration: {
          ...base.calibration,
          fontKey: JSON.stringify(key),
          maskWidth,
          maskHeight,
          masks: new Uint8Array(
            maskWidth * maskHeight * base.calibration.glyphs.length,
          ),
        },
      };
    });
    try {
      await h.runtime.controller.loadFile(new File(["x"], "atlas.png"));
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().frame?.styleId).toBe("characters"),
      );
      h.runtime.controller.selectStyle("pixel");
      await vi.waitFor(() =>
        expect(h.runtime.getSnapshot().frame?.styleId).toBe("pixel"),
      );
      const accepted = h.runtime.getFrame();
      expect(accepted?.frame.rgba[0]).toBe(18);
      expect(
        h.runtime.exportAvailability({ format: "png", scale: 3 }),
      ).toMatchObject({ available: false });
      expect(h.runtime.getFrame()).toBe(accepted);
      expect(
        h.runtime.exportAvailability({ format: "png", scale: 1 }),
      ).toMatchObject({ available: true });
    } finally {
      await h.runtime.dispose();
    }
  });
});
