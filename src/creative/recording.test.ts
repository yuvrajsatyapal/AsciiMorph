import { expect, it } from "vitest";
import { gifBytes, recordingMime } from "./recording";
it("writes a valid GIF89a with looping and individual frame delays", () => {
  const bytes = gifBytes(
    [
      { rgba: new Uint8ClampedArray([255, 0, 0, 255]), delay: 100 },
      { rgba: new Uint8ClampedArray([0, 255, 0, 255]), delay: 250 },
    ],
    1,
    1,
  );
  expect(new TextDecoder().decode(bytes.slice(0, 6))).toBe("GIF89a");
  expect(bytes.at(-1)).toBe(0x3b);
  expect(bytes.filter((b) => b === 0x2c).length).toBeGreaterThanOrEqual(2);
});
it("rejects unsupported recording and unbounded GIFs", () => {
  expect(() => recordingMime("mp4", () => false)).toThrow(/unsupported/i);
  expect(() => gifBytes([], 1, 1)).toThrow();
});
it("cancels and times out pending media preparation", async () => {
  const { waitForMedia } = await import("./recording");
  const controller = new AbortController();
  const pending = waitForMedia(new Promise(() => {}), controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await expect(
    waitForMedia(new Promise(() => {}), undefined, 1),
  ).rejects.toThrow(/timed out/);
});
it("requests compatible audio codecs when a recording has source audio", () => {
  expect(recordingMime("webm", () => true, true)).toContain("opus");
  expect(recordingMime("mp4", () => true, true)).toContain("mp4a");
});
