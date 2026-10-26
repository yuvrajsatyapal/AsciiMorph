import { describe, expect, it, vi } from "vitest";
import { createThumbnailScheduler, type ThumbnailKey } from "./thumbnail-scheduler";
import type { RgbaFrameV1 } from "./style-contract";

const key = (styleId: string, revision = 1): ThumbnailKey => ({
  sourceId: "source",
  sourceRevision: revision,
  styleId,
  parameterKey: "{}",
  seed: 7,
  timeUs: 0,
  width: 1000,
  height: 1000,
  resourceId: "atlas:1",
});
const frame = (width = 1, height = 1): RgbaFrameV1 => ({
  version: 1,
  width,
  height,
  rgba: new Uint8Array(width * height * 4),
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};

describe("thumbnail scheduler", () => {
  it("coalesces exact identity, serializes work, and distinguishes every key field", async () => {
    const first = deferred<RgbaFrameV1>();
    const render = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(frame());
    const scheduler = createThumbnailScheduler({ render, release: vi.fn(), maxBytes: 1024 });
    const a = scheduler.request(key("characters"));
    expect(scheduler.request(key("characters"))).toBe(a);
    const variants: ThumbnailKey[] = [
      { ...key("characters"), sourceId: "other" },
      key("characters", 2),
      key("pixel"),
      { ...key("characters"), parameterKey: "{x:1}" },
      { ...key("characters"), seed: 8 },
      { ...key("characters"), timeUs: 1 },
      { ...key("characters"), width: 999 },
      { ...key("characters"), height: 999 },
      { ...key("characters"), resourceId: "atlas:2" },
    ];
    const pending = variants.map((value) => scheduler.request(value));
    expect(render).toHaveBeenCalledTimes(1);
    first.resolve(frame());
    await Promise.all([a, ...pending]);
    expect(render).toHaveBeenCalledTimes(10);
    scheduler.dispose();
  });

  it("enforces both frame and actual backing byte limits with LRU release", async () => {
    const release = vi.fn();
    const scheduler = createThumbnailScheduler({ render: async () => frame(4, 4), release, maxBytes: 128, maxFrames: 2 });
    await scheduler.request(key("a"));
    await scheduler.request(key("b"));
    await scheduler.request(key("a"));
    await scheduler.request(key("c"));
    expect(release).toHaveBeenCalledTimes(1);
    expect(scheduler.usage().cachedFrames).toBe(2);
    expect(scheduler.usage().cachedBytes).toBe(128);
    scheduler.dispose();
    expect(release).toHaveBeenCalledTimes(3);
  });

  it("rejects oversized or malformed frames and never caches them", async () => {
    const release = vi.fn();
    const scheduler = createThumbnailScheduler({ render: async () => frame(193), release, maxBytes: 1024 });
    await expect(scheduler.request(key("pixel"))).rejects.toThrow();
    expect(scheduler.usage().cachedFrames).toBe(0);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("invalidates a source revision, rejects pending, and releases a late completion", async () => {
    const active = deferred<RgbaFrameV1>();
    const render = vi.fn().mockReturnValueOnce(active.promise).mockResolvedValue(frame());
    const release = vi.fn();
    const scheduler = createThumbnailScheduler({ render, release, maxBytes: 1024 });
    const old = scheduler.request(key("a"));
    const queued = scheduler.request(key("b"));
    scheduler.invalidate("source", 2);
    await expect(queued).rejects.toThrow();
    expect(render).toHaveBeenCalledTimes(1);
    active.resolve(frame());
    await expect(old).rejects.toThrow();
    expect(release).toHaveBeenCalledTimes(1);
    expect(scheduler.usage().cachedFrames).toBe(0);
    scheduler.dispose();
  });

  it("holds an aborted active job until terminal and bounds pending work", async () => {
    const active = deferred<RgbaFrameV1>();
    const render = vi.fn().mockReturnValueOnce(active.promise).mockResolvedValue(frame());
    const scheduler = createThumbnailScheduler({ render, release: vi.fn(), maxBytes: 1024, maxPending: 1 });
    const a = scheduler.request(key("a"));
    const b = scheduler.request(key("b"));
    const c = scheduler.request(key("c"));
    await expect(b).rejects.toThrow();
    expect(render).toHaveBeenCalledTimes(1);
    active.resolve(frame());
    await a;
    await c;
    expect(render).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });
  it("disposes pending and cached frames, then releases a late native completion", async () => {
    const active = deferred<RgbaFrameV1>();
    const release = vi.fn();
    const render = vi.fn().mockResolvedValueOnce(frame()).mockReturnValueOnce(active.promise);
    const scheduler = createThumbnailScheduler({ render, release, maxBytes: 1024 });
    await scheduler.request(key("cached"));
    const running = scheduler.request(key("active"));
    const pending = scheduler.request(key("pending"));
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2));
    scheduler.dispose();
    await expect(running).rejects.toThrow();
    await expect(pending).rejects.toThrow();
    expect(scheduler.usage().active).toBe(true);
    active.resolve(frame());
    await vi.waitFor(() => expect(scheduler.usage().active).toBe(false));
    expect(release).toHaveBeenCalledTimes(2);
    await expect(scheduler.request(key("new"))).rejects.toThrow();
  });
});
