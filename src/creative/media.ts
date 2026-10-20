import { decodeGif } from "./gif";
import { runConversion } from "@/converter/runner";
import { DEFAULT_SETTINGS, validateSettings } from "@/converter/settings";
import type { ConversionSettings } from "@/converter/settings";
import type { MotionFrame } from "./recording";

function abort(signal: AbortSignal) {
  if (signal.aborted)
    throw new DOMException("Media import cancelled", "AbortError");
}
function event(
  target: HTMLVideoElement,
  name: string,
  signal: AbortSignal,
  start?: () => void,
) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(name, success);
      target.removeEventListener("error", error);
      signal.removeEventListener("abort", cancel);
      clearTimeout(timer);
    };
    const success = () => {
      cleanup();
      resolve();
    };
    const error = () => {
      cleanup();
      reject(new Error("Browser could not decode this video."));
    };
    const cancel = () => {
      cleanup();
      reject(new DOMException("Media import cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Video decoding timed out."));
    }, 15000);
    target.addEventListener(name, success, { once: true });
    target.addEventListener("error", error, { once: true });
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    else {
      try {
        start?.();
      } catch (failure) {
        cleanup();
        reject(failure);
      }
    }
  });
}
export function videoSampleTimes(
  duration: number,
  fps: number,
  seconds: number,
  start = 0,
) {
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isInteger(fps) ||
    fps < 1 ||
    fps > 20 ||
    !Number.isFinite(seconds) ||
    seconds < 0.1 ||
    seconds > 60 ||
    fps * seconds > 120
  )
    throw new Error("Choose 1–20 fps, up to 60 seconds and 120 frames.");
  if (!Number.isFinite(start) || start < 0 || start >= duration)
    throw new Error("Trim start must be inside the video.");
  const total = Math.round(Math.min(duration - start, seconds) * 1000);
  if (total < 20)
    throw new Error("Video must contain at least 20 milliseconds.");
  const frames: { time: number; duration: number }[] = [];
  for (let i = 0; i < Math.ceil((total * fps) / 1000); i++) {
    const frameStart = Math.round((i * 1000) / fps),
      end = Math.min(total, Math.round(((i + 1) * 1000) / fps));
    const milliseconds = end - frameStart;
    if (milliseconds < 20 && frames.length)
      frames[frames.length - 1].duration += milliseconds;
    else
      frames.push({ time: start + frameStart / 1000, duration: milliseconds });
  }
  return frames;
}

