"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_MEMORY_BUDGET_BYTES } from "@/render/character-contract";
import type { StudioSnapshot } from "./controller";
import type { StudioRuntime } from "./runtime";

type Pixels = {
  width: number;
  height: number;
  rgba: Uint8Array | Uint8ClampedArray;
};
/** Full Rust output, including margins and null-grid frames. No display-canvas
 * readback is used. ImageData shares the owned RGBA backing through a view. */
export function paintStudioFrame(
  canvas: HTMLCanvasElement,
  frame: Pixels,
): void {
  const bytes = frame.width * frame.height * 4;
  if (
    !Number.isSafeInteger(frame.width) ||
    !Number.isSafeInteger(frame.height) ||
    frame.width < 1 ||
    frame.height < 1 ||
    !Number.isSafeInteger(bytes) ||
    bytes > DEFAULT_MEMORY_BUDGET_BYTES ||
    frame.rgba.byteLength !== bytes ||
    !(frame.rgba.buffer instanceof ArrayBuffer)
  )
    throw new Error("Invalid or oversized Studio frame");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Studio canvas context unavailable");
  const pixels = new Uint8ClampedArray(
    frame.rgba.buffer,
    frame.rgba.byteOffset,
    frame.rgba.byteLength,
  );
  const image = new ImageData(pixels, frame.width, frame.height);
  canvas.width = frame.width;
  canvas.height = frame.height;
  context.putImageData(image, 0, 0);
}
function reportPaint(reason: unknown) {
  if (typeof globalThis.reportError === "function")
    globalThis.reportError(reason);
  else console.error("Studio canvas paint failed", reason);
}
/** Task4 supplies stage layout and Compare gestures. Both canvases share one
 * fit/zoom transform; zoom never changes numerical request geometry. */
export function StudioViewport({
  runtime,
  snapshot,
  className,
  onPaintError = reportPaint,
}: {
  runtime: StudioRuntime;
  snapshot: StudioSnapshot;
  className?: string;
  onPaintError?: (reason: unknown) => void;
}) {
  const output = useRef<HTMLCanvasElement>(null),
    source = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const a = output.current!,
      b = source.current!;
    const releaseA = runtime.retainCanvas(a),
      releaseB = runtime.retainCanvas(b);
    return () => {
      a.width = a.height = b.width = b.height = 0;
      releaseA();
      releaseB();
    };
  }, [runtime]);
  useEffect(() => {
    try {
      const frame = runtime.getFrame();
      if (frame && frame.identity === runtime.getFrame()?.identity)
        paintStudioFrame(output.current!, frame.frame);
      else output.current!.width = output.current!.height = 0;
      const original = runtime.getOriginal();
      if (original) paintStudioFrame(source.current!, original);
      else source.current!.width = source.current!.height = 0;
    } catch (reason) {
      onPaintError(reason);
    }
  }, [runtime, snapshot.frame, snapshot.project.source, onPaintError]);
  const style = {
    position: "absolute" as const,
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain" as const,
  };
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${snapshot.view.zoom})`,
          transformOrigin: "center",
        }}
      >
        <canvas
          ref={output}
          aria-label="Rendered Characters preview"
          style={{
            ...style,
            visibility: snapshot.view.compare ? "hidden" : "visible",
          }}
        />
        <canvas
          ref={source}
          aria-label="Original source comparison"
          aria-hidden={!snapshot.view.compare}
          style={{
            ...style,
            visibility: snapshot.view.compare ? "visible" : "hidden",
          }}
        />
      </div>
    </div>
  );
}
