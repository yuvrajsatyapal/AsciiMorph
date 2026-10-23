import { afterEach, expect, it, vi } from "vitest";
import { paintStudioFrame } from "./viewport";
const original = globalThis.ImageData;
afterEach(() => {
  globalThis.ImageData = original;
});
it("paints the complete RGBA frame including margins and null grids using the original backing", () => {
  class Pixels {
    constructor(
      public data: Uint8ClampedArray,
      public width: number,
      public height: number,
    ) {}
  }
  globalThis.ImageData = Pixels as unknown as typeof ImageData;
  const putImageData = vi.fn(),
    canvas = {
      width: 1,
      height: 1,
      getContext: () => ({ putImageData }),
    } as unknown as HTMLCanvasElement;
  const rgba = new Uint8Array(80);
  rgba.set([3, 4, 5, 255], 76);
  const frame = { version: 1, width: 5, height: 4, rgba, grid: null };
  paintStudioFrame(canvas, frame);
  expect([canvas.width, canvas.height]).toEqual([5, 4]);
  const image = putImageData.mock.calls[0][0] as ImageData;
  expect(image.data.buffer).toBe(rgba.buffer);
  expect([...image.data.slice(-4)]).toEqual([3, 4, 5, 255]);
  expect(putImageData.mock.calls[0].slice(1)).toEqual([0, 0]);
});
it("rejects unsafe geometry and missing canvas contexts before resizing", () => {
  const canvas = {
    width: 7,
    height: 9,
    getContext: () => null,
  } as unknown as HTMLCanvasElement;
  expect(() =>
    paintStudioFrame(canvas, { width: 2, height: 2, rgba: new Uint8Array(16) }),
  ).toThrow(/context/i);
  expect([canvas.width, canvas.height]).toEqual([7, 9]);
  expect(() =>
    paintStudioFrame(canvas, {
      width: 90000,
      height: 90000,
      rgba: new Uint8Array(4),
    }),
  ).toThrow(/frame/i);
  expect([canvas.width, canvas.height]).toEqual([7, 9]);
});
