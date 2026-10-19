import { convert, type Pixels } from "./engine";
import type { AsciiDocument } from "@/core/document";
import type { ConversionSettings } from "./settings";
import type { Calibration } from "./presets";
export function runConversion(
  pixels: Pixels,
  settings: ConversionSettings,
  signal: AbortSignal,
  calibration?: Calibration,
): Promise<AsciiDocument> {
  if (signal.aborted)
    return Promise.reject(
      new DOMException("Conversion cancelled", "AbortError"),
    );
  let worker: Worker;
  try {
    if (typeof Worker === "undefined") throw new Error("Worker unavailable");
    worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return convert(
      pixels,
      settings,
      signal,
      () => new Promise((resolve) => setTimeout(resolve, 0)),
      calibration,
    );
  }
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error?: Error, doc?: AsciiDocument) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", cancel);
      worker.terminate();
      if (error) reject(error);
      else if (doc) resolve(doc);
      else reject(new Error("Invalid worker result"));
    };
    const cancel = () =>
      finish(new DOMException("Conversion cancelled", "AbortError"));
    signal.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (
      e: MessageEvent<{ doc?: AsciiDocument; error?: string }>,
    ) => finish(e.data.error ? new Error(e.data.error) : undefined, e.data.doc);
    worker.onerror = (e) => {
      e.preventDefault();
      finish(new Error(e.message || "Conversion worker failed."));
    };
    worker.onmessageerror = () =>
      finish(new Error("Could not read conversion result."));
    const data = pixels.data.slice();
    try {
      worker.postMessage(
        { pixels: { ...pixels, data }, settings, calibration },
        [data.buffer],
      );
    } catch (error) {
      finish(
        error instanceof Error
          ? error
          : new Error("Could not start conversion"),
      );
    }
  });
}
