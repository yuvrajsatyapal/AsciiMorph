"use client";
/* eslint-disable @next/next/no-img-element -- Object URLs are local file previews. */
import { useEffect, useRef, useState } from "react";
import type { AsciiDocument } from "@/core/document";
import { paint, ensureArtworkFont, documentText } from "@/core/render";
import type { Source } from "@/converter/use-converter";
function Artwork({
  doc,
  onError,
}: {
  doc: AsciiDocument;
  onError: (message: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    void ensureArtworkFont(doc.fontSize)
      .then(() => {
        if (live && ref.current) paint(ref.current, doc, { pixelRatio: 1 });
      })
      .catch((e) => {
        if (live) onError(String(e));
      });
    return () => {
      live = false;
    };
  }, [doc, onError]);
  return (
    <canvas
      data-testid="converted-canvas"
      ref={ref}
      aria-label="Converted ASCII artwork"
    />
  );
}
type View = "ASCII" | "Original" | "Side by side" | "Before / after";
export function Preview({
  doc,
  source,
  onError,
}: {
  doc: AsciiDocument | null;
  source: Source;
  onError: (message: string) => void;
}) {
  const [view, setView] = useState<View>("ASCII"),
    [zoom, setZoom] = useState(1),
    [split, setSplit] = useState(50);
  const viewport = useRef<HTMLDivElement>(null),
    root = useRef<HTMLElement>(null),
    drag = useRef<{ x: number; y: number; left: number; top: number } | null>(
      null,
    );
  const width = doc ? doc.width * doc.cellWidth : source.pixels.width,
    height = doc ? doc.height * doc.cellHeight : source.pixels.height;
  const fit = () => {
    const v = viewport.current;
    if (v)
      setZoom(
        Math.max(
          0.05,
          Math.min(
            2,
            (v.clientWidth - 40) / (width * (view === "Side by side" ? 2 : 1)),
            (v.clientHeight - 40) / height,
          ),
        ),
      );
  };
  useEffect(() => {
    fit(); /* fit when image dimensions or comparison layout changes */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, view]);
  const changeZoom = (delta: number) =>
    setZoom((z) => Math.max(0.05, Math.min(4, z + delta)));
  return (
    <section className="conversion-preview" ref={root}>
      <div className="conversion-preview-tools">
        <div className="conversion-views" aria-label="Preview mode">
          {(
            ["ASCII", "Original", "Side by side", "Before / after"] as View[]
          ).map((v) => (
            <button
              key={v}
              aria-pressed={v === view}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="conversion-zoom">
          <button aria-label="Zoom out" onClick={() => changeZoom(-0.1)}>
            −
          </button>
          <output>{Math.round(zoom * 100)}%</output>
          <button aria-label="Zoom in" onClick={() => changeZoom(0.1)}>
            +
          </button>
          <button onClick={fit}>Fit</button>
          <button
            onClick={() => {
              void (async () => {
                try {
                  if (document.fullscreenElement)
                    await document.exitFullscreen();
                  else if (root.current?.requestFullscreen)
                    await root.current.requestFullscreen();
                  else
                    throw new Error(
                      "Fullscreen is unavailable in this browser.",
                    );
                } catch (e) {
                  onError(String(e));
                }
              })();
            }}
          >
            Fullscreen
          </button>
        </div>
      </div>
      {view === "Before / after" && (
        <label className="comparison-control">
          Comparison position{" "}
          <input
            aria-label="Comparison position"
            type="range"
            min={0}
            max={100}
            value={split}
            onChange={(e) => setSplit(+e.target.value)}
          />
          <output>{split}% original</output>
        </label>
      )}
      <div
        className="conversion-viewport"
        ref={viewport}
        tabIndex={0}
        aria-label="Conversion preview"
        onKeyDown={(e) => {
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [-60, 0],
            ArrowRight: [60, 0],
            ArrowUp: [0, -60],
            ArrowDown: [0, 60],
          };
          if (directions[e.key]) {
            e.preventDefault();
            viewport.current?.scrollBy(...directions[e.key]);
          } else if (["+", "=", "-", "0"].includes(e.key)) {
            e.preventDefault();
            if (e.key === "0") fit();
            else changeZoom(e.key === "-" ? -0.1 : 0.1);
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const v = e.currentTarget;
          v.focus();
          v.setPointerCapture(e.pointerId);
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            left: v.scrollLeft,
            top: v.scrollTop,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) {
            e.currentTarget.scrollLeft = d.left + d.x - e.clientX;
            e.currentTarget.scrollTop = d.top + d.y - e.clientY;
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <div
          className="conversion-art-wrap"
          style={{
            width: width * zoom * (view === "Side by side" ? 2 : 1),
            height: height * zoom,
          }}
        >
          {(view === "Original" ||
            view === "Side by side" ||
            view === "Before / after" ||
            !doc) && (
            <img
              alt="Original uploaded image"
              draggable={false}
              src={source.url}
              style={{
                width: width * zoom,
                height: height * zoom,
                ...(view === "Before / after"
                  ? { clipPath: `inset(0 ${100 - split}% 0 0)` }
                  : {}),
              }}
            />
          )}
          {doc && view !== "Original" && (
            <div
              className={`converted-art ${view === "Before / after" ? "comparison-layer" : ""}`}
              style={{
                width: width * zoom,
                height: height * zoom,
                ...(view === "Before / after"
                  ? { clipPath: `inset(0 0 0 ${split}%)` }
                  : view === "Side by side"
                    ? { left: width * zoom }
                    : {}),
              }}
            >
              <Artwork doc={doc} onError={onError} />
            </div>
          )}
        </div>
      </div>
      <p className="conversion-hint">
        Drag to pan · Arrow keys to pan · + / − to zoom · 0 to fit. Checkerboard
        indicates transparency.
      </p>
      {doc && (
        <details className="conversion-text">
          <summary>ASCII text view</summary>
          <pre data-testid="converted-text">{documentText(doc)}</pre>
        </details>
      )}
    </section>
  );
}
