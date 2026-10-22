// @vitest-environment node
import { readFileSync } from "node:fs";
import { it, expect, vi } from "vitest";
import { createRenderService } from "./service";
import { createWorkerRuntime } from "./worker-runtime";
import { createCharacterEngine, type CharacterEngine } from "./wasm-character";
import type {
  ReferenceCharacterAtlasV1,
  ReferenceCharactersSettingsV1,
} from "./reference-characters";
import type { WorkerResponse, CharactersRenderRequest } from "./protocol";
const bytes = readFileSync("public/wasm/asciimorph_engine.wasm");
const src = () => ({
  id: "s",
  revision: 1,
  width: 5,
  height: 3,
  rgba: new Uint8ClampedArray(
    Array.from({ length: 15 }, (_, i) => [
      ...(i % 5 < 2 ? [0, 0, 0] : [255, 255, 255]),
      255,
    ]).flat(),
  ),
});
const atlas = (): ReferenceCharacterAtlasV1 => ({
  version: 1,
  originX: 0,
  originY: 0,
  spaceIndexOr65535: 65535,
  placement: "top-start-ltr",
  ordering: "input",
  fontPolicy: "reference-system-monospace",
  calibration: {
    version: 1,
    id: "a",
    fontKey: "measured",
    cellWidth: 0.6 * 3,
    cellHeight: 3,
    glyphs: [".", "#"],
    maskWidth: 1,
    maskHeight: 1,
    masks: new Uint8Array([0, 0]),
    coverage: new Float32Array([0, 0]),
    shapes: new Float32Array(18),
  },
});
const settings: ReferenceCharactersSettingsV1 = {
  version: 1,
  frameWidth: 5,
  frameHeight: 3,
  fontSize: 3,
  renderScale: 1,
  brightness: 0,
  contrast: 0,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  rotation: 0,
  backdrop: "none",
};
const request = (id = "j"): CharactersRenderRequest => ({
  jobId: id,
  revision: 1,
  sourceId: "s",
  sourceRevision: 1,
  calibrationId: "a",
  source: { id: "s", revision: 1, width: 5, height: 3 },
  settings,
  timeUs: 0,
});
class ProfileWorker {
  listeners = new Map<string, Set<(e: { data: unknown }) => void>>();
  sent: unknown[] = [];
  responses: WorkerResponse[] = [];
  engine?: CharacterEngine;
  trap = false;
  delayCompletion = false;
  allow = true;
  contextVersion: 1 | null = null;
  gate?: Promise<void>;
  runtime = createWorkerRuntime({
    createEngine: async () => {
      await this.gate;
      const e = await createCharacterEngine(bytes);
      this.engine = {
        ...e,
        charactersProfileAvailable: this.allow,
        charactersContextVersion: this.contextVersion,
        step: (id, work) => {
          if (this.trap) throw new Error("numeric trap");
          if (this.delayCompletion) return "pending";
          return e.step(id, work);
        },
      };
      return this.engine;
    },
    postMessage: (value, transfer = []) => {
      this.responses.push(value);
      const data = structuredClone(value, { transfer });
      setTimeout(() => this.emit("message", data), 0);
    },
  });
  terminate = vi.fn(() => this.runtime.dispose());
  postMessage(value: unknown, transfer: Transferable[] = []) {
    this.sent.push(value);
    const data = structuredClone(value, { transfer });
    setTimeout(() => this.runtime.receive(data), 0);
  }
  addEventListener(t: string, f: (e: { data: unknown }) => void) {
    const list = this.listeners.get(t) ?? new Set();
    list.add(f);
    this.listeners.set(t, list);
  }
  removeEventListener(t: string, f: (e: { data: unknown }) => void) {
    this.listeners.get(t)?.delete(f);
  }
  emit(t: string, data: unknown) {
    for (const f of this.listeners.get(t) ?? []) f({ data });
  }
}
function setup(
  allow = true,
  configure: (worker: ProfileWorker, index: number) => void = () => {},
) {
  const workers: ProfileWorker[] = [];
  const service = createRenderService({
    workerFactory: () => {
      const w = new ProfileWorker();
      w.allow = allow;
      configure(w, workers.length);
      workers.push(w);
      return w as unknown as Worker;
    },
  });
  return {
    workers,
    service,
    async ready() {
      await service.setSource(src());
      await service.setAtlas(atlas());
    },
  };
}
it("real WASM profile preview/export parity and upload snapshots survive worker recovery", async () => {
  const h = setup();
  try {
    const source = src(),
      a = atlas();
    const sourceUpload = h.service.setSource(source),
      atlasUpload = h.service.setAtlas(a);
    source.rgba.fill(0);
    a.calibration.masks.fill(255);
    a.calibration.glyphs[0] = " ";
    await Promise.all([sourceUpload, atlasUpload]);
    const preview = await h.service.renderCharactersPreview(request()),
      exported = await h.service.renderCharactersExport({
        ...request("export"),
        outputWidth: 5,
        outputHeight: 3,
      });
    expect(preview.frame).toEqual(exported.frame);
    expect([...preview.frame.grid!.glyphIndices]).toEqual([65535, 0]);
    expect([...preview.frame.rgba]).toEqual(Array(60).fill(0));
    expect(
      h.workers[0].sent.filter(
        (v) => (v as { type: string }).type === "setAtlas",
      ),
    ).toHaveLength(1);
    h.workers[0].emit("error", {});
    expect(h.service.state).toBe("recoverable-error");
    await h.service.initialize();
    expect(
      (await h.service.renderCharactersPreview(request("recovered"))).frame,
    ).toEqual(preview.frame);
    expect(h.workers).toHaveLength(2);
  } finally {
    await h.service.dispose();
  }
});
it("changed atlas metadata and forged retained geometry reject visibly", async () => {
  const h = setup();
  try {
    await h.ready();
    await expect(
      h.service.setAtlas({ ...atlas(), originX: 0.5 }),
    ).rejects.toMatchObject({ code: "InvalidInput" });
    await expect(
      h.service.renderCharactersPreview({
        ...request(),
        source: { ...request().source, width: 6 },
        settings: { ...settings, frameWidth: 6 },
      }),
    ).rejects.toMatchObject({ code: "InvalidInput" });
    expect(
      (await h.service.renderCharactersPreview(request("valid"))).frame.width,
    ).toBe(5);
  } finally {
    await h.service.dispose();
  }
});
it("optional missing profile/context errors preserve the working legacy connection", async () => {
  for (const allow of [false, true]) {
    const h = setup(allow);
    try {
      await h.ready();
      await expect(
        h.service.renderCharactersPreview({
          ...request(),
          settings: { ...settings, backdrop: allow ? "blur" : "none" },
        }),
      ).rejects.toMatchObject({ code: "CapabilityUnavailable" });
      expect(h.service.state).toBe("ready");
      expect(h.workers[0].terminate).not.toHaveBeenCalled();
    } finally {
      await h.service.dispose();
    }
  }
});
it("latest profile preview cancellation and numeric traps settle all jobs then recovery succeeds", async () => {
  const h = setup();
  try {
    await h.ready();
    const w = h.workers[0];
    w.delayCompletion = true;
    const first = h.service.renderCharactersPreview(request("first"));
    const firstRejected = expect(first).rejects.toMatchObject({
      code: "Cancelled",
    });
    await vi.waitFor(() =>
      expect(w.responses.some((m) => m.type === "progress")).toBe(true),
    );
    const second = h.service.renderCharactersPreview(request("second"));
    const secondRejected = expect(second).rejects.toMatchObject({
      code: "WorkerFailure",
    });
    await firstRejected;
    w.trap = true;
    w.delayCompletion = false;
    await secondRejected;
    expect(h.service.state).toBe("recoverable-error");
    await h.service.initialize();
    expect(
      (await h.service.renderCharactersPreview(request("retry"))).frame.width,
    ).toBe(5);
  } finally {
    await h.service.dispose();
  }
});
it("aborted and disposed profile jobs settle without stale results", async () => {
  const h = setup();
  await h.ready();
  const w = h.workers[0];
  w.delayCompletion = true;
  const controller = new AbortController(),
    render = h.service.renderCharactersPreview(
      request("abort"),
      controller.signal,
    ),
    rejected = expect(render).rejects.toMatchObject({ code: "Cancelled" });
  await vi.waitFor(() =>
    expect(w.responses.some((m) => m.type === "progress")).toBe(true),
  );
  controller.abort();
  await rejected;
  await h.service.dispose();
  expect(w.terminate).toHaveBeenCalledOnce();
  expect(h.service.state).toBe("disposed");
});

