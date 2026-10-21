import { afterEach, expect, it, vi } from "vitest";
import { AudioFilePlayback, decodeAudioFile } from "./audio";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
  playback.seek(2);
  expect(ended).toHaveBeenCalledOnce();
  playback.play();
  expect(nodes[3].start).toHaveBeenCalledWith(0, 0);
  playback.pause();
  expect(nodes[3].onended).toBeNull();
});

it("keeps idle seeks paused and clamps to the playable range", () => {
  const source = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  };
  const context = { currentTime: 0, createBufferSource: vi.fn(() => source) };
  const ended = vi.fn();
  const playback = new AudioFilePlayback(
    context as unknown as AudioContext,
    { duration: 2 } as AudioBuffer,
    {} as AudioNode,
    ended,
  );
  playback.seek(-1);
  expect(playback.position).toBe(0);
  playback.seek(1);
  expect(playback.position).toBe(1);
  playback.seek(20);
  expect(playback.position).toBe(2);
  expect(context.createBufferSource).not.toHaveBeenCalled();
  expect(ended).not.toHaveBeenCalled();
});

it.each([0, -1, NaN, Infinity, 600.1])(
  "rejects invalid metadata duration %s before reading PCM",
  async (duration) => {
    const read = vi.fn(),
      decode = vi.fn();
    await expect(
      decodeAudioFile(
        { arrayBuffer: read } as unknown as File,
        { decodeAudioData: decode } as unknown as AudioContext,
        async () => duration,
      ),
    ).rejects.toThrow("10 minutes");
    expect(read).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
  },
);

it("decodes valid metadata at the duration limit", async () => {
  const bytes = new ArrayBuffer(4);
  const read = vi.fn().mockResolvedValue(bytes);
  const buffer = { duration: 600 } as AudioBuffer;
  const decode = vi.fn().mockResolvedValue(buffer);
  await expect(
    decodeAudioFile(
      { arrayBuffer: read } as unknown as File,
      { decodeAudioData: decode } as unknown as AudioContext,
      async () => 600,
    ),
  ).resolves.toBe(buffer);
  expect(read).toHaveBeenCalledOnce();
  expect(decode).toHaveBeenCalledWith(bytes);
});

it.each([0, NaN, Infinity, 601])(
  "rejects decoded duration %s even when metadata is valid",
  async (duration) => {
    await expect(
      decodeAudioFile(
        { arrayBuffer: async () => new ArrayBuffer(4) } as File,
        {
          decodeAudioData: async () => ({ duration }),
        } as unknown as AudioContext,
        async () => 10,
      ),
    ).rejects.toThrow("10 minutes");
  },
);

it.each(["loadedmetadata", "error"])(
  "releases metadata resources on %s and only decodes supported sources",
  async (event) => {
    const element = document.createElement("audio");
    Object.defineProperty(element, "duration", { value: 30 });
    const pause = vi.spyOn(element, "pause").mockImplementation(() => {});
    vi.spyOn(element, "load").mockImplementation(() => {});
    const removeListener = vi.spyOn(element, "removeEventListener");
    vi.spyOn(document, "createElement").mockReturnValue(element);
    const revokeObjectURL = vi.fn();
    const createObjectURL = vi.fn(() => "blob:metadata");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const read = vi.fn().mockResolvedValue(new ArrayBuffer(4));
    const buffer = { duration: 30 } as AudioBuffer;
    const decode = vi.fn().mockResolvedValue(buffer);
    const file = { arrayBuffer: read } as unknown as File;
    const result = decodeAudioFile(file, {
      decodeAudioData: decode,
    } as unknown as AudioContext);
    const assertion =
      event === "loadedmetadata"
        ? expect(result).resolves.toBe(buffer)
        : expect(result).rejects.toThrow(/unsupported|decode/i);
    element.dispatchEvent(new Event(event));
    await assertion;
    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(pause).toHaveBeenCalledOnce();
    expect(element.hasAttribute("src")).toBe(false);
    expect(removeListener).toHaveBeenCalledWith(
      "loadedmetadata",
      expect.any(Function),
    );
    expect(removeListener).toHaveBeenCalledWith("error", expect.any(Function));
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:metadata");
    if (event === "error") {
      expect(read).not.toHaveBeenCalled();
      expect(decode).not.toHaveBeenCalled();
    }
  },
);

it("ends when seeking to the final timestamp; only an explicit play restarts", () => {
  const source = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  };
  const context = { currentTime: 0, createBufferSource: vi.fn(() => source) },
    ended = vi.fn();
  const playback = new AudioFilePlayback(
    context as unknown as AudioContext,
    { duration: 2 } as AudioBuffer,
    {} as AudioNode,
    ended,
  );
  playback.play();
  playback.seek(2);
  expect(playback.position).toBe(2);
  expect(context.createBufferSource).toHaveBeenCalledOnce();
  expect(ended).toHaveBeenCalledOnce();
  playback.seek(2);
  expect(ended).toHaveBeenCalledOnce();
  playback.play();
  expect(context.createBufferSource).toHaveBeenCalledTimes(2);
  expect(source.start).toHaveBeenLastCalledWith(0, 0);
});

it("rejects a long compressed source before allocating decoded PCM", async () => {
  const { decodeAudioFile } = await import("./audio");
  const read = vi.fn(),
    decode = vi.fn();
  await expect(
    decodeAudioFile(
      { arrayBuffer: read } as unknown as File,
      { decodeAudioData: decode } as unknown as AudioContext,
      async () => 7200,
    ),
  ).rejects.toThrow("10 minutes");
  expect(read).not.toHaveBeenCalled();
  expect(decode).not.toHaveBeenCalled();
});
