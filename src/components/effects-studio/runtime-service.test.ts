// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { createCharacterEngine } from "@/render/wasm-character";
import { createWorkerRuntime } from "@/render/worker-runtime";
import { createRenderService } from "@/render/service";
import type { WorkerRequest } from "@/render/protocol";
import { createStudioRuntime } from "./runtime";
import { measuredAtlasFixture } from "./runtime-fixtures";
const bytes = readFileSync("public/wasm/asciimorph_engine.wasm");
/** Only the native Worker event boundary is replaced. Service/protocol,
 * source owner, controller, adapter and numerical WASM run unmodified. */
class NativeBoundary {
  listeners = new Map<string, Set<(event: { data: unknown }) => void>>();
  failSourceAck = false;
  holdSourceAck = false;
  sourceAckHeld = false;
  uploads = 0;
  runtime = createWorkerRuntime({
    createEngine: () => createCharacterEngine(bytes),
    postMessage: (value, transfer = []) => {
      if (
        value.type === "accepted" &&
        value.operation === "setSource" &&
        this.holdSourceAck
      ) {
        this.sourceAckHeld = true;
        return;
      }
      if (
        value.type === "accepted" &&
        value.operation === "setSource" &&
        this.failSourceAck
      ) {
        this.failSourceAck = false;
        queueMicrotask(() => this.emit("error", {}));
        return;
      }
      const data = structuredClone(value, { transfer });
      queueMicrotask(() => this.emit("message", data));
    },
  });
  postMessage(value: WorkerRequest, transfer: Transferable[] = []) {
    if (value.type === "setSource") this.uploads++;
    const data = structuredClone(value, { transfer });
    queueMicrotask(() => this.runtime.receive(data));
  }
  addEventListener(type: string, listener: (event: { data: unknown }) => void) {
    const list = this.listeners.get(type) ?? new Set();
    list.add(listener);
    this.listeners.set(type, list);
  }
  removeEventListener(
    type: string,
    listener: (event: { data: unknown }) => void,
  ) {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
  terminate = vi.fn(() => this.runtime.dispose());
}
it("runs real Rust bytes through the source/controller adapter and resets a mutated unacknowledged source", async () => {
  const workers: NativeBoundary[] = [];
  let id = 0;
  const runtime = createStudioRuntime({
    createService: () =>
      createRenderService({
        workerFactory: () => {
          const worker = new NativeBoundary();
          workers.push(worker);
          return worker as unknown as Worker;
        },
      }),
    calibrate: async (input) => measuredAtlasFixture(input),
    createId: () => `native-${++id}`,
    decodeFile: async (file) => ({
      width: 3,
      height: 2,
      rgba: new Uint8ClampedArray(24).fill(file.name === "old" ? 90 : 200),
    }),
  });
  try {
    expect(await runtime.controller.loadFile(new File(["1"], "old"))).toBe(
      true,
    );
    await vi.waitFor(() => expect(runtime.getSnapshot().status).toBe("ready"));
    const old = runtime.getFrame()!,
      source = runtime.getOriginal()!;
    expect(old.frame.width).toBe(3);
    expect(old.frame.height).toBe(2);
    expect(old.frame.grid).toBeNull();
    expect(old.frame.rgba).toHaveLength(24);
    workers[0].failSourceAck = true;
    expect(await runtime.controller.loadFile(new File(["2"], "bad"))).toBe(
      false,
    );
    await vi.waitFor(() => expect(runtime.getSnapshot().status).toBe("ready"));
    expect(workers).toHaveLength(2);
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    expect(workers[1].uploads).toBe(1);
    expect(runtime.getOriginal()).toBe(source);
    expect(runtime.getFrame()!.identity.sourceId).toBe(source.id);
    expect(runtime.getFrame()!.frame.rgba).toEqual(old.frame.rgba);
    const state = runtime.getSnapshot();
    const capture = await runtime.renderCaptured(
      {
        project: state.project,
        revision: state.revision,
        jobId: 999,
        generation: 0,
      },
      1,
      new AbortController().signal,
    );
    expect(capture.result.frame.rgba).toEqual(runtime.getFrame()!.frame.rgba);
    capture.release();
  } finally {
    await runtime.dispose();
  }
  expect(workers).toHaveLength(2);
  expect(
    workers.every((worker) => worker.terminate.mock.calls.length === 1),
  ).toBe(true);
  expect(
    workers.every((worker) =>
      [...worker.listeners.values()].every((set) => set.size === 0),
    ),
  ).toBe(true);
});

it("terminates a service with an unacknowledged source before awaiting transaction cleanup", async () => {
  const worker = new NativeBoundary();
  worker.holdSourceAck = true;
  const runtime = createStudioRuntime({
    createService: () =>
      createRenderService({ workerFactory: () => worker as unknown as Worker }),
    decodeDefault: async () => ({
      width: 1,
      height: 1,
      rgba: new Uint8ClampedArray(4),
    }),
  });
  const load = runtime.controller.loadOwnedDefault();
  let disposal: Promise<void> | undefined;
  try {
    await vi.waitFor(() => expect(worker.sourceAckHeld).toBe(true));
    disposal = runtime.dispose();
    await vi.waitFor(() => expect(worker.terminate).toHaveBeenCalledTimes(1));
    await disposal;
    expect(await load).toBe(false);
  } finally {
    worker.emit("error", {});
    await disposal;
    await runtime.dispose();
    await load;
  }
});
