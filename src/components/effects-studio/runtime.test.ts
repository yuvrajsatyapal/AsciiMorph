import { describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import type { StudioRuntimeOptions } from "./runtime";
import { createStudioRuntime } from "./runtime";
import { REFERENCE_MONOSPACE_STACK } from "@/render/glyph-calibration";
import type { ReferenceCharacterCalibrationInput } from "@/render/glyph-calibration";
import type { ReferenceCharacterAtlasV1 } from "@/render/reference-characters";
import { measuredAtlasFixture as atlas } from "./runtime-fixtures";
import type {
  CharactersRenderRequest,
  CharactersRenderResult,
  RenderService,
} from "@/render/service";
import type { SourceUpload } from "@/render/character-contract";
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function result(r: CharactersRenderRequest, value = 8): CharactersRenderResult {
  return {
    jobId: r.jobId,
    revision: r.revision,
    sourceId: r.sourceId,
    sourceRevision: r.sourceRevision,
    calibrationId: r.calibrationId,
    frame: {
      version: 1,
      width: r.settings.frameWidth,
      height: r.settings.frameHeight,
      rgba: new Uint8Array(
        r.settings.frameWidth * r.settings.frameHeight * 4,
      ).fill(value),
      grid: null,
    },
    backend: "rust-cpu",
    timings: { queueMs: 0, computeMs: 0, readbackMs: 0, totalMs: 0 },
  };
}
function harness(options: Partial<StudioRuntimeOptions> = {}) {
  const services: RenderService[] = [];
  const uploads: SourceUpload[] = [];
  const renders: CharactersRenderRequest[] = [];
  const render = vi.fn(async (r: CharactersRenderRequest) => result(r));
  const factory = vi.fn(() => {
    const service = {
      state: "ready",
      charactersProfileVersion: 1,
      charactersContextVersion: 1,
      charactersAtlasRetentionVersion: 1,
      initialize: vi.fn(async () => {}),
      setSource: vi.fn(async (s: SourceUpload) => {
        uploads.push(s);
      }),
      setAtlas: vi.fn(async () => {}),
      renderCharactersPreview: vi.fn(async (r: CharactersRenderRequest) => {
        renders.push(r);
        return render(r);
      }),
      renderCharactersExport: vi.fn(async (r: CharactersRenderRequest) =>
        result(r, 99),
      ),
      dispose: vi.fn(async () => {}),
    } as unknown as RenderService;
    services.push(service);
    return service;
  });
  const measure = vi.fn(async (i: ReferenceCharacterCalibrationInput) =>
    atlas(i),
  );
  let id = 0;
  const runtime = createStudioRuntime({
    createService: factory,
    calibrate: measure,
    decodeFile: async () => ({
      width: 3,
      height: 2,
      rgba: new Uint8ClampedArray(24).fill(7),
    }),
    createId: () => `source-${++id}`,
    ...options,
  });
  return { runtime, services, factory, uploads, renders, render, measure };
}
const tick = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
const load = async (h: ReturnType<typeof harness>) => {
  expect(await h.runtime.controller.loadFile(new File(["x"], "x"))).toBe(true);
  await tick();
};
describe("production Studio runtime ownership", () => {
  it("uses canonical measured geometry, exact adapter and publishes bytes only with controller acceptance", async () => {
    const h = harness();
    const pending = deferred<CharactersRenderResult>();
    h.render.mockImplementationOnce(() => pending.promise);
    const observed: Array<[number | null, number | null]> = [];
    h.runtime.subscribe(() =>
      observed.push([
        h.runtime.getSnapshot().frame?.revision ?? null,
        h.runtime.getFrame()?.identity.revision ?? null,
      ]),
    );
    await load(h);
    expect(h.runtime.getFrame()).toBeNull();
    expect(h.measure).toHaveBeenCalledWith(
      expect.objectContaining({
        fontFamily: REFERENCE_MONOSPACE_STACK,
        fontSize: 11,
        cellWidth: 6.6,
        cellHeight: 11,
      }),
      expect.any(AbortSignal),
    );
    pending.resolve(result(h.renders[0]));
    await tick();
    expect(h.runtime.getFrame()?.frame.rgba[0]).toBe(8);
    expect(observed.every(([a, b]) => a === b)).toBe(true);
    expect(h.runtime.getSnapshot().project).not.toHaveProperty("revision");
    const before = h.renders.length;
    h.runtime.controller.setView({ zoom: 3 });
    await tick();
    expect(h.renders).toHaveLength(before);
    expect(h.runtime.heldFrameBytes).toBe(24);
    const release = h.runtime.retainCanvas({ width: 3, height: 2 });
    expect(h.runtime.heldFrameBytes).toBe(48);
    release();
    expect(h.runtime.heldFrameBytes).toBe(24);
    expect(h.runtime.getOriginal()?.rgba.buffer).toBe(h.uploads[0].rgba.buffer);
    await h.runtime.dispose();
    expect(h.runtime.heldFrameBytes).toBe(0);
    expect(h.factory).toHaveBeenCalledTimes(1);
  });
  it("discards old previews and never publishes captured export frames", async () => {
    const h = harness();
    await load(h);
    const first = h.runtime.getFrame();
    const old = deferred<CharactersRenderResult>();
    h.render.mockImplementationOnce(() => old.promise);
    h.runtime.controller.patchParameter("brightness", 10);
    await tick();
    const oldRequest = h.renders.at(-1)!;
    h.runtime.controller.patchParameter("brightness", 20);
    await tick();
    const accepted = h.runtime.getFrame();
    old.resolve(result(oldRequest, 1));
    await tick();
    expect(h.runtime.getFrame()).toBe(accepted);
    expect(accepted).not.toBe(first);
    const c = h.runtime.controller.getSnapshot();
    const capture = await h.runtime.renderCaptured(
      { project: c.project, revision: c.revision, jobId: 100, generation: 1 },
      1,
      new AbortController().signal,
    );
    expect(h.runtime.getFrame()).toBe(accepted);
    capture.release();
    await h.runtime.dispose();
  });
  it("recreates an empty service for rollback, invalidates preparation and does not recreate during disposal", async () => {
    const h = harness();
    await load(h);
    const old = h.runtime.getFrame();
    const fail = h.services[0].setSource as ReturnType<typeof vi.fn>;
    fail.mockRejectedValueOnce(new Error("ack failed"));
    expect(await h.runtime.controller.loadFile(new File(["bad"], "bad"))).toBe(
      false,
    );
    await tick();
    expect(h.services).toHaveLength(2);
    expect(h.services[0].dispose).toHaveBeenCalledTimes(1);
    expect(h.runtime.getSnapshot().project.source?.id).toBe(
      old?.identity.sourceId,
    );
    expect(h.runtime.getFrame()?.identity.sourceId).toBe(
      old?.identity.sourceId,
    );
    await h.runtime.dispose();
    expect(h.services).toHaveLength(2);
    expect(h.services[1].dispose).toHaveBeenCalledTimes(1);
    expect(h.runtime.getOriginal()).toBeNull();
  });
  it("keeps the accepted frame after capability failure and retry invokes real source recovery", async () => {
    const h = harness();
    await load(h);
    const old = h.runtime.getFrame();
    Object.defineProperty(h.services[0], "charactersContextVersion", {
      value: null,
      configurable: true,
    });
    h.runtime.controller.patchParameter("contrast", 5);
    await tick();
    expect(h.runtime.getSnapshot().status).toBe("error");
    expect(h.runtime.getFrame()).toBe(old);
    Object.defineProperty(h.services[0], "charactersContextVersion", {
      value: 1,
    });
    expect(await h.runtime.retry()).toBe(true);
    expect(h.runtime.getSnapshot().status).toBe("ready");
    await h.runtime.dispose();
  });
});

it("reuses measured atlas and its immutable capture on tone edits", async () => {
  const h = harness();
  await load(h);
  const first = (
    h.services[0].renderCharactersPreview as ReturnType<typeof vi.fn>
  ).mock.calls[0][2];
  h.runtime.controller.patchParameter("brightness", 5);
  await tick();
  h.runtime.controller.patchParameter("contrast", 8);
  await tick();
  expect(h.measure).toHaveBeenCalledTimes(1);
  const calls = (
    h.services[0].renderCharactersPreview as ReturnType<typeof vi.fn>
  ).mock.calls;
  expect(calls[1][2]).toBe(first);
  expect(calls[2][2]).toBe(first);
  await h.runtime.dispose();
});

it("counts captured output until its explicit release without publishing it", async () => {
  const h = harness();
  await load(h);
  const before = h.runtime.heldFrameBytes,
    s = h.runtime.getSnapshot();
  const capture = await h.runtime.renderCaptured(
    { project: s.project, revision: s.revision, jobId: 100, generation: 0 },
    1,
    new AbortController().signal,
  );
  expect(h.runtime.heldFrameBytes).toBe(
    before + capture.result.frame.rgba.buffer.byteLength,
  );
  capture.release();
  capture.release();
  expect(h.runtime.heldFrameBytes).toBe(before);
  await h.runtime.dispose();
});

it("rejects a late measured atlas and an old-source result after source replacement", async () => {
  const h = harness();
  await load(h);
  const measurement = deferred<ReferenceCharacterAtlasV1>();
  let oldInput: ReferenceCharacterCalibrationInput | undefined;
  h.measure.mockImplementationOnce(async (input) => {
    oldInput = input;
    return measurement.promise;
  });
  h.runtime.controller.patchParameter("fontSize", 14);
  await tick();
  h.runtime.controller.patchParameter("fontSize", 16);
  await tick();
  const current = h.runtime.getFrame();
  measurement.resolve(atlas(oldInput!));
  await tick();
  expect(h.runtime.getFrame()).toBe(current);
  const pending = deferred<CharactersRenderResult>();
  h.render.mockImplementationOnce(() => pending.promise);
  h.runtime.controller.patchParameter("brightness", 14);
  await tick();
  const old = h.renders.at(-1)!;
  await load(h);
  const replacement = h.runtime.getFrame();
  pending.resolve(result(old, 1));
  await tick();
  expect(h.runtime.getFrame()).toBe(replacement);
  expect(replacement?.identity.sourceId).not.toBe(old.sourceId);
  await h.runtime.dispose();
});

it("blocks rendering until explicit retry repairs a failed source restoration", async () => {
  const h = harness();
  await load(h);
  const previous = h.runtime.getFrame();
  (h.services[0].setSource as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
    new Error("candidate ack failed"),
  );
  h.factory.mockImplementationOnce(() => {
    const value = {
      ...h.services[0],
      setSource: vi.fn(async () => {
        throw new Error("restoration blocked");
      }),
      dispose: vi.fn(async () => {}),
    };
    h.services.push(value);
    return value;
  });
  expect(await h.runtime.controller.loadFile(new File(["bad"], "bad"))).toBe(
    false,
  );
  await tick();
  expect(h.runtime.getFrame()).toBe(previous);
  expect(await h.runtime.controller.retryRenderer()).toBe(false);
  // The actual manager recovery must reset the failed restoration service before
  // reuploading committed pixels; initialize alone cannot unblock readiness.
  expect(await h.runtime.retry()).toBe(true);
  expect(h.services).toHaveLength(3);
  expect(h.runtime.getSnapshot().status).toBe("ready");
  await h.runtime.dispose();
});

it("does not publish late results after disposal", async () => {
  const h = harness();
  await load(h);
  const pending = deferred<CharactersRenderResult>();
  h.render.mockImplementationOnce(() => pending.promise);
  h.runtime.controller.patchParameter("brightness", 1);
  await tick();
  const request = h.renders.at(-1)!;
  await h.runtime.dispose();
  pending.resolve(result(request));
  await tick();
  expect(h.runtime.getFrame()).toBeNull();
  expect(h.runtime.heldFrameBytes).toBe(0);
  expect(h.factory).toHaveBeenCalledTimes(1);
});

it("counts backing capacities once across accepted and captured frame views", async () => {
  const h = harness();
  const backing = new ArrayBuffer(100);
  h.render.mockImplementation(async (request) => ({
    ...result(request),
    frame: { ...result(request).frame, rgba: new Uint8Array(backing, 4, 24) },
  }));
  await load(h);
  expect(h.runtime.heldFrameBytes).toBe(100);
  (
    h.services[0].renderCharactersExport as ReturnType<typeof vi.fn>
  ).mockImplementation(async (request) => ({
    ...result(request),
    frame: { ...result(request).frame, rgba: new Uint8Array(backing, 4, 24) },
  }));
  const state = h.runtime.getSnapshot();
  const capture = await h.runtime.renderCaptured(
    {
      project: state.project,
      revision: state.revision,
      jobId: 999,
      generation: 0,
    },
    1,
    new AbortController().signal,
  );
  expect(h.runtime.heldFrameBytes).toBe(100);
  capture.release();
  expect(h.runtime.heldFrameBytes).toBe(100);
  await h.runtime.dispose();
});

it("bounds captured output ownership until release and permits retry after a render failure", async () => {
  const h = harness();
  await load(h);
  const state = h.runtime.getSnapshot(),
    request = {
      project: state.project,
      revision: state.revision,
      jobId: 999,
      generation: 0,
    },
    signal = new AbortController().signal;
  const capture = await h.runtime.renderCaptured(request, 1, signal);
  await expect(
    h.runtime.renderCaptured({ ...request, jobId: 1000 }, 1, signal),
  ).rejects.toThrow(/captured/i);
  capture.release();
  (
    h.services[0].renderCharactersExport as ReturnType<typeof vi.fn>
  ).mockRejectedValueOnce(new Error("budget exceeded"));
  await expect(h.runtime.renderCaptured(request, 1, signal)).rejects.toThrow(
    "budget exceeded",
  );
  const retried = await h.runtime.renderCaptured(request, 1, signal);
  capture.release();
  await expect(
    h.runtime.renderCaptured({ ...request, jobId: 1001 }, 1, signal),
  ).rejects.toThrow(/captured/i);
  retried.release();
  await h.runtime.dispose();
});

it("retains captured pixels and joins their release during disposal", async () => {
  const h = harness();
  await load(h);
  const state = h.runtime.getSnapshot();
  const capture = await h.runtime.renderCaptured(
    {
      project: state.project,
      revision: state.revision,
      jobId: 999,
      generation: 0,
    },
    1,
    new AbortController().signal,
  );
  let settled = false;
  const disposal = h.runtime.dispose().then(() => {
    settled = true;
  });
  await tick();
  expect(h.runtime.heldFrameBytes).toBe(
    capture.result.frame.rgba.buffer.byteLength,
  );
  expect(settled).toBe(false);
  capture.release();
  await disposal;
  expect(h.runtime.heldFrameBytes).toBe(0);
});

function encoderHarness() {
  const callbacks: BlobCallback[] = [];
  const canvases: Array<{ width: number; height: number }> = [];
  const click = vi.fn(),
    revokeObjectURL = vi.fn();
  const encoder = {
    createCanvas: vi.fn(() => {
      const c = {
        width: 0,
        height: 0,
        getContext: () => ({
          putImageData: vi.fn(),
          fillRect: vi.fn(),
          drawImage: vi.fn(),
        }),
        toBlob: (cb: BlobCallback) => {
          callbacks.push(cb);
        },
      };
      canvases.push(c);
      return c as unknown as HTMLCanvasElement;
    }),
    createImageData: (rgba: Uint8Array, w: number, h: number) =>
      ({ data: new Uint8ClampedArray(rgba), width: w, height: h }) as ImageData,
    createAnchor: () =>
      ({ click, remove: vi.fn() }) as unknown as HTMLAnchorElement,
    createObjectURL: () => "blob:test",
    revokeObjectURL,
    schedule: () => 1,
    unschedule: vi.fn(),
  };
  const finish = () =>
    callbacks.shift()!(
      new NodeBlob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
        type: "image/png",
      }) as unknown as Blob,
    );
  return { encoder, callbacks, canvases, click, finish };
}
it("exports immutable real captured dimensions and holds encoder reservation through cancellation/retirement", async () => {
  const e = encoderHarness(),
    h = harness({
      encoder: e.encoder,
      decodeFile: async () => ({
        width: 13,
        height: 7,
        rgba: new Uint8ClampedArray(364),
      }),
    });
  await load(h);
  h.runtime.controller.setView({ zoom: 4 });
  const first = h.runtime.controller.exportStill({ format: "png", scale: 2 });
  await tick();
  expect(e.canvases[0]).toMatchObject({ width: 26, height: 14 });
  const captured = (
    h.services[0].renderCharactersExport as ReturnType<typeof vi.fn>
  ).mock.calls[0][0];
  expect(captured.settings).toMatchObject({
    frameWidth: 26,
    frameHeight: 14,
    brightness: 0,
  });
  h.runtime.controller.patchParameter("charSet", " .#");
  await tick();
  expect(e.callbacks).toHaveLength(1);
  h.runtime.controller.cancelExport();
  expect(
    await h.runtime.controller.exportStill({ format: "png", scale: 1 }),
  ).toBe(false);
  const held = h.runtime.heldFrameBytes;
  expect(held).toBeGreaterThan(1_114_112);
  let done = false;
  const disposal = h.runtime.dispose().then(() => {
    done = true;
  });
  await tick();
  expect(done).toBe(false);
  expect(e.canvases[0]).toMatchObject({ width: 26, height: 14 });
  expect(h.runtime.heldFrameBytes).toBeGreaterThan(1_114_112);
  e.finish();
  expect(await first).toBe(false);
  await disposal;
  expect(e.click).not.toHaveBeenCalled();
  expect(h.runtime.heldFrameBytes).toBe(0);
  expect(e.canvases[0]).toMatchObject({ width: 0, height: 0 });
});
it("cancels a late encoder Blob on source replacement and charges its reservation to source admission", async () => {
  const e = encoderHarness(),
    observed: number[] = [];
  const h = harness({
    encoder: e.encoder,
    decodeFile: async (_file, options) => {
      observed.push(options.heldBytes ?? 0);
      return { width: 13, height: 7, rgba: new Uint8ClampedArray(364) };
    },
  });
  await load(h);
  const first = h.runtime.controller.exportStill({ format: "png", scale: 1 });
  await tick();
  await load(h);
  expect(observed[1]).toBeGreaterThan(1_114_112);
  e.finish();
  expect(await first).toBe(false);
  expect(e.click).not.toHaveBeenCalled();
  await h.runtime.dispose();
});
it("reports honest scale admission independent of zoom and rejects before encoder allocation", async () => {
  const e = encoderHarness(),
    h = harness({
      encoder: e.encoder,
      decodeFile: async () => ({
        width: 1000,
        height: 1000,
        rgba: new Uint8ClampedArray(4_000_000),
      }),
    });
  expect(
    h.runtime.exportAvailability({ format: "png", scale: 1 }).available,
  ).toBe(false);
  await load(h);
  const before = h.runtime.exportAvailability({ format: "png", scale: 3 });
  expect(before).toMatchObject({ available: false });
  expect(before.reason).toMatch(/budget/i);
  h.runtime.controller.setView({ zoom: 0.5 });
  expect(h.runtime.exportAvailability({ format: "png", scale: 3 })).toEqual(
    before,
  );
  expect(
    await h.runtime.controller.exportStill({ format: "png", scale: 3 }),
  ).toBe(false);
  expect(e.encoder.createCanvas).not.toHaveBeenCalled();
  await h.runtime.dispose();
});

