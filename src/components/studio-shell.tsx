"use client";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  Braces,
  Settings2,
  ArrowLeft,
  Library,
  SlidersHorizontal,
} from "lucide-react";
import { PanelDialog } from "./ui/dialog";
import { createDocument } from "@/core/document";
import { orbitArt } from "./home";
const subscribe = () => () => {};
export default function StudioShell() {
  const [panel, setPanel] = useState<"canvas" | "library" | null>(null);
  const query = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => "",
  );
  const doc = useMemo(() => {
    const params = new URLSearchParams(query);
    if (params.get("demo") !== "orbit") return createDocument();
    const char = ["◆", "@", "+", "░"].includes(params.get("char") || "")
      ? params.get("char")!
      : "◆";
    const color = /^[a-f0-9]{6}$/i.test(params.get("color") || "")
      ? `#${params.get("color")}`
      : "#E9B86E";
    const project = createDocument(65, 26, "Orbit");
    project.layers[0].cells = Array.from(
      orbitArt(char).replaceAll("\n", ""),
      (glyph) => ({ char: glyph, fg: color, bg: null, alpha: 1 }),
    );
    return project;
  }, [query]);
  const sample = doc.name === "Orbit";
  const library = (
    <>
      <h3>A little room to create.</h3>
      <p>Your characters, palettes, and drawing tools will live here.</p>
    </>
  );
  const properties = (
    <>
      <h3>Space for your next idea</h3>
      <dl>
        <div>
          <dt>Columns</dt>
          <dd>{doc.width}</dd>
        </div>
        <div>
          <dt>Rows</dt>
          <dd>{doc.height}</dd>
        </div>
        <div>
          <dt>Cell size</dt>
          <dd>9 × 18 px</dd>
        </div>
        <div>
          <dt>Typeface</dt>
          <dd>IBM Plex Mono</dd>
        </div>
      </dl>
    </>
  );
  return (
    <main className="studio-shell">
      <a href="#studio-content" className="skip-link">
        Skip to canvas
      </a>
      <header className="studio-header">
        <Link href="/" className="wordmark">
          <Braces size={23} />
          AsciiMorph
        </Link>
        <span className="header-divider" />
        <span data-testid="document-name">{doc.name}</span>
        <div className="studio-header-actions">
          <Link href="/" className="button quiet">
            <ArrowLeft size={15} /> Home
          </Link>
          <button
            className="icon-button"
            aria-label="Open canvas settings"
            onClick={() => setPanel("canvas")}
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>
      <div className="studio-workspace">
        <aside className="foundation-rail" aria-label="Workspace">
          <button
            className="icon-button"
            aria-label="Open library"
            onClick={() => setPanel("library")}
          >
            <Library size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Open canvas panel"
            onClick={() => setPanel("canvas")}
          >
            <SlidersHorizontal size={18} />
          </button>
        </aside>
        <aside className="foundation-library">
          <span className="control-caption">YOUR WORKSPACE</span>
          {library}
        </aside>
        <section
          className="foundation-viewport"
          id="studio-content"
          tabIndex={-1}
        >
          <div className="canvas-label">
            <span>{doc.name.toUpperCase()}</span>
            <span>
              {doc.width} × {doc.height}
            </span>
          </div>
          <div
            className="blank-canvas"
            style={
              sample
                ? { aspectRatio: `${doc.width * 9}/${doc.height * 18}` }
                : undefined
            }
          >
            {sample ? (
              <pre
                className="studio-sample-art"
                aria-label="Orbit artwork, 65 by 26 characters"
                style={{ color: doc.layers[0].cells[0].fg }}
              >
                {Array.from({ length: doc.height }, (_, y) =>
                  doc.layers[0].cells
                    .slice(y * doc.width, (y + 1) * doc.width)
                    .map((c) => c.char)
                    .join(""),
                ).join("\n")}
              </pre>
            ) : (
              <span
                role="img"
                aria-label="Blank canvas, 80 by 40 characters"
                className="canvas-cross"
              >
                +
              </span>
            )}
          </div>
          <p className="canvas-undertext">
            {sample
              ? "Your character study, ready for the next milestone."
              : "Every great idea starts with a blank space."}
          </p>
        </section>
        <aside className="foundation-inspector">
          <span className="control-caption">CANVAS</span>
          {properties}
          <button className="button quiet" onClick={() => setPanel("canvas")}>
            <SlidersHorizontal size={16} />
            Canvas settings
          </button>
        </aside>
      </div>
      <footer className="studio-status">
        <span>{sample ? "Orbit character study" : "Blank canvas"}</span>
        <span>
          {doc.width} × {doc.height} characters · IBM Plex Mono
        </span>
      </footer>
      <PanelDialog
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title={panel === "library" ? "Library" : "Canvas settings"}
      >
        {panel === "library" ? (
          library
        ) : (
          <>
            <p>
              This workspace uses a {doc.width} × {doc.height} character canvas,
              with 9 × 18 pixel cells and IBM Plex Mono.
            </p>
            <p>The manual editing tools are the next milestone.</p>
          </>
        )}
      </PanelDialog>
    </main>
  );
}
