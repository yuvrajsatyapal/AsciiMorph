// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { createRenderService } from "./service";
import { RenderError } from "./protocol";
import { createWorkerRuntime } from "./worker-runtime";
import type { CharacterEngine } from "./wasm-character";
import type {
  CharacterSettingsV1,
  GlyphCalibrationV1,
  PackedGlyphGrid,
} from "./character-contract";
const settings: CharacterSettingsV1 = {
  version: 1,
  width: 1,
  height: 1,
  cellWidth: 10,
  cellHeight: 18,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  rotation: 0,
  brightness: 0,
  contrast: 0,
  gamma: 1,
  saturation: 100,
  density: 1,
  sharpness: 0,
  edge: 0,
  shapeAware: false,
  smartEdges: false,
  mappingInvert: false,
  outputInvert: false,
  mode: "color",
  fg: 0xffffff,
  bg: null,
  mapping: "glyph",
  dither: "none",
  seed: 0,
};
const source = () => ({
  id: "src",
  revision: 1,
  width: 1,
  height: 1,
  rgba: new Uint8ClampedArray([255, 255, 255, 255]),
});
const calibration = (): GlyphCalibrationV1 => ({
  version: 1,
  id: "cal",
  fontKey: "mono",
  cellWidth: 10,
  cellHeight: 18,
  glyphs: [" ", "#"],
  maskWidth: 1,
  maskHeight: 1,
  masks: new Uint8Array([0, 255]),
  coverage: new Float32Array([0, 1]),
  shapes: new Float32Array(18),
});
const request = (id = "job") => ({
  jobId: id,
  revision: 1,
  sourceId: "src",
  sourceRevision: 1,
  calibrationId: "cal",
  settings,
  timeUs: 0,
});
const grid = (): PackedGlyphGrid => ({
  version: 1,
  width: 1,
  height: 1,
  cellWidth: 10,
  cellHeight: 18,
  calibrationId: "cal",
  glyphIndices: new Uint16Array([1]),
  foreground: new Uint8Array([255, 255, 255, 255]),
  background: new Uint8Array(4),
  alpha: new Float32Array([1]),
});
const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
class TestWorker {
  listeners = new Map<string, Set<(event: { data: unknown }) => void>>();
  sent: unknown[] = [];
  transfers: Transferable[][] = [];
  terminate = vi.fn(() => this.runtime.dispose());
  steps = 1;
  next = 0;
  counts = new Map<number, number>();
  engine: CharacterEngine = {
    charactersProfileAvailable: false,
    charactersContextVersion: null,
    charactersAtlasRetentionVersion: null,
    setAtlas: vi.fn(),
    beginCharacters: vi.fn(),
    takeFrame: vi.fn(),
    setSource: vi.fn(),
    setCalibration: vi.fn(),
    begin: vi.fn(() => {
      this.counts.set(++this.next, 0);
      return this.next;
    }),
    step: vi.fn((id) => {
      const n = this.counts.get(id)! + 1;
      this.counts.set(id, n);
      return n >= this.steps ? "complete" : "pending";
    }),
    takeGrid: vi.fn(grid),
    cancel: vi.fn(),
    dispose: vi.fn(),
  };
  createEngine = vi.fn(async () => this.engine);
  controlledTime = 0;
  runtime = createWorkerRuntime({
    now: () => (this.controlledTime += 4),
    createEngine: this.createEngine,
    postMessage: (data, transfer = []) => {
      const transported = structuredClone(data, { transfer });
      setTimeout(() => this.emit("message", transported), 0);
    },
  });
  addEventListener(type: string, fn: (event: { data: unknown }) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(fn);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, fn: (event: { data: unknown }) => void) {
    this.listeners.get(type)?.delete(fn);
  }
  postMessage(data: unknown, transfer: Transferable[] = []) {
    this.sent.push(data);
    this.transfers.push(transfer);
    const transported = structuredClone(data, { transfer });
    setTimeout(() => this.runtime.receive(transported), 0);
  }
  emit(type: string, data: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn({ data });
  }
  asWorker() {
    return this as unknown as Worker;
  }
}
function setup() {
  const workers: TestWorker[] = [];
  const factory = vi.fn(() => {
    const w = new TestWorker();
    workers.push(w);
    return w.asWorker();
  });
  const service = createRenderService({ workerFactory: factory });
  return {
    service,
    factory,
    workers,
    ready: async () => {
      await service.initialize();
      await service.setSource(source());
      await service.setCalibration(calibration());
    },
  };
}
describe("persistent render service", () => {
  it("one_worker_and_initialization_for_100_renders", async () => {
    const h = setup();
    await h.ready();
    for (let i = 0; i < 100; i++) {
      await h.service.setSource(source());
      await h.service.setCalibration(calibration());
      expect((await h.service.renderPreview(request(String(i)))).backend).toBe(
        "rust-cpu",
      );
    }
    expect(h.factory).toHaveBeenCalledOnce();
    const w = h.workers[0];
    expect(w.createEngine).toHaveBeenCalledOnce();
    expect(w.engine.setSource).toHaveBeenCalledOnce();
    expect(w.engine.setCalibration).toHaveBeenCalledOnce();
    await h.service.setSource({ ...source(), revision: 2 });
    expect(w.engine.setSource).toHaveBeenCalledTimes(2);
    await h.service.setCalibration({ ...calibration(), id: "cal2" });
    expect(w.engine.setCalibration).toHaveBeenCalledTimes(2);
    await h.service.dispose();
  });
  it("abort_cancels_without_terminating", async () => {
    const h = setup();
    await h.ready();
    const w = h.workers[0];
    w.steps = 100;
    const abort = new AbortController();
    const p = h.service.renderPreview(request(), abort.signal);
    const rejected = expect(p).rejects.toMatchObject({ code: "Cancelled" });
    setTimeout(() => abort.abort(), 5);
    await rejected;
    expect(w.terminate).not.toHaveBeenCalled();
    await h.service.dispose();
  });
  it("late_result_is_ignored", async () => {
    const h = setup();
    await h.ready();
    const w = h.workers[0];
    w.steps = 3;
    const p = h.service.renderPreview(request());
    await Promise.resolve();
    const message = w.sent.at(-1) as { requestId: string };
    let settled = false;
    void p.then(() => {
      settled = true;
    });
    w.emit("message", {
      version: 1,
      requestId: message.requestId,
      jobId: "job",
      revision: 1,
      sourceId: "src",
      sourceRevision: 2,
      calibrationId: "cal",
      type: "result",
      grid: grid(),
      backend: "rust-cpu",
      timings: { queueMs: 0, computeMs: 0, readbackMs: 0, totalMs: 0 },
    });
    await delay();
    expect(settled).toBe(false);
    expect((await p).jobId).toBe("job");
    await h.service.dispose();
  });
  it("worker_failure_rejects_all_waiters", async () => {
    const h = setup();
    await h.ready();
    const old = h.workers[0];
    old.steps = 100;
    const p = h.service.renderPreview(request());
    const q = h.service.renderExport({
      ...request("export"),
      outputWidth: 1,
      outputHeight: 1,
    });
    const rejections = [
      expect(p).rejects.toMatchObject({
        code: "WorkerFailure",
        recoverable: true,
      }),
      expect(q).rejects.toMatchObject({ code: "WorkerFailure" }),
    ];
    old.emit("error", {});
    await Promise.all(rejections);
    expect(h.factory).toHaveBeenCalledOnce();
    await h.service.initialize();
    expect(h.factory).toHaveBeenCalledTimes(2);
    const current = h.workers[1];
    expect(current.engine.setSource).toHaveBeenCalledOnce();
    expect(current.engine.setCalibration).toHaveBeenCalledOnce();
    expect((await h.service.renderPreview(request("retry"))).jobId).toBe(
      "retry",
    );
    expect(old.terminate).toHaveBeenCalledOnce();
    await h.service.dispose();
  });
  it("retains_copies_and_failed_replacement_does_not_change_recovery", async () => {
    const h = setup();
    await h.service.initialize();
    const input = source(),
      cal = calibration();
    await h.service.setSource(input);
    await h.service.setCalibration(cal);
    const w = h.workers[0];
    expect(input.rgba.byteLength).toBe(4);
    expect(w.transfers.flat()).not.toContain(input.rgba.buffer);
    expect(w.transfers.flat()).not.toContain(cal.masks.buffer);
    vi.mocked(w.engine.setSource).mockImplementationOnce(() => {
      throw new RenderError("InvalidInput", "bad replacement");
    });
    await expect(
      h.service.setSource({ ...source(), revision: 2 }),
    ).rejects.toThrow();
    input.rgba.fill(0);
    cal.masks.fill(0);
    w.emit("error", {});
    await h.service.initialize();
    expect(
      vi.mocked(h.workers[1].engine.setSource).mock.calls[0][0].revision,
    ).toBe(1);
    expect(
      vi.mocked(h.workers[1].engine.setSource).mock.calls[0][0].rgba[0],
    ).toBe(255);
    expect(
      vi.mocked(h.workers[1].engine.setCalibration).mock.calls[0][0].masks[1],
    ).toBe(255);
    await h.service.dispose();
  });
  it("dispose_cleans_listeners_and_terminates_once", async () => {
    const h = setup();
    await h.ready();
    const w = h.workers[0];
    w.steps = 100;
    const p = h.service.renderPreview(request());
    const rejected = expect(p).rejects.toMatchObject({ code: "Disposed" });
    w.postMessage = () => {};
    await h.service.dispose();
    await rejected;
    await h.service.dispose();
    expect(w.terminate).toHaveBeenCalledOnce();
    expect([...w.listeners.values()].every((s) => s.size === 0)).toBe(true);
    await expect(h.service.initialize()).rejects.toMatchObject({
      code: "Disposed",
    });
  });
  it("rejects_invalid_request_and_missing_source_identity", async () => {
    const h = setup();
    await h.ready();
    await expect(
      h.service.renderPreview({ ...request(), sourceRevision: 2 }),
    ).rejects.toMatchObject({ code: "MissingSource" });
    await expect(
      h.service.renderExport({ ...request(), outputWidth: 2, outputHeight: 1 }),
    ).rejects.toMatchObject({ code: "InvalidInput" });
    await h.service.dispose();
  });
});

