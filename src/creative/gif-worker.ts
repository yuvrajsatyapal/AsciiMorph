import { encodeGif, type GifOptions } from "./gif-encode";
self.onmessage = (
  event: MessageEvent<{
    frames: { rgba: Uint8ClampedArray; delay: number }[];
    width: number;
    height: number;
    options: GifOptions;
  }>,
) => {
  try {
    const { frames, width, height, options } = event.data,
      data = encodeGif(frames, width, height, options);
    self.postMessage({ data }, { transfer: [data.buffer] });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
