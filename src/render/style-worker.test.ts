// @vitest-environment node
import { expect, it } from "vitest";
import fixtures from "../../tests/fixtures/render/styles/wire-v1.json";
import { validateWorkerRequest, validateWorkerResponse } from "./protocol";
import {
  validateStyleRenderRequest,
  type StyleRenderRequest,
} from "./style-protocol";
import { validateStyleSettings } from "./style-contract";
const f = fixtures.cases[0];
export const styleRequest = (id = "style"): StyleRenderRequest => ({
  jobId: id,
  revision: 1,
  sourceId: f.source.id,
  sourceRevision: f.source.revision,
  calibrationId: "",
  source: { ...f.source },
  styleId: "pixel",
  settings: validateStyleSettings(f.settings, f.source),
  timeUs: f.settings.timeUs,
});
it("admits atlas-free pixel transport and rejects resource/style/time mismatches", () => {
  const r = styleRequest();
  expect(validateStyleRenderRequest(r, "renderStylePreview")).toEqual(r);
  expect(
    validateWorkerRequest({
      version: 1,
      requestId: "p",
      type: "renderStylePreview",
      ...r,
    }),
  ).toBeDefined();
  for (const patch of [
    { styleId: "mosaic" },
    { calibrationId: "unexpected" },
    { timeUs: r.timeUs + 1 },
  ])
    expect(() =>
      validateStyleRenderRequest({ ...r, ...patch }, "renderStylePreview"),
    ).toThrow();
});
it("validates coherent optional style discovery", () => {
  expect(
    validateWorkerResponse({ version: 1, requestId: "ready", type: "ready" }),
  ).toBeDefined();
  expect(
    validateWorkerResponse({
      version: 1,
      requestId: "ready",
      type: "ready",
      styleProfileVersion: 1,
      supportedStyleIds: [],
    }),
  ).toBeDefined();
  expect(() =>
    validateWorkerResponse({
      version: 1,
      requestId: "ready",
      type: "ready",
      styleProfileVersion: null,
      supportedStyleIds: ["pixel"],
    }),
  ).toThrow();
});
import { readFileSync } from "node:fs";
import { vi } from "vitest";
import { createWorkerRuntime } from "./worker-runtime";
import { createCharacterEngine } from "./wasm-character";
import type { WorkerResponse } from "./protocol";
import type {
  ReferenceCharacterAtlasV1,
  ReferenceCharactersSettingsV1,
} from "./reference-characters";
function measuredAtlas(id = "A"): ReferenceCharacterAtlasV1 {
  return {
    version: 1,
    originX: 0,
    originY: 0,
    spaceIndexOr65535: 65535,
    placement: "top-start-ltr",
    ordering: "input",
    fontPolicy: "reference-system-monospace",
    calibration: {
      version: 1,
      id,
      fontKey: "measured",
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
}
async function runtimeHarness(supported = true) {
  const out: WorkerResponse[] = [],
    turns: Array<() => void> = [];
  const native = await createCharacterEngine(
    readFileSync("public/wasm/asciimorph_engine.wasm"),
  );
  let next = 10000;
  const mockJobs = new Map<
    number,
    ReturnType<typeof styleRequest>["settings"]
  >();
  const setAtlas = vi.fn((a: ReferenceCharacterAtlasV1) => native.setAtlas(a));
  const rt = createWorkerRuntime({
    createEngine: async () => ({
      ...native,
      styleProfileVersion: 1,
      supportsStyle: () => supported,
      setAtlas,
      // Fixed transport diagnostic only; native families remain unsupported.
      beginStyle: (s) => {
        const id = next++;
        mockJobs.set(id, s);
        return id;
      },
      step: (id, w) => (mockJobs.has(id) ? "complete" : native.step(id, w)),
      cancel: (id) => {
        if (!mockJobs.delete(id)) native.cancel(id);
      },
      takeStyleFrame: (id) => {
        const s = mockJobs.get(id)!;
        mockJobs.delete(id);
        return {
          version: 1,
          width: s.frameWidth,
          height: s.frameHeight,
          rgba: new Uint8Array(s.frameWidth * s.frameHeight * 4).fill(73),
        };
      },
    }),
    scheduler: {
      schedule: (cb) => {
        turns.push(cb);
        return () => {
          const i = turns.indexOf(cb);
          if (i >= 0) turns.splice(i, 1);
        };
      },
      dispose: () => {
        turns.length = 0;
      },
    },
    postMessage: (m) => {
      validateWorkerResponse(m);
      out.push(m);
    },
  });
  rt.receive({
    version: 1,
    requestId: "init",
    type: "initialize",
    memoryBudgetBytes: 1000000,
  });
  await Promise.resolve();
  await Promise.resolve();
  rt.receive({
    version: 1,
    requestId: "source",
    type: "setSource",
    source: {
      ...f.source,
      rgba: Uint8ClampedArray.from(
        { length: f.source.width * f.source.height * 4 },
        (_, i) =>
          i % 4 === 3 ? 255 : Math.floor(i / 4) % f.source.width < 8 ? 0 : 255,
      ),
    },
  });
  const send = (id: string, type = "renderStylePreview") =>
    rt.receive({
      version: 1,
      requestId: id,
      type,
      ...styleRequest(id),
      ...(type.endsWith("Export")
        ? {
            outputWidth: f.settings.frameWidth,
            outputHeight: f.settings.frameHeight,
          }
        : {}),
    });
  const flush = () => {
    for (let i = 0; turns.length && i < 100; i++) turns.shift()!();
    expect(turns).toHaveLength(0);
  };
  return { rt, out, send, flush, setAtlas };
}
it("coalesces all preview kinds and preserves same-source Characters export A across raster B and atlas C", async () => {
  const h = await runtimeHarness();
  try {
    const a = measuredAtlas();
    h.rt.receive({
      version: 1,
      requestId: "atlasA",
      type: "setAtlas",
      atlas: a,
    });
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
    // Construct exact Characters messages (no styleId key).
    const charMessage = (id: string, type: string) => {
      const { styleId: omittedStyle, ...r } = styleRequest(id);
      expect(omittedStyle).toBe("pixel");
      return {
        version: 1,
        requestId: id,
        type,
        ...r,
        settings,
        calibrationId: "A",
        ...(type.endsWith("Export")
          ? {
              outputWidth: settings.frameWidth,
              outputHeight: settings.frameHeight,
            }
          : {}),
      };
    };
    h.rt.receive(charMessage("A", "renderCharactersExport"));
    h.rt.receive(charMessage("old", "renderCharactersPreview"));
    h.send("B");
    expect(h.out.filter((m) => m.type === "error")).toEqual([]);
    expect(h.setAtlas).toHaveBeenCalledTimes(1);
    h.rt.receive({
      version: 1,
      requestId: "atlasC",
      type: "setAtlas",
      atlas: measuredAtlas("C"),
    });
    h.flush();
    expect(
      h.out.some((m) => m.type === "cancelled" && m.requestId === "old"),
    ).toBe(true);
    expect(
      h.out.some((m) => m.type === "styleResult" && m.requestId === "B"),
    ).toBe(true);
    const result = h.out.find(
      (m) => m.type === "charactersResult" && m.requestId === "A",
    );
    expect(result?.type).toBe("charactersResult");
    if (result?.type === "charactersResult") {
      expect(result.calibrationId).toBe("A");
      expect(result.frame.rgba.some((v) => v !== 0)).toBe(true);
    }
    expect(h.out.filter((m) => m.type === "error")).toEqual([]);
    h.send("first");
    h.send("latest");
    h.flush();
    expect(
      h.out.some((m) => m.type === "cancelled" && m.requestId === "first"),
    ).toBe(true);
  } finally {
    h.rt.dispose();
  }
});
it("source replacement cancels captured style jobs and unsupported IDs are recoverable", async () => {
  const h = await runtimeHarness(false);
  try {
    h.send("unsupported");
    expect(h.out.at(-1)).toMatchObject({
      type: "error",
      error: { code: "CapabilityUnavailable", recoverable: true },
    });
    h.rt.receive({
      version: 1,
      requestId: "src2",
      type: "setSource",
      source: {
        ...f.source,
        revision: 2,
        rgba: new Uint8ClampedArray(f.source.width * f.source.height * 4),
      },
    });
    expect(h.out.at(-1)).toMatchObject({
      type: "accepted",
      operation: "setSource",
    });
  } finally {
    h.rt.dispose();
  }
  const k = await runtimeHarness();
  try {
    k.send("export", "renderStyleExport");
    k.rt.receive({
      version: 1,
      requestId: "src2",
      type: "setSource",
      source: {
        ...f.source,
        revision: 2,
        rgba: new Uint8ClampedArray(f.source.width * f.source.height * 4),
      },
    });
    expect(
      k.out.some((m) => m.type === "cancelled" && m.requestId === "export"),
    ).toBe(true);
  } finally {
    k.rt.dispose();
  }
});
