import { Blob as NodeBlob } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import {
  createStillImageExporter,
  encoderReservationBytes,
} from "./still-image";
import type { ReferenceCharactersFrameV1 } from "@/render/reference-characters";
const frame = (width = 13, height = 7): ReferenceCharactersFrameV1 => ({
  version: 1,
  width,
  height,
  rgba: new Uint8Array(width * height * 4),
  grid: null,
});
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function harness() {
  const surfaces: Array<{
    width: number;
    height: number;
    getContext: ReturnType<typeof vi.fn>;
    toBlob: ReturnType<typeof vi.fn>;
  }> = [];
  const contexts: Array<{
    putImageData: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
    fillStyle: string;
  }> = [];
  const createCanvas = vi.fn(() => {
    const context = {
      putImageData: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillStyle: "",
    };
    contexts.push(context);
    const surface = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((cb: BlobCallback, mime: string) => cb(blob(mime))),
    };
    surfaces.push(surface);
    return surface as unknown as HTMLCanvasElement;
  });
  const release = vi.fn(),
    reserveRelease = vi.fn(),
    reserve = vi.fn(() => reserveRelease);
  const click = vi.fn(),
    remove = vi.fn(),
    createObjectURL = vi.fn(() => "blob:test"),
    revokeObjectURL = vi.fn();
  const anchor = { click, remove, href: "", download: "" };
  const exporter = createStillImageExporter({
    createCanvas,
    createImageData: (rgba, w, h) =>
      ({ data: new Uint8ClampedArray(rgba), width: w, height: h }) as ImageData,
    createAnchor: () => anchor as unknown as HTMLAnchorElement,
    createObjectURL,
    revokeObjectURL,
    schedule: () => 1,
    unschedule: vi.fn(),
    reserve,
  });
  return {
    exporter,
    surfaces,
    contexts,
    release,
    reserveRelease,
    reserve,
    click,
    remove,
    anchor,
    createCanvas,
    createObjectURL,
    revokeObjectURL,
  };
}
function blob(mime: string) {
  return new NodeBlob(
    [
      mime === "image/png"
        ? new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
        : new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 255, 217]),
    ],
    { type: mime },
  ) as unknown as Blob;
}
const run = (
  h: ReturnType<typeof harness>,
  value = frame(),
  format: "png" | "jpeg" = "png",
  signal = new AbortController().signal,
) =>
  h.exporter.export(
    { frame: value, release: h.release },
    format,
    "image",
    signal,
  );
describe("owned full-frame still encoder", () => {
  it.each([1, 2, 3, 4])(
    "encodes every full-size pixel at scale %i without viewport input",
    async (scale) => {
      const h = harness(),
        f = frame(13 * scale, 7 * scale);
      f.rgba.set([255, 0, 0, 128], f.rgba.length - 4);
      await run(h, f);
      expect(h.contexts[0].putImageData.mock.calls[0][0]).toMatchObject({
        width: 13 * scale,
        height: 7 * scale,
        data: new Uint8ClampedArray(f.rgba),
      });
      expect(h.anchor.download).toBe("image.png");
      expect(h.click).toHaveBeenCalledOnce();
      expect(h.release).toHaveBeenCalledOnce();
      expect(h.reserve).toHaveBeenCalledWith(
        encoderReservationBytes(f.width, f.height, "png"),
      );
      expect(h.surfaces[0]).toMatchObject({ width: 0, height: 0 });
      h.exporter.dispose();
      expect(h.revokeObjectURL).toHaveBeenCalledOnce();
    },
  );
  it("preserves PNG alpha/margins and composites JPEG source-over black on a separate opaque canvas", async () => {
    const h = harness(),
      f = frame();
    f.rgba.set([200, 100, 50, 128]);
    await run(h, f, "jpeg");
    expect(h.contexts[0].putImageData.mock.calls[0][0].data[3]).toBe(128);
    expect(h.contexts[1].fillStyle).toBe("#000000");
    expect(h.contexts[1].fillRect).toHaveBeenCalledWith(0, 0, 13, 7);
    expect(h.contexts[1].drawImage).toHaveBeenCalledWith(h.surfaces[0], 0, 0);
    expect(h.surfaces[1].getContext).toHaveBeenCalledWith("2d", {
      alpha: false,
    });
    expect(h.anchor.download).toBe("image.jpeg");
  });
  it.each(["null", "mime", "signature"])(
    "rejects %s without download and releases all ownership",
    async (kind) => {
      const h = harness();
      h.createCanvas.mockImplementationOnce(() => {
        const c = {
          width: 0,
          height: 0,
          getContext: () => ({ putImageData: vi.fn() }),
          toBlob: (cb: BlobCallback) =>
            cb(
              kind === "null"
                ? null
                : kind === "mime"
                  ? blob("image/jpeg")
                  : (new NodeBlob(["bad"], {
                      type: "image/png",
                    }) as unknown as Blob),
            ),
        };
        return c as unknown as HTMLCanvasElement;
      });
      await expect(run(h)).rejects.toThrow(/encoder|MIME|signature/i);
      expect(h.click).not.toHaveBeenCalled();
      expect(h.release).toHaveBeenCalledOnce();
      expect(h.reserveRelease).toHaveBeenCalledOnce();
    },
  );
  it("rejects bounds/reservation before canvas allocation", async () => {
    const h = harness();
    await expect(run(h, frame(20000, 1))).rejects.toThrow(/bounds/i);
    expect(h.createCanvas).not.toHaveBeenCalled();
    const j = harness();
    j.reserve.mockImplementationOnce(() => {
      throw new Error("budget");
    });
    await expect(run(j)).rejects.toThrow("budget");
    expect(j.createCanvas).not.toHaveBeenCalled();
    expect(j.release).toHaveBeenCalledOnce();
  });
  it("keeps lease/reservation and one encode through abort, retry and disposal until native callback settles", async () => {
    const h = harness(),
      abort = new AbortController();
    let callback!: BlobCallback;
    h.createCanvas.mockImplementationOnce(
      () =>
        ({
          width: 0,
          height: 0,
          getContext: () => ({ putImageData: vi.fn() }),
          toBlob: (cb: BlobCallback) => {
            callback = cb;
          },
        }) as unknown as HTMLCanvasElement,
    );
    const first = run(h, frame(), "png", abort.signal);
    abort.abort();
    h.exporter.dispose();
    expect(h.release).not.toHaveBeenCalled();
    expect(h.reserveRelease).not.toHaveBeenCalled();
    const secondRelease = vi.fn();
    await expect(
      h.exporter.export(
        { frame: frame(), release: secondRelease },
        "png",
        "image",
        new AbortController().signal,
      ),
    ).rejects.toThrow(/busy|disposed/i);
    expect(secondRelease).toHaveBeenCalledOnce();
    callback(blob("image/png"));
    await expect(first).rejects.toThrow(/abort/i);
    expect(h.click).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledOnce();
    expect(h.reserveRelease).toHaveBeenCalledOnce();
  });
  it("discards cancellation during byte inspection and cleans up click failures", async () => {
    const h = harness(),
      abort = new AbortController(),
      bytes = deferred<ArrayBuffer>();
    const b = blob("image/png");
    vi.spyOn(b, "slice").mockReturnValue({
      arrayBuffer: () => bytes.promise,
    } as Blob);
    h.createCanvas.mockImplementationOnce(
      () =>
        ({
          width: 0,
          height: 0,
          getContext: () => ({ putImageData: vi.fn() }),
          toBlob: (cb: BlobCallback) => cb(b),
        }) as unknown as HTMLCanvasElement,
    );
    const result = run(h, frame(), "png", abort.signal);
    await Promise.resolve();
    abort.abort();
    bytes.resolve(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer);
    await expect(result).rejects.toThrow(/abort/i);
    expect(h.click).not.toHaveBeenCalled();
    const j = harness();
    j.click.mockImplementationOnce(() => {
      throw new Error("click failed");
    });
    await expect(run(j)).rejects.toThrow("click failed");
    expect(j.remove).toHaveBeenCalledOnce();
    expect(j.revokeObjectURL).toHaveBeenCalledOnce();
  });
});

