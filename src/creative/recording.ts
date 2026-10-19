import type { AsciiDocument } from "@/core/document";
import { ensureArtworkFont, paint } from "@/core/render";
export interface MotionFrame {
  doc: AsciiDocument;
  duration: number;
}
export type MotionFormat = "gif" | "webm" | "mp4";
export function recordingMime(
  format: "webm" | "mp4",
  supports: (mime: string) => boolean = (type) =>
    typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type),
  hasAudio = false,
) {
  const types =
    format === "mp4"
      ? hasAudio
        ? ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4"]
        : ["video/mp4;codecs=avc1.42E01E", "video/mp4"]
      : hasAudio
        ? [
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp8,opus",
            "video/webm",
          ]
        : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const mime = types.find(supports);
  if (!mime)
    throw new Error(
      `${format.toUpperCase()} recording is unsupported in this browser.`,
    );
  return mime;
}
function aborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
}
export function gifBytes(
  frames: { rgba: Uint8ClampedArray; delay: number }[],
  width: number,
  height: number,
): Uint8Array {
  if (
    !frames.length ||
    frames.length > 120 ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 2048 ||
    height > 2048 ||
    width * height * frames.length > 40_000_000
  )
    throw new Error("GIF exceeds resource limits");
  // Literal LZW uses at most 1.15 bytes per pixel, including clear codes and blocks.
  const out = new Uint8Array(
    Math.ceil(width * height * frames.length * 1.15) +
      frames.length * 1024 +
      1024,
  );
  let offset = 0;
  const byte = (...v: number[]) => {
      for (const n of v) out[offset++] = n & 255;
    },
    word = (v: number) => byte(v, v >>> 8),
    str = (s: string) => byte(...Array.from(s, (c) => c.charCodeAt(0)));
  str("GIF89a");
  word(width);
  word(height);
  byte(0xf7, 0, 0);
  for (let i = 0; i < 256; i++)
    byte(
      Math.round((((i >> 5) & 7) * 255) / 7),
      Math.round((((i >> 2) & 7) * 255) / 7),
      Math.round(((i & 3) * 255) / 3),
    );
  byte(0x21, 0xff, 11);
  str("NETSCAPE2.0");
  byte(3, 1, 0, 0, 0);
  for (const frame of frames) {
    if (
      frame.rgba.length !== width * height * 4 ||
      !Number.isFinite(frame.delay) ||
      frame.delay < 20 ||
      frame.delay > 10000
    )
      throw new Error("Invalid GIF frame");
    byte(0x21, 0xf9, 4, 4);
    word(Math.round(frame.delay / 10));
    byte(0, 0, 0x2c);
    word(0);
    word(0);
    word(width);
    word(height);
    byte(0, 8);
    const codes = new Uint8Array(Math.ceil(width * height * 1.14) + 32);
    let codeOffset = 0;
    let bits = 0,
      count = 0;
    const emit = (code: number) => {
      bits |= code << count;
      count += 9;
      while (count >= 8) {
        codes[codeOffset++] = bits & 255;
        bits >>>= 8;
        count -= 8;
      }
    };
    emit(256);
    let n = 0;
    for (let i = 0; i < frame.rgba.length; i += 4) {
      if (n === 200) {
        emit(256);
        n = 0;
      }
      const a = frame.rgba[i + 3] / 255,
        r = Math.round(((frame.rgba[i] * a) / 255) * 7),
        g = Math.round(((frame.rgba[i + 1] * a) / 255) * 7),
        b = Math.round(((frame.rgba[i + 2] * a) / 255) * 3);
      emit((r << 5) | (g << 2) | b);
      n++;
    }
    emit(257);
    if (count) codes[codeOffset++] = bits & 255;
    for (let p = 0; p < codeOffset; p += 255) {
      const block = codes.subarray(p, Math.min(codeOffset, p + 255));
      byte(block.length, ...block);
    }
    byte(0);
  }
  byte(0x3b);
  return out.slice(0, offset);
}
export function waitForMedia<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
  timeout = 10000,
): Promise<T> {
  aborted(signal);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    };
    const cancel = () => {
      cleanup();
      reject(new DOMException("Export cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Audio playback timed out. Try another audio file."));
    }, timeout);
    signal?.addEventListener("abort", cancel, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}
