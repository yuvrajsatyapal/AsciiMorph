"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { openAnimation } from "@/animation/handoff";
import {
  exportAnimation,
  type MotionFrame,
  type MotionFormat,
} from "@/creative/recording";
import { downloadBlob } from "@/core/exports";
export function MotionActions({
  build,
}: {
  build: (signal: AbortSignal) => MotionFrame[] | Promise<MotionFrame[]>;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [format, setFormat] = useState<MotionFormat>("gif"),
    abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function run(edit: boolean) {
    setBusy(edit ? "Preparing frames…" : "Exporting animation…");
    setError("");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const frames = await build(controller.signal);
      if (controller.signal.aborted) return;
      if (edit) {
        await openAnimation(frames);
        router.push("/animate");
      } else
        downloadBlob(
          await exportAnimation(frames, format, controller.signal),
          `animation.${format}`,
        );
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="creative-actions">
      <button disabled={!!busy} onClick={() => void run(true)}>
        Edit animation
      </button>
      <label>
        Motion format
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as MotionFormat)}
        >
          {["gif", "webm", "mp4"].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <button disabled={!!busy} onClick={() => void run(false)}>
        Export animation
      </button>
      {busy && (
        <>
          <span role="status">{busy}</span>
          <button onClick={() => abort.current?.abort()}>Cancel</button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
