// @vitest-environment node
import { expect, it } from "vitest";
import sharp from "sharp";
import { encodeRgbaPng } from "./png";
it("preserves exact straight RGBA including translucent colors across stored-deflate blocks", async () => {
  const width = 193,
    height = 97,
    rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4)
    rgba.set([17, (i * 7) % 256, 51, i % 16 === 0 ? 0 : 170], i);
  const bytes = encodeRgbaPng(width, height, rgba);
  const decoded = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(decoded.info).toMatchObject({ width, height, channels: 4 });
  expect(new Uint8Array(decoded.data)).toEqual(rgba);
  expect(bytes.length).toBeLessThan(rgba.length + 65536);
});
it("rejects malformed bounds before allocation", () => {
  for (const [w, h] of [
    [0, 1],
    [1, 0],
    [1.5, 1],
    [16385, 1],
    [8192, 8192],
  ])
    expect(() => encodeRgbaPng(w, h, new Uint8Array())).toThrow();
  expect(() => encodeRgbaPng(2, 2, new Uint8Array(15))).toThrow();
});
