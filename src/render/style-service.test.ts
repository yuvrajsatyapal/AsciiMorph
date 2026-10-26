// @vitest-environment node
import { expect, it } from "vitest";
import { createRenderService } from "./service";
it("publishes empty capabilities before initialization and additive methods", async () => {
  const s = createRenderService();
  expect(s.styleProfileVersion).toBeNull();
  expect(s.supportedStyleIds).toEqual([]);
  expect(typeof s.renderStylePreview).toBe("function");
  expect(typeof s.renderStyleExport).toBe("function");
  await s.dispose();
});
import { readFileSync } from "node:fs";
import { vi } from "vitest";
import fixtures from "../../tests/fixtures/render/styles/wire-v1.json";
import { validateStyleSettings } from "./style-contract";
import type { StyleRenderRequest } from "./style-protocol";
import { createCharacterEngine } from "./wasm-character";
import { createWorkerRuntime } from "./worker-runtime";
import type { WorkerResponse } from "./protocol";
import type {
  ReferenceCharacterAtlasV1,
  ReferenceCharactersSettingsV1,
} from "./reference-characters";
const f = fixtures.cases[0],
  source = () => ({
    ...f.source,
    rgba: Uint8ClampedArray.from(
      { length: f.source.width * f.source.height * 4 },
      (_, i) =>
        i % 4 === 3 ? 255 : Math.floor(i / 4) % f.source.width < 8 ? 0 : 255,
    ),
  });