describe("service transport and lifecycle regressions", () => {
  it("rejects_unknown_request_fields_before_envelope_construction", async () => {
    const h = setup();
    await h.ready();
    for (const extra of [
      { type: "dispose" },
      { requestId: "caller-id" },
      { version: 1 },
    ])
      await expect(
        h.service.renderPreview({ ...request(), ...extra } as ReturnType<
          typeof request
        >),
      ).rejects.toMatchObject({ code: "InvalidInput" });
    expect(h.workers[0].terminate).not.toHaveBeenCalled();
    await h.service.dispose();
  });
  it("rejects_late_messages_from_an_old_worker_generation_even_matching_requestId", async () => {
    const h = setup();
    await h.ready();
    const old = h.workers[0];
    const oldMessage = [...old.listeners.get("message")!][0];
    old.emit("error", {});
    await h.service.initialize();
    const fresh = h.workers[1];
    fresh.steps = 4;
    const p = h.service.renderPreview(request("new"));
    await Promise.resolve();
    const sent = fresh.sent.at(-1) as { requestId: string };
    let settled = false;
    void p.then(() => {
      settled = true;
    });
    oldMessage({
      data: {
        version: 1,
        requestId: sent.requestId,
        type: "result",
        jobId: "new",
        revision: 1,
        sourceId: "src",
        sourceRevision: 1,
        calibrationId: "cal",
        grid: grid(),
        backend: "rust-cpu",
        timings: { queueMs: 0, computeMs: 0, readbackMs: 0, totalMs: 0 },
      },
    });
    await delay();
    expect(settled).toBe(false);
    expect((await p).jobId).toBe("new");
    await h.service.dispose();
  });
  it("dispose_rejects_initialization_without_waiting_for_worker_ack", async () => {
    const w = new TestWorker();
    w.postMessage = () => {};
    const service = createRenderService({ workerFactory: () => w.asWorker() });
    const initializing = service.initialize();
    const rejected = expect(initializing).rejects.toMatchObject({
      code: "Disposed",
    });
    await service.dispose();
    await rejected;
    expect(w.terminate).toHaveBeenCalledOnce();
    expect(service.state).toBe("disposed");
  });
  it("worker_messageerror_rejects_and_capability_failure_requires_caller_retry", async () => {
    const h = setup();
    await h.ready();
    const w = h.workers[0];
    w.steps = 100;
    const p = h.service.renderPreview(request());
    const rejected = expect(p).rejects.toMatchObject({ code: "WorkerFailure" });
    await Promise.resolve();
    w.emit("messageerror", {});
    await rejected;
    expect(h.service.state).toBe("recoverable-error");
    expect(h.factory).toHaveBeenCalledOnce();
    await h.service.dispose();
    const service = createRenderService({
      workerFactory: () => {
        throw new Error("no Worker");
      },
    });
    await expect(service.initialize()).rejects.toMatchObject({
      code: "CapabilityUnavailable",
      recoverable: true,
    });
    expect(service.state).toBe("recoverable-error");
    await service.dispose();
  });
});