it("rejects surplus result backing capacity before canvas allocation and releases the capture", async () => {
  const e = encoderHarness(),
    h = harness({ encoder: e.encoder });
  await load(h);
  const exportRender = h.services[0].renderCharactersExport as ReturnType<
    typeof vi.fn
  >;
  exportRender.mockImplementationOnce(async (request) => ({
    ...result(request),
    frame: {
      ...result(request).frame,
      rgba: new Uint8Array(new ArrayBuffer(268_435_456), 0, 24),
    },
  }));
  expect(
    await h.runtime.controller.exportStill({ format: "png", scale: 1 }),
  ).toBe(false);
  expect(e.encoder.createCanvas).not.toHaveBeenCalled();
  expect(h.runtime.heldFrameBytes).toBe(24);
  await h.runtime.dispose();
});
it("charges actual completed Blob ownership until URL cleanup and refreshes export availability", async () => {
  const e = encoderHarness(),
    timers: Array<() => void> = [],
    h = harness({
      encoder: {
        ...e.encoder,
        schedule: (cb) => {
          timers.push(cb);
          return 1;
        },
      },
    });
  await load(h);
  const first = h.runtime.controller.exportStill({ format: "png", scale: 1 });
  await tick();
  e.finish();
  expect(await first).toBe(true);
  expect(h.runtime.heldFrameBytes).toBe(32);
  const listener = vi.fn();
  const release = h.runtime.subscribe(listener);
  timers[0]();
  expect(h.runtime.heldFrameBytes).toBe(24);
  expect(listener).toHaveBeenCalledOnce();
  release();
  await h.runtime.dispose();
});
