"use client";
import { useEffect, useRef } from "react";
import type { StudioController, StudioSnapshot } from "./controller";
export function Icon({ name }: { name: string }) {
  // Local fixed-size line icons do not benefit from image optimization.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/studio/icons/${name}.svg`} width="16" height="16" alt="" />
  );
}
export function Toolbar({
  controller: c,
  snapshot: s,
  open,
}: {
  controller: StudioController;
  snapshot: StudioSnapshot;
  open: (dialog: "help" | "menu") => void;
}) {
  const holding = useRef(false);
  const release = () => {
    if (holding.current) {
      holding.current = false;
      c.releaseCompare();
    }
  };
  useEffect(() => {
    const end = () => {
      if (holding.current) {
        holding.current = false;
        c.releaseCompare();
      }
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", end);
    const key = (event: KeyboardEvent) => {
      if (event.key === " " || event.key === "Enter") end();
    };
    window.addEventListener("keyup", key);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", end);
      window.removeEventListener("keyup", key);
    };
  }, [c]);
  const unavailable = "Unavailable in this release";
  return (
    <header className="studio-toolbar">
      <span className="studio-brand">AsciiMorph</span>
      <div className="studio-workspaces">
        <button aria-current="page">Studio</button>
        <button disabled title="Flow editing is unavailable">
          Flow
        </button>
      </div>
      <div role="toolbar" aria-label="Canvas tools" className="studio-tools">
        <button
          aria-label="Zoom out"
          onClick={() => c.setView({ zoom: s.view.zoom / 1.2 })}
        >
          <Icon name="minus" />
        </button>
        <button
          className="studio-zoom"
          aria-label="Reset zoom"
          onClick={() => c.setView({ zoom: 1 })}
        >
          {Math.round(s.view.zoom * 100)}%
        </button>
        <button
          aria-label="Zoom in"
          onClick={() => c.setView({ zoom: s.view.zoom * 1.2 })}
        >
          <Icon name="plus" />
        </button>
        <span className="studio-separator" />
        <button disabled aria-label="Crop unavailable" title={unavailable}>
          <Icon name="crop" />
        </button>
        <button
          aria-label="Hold to compare"
          title="Hold to view original"
          onPointerDown={(e) => {
            holding.current = true;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            c.setView({ compare: true });
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={release}
          onBlur={release}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              holding.current = true;
              c.setView({ compare: true });
            }
          }}
          onKeyUp={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              release();
            }
          }}
        >
          <Icon name="compare" />
        </button>
        <button
          aria-label="Toggle original comparison"
          aria-pressed={s.view.compare}
          onClick={() => c.setView({ compare: !s.view.compare })}
        >
          Original
        </button>
        <button disabled aria-label="Text unavailable" title={unavailable}>
          <Icon name="text" />
        </button>
        <span className="studio-separator" />
        <button
          aria-label="Undo"
          disabled={!s.history.undoCount && !s.history.editing}
          onClick={() => {
            c.commitEdit();
            c.undo();
          }}
        >
          <Icon name="undo" />
        </button>
        <button
          aria-label="Redo"
          disabled={!s.history.redoCount}
          onClick={() => {
            c.commitEdit();
            c.redo();
          }}
        >
          <Icon name="redo" />
        </button>
        <button disabled aria-label="Layers unavailable" title={unavailable}>
          <Icon name="layers" />
        </button>
      </div>
      <div className="studio-account">
        <button disabled title="Pro features are unavailable">
          Pro
        </button>
        <button aria-label="Help" onClick={() => open("help")}>
          <Icon name="help" />
        </button>
        <button
          disabled
          aria-label="Account unavailable"
          title="Accounts are unavailable"
        >
          <Icon name="account" />
        </button>
        <button aria-label="Menu" onClick={() => open("menu")}>
          <Icon name="menu" />
        </button>
      </div>
    </header>
  );
}
