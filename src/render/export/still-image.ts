import { MAX_BACKING_PIXELS, MAX_BACKING_SIDE } from "@/core/render";
import type { ReferenceCharactersFrameV1 } from "@/render/reference-characters";
export type StillFormat = "png" | "jpeg";
export type CapturedStill = {
  frame: ReferenceCharactersFrameV1;
  release(): void;
};
export type StillImageBoundaries = {
  createCanvas(): HTMLCanvasElement;
  createImageData(rgba: Uint8Array, width: number, height: number): ImageData;
  createAnchor(): HTMLAnchorElement;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  schedule(callback: () => void): ReturnType<typeof setTimeout> | number;
  unschedule(timer: ReturnType<typeof setTimeout> | number): void;
  reserve(bytes: number): () => void;
  retainDownload(bytes: number): () => void;
};
/** Explicit session policy, not a browser RSS claim: ImageData copy (4 B/px),
 * source canvas (4), optional opaque JPEG canvas (4), encoded Blob (4 + 64 KiB),
 * opaque codec scratch allowance (8 + 1 MiB). Browser/GPU process overhead,
 * compositor caches and OS download storage are outside this policy. */
export function encoderReservationBytes(
  width: number,
  height: number,
  format: StillFormat,
) {
  return width * height * (format === "jpeg" ? 24 : 20) + 1_114_112;
}
const aborted = () => new DOMException("Still export aborted", "AbortError");
export function createStillImageExporter(
  options: Partial<StillImageBoundaries> &
    Pick<StillImageBoundaries, "reserve">,
) {
  // Browser APIs are invoked only by a committed runtime's user-triggered export.
  const boundary: StillImageBoundaries = {
    createCanvas: () => document.createElement("canvas"),
    createImageData: (rgba, w, h) =>
      new ImageData(new Uint8ClampedArray(rgba), w, h),
    createAnchor: () => document.createElement("a"),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    schedule: (callback) => setTimeout(callback, 30_000),
    unschedule: (timer) => clearTimeout(timer),
    retainDownload: () => () => {},
    ...options,
  };
  let active = false,
    disposed = false;
  const urls = new Map<
    string,
    { timer: ReturnType<typeof setTimeout> | number; release(): void }
  >();
  function revoke(url: string) {
    const retained = urls.get(url);
    if (!retained) return;
    boundary.unschedule(retained.timer);
    urls.delete(url);
    try {
      boundary.revokeObjectURL(url);
    } finally {
      retained.release();
    }
  }
  return {
    async export(
      capture: CapturedStill,
      format: StillFormat,
      name: string,
      signal: AbortSignal,
      progress?: (phase: "encoding" | "downloading") => void,
    ): Promise<void> {
      if (disposed || active || urls.size >= 32) {
        capture.release();
        throw new Error(
          disposed
            ? "Still encoder disposed"
            : "Still encoder busy; wait for previous downloads",
        );
      }
      active = true;
      const canvases: HTMLCanvasElement[] = [];
      let release: (() => void) | undefined;
      const check = () => {
        if (disposed || signal.aborted) throw aborted();
      };
      try {
        check();
        if (format !== "png" && format !== "jpeg")
          throw new Error("Unsupported still format");
        const f = capture.frame;
        if (
          !Number.isSafeInteger(f.width) ||
          !Number.isSafeInteger(f.height) ||
          f.width < 1 ||
          f.height < 1 ||
          f.width > MAX_BACKING_SIDE ||
          f.height > MAX_BACKING_SIDE ||
          f.width * f.height > MAX_BACKING_PIXELS ||
          f.rgba.length !== f.width * f.height * 4
        )
          throw new Error("Still frame bounds are invalid");
        release = boundary.reserve(
          encoderReservationBytes(f.width, f.height, format),
        );
        function canvas(opaque = false) {
          const c = boundary.createCanvas();
          canvases.push(c);
          c.width = f.width;
          c.height = f.height;
          const context = c.getContext("2d", { alpha: !opaque });
          if (!context) throw new Error("Still encoder canvas unavailable");
          return { c, context };
        }
        const source = canvas();
        source.context.putImageData(
          boundary.createImageData(f.rgba, f.width, f.height),
          0,
          0,
        );
        let target = source.c;
        if (format === "jpeg") {
          const matte = canvas(true);
          matte.context.fillStyle = "#000000";
          matte.context.fillRect(0, 0, f.width, f.height);
          matte.context.drawImage(source.c, 0, 0);
          target = matte.c;
        }
        check();
        const mime = format === "png" ? "image/png" : "image/jpeg";
        // Native toBlob cannot be canceled. Never race it against AbortSignal:
        // both the captured frame and all canvas/codec reservations remain owned.
        progress?.("encoding");
        const blob = await new Promise<Blob | null>((resolve, reject) => {
          try {
            target.toBlob(resolve, mime, 0.92);
          } catch (reason) {
            reject(reason);
          }
        });
        check();
        if (!blob) throw new Error("Still encoder returned no Blob");
        if (blob.type !== mime)
          throw new Error("Still encoder returned the wrong MIME type");
        if (blob.size > f.width * f.height * 4 + 65_536)
          throw new Error("Still encoder Blob exceeds reserved budget");
        const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
        check();
        const png = [137, 80, 78, 71, 13, 10, 26, 10];
        if (
          format === "png"
            ? !png.every((n, i) => bytes[i] === n)
            : !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
        )
          throw new Error("Still encoder returned an invalid byte signature");
        progress?.("downloading");
        check();
        const releaseDownload = boundary.retainDownload(blob.size);
        let url: string | undefined;
        let anchor: HTMLAnchorElement | undefined;
        let retained = false;
        try {
          check();
          url = boundary.createObjectURL(blob);
          anchor = boundary.createAnchor();
          anchor.href = url;
          anchor.download = `${name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "asciimorph"}.${blob.type === "image/png" ? "png" : "jpeg"}`;
          anchor.click();
          const usedURL = url;
          urls.set(url, {
            timer: boundary.schedule(() => revoke(usedURL)),
            release: releaseDownload,
          });
          retained = true;
        } finally {
          anchor?.remove();
          if (!retained) {
            if (url) boundary.revokeObjectURL(url);
            releaseDownload();
          }
        }
      } finally {
        for (const c of canvases) c.width = c.height = 0;
        release?.();
        capture.release();
        active = false;
      }
    },
    dispose() {
      disposed = true;
      for (const url of urls.keys()) revoke(url);
    },
  };
}