it("native_transfer_detaches_only_upload_copies", async () => {
  const h = setup();
  await h.service.initialize();
  const input = source(),
    cal = calibration();
  await h.service.setSource(input);
  await h.service.setCalibration(cal);
  const w = h.workers[0];
  const sentSource = w.sent.find(
    (m) => (m as { type: string }).type === "setSource",
  ) as { source: ReturnType<typeof source> };
  const sentCalibration = w.sent.find(
    (m) => (m as { type: string }).type === "setCalibration",
  ) as { calibration: GlyphCalibrationV1 };
  expect(sentSource.source.rgba.byteLength).toBe(0);
  expect(sentCalibration.calibration.masks.byteLength).toBe(0);
  expect(input.rgba.byteLength).toBe(4);
  expect(cal.masks.byteLength).toBe(2);
  expect((await h.service.renderPreview(request())).grid.glyphIndices[0]).toBe(
    1,
  );
  w.emit("error", {});
  await h.service.initialize();
  expect(
    (await h.service.renderPreview(request("after-recovery"))).grid
      .glyphIndices[0],
  ).toBe(1);
  await h.service.dispose();
});

it("worker_failure_rejects_queued_uploads_without_automatic_recreation", async () => {
  const h = setup();
  await h.ready();
  const w = h.workers[0];
  w.postMessage = () => {};
  const a = h.service.setSource({ ...source(), revision: 2 });
  const b = h.service.setSource({ ...source(), revision: 3 });
  const rejections = [
    expect(a).rejects.toMatchObject({ code: "WorkerFailure" }),
    expect(b).rejects.toMatchObject({ code: "WorkerFailure" }),
  ];
  await Promise.resolve();
  await Promise.resolve();
  w.emit("error", {});
  await Promise.all(rejections);
  await delay();
  expect(h.factory).toHaveBeenCalledOnce();
  expect(h.service.state).toBe("recoverable-error");
  await h.service.initialize();
  expect(
    vi.mocked(h.workers[1].engine.setSource).mock.calls[0][0].revision,
  ).toBe(1);
  await h.service.dispose();
});

