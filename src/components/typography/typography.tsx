"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  parseFiglet,
  placeTypography,
  typographyDocument,
  type FigletFont,
  type TypographyOptions,
} from "@/typography/figlet";
import { workspace } from "@/editor/store";
import { listProjects, readProject, saveProject } from "@/editor/persistence";
import type { AsciiDocument } from "@/core/document";
import { usePersistentState } from "@/workspace/preferences";
import { documentText } from "@/core/render";
import { GalleryArtwork, ArtworkActions } from "./artwork";
import "./typography.css";
export default function Typography() {
  const [font, setFont] = useState<FigletFont | null>(null);
  const [loadError, setLoadError] = useState("");
  const [text, setText] = usePersistentState("typography.text", "MORPH");
  const [alignment, setAlignment] = usePersistentState<
    TypographyOptions["alignment"]
  >("typography.alignment", "left");
  const [spacing, setSpacing] = usePersistentState("typography.spacing", 1);
  const [foreground, setForeground] = usePersistentState(
    "typography.foreground",
    "#e9b86e",
  );
  const [background, setBackground] = usePersistentState(
    "typography.background",
    "#0c0d10",
  );
  const [transparent, setTransparent] = usePersistentState(
    "typography.transparent",
    true,
  );
  const [fontId, setFontId] = usePersistentState(
      "typography.font",
      "morph-grid",
    ),
    [kerning, setKerning] = usePersistentState("typography.kerning", false),
    [outline, setOutline] = usePersistentState("typography.outline", false),
    [lineSpacing, setLineSpacing] = usePersistentState(
      "typography.lineSpacing",
      1,
    ),
    [gradient, setGradient] = usePersistentState("typography.gradient", false),
    [gradientColor, setGradientColor] = usePersistentState(
      "typography.gradientColor",
      "#8bb9de",
    ),
    [projects, setProjects] = useState<AsciiDocument[]>([]),
    [target, setTarget] = useState(""),
    [x, setX] = useState(0),
    [y, setY] = useState(0),
    [placementStatus, setPlacementStatus] = useState("");
  useEffect(() => {
    let live = true;
    void listProjects()
      .then((docs) => {
        if (live) setProjects(docs);
      })
      .catch((error) => {
        if (live) setPlacementStatus(String(error));
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    void fetch(
      `/fonts/figlet/${["morph-grid", "morph-wide", "morph-slim"].includes(fontId) ? fontId : "morph-grid"}.flf`,
      { signal: abort.signal },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Could not load the bundled FIGlet font.");
        const parsed = parseFiglet(await response.text());
        if (!abort.signal.aborted) setFont(parsed);
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) setLoadError(String(error));
      });
    return () => abort.abort();
  }, [fontId]);
  const result = useMemo(() => {
    if (!font) return { doc: null, error: "" };
    try {
      return {
        doc: typographyDocument(font, text, {
          alignment,
          spacing,
          kerning,
          outline,
          lineSpacing,
          gradient: gradient ? gradientColor : undefined,
          foreground,
          background: transparent ? null : background,
        }),
        error: "",
      };
    } catch (error) {
      return {
        doc: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [
    font,
    text,
    alignment,
    spacing,
    foreground,
    background,
    transparent,
    kerning,
    outline,
    lineSpacing,
    gradient,
    gradientColor,
  ]);
  return (
    <main className="type-page">
      <header className="type-header">
        <Link prefetch={false} href="/" className="mono">
          {"{ }"} AsciiMorph
        </Link>
        <nav aria-label="Creative tools">
          <Link prefetch={false} href="/create">All tools</Link>
          <Link prefetch={false} href="/gallery">Gallery</Link>
          <Link prefetch={false} href="/studio">Studio</Link>
        </nav>
      </header>
      <div className="type-title">
        <p className="type-eyebrow">WORDS, WITH CHARACTER</p>
        <h1>Typography lab</h1>
        <p>
          Build a banner from the grid up. Real FIGlet lettering, ready to make
          your own.
        </p>
      </div>
      <div className="type-layout">
        <section className="type-controls" aria-label="Typography settings">
          <label>
            Your text
            <textarea
              aria-label="Your text"
              value={text}
              maxLength={1000}
              rows={5}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
            />
          </label>
          <p className="type-help">
            Printable ASCII · 300 columns maximum · Add new lines for longer
            text.
          </p>
          <label>
            FIGlet font
            <select
              aria-label="FIGlet font"
              value={fontId}
              onChange={(e) => setFontId(e.target.value)}
            >
              <option value="morph-grid">Morph Grid · block alphabet</option>
              <option value="morph-wide">Morph Wide · expanded strokes</option>
              <option value="morph-slim">Morph Slim · terminal strokes</option>
            </select>
          </label>
          <p className="type-help">
            An original block alphabet. Lowercase is rendered as capitals.{" "}
            <a
              href="/fonts/figlet/LICENSE.txt"
              target="_blank"
              rel="noreferrer"
            >
              CC0 font license ↗
            </a>
          </p>
          <p className="type-help">
            Three original CC0 alphabets. Select a font to preview it
            immediately.
          </p>
          <label className="type-check">
            <input
              type="checkbox"
              checked={kerning}
              onChange={(e) => setKerning(e.target.checked)}
            />
            Optical kerning (trim glyph side bearings)
          </label>
          <label className="type-check">
            <input
              type="checkbox"
              checked={outline}
              onChange={(e) => setOutline(e.target.checked)}
            />
            Character outline
          </label>
          <label>
            Line spacing
            <input
              type="range"
              min={0}
              max={8}
              value={lineSpacing}
              onChange={(e) => setLineSpacing(+e.target.value)}
            />
          </label>
          <label className="type-check">
            <input
              type="checkbox"
              checked={gradient}
              onChange={(e) => setGradient(e.target.checked)}
            />
            Vertical color gradient
          </label>
          {gradient && (
            <label>
              Gradient end
              <input
                type="color"
                value={gradientColor}
                onChange={(e) => setGradientColor(e.target.value)}
              />
            </label>
          )}
          <label>
            Alignment
            <select
              aria-label="Alignment"
              value={alignment}
              onChange={(event) =>
                setAlignment(
                  event.target.value as TypographyOptions["alignment"],
                )
              }
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label>
            Letter spacing <output>{spacing} cells</output>
            <input
              aria-label="Letter spacing"
              type="range"
              min={0}
              max={8}
              value={spacing}
              onChange={(event) => setSpacing(Number(event.target.value))}
            />
          </label>
          <div className="type-colors">
            <label>
              Letter color
              <input
                aria-label="Letter color"
                type="color"
                value={foreground}
                onChange={(event) => setForeground(event.target.value)}
              />
            </label>
            <label>
              Background
              <input
                aria-label="Background color"
                type="color"
                value={background}
                onChange={(event) => setBackground(event.target.value)}
                disabled={transparent}
              />
            </label>
          </div>
          <label className="type-check">
            <input
              type="checkbox"
              checked={transparent}
              onChange={(event) => setTransparent(event.target.checked)}
            />
            Transparent background
          </label>
        </section>
        <section className="type-output" aria-label="Typography result">
          <div className="type-preview-heading">
            <h2>Live preview</h2>
            {result.doc && (
              <span>
                {result.doc.width} × {result.doc.height} cells
              </span>
            )}
          </div>
          <div className="type-preview">
            {result.doc ? (
              <GalleryArtwork
                doc={result.doc}
                label="FIGlet typography preview"
              />
            ) : (
              <p role={result.error || loadError ? "alert" : "status"}>
                {result.error || loadError || "Loading local font…"}
              </p>
            )}
          </div>
          {result.doc && (
            <>
              <ArtworkActions doc={result.doc} />
              <section
                className="type-controls"
                aria-label="Place typography into existing project"
              >
                <h2>Add to a saved project</h2>
                <label>
                  Target project
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">Choose saved artwork</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name} · {project.width} × {project.height}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Column
                  <input
                    type="number"
                    value={x}
                    onChange={(e) => setX(Math.trunc(+e.target.value))}
                  />
                </label>
                <label>
                  Row
                  <input
                    type="number"
                    value={y}
                    onChange={(e) => setY(Math.trunc(+e.target.value))}
                  />
                </label>
                <button
                  disabled={!target}
                  onClick={() =>
                    void (async () => {
                      try {
                        const saved =
                          workspace.getState().documents[target] ??
                          (await readProject(target));
                        if (!saved)
                          throw new Error("Project is no longer available");
                        const placed = placeTypography(
                          saved,
                          result.doc!,
                          x,
                          y,
                        );
                        await saveProject(placed);
                        workspace.setState((state) => ({
                          documents: {
                            ...state.documents,
                            [placed.id]: placed,
                          },
                          revision: state.revision + 1,
                          ...(state.activeId === placed.id
                            ? {
                                past: [...state.past, saved].slice(-80),
                                future: [],
                              }
                            : {}),
                        }));
                        setPlacementStatus(
                          "Typography added as a new layer. Original layers are preserved.",
                        );
                      } catch (error) {
                        setPlacementStatus(String(error));
                      }
                    })()
                  }
                >
                  Add lettering layer
                </button>
                <p role="status">{placementStatus}</p>
                <p className="type-help">
                  Coordinates use cells. Lettering outside the destination
                  canvas is clipped. Saved recovery snapshots remain available
                  in Projects.
                </p>
              </section>
              <details className="type-text">
                <summary>ASCII text view</summary>
                <pre>{documentText(result.doc)}</pre>
              </details>
            </>
          )}
          <p className="type-help">
            Opening in Studio saves your existing draft first. All processing
            stays in this browser.
          </p>
        </section>
      </div>
    </main>
  );
}