it.each([
  "preview-ready",
  "export-ready",
  "preview-initializing",
  "export-initializing",
])("snapshots all caller profile fields before await for %s", async (mode) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const h = setup(true, (worker, index) => {
    if (index === 1) worker.gate = gate;
  });
  try {
    await h.ready();
    if (mode.endsWith("initializing")) h.workers[0].emit("error", {});
    const input = {
      ...request("original"),
      settings: { ...settings, crop: { ...settings.crop } },
      ...(mode.startsWith("export") ? { outputWidth: 5, outputHeight: 3 } : {}),
    };
    const pending = mode.startsWith("export")
      ? h.service.renderCharactersExport(input)
      : h.service.renderCharactersPreview(input);
    input.jobId = "mutated";
    input.revision = 99;
    input.sourceId = "wrong-source";
    input.sourceRevision = 99;
    input.calibrationId = "wrong-atlas";
    input.source.id = "wrong-source";
    input.source.revision = 99;
    input.source.width = 6;
    input.source.height = 9;
    input.settings.frameWidth = 123;
    input.settings.frameHeight = 123;
    input.settings.fontSize = 80;
    input.settings.crop.x = 1;
    input.timeUs = 99;
    if ("outputWidth" in input) {
      input.outputWidth = 1;
      input.outputHeight = 1;
    }
    release();
    const result = await pending;
    expect(result).toMatchObject({
      jobId: "original",
      revision: 1,
      sourceId: "s",
      sourceRevision: 1,
      calibrationId: "a",
      frame: { width: 5, height: 3 },
    });
    expect([...result.frame.grid!.glyphIndices]).toEqual([65535, 0]);
    expect(h.workers.at(-1)!.sent).toContainEqual(
      expect.objectContaining({
        type: mode.startsWith("export")
          ? "renderCharactersExport"
          : "renderCharactersPreview",
        jobId: "original",
        timeUs: 0,
        source: { id: "s", revision: 1, width: 5, height: 3 },
        settings: { ...settings, crop: { ...settings.crop } },
        ...(mode.startsWith("export")
          ? { outputWidth: 5, outputHeight: 3 }
          : {}),
      }),
    );
  } finally {
    release();
    await h.service.dispose();
  }
});

