import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useConverter } from "./use-converter";
import { createDocument } from "@/core/document";
import { decodeImage } from "./image";
import { runConversion } from "./runner";
const pixels = {
  width: 1,
  height: 1,
  data: new Uint8ClampedArray([255, 255, 255, 255]),
};
vi.mock("./image", () => ({
  DEFAULT_LIMITS: { maxBytes: 12000000, maxPixels: 24000000, maxSide: 8192 },
  decodeImage: vi.fn(),
}));
vi.mock("./presets", () => ({ calibrate: vi.fn(async () => undefined) }));
vi.mock("./runner", () => ({ runConversion: vi.fn() }));
beforeEach(() => {
  vi.mocked(decodeImage).mockResolvedValue(pixels);
  vi.mocked(runConversion).mockImplementation(async () => createDocument(1, 1));
  URL.createObjectURL = vi.fn(() => "blob:local-image");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.clearAllMocks());
it("normalizes whitespace filenames and revokes source URLs on removal", async () => {
  const { result } = renderHook(() => useConverter());
  await act(async () => result.current.upload(new File(["png"], "   .png")));
  await waitFor(() => expect(result.current.result).not.toBeNull());
  expect(result.current.result?.name).toBe("Converted image");
  act(() => result.current.remove());
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local-image");
  expect(result.current.result).toBeNull();
});
it("ignores late decoding after removal and cleans up on unmount", async () => {
  let finish!: (p: typeof pixels) => void;
  vi.mocked(decodeImage).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { result, unmount } = renderHook(() => useConverter());
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.upload(new File(["x"], "old.png"));
  });
  act(() => result.current.remove());
  await act(async () => {
    finish(pixels);
    await pending;
  });
  expect(result.current.source).toBeNull();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  await act(async () => result.current.upload(new File(["x"], "new.png")));
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local-image");
});
it("disables stale results immediately and rejects obsolete worker completion", async () => {
  const { result } = renderHook(() => useConverter());
  await act(async () => result.current.upload(new File(["x"], "a.png")));
  await waitFor(() => expect(result.current.result).not.toBeNull());
  let finish!: (d: ReturnType<typeof createDocument>) => void;
  vi.mocked(runConversion).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  act(() => result.current.update({ width: 40 }));
  expect(result.current.result).toBeNull();
  await waitFor(() => expect(runConversion).toHaveBeenCalledTimes(2));
  act(() => result.current.cancel());
  await act(async () => finish(createDocument(2, 1)));
  expect(result.current.result).toBeNull();
  expect(result.current.cancelled).toBe(true);
});
