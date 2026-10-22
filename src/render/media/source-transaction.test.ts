import { describe, expect, it, vi } from "vitest";
import {
  createStudioController,
  type PreviewRequest,
} from "@/components/effects-studio/controller";
import type { SourceUpload } from "@/render/character-contract";
import { createSourceTransaction } from "./source-transaction";
import type { DecodeOptions, DecodedStill } from "./still-source";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const pixels = (value: number): DecodedStill => ({
  width: 1,
  height: 1,
  rgba: new Uint8ClampedArray([value, 2, 3, 255]),
});
const input = (name: string) => new File([name], name);
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function setup(
  decode = vi.fn<(file: File, options: DecodeOptions) => Promise<DecodedStill>>(
    async (file) => pixels(Number(file.name)),
  ),
) {
  let worker: SourceUpload | null = null;
  let id = 0;
  const upload = vi.fn(async (source: SourceUpload) => {
    worker = { ...source, rgba: source.rgba.slice() };
  });
  const transaction = createSourceTransaction({
    decodeFile: decode,
    decodeDefault: async () => pixels(0),
    upload,
    createId: () => `id-${++id}`,
    heldFrameBytes: () => 80,
    resetUploadedSource: async () => {
      worker = null;
    },
  });
  return { transaction, decode, upload, worker: () => worker };
}
function preview(request: PreviewRequest) {
  return {
    sourceId: request.project.source!.id,
    sourceRevision: request.project.source!.revision,
    projectId: request.project.id,
    revision: request.revision,
    calibrationId: request.atlas.calibrationId,
  };
}

