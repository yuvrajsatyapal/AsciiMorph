import { afterEach, expect, it, vi } from "vitest";
import { runConversion } from "./runner";
import { DEFAULT_SETTINGS } from "./settings";
afterEach(() => vi.unstubAllGlobals());
const pixels = {
  width: 1,
  height: 1,
  data: new Uint8ClampedArray([255, 255, 255, 255]),
};
it("falls back cooperatively without Workers and aborts", async () => {
  vi.stubGlobal("Worker", undefined);
  const s = { ...DEFAULT_SETTINGS, width: 1, height: 1, preserveAspect: false };
  const doc = await runConversion(pixels, s, new AbortController().signal);
  expect(doc.layers[0].cells).toHaveLength(1);
  const ac = new AbortController();
  const pending = runConversion(pixels, s, ac.signal);
  ac.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});
it("terminates obsolete workers and never mutates the source buffer", async () => {
  const terminate = vi.fn();
  let posted: unknown;
  vi.stubGlobal(
    "Worker",
    class {
      terminate = terminate;
      postMessage(v: unknown) {
        posted = v;
      }
    },
  );
  const ac = new AbortController();
  const result = runConversion(pixels, DEFAULT_SETTINGS, ac.signal);
  ac.abort();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(terminate).toHaveBeenCalledTimes(1);
  expect(posted).toBeTruthy();
  expect(pixels.data.byteLength).toBe(4);
});
it("reports worker errors and cleans up", async () => {
  const terminate = vi.fn();
  vi.stubGlobal(
    "Worker",
    class {
      terminate = terminate;
      onerror: ((e: unknown) => void) | null = null;
      postMessage() {
        queueMicrotask(() =>
          this.onerror?.({
            message: "Worker failed",
            preventDefault: () => {},
          }),
        );
      }
    },
  );
  await expect(
    runConversion(pixels, DEFAULT_SETTINGS, new AbortController().signal),
  ).rejects.toThrow(/Worker failed/);
  expect(terminate).toHaveBeenCalledTimes(1);
});