it("charges completed Blob URLs until safe post-click revocation and bounds retained URLs", async () => {
  const h = harness(),
    releaseDownload = vi.fn();
  const retainDownload = vi.fn(() => releaseDownload);
  const timers: Array<() => void> = [];
  const exporter = createStillImageExporter({
    createCanvas: h.createCanvas,
    createImageData: (rgba, w, height) =>
      ({ data: new Uint8ClampedArray(rgba), width: w, height }) as ImageData,
    createAnchor: () => h.anchor as unknown as HTMLAnchorElement,
    createObjectURL: () => "blob:retained",
    revokeObjectURL: h.revokeObjectURL,
    schedule: (cb) => {
      timers.push(cb);
      return 1;
    },
    unschedule: vi.fn(),
    reserve: h.reserve,
    retainDownload,
  });
  await exporter.export(
    { frame: frame(), release: h.release },
    "png",
    "image",
    new AbortController().signal,
  );
  expect(retainDownload).toHaveBeenCalledWith(8);
  expect(releaseDownload).not.toHaveBeenCalled();
  timers[0]();
  expect(releaseDownload).toHaveBeenCalledOnce();
  exporter.dispose();
  expect(releaseDownload).toHaveBeenCalledOnce();
});

it("bounds completed URL ownership to 32 until cleanup and resumes after safe revocation", async () => {
  const h = harness(),
    timers: Array<() => void> = [];
  let sequence = 0;
  const releaseDownload = vi.fn();
  const exporter = createStillImageExporter({
    createCanvas: h.createCanvas,
    createImageData: (rgba, w, height) =>
      ({ data: new Uint8ClampedArray(rgba), width: w, height }) as ImageData,
    createAnchor: () => h.anchor as unknown as HTMLAnchorElement,
    createObjectURL: () => `blob:${++sequence}`,
    revokeObjectURL: h.revokeObjectURL,
    schedule: (cb) => {
      timers.push(cb);
      return 1;
    },
    unschedule: vi.fn(),
    reserve: h.reserve,
    retainDownload: () => releaseDownload,
  });
  for (let i = 0; i < 32; i++)
    await exporter.export(
      { frame: frame(), release: h.release },
      "png",
      "image",
      new AbortController().signal,
    );
  await expect(
    exporter.export(
      { frame: frame(), release: h.release },
      "png",
      "image",
      new AbortController().signal,
    ),
  ).rejects.toThrow(/busy/);
  expect(h.click).toHaveBeenCalledTimes(32);
  timers[0]();
  await exporter.export(
    { frame: frame(), release: h.release },
    "png",
    "image",
    new AbortController().signal,
  );
  expect(h.click).toHaveBeenCalledTimes(33);
  exporter.dispose();
  expect(releaseDownload).toHaveBeenCalledTimes(33);
});
