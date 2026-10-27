"use client";
import { useState } from "react";
import type { RenderProjectV1 } from "@/render/project";
import type { StudioController, StudioSnapshot } from "./controller";
type Crop = RenderProjectV1["crop"];
export function fitCropRatio(
  width: number,
  height: number,
  ratio: number,
): Crop {
  const w = Math.min(1, (height * ratio) / width);
  const h = Math.min(1, width / ratio / height);
  return { x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h };
}
export function CropDialogContent({
  controller,
  snapshot,
  close,
}: {
  controller: StudioController;
  snapshot: StudioSnapshot;
  close: () => void;
}) {
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(
      Object.entries(snapshot.project.crop).map(([k, v]) => [
        k,
        String(v * 100),
      ]),
    ),
  );
  const [rotation, setRotation] = useState(snapshot.project.rotation);
  const [ratio, setRatio] = useState("free");
  const source = snapshot.project.source;
  const width = source?.width ?? 1,
    height = source?.height ?? 1;
  const crop = Object.fromEntries(
    Object.entries(draft).map(([k, v]) => [
      k,
      v.trim() ? Number(v) / 100 : NaN,
    ]),
  ) as Crop;
  const valid =
    Object.values(crop).every(Number.isFinite) &&
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= 1 &&
    crop.y + crop.height <= 1;
  const setCrop = (value: Crop) =>
    setDraft(
      Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, String(v * 100)]),
      ),
    );
  const croppedWidth = valid
    ? Math.min(width, Math.ceil((crop.x + crop.width) * width)) -
      Math.floor(crop.x * width)
    : 0;
  const croppedHeight = valid
    ? Math.min(height, Math.ceil((crop.y + crop.height) * height)) -
      Math.floor(crop.y * height)
    : 0;
  const swapped = rotation === 90 || rotation === 270;
  return (
    <div className="studio-control-section">
      <p className="studio-note">
        Crop the source before rotation. Changes apply together and can be
        undone.
      </p>
      <label className="studio-control">
        <span>Aspect ratio</span>
        <select
          aria-label="Aspect ratio"
          value={ratio}
          onChange={(e) => {
            const value = e.target.value;
            setRatio(value);
            if (value !== "free") {
              const [a, b] = value.split(":").map(Number);
              setCrop(fitCropRatio(width, height, a / b));
            }
          }}
        >
          {["free", "1:1", "4:5", "3:4", "9:16", "16:9", "4:3", "3:2"].map(
            (v) => (
              <option key={v} value={v}>
                {v === "free" ? "Free" : v === "1:1" ? "Square" : v}
              </option>
            ),
          )}
        </select>
      </label>
      {(["x", "y", "width", "height"] as const).map((key) => (
        <label className="studio-control" key={key}>
          <span>{key[0].toUpperCase() + key.slice(1)} (%)</span>
          <input
            aria-label={`${key[0].toUpperCase() + key.slice(1)} (%)`}
            type="number"
            min={key === "x" || key === "y" ? 0 : 0.001}
            max={100}
            step="any"
            value={draft[key]}
            aria-invalid={!valid}
            onChange={(e) => {
              setRatio("free");
              setDraft({ ...draft, [key]: e.target.value });
            }}
          />
        </label>
      ))}
      {valid && (
        <svg
          role="img"
          aria-label="Crop outline in source coordinates"
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: "100%", maxHeight: 160, background: "#181818" }}
        >
          <rect width={width} height={height} fill="#333" />
          <rect
            x={crop.x * width}
            y={crop.y * height}
            width={crop.width * width}
            height={crop.height * height}
            fill="none"
            stroke="currentColor"
            strokeWidth={Math.max(width, height) / 150}
          />
        </svg>
      )}
      <div role="group" aria-label="Rotation">
        <button
          onClick={() =>
            setRotation(((rotation + 270) % 360) as typeof rotation)
          }
          aria-label="Rotate counterclockwise"
        >
          ↶ 90°
        </button>
        <output aria-live="polite">{rotation}°</output>
        <button
          onClick={() =>
            setRotation(((rotation + 90) % 360) as typeof rotation)
          }
          aria-label="Rotate clockwise"
        >
          90° ↷
        </button>
      </div>
      <p role="status" aria-label="Effective dimensions">
        {valid
          ? `${swapped ? croppedHeight : croppedWidth} × ${swapped ? croppedWidth : croppedHeight} pixels`
          : "Enter a crop inside the source, with positive width and height."}
      </p>
      <button
        onClick={() => {
          setCrop({ x: 0, y: 0, width: 1, height: 1 });
          setRatio("free");
          setRotation(0);
        }}
      >
        Reset
      </button>
      <button onClick={close}>Cancel</button>
      <button
        disabled={!valid}
        onClick={() => {
          controller.setGeometry(crop, rotation);
          close();
        }}
      >
        Apply
      </button>
    </div>
  );
}