export interface MediaImportOptions {
  start?: number;
  width?: number;
  height?: number;
  mode?: ConversionSettings["mode"];
  charset?: ConversionSettings["charset"];
}
export async function importMedia(
  file: File,
  fps: number,
  seconds: number,
  signal: AbortSignal,
  progress: (fraction: number) => void,
  options: MediaImportOptions = {},
): Promise<MotionFrame[]> {
  if (file.size > 40 * 1024 * 1024)
    throw new Error("Media file exceeds 40 MiB.");
  if (
    !Number.isInteger(fps) ||
    fps < 1 ||
    fps > 20 ||
    !Number.isFinite(seconds) ||
    seconds < 0.1 ||
    seconds > 60 ||
    fps * seconds > 120
  )
    throw new Error("Choose 1–20 fps, up to 60 seconds and 120 frames.");
  if (!Number.isFinite(options.start ?? 0) || (options.start ?? 0) < 0)
    throw new Error("Invalid trim start.");
  validateSettings({
    ...DEFAULT_SETTINGS,
    width: options.width ?? 80,
    height: options.height ?? 40,
    mode: options.mode ?? "color",
    charset: options.charset ?? DEFAULT_SETTINGS.charset,
  });
  abort(signal);
  const result: MotionFrame[] = [];
  const convert = async (
    data: Uint8ClampedArray,
    width: number,
    height: number,
    duration: number,
  ) => {
    abort(signal);
    if (result.length >= 120)
      throw new Error("Media import exceeds 120 frames.");
    const doc = await runConversion(
      { data, width, height },
      {
        ...DEFAULT_SETTINGS,
        width: options.width ?? 80,
        height: options.height ?? 40,
        preserveAspect: false,
        mode: options.mode ?? "color",
        charset: options.charset ?? DEFAULT_SETTINGS.charset,
      },
      signal,
    );
    abort(signal);
    if ((result.length + 1) * doc.width * doc.height > 1_000_000)
      throw new Error(
        "Clip exceeds one million output cells. Reduce dimensions, duration or sample rate.",
      );
    delete doc.conversion;
    result.push({ doc, duration });
  };
  if (file.type === "image/gif" || /\.gif$/i.test(file.name)) {
    const buffer = await file.arrayBuffer();
    abort(signal);
    const gif = decodeGif(buffer);
    const sourceDuration = gif.frames.reduce(
      (sum, frame) => sum + frame.duration,
      0,
    );
    const trimStart = Math.round((options.start ?? 0) * 1000);
    const total = Math.min(
      Math.round(seconds * 1000),
      sourceDuration - trimStart,
    );
    if (total < 20)
      throw new Error(
        "Trim selection must contain at least 20 milliseconds of GIF.",
      );
    let elapsed = 0;
    let leadingDuration = 0;
    if (!Number.isFinite(trimStart) || trimStart < 0)
      throw new Error("Invalid trim start.");
    for (const frame of gif.frames) {
      abort(signal);
      if (elapsed >= trimStart + total) break;
      const frameStart = elapsed;
      elapsed += frame.duration;
      if (elapsed <= trimStart) continue;
      let duration =
        Math.min(elapsed, trimStart + total) -
        Math.max(frameStart, trimStart) +
        leadingDuration;
      // A short leading fragment cannot be a valid project frame on its own.
      // Hold its time for the next source frame instead of dropping it.
      if (duration < 20 && !result.length) {
        leadingDuration = duration;
        continue;
      }
      leadingDuration = 0;
      // A partial final delay below the project minimum extends the prior frame.
      if (duration < 20 && result.length) {
        const previous = result[result.length - 1];
        if (previous.duration + duration <= 10000)
          previous.duration += duration;
        else {
          previous.duration -= 20 - duration;
          if (result.length >= 120)
            throw new Error("Media import exceeds 120 frames.");
          result.push({ doc: previous.doc, duration: 20 });
        }
        break;
      }
      while (duration > 0) {
        const part = Math.min(10000, duration);
        // Keep split delays inside the shared animation project's 20 ms minimum.
        const adjusted =
          duration > 10000 && duration - part < 20 ? part - 20 : part;
        await convert(frame.pixels, gif.width, gif.height, adjusted);
        duration -= adjusted;
        progress(Math.min(1, (elapsed - trimStart) / total));
      }
    }
    abort(signal);
    progress(1);
    return result;
  }
  if (
    !file.type.startsWith("video/") &&
    !/\.(mp4|webm|mov|m4v)$/i.test(file.name)
  )
    throw new Error("Choose a GIF or browser-supported video.");
  const url = URL.createObjectURL(file),
    video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;
  try {
    await event(video, "loadedmetadata", signal, () => {
      video.src = url;
    });
    // Browser-recorded WebM often omits the duration header. A bounded seek
    // lets the native decoder discover the final timestamp before sampling.
    if (video.duration === Infinity) {
      await event(video, "seeked", signal, () => {
        video.currentTime = 1e10;
      });
    }
    if (
      !Number.isFinite(video.duration) ||
      video.duration <= 0 ||
      video.videoWidth < 1 ||
      video.videoHeight < 1 ||
      video.videoWidth > 8192 ||
      video.videoHeight > 8192 ||
      video.videoWidth * video.videoHeight > 24_000_000
    )
      throw new Error("Video dimensions or duration exceed limits.");
    const scale = Math.min(1, 640 / video.videoWidth, 640 / video.videoHeight),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas unavailable.");
    const samples = videoSampleTimes(
      video.duration,
      fps,
      seconds,
      options.start ?? 0,
    );
    for (const [index, sample] of samples.entries()) {
      abort(signal);
      if (Math.abs(video.currentTime - sample.time) > 0.00001)
        await event(video, "seeked", signal, () => {
          video.currentTime = sample.time;
        });
      if (video.readyState < 2) await event(video, "loadeddata", signal);
      abort(signal);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      await convert(
        ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        canvas.width,
        canvas.height,
        sample.duration,
      );
      progress((index + 1) / samples.length);
    }
    return result;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
