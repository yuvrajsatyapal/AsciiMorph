"use client";
import { useState, useRef, useEffect } from "react";
import "./creative.css";
import { exportAnimation } from "@/creative/recording";
import { downloadBlob } from "@/core/exports";
import { usePersistentState } from "@/workspace/preferences";
import { importMedia } from "@/creative/media";
import type { MotionFrame } from "@/creative/recording";
export function MediaImport({
  onFrames,
}: {
  onFrames: (frames: MotionFrame[]) => void | Promise<void>;
}) {
  const [fps, setFps] = usePersistentState("media.fps", 8),
    [seconds, setSeconds] = usePersistentState("media.seconds", 4),
    [start, setStart] = usePersistentState("media.start", 0),
    [width, setWidth] = usePersistentState("media.width", 80),
    [height, setHeight] = usePersistentState("media.height", 40),
    [mode, setMode] = usePersistentState<"color" | "grayscale" | "monochrome">(
      "media.mode",
      "color",
    ),
    [charset, setCharset] = usePersistentState("media.charset", "classic"),
    [source, setSource] = useState<File | null>(null),
    [sourceUrl, setSourceUrl] = useState(""),
    [frames, setFrames] = useState<MotionFrame[]>([]),
    [convertedStart, setConvertedStart] = useState(0),
    [includeAudio, setIncludeAudio] = useState(true),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!source) return;
    const url = URL.createObjectURL(source);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);
  async function exportWithAudio() {
    if (!source || !frames.length) return;
    const ac = new AbortController();
    abort.current = ac;
    setBusy(true);
    setError("");
    try {
      downloadBlob(
        await exportAnimation(
          frames,
          "webm",
          ac.signal,
          includeAudio ? source : undefined,
          { audioOffset: convertedStart },
        ),
        "converted-video.webm",
      );
    } catch (error) {
      if (!ac.signal.aborted) setError(String(error));
    } finally {
      setBusy(false);
    }
  }
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
        { start, width, height, mode, charset },
      );
      if (!controller.signal.aborted) {
        setFrames(frames);
        setConvertedStart(start);
        await onFrames(frames);
      }
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
        Local processing · up to 40 MiB, 60 seconds, 120 frames. Video uses the
        sample rate; GIFs retain their original frame delays. GIF decoding is
        limited to 24 megapixels across all source frames. Use a lower sample
        rate for longer clips. The source audio can be included in WebM export;
        GIF and saved frame projects contain no audio.
      </p>
      <div className="creative-actions">
        <label>
          Trim start (seconds)
          <input
            type="number"
            min={0}
            step={0.1}
            value={start}
            disabled={busy}
            onChange={(e) => setStart(Math.max(0, +e.target.value))}
          />
        </label>
        <label>
          Output columns
          <input
            type="number"
            min={1}
            max={200}
            value={width}
            disabled={busy}
            onChange={(e) =>
              setWidth(Math.max(1, Math.min(200, +e.target.value)))
            }
          />
        </label>
        <label>
          Output rows
          <input
            type="number"
            min={1}
            max={100}
            value={height}
            disabled={busy}
            onChange={(e) =>
              setHeight(Math.max(1, Math.min(100, +e.target.value)))
            }
          />
        </label>
        <label>
          Color preset
          <select
            value={mode}
            disabled={busy}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="color">Source colors</option>
            <option value="grayscale">Grayscale</option>
            <option value="monochrome">Single ink</option>
          </select>
        </label>
        <label>
          Character preset
          <select
            value={charset}
            disabled={busy}
            onChange={(e) => setCharset(e.target.value)}
          >
            {["classic", "detailed", "blocks", "minimal"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
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
            max={60}
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
              if (f) {
                setSource(f);
                setFrames([]);
                void load(f);
              }
              e.target.value = "";
            }}
          />
        </label>
        {busy && (
          <button onClick={() => abort.current?.abort()}>Cancel import</button>
        )}
      </div>
      {source && (
        <>
          {source.type.startsWith("video/") && sourceUrl && (
            <video
              controls
              playsInline
              preload="metadata"
              src={sourceUrl}
              aria-label="Source video preview"
              style={{ maxWidth: "100%", maxHeight: 260 }}
            />
          )}
          <button disabled={busy} onClick={() => void load(source)}>
            Reconvert selected clip
          </button>
          {source.type.startsWith("video/") && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={includeAudio}
                  onChange={(e) => setIncludeAudio(e.target.checked)}
                />
                Retain original audio in WebM
              </label>
              <button
                disabled={busy || !frames.length}
                onClick={() => void exportWithAudio()}
              >
                Export converted video
              </button>
              <p>
                Audio export records in real time. Keep this tab active; browser
                codecs determine support. Saved animation frames do not embed
                source audio.
              </p>
            </>
          )}
        </>
      )}
      {busy && (
        <progress aria-label="Media import progress" value={progress} max={1} />
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
