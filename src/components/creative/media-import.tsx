"use client";
import { useState, useRef, useEffect } from "react";
import "./creative.css";
import { importMedia } from "@/creative/media";
import type { MotionFrame } from "@/creative/recording";
export function MediaImport({
  onFrames,
}: {
  onFrames: (frames: MotionFrame[]) => void | Promise<void>;
}) {
  const [fps, setFps] = useState(8),
    [seconds, setSeconds] = useState(4),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function load(file: File) {
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      const frames = await importMedia(
        file,
        fps,
        seconds,
        controller.signal,
        setProgress,
      );
      if (!controller.signal.aborted) await onFrames(frames);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (abort.current === controller) setBusy(false);
    }
  }
  return (
    <section className="media-import">
      <h2>Import video or GIF</h2>
      <p>
        Local processing · up to 40 MiB, 12 seconds, 120 frames. Video uses the
        sample rate; GIFs retain their original frame delays. GIF decoding is
        limited to 24 megapixels across all source frames. Original audio stays
        in the source file.
      </p>
      <div className="creative-actions">
        <label>
          Sample rate
          <input
            type="number"
            min={1}
            max={20}
            value={fps}
            disabled={busy}
            onChange={(e) => setFps(+e.target.value)}
          />
        </label>
        <label>
          Seconds
          <input
            type="number"
            min={0.1}
            max={12}
            step={0.1}
            value={seconds}
            disabled={busy}
            onChange={(e) => setSeconds(+e.target.value)}
          />
        </label>
        <label>
          Choose video or GIF
          <input
            aria-label="Choose video or GIF"
            type="file"
            accept="video/*,image/gif"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void load(f);
              e.target.value = "";
            }}
          />
        </label>
        {busy && (
          <button onClick={() => abort.current?.abort()}>Cancel import</button>
        )}
      </div>
      {busy && (
        <progress aria-label="Media import progress" value={progress} max={1} />
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