it("runtime_worker_failure_rejects_all_jobs_and_marks_recovery_state", async () => {
  const h = setup();
  await h.ready();
  const w = h.workers[0];
  w.steps = 100;
  vi.mocked(w.engine.step).mockImplementationOnce(() => {
    throw new WebAssembly.RuntimeError("trap");
  });
  const a = h.service.renderPreview(request("trap"));
  const b = h.service.renderExport({
    ...request("export"),
    outputWidth: 1,
    outputHeight: 1,
  });
  await Promise.all([
    expect(a).rejects.toMatchObject({ code: "WorkerFailure" }),
    expect(b).rejects.toMatchObject({ code: "WorkerFailure" }),
  ]);
  expect(h.service.state).toBe("recoverable-error");
  expect(w.terminate).toHaveBeenCalledOnce();
  expect(h.factory).toHaveBeenCalledOnce();
  await h.service.dispose();
});

describe("Task 6 review fatal-response regressions", () => {
  it.each([
    ["WorkerFailure", "aborted-render"],
    ["CapabilityUnavailable", "aborted-render"],
    ["WorkerFailure", "cancel-message"],
    ["CapabilityUnavailable", "cancel-message"],
  ] as const)(
    "current %s for %s rejects other work after local abort",
    async (code, fatalFor) => {
      const h = setup();
      await h.ready();
      const w = h.workers[0];
      w.postMessage = (data) => {
        w.sent.push(data);
      };
      const abort = new AbortController();
      const preview = h.service.renderPreview(request("aborted"), abort.signal);
      const exported = h.service.renderExport({
        ...request("other"),
        outputWidth: 1,
        outputHeight: 1,
      });
      const exportOutcome = exported.then(
        () => "result",
        (error) => (error as RenderError).code,
      );
      const cancelled = expect(preview).rejects.toMatchObject({
        code: "Cancelled",
      });
      await Promise.resolve();
      abort.abort();
      await cancelled;
      const sent = w.sent.find(
        (m) =>
          (m as { type: string; jobId?: string }).type === "renderPreview" &&
          (m as { jobId?: string }).jobId === "aborted",
      ) as { requestId: string };
      const cancel = w.sent.find(
        (m) => (m as { type: string }).type === "cancel",
      ) as { requestId: string };
      w.emit("message", {
        version: 1,
        requestId:
          fatalFor === "aborted-render" ? sent.requestId : cancel.requestId,
        type: "error",
        jobId: "aborted",
        revision: 1,
        sourceId: "src",
        sourceRevision: 1,
        calibrationId: "cal",
        error: { code, message: "fatal after local abort", recoverable: true },
      });
      try {
        expect(h.service.state).toBe("recoverable-error");
        expect(await exportOutcome).toBe(code);
        expect(w.terminate).toHaveBeenCalledOnce();
        expect(h.factory).toHaveBeenCalledOnce();
      } finally {
        await h.service.dispose();
      }
    },
  );
  it("stale_generation_fatal_response_does_not_fail_current_connection", async () => {
    const h = setup();
    await h.ready();
    const old = h.workers[0];
    const oldMessage = [...old.listeners.get("message")!][0];
    old.emit("error", {});
    await h.service.initialize();
    oldMessage({
      data: {
        version: 1,
        requestId: "old-unmatched",
        type: "error",
        error: {
          code: "WorkerFailure",
          message: "stale trap",
          recoverable: true,
        },
      },
    });
    expect(h.service.state).toBe("ready");
    expect(h.workers[1].terminate).not.toHaveBeenCalled();
    expect((await h.service.renderPreview(request("still-valid"))).jobId).toBe(
      "still-valid",
    );
    await h.service.dispose();
  });
});

