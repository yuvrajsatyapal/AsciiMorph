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
  };
}

describe("Studio raster service integration", () => {
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
      expect(h.runtime.getAvailableStyleIds()).toEqual(["characters", "pixel"]);
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
