import { useEffect, useId, useState } from "react";
import type { StillExportOptions, StudioSnapshot } from "./controller";
import type { StudioRuntime } from "./runtime";
/** Content only: StudioDialog remains the single focus/scroll owner. */
export function ExportDialogContent({
  runtime,
  snapshot: s,
}: {
  runtime: StudioRuntime;
  snapshot: StudioSnapshot;
}) {
  const [format, setFormat] = useState<StillExportOptions["format"]>("png");
  const [scale, setScale] = useState<StillExportOptions["scale"]>(1);
  const id = useId(),
    c = runtime.controller;
  useEffect(() => () => c.cancelExport(), [c]);
  const scales = ([1, 2, 3, 4] as const).map((value) => ({
    value,
    ...runtime.exportAvailability({ format, scale: value }),
  }));
  const selected = scales.find((v) => v.value === scale)!;
  const error = s.error?.stage === "export" ? s.error.message : null;
  const status = s.exportBusy
    ? s.exportStatus !== "exporting"
      ? "Canceling… finishing active image operation."
      : s.exportStage === "encoding"
        ? "Encoding image…"
        : s.exportStage === "downloading"
          ? "Starting download…"
          : "Rendering full image…"
    : s.exportStatus === "complete"
      ? "Download started."
      : "";
  return (
    <div className="studio-export-form">
      <label htmlFor={`${id}-format`}>Format</label>
      <select
        id={`${id}-format`}
        value={format}
        disabled={s.exportBusy}
        onChange={(e) =>
          setFormat(e.target.value as StillExportOptions["format"])
        }
      >
        <option value="png">PNG</option>
        <option value="jpeg">JPEG</option>
      </select>
      <label htmlFor={`${id}-scale`}>Scale</label>
      <select
        id={`${id}-scale`}
        value={scale}
        disabled={s.exportBusy}
        aria-describedby={`${id}-details`}
        onChange={(e) =>
          setScale(Number(e.target.value) as StillExportOptions["scale"])
        }
      >
        {scales.map((v) => (
          <option key={v.value} value={v.value} disabled={!v.available}>
            {v.value}×
            {v.available ? ` · ${v.width} × ${v.height}` : ` · ${v.reason}`}
          </option>
        ))}
      </select>
      <p id={`${id}-details`} className="studio-note">
        {!s.exportBusy &&
          (selected.available
            ? `${selected.width} × ${selected.height} pixels · full image. `
            : `${selected.reason}. `)}
        {format === "png"
          ? "PNG preserves image alpha."
          : "JPEG uses a black matte behind transparent pixels."}
      </p>
      <p className="studio-note">
        Animated formats (GIF, WebM, MP4) are unavailable.
      </p>
      <p role="status" aria-live="polite">
        {status}
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        className="studio-export-submit"
        disabled={s.exportBusy || !selected.available}
        onClick={() => void c.exportStill({ format, scale })}
      >
        {error ? "Retry export" : `Export ${format.toUpperCase()}`}
      </button>
      {s.exportBusy && s.exportStatus === "exporting" && (
        <button onClick={() => c.cancelExport()}>Cancel export</button>
      )}
    </div>
  );
}
