import { it, expect } from "vitest";
import { decodeGif } from "./gif";
import { gifBytes } from "./recording";
it("decodes exported multi-frame GIF, including LZW clear boundaries", () => {
  const a = new Uint8ClampedArray(16 * 16 * 4),
    b = a.slice();
  for (let i = 0; i < a.length; i += 4) {
    a.set([255, 0, 0, 255], i);
    b.set([0, 255, 0, 255], i);
  }
  const bytes = gifBytes(
    [
      { rgba: a, delay: 100 },
      { rgba: b, delay: 250 },
    ],
    16,
    16,
  );
  const gif = decodeGif(bytes.buffer as ArrayBuffer);
  expect(gif.frames).toHaveLength(2);
  expect(gif.frames[0].pixels).toEqual(a);
  expect(gif.frames[1].pixels).toEqual(b);
  expect(gif.frames[1].duration).toBe(250);
});
it("rejects truncated or oversized GIF before allocation", () => {
  expect(() => decodeGif(new ArrayBuffer(0))).toThrow();
  const bytes = new Uint8Array([
    71, 73, 70, 56, 57, 97, 255, 255, 255, 255, 0, 0, 0,
  ]);
  expect(() => decodeGif(bytes.buffer)).toThrow(/dimensions/);
});
it("requires a GIF trailer and complete image data", () => {
  const bytes = gifBytes(
    [{ rgba: new Uint8ClampedArray([255, 0, 0, 255]), delay: 100 }],
    1,
    1,
  );
  expect(() => decodeGif(bytes.slice(0, -1).buffer as ArrayBuffer)).toThrow(
    /Truncated/,
  );
});
it("restores the previous disposal background using the previous transparency flag", () => {
  // Four-color global palette: red logical background, blue source, green next source.
  // Minimum LZW size 2. Clear, literal, end are packed independently for each image.
  const bytes = Uint8Array.from([
    71, 73, 70, 56, 57, 97, 2, 0, 1, 0, 0x81, 0, 0, 255, 0, 0, 0, 0, 255, 0,
    255, 0, 0, 0, 0, 0x21, 0xf9, 4, 8, 10, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1,
    0, 0, 2, 2, 0x4c, 0x01, 0, 0x21, 0xf9, 4, 1, 10, 0, 0, 0, 0x2c, 1, 0, 0, 0,
    1, 0, 1, 0, 0, 2, 2, 0x54, 0x01, 0, 0x3b,
  ]);
  const decoded = decodeGif(bytes.buffer);
  expect(Array.from(decoded.frames[0].pixels)).toEqual([
    0, 0, 255, 255, 255, 0, 0, 255,
  ]);
  expect(Array.from(decoded.frames[1].pixels)).toEqual([
    255, 0, 0, 255, 0, 255, 0, 255,
  ]);
});
