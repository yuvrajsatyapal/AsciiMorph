import { describe, it, expect, vi } from "vitest";
import { createWorkerRuntime } from "./worker-runtime";
import {
  RenderError,
  validateWorkerRequest,
  validateWorkerResponse,
} from "./protocol";
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
const job = (id: string, type = "renderPreview") => ({
  version: 1,
  requestId: id,
  type,
  jobId: id,
  revision: 1,
  sourceId: "src",
  sourceRevision: 1,
  calibrationId: "cal",
  settings,
  timeUs: 0,
  ...(type === "renderExport" ? { outputWidth: 1, outputHeight: 1 } : {}),
});
const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
function harness(steps = 4) {
  const messages: unknown[] = [],
    transfers: Transferable[][] = [],
    calls: number[] = [],
    counts = new Map<number, number>(),
    active = new Set<number>();
  let next = 0;
  const engine: CharacterEngine = {
    setSource: vi.fn(() => active.clear()),
    setCalibration: vi.fn(() => active.clear()),
    begin: vi.fn(() => {
      expect(active.size).toBeLessThan(2);
      counts.set(++next, 0);
      active.add(next);
      return next;
    }),
    step: vi.fn((id, work) => {
      expect(work).toBe(4096);
      calls.push(id);
      const n = counts.get(id)! + 1;
      counts.set(id, n);
      return n >= steps ? "complete" : "pending";
    }),
    takeGrid: vi.fn((id) => {
      active.delete(id);
      return grid();
    }),
    cancel: vi.fn((id) => {
      active.delete(id);
    }),
    dispose: vi.fn(),
  };
  const runtime = createWorkerRuntime({
    createEngine: async () => engine,
    postMessage: (m, t = []) => {
      messages.push(m);
      transfers.push(t);
    },
  });
  const send = (value: unknown) => runtime.receive(value);
  const ready = async () => {
    send({
      version: 1,
      requestId: "init",
      type: "initialize",
      memoryBudgetBytes: 1_000_000,
    });
    await delay();
    send({ version: 1, requestId: "src", type: "setSource", source: source() });
    send({
      version: 1,
      requestId: "cal",
      type: "setCalibration",
      calibration: calibration(),
    });
  };
  return { messages, transfers, calls, engine, send, ready, runtime };
}
describe("worker runtime", () => {
  it("cancel_processed_between_wasm_steps", async () => {
    const h = harness(20);
    await h.ready();
    h.send(job("a"));
    setTimeout(
      () =>
        h.send({
          version: 1,
          requestId: "cancel",
          type: "cancel",
          targetRequestId: "a",
          jobId: "a",
          revision: 1,
          sourceId: "src",
          sourceRevision: 1,
          calibrationId: "cal",
        }),
      0,
    );
    await delay(40);
    expect(h.calls.length).toBeGreaterThan(0);
    expect(h.calls.length).toBeLessThan(20);
    expect(h.messages).toContainEqual(
      expect.objectContaining({ type: "cancelled", requestId: "a" }),
    );
    expect(h.engine.dispose).not.toHaveBeenCalled();
    h.runtime.dispose();
  });
  it("preview_supersedes_active_and_pending", async () => {
    const h = harness();
    await h.ready();
    h.send(job("a"));
    await delay(2);
    h.send(job("b"));
    h.send(job("c"));
    await delay(60);
    for (const id of ["a", "b"])
      expect(h.messages).toContainEqual(
        expect.objectContaining({ type: "cancelled", requestId: id }),
      );
    expect(h.messages).toContainEqual(
      expect.objectContaining({ type: "result", requestId: "c" }),
    );
    expect(h.engine.begin).toHaveBeenCalledTimes(2);
    expect(h.engine.cancel).toHaveBeenCalledOnce();
    h.runtime.dispose();
  });
  it("export_queue_is_bounded", async () => {
    const h = harness();
    await h.ready();
    h.send(job("e1", "renderExport"));
    await delay(2);
    h.send(job("p"));
    h.send(job("e2", "renderExport"));
    h.send(job("e3", "renderExport"));
    await delay(80);
    expect(h.messages).toContainEqual(
      expect.objectContaining({
        type: "error",
        requestId: "e3",
        error: expect.objectContaining({ code: "Busy" }),
      }),
    );
    expect(h.calls.slice(1, 6)).toContain(2);
    expect(h.calls.indexOf(2)).toBeLessThan(h.calls.lastIndexOf(1));
    expect(
      h.messages.filter((m) => (m as { type: string }).type === "result"),
    ).toHaveLength(3);
    const index = h.messages.findIndex(
      (m) => (m as { type: string }).type === "result",
    );
    expect(h.transfers[index]).toHaveLength(4);
    h.runtime.dispose();
  });
  it("source_change_cancels_stale_jobs", async () => {
    const h = harness(20);
    await h.ready();
    h.send(job("a"));
    h.send(job("e", "renderExport"));
    h.send(job("pending", "renderExport"));
    await delay(2);
    h.send({
      version: 1,
      requestId: "new",
      type: "setSource",
      source: { ...source(), revision: 2 },
    });
    h.send(job("stale"));
    await delay(10);
    for (const id of ["a", "e", "pending"])
      expect(h.messages).toContainEqual(
        expect.objectContaining({ type: "cancelled", requestId: id }),
      );
    expect(h.messages).toContainEqual(
      expect.objectContaining({
        requestId: "stale",
        type: "error",
        error: expect.objectContaining({ code: "MissingSource" }),
      }),
    );
    h.runtime.dispose();
  });
  it("calibration_change_cancels_dependent_jobs_and_failed_upload_preserves_jobs", async () => {
    const h = harness(20);
    await h.ready();
    h.send(job("a"));
    await delay(2);
    vi.mocked(h.engine.setSource).mockImplementationOnce(() => {
      throw new RenderError("InvalidInput", "bad");
    });
    h.send({
      version: 1,
      requestId: "bad",
      type: "setSource",
      source: { ...source(), revision: 2 },
    });
    h.send({
      version: 1,
      requestId: "newcal",
      type: "setCalibration",
      calibration: { ...calibration(), id: "new" },
    });
    await delay(10);
    expect(h.messages).toContainEqual(
      expect.objectContaining({
        type: "error",
        requestId: "bad",
        error: expect.objectContaining({ code: "InvalidInput" }),
      }),
    );
    expect(h.messages).toContainEqual(
      expect.objectContaining({ type: "cancelled", requestId: "a" }),
    );
    h.runtime.dispose();
  });
  it("strict_transport_rejects_unknown_fields_types_versions_and_identities", async () => {
    const h = harness();
    await h.ready();
    for (const value of [
      { ...job("a"), surprise: true },
      { ...job("a"), version: 2 },
      { ...job("a"), revision: "1" },
      { ...job("a"), sourceId: "" },
      { ...job("a", "renderExport"), outputWidth: 2 },
      { ...job("a"), settings: { ...settings, version: 2 } },
    ])
      expect(() => validateWorkerRequest(value)).toThrow();
    h.send({ ...job("mismatch"), sourceRevision: 2 });
    await delay();
    expect(h.messages).toContainEqual(
      expect.objectContaining({ requestId: "mismatch", type: "error" }),
    );
    expect(() =>
      validateWorkerResponse({
        version: 1,
        type: "ready",
        requestId: "x",
        extra: 1,
      }),
    ).toThrow();
    h.runtime.dispose();
  });
  it("capability_failure_is_visible_and_dispose_during_initialization_releases_engine", async () => {
    const messages: unknown[] = [];
    const broken = createWorkerRuntime({
      createEngine: async () => {
        throw new Error("no wasm");
      },
      postMessage: (m) => messages.push(m),
    });
    broken.receive({
      version: 1,
      requestId: "i",
      type: "initialize",
      memoryBudgetBytes: 1000,
    });
    await delay();
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: "error",
        error: expect.objectContaining({
          code: "CapabilityUnavailable",
          recoverable: true,
        }),
      }),
    );
    let resolve!: (e: CharacterEngine) => void;
    const h = harness();
    const pending = createWorkerRuntime({
      createEngine: () =>
        new Promise((r) => {
          resolve = r;
        }),
      postMessage: () => {},
    });
    pending.receive({
      version: 1,
      requestId: "i",
      type: "initialize",
      memoryBudgetBytes: 1000,
    });
    pending.receive({ version: 1, requestId: "d", type: "dispose" });
    resolve(h.engine);
    await delay();
    expect(h.engine.dispose).toHaveBeenCalledOnce();
    h.runtime.dispose();
  });
});