describe("serialized source transactions", () => {
  it("allows the controller to preview immediately after synchronous candidate acceptance", async () => {
    const s = setup();
    const painted: string[] = [];
    const c = createStudioController({
      adapters: {
        source: s.transaction,
        renderer: {
          prepare: async () => ({ calibrationId: "atlas", generation: 1 }),
          isCurrentAtlas: () => true,
          preview: async (request) => {
            painted.push(s.worker()!.id);
            return preview(request);
          },
        },
      },
    });
    expect(await c.loadFile(input("1"))).toBe(true);
    await tick();
    expect(painted).toEqual([c.getSnapshot().project.source!.id]);
    expect(c.getSnapshot().status).toBe("ready");
    await s.transaction.dispose();
  });
  it("keeps only one active noncancellable decode and the newest pending file", async () => {
    const first = deferred<DecodedStill>();
    const decode = vi.fn(async (file: File) =>
      file.name === "1" ? first.promise : pixels(Number(file.name)),
    );
    const s = setup(decode);
    const a = s.transaction
      .loadFile(input("1"), new AbortController().signal)
      .catch((e: Error) => e);
    await tick();
    const b = s.transaction
      .loadFile(input("2"), new AbortController().signal)
      .catch((e: Error) => e);
    const c = s.transaction.loadFile(input("3"), new AbortController().signal);
    await tick();
    expect(decode).toHaveBeenCalledTimes(1);
    expect(await b).toBeInstanceOf(DOMException);
    first.resolve(pixels(1));
    expect(await a).toBeInstanceOf(DOMException);
    const candidate = await c;
    expect(decode.mock.calls.map(([file]) => file.name)).toEqual(["1", "3"]);
    expect(s.worker()?.rgba[0]).toBe(3);
    expect(Object.isFrozen(candidate.source)).toBe(true);
    expect(candidate.accept()).toBe(true);
    await s.transaction.dispose();
  });
  it("retains reservation until explicit acceptance and charges retained source plus frame", async () => {
    const s = setup();
    const a = await s.transaction.loadFile(
      input("1"),
      new AbortController().signal,
    );
    expect(a.accept()).toBe(true);
    const b = await s.transaction.loadFile(
      input("2"),
      new AbortController().signal,
    );
    expect(s.decode.mock.calls[1][1]).toMatchObject({ heldBytes: 92 });
    await b.rollback();
    expect(s.worker()?.rgba[0]).toBe(1);
    expect(b.accept()).toBe(false);
    await s.transaction.dispose();
  });
  it.each(["decode", "upload"])(
    "restores the actual old worker source after delayed obsolete upload and newer %s failure",
    async (failure) => {
      const s = setup();
      const c = createStudioController({ adapters: { source: s.transaction } });
      expect(await c.loadFile(input("1"))).toBe(true);
      const before = c.getSnapshot();
      const uploaded = deferred<void>();
      s.upload.mockReset();
      let actual = s.worker()!;
      s.upload.mockImplementation(async (source) => {
        if (source.rgba[0] === 2) await uploaded.promise;
        actual = { ...source, rgba: source.rgba.slice() };
        if (source.rgba[0] === 3 && failure === "upload")
          throw new Error("new upload failed after mutation");
      });
      const oldLoad = c.loadFile(input("2"));
      await vi.waitFor(() => expect(s.upload).toHaveBeenCalledOnce());
      if (failure === "decode")
        s.decode.mockImplementationOnce(async () => {
          throw new Error("new decode failed");
        });
      const newLoad = c.loadFile(input("3"));
      uploaded.resolve();
      expect(await oldLoad).toBe(false);
      expect(await newLoad).toBe(false);
      expect(c.getSnapshot().project).toEqual(before.project);
      expect(actual.id).toBe(before.project.source!.id);
      expect(actual.rgba[0]).toBe(1);
      await s.transaction.dispose();
    },
  );
  it("rolls back upload ack followed by new request before controller acceptance", async () => {
    const s = setup();
    const c = createStudioController({ adapters: { source: s.transaction } });
    await c.loadFile(input("1"));
    const before = c.getSnapshot().project;
    let newer!: Promise<boolean>;
    const source = {
      ...s.transaction,
      async loadFile(file: File, signal: AbortSignal) {
        const candidate = await s.transaction.loadFile(file, signal);
        if (file.name === "2") {
          s.decode.mockImplementationOnce(async () => {
            throw new Error("newer decode failed");
          });
          // Candidate upload is acknowledged, but the awaiting controller has not accepted it.
          newer = c2.loadFile(input("3"));
        }
        return candidate;
      },
    };
    const c2 = createStudioController({
      project: before,
      adapters: { source },
    });
    expect(await c2.loadFile(input("2"))).toBe(false);
    expect(await newer).toBe(false);
    expect(c2.getSnapshot().project).toEqual(before);
    expect(s.worker()?.id).toBe(before.source!.id);
    expect(s.worker()?.rgba[0]).toBe(1);
    await s.transaction.dispose();
  });
  it("does not render the old project until rollback completes after invalid candidate validation", async () => {
    const s = setup();
    const c = createStudioController({ adapters: { source: s.transaction } });
    await c.loadFile(input("1"));
    const before = c.getSnapshot().project;
    const previews: string[] = [];
    const rollback = deferred<void>();
    const source = {
      ...s.transaction,
      async loadFile(file: File, signal: AbortSignal) {
        const candidate = await s.transaction.loadFile(file, signal);
        return {
          ...candidate,
          projectId: before.id,
          async rollback() {
            await rollback.promise;
            await candidate.rollback();
          },
        };
      },
    };
    const c2 = createStudioController({
      project: before,
      adapters: {
        source,
        renderer: {
          prepare: async () => ({ calibrationId: "atlas", generation: 1 }),
          isCurrentAtlas: () => true,
          preview: async (request) => {
            previews.push(s.worker()!.id);
            return preview(request);
          },
        },
      },
    });
    const loading = c2.loadFile(input("2"));
    await tick();
    expect(previews).toEqual([]);
    rollback.resolve();
    expect(await loading).toBe(false);
    await tick();
    expect(previews).toEqual([before.source!.id]);
    await s.transaction.dispose();
  });
  it("resets an obsolete first acknowledged upload before a newer failure", async () => {
    let actual: SourceUpload | null = null;
    let failReset = false;
    const reset = vi.fn(async () => {
      if (failReset) throw new Error("reset failed");
      actual = null;
    });
    const decode = vi.fn(async (file: File) => {
      if (file.name === "2") throw new Error("new decode failed");
      return pixels(1);
    });
    const transaction = createSourceTransaction({
      decodeFile: decode,
      decodeDefault: async () => pixels(0),
      upload: async (source) => {
        actual = source;
      },
      resetUploadedSource: reset,
      createId: () => "unique",
    });
    const a = await transaction.loadFile(
      input("1"),
      new AbortController().signal,
    );
    failReset = true;
    const b = transaction
      .loadFile(input("2"), new AbortController().signal)
      .catch((e: Error) => e);
    await expect(a.rollback()).rejects.toThrow("reset failed");
    expect(await b).toBeInstanceOf(Error);
    expect(transaction.isReady(null)).toBe(false);
    expect(decode).toHaveBeenCalledTimes(1);
    failReset = false;
    const c = transaction
      .loadFile(input("2"), new AbortController().signal)
      .catch((e: Error) => e);
    expect(await c).toBeInstanceOf(Error);
    expect(actual).toBeNull();
    expect(transaction.isReady(null)).toBe(true);
    expect(decode).toHaveBeenCalledTimes(2);
    await transaction.dispose();
  });
  it("resets before restoring a failed mutating upload through a deduplicating transport", async () => {
    let actual: SourceUpload | null = null;
    let retained: SourceUpload | null = null;
    let id = 0;
    const reset = vi.fn(async () => {
      actual = retained = null;
    });
    const transaction = createSourceTransaction({
      decodeFile: async (file) => pixels(Number(file.name)),
      decodeDefault: async () => pixels(0),
      createId: () => `source-${++id}`,
      resetUploadedSource: reset,
      upload: async (source) => {
        if (retained?.id === source.id && retained.revision === source.revision)
          return;
        actual = { ...source, rgba: source.rgba.slice() };
        if (source.rgba[0] === 2)
          throw new Error("worker mutated before failed acknowledgement");
        retained = source;
      },
    });
    const c = createStudioController({ adapters: { source: transaction } });
    await c.loadFile(input("1"));
    const old = c.getSnapshot().project.source!;
    expect(await c.loadFile(input("2"))).toBe(false);
    expect(actual).toMatchObject({
      id: old.id,
      rgba: new Uint8ClampedArray([1, 2, 3, 255]),
    });
    expect(reset).toHaveBeenCalledOnce();
    expect(transaction.isReady(old)).toBe(true);
    await transaction.dispose();
  });
  it("blocks preview/export after failed restoration and resumes only after source recovery", async () => {
    const s = setup();
    const painted: string[] = [];
    const c = createStudioController({
      adapters: {
        source: s.transaction,
        renderer: {
          prepare: async () => ({ calibrationId: "atlas", generation: 1 }),
          isCurrentAtlas: () => true,
          preview: async (request) => {
            painted.push(s.worker()!.id);
            return preview(request);
          },
        },
        exportStill: async () => {
          throw new Error("must stay blocked");
        },
      },
    });
    await c.loadFile(input("1"));
    await tick();
    const old = c.getSnapshot();
    const acknowledgement = deferred<void>();
    let failRestore = true;
    const commitTransport = s.upload.getMockImplementation()!;
    s.upload.mockImplementation(async (source) => {
      if (source.rgba[0] === 2) await acknowledgement.promise;
      if (source.rgba[0] === 1 && failRestore)
        throw new Error("restore failed");
      await commitTransport(source);
    });
    const obsolete = c.loadFile(input("2"));
    await vi.waitFor(() => expect(s.upload).toHaveBeenCalledTimes(2));
    s.decode.mockImplementationOnce(async () => {
      throw new Error("new decode failed");
    });
    const newest = c.loadFile(input("3"));
    acknowledgement.resolve();
    expect(await obsolete).toBe(false);
    expect(await newest).toBe(false);
    expect(c.getSnapshot()).toMatchObject({
      project: old.project,
      frame: old.frame,
      error: { stage: "source" },
    });
    expect(c.getSnapshot().error!.message).toContain("restore failed");
    expect(await c.retryRenderer()).toBe(false);
    expect(await c.exportStill({ format: "png", scale: 1 })).toBe(false);
    expect(painted).toHaveLength(1);
    failRestore = false;
    expect(await c.loadFile(input("3"))).toBe(false);
    await tick();
    expect(painted).toHaveLength(2);
    expect(s.transaction.isReady(old.project.source)).toBe(true);
    await s.transaction.dispose();
  });
  it("releases manager pixels when disposal reset fails while retaining one rejected completion", async () => {
    const cleanupError = new Error("disposal reset failed");
    let resets = 0;
    const transaction = createSourceTransaction({
      decodeFile: async () => ({
        width: 2000,
        height: 2000,
        rgba: new Uint8ClampedArray(new ArrayBuffer(16_000_008), 4, 16_000_000),
      }),
      upload: async () => {},
      resetUploadedSource: async () => {
        resets++;
        throw cleanupError;
      },
    });
    const candidate = await transaction.loadFile(
      input("large"),
      new AbortController().signal,
    );
    expect(candidate.accept()).toBe(true);
    await tick();
    expect(transaction.retainedSourceBytes).toBe(16_000_008);
    const disposal = transaction.dispose();
    expect(transaction.dispose()).toBe(disposal);
    await expect(disposal).rejects.toBe(cleanupError);
    expect(transaction.retainedSourceBytes).toBe(0);
    expect(transaction.dispose()).toBe(disposal);
    await expect(transaction.dispose()).rejects.toBe(cleanupError);
    expect(resets).toBe(1);
    expect(transaction.isReady(candidate.source)).toBe(false);
  });
  it("settles pending promises on disposal but waits for active decode resources to settle", async () => {
    const pending = deferred<DecodedStill>();
    const s = setup(vi.fn(() => pending.promise));
    const a = s.transaction
      .loadFile(input("1"), new AbortController().signal)
      .catch((e: Error) => e);
    await tick();
    const b = s.transaction
      .loadFile(input("2"), new AbortController().signal)
      .catch((e: Error) => e);
    let disposed = false;
    const disposal = s.transaction.dispose().then(() => {
      disposed = true;
    });
    expect(await b).toBeInstanceOf(DOMException);
    await tick();
    expect(disposed).toBe(false);
    pending.resolve(pixels(1));
    await disposal;
    expect(await a).toBeInstanceOf(DOMException);
    expect(s.upload).not.toHaveBeenCalled();
  });
});
