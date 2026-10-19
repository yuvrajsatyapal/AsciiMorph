import type { Pixels } from "./engine";
export interface ImageLimits {
  maxBytes: number;
  maxPixels: number;
  maxSide: number;
}
export const DEFAULT_LIMITS: ImageLimits = {
  maxBytes: 12 * 1024 * 1024,
  maxPixels: 24_000_000,
  maxSide: 8192,
};
function validateLimits(limits: ImageLimits) {
  for (const key of ["maxBytes", "maxPixels", "maxSide"] as const)
    if (
      !Number.isFinite(limits[key]) ||
      limits[key] < 1 ||
      limits[key] > DEFAULT_LIMITS[key]
    )
      throw new Error("Invalid image limits");
}
export function inspectImage(
  a: Uint8Array,
  size: number,
  limits: ImageLimits = DEFAULT_LIMITS,
) {
  validateLimits(limits);
  if (!Number.isFinite(size) || size <= 0 || size > limits.maxBytes)
    throw new Error(
      `File size exceeds the ${Math.round(limits.maxBytes / 1024 / 1024)} MiB limit or is empty.`,
    );
  const v = new DataView(a.buffer, a.byteOffset, a.byteLength),
    str = (i: number, n: number) =>
      String.fromCharCode(...a.subarray(i, i + n));
  let width = 0,
    height = 0,
    type = "";
  try {
    if (
      a.length >= 33 &&
      str(0, 8) === "\x89PNG\r\n\x1a\n" &&
      str(12, 4) === "IHDR" &&
      v.getUint32(8) === 13
    ) {
      width = v.getUint32(16);
      height = v.getUint32(20);
      type = "image/png";
    } else if (a[0] === 255 && a[1] === 216) {
      type = "image/jpeg";
      let p = 2;
      while (p + 4 <= a.length) {
        if (a[p] !== 255) throw new Error("Invalid JPEG marker");
        while (a[p] === 255) p++;
        const marker = a[p++];
        if (marker === 0xd9 || marker === 0xda) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        const length = v.getUint16(p);
        if (length < 2 || p + length > a.length) break;
        if (
          [
            0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
            0xce, 0xcf,
          ].includes(marker)
        ) {
          if (length < 8) break;
          height = v.getUint16(p + 3);
          width = v.getUint16(p + 5);
          break;
        }
        p += length;
      }
    } else if (
      a.length >= 54 &&
      str(0, 2) === "BM" &&
      v.getUint32(14, true) >= 40
    ) {
      width = v.getInt32(18, true);
      height = Math.abs(v.getInt32(22, true));
      type = "image/bmp";
    } else if (a.length >= 30 && str(0, 4) === "RIFF" && str(8, 4) === "WEBP") {
      type = "image/webp";
      const chunk = str(12, 4);
      if (chunk === "VP8X") {
        if (a[20] & 2) throw new Error("Animated images are not supported.");
        width = 1 + a[24] + (a[25] << 8) + (a[26] << 16);
        height = 1 + a[27] + (a[28] << 8) + (a[29] << 16);
      } else if (
        chunk === "VP8 " &&
        a[23] === 0x9d &&
        a[24] === 1 &&
        a[25] === 0x2a
      ) {
        width = v.getUint16(26, true) & 0x3fff;
        height = v.getUint16(28, true) & 0x3fff;
      } else if (chunk === "VP8L" && a[20] === 0x2f) {
        width = 1 + (((a[22] & 0x3f) << 8) | a[21]);
        height = 1 + (((a[24] & 15) << 10) | (a[23] << 2) | (a[22] >> 6));
      }
    }
  } catch (error) {
    if (error instanceof Error && /Animated/.test(error.message)) throw error;
    throw new Error("Malformed image header.");
  }
  if (!type)
    throw new Error("Unsupported image. Choose PNG, JPEG, WebP or BMP.");
  if (
    width < 1 ||
    height < 1 ||
    width > limits.maxSide ||
    height > limits.maxSide ||
    width * height > limits.maxPixels
  )
    throw new Error(
      "Image dimensions are invalid or exceed safe limits (8192px / 24 megapixels).",
    );
  return { width, height, type };
}
export async function decodeImage(
  file: File,
  limits = DEFAULT_LIMITS,
): Promise<Pixels> {
  validateLimits(limits);
  // Size gate precedes reading the complete file; byte signature precedes decoding.
  if (file.size < 1 || file.size > limits.maxBytes)
    throw new Error("File size exceeds the safe limit or is empty.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = inspectImage(bytes, file.size, limits);
  const blob = new Blob([bytes], { type: header.type });
  let bitmap: ImageBitmap | null = null,
    image: HTMLImageElement | null = null,
    url: string | null = null;
  try {
    let source: CanvasImageSource, w: number, h: number;
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      });
      source = bitmap;
      w = bitmap.width;
      h = bitmap.height;
    } else {
      url = URL.createObjectURL(blob);
      image = new Image();
      image.src = url;
      await image.decode();
      source = image;
      w = image.naturalWidth;
      h = image.naturalHeight;
    }
    if (
      w < 1 ||
      h < 1 ||
      w > limits.maxSide ||
      h > limits.maxSide ||
      w * h > limits.maxPixels
    )
      throw new Error("Decoded image dimensions exceed safe limits.");
    const scale = Math.min(1, 1600 / w, 1600 / h),
      width = Math.max(1, Math.round(w * scale)),
      height = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas decoding is unavailable.");
    ctx.drawImage(source, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    canvas.width = 1;
    canvas.height = 1;
    return { width, height, data };
  } catch (error) {
    throw new Error(
      `Could not decode image: ${error instanceof Error ? error.message : "damaged or unsupported file"}`,
    );
  } finally {
    bitmap?.close();
    if (image) image.src = "";
    if (url) URL.revokeObjectURL(url);
  }
}