export function recordStream(
  stream: MediaStream,
  format: "webm" | "mp4",
  duration: number,
  signal?: AbortSignal,
): Promise<Blob> {
  aborted(signal);
  const mime = recordingMime(
    format,
    undefined,
    stream.getAudioTracks().length > 0,
  );
  if (!Number.isFinite(duration) || duration < 20 || duration > 120000)
    throw new Error("Recording duration must be 20 ms–120 seconds");
  return new Promise((resolve, reject) => {
    const recorder = new MediaRecorder(stream, { mimeType: mime }),
      chunks: BlobPart[] = [];
    let failed = false;
    const timer = setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, duration);
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    };
    const cancel = () => {
      failed = true;
      if (recorder.state !== "inactive") recorder.stop();
      cleanup();
      reject(new DOMException("Recording cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", cancel, { once: true });
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onerror = () => {
      failed = true;
      cleanup();
      reject(new Error("Browser encoder failed"));
    };
    recorder.onstop = () => {
      cleanup();
      if (!failed) {
        const blob = new Blob(chunks, { type: recorder.mimeType });
        if (!blob.size) reject(new Error("Recording produced no frames"));
        else resolve(blob);
      }
    };
    try {
      recorder.start(200);
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}
export async function exportAnimation(
  frames: MotionFrame[],
  format: MotionFormat,
  signal?: AbortSignal,
  audioFile?: File,
): Promise<Blob> {
  if (
    !frames.length ||
    frames.length > 120 ||
    frames.reduce((sum, f) => sum + f.duration, 0) > 120000 ||
    frames.reduce(
      (sum, f) => sum + f.doc.width * f.doc.height * f.doc.layers.length,
      0,
    ) > 1_000_000
  )
    throw new Error("Animation exceeds resource limits");
  const first = frames[0].doc;
  if (
    frames.some(
      (f) =>
        f.doc.width !== first.width ||
        f.doc.height !== first.height ||
        f.doc.cellWidth !== first.cellWidth ||
        f.doc.cellHeight !== first.cellHeight ||
        !Number.isFinite(f.duration) ||
        f.duration < 20 ||
        f.duration > 10000,
    )
  )
    throw new Error(
      "Animation frames must have matching geometry and valid timing",
    );
  aborted(signal);
  for (const size of new Set(frames.map((f) => f.doc.fontSize))) {
    aborted(signal);
    await ensureArtworkFont(size);
  }
  const source = document.createElement("canvas"),
    canvas = document.createElement("canvas"),
    scale = Math.min(
      1,
      640 / (first.width * first.cellWidth),
      640 / (first.height * first.cellHeight),
      format === "gif"
        ? Math.sqrt(
            24_000_000 /
              (frames.length *
                first.width *
                first.cellWidth *
                first.height *
                first.cellHeight),
          )
        : 1,
    );
  canvas.width = Math.max(1, Math.round(first.width * first.cellWidth * scale));
  canvas.height = Math.max(
    1,
    Math.round(first.height * first.cellHeight * scale),
  );
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const draw = (doc: AsciiDocument) => {
    paint(source, doc, { pixelRatio: 1 });
    ctx.fillStyle = "#0c0d10";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  };
  if (format === "gif") {
    if (audioFile)
      throw new Error("GIF cannot contain audio. Choose WebM or MP4.");
    const decoded = [];
    for (const f of frames) {
      aborted(signal);
      draw(f.doc);
      decoded.push({
        rgba: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        delay: f.duration,
      });
      await new Promise((r) => setTimeout(r, 0));
    }
    aborted(signal);
    const data = gifBytes(decoded, canvas.width, canvas.height);
    return new Blob([data as Uint8Array<ArrayBuffer>], { type: "image/gif" });
  }
  recordingMime(format);
  if (!canvas.captureStream) throw new Error("Canvas recording unavailable");
  draw(first);
  const stream = canvas.captureStream(30);
  let audio: HTMLAudioElement | undefined,
    context: AudioContext | undefined,
    audioUrl: string | undefined;
  try {
    if (audioFile) {
      if (audioFile.size > 40 * 1024 * 1024)
        throw new Error("Soundtrack exceeds 40 MiB");
      audioUrl = URL.createObjectURL(audioFile);
      audio = new Audio(audioUrl);
      context = new AudioContext();
      const source = context.createMediaElementSource(audio),
        destination = context.createMediaStreamDestination();
      source.connect(destination);
      for (const track of destination.stream.getAudioTracks())
        stream.addTrack(track);
      await waitForMedia(context.resume(), signal);
      await waitForMedia(audio.play(), signal);
    }
  } catch (error) {
    stream.getTracks().forEach((t) => t.stop());
    audio?.pause();
    if (context) void context.close();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    throw error;
  }
  const total = frames.reduce((sum, f) => sum + f.duration, 0);
  let raf = 0;
  const start = performance.now();
  const animate = () => {
    const elapsed = performance.now() - start;
    let t = 0,
      index = 0;
    while (index < frames.length - 1 && t + frames[index].duration <= elapsed)
      t += frames[index++].duration;
    draw(frames[index].doc);
    raf = requestAnimationFrame(animate);
  };
  raf = requestAnimationFrame(animate);
  try {
    return await recordStream(stream, format, total, signal);
  } finally {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    audio?.pause();
    if (context) void context.close();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }
}