describe("worker identity regressions", () => {
  it("rejects_cancel_identity_mismatch_and_calibration_metadata_reuse", async () => {
    const h = harness(10);
    await h.ready();
    h.send(job("a"));
    h.send({
      version: 1,
      requestId: "badcancel",
      type: "cancel",
      targetRequestId: "a",
      jobId: "a",
      revision: 1,
      sourceId: "src",
      sourceRevision: 2,
      calibrationId: "cal",
    });
    h.send({
      version: 1,
      requestId: "badcal",
      type: "setCalibration",
      calibration: { ...calibration(), fontKey: "other" },
    });
    await delay(50);
    expect(h.messages).toContainEqual(
      expect.objectContaining({
        requestId: "badcancel",
        type: "error",
        error: expect.objectContaining({ code: "InvalidInput" }),
      }),
    );
    expect(h.messages).toContainEqual(
      expect.objectContaining({
        requestId: "badcal",
        type: "error",
        error: expect.objectContaining({ code: "InvalidInput" }),
      }),
    );
    expect(h.messages).toContainEqual(
      expect.objectContaining({ requestId: "a", type: "result" }),
    );
    h.runtime.dispose();
  });
  it("reports_actual_progress_without_invented_percentage", async () => {
    const h = harness();
    await h.ready();
    h.send(job("a"));
    await delay(40);
    const progress = h.messages.find(
      (m) => (m as { type: string }).type === "progress",
    );
    expect(progress).toEqual(
      expect.objectContaining({
        phase: "compute",
        slices: 1,
        elapsedMs: expect.any(Number),
      }),
    );
    expect(progress).not.toHaveProperty("percent");
    for (const message of h.messages)
      expect(() => validateWorkerResponse(message)).not.toThrow();
    h.runtime.dispose();
  });
});

it("unexpected_numeric_trap_is_a_visible_worker_failure", async () => {
  const h = harness();
  await h.ready();
  vi.mocked(h.engine.step).mockImplementationOnce(() => {
    throw new WebAssembly.RuntimeError("numeric trap");
  });
  h.send(job("trap"));
  await delay(10);
  expect(h.messages).toContainEqual(
    expect.objectContaining({
      type: "error",
      requestId: "trap",
      error: expect.objectContaining({
        code: "WorkerFailure",
        recoverable: true,
      }),
    }),
  );
  h.runtime.dispose();
});
