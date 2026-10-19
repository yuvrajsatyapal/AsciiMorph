"use client";
import type { ConversionSettings } from "@/converter/settings";
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
