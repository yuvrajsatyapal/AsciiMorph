"use client";
import type { MotionExportOptions } from "@/creative/recording";
export function ExportSettings({
  value,
  onChange,
  disabled = false,
}: {
  value: MotionExportOptions;
  onChange: (options: MotionExportOptions) => void;
  disabled?: boolean;
}) {
  return (
    <details className="motion-export-settings">
      <summary>Export settings</summary>
      <label>
        Longest side
        <select
          aria-label="Export resolution"
          disabled={disabled}
          value={value.maxDimension ?? 640}
          onChange={(e) =>
            onChange({ ...value, maxDimension: Number(e.target.value) })
          }
        >
          {[320, 640, 960, 1280, 1920, 2048].map((n) => (
            <option key={n} value={n}>
              {n} px
            </option>
          ))}
        </select>
      </label>
      <label>
        Frame rate
        <select
          aria-label="Export frame rate"
          disabled={disabled}
          value={value.fps ?? 30}
          onChange={(e) => onChange({ ...value, fps: Number(e.target.value) })}
        >
          {[10, 12, 15, 24, 25, 30, 50, 60].map((n) => (
            <option key={n} value={n}>
              {n} fps
            </option>
          ))}
        </select>
      </label>
      <label>
        Quality
        <input
          aria-label="Export quality"
          disabled={disabled}
          type="range"
          min="1"
          max="100"
          value={value.quality ?? 100}
          onChange={(e) =>
            onChange({ ...value, quality: Number(e.target.value) })
          }
        />
        <output>{value.quality ?? 100}%</output>
      </label>
      <label>
        <input
          type="checkbox"
          disabled={disabled}
          checked={value.loop !== false}
          onChange={(e) => onChange({ ...value, loop: e.target.checked })}
        />
        Loop GIF
      </label>
      <label>
        Maximum file size (MB)
        <input
          aria-label="Export file-size budget"
          disabled={disabled}
          type="number"
          min="1"
          max="200"
          value={(value.maxBytes ?? 80_000_000) / 1_000_000}
          onChange={(e) =>
            onChange({ ...value, maxBytes: Number(e.target.value) * 1_000_000 })
          }
        />
      </label>
      <p className="muted">
        GIF uses 10 ms timing, at most 50 fps, and no audio. Resolution fits
        within the source size and pixel budget. Silent WebM uses exact
        timestamps when WebCodecs is available. MP4, audio, and older browsers
        record in real time; keep this tab visible. File-size limits reject
        oversized results.
      </p>
    </details>
  );
}
