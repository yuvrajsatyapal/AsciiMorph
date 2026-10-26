import type { RgbaFrameV1 } from "./style-contract";

/** Every input that may change the pixels or native resource binding. */
export type ThumbnailKey = Readonly<{
  sourceId: string;
  sourceRevision: number;
  styleId: string;
  parameterKey: string;
  seed: number;
  timeUs: number;
  width: number;
  height: number;
  resourceId: string;
}>;
type Entry = {
  key: ThumbnailKey;
  id: string;
  promise: Promise<RgbaFrameV1>;
  resolve(frame: RgbaFrameV1): void;
  reject(reason: Error): void;
  abort: AbortController;
  invalid: boolean;
};
const identity = (key: ThumbnailKey) => JSON.stringify([
  key.sourceId, key.sourceRevision, key.styleId, key.parameterKey,
  key.seed, key.timeUs, key.width, key.height, key.resourceId,
]);
const cancelled = () => new DOMException("Thumbnail retired", "AbortError");
function backingBytes(frame: RgbaFrameV1) {
  if (
    frame.version !== 1 ||
    !Number.isSafeInteger(frame.width) ||
    !Number.isSafeInteger(frame.height) ||
    frame.width < 1 || frame.height < 1 ||
    Math.max(frame.width, frame.height) > 192 ||
    !(frame.rgba instanceof Uint8Array) ||
    frame.rgba.byteLength !== frame.width * frame.height * 4 ||
    !(frame.rgba.buffer instanceof ArrayBuffer)
  ) throw new Error("Invalid thumbnail frame");
  return frame.rgba.buffer.byteLength;
}

/** One native job at a time. Its slot stays occupied until render settles;
 * render's contract requires worker terminal settlement after cancellation. */
export function createThumbnailScheduler(options: {
  render(key: ThumbnailKey, signal: AbortSignal): Promise<RgbaFrameV1>;
  release(frame: RgbaFrameV1): void;
  maxBytes: number;
  maxFrames?: number;
  maxPending?: number;
  canStart?: () => boolean;
}) {
  const maxBytes = Math.min(4 * 1024 * 1024, options.maxBytes);
  const maxFrames = Math.min(24, options.maxFrames ?? 24);
  const maxPending = Math.min(24, options.maxPending ?? 24);
  if (![maxBytes, maxFrames, maxPending].every((n) => Number.isSafeInteger(n) && n > 0))
    throw new Error("Invalid thumbnail scheduler bounds");
  const cache = new Map<string, { key: ThumbnailKey; frame: RgbaFrameV1; bytes: number }>();
  const entries = new Map<string, Entry>();
  const pending: Entry[] = [];
  let active: Entry | undefined;
  let cachedBytes = 0;
  let disposed = false;
  function removeCached(id: string) {
    const item = cache.get(id);
    if (!item) return;
    cache.delete(id);
    cachedBytes -= item.bytes;
    options.release(item.frame);
  }
  function retire(entry: Entry) {
    if (entry.invalid) return;
    entry.invalid = true;
    entries.delete(entry.id);
    entry.abort.abort();
    entry.reject(cancelled());
  }
  function pump() {
    if (disposed || active || !pending.length || options.canStart?.() === false) return;
    const entry = pending.shift()!;
    active = entry;
    let work: Promise<RgbaFrameV1>;
    try { work = options.render(entry.key, entry.abort.signal); }
    catch (reason) { work = Promise.reject(reason); }
    Promise.resolve(work).then(
      (frame) => {
        try {
          const bytes = backingBytes(frame);
          if (entry.invalid || disposed || bytes > maxBytes) {
            options.release(frame);
            if (!entry.invalid) entry.reject(new Error("Thumbnail exceeds cache budget"));
            return;
          }
          while (cache.size >= maxFrames || cachedBytes + bytes > maxBytes)
            removeCached(cache.keys().next().value!);
          cache.set(entry.id, { key: entry.key, frame, bytes });
          cachedBytes += bytes;
          entry.resolve(frame);
        } catch (reason) {
          options.release(frame);
          if (!entry.invalid) entry.reject(reason instanceof Error ? reason : new Error(String(reason)));
        }
      },
      (reason) => {
        if (!entry.invalid) entry.reject(reason instanceof Error ? reason : new Error(String(reason)));
      },
    ).finally(() => {
      if (entries.get(entry.id) === entry) entries.delete(entry.id);
      active = undefined;
      pump();
    });
  }
  function request(key: ThumbnailKey): Promise<RgbaFrameV1> {
    if (disposed) return Promise.reject(cancelled());
    const id = identity(key);
    const existing = cache.get(id);
    if (existing) {
      cache.delete(id);
      cache.set(id, existing);
      return Promise.resolve(existing.frame);
    }
    const inProgress = entries.get(id);
    if (inProgress) return inProgress.promise;
    let resolve!: (frame: RgbaFrameV1) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<RgbaFrameV1>((a, b) => { resolve = a; reject = b; });
    const entry: Entry = { key, id, promise, resolve, reject, abort: new AbortController(), invalid: false };
    entries.set(id, entry);
    if (pending.length >= maxPending) retire(pending.shift()!);
    pending.push(entry);
    pump();
    return promise;
  }
  function invalidate(sourceId: string, sourceRevision: number) {
    for (const [id, item] of cache)
      if (item.key.sourceId === sourceId && item.key.sourceRevision !== sourceRevision) removeCached(id);
    for (const entry of entries.values())
      if (entry.key.sourceId === sourceId && entry.key.sourceRevision !== sourceRevision) retire(entry);
    for (let i = pending.length - 1; i >= 0; i--)
      if (pending[i].invalid) pending.splice(i, 1);
  }
  function invalidateAll() {
    for (const id of cache.keys()) removeCached(id);
    for (const entry of entries.values()) retire(entry);
    pending.length = 0;
  }
  function cancel(key: ThumbnailKey) {
    const entry = entries.get(identity(key));
    if (!entry) return;
    retire(entry);
    const index = pending.indexOf(entry);
    if (index >= 0) pending.splice(index, 1);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const entry of entries.values()) retire(entry);
    pending.length = 0;
    for (const id of cache.keys()) removeCached(id);
  }
  return {
    request, invalidate, invalidateAll, cancel, dispose,
    /** Recheck an idle gate after preview/export admission changes. */
    resume: pump,
    usage: () => ({ cachedFrames: cache.size, cachedBytes, active: !!active, pending: pending.length }),
  };
}
