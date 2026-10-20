/** Minimal single-track WebM muxer for WebCodecs VP8 chunks. All times are explicit. */
const join = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const uint = (v: number) => {
  const bytes: number[] = [];
  do {
    bytes.unshift(v % 256);
    v = Math.floor(v / 256);
  } while (v);
  return Uint8Array.from(bytes);
};
const size = (v: number) => {
  let n = 1;
  while (v >= 2 ** (7 * n) - 1) n++;
  const bytes = new Uint8Array(n);
  for (let i = n - 1; i >= 0; i--) {
    bytes[i] = v % 256;
    v = Math.floor(v / 256);
  }
  bytes[0] |= 1 << (8 - n);
  return bytes;
};
const element = (id: number, body: Uint8Array) =>
  join([uint(id), size(body.length), body]);
const integer = (id: number, value: number) => element(id, uint(value));
const string = (id: number, value: string) =>
  element(id, new TextEncoder().encode(value));
const master = (id: number, parts: Uint8Array[]) => element(id, join(parts));
export interface WebMChunk {
  timestamp: number;
  data: Uint8Array;
  key: boolean;
}
export function muxWebM(
  chunks: WebMChunk[],
  width: number,
  height: number,
  durationMs: number,
) {
  const duration = new Uint8Array(8);
  new DataView(duration.buffer).setFloat64(0, durationMs);
  const header = master(0x1a45dfa3, [
    integer(0x4286, 1),
    integer(0x42f7, 1),
    integer(0x42f2, 4),
    integer(0x42f3, 8),
    string(0x4282, "webm"),
    integer(0x4287, 4),
    integer(0x4285, 2),
  ]);
  const info = master(0x1549a966, [
    integer(0x2ad7b1, 1_000_000),
    string(0x4d80, "AsciiMorph"),
    string(0x5741, "AsciiMorph"),
    element(0x4489, duration),
  ]);
  const tracks = master(0x1654ae6b, [
    master(0xae, [
      integer(0xd7, 1),
      integer(0x73c5, 1),
      integer(0x83, 1),
      string(0x86, "V_VP8"),
      master(0xe0, [integer(0xb0, width), integer(0xba, height)]),
    ]),
  ]);
  const clusters = chunks.map((c) =>
    master(0x1f43b675, [
      integer(0xe7, Math.round(c.timestamp / 1000)),
      element(
        0xa3,
        join([Uint8Array.from([0x81, 0, 0, c.key ? 0x80 : 0]), c.data]),
      ),
    ]),
  );
  return join([header, master(0x18538067, [info, tracks, ...clusters])]);
}
export function videoTimeline(durations: number[], fps: number) {
  const end = Math.round(durations.reduce((a, b) => a + b, 0) * 1000),
    step = 1_000_000 / fps,
    samples: { frame: number; timestamp: number; duration: number }[] = [];
  let frame = 0,
    edge = durations[0] * 1000;
  for (let i = 0; Math.round(i * step) < end; i++) {
    const timestamp = Math.round(i * step);
    while (frame < durations.length - 1 && timestamp >= edge)
      edge += durations[++frame] * 1000;
    samples.push({
      frame,
      timestamp,
      duration: Math.min(end, Math.round((i + 1) * step)) - timestamp,
    });
  }
  return samples;
}
export async function encodeWebM(
  canvas: HTMLCanvasElement,
  durations: number[],
  draw: (index: number) => void,
  settings: { fps: number; quality: number; maxBytes: number },
  signal?: AbortSignal,
): Promise<Blob | null> {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined")
    return null;
  const config: VideoEncoderConfig = {
    codec: "vp8",
    width: canvas.width,
    height: canvas.height,
    bitrate: Math.round(200_000 + (settings.quality / 100) * 7_800_000),
    framerate: settings.fps,
  };
  if (!(await VideoEncoder.isConfigSupported(config)).supported) return null;
  const chunks: WebMChunk[] = [];
  let bytes = 0,
    error: Error | undefined;
  const encoder = new VideoEncoder({
    output: (chunk) => {
      bytes += chunk.byteLength;
      if (bytes > settings.maxBytes) {
        error = new Error(
          "Video exceeds the file-size budget. Reduce resolution or quality.",
        );
        return;
      }
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({
        timestamp: chunk.timestamp,
        data,
        key: chunk.type === "key",
      });
    },
    error: (e) => {
      error = e;
    },
  });
  try {
    encoder.configure(config);
    const samples = videoTimeline(durations, settings.fps);
    let lastDrawn = -1;
    for (let i = 0; i < samples.length; i++) {
      if (signal?.aborted)
        throw new DOMException("Export cancelled", "AbortError");
      if (error) throw error;
      const sample = samples[i];
      if (sample.frame !== lastDrawn) {
        draw(sample.frame);
        lastDrawn = sample.frame;
      }
      const frame = new VideoFrame(canvas, {
        timestamp: sample.timestamp,
        duration: sample.duration,
      });
      try {
        encoder.encode(frame, {
          keyFrame: i % Math.ceil(settings.fps * 2) === 0,
        });
      } finally {
        frame.close();
      }
      if (i % 12 === 11) {
        await encoder.flush();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    await encoder.flush();
    if (error) throw error;
    const output = muxWebM(
      chunks,
      canvas.width,
      canvas.height,
      durations.reduce((s, d) => s + d, 0),
    );
    if (output.length > settings.maxBytes)
      throw new Error(
        "Video exceeds the file-size budget. Reduce resolution or quality.",
      );
    return new Blob([output], { type: "video/webm" });
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
}
