"use client";
import type { ParameterDescriptor } from "@/render/catalog/types";
import type { ParameterValue } from "@/render/project";

type Props = {
  descriptor: ParameterDescriptor;
  value: ParameterValue;
  onChange: (value: ParameterValue) => void;
  onBeginEdit: () => void;
  onCommitEdit: () => void;
};
const editKeys = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

export function ParameterControl({
  descriptor: d,
  value,
  onChange,
  onBeginEdit,
  onCommitEdit,
}: Props) {
  const id = `studio-control-${d.key}`;
  const span = (
    <span>
      {d.label}
      <output>
        {typeof value === "boolean" ? (value ? "On" : "Off") : String(value)}
      </output>
    </span>
  );
  if (
    d.type === "number" &&
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isFinite(d.min) &&
    Number.isFinite(d.max) &&
    d.min! < d.max! &&
    value >= d.min! &&
    value <= d.max! &&
    (d.step === undefined || (Number.isFinite(d.step) && d.step > 0))
  ) {
    const step = d.step ?? 0.1; // UI precision; only explicit descriptor steps are evidence-backed.
    return (
      <label className="studio-control">
        {span}
        <input
          aria-label={d.label}
          type="range"
          min={d.min}
          max={d.max}
          step={step}
          value={value}
          onPointerDown={onBeginEdit}
          onPointerUp={onCommitEdit}
          onPointerCancel={onCommitEdit}
          onLostPointerCapture={onCommitEdit}
          onKeyDown={(e) => {
            if (editKeys.has(e.key)) onBeginEdit();
          }}
          onKeyUp={(e) => {
            if (editKeys.has(e.key)) onCommitEdit();
          }}
          onBlur={onCommitEdit}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next) && next >= d.min! && next <= d.max!)
              onChange(next);
          }}
        />
      </label>
    );
  }
  if (
    d.type === "select" &&
    typeof value === "string" &&
    d.options?.some((o) => o.value === value)
  )
    return (
      <label className="studio-control">
        {span}
        <select
          aria-label={d.label}
          value={value}
          onFocus={onBeginEdit}
          onBlur={onCommitEdit}
          onChange={(e) => {
            if (d.options?.some((o) => o.value === e.target.value))
              onChange(e.target.value);
          }}
        >
          {d.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  if (d.type === "boolean" && typeof value === "boolean")
    return (
      <label className="studio-control studio-control-toggle">
        {span}
        <input
          aria-label={d.label}
          type="checkbox"
          checked={value}
          onChange={(e) => {
            onBeginEdit();
            onChange(e.target.checked);
            onCommitEdit();
          }}
        />
      </label>
    );
  if (
    d.type === "color" &&
    typeof value === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(value)
  )
    return (
      <label className="studio-control">
        {span}
        <input
          aria-label={d.label}
          type="color"
          value={value}
          onFocus={onBeginEdit}
          onBlur={onCommitEdit}
          onChange={(e) => {
            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value))
              onChange(e.target.value);
          }}
        />
      </label>
    );
  return (
    <p id={id} className="studio-note" role="status">
      {d.label} is unavailable for this profile.
    </p>
  );
}
