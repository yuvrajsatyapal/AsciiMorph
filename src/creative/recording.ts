import { encodeWebM, videoTimeline } from "./recording-webm";
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
export { encodeGif as gifBytes } from "./gif-encode";
import { encodeGif as gifBytes } from "./gif-encode";
export interface MotionExportOptions {
  audioOffset?: number;
  maxDimension?: number;
  fps?: number;
  quality?: number;
  loop?: boolean;
  maxBytes?: number;
}
export function resolveMotionOptions(options: MotionExportOptions = {}) {
  const result = {
    maxDimension: 640,
    fps: 30,
    quality: 100,
    loop: true,
    maxBytes: 80_000_000,
    ...options,
  };
  if (
    !Number.isInteger(result.maxDimension) ||
    result.maxDimension < 64 ||
    result.maxDimension > 2048
  )
    throw new Error("Export resolution must be 64–2048 pixels.");
  if (!Number.isFinite(result.fps) || result.fps < 1 || result.fps > 60)
    throw new Error("Export frame rate must be 1–60 fps.");
  if (
    !Number.isFinite(result.quality) ||
    result.quality < 1 ||
    result.quality > 100
  )
    throw new Error("Export quality must be 1–100.");
  if (
    !Number.isFinite(result.maxBytes) ||
    result.maxBytes < 1 ||
    result.maxBytes > 200_000_000
  )
    throw new Error("File-size budget must be 1–200,000,000 bytes.");
  if (
    result.audioOffset !== undefined &&
    (!Number.isFinite(result.audioOffset) ||
      result.audioOffset < 0 ||
      result.audioOffset > 86400)
  )
    throw new Error("Invalid soundtrack start time.");
  return result;
}
/** Sample at an upper frame rate while keeping total time and coalescing unchanged holds. */
export function sampleMotionFrames(
  frames: MotionFrame[],
  fps: number,
): MotionFrame[] {
  const total = frames.reduce((sum, f) => sum + f.duration, 0);
  const timeline = videoTimeline(
    frames.map((f) => f.duration),
    Math.min(fps, 50, 120_000 / total),
  );
  const result: MotionFrame[] = [];
  let previous = -1;
  for (const sample of timeline) {
    const duration = sample.duration / 1000;
    if (
      previous === sample.frame &&
      result.at(-1)!.duration + duration <= 10000
    )
      result.at(-1)!.duration += duration;
    else result.push({ doc: frames[sample.frame].doc, duration });
    previous = sample.frame;
  }
  // GIF's minimum 20ms means a final fractional sample joins the preceding hold.
  if (result.length > 1 && result.at(-1)!.duration < 20) {
    const last = result.pop()!;
    result.at(-1)!.duration += last.duration;
  }
  return result;
}
async function encodeGifOffThread(
  frames: { rgba: Uint8ClampedArray; delay: number }[],
  width: number,
  height: number,
  settings: ReturnType<typeof resolveMotionOptions>,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (typeof Worker === "undefined")
    return gifBytes(frames, width, height, settings);
  aborted(signal);
  const worker = new Worker(new URL("./gif-worker.ts", import.meta.url));
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener("abort", cancel);
    };
    const cancel = () => {
      cleanup();
      reject(new DOMException("Export cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (
      event: MessageEvent<{ data?: Uint8Array; error?: string }>,
    ) => {
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.data) resolve(event.data.data);
      else reject(new Error("GIF encoder returned no data."));
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("GIF worker failed. Try reloading before exporting."));
    };
    worker.postMessage(
      { frames, width, height, options: settings },
      frames.map((f) => f.rgba.buffer),
    );
  });
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
  bitsPerSecond?: number,
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
    const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        ...(bitsPerSecond ? { videoBitsPerSecond: bitsPerSecond } : {}),
      }),
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
  options: MotionExportOptions = {},
): Promise<Blob> {
  const settings = resolveMotionOptions(options);
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
  const gifFrames =
    format === "gif" ? sampleMotionFrames(frames, settings.fps) : frames;
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
      settings.maxDimension / (first.width * first.cellWidth),
      settings.maxDimension / (first.height * first.cellHeight),
      format === "gif"
        ? Math.sqrt(
            24_000_000 /
              (gifFrames.length *
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
    for (const f of gifFrames) {
      aborted(signal);
      draw(f.doc);
      decoded.push({
        rgba: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        delay: f.duration,
      });
      await new Promise((r) => setTimeout(r, 0));
    }
    aborted(signal);
    const data = await encodeGifOffThread(
      decoded,
      canvas.width,
      canvas.height,
      settings,
      signal,
    );
    return new Blob([data as Uint8Array<ArrayBuffer>], { type: "image/gif" });
  }
  if (format === "webm" && !audioFile) {
    const encoded = await encodeWebM(
      canvas,
      frames.map((f) => f.duration),
      (index) => draw(frames[index].doc),
      settings,
      signal,
    );
    if (encoded) return encoded;
  }
  recordingMime(format);
  if (!canvas.captureStream) throw new Error("Canvas recording unavailable");
  draw(first);
  const stream = canvas.captureStream(settings.fps);
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
      if (settings.audioOffset) {
        await waitForMedia(
          new Promise<void>((resolve, reject) => {
            if (audio!.readyState >= 1) {
              resolve();
              return;
            }
            audio!.onloadedmetadata = () => resolve();
            audio!.onerror = () =>
              reject(new Error("Source audio could not be decoded."));
          }),
          signal,
        );
        audio.currentTime = settings.audioOffset;
        await waitForMedia(
          new Promise<void>((resolve, reject) => {
            if (!audio!.seeking) {
              resolve();
              return;
            }
            audio!.onseeked = () => resolve();
            audio!.onerror = () =>
              reject(
                new Error("Source audio could not seek to the trim start."),
              );
          }),
          signal,
        );
      }
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
    const blob = await recordStream(
      stream,
      format,
      total,
      signal,
      Math.round(200_000 + (settings.quality / 100) * 7_800_000),
    );
    if (blob.size > settings.maxBytes)
      throw new Error(
        "Video exceeds the file-size budget. Reduce resolution or quality.",
      );
    return blob;
  } finally {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    audio?.pause();
    if (context) void context.close();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }
}
