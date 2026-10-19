import { describe, expect, it, vi } from "vitest";
import { audioFeatures, audioArtwork, releaseAudio } from "./audio";
import { validateDocument } from "@/core/document";
describe("audio response", () => {
  it("measures real amplitude and bounded frequency bands", () => {
    const quiet = audioFeatures(
      new Uint8Array([128, 128, 128, 128]),
      new Uint8Array(8),
    );
    expect(quiet.volume).toBe(0);
    const loud = audioFeatures(
      new Uint8Array([0, 255, 0, 255]),
      new Uint8Array(8).fill(255),
    );
    expect(loud.volume).toBeGreaterThan(0.9);
    expect(loud.bands.every((v) => v === 1)).toBe(true);
  });
  it("creates editable bounded bars rings and waves from measured data", () => {
    for (const mode of ["bars", "rings", "wave"] as const) {
      const quiet = audioArtwork(
        { volume: 0, bands: Array(32).fill(0), wave: Array(128).fill(0) },
        mode,
        "#e9b86e",
        1,
      );
      const loud = audioArtwork(
        { volume: 1, bands: Array(32).fill(1), wave: Array(128).fill(1) },
        mode,
        "#e9b86e",
        1,
      );
      expect(validateDocument(loud).layers[0].cells).toHaveLength(64 * 24);
      expect(loud.layers[0].cells).not.toEqual(quiet.layers[0].cells);
    }
  });
  it("rejects unbounded or invalid controls", () => {
    const f = { volume: 1, bands: [1], wave: [1] };
    expect(() => audioArtwork(f, "bars", "red", 1)).toThrow();
    expect(() => audioArtwork(f, "bars", "#ffffff", NaN)).toThrow();
  });
  it("releases playback, nodes, streams and URLs", () => {
    const pause = vi.fn(),
      stop = vi.fn(),
      disconnect = vi.fn(),
      close = vi.fn().mockResolvedValue(undefined),
      revoke = vi.fn();
    releaseAudio(
      {
        element: {
          pause,
          removeAttribute: vi.fn(),
          load: vi.fn(),
        } as unknown as HTMLAudioElement,
        nodes: [{ disconnect } as unknown as AudioNode],
        context: { close } as unknown as AudioContext,
        stream: { getTracks: () => [{ stop }] } as unknown as MediaStream,
        url: "blob:test",
      },
      revoke,
    );
    expect(pause).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });
});