function request(id = "pixel"): StyleRenderRequest {
  return {
    jobId: id,
    revision: 1,
    sourceId: f.source.id,
    sourceRevision: f.source.revision,
    calibrationId: "",
    source: { ...f.source },
    styleId: "pixel",
    settings: validateStyleSettings(f.settings, f.source),
    timeUs: f.settings.timeUs,
  };
}
function brailleAtlas(): ReferenceCharacterAtlasV1 {
  return {
    version: 1,
    originX: -1.5,
    originY: 2.25,
    placement: "top-start-ltr",
    ordering: "input",
    fontPolicy: "verified-family",
    spaceIndexOr65535: 65535,
    calibration: {
      version: 1,
      id: "braille",
      fontKey: "test",
      cellWidth: 6.6,
      cellHeight: 11,
      glyphs: Array.from({ length: 256 }, (_, i) =>
        String.fromCodePoint(0x2800 + i),
      ),
      maskWidth: 8,
      maskHeight: 12,
      masks: Uint8Array.from({ length: 256 * 96 }, (_, i) =>
        i < 96 ? 0 : 255,
      ),
      coverage: Float32Array.from({ length: 256 }, (_, i) => (i ? 1 : 0)),
      shapes: new Float32Array(256 * 9),
    },
  };
}
class StyleWorker {
  listeners = new Map<string, Set<(e: { data: unknown }) => void>>();
  sent: Array<Record<string, unknown>> = [];
  turns: Array<() => void> = [];
  events: string[] = [];
  holdConversion = false;
  holdCancel = false;
  cancelMessages: unknown[] = [];
  old = false;
  support = true;
  hook?: (m: WorkerResponse) => WorkerResponse;
  runtime = createWorkerRuntime({
    createEngine: async () => {
      const e = await createCharacterEngine(
        readFileSync("public/wasm/asciimorph_engine.wasm"),
      );
      let next = 10000;
      const jobs = new Map<number, StyleRenderRequest["settings"]>();
      const converting = new Set<number>();
      return {
        ...e,
        thumbnailProfileVersion: this.old ? null : 1,
        beginThumbnail: (id, maxSide) => {
          expect(jobs.has(id)).toBe(true);
          expect(maxSide).toBe(8);
          this.events.push(`beginThumbnail:${id}`);
          converting.add(id);
        },
        takeThumbnail: (id) => {
          converting.delete(id);
          jobs.delete(id);
          return {
            version: 1 as const,
            width: 8,
            height: 6,
            rgba: new Uint8Array(8 * 6 * 4).fill(73),
          };
        },
        styleProfileVersion: this.old ? null : 1,
        supportsStyle: () => this.support,
        // Test-only fixed frame diagnostics verify transport; no JS family implementation.
        beginStyle: (s) => {
          const id = next++;
          this.events.push(`beginStyle:${id}`);
          jobs.set(id, s);
          return id;
        },
        step: (id, w) =>
          converting.has(id) && this.holdConversion
            ? "pending"
            : jobs.has(id) ? "complete" : e.step(id, w),
        cancel: (id) => {
          this.events.push(`cancel:${id}`);
          converting.delete(id);
          if (!jobs.delete(id)) e.cancel(id);
        },
        takeStyleFrame: (id) => {
          const s = jobs.get(id)!;
          jobs.delete(id);
          return {
            version: 1,
            width: s.frameWidth,
            height: s.frameHeight,
            rgba: new Uint8Array(s.frameWidth * s.frameHeight * 4).fill(73),
          };
        },
      };
    },
    scheduler: {
      schedule: (cb) => {
        this.turns.push(cb);
        return () => {
          const i = this.turns.indexOf(cb);
          if (i >= 0) this.turns.splice(i, 1);
        };
      },
      dispose: () => {
        this.turns.length = 0;
      },
    },
    postMessage: (m, transfer = []) => {
      if (this.old && m.type === "ready") {
        const {
          styleProfileVersion: _,
          supportedStyleIds: __,
          thumbnailProfileVersion: ___,
          ...legacy
        } = m;
        expect(_).toBeNull();
        expect(__).toEqual([]);
        expect(___).toBeNull();
        m = legacy;
      }
      const data = structuredClone(this.hook ? this.hook(m) : m, { transfer });
      queueMicrotask(() => this.emit("message", data));
    },
  });
  postMessage(m: Record<string, unknown>, transfer: Transferable[] = []) {
    this.sent.push(m);
    const data = structuredClone(m, { transfer });
    if (this.holdCancel && m.type === "cancel") {
      this.cancelMessages.push(data);
      return;
    }
    queueMicrotask(() => this.runtime.receive(data));
  }
  releaseCancels() {
    for (const data of this.cancelMessages.splice(0))
      queueMicrotask(() => this.runtime.receive(data));
  }
  terminate = vi.fn(() => this.runtime.dispose());
  addEventListener(type: string, cb: (e: { data: unknown }) => void) {
    const list = this.listeners.get(type) ?? new Set();
    list.add(cb);
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, cb: (e: { data: unknown }) => void) {
    this.listeners.get(type)?.delete(cb);
  }
  emit(type: string, data: unknown) {
    for (const cb of this.listeners.get(type) ?? []) cb({ data });
  }
  flush() {
    for (let i = 0; this.turns.length && i < 100; i++) this.turns.shift()!();
    expect(this.turns).toHaveLength(0);
  }
}
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
async function queued(worker: StyleWorker, type: string, count = 1) {
  for (let i = 0; i < 100; i++) {
    if (worker.sent.filter((m) => m.type === type).length >= count) {
      await tick();
      return;
    }
    await tick();
  }
  throw new Error("Request never admitted: " + type);
}
function setup(configure: (w: StyleWorker, index: number) => void = () => {}) {
  const workers: StyleWorker[] = [];
  const s = createRenderService({
    workerFactory: () => {
      const w = new StyleWorker();
      configure(w, workers.length);
      workers.push(w);
      return w as unknown as Worker;
    },
  });
  return { s, workers };
}
it("sends raster without speculative atlas, snapshots settings before awaits and supersedes latest preview independently of export", async () => {
  const { s, workers } = setup();
  try {
    await s.setSource(source());
    const w = workers[0];
    expect(s.styleProfileVersion).toBe(1);
    expect(s.supportedStyleIds).toEqual(["braille", "pixel", "mosaic"]);
    expect(Object.isFrozen(s.supportedStyleIds)).toBe(true);
    const r = request("export");
    const exporting = s.renderStyleExport({
      ...r,
      outputWidth: r.settings.frameWidth,
      outputHeight: r.settings.frameHeight,
    });
    const old = s.renderStylePreview(request("old")).catch((e) => e);
    const latestRequest = request("latest"),
      latest = s.renderStylePreview(latestRequest);
    latestRequest.settings.parameters.brightness = 99;
    latestRequest.source.width = 1;
    await queued(w, "renderStylePreview", 2);
    w.flush();
    expect(await old).toMatchObject({ code: "Cancelled" });
    expect((await latest).jobId).toBe("latest");
    expect((await exporting).jobId).toBe("export");
    const sent = w.sent.find(
      (m) => m.type === "renderStylePreview" && m.jobId === "latest",
    )!;
    expect(
      (sent.settings as StyleRenderRequest["settings"]).parameters.brightness,
    ).toBe(f.settings.parameters.brightness);
    expect(w.sent.some((m) => m.type === "setAtlas")).toBe(false);
    expect(s.state).toBe("ready");
  } finally {
    await s.dispose();
  }
});
it("old capability sets and unsupported native IDs reject recoverably", async () => {
  for (const old of [true, false]) {
    const { s, workers } = setup((w) => {
      w.old = old;
      w.support = false;
    });
    try {
      await s.setSource(source());
      expect(s.styleProfileVersion).toBe(old ? null : 1);
      expect(s.thumbnailProfileVersion).toBe(old ? null : 1);
      expect(s.supportedStyleIds).toEqual([]);
      await expect(s.renderStylePreview(request())).rejects.toMatchObject({
        code: "CapabilityUnavailable",
      });
      if (old) {
        const r = request("old-thumbnail");
        await expect(
          s.renderThumbnail({
            jobId: r.jobId,
            revision: r.revision,
            sourceId: r.sourceId,
            sourceRevision: r.sourceRevision,
            calibrationId: r.calibrationId,
            source: r.source,
            timeUs: r.timeUs,
            profile: { kind: "style", settings: r.settings },
            maxSide: 8,
          }),
        ).rejects.toMatchObject({ code: "CapabilityUnavailable" });
        expect(workers[0].sent.some((m) => m.type === "renderThumbnail")).toBe(
          false,
        );
      }
      expect(s.state).toBe("ready");
      expect(workers[0].sent.some((m) => m.type === "renderStylePreview")).toBe(
        false,
      );
    } finally {
      await s.dispose();
    }
  }
});
it("uses a distinct thumbnail request and result without changing style preview", async () => {
  const { s, workers } = setup();
  try {
    await s.setSource(source());
    const r = request("thumb");
    const pending = s.renderThumbnail({
      jobId: r.jobId,
      revision: r.revision,
      sourceId: r.sourceId,
      sourceRevision: r.sourceRevision,
      calibrationId: r.calibrationId,
      source: r.source,
      timeUs: r.timeUs,
      profile: { kind: "style", settings: r.settings },
      maxSide: 8,
    });
    await queued(workers[0], "renderThumbnail");
    workers[0].flush();
    const result = await pending;
    expect(result.styleId).toBe("pixel");
    expect(result.frame.width).toBeLessThanOrEqual(8);
    expect(workers[0].sent.some((m) => m.type === "renderStylePreview")).toBe(
      false,
    );
  } finally {
    await s.dispose();
  }
});
it("holds an aborted thumbnail request until its worker terminal response", async () => {
  const { s, workers } = setup((w) => { w.holdConversion = true; w.holdCancel = true; });
  try {
    await s.setSource(source());
    const r = request("terminal-thumb");
    const abort = new AbortController();
    let settled = false;
    const pending = s.renderThumbnail({
      jobId: r.jobId, revision: r.revision, sourceId: r.sourceId,
      sourceRevision: r.sourceRevision, calibrationId: r.calibrationId,
      source: r.source, timeUs: r.timeUs,
      profile: { kind: "style", settings: r.settings }, maxSide: 8,
    }, abort.signal).catch((e) => e).finally(() => { settled = true; });
    const worker = workers[0];
    await queued(worker, "renderThumbnail");
    worker.turns.shift()!();
    abort.abort();
    await tick();
    expect(settled).toBe(false);
    expect(s.thumbnailResourceUsage.inFlight).toBe(true);
    worker.releaseCancels();
    await tick();
    worker.flush();
    expect(await pending).toMatchObject({ code: "Cancelled" });
    expect(s.thumbnailResourceUsage.inFlight).toBe(false);
  } finally {
    await s.dispose();
  }
});
it("does not start queued thumbnail while preview is present and cancels it for preview", async () => {
  const { s, workers } = setup();
  try {
    await s.setSource(source());
    const r = request("thumb-priority");
    const thumbnail = s
      .renderThumbnail({
        jobId: r.jobId,
        revision: r.revision,
        sourceId: r.sourceId,
        sourceRevision: r.sourceRevision,
        calibrationId: r.calibrationId,
        source: r.source,
        timeUs: r.timeUs,
        profile: { kind: "style", settings: r.settings },
        maxSide: 8,
      })
      .catch((e) => e);
    await queued(workers[0], "renderThumbnail");
    const preview = s.renderStylePreview(request("priority-preview"));
    await queued(workers[0], "renderStylePreview");
    workers[0].flush();
    expect(await thumbnail).toMatchObject({ code: "Cancelled" });
    expect((await preview).jobId).toBe("priority-preview");
  } finally {
    await s.dispose();
  }
});
it("refuses thumbnail admission when a preview enters the service queue in the same turn", async () => {
  const { s, workers } = setup();
  try {
    await s.setSource(source());
    const r = request("same-turn-thumbnail");
    const thumbnail = s.renderThumbnail({
      jobId: r.jobId, revision: r.revision, sourceId: r.sourceId,
      sourceRevision: r.sourceRevision, calibrationId: r.calibrationId,
      source: r.source, timeUs: r.timeUs,
      profile: { kind: "style", settings: r.settings }, maxSide: 8,
    }).catch((error) => error);
    const preview = s.renderStylePreview(request("same-turn-preview"));
    await queued(workers[0], "renderStylePreview");
    workers[0].flush();
    expect(await thumbnail).toMatchObject({ code: "Cancelled" });
    expect(workers[0].sent.some((message) => message.type === "renderThumbnail")).toBe(false);
    expect((await preview).jobId).toBe("same-turn-preview");
  } finally { await s.dispose(); }
});
it.each(["preview", "export"] as const)(
  "cancels active thumbnail conversion before %s begins rendering",
  async (lane) => {
    const { s, workers } = setup((w) => { w.holdConversion = true; });
    try {
      await s.setSource(source());
      const r = request(`active-thumb-${lane}`);
      const thumbnail = s.renderThumbnail({
        jobId: r.jobId,
        revision: r.revision,
        sourceId: r.sourceId,
        sourceRevision: r.sourceRevision,
        calibrationId: r.calibrationId,
        source: r.source,
        timeUs: r.timeUs,
        profile: { kind: "style", settings: r.settings },
        maxSide: 8,
      }).catch((e) => e);
      const w = workers[0];
      await queued(w, "renderThumbnail");
      w.turns.shift()!();
      expect(w.events).toContain("beginThumbnail:10000");
      const next = request(`after-thumb-${lane}`);
      const priority = (lane === "preview"
        ? s.renderStylePreview(next)
        : s.renderStyleExport({
            ...next,
            outputWidth: next.settings.frameWidth,
            outputHeight: next.settings.frameHeight,
          })).catch((e) => e);
      await queued(w, lane === "preview" ? "renderStylePreview" : "renderStyleExport");
      expect(w.events.indexOf("cancel:10000")).toBeGreaterThan(w.events.indexOf("beginThumbnail:10000"));
      w.flush();
      expect(await thumbnail).toMatchObject({ code: "Cancelled" });
      expect((await priority).jobId).toBe(next.jobId);
      expect(w.events.indexOf("cancel:10000")).toBeLessThan(w.events.indexOf("beginStyle:10001"));
    } finally {
      await s.dispose();
    }
  },
);
it("cancels an unfinished thumbnail on source replacement", async () => {
  const { s, workers } = setup();
  try {
    await s.setSource(source());
    const r = request("source-invalidated-thumb");
    const pending = s
      .renderThumbnail({
        jobId: r.jobId,
        revision: r.revision,
        sourceId: r.sourceId,
        sourceRevision: r.sourceRevision,
        calibrationId: r.calibrationId,
        source: r.source,
        timeUs: r.timeUs,
        profile: { kind: "style", settings: r.settings },
        maxSide: 8,
      })
      .catch((e) => e);
    await queued(workers[0], "renderThumbnail");
    await s.setSource({ ...source(), revision: 2 });
    workers[0].flush();
    expect(await pending).toMatchObject({ code: "Cancelled" });
  } finally {
    await s.dispose();
  }
});
it("cancels an unfinished captured Braille thumbnail on atlas replacement", async () => {
  const { s, workers } = setup();
  try {
    const b = fixtures.cases[2],
      atlas = brailleAtlas();
    await s.setSource({
      ...b.source,
      rgba: new Uint8ClampedArray(b.source.width * b.source.height * 4),
    });
    const pending = s
      .renderThumbnail(
        {
          jobId: "atlas-thumb",
          revision: 1,
          sourceId: b.source.id,
          sourceRevision: b.source.revision,
          calibrationId: atlas.calibration.id,
          source: { ...b.source },
          timeUs: b.settings.timeUs,
          profile: {
            kind: "style",
            settings: validateStyleSettings(b.settings, b.source),
          },
          maxSide: 8,
        },
        undefined,
        atlas,
      )
      .catch((e) => e);
    await queued(workers[0], "renderThumbnail");
    const replacement = brailleAtlas();
    replacement.calibration.id = "new-atlas";
    await s.setAtlas(replacement);
    workers[0].flush();
    expect(await pending).toMatchObject({ code: "Cancelled" });
  } finally {
    await s.dispose();
  }
});
it("glyph mode requires exact captured atlas and caller bytes remain immutable after admission", async () => {
  const { s, workers } = setup();
  try {
    const b = fixtures.cases[2],
      a = brailleAtlas();
    await s.setSource({
      ...b.source,
      rgba: new Uint8ClampedArray(b.source.width * b.source.height * 4),
    });
    const r: StyleRenderRequest = {
      ...request("braille"),
      source: { ...b.source },
      sourceId: b.source.id,
      sourceRevision: b.source.revision,
      styleId: "braille",
      calibrationId: a.calibration.id,
      settings: validateStyleSettings(b.settings, b.source),
      timeUs: b.settings.timeUs,
    };
    await expect(s.renderStylePreview(r)).rejects.toMatchObject({
      code: "MissingCalibration",
    });
    await expect(
      s.renderStylePreview({ ...r, calibrationId: "wrong" }, undefined, a),
    ).rejects.toMatchObject({ code: "MissingCalibration" });
    expect(workers[0].sent.some((m) => m.type === "setAtlas")).toBe(false);
    const pending = s.renderStylePreview(r, undefined, a);
    a.calibration.masks.fill(0);
    a.originX = 99;
    await queued(workers[0], "renderStylePreview");
    workers[0].flush();
    expect((await pending).calibrationId).toBe("braille");
    const upload = workers[0].sent.find((m) => m.type === "setAtlas")!;
    expect((upload.atlas as ReferenceCharacterAtlasV1).originX).toBe(-1.5);
  } finally {
    await s.dispose();
  }
});
it.each(["style", "frame"])(
  "rejects mismatched %s result and retries with source re-upload on a fresh worker",
  async (kind) => {
    const { s, workers } = setup((w, index) => {
      if (index === 0)
        w.hook = (m) =>
          m.type === "styleResult"
            ? kind === "style"
              ? { ...m, styleId: "mosaic" }
              : {
                  ...m,
                  frame: {
                    ...m.frame,
                    width: m.frame.height,
                    height: m.frame.width,
                  },
                }
            : m;
    });
    try {
      await s.setSource(source());
      const p = s.renderStylePreview(request()).catch((e) => e);
      await queued(workers[0], "renderStylePreview");
      workers[0].flush();
      expect(await p).toMatchObject({ code: "WorkerFailure" });
      expect(s.state).toBe("recoverable-error");
      const retry = s.renderStylePreview(request("retry"));
      await queued(
        workers[1] ?? (await tick(), workers[1]),
        "renderStylePreview",
      );
      workers[1].flush();
      expect((await retry).jobId).toBe("retry");
      expect(workers[1].sent.map((m) => m.type)).toEqual([
        "initialize",
        "setSource",
        "renderStylePreview",
      ]);
    } finally {
      await s.dispose();
    }
  },
);
it("preserves actual Characters export A pixels through raster preview B and upload C; only current preview resolves", async () => {
  const { s, workers } = setup();
  try {
    const atlas: ReferenceCharacterAtlasV1 = {
      version: 1,
      originX: 0,
      originY: 0,
      spaceIndexOr65535: 65535,
      placement: "top-start-ltr",
      ordering: "input",
      fontPolicy: "reference-system-monospace",
      calibration: {
        version: 1,
        id: "A",
        fontKey: "test",
        cellWidth: 0.6 * 3,
        cellHeight: 3,
        glyphs: [".", "#"],
        maskWidth: 1,
        maskHeight: 1,
        masks: new Uint8Array([255, 255]),
        coverage: new Float32Array([1, 1]),
        shapes: new Float32Array(18),
      },
    };
    const settings: ReferenceCharactersSettingsV1 = {
      version: 1,
      frameWidth: f.source.width,
      frameHeight: f.source.height,
      fontSize: 3,
      renderScale: 1,
      brightness: 0,
      contrast: 0,
      crop: { x: 0, y: 0, width: 1, height: 1 },
      rotation: 0,
      backdrop: "none",
    };
    const { styleId: omittedStyle, ...r } = request("A");
    expect(omittedStyle).toBe("pixel");
    const characters = {
      ...r,
      calibrationId: "A",
      settings,
      outputWidth: settings.frameWidth,
      outputHeight: settings.frameHeight,
    };
    await s.setSource(source());
    const baseline = s.renderCharactersExport(characters, undefined, atlas);
    await queued(workers[0], "renderCharactersExport");
    workers[0].flush();
    const original = await baseline;
    expect(original.frame.rgba.some((n) => n !== 0)).toBe(true);
    const exporting = s.renderCharactersExport(
      { ...characters, jobId: "captureA" },
      undefined,
      atlas,
    );
    const old = s
      .renderCharactersPreview(
        { ...r, jobId: "old", calibrationId: "A", settings },
        undefined,
        atlas,
      )
      .catch((e) => e);
    const current = s.renderStylePreview(request("B"));
    const c = {
      ...atlas,
      calibration: { ...atlas.calibration, id: "C", masks: new Uint8Array(2) },
    };
    await s.setAtlas(c);
    workers[0].flush();
    expect(await old).toMatchObject({ code: "Cancelled" });
    expect((await current).jobId).toBe("B");
    const result = await exporting;
    expect(result.calibrationId).toBe("A");
    expect(result.frame.rgba).toEqual(original.frame.rgba);
  } finally {
    await s.dispose();
  }
});
it("keeps a late style capability rejection recoverable after local abort removes its waiter", async () => {
  const { s, workers } = setup();
  try {
    await s.setSource(source());
    const controller = new AbortController(),
      r = request("abort");
    const p = s.renderStylePreview(r, controller.signal).catch((e) => e);
    await queued(workers[0], "renderStylePreview");
    controller.abort();
    workers[0].emit("message", {
      version: 1,
      requestId: workers[0].sent.find((m) => m.type === "renderStylePreview")!
        .requestId,
      type: "error",
      jobId: r.jobId,
      revision: r.revision,
      sourceId: r.sourceId,
      sourceRevision: r.sourceRevision,
      calibrationId: "",
      error: {
        code: "CapabilityUnavailable",
        message: "unsupported style",
        recoverable: true,
      },
    });
    expect(s.state).toBe("ready");
    expect(await p).toMatchObject({ code: "Cancelled" });
  } finally {
    await s.dispose();
  }
});
