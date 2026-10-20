import { describe, expect, it, vi } from "vitest";
import { createDocument } from "@/core/document";
import { importMedia, videoSampleTimes } from "./media";
import { gifBytes } from "./recording";
vi.mock("@/converter/runner", () => ({
  runConversion: vi.fn(async () => createDocument(2, 2)),
}));
function gifFile(delays: number[]) {
  const bytes = gifBytes(
    delays.map((delay) => ({
      delay,
      rgba: new Uint8ClampedArray([255, 0, 0, 255]),
    })),
    1,
    1,
  );
  return {
    name: "timed.gif",
    type: "image/gif",
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer,
  } as File;
}
describe("bounded local media import", () => {
  it("retains GIF source delays instead of extending each frame to a fixed sample interval", async () => {
    const frames = await importMedia(
      gifFile([100, 250, 400]),
      2,
      4,
      new AbortController().signal,
      () => {},
    );
    expect(frames.map((frame) => frame.duration)).toEqual([100, 250, 400]);
  });
  it("clips the final GIF frame to the requested time budget", async () => {
    const progress: number[] = [];
    const frames = await importMedia(
      gifFile([100, 250, 400]),
      8,
      0.5,
      new AbortController().signal,
      (value) => progress.push(value),
    );
    expect(frames.map((frame) => frame.duration)).toEqual([100, 250, 150]);
    expect(progress.every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(progress.at(-1)).toBe(1);
  });
  it("does not extend a video's partial final sample to a full frame interval", () => {
    const frames = videoSampleTimes(1.25, 2, 4);
    expect(frames.map((frame) => frame.duration)).toEqual([500, 500, 250]);
    expect(frames[0].time).toBe(0);
  });
  it("rejects invalid limits and aborts before decoding", async () => {
    const signal = new AbortController();
    signal.abort();
    await expect(
      importMedia(gifFile([100]), 8, 4, signal.signal, () => {}),
    ).rejects.toHaveProperty("name", "AbortError");
    await expect(
      importMedia(
        gifFile([100]),
        21,
        4,
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow(/1–20/);
    await expect(
      importMedia(
        { size: 42_000_000 } as File,
        8,
        4,
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow(/40 MiB/);
  });
});

it("clips GIF trim start within a frame and rejects an empty selection", async () => {
  const frames = await importMedia(
    gifFile([100, 250, 400]),
    8,
    0.4,
    new AbortController().signal,
    () => {},
    { start: 0.2 },
  );
  expect(frames.map((f) => f.duration)).toEqual([150, 250]);
  await expect(
    importMedia(
      gifFile([100, 250]),
      8,
      1,
      new AbortController().signal,
      () => {},
      { start: 1 },
    ),
  ).rejects.toThrow(/trim/i);
});
it("applies chosen output dimensions, character and color presets to conversion", async () => {
  const { runConversion } = await import("@/converter/runner");
  await importMedia(
    gifFile([100]),
    8,
    1,
    new AbortController().signal,
    () => {},
    { width: 100, height: 30, mode: "grayscale", charset: "detailed" },
  );
  expect(runConversion).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      width: 100,
      height: 30,
      mode: "grayscale",
      charset: "detailed",
    }),
    expect.anything(),
  );
});

it("coalesces a leading sub-20ms GIF trim remainder while preserving total time", async () => {
  const frames = await importMedia(
    gifFile([100, 250, 400]),
    8,
    0.4,
    new AbortController().signal,
    () => {},
    { start: 0.09 },
  );
  expect(frames.every((frame) => frame.duration >= 20)).toBe(true);
  expect(frames.reduce((sum, frame) => sum + frame.duration, 0)).toBe(400);
  expect(frames.map((frame) => frame.duration)).toEqual([260, 140]);
});

it.each([
  { delays: [100, 250], seconds: 0.11, durations: [110] },
  { delays: [10000, 100], seconds: 10.01, durations: [9990, 20] },
  { delays: [100, 10000], seconds: 10.01, start: 0.09, durations: [9980, 30] },
])(
  "keeps short final GIF remainders within project delay limits: $delays",
  async ({ delays, seconds, start, durations }) => {
    const frames = await importMedia(
      gifFile(delays),
      1,
      seconds,
      new AbortController().signal,
      () => {},
      { start },
    );
    expect(frames.map((frame) => frame.duration)).toEqual(durations);
    expect(
      frames.every((frame) => frame.duration >= 20 && frame.duration <= 10000),
    ).toBe(true);
    expect(frames.reduce((sum, frame) => sum + frame.duration, 0)).toBe(
      Math.round(seconds * 1000),
    );
  },
);
