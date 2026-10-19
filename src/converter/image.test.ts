import { expect, it } from "vitest";
import { inspectImage, DEFAULT_LIMITS } from "./image";
function png(w = 10, h = 20) {
  const a = new Uint8Array(33);
  a.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const v = new DataView(a.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return a;
}
it("preflights PNG before decoding and uses configurable limits", () => {
  expect(inspectImage(png(), 33)).toMatchObject({
    width: 10,
    height: 20,
    type: "image/png",
  });
  expect(() => inspectImage(png(8193, 1), 33)).toThrow(/dimensions/i);
  expect(() => inspectImage(png(8000, 8000), 33)).toThrow(/dimensions/i);
  expect(() => inspectImage(png(), DEFAULT_LIMITS.maxBytes + 1)).toThrow(
    /size/i,
  );
  expect(() =>
    inspectImage(png(), 33, { ...DEFAULT_LIMITS, maxPixels: 100 }),
  ).toThrow();
  expect(() => inspectImage(png(0, 1), 33)).toThrow();
});
it("rejects empty, malformed, unsupported and truncated headers", () => {
  for (const a of [
    new Uint8Array(),
    new Uint8Array([1, 2, 3]),
    new TextEncoder().encode('<svg width="100000"/>'),
    png().slice(0, 20),
  ])
    expect(() => inspectImage(a, a.length)).toThrow();
  expect(() =>
    inspectImage(png(), 33, { ...DEFAULT_LIMITS, maxBytes: Infinity }),
  ).toThrow();
});
it("reads BMP and JPEG dimensions", () => {
  const bmp = new Uint8Array(54);
  bmp.set([66, 77]);
  const v = new DataView(bmp.buffer);
  v.setUint32(14, 40, true);
  v.setInt32(18, 15, true);
  v.setInt32(22, -25, true);
  expect(inspectImage(bmp, 54)).toMatchObject({
    width: 15,
    height: 25,
    type: "image/bmp",
  });
  const jpg = new Uint8Array([
    255, 216, 255, 192, 0, 17, 8, 0, 20, 0, 10, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0,
  ]);
  expect(inspectImage(jpg, jpg.length)).toMatchObject({
    width: 10,
    height: 20,
    type: "image/jpeg",
  });
});
it("reads WebP extended dimensions and rejects animation", () => {
  const a = new Uint8Array(30);
  a.set(new TextEncoder().encode("RIFF"));
  a.set(new TextEncoder().encode("WEBPVP8X"), 8);
  a[24] = 9;
  a[27] = 19;
  expect(inspectImage(a, 30)).toMatchObject({
    width: 10,
    height: 20,
    type: "image/webp",
  });
  a[20] = 2;
  expect(() => inspectImage(a, 30)).toThrow(/animated/i);
});
it("decoding rejects bad data and closes decoded bitmaps after canvas failure", async () => {
  const { vi } = await import("vitest");
  const { decodeImage } = await import("./image");
  const bytes = png();
  const file = {
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer,
  } as File;
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockRejectedValueOnce(new Error("damaged pixels")),
  );
  await expect(decodeImage(file)).rejects.toThrow(/decode.*damaged pixels/);
  const close = vi.fn();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 10, height: 20, close })),
  );
  const context = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(null);
  await expect(decodeImage(file)).rejects.toThrow(/Canvas decoding/);
  expect(close).toHaveBeenCalledTimes(1);
  context.mockRestore();
  vi.unstubAllGlobals();
});
it("rejects unsafe configured limits before reading any file bytes", async () => {
  const { vi } = await import("vitest");
  const { decodeImage } = await import("./image");
  const read = vi.fn();
  const file = { size: 1, arrayBuffer: read } as unknown as File;
  await expect(
    decodeImage(file, { ...DEFAULT_LIMITS, maxBytes: Infinity }),
  ).rejects.toThrow(/limits/i);
  expect(read).not.toHaveBeenCalled();
});