it("worker admission rejection preserves existing legacy work, scheduler and engine", async () => {
  const messages: WorkerResponse[] = [],
    callbacks: (() => void)[] = [];
  let engine: CharacterEngine | undefined;
  const scheduler = {
    schedule: vi.fn((callback: () => void) => {
      callbacks.push(callback);
      return () => {
        const at = callbacks.indexOf(callback);
        if (at >= 0) callbacks.splice(at, 1);
      };
    }),
    dispose: vi.fn(() => {
      callbacks.length = 0;
    }),
  };
  const runtime = createWorkerRuntime({
    scheduler,
    createEngine: async (memoryBudgetBytes) => {
      const real = await createCharacterEngine(bytes, { memoryBudgetBytes });
      engine = { ...real, dispose: vi.fn(() => real.dispose()) };
      return engine;
    },
    postMessage: (message) => messages.push(message),
  });
  try {
    runtime.receive({
      version: 1,
      requestId: "init",
      type: "initialize",
      memoryBudgetBytes: 1000,
    });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "ready")).toBe(true),
    );
    runtime.receive({
      version: 1,
      requestId: "source",
      type: "setSource",
      source: src(),
    });
    runtime.receive({
      version: 1,
      requestId: "atlas",
      type: "setAtlas",
      atlas: atlas(),
    });
    runtime.receive({
      version: 1,
      requestId: "legacy",
      type: "renderPreview",
      jobId: "legacy",
      revision: 1,
      sourceId: "s",
      sourceRevision: 1,
      calibrationId: "",
      timeUs: 0,
      settings: {
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
        mapping: "braille",
        dither: "none",
        seed: 0,
      },
    });
    expect(callbacks).toHaveLength(1);
    runtime.receive({
      version: 1,
      requestId: "profile-rejected",
      type: "renderCharactersPreview",
      ...request(),
    });
    expect(
      messages.find((m) => m.requestId === "profile-rejected"),
    ).toMatchObject({ type: "error", error: { code: "BudgetExceeded" } });
    expect(engine!.dispose).not.toHaveBeenCalled();
    expect(scheduler.dispose).not.toHaveBeenCalled();
    while (callbacks.length) callbacks.shift()!();
    expect(messages).toContainEqual(
      expect.objectContaining({
        requestId: "legacy",
        type: "result",
        grid: expect.objectContaining({ width: 1, height: 1 }),
      }),
    );
    expect(engine!.dispose).not.toHaveBeenCalled();
    expect(scheduler.dispose).not.toHaveBeenCalled();
  } finally {
    runtime.dispose();
  }
});

it("reports complete context separately from profile through worker/service", async () => {
  const h = setup();
  try {
    await h.ready();
    expect(h.service.charactersContextVersion).toBeNull();
    // Fixture simulates Task3-only capability.
    expect(
      (await h.service.renderCharactersPreview(request())).frame.width,
    ).toBe(5);
  } finally {
    await h.service.dispose();
  }
});

it("complete context service reports capability and renders equal Solid/Blur preview/export", async () => {
  const h = setup(true, (w) => {
    w.contextVersion = 1;
  });
  try {
    await h.ready();
    expect(h.service.charactersProfileVersion).toBe(1);
    expect(h.service.charactersContextVersion).toBe(1);
    for (const backdrop of ["solid", "blur"] as const) {
      const r = { ...request(), settings: { ...settings, backdrop } };
      const preview = await h.service.renderCharactersPreview(r);
      const exported = await h.service.renderCharactersExport({
        ...r,
        jobId: `export-${backdrop}`,
        outputWidth: 5,
        outputHeight: 3,
      });
      expect(preview.frame).toEqual(exported.frame);
      expect(preview.frame.rgba.some((v) => v !== 0)).toBe(true);
    }
  } finally {
    await h.service.dispose();
    expect(h.service.charactersContextVersion).toBeNull();
  }
});
