import { expect, it } from "vitest";
import { muxWebM, videoTimeline } from "./recording-webm";
it("builds deterministic samples while retaining exact total duration", () => {
  const schedule = videoTimeline([75, 125], 24);
  expect(schedule[0]).toEqual({ frame: 0, timestamp: 0, duration: 41667 });
  expect(schedule[2].frame).toBe(1);
  expect(schedule.at(-1)!.timestamp + schedule.at(-1)!.duration).toBe(200000);
});
it("writes a WebM container with video codec, dimensions and duration", () => {
  const bytes = muxWebM(
    [{ timestamp: 0, data: new Uint8Array([1, 2, 3]), key: true }],
    320,
    180,
    250,
  );
  expect(Array.from(bytes.slice(0, 4))).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  expect(new TextDecoder().decode(bytes)).toContain("webm");
  expect(new TextDecoder().decode(bytes)).toContain("V_VP8");
});
