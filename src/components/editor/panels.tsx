"use client";
import { useState, useEffect } from "react";
import { Star, Plus } from "lucide-react";
import { graphemes, validateDocument } from "@/core/document";
import { symbolPalettes, ANSI, STAMPS } from "@/editor/palettes";
import type { EditorController } from "@/editor/use-editor";
export function SymbolPanel({ e }: { e: EditorController }) {
  const [category, setCategory] = useState("Standard ASCII"),
    [search, setSearch] = useState(""),
    [customName, setCustomName] = useState(""),
    [customChars, setCustomChars] = useState("");
  const palettes: Record<string, string> = {
    ...symbolPalettes,
    ...e.preferences.custom,
    Favorites: e.preferences.favorites.join(""),
  };
  const characters = Array.from(
    new Set(graphemes(palettes[category] || "")),
  ).filter(
    (c) =>
      !search ||
      `${category} ${c} U+${c.codePointAt(0)?.toString(16)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="panel-heading">
        <h2>Character library</h2>
        <span>{characters.length} symbols</span>
      </div>
      <label className="field">
        Search symbols
        <input
          value={search}
          onChange={(ev) => setSearch(ev.target.value)}
          placeholder="Symbol, category, or U+ code"
        />
      </label>
      <label className="field">
        Palette
        <select
          value={category}
          onChange={(ev) => setCategory(ev.target.value)}
        >
          {Object.keys(palettes).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <div className="symbol-grid">
        {characters.map((c) => (
          <button
            key={c}
            aria-label={`Character ${c === " " ? "space" : c} U+${c.codePointAt(0)?.toString(16)}`}
            title={`U+${c.codePointAt(0)?.toString(16).toUpperCase()}`}
            aria-pressed={e.character === c}
            onClick={() => e.setCharacter(c)}
          >
            {c === " " ? "␣" : c}
          </button>
        ))}
      </div>
      <div className="selected-symbol">
        <span className="large-symbol">
          {e.character === " " ? "␣" : e.character}
        </span>
        <div>
          <strong>Selected character</strong>
          <label>
            <span className="sr-only">Custom character</span>
            <input
              aria-label="Custom character"
              value={e.character}
              onChange={(ev) => {
                const c = graphemes(ev.target.value)[0];
                if (c && !/[\r\n\t\x00-\x1f]/.test(c)) e.setCharacter(c);
              }}
            />
          </label>
        </div>
        <button
          className="icon-button"
          aria-label="Favorite selected character"
          aria-pressed={e.preferences.favorites.includes(e.character)}
          onClick={() =>
            e.prefs({
              ...e.preferences,
              favorites: e.preferences.favorites.includes(e.character)
                ? e.preferences.favorites.filter((c) => c !== e.character)
                : [...e.preferences.favorites, e.character],
            })
          }
        >
          <Star size={17} />
        </button>
      </div>
      <details>
        <summary>Custom palette</summary>
        <label className="field">
          Palette name
          <input
            maxLength={40}
            value={customName}
            onChange={(ev) => setCustomName(ev.target.value)}
          />
        </label>
        <label className="field">
          Characters
          <input
            value={customChars}
            maxLength={1024}
            onChange={(ev) => setCustomChars(ev.target.value)}
          />
        </label>
        <button
          className="button quiet"
          disabled={!customName.trim() || !customChars}
          onClick={() => {
            const name = customName.trim();
            e.prefs({
              ...e.preferences,
              custom: { ...e.preferences.custom, [name]: customChars },
            });
            setCategory(name);
            setCustomName("");
            setCustomChars("");
          }}
        >
          <Plus size={14} />
          Save palette
        </button>
      </details>
      <label className="field">
        Stamp
        <select
          value={e.stamp}
          onChange={(ev) => {
            e.setStamp(ev.target.value);
            e.setTool("stamp");
          }}
        >
          {Object.keys(STAMPS).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <pre className="stamp-preview">{STAMPS[e.stamp]}</pre>
      <button className="button quiet" onClick={() => e.setTool("stamp")}>
        Use stamp
      </button>
    </>
  );
}
function HexColor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value),
    [error, setError] = useState(false);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="field">
      {label}
      <div className="color-field">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={value.length === 7 ? value : "#000000"}
          onChange={(ev) => {
            onChange(ev.target.value);
            setDraft(ev.target.value);
            setError(false);
          }}
        />
        <input
          aria-label={`${label} hex`}
          value={draft}
          key={label}
          onChange={(ev) => {
            setDraft(ev.target.value);
            if (/^#[0-9a-f]{6}$/i.test(ev.target.value)) {
              onChange(ev.target.value);
              setError(false);
            } else setError(true);
          }}
          onBlur={() => {
            if (!/^#[0-9a-f]{6}$/i.test(draft)) {
              setDraft(value);
              setError(false);
            }
          }}
        />
      </div>
      {error && <span className="field-error">Use a six-digit hex color.</span>}
    </label>
  );
}
export function ColorPanel({ e }: { e: EditorController }) {
  return (
    <>
      <div className="panel-heading">
        <h2>Color & brush</h2>
      </div>
      <HexColor label="Foreground" value={e.fg} onChange={e.setFg} />
      <HexColor
        label="Background"
        value={e.bg || "#15171b"}
        onChange={e.setBg}
      />
      <label className="check-field">
        <input
          type="checkbox"
          checked={e.bg === null}
          onChange={(ev) => e.setBg(ev.target.checked ? null : "#15171b")}
        />
        Transparent cell background
      </label>
      <span className="field-label">ANSI colors</span>
      <div className="swatch-grid">
        {ANSI.map((c) => (
          <button
            key={c}
            style={{ background: c }}
            aria-label={`Foreground ${c}`}
            onClick={() => e.setFg(c)}
          />
        ))}
      </div>
      {e.preferences.recent.length > 0 && (
        <>
          <span className="field-label">Recent colors</span>
          <div className="swatch-grid">
            {e.preferences.recent.map((c) => (
              <button
                key={c}
                style={{ background: c }}
                aria-label={`Recent ${c}`}
                onClick={() => e.setFg(c)}
              />
            ))}
          </div>
        </>
      )}
      <button
        className="button quiet"
        onClick={() =>
          e.prefs({
            ...e.preferences,
            saved: [[e.fg, e.bg || "#15171b"], ...e.preferences.saved].slice(
              0,
              12,
            ),
          })
        }
      >
        Save color palette
      </button>
      {e.preferences.saved.length > 0 && (
        <label className="field">
          Saved palette
          <select
            defaultValue=""
            onChange={(ev) => {
              if (ev.target.value === "") return;
              const p = e.preferences.saved[Number(ev.target.value)];
              e.setFg(p[0]);
              e.setBg(p[1]);
            }}
          >
            <option value="">Choose colors</option>
            {e.preferences.saved.map((p, i) => (
              <option key={i} value={i}>
                {p.join(" / ")}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        Brush size <span>{e.brush} cells</span>
        <input
          type="range"
          min={1}
          max={8}
          value={e.brush}
          onChange={(ev) => e.setBrush(Number(ev.target.value))}
        />
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={e.resetEraser}
          onChange={(ev) => e.setResetEraser(ev.target.checked)}
        />
        Eraser resets colors
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={e.monochrome}
          onChange={(ev) => e.setMonochrome(ev.target.checked)}
        />
        Monochrome preview
      </label>
      <button
        className="button quiet"
        onClick={() => e.selectionAction("recolor")}
      >
        Recolor selection or canvas
      </button>
    </>
  );
}
export function CanvasPanel({ e }: { e: EditorController }) {
  const d = e.doc;
  const [preserve, setPreserve] = useState(true);
  if (!d) return null;
  return (
    <>
      <div className="panel-heading">
        <h2>Canvas settings</h2>
      </div>
      <form
        key={d.id}
        onSubmit={(ev) => {
          ev.preventDefault();
          const form = new FormData(ev.currentTarget);
          e.run(() =>
            e.resize(
              Number(form.get("width")),
              Number(form.get("height")),
              preserve,
            ),
          );
        }}
      >
        <div className="field-pair">
          <label className="field">
            Columns
            <input
              name="width"
              type="number"
              min={1}
              max={300}
              defaultValue={d.width}
              required
            />
          </label>
          <label className="field">
            Rows
            <input
              name="height"
              type="number"
              min={1}
              max={300}
              defaultValue={d.height}
              required
            />
          </label>
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={preserve}
            onChange={(ev) => setPreserve(ev.target.checked)}
          />
          Preserve artwork
        </label>
        <button className="button quiet" type="submit">
          Resize canvas
        </button>
      </form>
      <form
        key={`${d.id}-metrics`}
        onSubmit={(ev) => {
          ev.preventDefault();
          const form = new FormData(ev.currentTarget);
          e.run(() =>
            e.commit(
              validateDocument({
                ...d,
                cellWidth: Number(form.get("cellWidth")),
                cellHeight: Number(form.get("cellHeight")),
                fontSize: Number(form.get("fontSize")),
              }),
            ),
          );
        }}
      >
        <div className="field-pair">
          <label className="field">
            Cell width
            <input
              name="cellWidth"
              type="number"
              min={1}
              max={64}
              defaultValue={d.cellWidth}
            />
          </label>
          <label className="field">
            Cell height
            <input
              name="cellHeight"
              type="number"
              min={1}
              max={128}
              defaultValue={d.cellHeight}
            />
          </label>
        </div>
        <label className="field">
          Font size
          <input
            name="fontSize"
            type="number"
            min={1}
            max={96}
            defaultValue={d.fontSize}
          />
        </label>
        <button className="button quiet">Apply cell settings</button>
      </form>
      <label className="field">
        Canvas background
        <input
          type="color"
          value={d.background || "#15171b"}
          onChange={(ev) => e.commit({ ...d, background: ev.target.value })}
        />
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={d.background === null}
          onChange={(ev) =>
            e.commit({ ...d, background: ev.target.checked ? null : "#15171b" })
          }
        />
        Transparent canvas
      </label>
      <button
        className="button quiet full-width"
        onClick={() =>
          e.run(async () => {
            await e.loadSnapshots();
            e.setPanel("recovery");
          })
        }
      >
        Recovery & projects
      </button>
      <p className="muted">
        IBM Plex Mono · one grapheme per cell. Wide Unicode symbols may be
        clipped.
      </p>
    </>
  );
}
