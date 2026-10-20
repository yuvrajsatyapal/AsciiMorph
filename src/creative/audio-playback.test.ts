import { expect, it, vi } from "vitest";
import { AudioFilePlayback } from "./audio";

it("routes decoded PCM to the audio graph and preserves position across pause, seek and replay", () => {
  const nodes: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
    buffer: AudioBuffer | null;
  }[] = [];
  const context = {
    currentTime: 0,
    createBufferSource: () => {
      const node = {
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        onended: null,
        buffer: null,
      };
      nodes.push(node);
      return node;
    },
  };
  const buffer = { duration: 2 } as AudioBuffer,
    output = {} as AudioNode,
    ended = vi.fn();
  const playback = new AudioFilePlayback(
    context as unknown as AudioContext,
    buffer,
    output,
    ended,
  );
  playback.play();
  expect(nodes[0].buffer).toBe(buffer);
  expect(nodes[0].connect).toHaveBeenCalledWith(output);
  expect(nodes[0].start).toHaveBeenCalledWith(0, 0);
  context.currentTime = 0.5;
  playback.pause();
  expect(playback.position).toBe(0.5);
  expect(nodes[0].stop).toHaveBeenCalledOnce();
  expect(nodes[0].disconnect).toHaveBeenCalledOnce();
  context.currentTime = 1;
  playback.play();
  expect(nodes[1].start).toHaveBeenCalledWith(0, 0.5);
  playback.seek(1.5);
  expect(nodes[1].stop).toHaveBeenCalledOnce();
  expect(nodes[2].start).toHaveBeenCalledWith(0, 1.5);
  nodes[2].onended!();
  expect(playback.position).toBe(2);
  expect(ended).toHaveBeenCalledOnce();
  playback.play();
  expect(nodes[3].start).toHaveBeenCalledWith(0, 0);
  playback.pause();
  expect(nodes[3].onended).toBeNull();
});

it("ends when seeking to the final timestamp; only an explicit play restarts", () => {
  const source = { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
  const context = { currentTime: 0, createBufferSource: vi.fn(() => source) }, ended = vi.fn();
  const playback = new AudioFilePlayback(context as unknown as AudioContext, { duration: 2 } as AudioBuffer, {} as AudioNode, ended);
  playback.play();
  playback.seek(2);
  expect(playback.position).toBe(2);
  expect(context.createBufferSource).toHaveBeenCalledOnce();
  expect(ended).toHaveBeenCalledOnce();
  playback.play();
  expect(context.createBufferSource).toHaveBeenCalledTimes(2);
  expect(source.start).toHaveBeenLastCalledWith(0, 0);
});

it("rejects a long compressed source before allocating decoded PCM", async () => {
  const { decodeAudioFile } = await import("./audio");
  const read = vi.fn(), decode = vi.fn();
  await expect(decodeAudioFile({ arrayBuffer: read } as unknown as File, { decodeAudioData: decode } as unknown as AudioContext, async () => 7200)).rejects.toThrow("10 minutes");
  expect(read).not.toHaveBeenCalled();
  expect(decode).not.toHaveBeenCalled();
});
