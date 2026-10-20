"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveActiveDraft } from "@/converter/handoff";
import { useState } from "react";
import {
  Braces,
  Image as ImageIcon,
  Undo2,
  Redo2,
  Save,
  Upload,
  Download,
  Settings2,
  HelpCircle,
  Maximize,
  Minus,
  Plus,
  Grid2X2,
  MousePointer2,
  Pencil,
  Eraser,
  Type,
  Square,
  RectangleHorizontal,
  Circle,
  PaintBucket,
  Pipette,
  Move,
  Hand,
  Stamp,
  Slash,
  PanelLeftClose,
  PanelRightClose,
} from "lucide-react";
import { createDocument, validateDocument } from "@/core/document";
import { useEditor, type Tool } from "@/editor/use-editor";
import { PanelDialog } from "@/components/ui/dialog";
import { EditorCanvas } from "./canvas";
import { SymbolPanel, ColorPanel, CanvasPanel } from "./panels";
import { LayerPanel } from "./layers";
import {
  openAnimation,
  frameEditFor,
  updateAnimationFrame,
} from "@/animation/handoff";
import "./editor.css";
const tools: { id: Tool; name: string; hint: string; Icon: typeof Pencil }[] = [
  { id: "pencil", name: "Pencil", hint: "P", Icon: Pencil },
  { id: "eraser", name: "Eraser", hint: "E", Icon: Eraser },
  { id: "text", name: "Text", hint: "T", Icon: Type },
  { id: "selection", name: "Selection", hint: "S", Icon: MousePointer2 },
  { id: "line", name: "Line", hint: "L", Icon: Slash },
  { id: "rectangle", name: "Rectangle", hint: "R", Icon: Square },
  {
    id: "filled-rectangle",
    name: "Filled rectangle",
    hint: "",
    Icon: RectangleHorizontal,
  },
  { id: "ellipse", name: "Ellipse", hint: "O", Icon: Circle },
  { id: "fill", name: "Fill bucket", hint: "F", Icon: PaintBucket },
  { id: "eyedropper", name: "Eyedropper", hint: "I", Icon: Pipette },
  { id: "move", name: "Move", hint: "M", Icon: Move },
  { id: "hand", name: "Hand", hint: "H", Icon: Hand },
  { id: "stamp", name: "Stamp", hint: "B", Icon: Stamp },
];
export default function Editor() {
  const e = useEditor();
  const router = useRouter();
  const [library, setLibrary] = useState(true),
    [inspector, setInspector] = useState(true),
    [wide, setWide] = useState(false),
    [find, setFind] = useState(""),
    [replacement, setReplacement] = useState("");
  const d = e.doc;
  const linkedFrame = d ? frameEditFor(d.id) : null;
  const fullscreen = () =>
    e.run(async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {
        setWide((v) => !v);
        e.notify("Browser fullscreen unavailable. Workspace maximized.");
      }
    });
  if (!e.ready)
    return (
      <main className="editor-loading">
        <Braces />
        <h1>Opening your workspace…</h1>
        <p>Checking local drafts and loading your characters.</p>
      </main>
    );
  if (e.resume)
    return (
      <main className="editor-loading">
        <Link prefetch={false} href="/" className="wordmark">
          <Braces />
          AsciiMorph
        </Link>
        <h1>Pick up where you left off.</h1>
        <p>
          {e.resume.name} · {e.resume.width} × {e.resume.height}
        </p>
        <button className="button primary" onClick={() => e.open(e.resume!)}>
          Resume latest
        </button>
        <button
          className="button quiet"
          onClick={() => e.open(createDocument())}
        >
          Start blank
        </button>
        <p className="muted">
          Starting blank keeps previous projects in local storage.
        </p>
      </main>
    );
  if (!d || !e.visibleDoc) return null;
  return (
    <main className={`editor ${wide ? "editor-maximized" : ""}`}>
      <a className="skip-link" href="#drawing-area">
        Skip to canvas
      </a>
      <header className="editor-header">
        <Link prefetch={false} href="/" className="wordmark" aria-label="AsciiMorph home">
          <Braces size={23} />
          <span>AsciiMorph</span>
        </Link>
        <div className="project-title">
          <span className="muted">Project</span>
          <input
            key={`${d.id}-name`}
            aria-label="Project name"
            defaultValue={d.name}
            maxLength={120}
            onBlur={(ev) =>
              e.run(() =>
                e.commit(validateDocument({ ...d, name: ev.target.value })),
              )
            }
          />
        </div>
        <div className="editor-file-actions">
          {linkedFrame && (
            <>
              <button
                onClick={() =>
                  e.run(async () => {
                    await updateAnimationFrame(d);
                    e.notify(
                      `Updated animation frame ${linkedFrame.index + 1}.`,
                    );
                  })
                }
              >
                Update animation frame
              </button>
              <button
                onClick={() =>
                  e.run(async () => {
                    await saveActiveDraft();
                    router.push("/animate");
                  })
                }
              >
                Back to animation
              </button>
            </>
          )}
          <button
            aria-label="Creative tools"
            onClick={() =>
              e.run(async () => {
                await saveActiveDraft();
                router.push("/create");
              })
            }
          >
            Create
          </button>
          <button
            aria-label="Animate artwork"
            onClick={() =>
              e.run(async () => {
                await saveActiveDraft();
                await openAnimation([{ doc: d, duration: 100 }]);
                router.push("/animate");
              })
            }
          >
            Animate
          </button>
          <button
            className="convert-image-action"
            aria-label="Convert image"
            title="Convert image"
            onClick={() =>
              e.run(async () => {
                await saveActiveDraft();
                router.push("/convert");
              })
            }
          >
            <ImageIcon size={17} />
            <span>Convert</span>
          </button>
          <button
            aria-label="Undo"
            title="Undo (⌘/Ctrl Z)"
            disabled={!e.state.past.length}
            onClick={() => {
              e.cancel();
              e.state.undo();
            }}
          >
            <Undo2 size={17} />
          </button>
          <button
            aria-label="Redo"
            title="Redo (⌘/Ctrl Shift Z)"
            disabled={!e.state.future.length}
            onClick={() => {
              e.cancel();
              e.state.redo();
            }}
          >
            <Redo2 size={17} />
          </button>
          <span className="toolbar-divider" />
          <button onClick={() => e.run(e.save)} aria-label="Save">
            <Save size={16} />
            <span>Save</span>
          </button>
          <label
            className="file-upload"
            tabIndex={0}
            role="button"
            aria-label="Import"
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                ev.currentTarget.querySelector("input")?.click();
              }
            }}
          >
            <Upload size={16} />
            <span>Import</span>
            <input
              type="file"
              accept=".txt,.json,text/plain,application/json"
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                if (f) e.run(() => e.importFile(f));
                ev.target.value = "";
              }}
            />
          </label>
          <button
            className="export-button"
            aria-label="Export"
            onClick={() => e.setPanel("export")}
          >
            <Download size={16} />
            <span>Export</span>
          </button>
          <button aria-label="Settings" onClick={() => e.setPanel("canvas")}>
            <Settings2 size={17} />
          </button>
          <button
            aria-label="Keyboard shortcuts"
            onClick={() => e.setPanel("help")}
          >
            <HelpCircle size={17} />
          </button>
        </div>
      </header>
      <div className="editor-body">
        <nav className="tool-rail" aria-label="Drawing tools">
          {tools.map(({ id, name, hint, Icon }) => (
            <button
              key={id}
              aria-label={name}
              aria-pressed={e.tool === id}
              title={`${name}${hint ? ` (${hint})` : ""}`}
              onClick={() => e.setTool(id)}
            >
              <Icon size={19} />
            </button>
          ))}
        </nav>
        <aside
          className={`editor-library ${library ? "" : "collapsed"}`}
          aria-label="Character library"
        >
          <SymbolPanel e={e} />
        </aside>
        <div className="editor-center" id="drawing-area" tabIndex={-1}>
          <div className="canvas-toolbar">
            <div>
              <button
                className="icon-button desktop-panel-toggle"
                aria-label="Toggle character library"
                onClick={() => setLibrary((v) => !v)}
              >
                <PanelLeftClose size={16} />
              </button>
              <span className="active-tool">
                {tools.find((t) => t.id === e.tool)?.name}
              </span>
              <span className="muted tool-instruction">
                {e.tool === "text"
                  ? "Click a cell, then type."
                  : "Draw something a little different."}
              </span>
            </div>
            <div>
              <button
                className="icon-button"
                aria-label="Toggle grid"
                aria-pressed={e.grid}
                onClick={() => e.setGrid((v) => !v)}
              >
                <Grid2X2 size={16} />
              </button>
              <button
                className="icon-button"
                aria-label="Fullscreen"
                onClick={fullscreen}
              >
                <Maximize size={16} />
              </button>
              <button
                className="icon-button desktop-panel-toggle"
                aria-label="Toggle properties"
                onClick={() => setInspector((v) => !v)}
              >
                <PanelRightClose size={16} />
              </button>
            </div>
          </div>
          <EditorCanvas
            doc={e.visibleDoc}
            caret={e.caret}
            selection={e.selection}
            zoom={e.zoom}
            onZoom={e.zoomTo}
            grid={e.grid}
            monochrome={e.monochrome}
            viewportRef={e.viewport}
            onDown={e.onDown}
            onMove={e.onMove}
            onUp={e.onUp}
            onCancel={e.cancel}
            onKey={e.onKey}
            onError={e.notify}
          />
          <div className="canvas-bottom">
            <div className="selection-actions">
              <button onClick={() => e.run(() => e.copy())}>Copy</button>
              <button onClick={() => e.run(() => e.copy(true))}>Cut</button>
              <button onClick={() => e.run(e.pasteClipboard)}>Paste</button>
              <button onClick={() => e.setPanel("edit")}>Edit actions</button>
            </div>
            <div className="zoom-controls">
              <button
                aria-label="Zoom out"
                onClick={() => e.zoomTo(e.zoom - 0.25)}
              >
                <Minus size={14} />
              </button>
              <span>{Math.round(e.zoom * 100)}%</span>
              <button
                aria-label="Zoom in"
                onClick={() => e.zoomTo(e.zoom + 0.25)}
              >
                <Plus size={14} />
              </button>
              <button onClick={e.fit}>Fit</button>
            </div>
          </div>
        </div>
        <aside
          className={`editor-inspector ${inspector ? "" : "collapsed"}`}
          aria-label="Properties"
        >
          <ColorPanel e={e} />
          <LayerPanel e={e} />
          <div className="panel-divider" />
          <button
            className="button quiet full-width"
            onClick={() => e.setPanel("canvas")}
          >
            Canvas settings
          </button>
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
        </aside>
      </div>
      <nav className="mobile-panels" aria-label="Studio panels">
        <button onClick={() => e.setPanel("symbols")}>Symbols</button>
        <button onClick={() => e.setPanel("colors")}>Colors</button>
        <button onClick={() => e.setPanel("layers")}>Layers</button>
        <button onClick={() => e.setPanel("canvas")}>Canvas</button>
        <button onClick={() => e.setPanel("edit")}>Edit</button>
      </nav>
      <footer className="editor-status">
        <span role="status" aria-live="polite">
          {e.status}
        </span>
        <span>
          {d.width} × {d.height}
          <span className="status-extra">
            {" "}
            · Cursor {e.caret.x + 1}, {e.caret.y + 1} ·{" "}
            {e.character === " " ? "Space" : e.character}
          </span>
        </span>
        <button onClick={() => e.setPanel("text")}>Text view</button>
      </footer>
      {e.message && (
        <div className="editor-message" role="alert">
          <span>{e.message}</span>
          <button aria-label="Dismiss message" onClick={() => e.notify("")}>
            ×
          </button>
        </div>
      )}
      <PanelDialog
        open={Boolean(e.panel)}
        onOpenChange={(open) => {
          if (!open) e.setPanel("");
        }}
        title={
          {
            symbols: "Character library",
            colors: "Color & brush",
            layers: "Layers & effects",
            canvas: "Canvas settings",
            export: "Export artwork",
            edit: "Edit artwork",
            help: "Keyboard shortcuts",
            text: "Artwork text",
            recovery: "Recovery & projects",
            clipboard: "Copy artwork",
            paste: "Paste text",
            switch: "Keep your current work",
          }[e.panel] || "Studio"
        }
      >
        {e.message && <p role="alert" className="workspace-error">{e.message}</p>}
        {e.panel === "symbols" && <SymbolPanel e={e} />}{" "}
        {e.panel === "colors" && <ColorPanel e={e} />}{" "}
        {e.panel === "canvas" && <CanvasPanel e={e} />}
        {e.panel === "layers" && <LayerPanel e={e} />}
        {e.panel === "export" && (
          <>
            <p className="muted">
              Export the current artwork without grid lines or selection guides.
            </p>
            <div className="export-options">
              {(["txt", "png", "svg", "webp", "html", "json"] as const).map(
                (format) => (
                  <button
                    key={format}
                    className="button quiet"
                    aria-label={`Download ${format === "json" ? "project JSON" : format.toUpperCase()}`}
                    onClick={() => e.run(() => e.exportFile(format))}
                  >
                    <Download size={16} />
                    {format === "json"
                      ? "Editable project"
                      : format.toUpperCase()}
                  </button>
                ),
              )}
            </div>
            <button
              className="button quiet"
              onClick={() => e.run(() => e.copy())}
            >
              Copy ASCII to clipboard
            </button>
            <p className="muted">
              TXT contains characters only. JSON preserves every editable cell.
              PNG and WebP support transparency.
            </p>
          </>
        )}
        {e.panel === "edit" && (
          <>
            <div className="edit-grid">
              {[
                ["duplicate", "Duplicate"],
                ["horizontal", "Flip horizontally"],
                ["vertical", "Flip vertically"],
                ["rotate", "Rotate clockwise"],
                ["recolor", "Recolor"],
                ["delete", "Delete selected cells"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className="button quiet"
                  onClick={() => e.selectionAction(id)}
                >
                  {label}
                </button>
              ))}
              <button
                className="button quiet"
                onClick={() =>
                  e.setSelection({
                    x: 0,
                    y: 0,
                    width: d.width,
                    height: d.height,
                  })
                }
              >
                Select all
              </button>
              <button
                className="button quiet"
                onClick={() => {
                  e.setSelection(null);
                }}
              >
                Deselect
              </button>
            </div>
            <form
              className="replace-form"
              onSubmit={(ev) => {
                ev.preventDefault();
                e.run(() => e.replace(find, replacement));
              }}
            >
              <label className="field">
                Find character
                <input
                  value={find}
                  onChange={(ev) => setFind(ev.target.value)}
                  required
                />
              </label>
              <label className="field">
                Replace with
                <input
                  value={replacement}
                  onChange={(ev) => setReplacement(ev.target.value)}
                  required
                />
              </label>
              <button className="button quiet">Replace all</button>
            </form>
            <button
              className="button quiet"
              onClick={() => {
                e.resize(d.width, d.height, false);
              }}
            >
              Clear canvas
            </button>
            <button
              className="button quiet"
              onClick={() => e.run(() => e.switchDoc(createDocument()))}
            >
              New blank project
            </button>
          </>
        )}
        {e.panel === "help" && (
          <>
            <p>
              Focus the canvas to use shortcuts. Input fields keep their usual
              behavior.
            </p>
            <dl className="shortcut-list">
              <dt>⌘ / Ctrl Z · Shift Z</dt>
              <dd>Undo · Redo</dd>
              <dt>⌘ / Ctrl A, C, X, V, S</dt>
              <dd>Select all, copy, cut, paste, save</dd>
              <dt>P E T S L R O F I M H B</dt>
              <dd>
                Pencil, eraser, text, selection, line, rectangle, ellipse, fill,
                eyedropper, move, hand, stamp
              </dd>
              <dt>Arrow keys</dt>
              <dd>Move cursor; in Move mode move selection</dd>
              <dt>Alt + arrows · Space + drag</dt>
              <dd>Pan canvas</dd>
              <dt>+ / − · 0</dt>
              <dd>Zoom · Fit to view</dd>
              <dt>Escape</dt>
              <dd>Cancel drawing preview or selection</dd>
            </dl>
          </>
        )}
        {(e.panel === "text" || e.panel === "clipboard") && (
          <>
            <p className="muted">
              Select and copy this text if your browser blocks clipboard access.
            </p>
            <textarea
              className="text-view"
              aria-label="ASCII text output"
              value={e.panel === "text" ? e.text : e.clipboardText}
              readOnly
              onFocus={(ev) => ev.target.select()}
            />
          </>
        )}
        {e.panel === "paste" && (
          <>
            <label className="field">
              ASCII text to paste
              <textarea
                className="text-view"
                value={e.clipboardText}
                onChange={(ev) => e.setClipboardText(ev.target.value)}
              />
            </label>
            <button
              className="button primary"
              onClick={() =>
                e.run(() => {
                  e.pasteText(e.clipboardText);
                  e.setPanel("");
                })
              }
            >
              Paste into canvas
            </button>
          </>
        )}
        {e.panel === "recovery" && (
          <>
            <p className="muted">
              The last ten saved revisions are kept for this project. Restoring
              creates a separate project.
            </p>
            {e.snapshots.map((s) => (
              <button
                key={s.id}
                className="button quiet full-width"
                onClick={() =>
                  e.run(async () => {
                    if (await e.recover(s.id)) e.setPanel("");
                  })
                }
              >
                Restore {new Date(s.savedAt).toLocaleString()}
              </button>
            ))}
            <button
              className="button quiet full-width"
              onClick={() => e.run(e.downloadRecovery)}
            >
              Download all saved project data
            </button>
            <button
              className="button quiet full-width"
              onClick={() =>
                e.run(async () => {
                  const { listProjects } = await import("@/editor/persistence");
                  const projects = await listProjects();
                  e.setPanel("");
                  const other = projects.find((p) => p.id !== d.id);
                  if (other) await e.switchDoc(other);
                  else
                    e.notify(
                      "No other saved projects. Your current artwork remains open.",
                    );
                })
              }
            >
              Open another saved project
            </button>
          </>
        )}
        {e.panel === "switch" && (
          <>
            <p>
              Your current project could not be saved. Download it before
              opening another project.
            </p>
            <button
              className="button primary"
              onClick={() => e.run(() => e.exportFile("json"))}
            >
              Download current project
            </button>
            <button
              className="button quiet"
              onClick={() => {
                if (e.pendingDoc) e.open(e.pendingDoc);
                e.setPendingDoc(null);
                e.setPanel("");
              }}
            >
              Continue without local save
            </button>
          </>
        )}
      </PanelDialog>
    </main>
  );
}
