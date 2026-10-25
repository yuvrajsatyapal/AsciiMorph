"use client";
import { useEffect, useState } from "react";
import { initialCatalogRegistry } from "@/render/catalog/initial-schemas";
import type { StudioController, StudioSnapshot } from "./controller";
import { Icon } from "./toolbar";
import { ParameterControl } from "./parameter-control";
function Range({
  name,
  parameter,
  min,
  max,
  controller: c,
  snapshot: s,
}: {
  name: string;
  parameter: string;
  min: number;
  max: number;
  controller: StudioController;
  snapshot: StudioSnapshot;
}) {
  return (
    <label className="studio-control">
      <span>
        {name}
        <output>{String(s.project.style.parameters[parameter])}</output>
      </span>
      <input
        aria-label={name}
        type="range"
        min={min}
        max={max}
        step={1}
        value={Number(s.project.style.parameters[parameter])}
        onPointerDown={() => c.beginEdit()}
        onPointerUp={() => c.commitEdit()}
        onPointerCancel={() => c.commitEdit()}
        onLostPointerCapture={() => c.commitEdit()}
        onKeyDown={(e) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(e.key)
          )
            c.beginEdit();
        }}
        onKeyUp={() => c.commitEdit()}
        onBlur={() => c.commitEdit()}
        onChange={(e) => c.patchParameter(parameter, Number(e.target.value))}
      />
    </label>
  );
}
function CharacterControls({
  controller: c,
  snapshot: s,
}: {
  controller: StudioController;
  snapshot: StudioSnapshot;
}) {
  const value = String(s.project.style.parameters.charSet);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value, s.project.id, s.revision]);
  let valid = true;
  try {
    initialCatalogRegistry.validateStyle("characters", {
      ...s.project.style.parameters,
      charSet: draft,
    });
  } catch {
    valid = false;
  }
  return (
    <>
      <Range
        name="Font Size"
        parameter="fontSize"
        min={3}
        max={80}
        controller={c}
        snapshot={s}
      />
      <label className="studio-control">
        <span>Character Set</span>
        <input
          className="studio-ramp"
          aria-label="Character Set"
          aria-invalid={!valid}
          aria-describedby="studio-ramp-hint"
          value={draft}
          spellCheck={false}
          onFocus={() => c.beginEdit()}
          onChange={(e) => {
            const text = e.target.value;
            setDraft(text);
            try {
              initialCatalogRegistry.validateStyle("characters", {
                ...s.project.style.parameters,
                charSet: text,
              });
              c.patchParameter("charSet", text);
            } catch {
              /* Partial input stays local. */
            }
          }}
          onBlur={() => c.commitEdit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              c.commitEdit();
              e.currentTarget.blur();
            }
          }}
        />
      </label>
      <p id="studio-ramp-hint" className="studio-note">
        {valid
          ? "Unique printable characters, darkest to lightest. Spaces are preserved."
          : "Use 2–256 unique printable graphemes. Preview keeps the last valid set."}
      </p>
    </>
  );
}
export function Properties({
  controller: c,
  snapshot: s,
  close,
  collapse,
}: {
  controller: StudioController;
  snapshot: StudioSnapshot;
  close: () => void;
  collapse: () => void;
}) {
  const raster =
    s.project.style.id === "pixel" || s.project.style.id === "mosaic";
  const schema = initialCatalogRegistry.getStyle(s.project.style.id)!;
  const control = (key: string) => {
    const descriptor = schema.descriptor.parameters.find((p) => p.key === key);
    return descriptor ? (
      <ParameterControl
        key={key}
        descriptor={descriptor}
        value={s.project.style.parameters[key]}
        onChange={(value) => c.patchParameter(key, value)}
        onBeginEdit={() => c.beginEdit()}
        onCommitEdit={() => c.commitEdit()}
      />
    ) : null;
  };
  return (
    <>
      <nav className="studio-property-rail" aria-label="Control groups">
        <button
          aria-label={raster ? "Style controls" : "Characters controls"}
          aria-pressed={s.view.activeGroup === "characters"}
          onClick={() =>
            c.setView({ activeGroup: "characters", dockCollapsed: false })
          }
        >
          Aa
        </button>
        <button
          aria-label="Color controls"
          aria-pressed={s.view.activeGroup === "color"}
          onClick={() =>
            c.setView({ activeGroup: "color", dockCollapsed: false })
          }
        >
          <Icon name="color" />
        </button>
        {["lights", "mask", "text"].map((name) => (
          <button
            key={name}
            disabled
            aria-label={`${name} controls unavailable`}
            title="Unavailable in this release"
          >
            <Icon name={name} />
          </button>
        ))}
        <button
          className="studio-rail-collapse"
          aria-label={
            s.view.dockCollapsed ? "Expand controls" : "Collapse controls"
          }
          onClick={collapse}
        >
          <Icon name="collapse" />
        </button>
      </nav>
      <div
        className="studio-property-content"
        inert={s.view.dockCollapsed}
        aria-hidden={s.view.dockCollapsed}
      >
        <header className="studio-panel-heading">
          <span>{schema.descriptor.name.toUpperCase()}</span>
          <button aria-label="Close controls" onClick={close}>
            <Icon name="close" />
          </button>
        </header>
        {s.view.activeGroup === "characters" && raster ? (
          <section className="studio-control-section">
            <h2>{schema.descriptor.name}</h2>
            {control("fontSize")}
            {control("invert")}
            {control("charOpacity")}
            {s.project.style.id === "mosaic" && control("mosaicShape")}
            <p className="studio-note">
              Advanced controls are unavailable for this profile.
            </p>
          </section>
        ) : s.view.activeGroup === "characters" ? (
          <>
            <section className="studio-control-section">
              <h2>Backdrop</h2>
              <p className="studio-fixed">
                Blurred source <span>Fixed</span>
              </p>
              <p className="studio-note">
                The Characters renderer includes a blurred source backdrop.
              </p>
            </section>
            <section className="studio-control-section">
              <h2>Characters</h2>
              <CharacterControls controller={c} snapshot={s} />
            </section>
            <section className="studio-control-section">
              <h2>Intensity</h2>
              <p className="studio-note">
                Fixed in this look. Intensity editing is unavailable.
              </p>
            </section>
            <section className="studio-control-section">
              <h2>Blur</h2>
              <p className="studio-note">
                Fixed backdrop blur. Additional blur controls are unavailable.
              </p>
            </section>
          </>
        ) : (
          <section className="studio-control-section">
            <h2>Color</h2>
            {raster ? (
              <>
                {control("brightness")}
                {control("contrast")}
              </>
            ) : (
              <>
                <Range
                  name="Brightness"
                  parameter="brightness"
                  min={-100}
                  max={100}
                  controller={c}
                  snapshot={s}
                />
                <Range
                  name="Contrast"
                  parameter="contrast"
                  min={-100}
                  max={100}
                  controller={c}
                  snapshot={s}
                />
              </>
            )}
          </section>
        )}
      </div>
    </>
  );
}