it("abort_cancel_trap_rejects_the_other_lane_through_real_runtime_transport", async () => {
  const h = setup();
  await h.ready();
  const w = h.workers[0];
  w.steps = 1000;
  const abort = new AbortController();
  const preview = h.service.renderPreview(request("aborted"), abort.signal);
  const exported = h.service.renderExport({
    ...request("other"),
    outputWidth: 1,
    outputHeight: 1,
  });
  const cancelled = expect(preview).rejects.toMatchObject({
    code: "Cancelled",
  });
  const failed = expect(exported).rejects.toMatchObject({
    code: "WorkerFailure",
    recoverable: true,
  });
  await vi.waitFor(() => expect(w.engine.begin).toHaveBeenCalledTimes(2), {
    interval: 1,
  });
  vi.mocked(w.engine.cancel).mockImplementationOnce(() => {
    throw new WebAssembly.RuntimeError("cancel after abort trap");
  });
  abort.abort();
  await cancelled;
  await failed;
  expect(h.service.state).toBe("recoverable-error");
  expect(w.terminate).toHaveBeenCalledOnce();
  expect(w.engine.dispose).toHaveBeenCalledOnce();
  expect(h.factory).toHaveBeenCalledOnce();
  await h.service.initialize();
  expect((await h.service.renderPreview(request("recovered"))).jobId).toBe(
    "recovered",
  );
  await h.service.dispose();
  expect(w.terminate).toHaveBeenCalledOnce();
});
