"use client";
import { VISUAL_PRESETS, type ConversionSettings } from "@/converter/settings";
import { PRESETS } from "@/converter/presets";
export function Settings({
  s,
  update,
  busy,
  dimensions,
}: {
  s: ConversionSettings;
  update: (patch: Partial<ConversionSettings>) => void;
  busy: boolean;
  dimensions?: { width: number; height: number };
}) {
  const range = (
    key:
      | "density"
      | "brightness"
      | "contrast"
      | "gamma"
      | "saturation"
      | "sharpness"
      | "edge",
    label: string,
    min: number,
    max: number,
    step = 1,
  ) => (
    <label className="conversion-range" key={key} htmlFor={`conversion-${key}`}>
      <span>
        {label}
        <span className="range-value" aria-hidden="true">
          {s[key]}
        </span>
      </span>
      <input
        id={`conversion-${key}`}
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={s[key]}
        onChange={(e) => update({ [key]: +e.target.value })}
      />
    </label>
  );
  return (
    <fieldset className="conversion-settings" disabled={busy}>
      <legend className="sr-only">Conversion settings</legend>
      <section>
        <h2>Source & style</h2>
        <label>
          Visual preset
          <select
            aria-label="Visual preset"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) update(VISUAL_PRESETS[e.target.value]);
            }}
          >
            <option value="">Choose a starting point</option>
            {Object.keys(VISUAL_PRESETS).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Rotate source
          <select
            aria-label="Rotate source"
            value={s.rotation ?? 0}
            onChange={(e) =>
              update({ rotation: Number(e.target.value) as 0 | 90 | 180 | 270 })
            }
          >
            {[0, 90, 180, 270].map((v) => (
              <option key={v} value={v}>
                {v}° clockwise
              </option>
            ))}
          </select>
        </label>
        <details>
          <summary>Crop source (percent)</summary>
          {(["x", "y", "width", "height"] as const).map((key) => (
            <label key={key}>
              Crop {key}
              <input
                aria-label={`Crop ${key}`}
                type="number"
                min={key === "width" || key === "height" ? 1 : 0}
                max={100}
                value={Math.round(
                  (s.crop?.[key] ??
                    (key === "width" || key === "height" ? 1 : 0)) * 100,
                )}
                onChange={(e) => {
                  const crop = { x: 0, y: 0, width: 1, height: 1, ...s.crop };
                  crop[key] = Math.max(
                    key === "width" || key === "height" ? 0.01 : 0,
                    Math.min(1, Number(e.target.value) / 100),
                  );
                  if (key === "x")
                    crop.width = Math.min(crop.width, 1 - crop.x);
                  if (key === "y")
                    crop.height = Math.min(crop.height, 1 - crop.y);
                  if (key === "width")
                    crop.width = Math.min(crop.width, 1 - crop.x);
                  if (key === "height")
                    crop.height = Math.min(crop.height, 1 - crop.y);
                  crop.x = Math.min(crop.x, 0.99);
                  crop.y = Math.min(crop.y, 0.99);
                  crop.width = Math.max(0.01, crop.width);
                  crop.height = Math.max(0.01, crop.height);
                  update({ crop });
                }}
              />
            </label>
          ))}
          <button
            type="button"
            onClick={() => update({ crop: undefined, rotation: 0 })}
          >
            Reset crop and rotation
          </button>
        </details>
        <p>
          The original decoded image and settings stay attached to exported JSON
          and Studio projects. Revisions create a separate artwork.
        </p>
      </section>
      <section>
        <h2>Grid & proportion</h2>
        <div className="conversion-pair">
          <label>
            Output width
            <input
              type="number"
              aria-label="Output width"
              min={1}
              max={300}
              value={s.width}
              onChange={(e) =>
                update({
                  width: Math.max(1, Math.min(300, +e.target.value || 1)),
                })
              }
            />
          </label>
          <label>
            Output height
            <input
              type="number"
              aria-label="Output height"
              min={1}
              max={300}
              disabled={s.preserveAspect}
              value={
                s.preserveAspect && dimensions ? dimensions.height : s.height
              }
              onChange={(e) =>
                update({
                  height: Math.max(1, Math.min(300, +e.target.value || 1)),
                })
              }
            />
          </label>
        </div>
        <label className="conversion-check">
          <input
            type="checkbox"
            checked={s.preserveAspect}
            onChange={(e) => update({ preserveAspect: e.target.checked })}
          />
          Preserve aspect ratio
        </label>
        <p>
          Aspect lock derives rows from the image and cell proportions. Maximum
          60,000 cells.
        </p>
        <div className="conversion-pair">
          <label>
            Character spacing
            <input
              type="number"
              min={7}
              max={16}
              value={s.cellWidth}
              onChange={(e) =>
                update({
                  cellWidth: Math.max(7, Math.min(16, +e.target.value || 7)),
                })
              }
            />
          </label>
          <label>
            Line height
            <input
              type="number"
              min={14}
              max={28}
              value={s.cellHeight}
              onChange={(e) =>
                update({
                  cellHeight: Math.max(14, Math.min(28, +e.target.value || 14)),
                })
              }
            />
          </label>
        </div>
      </section>
      <section>
        <h2>Character language</h2>
        <label>
          Character set
          <select
            aria-label="Character set"
            value={s.charset}
            onChange={(e) => update({ charset: e.target.value })}
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="custom">Custom characters</option>
          </select>
        </label>
        <label>
          Custom characters
          <input
            disabled={s.charset !== "custom"}
            value={s.custom}
            maxLength={512}
            onChange={(e) => update({ custom: e.target.value })}
          />
        </label>
        <p>
          {s.charset === "braille"
            ? "Eight image samples form each 2 × 4 dot cell. Unicode appearance depends on your system font."
            : "Presets measure glyph coverage in your browser. Custom ramps run from sparse to dense."}
        </p>
        <label className="conversion-check">
          <input
            type="checkbox"
            checked={s.shapeAware ?? false}
            disabled={s.charset === "custom" || s.charset === "braille"}
            onChange={(e) => update({ shapeAware: e.target.checked })}
          />
          Match glyph shape
        </label>
        {range("density", "Character density", 0.25, 3, 0.05)}
      </section>
      <section>
        <h2>Tone & detail</h2>
        {range("brightness", "Brightness", -100, 100)}
        {range("contrast", "Contrast", -100, 100)}
        {range("gamma", "Gamma", 0.1, 3, 0.05)}
        {range("saturation", "Saturation", 0, 200)}
        {range("sharpness", "Sharpness", 0, 100)}
        {range("edge", "Edge detection", 0, 100)}
        <label className="conversion-check">
          <input
            type="checkbox"
            checked={s.smartEdges ?? false}
            disabled={s.charset === "braille"}
            onChange={(e) => update({ smartEdges: e.target.checked })}
          />
          Smart directional edges
        </label>
        <p>
          Uses line characters along strong contours. Sharpness and contrast
          enhance local detail.
        </p>
        <label className="conversion-check">
          <input
            type="checkbox"
            checked={s.invert}
            onChange={(e) => update({ invert: e.target.checked })}
          />
          Invert
        </label>
        <label className="conversion-check">
          <input
            type="checkbox"
            checked={s.dithering}
            onChange={(e) => update({ dithering: e.target.checked })}
          />
          Dithering
        </label>
      </section>
      <section>
        <h2>Color & surface</h2>
        <label>
          Color mode
          <select
            value={s.mode}
            onChange={(e) =>
              update({ mode: e.target.value as ConversionSettings["mode"] })
            }
          >
            <option value="monochrome">Monochrome</option>
            <option value="grayscale">Grayscale</option>
            <option value="color">Full color</option>
          </select>
        </label>
        <div className="conversion-pair">
          <label>
            Foreground
            <input
              type="color"
              disabled={s.mode !== "monochrome"}
              value={s.fg}
              onChange={(e) => update({ fg: e.target.value })}
            />
          </label>
          <label>
            Background
            <input
              type="color"
              disabled={s.bg === null}
              value={s.bg || "#0c0d10"}
              onChange={(e) => update({ bg: e.target.value })}
            />
          </label>
        </div>
        <label className="conversion-check">
          <input
            type="checkbox"
            checked={s.bg === null}
            onChange={(e) =>
              update({ bg: e.target.checked ? null : "#0c0d10" })
            }
          />
          Transparent background
        </label>
        <p>
          Color and grayscale sample the image foreground. Transparent source
          pixels remain transparent.
        </p>
      </section>
    </fieldset>
  );
}
