import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeOwnedDefault, decodeStillFile } from "./still-source";

function png(width = 2001, height = 2) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
function encoded(type: "jpeg" | "bmp" | "webp", animated = false) {
  if (type === "jpeg")
    return new Uint8Array([255, 216, 255, 192, 0, 8, 8, 0, 2, 7, 209, 1]);
  const bytes = new Uint8Array(type === "bmp" ? 54 : 30);
  const view = new DataView(bytes.buffer);
  if (type === "bmp") {
    bytes.set([66, 77]);
    view.setUint32(14, 40, true);
    view.setInt32(18, 2001, true);
    view.setInt32(22, -2, true);
  } else {
    bytes.set(new TextEncoder().encode("RIFF"));
    bytes.set(new TextEncoder().encode("WEBPVP8X"), 8);
    bytes[20] = animated ? 2 : 0;
    bytes[24] = 208;
    bytes[25] = 7;
    bytes[27] = 1;
  }
  return bytes;
}
function file(bytes = png(), type = "image/png", size = bytes.length) {
  const value = new File([bytes], "local", { type });
  const read = vi.fn(async () => bytes.buffer.slice(0));
  Object.defineProperties(value, {
    arrayBuffer: { value: read },
    size: { value: size },
  });
  return { value, read };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function browser(width = 2001, height = 2) {
  const canvas = document.createElement("canvas");
  const data = new Uint8ClampedArray(width * height * 4);
  data.set([20, 40, 60, 128]);
  const context = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data })) };
  vi.spyOn(canvas, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  const bitmap = { width, height, close: vi.fn() } as unknown as ImageBitmap;
  const decodeBitmap = vi.fn<
    (blob: Blob, options: ImageBitmapOptions) => Promise<ImageBitmap>
  >(async () => bitmap);
  const createCanvas = vi.fn(() => canvas);
  return { api: { decodeBitmap, createCanvas }, bitmap, canvas, context, data };
}
afterEach(() => vi.restoreAllMocks());

