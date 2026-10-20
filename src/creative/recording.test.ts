import { expect, it } from "vitest";
import { gifBytes, recordingMime } from "./recording";
it("writes a valid GIF89a with looping and individual frame delays", () => {
  const bytes = gifBytes(
    [
      { rgba: new Uint8ClampedArray([255, 0, 0, 255]), delay: 100 },
      { rgba: new Uint8ClampedArray([0, 255, 0, 255]), delay: 250 },
    ],
    1,
    1,
  );
  expect(new TextDecoder().decode(bytes.slice(0, 6))).toBe("GIF89a");
  expect(bytes.at(-1)).toBe(0x3b);
  expect(bytes.filter((b) => b === 0x2c).length).toBeGreaterThanOrEqual(2);
});
it("rejects unsupported recording and unbounded GIFs", () => {
  expect(() => recordingMime("mp4", () => false)).toThrow(/unsupported/i);
  expect(() => gifBytes([], 1, 1)).toThrow();
});
it("cancels and times out pending media preparation", async () => {
  const { waitForMedia } = await import("./recording");
  const controller = new AbortController();
  const pending = waitForMedia(new Promise(() => {}), controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await expect(
    waitForMedia(new Promise(() => {}), undefined, 1),
  ).rejects.toThrow(/timed out/);
});
it("requests compatible audio codecs when a recording has source audio", () => {
  expect(recordingMime("webm", () => true, true)).toContain("opus");
  expect(recordingMime("mp4", () => true, true)).toContain("mp4a");
});
it("retains exact small-palette colors with compressed dictionary encoding", async () => {
  const { decodeGif } = await import("./gif");
  const rgba = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < rgba.length; i += 4) rgba.set([19, 87, 143, 255], i);
  const data = gifBytes([{ rgba, delay: 130 }], 64, 64, {
    loop: false,
    quality: 100,
  });
  expect(data.length).toBeLessThan(1000);
  expect(new TextDecoder().decode(data)).not.toContain("NETSCAPE2.0");
  const decoded = decodeGif(data.buffer as ArrayBuffer);
  expect(Array.from(decoded.frames[0].pixels.slice(0, 4))).toEqual([
    19, 87, 143, 255,
  ]);
  expect(decoded.frames[0].duration).toBe(130);
});
it("applies export budgets and validates settings before allocating", async () => {
  const { resolveMotionOptions } = await import("./recording");
  expect(
    resolveMotionOptions({
      maxDimension: 1280,
      fps: 24,
      quality: 80,
      loop: false,
      maxBytes: 5000,
    }).fps,
  ).toBe(24);
  expect(() => resolveMotionOptions({ fps: 0 })).toThrow(/frame rate/i);
  expect(() => resolveMotionOptions({ maxDimension: 100000 })).toThrow(
    /resolution/i,
  );
  expect(() =>
    gifBytes([{ rgba: new Uint8ClampedArray(16), delay: 100 }], 2, 2, {
      maxBytes: 10,
    }),
  ).toThrow(/budget/i);
});
it("round-trips dictionary growth on many-color image data", async () => {
  const { decodeGif } = await import("./gif");
  const rgba = new Uint8ClampedArray(128 * 64 * 4);
  for (let i = 0; i < rgba.length; i += 4)
    rgba.set([(i * 17) % 256, (i * 31 + 27) % 256, (i * 11) % 256, 255], i);
  const data = gifBytes([{ rgba, delay: 100 }], 128, 64);
  expect(decodeGif(data.buffer as ArrayBuffer).frames[0].pixels).toEqual(rgba);
});
it("decodes dictionary resets and all palette widths on noisy indexed images", async () => {
  const { decodeGif } = await import("./gif");
  for (const colors of [2, 4, 8, 16, 32, 64, 128, 256]) {
    const rgba = new Uint8ClampedArray(160 * 100 * 4);
    let seed = 129;
    for (let i = 0; i < rgba.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const v = (seed >>> 16) % colors;
      rgba.set([v, v, v, 255], i);
    }
    const data = gifBytes([{ rgba, delay: 100 }], 160, 100);
    const result = decodeGif(data.buffer as ArrayBuffer).frames[0].pixels;
    expect(result.every((v, i) => v === rgba[i])).toBe(true);
  }
});
it("caps GIF frame rate without changing total animation duration", async () => {
  const { sampleMotionFrames } = await import("./recording");
  const { createDocument } = await import("@/core/document");
  const frames = [20, 20, 20, 20, 20, 20].map((duration) => ({
    doc: createDocument(1, 1),
    duration,
  }));
  const sampled = sampleMotionFrames(frames, 10);
  expect(sampled).toHaveLength(2);
  expect(sampled.reduce((sum, f) => sum + f.duration, 0)).toBe(120);
  expect(sampled[0].doc).toBe(frames[0].doc);
  expect(sampled[1].doc).toBe(frames[5].doc);
});
it("distributes GIF centisecond rounding without accumulating timing drift", async () => {
  const { decodeGif } = await import("./gif");
  const frames = Array.from({ length: 12 }, () => ({
    rgba: new Uint8ClampedArray([1, 2, 3, 255]),
    delay: 1000 / 12,
  }));
  const data = gifBytes(frames, 1, 1);
  expect(
    decodeGif(data.buffer as ArrayBuffer).frames.reduce(
      (sum, f) => sum + f.duration,
      0,
    ),
  ).toBe(1000);
});
