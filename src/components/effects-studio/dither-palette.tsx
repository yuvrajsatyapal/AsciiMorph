"use client";
import { useEffect, useState } from "react";
import type { StudioController, StudioSnapshot } from "./controller";
export function DitherPalette({
  controller: c,
  snapshot: s,
}: {
  controller: StudioController;
  snapshot: StudioSnapshot;
}) {
  const value = (
    s.project.style.parameters.ditherCustomPalette as string[]
  ).join(", ");
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value, s.project.id, s.revision]);
  const colors = draft.trim().split(/[\s,]+/);
  const valid =
    colors.length >= 2 &&
    colors.length <= 64 &&
    colors.every((v) => /^#[0-9a-f]{6}$/i.test(v));
  return (
    <label className="studio-control">
      <span>Custom Palette</span>
      <textarea
        className="studio-ramp"
        rows={3}
        maxLength={1024}
        aria-label="Custom Palette"
        aria-invalid={!valid}
        aria-describedby="dither-palette-hint"
        value={draft}
        spellCheck={false}
        onFocus={() => c.beginEdit()}
        onBlur={() => c.commitEdit()}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          const colors = next.trim().split(/[\s,]+/);
          if (
            colors.length >= 2 &&
            colors.length <= 64 &&
            colors.every((v) => /^#[0-9a-f]{6}$/i.test(v))
          )
            c.patchParameter(
              "ditherCustomPalette",
              colors.map((v) => v.toLowerCase()),
            );
        }}
      />
      <small id="dither-palette-hint">
        {valid
          ? "2–64 opaque #RRGGBB colors, separated by commas. Order resolves ties."
          : "Enter 2–64 valid #RRGGBB colors. Preview keeps the last valid palette."}
      </small>
    </label>
  );
}