describe("full-source local still decoding", () => {
  it("retains dimensions above 1600 and alpha; signature sanitizes spoofed MIME", async () => {
    const b = browser();
    const result = await decodeStillFile(
      file(png(), "text/html").value,
      {},
      b.api,
    );
    expect(result).toEqual({ width: 2001, height: 2, rgba: b.data });
    expect(result.rgba.slice(0, 4)).toEqual(
      new Uint8ClampedArray([20, 40, 60, 128]),
    );
    expect(b.api.decodeBitmap.mock.calls[0][0].type).toBe("image/png");
    expect(b.api.decodeBitmap.mock.calls[0][1]).toMatchObject({
      imageOrientation: "from-image",
    });
    expect(b.context.drawImage).toHaveBeenCalledWith(b.bitmap, 0, 0, 2001, 2);
    expect(b.canvas.width).toBe(0);
    expect(b.canvas.height).toBe(0);
    expect(b.bitmap.close).toHaveBeenCalledOnce();
  });
  it.each(["jpeg", "bmp", "webp"] as const)(
    "uses the validated %s signature with spoofed MIME",
    async (format) => {
      const b = browser();
      const result = await decodeStillFile(
        file(encoded(format), "image/svg+xml").value,
        {},
        b.api,
      );
      expect(result.width).toBe(2001);
      expect(b.api.decodeBitmap.mock.calls[0][0].type).toBe(`image/${format}`);
    },
  );
  it("rejects animated WebP before decoding", async () => {
    const b = browser();
    await expect(
      decodeStillFile(file(encoded("webp", true)).value, {}, b.api),
    ).rejects.toThrow(/Animated/);
    expect(b.api.decodeBitmap).not.toHaveBeenCalled();
  });
  it("rechecks cancellation after a noncancellable read before decoding", async () => {
    const b = browser();
    const pending = deferred<ArrayBuffer>();
    const input = file();
    input.read.mockImplementation(() => pending.promise);
    const abort = new AbortController();
    const result = decodeStillFile(
      input.value,
      { signal: abort.signal },
      b.api,
    );
    abort.abort();
    pending.resolve(png().buffer);
    await expect(result).rejects.toThrow(/abort/i);
    expect(b.api.decodeBitmap).not.toHaveBeenCalled();
  });
  it.each([
    "<svg xmlns='http://www.w3.org/2000/svg'/>",
    "<!DOCTYPE html><html/>",
    "<?xml version='1.0'?>",
    "GIF89a",
    "\u0000\u0000\u0000\u0018ftypmp42",
  ])(
    "rejects unsupported signature before decoder allocation: %s",
    async (text) => {
      const b = browser();
      await expect(
        decodeStillFile(file(new TextEncoder().encode(text)).value, {}, b.api),
      ).rejects.toThrow(/Unsupported/);
      expect(b.api.decodeBitmap).not.toHaveBeenCalled();
      expect(b.api.createCanvas).not.toHaveBeenCalled();
    },
  );
  it("rejects declared oversize before reading and actual oversize before decoding", async () => {
    const b = browser();
    const declared = file(png(), "image/png", 12 * 1024 * 1024 + 1);
    await expect(decodeStillFile(declared.value, {}, b.api)).rejects.toThrow(
      /12 MiB/,
    );
    expect(declared.read).not.toHaveBeenCalled();
    const actual = file(new Uint8Array(12 * 1024 * 1024 + 1), "image/png", 33);
    await expect(decodeStillFile(actual.value, {}, b.api)).rejects.toThrow(
      /12 MiB/,
    );
    expect(b.api.decodeBitmap).not.toHaveBeenCalled();
  });
  it.each([
    [2001, 2000],
    [8193, 1],
    [0, 1],
  ])(
    "rejects %i x %i before allocation with honest 4 MP policy",
    async (w, h) => {
      const b = browser();
      await expect(
        decodeStillFile(file(png(w, h)).value, {}, b.api),
      ).rejects.toThrow(/4 megapixels/);
      expect(b.api.decodeBitmap).not.toHaveBeenCalled();
    },
  );
  it("preflights retained source/frame, encoded bytes and five RGBA equivalents before bitmap", async () => {
    const b = browser();
    await expect(
      decodeStillFile(
        file(png(2000, 2000)).value,
        { heldBytes: 122 * 1024 * 1024 },
        b.api,
      ),
    ).rejects.toThrow(/192 MiB/);
    expect(b.api.decodeBitmap).not.toHaveBeenCalled();
  });
  it("accepts EXIF-swapped decoded axes without resizing", async () => {
    const b = browser(2, 2001);
    expect(
      await decodeStillFile(file(encoded("jpeg")).value, {}, b.api),
    ).toMatchObject({ width: 2, height: 2001 });
  });
  it("rejects actual dimensions before canvas allocation and closes the bitmap", async () => {
    const b = browser(8193, 1);
    await expect(decodeStillFile(file().value, {}, b.api)).rejects.toThrow(
      /4 megapixels/,
    );
    expect(b.api.createCanvas).not.toHaveBeenCalled();
    expect(b.bitmap.close).toHaveBeenCalledOnce();
  });
  it("holds cleanup through obsolete noncancellable decode and never reads its pixels", async () => {
    const b = browser();
    const pending = deferred<ImageBitmap>();
    b.api.decodeBitmap.mockImplementation(() => pending.promise);
    const abort = new AbortController();
    const result = decodeStillFile(
      file().value,
      { signal: abort.signal },
      b.api,
    );
    await vi.waitFor(() => expect(b.api.decodeBitmap).toHaveBeenCalledOnce());
    abort.abort();
    pending.resolve(b.bitmap);
    await expect(result).rejects.toThrow(/abort/i);
    expect(b.bitmap.close).toHaveBeenCalledOnce();
    expect(b.api.createCanvas).not.toHaveBeenCalled();
  });
  it.each(["context", "draw", "readback"])(
    "resets canvas and closes bitmap on %s failure",
    async (stage) => {
      const b = browser();
      if (stage === "context")
        vi.mocked(b.canvas.getContext).mockReturnValue(null);
      if (stage === "draw")
        b.context.drawImage.mockImplementation(() => {
          throw new Error("draw failed");
        });
      if (stage === "readback")
        b.context.getImageData.mockImplementation(() => {
          throw new Error("read failed");
        });
      await expect(decodeStillFile(file().value, {}, b.api)).rejects.toThrow();
      expect(b.canvas.width).toBe(0);
      expect(b.canvas.height).toBe(0);
      expect(b.bitmap.close).toHaveBeenCalledOnce();
    },
  );
  it("propagates read/decode failure without allocating a canvas", async () => {
    const b = browser();
    const input = file();
    input.read.mockRejectedValueOnce(new Error("read failed"));
    await expect(decodeStillFile(input.value, {}, b.api)).rejects.toThrow(
      "read failed",
    );
    b.api.decodeBitmap.mockRejectedValueOnce(new Error("decode failed"));
    await expect(decodeStillFile(file().value, {}, b.api)).rejects.toThrow(
      "decode failed",
    );
    expect(b.api.createCanvas).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "revokes fallback URL and clears image on failure=%s",
    async (failure) => {
      const b = browser();
      const image = new Image();
      Object.defineProperties(image, {
        naturalWidth: { value: 2001 },
        naturalHeight: { value: 2 },
        decode: {
          value: failure
            ? async () => {
                throw new Error("decode failed");
              }
            : async () => {},
        },
      });
      const revokeURL = vi.fn();
      const api = {
        createCanvas: b.api.createCanvas,
        createImage: () => image,
        createURL: vi.fn<(blob: Blob) => string>(() => "blob:owned"),
        revokeURL,
      };
      const result = decodeStillFile(file().value, {}, api);
      if (failure) await expect(result).rejects.toThrow("decode failed");
      else await result;
      expect(revokeURL).toHaveBeenCalledWith("blob:owned");
      expect(image.getAttribute("src")).toBe("");
      expect(api.createURL.mock.calls[0][0].type).toBe("image/png");
    },
  );
  it("loads only the fixed audited owned default through its separate trusted path", async () => {
    const b = browser(1000, 1000);
    const fetchAsset = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(47982),
    }));
    const result = await decodeOwnedDefault({}, { ...b.api, fetchAsset });
    expect(result).toMatchObject({ width: 1000, height: 1000 });
    expect(fetchAsset).toHaveBeenCalledWith("/studio/botanical.svg", {
      signal: undefined,
    });
    expect(b.api.decodeBitmap.mock.calls[0][0].type).toBe("image/svg+xml");
  });
});
