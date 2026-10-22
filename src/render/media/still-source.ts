import { inspectImage, type ImageLimits } from "@/converter/image";

export const STILL_LIMITS: Readonly<ImageLimits> = Object.freeze({
  maxBytes: 12 * 1024 * 1024,
  maxPixels: 4_000_000,
  maxSide: 8192,
});
const PIPELINE_BYTES = 192 * 1024 * 1024;
export type DecodedStill = Readonly<{
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}>;
export type DecodeOptions = { signal?: AbortSignal; heldBytes?: number };
/** Platform boundary only. Constructed when decoding, never during SSR/render. */
export type StillBrowser = {
  decodeBitmap?: (
    blob: Blob,
    options: ImageBitmapOptions,
  ) => Promise<ImageBitmap>;
  createCanvas: () => HTMLCanvasElement;
  createImage?: () => HTMLImageElement;
  createURL?: (blob: Blob) => string;
  revokeURL?: (url: string) => void;
  fetchAsset?: (
    path: string,
    options: { signal?: AbortSignal },
  ) => Promise<{
    ok: boolean;
    arrayBuffer(): Promise<ArrayBuffer>;
  }>;
};
function browser(): StillBrowser {
  return {
    decodeBitmap:
      typeof createImageBitmap === "function"
        ? (blob, options) => createImageBitmap(blob, options)
        : undefined,
    createCanvas: () => document.createElement("canvas"),
    createImage: () => new Image(),
    createURL: (blob) => URL.createObjectURL(blob),
    revokeURL: (url) => URL.revokeObjectURL(url),
    fetchAsset: (path, options) => fetch(path, options),
  };
}
export function checkStillAbort(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new DOMException("Source operation aborted", "AbortError");
}
function dimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > STILL_LIMITS.maxSide ||
    height > STILL_LIMITS.maxSide ||
    width * height > STILL_LIMITS.maxPixels
  )
    throw new Error(
      "Image dimensions must be within 8192px per side and 4 megapixels; images are not downsized.",
    );
}
/** Known JS/backing/transfer allowances only, excluding opaque browser/native
 * decoder internals. WASM, calibration and render-output budgets are separate. */
function preflight(
  width: number,
  height: number,
  encoded: number,
  held = 0,
): void {
  dimensions(width, height);
  if (
    !Number.isSafeInteger(held) ||
    held < 0 ||
    held + encoded + 5 * width * height * 4 > PIPELINE_BYTES
  )
    throw new Error(
      "Source replacement exceeds the 192 MiB source pipeline budget.",
    );
}
function encodedSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 1 || size > STILL_LIMITS.maxBytes)
    throw new Error("Choose a nonempty image within the 12 MiB encoded limit.");
}
async function readPixels(
  bytes: ArrayBuffer,
  type: string,
  width: number,
  height: number,
  options: DecodeOptions,
  api: StillBrowser,
): Promise<DecodedStill> {
  preflight(width, height, bytes.byteLength, options.heldBytes);
  checkStillAbort(options.signal);
  const blob = new Blob([bytes], { type });
  let bitmap: ImageBitmap | undefined;
  let image: HTMLImageElement | undefined;
  let url: string | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    let source: CanvasImageSource;
    let w: number, h: number;
    if (api.decodeBitmap) {
      bitmap = await api.decodeBitmap(blob, { imageOrientation: "from-image" });
      source = bitmap;
      w = bitmap.width;
      h = bitmap.height;
    } else {
      if (!api.createImage || !api.createURL || !api.revokeURL)
        throw new Error("Image decoding is unavailable.");
      url = api.createURL(blob);
      image = api.createImage();
      image.src = url;
      await image.decode();
      source = image;
      w = image.naturalWidth;
      h = image.naturalHeight;
    }
    checkStillAbort(options.signal);
    preflight(w, h, bytes.byteLength, options.heldBytes);
    if (!((w === width && h === height) || (w === height && h === width)))
      throw new Error("Decoded geometry differs from the image header.");
    canvas = api.createCanvas();
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", {
      willReadFrequently: true,
      colorSpace: "srgb",
    });
    if (!ctx) throw new Error("Canvas decoding is unavailable.");
    ctx.drawImage(source, 0, 0, w, h);
    // Canvas readback supplies straight alpha; request sRGB where supported.
    // This does not promise identical native color decoding across browsers.
    const rgba = ctx.getImageData(0, 0, w, h, { colorSpace: "srgb" }).data;
    checkStillAbort(options.signal);
    if (rgba.length !== w * h * 4)
      throw new Error("Invalid decoded pixel buffer.");
    return Object.freeze({ width: w, height: h, rgba });
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    bitmap?.close();
    if (image) image.src = "";
    if (url !== undefined) api.revokeURL!(url);
  }
}
/** Local files only; signatures, never claimed MIME/extensions, select a codec. */
export async function decodeStillFile(
  file: File,
  options: DecodeOptions = {},
  api: StillBrowser = browser(),
): Promise<DecodedStill> {
  checkStillAbort(options.signal);
  encodedSize(file.size);
  const bytes = await file.arrayBuffer();
  checkStillAbort(options.signal);
  encodedSize(bytes.byteLength);
  let header: ReturnType<typeof inspectImage>;
  try {
    header = inspectImage(
      new Uint8Array(bytes),
      bytes.byteLength,
      STILL_LIMITS,
    );
  } catch (error) {
    if (error instanceof Error && /dimensions/.test(error.message))
      throw new Error(
        "Image dimensions must be within 8192px per side and 4 megapixels; images are not downsized.",
      );
    throw error;
  }
  return readPixels(
    bytes,
    header.type,
    header.width,
    header.height,
    options,
    api,
  );
}
/** Sole trusted SVG exception: fixed same-origin audited original, never a
 * caller-provided path, URL, markup or arbitrary user SVG. */
export async function decodeOwnedDefault(
  options: DecodeOptions = {},
  api: StillBrowser = browser(),
): Promise<DecodedStill> {
  checkStillAbort(options.signal);
  preflight(1000, 1000, 47982, options.heldBytes);
  if (!api.fetchAsset)
    throw new Error("Default source loading is unavailable.");
  const response = await api.fetchAsset("/studio/botanical.svg", {
    signal: options.signal,
  });
  if (!response.ok) throw new Error("Could not load the owned default source.");
  const bytes = await response.arrayBuffer();
  checkStillAbort(options.signal);
  if (bytes.byteLength !== 47982)
    throw new Error("Owned default asset differs from the audited source.");
  return readPixels(bytes, "image/svg+xml", 1000, 1000, options, api);
}
