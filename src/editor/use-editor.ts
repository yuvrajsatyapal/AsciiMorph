"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "zustand";
import { workspace } from "./store";
import { registerNavigationGuard } from "@/workspace/navigation";
import { saveActiveDraft } from "@/converter/handoff";
import { usePersistentState } from "@/workspace/preferences";
import {
  createDocument,
  graphemes,
  parseDocument,
  type AsciiDocument,
  type Cell,
} from "@/core/document";
import {
  draw,
  fill,
  putText,
  textDocument,
  resizeDocument,
  findReplace,
} from "@/core/grid";
import {
  capture,
  paste,
  cut,
  transform,
  move,
  recolor,
  type Clipboard,
} from "@/core/selection";
import { documentText } from "@/core/render";
import { exportDocument, downloadBlob } from "@/core/exports";
import {
  saveProject,
  listProjects,
  getSnapshots,
  restoreSnapshot,
  recoveryDownload,
  type Snapshot,
} from "./persistence";
import {
  cellAt,
  selectionBetween,
  acceptsShortcut,
  stampAt,
  type Point,
  type Rect,
} from "./interaction";
import {
  STAMPS,
  readPreferences,
  storePreferences,
  defaultPreferences,
  type Preferences,
} from "./palettes";
import { orbitArt } from "@/components/home";
import type { PointerEvent as Pointer, KeyboardEvent as KeyEvent } from "react";
export const toolNames = [
  "pencil",
  "eraser",
  "text",
  "selection",
  "line",
  "rectangle",
  "filled-rectangle",
  "ellipse",
  "fill",
  "eyedropper",
  "move",
  "hand",
  "stamp",
] as const;
export type Tool = (typeof toolNames)[number];
type Gesture = {
  start: Point;
  last: Point;
  base: AsciiDocument;
  preview: AsciiDocument;
  pan?: { x: number; y: number; left: number; top: number };
};
export function useEditor() {
  const state = useStore(workspace);
  const doc = state.activeId ? state.documents[state.activeId] : null;
  const [ready, setReady] = useState(false),
    [resume, setResume] = useState<AsciiDocument | null>(null),
    [tool, setToolState] = usePersistentState<Tool>("editor-tool", "pencil"),
    [character, setCharacter] = usePersistentState("editor-character", "#"),
    [fg, setFgState] = usePersistentState("editor-foreground", "#E9B86E"),
    [bg, setBg] = usePersistentState<string | null>("editor-background", null),
    [brush, setBrush] = usePersistentState("editor-brush", 1),
    [resetEraser, setResetEraser] = useState(true),
    [stamp, setStamp] = useState("Star"),
    [selection, setSelection] = useState<Rect | null>(null),
    [caret, setCaret] = useState<Point>({ x: 0, y: 0 }),
    [zoom, setZoom] = usePersistentState("editor-zoom", 1),
    [grid, setGrid] = usePersistentState("editor-grid", true),
    [monochrome, setMonochrome] = usePersistentState(
      "editor-monochrome",
      false,
    ),
    [preview, setPreview] = useState<AsciiDocument | null>(null),
    [status, setStatus] = useState("Not saved"),
    [message, setMessage] = useState(""),
    [panel, setPanel] = useState(""),
    [clipboardText, setClipboardText] = useState(""),
    [pendingDoc, setPendingDoc] = useState<AsciiDocument | null>(null),
    [snapshots, setSnapshots] = useState<Snapshot[]>([]),
    [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const viewport = useRef<HTMLDivElement>(null),
    gesture = useRef<Gesture | null>(null),
    clipboard = useRef<Clipboard | null>(null),
    copiedText = useRef(""),
    typing = useRef(0),
    spaceHand = useRef(false),
    saved = useRef<AsciiDocument | null>(null);
  useEffect(() => registerNavigationGuard(saveActiveDraft), []);
  const notify = useCallback((text: string) => setMessage(text), []);
  const current = () => {
    const s = workspace.getState();
    return s.activeId ? s.documents[s.activeId] : null;
  };
  const commit = (next: AsciiDocument, group = false) => {
    workspace.getState().commit(next, group);
  };
  const open = (next: AsciiDocument) => {
    workspace.getState().open(next);
    setPreview(null);
    setSelection(null);
    setCaret({ x: 0, y: 0 });
    setResume(null);
    typing.current = 0;
  };
  useEffect(() => {
    let active = true;
    setPreferences(readPreferences());
    async function init() {
      try {
        const query = new URLSearchParams(window.location.search);
        if (query.get("demo") === "orbit") {
          const c = graphemes(query.get("char") || "◆")[0] || "◆";
          const color = /^[0-9A-F]{6}$/i.test(query.get("color") || "")
            ? `#${query.get("color")}`
            : "#E9B86E";
          const next = textDocument(orbitArt(c), "Orbit");
          next.layers[0].cells = next.layers[0].cells.map((cell) => ({
            ...cell,
            fg: color,
          }));
          if (active) open(next);
        } else if (workspace.getState().activeId) {
          if (active) setResume(null);
        } else {
          const projects = await listProjects();
          if (active) {
            if (projects[0]) setResume(projects[0]);
            else open(createDocument());
          }
        }
      } catch (error) {
        if (active) {
          setMessage(
            `Recovery: ${error instanceof Error ? error.message : "Browser storage is unavailable"}. Your existing data has not been replaced.`,
          );
          open(createDocument());
        }
      } finally {
        if (active) setReady(true);
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!ready || !doc || resume) return;
    setStatus("Unsaved changes");
    const timer = setTimeout(() => {
      setStatus("Saving…");
      void saveProject(doc)
        .then(() => {
          saved.current = doc;
          if (current() === doc) setStatus("Saved locally");
        })
        .catch((error) => {
          setStatus("Not saved — storage unavailable");
          setMessage(
            error instanceof Error
              ? error.message
              : "Local save failed. Export a project file to keep your work.",
          );
        });
    }, 650);
    return () => clearTimeout(timer);
  }, [doc, ready, resume]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (doc && saved.current !== doc) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [doc]);
  const save = async () => {
    const d = current();
    if (!d) return;
    setStatus("Saving…");
    try {
      await saveProject(d);
      saved.current = d;
      setStatus("Saved locally");
    } catch (error) {
      setStatus("Not saved — storage unavailable");
      throw error;
    }
  };
  const run = (work: () => unknown | Promise<unknown>) => {
    try {
      void Promise.resolve(work()).catch((error) =>
        setMessage(error instanceof Error ? error.message : String(error)),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const switchDoc = async (next: AsciiDocument) => {
    try {
      if (doc) await save();
      open(next);
      return true;
    } catch {
      setPendingDoc(next);
      setPanel("switch");
      return false;
    }
  };
  const prefs = (next: Preferences) => {
    setPreferences(next);
    try {
      storePreferences(next);
    } catch {
      setMessage(
        "Preferences could not be saved. Artwork editing and export still work.",
      );
    }
  };
  const setFg = (color: string) => {
    setFgState(color);
    prefs({
      ...preferences,
      recent: [color, ...preferences.recent.filter((c) => c !== color)].slice(
        0,
        12,
      ),
    });
  };
  const setTool = (next: Tool) => {
    gesture.current = null;
    setPreview(null);
    typing.current = 0;
    setToolState(next);
  };
  const cell: Cell = { char: character, fg, bg, alpha: 1 };
  const position = (e: Pointer<HTMLDivElement>) =>
    cellAt(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), doc!);
  const onDown = (e: Pointer<HTMLDivElement>) => {
    if (!doc || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = position(e);
    setCaret(p);
    typing.current = 0;
    const g: Gesture = { start: p, last: p, base: doc, preview: doc };
    gesture.current = g;
    if (tool === "hand" || spaceHand.current) {
      const v = viewport.current;
      if (v)
        g.pan = {
          x: e.clientX,
          y: e.clientY,
          left: v.scrollLeft,
          top: v.scrollTop,
        };
      return;
    }
    if (tool === "eyedropper") {
      const sampled =
        doc.layers
          .filter((l) => l.visible)
          .reverse()
          .find(
            (l) =>
              l.cells[p.y * doc.width + p.x].char !== " " ||
              l.cells[p.y * doc.width + p.x].bg,
          )?.cells[p.y * doc.width + p.x] ||
        doc.layers[0].cells[p.y * doc.width + p.x];
      setCharacter(sampled.char);
      setFgState(sampled.fg);
      setBg(sampled.bg);
      return;
    }
    if (tool === "fill") {
      g.preview = fill(doc, p, cell);
      setPreview(g.preview);
      return;
    }
    if (tool === "stamp") {
      g.preview = stampAt(doc, p, STAMPS[stamp], cell);
      setPreview(g.preview);
      return;
    }
    if (tool === "selection") {
      setSelection(selectionBetween(p, p));
      return;
    }
    if (tool === "pencil" || tool === "eraser") {
      g.preview = draw(doc, tool, p, p, cell, brush, resetEraser);
      setPreview(g.preview);
    }
  };
  const onMove = (e: Pointer<HTMLDivElement>) => {
    if (!doc) return;
    const p = position(e);
    const g = gesture.current;
    if (!g) {
      return;
    }
    if (g.pan) {
      const v = viewport.current;
      if (v) {
        v.scrollLeft = g.pan.left - (e.clientX - g.pan.x);
        v.scrollTop = g.pan.top - (e.clientY - g.pan.y);
      }
      return;
    }
    setCaret(p);
    if (tool === "selection") {
      setSelection(selectionBetween(g.start, p));
    } else if (tool === "move" && selection) {
      g.preview = move(g.base, selection, {
        x: Math.max(
          0,
          Math.min(doc.width - selection.width, selection.x + p.x - g.start.x),
        ),
        y: Math.max(
          0,
          Math.min(
            doc.height - selection.height,
            selection.y + p.y - g.start.y,
          ),
        ),
      });
      setPreview(g.preview);
    } else if (tool === "pencil" || tool === "eraser") {
      g.preview = draw(g.preview, tool, g.last, p, cell, brush, resetEraser);
      setPreview(g.preview);
    } else if (
      ["line", "rectangle", "filled-rectangle", "ellipse"].includes(tool)
    ) {
      g.preview = draw(
        g.base,
        tool as "line",
        g.start,
        p,
        cell,
        1,
        resetEraser,
      );
      setPreview(g.preview);
    }
    g.last = p;
  };
  const onUp = (e: Pointer<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    if (!g.pan) {
      if (
        ["line", "rectangle", "filled-rectangle", "ellipse"].includes(tool) &&
        g.preview === g.base
      )
        g.preview = draw(
          g.base,
          tool as "line",
          g.start,
          position(e),
          cell,
          1,
          resetEraser,
        );
      if (g.preview !== g.base) commit(g.preview);
      if (tool === "move" && selection)
        setSelection({
          ...selection,
          x: Math.max(
            0,
            Math.min(
              doc!.width - selection.width,
              selection.x + g.last.x - g.start.x,
            ),
          ),
          y: Math.max(
            0,
            Math.min(
              doc!.height - selection.height,
              selection.y + g.last.y - g.start.y,
            ),
          ),
        });
    }
    gesture.current = null;
    setPreview(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const cancel = () => {
    gesture.current = null;
    setPreview(null);
    spaceHand.current = false;
  };
  const copy = async (cutting = false) => {
    if (!doc) return;
    const r = selection || { x: 0, y: 0, width: doc.width, height: doc.height };
    clipboard.current = capture(doc, r);
    const c = clipboard.current;
    const text = Array.from({ length: c.height }, (_, y) =>
      c.cells
        .slice(y * c.width, (y + 1) * c.width)
        .map((cell) => cell.char)
        .join(""),
    ).join("\n");
    copiedText.current = text;
    setClipboardText(text);
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied artwork.");
    } catch {
      setPanel("clipboard");
    }
    if (cutting) commit(cut(doc, r));
  };
  const pasteText = (text: string) => {
    if (!doc) return;
    const source = textDocument(text);
    commit(
      paste(
        doc,
        capture(source, {
          x: 0,
          y: 0,
          width: source.width,
          height: source.height,
        }),
        selection || caret,
      ),
    );
  };
  const pasteClipboard = async () => {
    if (!doc) return;
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      if (!clipboard.current) {
        setClipboardText("");
        setPanel("paste");
        return;
      }
    }
    if (clipboard.current && (!text || text === copiedText.current))
      commit(paste(doc, clipboard.current, selection || caret));
    else pasteText(text);
  };
  const selectionAction = (action: string) => {
    if (!doc) return;
    const r = selection || { x: 0, y: 0, width: doc.width, height: doc.height };
    if (action === "delete") commit(cut(doc, r));
    else if (action === "recolor") commit(recolor(doc, r, fg, bg));
    else if (action === "duplicate") {
      const c = capture(doc, r);
      commit(
        paste(doc, c, {
          x: Math.min(doc.width - 1, r.x + 1),
          y: Math.min(doc.height - 1, r.y + 1),
        }),
      );
    } else {
      const c = transform(
        capture(doc, r),
        action as "horizontal" | "vertical" | "rotate",
      );
      commit(paste(cut(doc, r), c, r));
      setSelection({
        ...r,
        width: Math.min(c.width, doc.width - r.x),
        height: Math.min(c.height, doc.height - r.y),
      });
    }
  };
  const zoomTo = (value: number) => setZoom(Math.max(0.25, Math.min(4, value)));
  const fit = () => {
    const v = viewport.current;
    if (doc && v)
      zoomTo(
        Math.min(
          (v.clientWidth - 90) / (doc.width * doc.cellWidth),
          (v.clientHeight - 100) / (doc.height * doc.cellHeight),
        ),
      );
  };
  const onKey = (e: KeyEvent<HTMLDivElement>) => {
    if (!doc || !acceptsShortcut(e.target)) return;
    const key = e.key.toLowerCase(),
      mod = e.ctrlKey || e.metaKey;
    if (mod) {
      const commands: Record<string, () => void> = {
        z: () => (e.shiftKey ? state.redo() : state.undo()),
        y: () => state.redo(),
        s: () => run(save),
        a: () =>
          setSelection({ x: 0, y: 0, width: doc.width, height: doc.height }),
        c: () => run(() => copy()),
        x: () => run(() => copy(true)),
        v: () => run(pasteClipboard),
      };
      if (commands[key]) {
        e.preventDefault();
        typing.current = 0;
        commands[key]();
      }
      return;
    }
    if (key === "escape") {
      e.preventDefault();
      cancel();
      setSelection(null);
      if (tool === "text") setTool("pencil");
      return;
    }
    if (key === "tab") return;
    if (key === "?" && tool !== "text") {
      e.preventDefault();
      setPanel("help");
      return;
    }
    const directions: Record<string, Point> = {
      arrowleft: { x: -1, y: 0 },
      arrowright: { x: 1, y: 0 },
      arrowup: { x: 0, y: -1 },
      arrowdown: { x: 0, y: 1 },
    };
    if (directions[key]) {
      e.preventDefault();
      typing.current = 0;
      const v = directions[key];
      if (e.altKey) {
        viewport.current?.scrollBy({ left: v.x * 60, top: v.y * 60 });
      } else if (tool === "move" && selection) {
        const p = {
          x: Math.max(
            0,
            Math.min(doc.width - selection.width, selection.x + v.x),
          ),
          y: Math.max(
            0,
            Math.min(doc.height - selection.height, selection.y + v.y),
          ),
        };
        commit(move(doc, selection, p));
        setSelection({ ...selection, ...p });
      } else
        setCaret((p) => ({
          x: Math.max(0, Math.min(doc.width - 1, p.x + v.x)),
          y: Math.max(0, Math.min(doc.height - 1, p.y + v.y)),
        }));
      return;
    }
    if (tool === "text") {
      e.preventDefault();
      if (key === "enter") {
        setCaret((p) => ({ x: 0, y: Math.min(doc.height - 1, p.y + 1) }));
        typing.current = 0;
      } else if (key === "backspace" || key === "delete") {
        const x = key === "backspace" ? Math.max(0, caret.x - 1) : caret.x;
        commit(
          draw(
            doc,
            "eraser",
            { x, y: caret.y },
            { x, y: caret.y },
            cell,
            1,
            true,
          ),
        );
        setCaret({ x, y: caret.y });
        typing.current = 0;
      } else if (key === "tab") {
        setCaret((p) => ({
          ...p,
          x: Math.min(doc.width - 1, (Math.floor(p.x / 4) + 1) * 4),
        }));
        typing.current = 0;
      } else if (graphemes(e.key).length === 1) {
        const now = Date.now();
        commit(putText(doc, caret, e.key, cell), now - typing.current < 900);
        typing.current = now;
        setCaret((p) =>
          p.x + 1 < doc.width
            ? { x: p.x + 1, y: p.y }
            : { x: 0, y: Math.min(doc.height - 1, p.y + 1) },
        );
      }
      return;
    }
    const shortcuts: Record<string, Tool> = {
      p: "pencil",
      e: "eraser",
      t: "text",
      s: "selection",
      l: "line",
      r: "rectangle",
      f: "fill",
      i: "eyedropper",
      m: "move",
      h: "hand",
      b: "stamp",
      o: "ellipse",
    };
    if (shortcuts[key]) {
      e.preventDefault();
      setTool(shortcuts[key]);
    } else if (key === "delete" || key === "backspace") {
      e.preventDefault();
      selectionAction("delete");
    } else if (key === " ") {
      e.preventDefault();
      spaceHand.current = true;
    } else if (key === "+" || key === "=") {
      e.preventDefault();
      zoomTo(zoom + 0.25);
    } else if (key === "-") {
      e.preventDefault();
      zoomTo(zoom - 0.25);
    } else if (key === "0") {
      e.preventDefault();
      fit();
    }
  };
  useEffect(() => {
    const up = () => {
      spaceHand.current = false;
    };
    window.addEventListener("keyup", up);
    return () => window.removeEventListener("keyup", up);
  }, []);
  const exportFile = async (
    format: "txt" | "png" | "svg" | "webp" | "html" | "json",
  ) => {
    if (!doc) return;
    const blob = await exportDocument(doc, format, monochrome);
    downloadBlob(
      blob,
      `${doc.name.replace(/[^a-z0-9_-]/gi, "_")}${format === "json" ? ".asciimorph" : ""}.${format}`,
    );
    setMessage(`Exported ${format.toUpperCase()}.`);
  };
  const importFile = async (file: File) => {
    if (file.size > 40_000_000)
      throw new Error("File is too large. Maximum import is 40 MB.");
    setMessage("Reading and validating import…");
    const text = await file.text();
    const next = file.name.endsWith(".json")
      ? parseDocument(text)
      : textDocument(text, file.name.replace(/\.[^.]+$/, ""));
    next.id = crypto.randomUUID();
    next.createdAt = new Date().toISOString();
    next.updatedAt = next.createdAt;
    await switchDoc(next);
    setMessage("Imported as a new project.");
  };
  return {
    doc,
    visibleDoc: preview || doc,
    ready,
    resume,
    setResume,
    open,
    switchDoc,
    tool,
    setTool,
    character,
    setCharacter,
    fg,
    setFg,
    bg,
    setBg,
    brush,
    setBrush,
    resetEraser,
    setResetEraser,
    stamp,
    setStamp,
    selection,
    setSelection,
    caret,
    zoom,
    zoomTo,
    fit,
    grid,
    setGrid,
    monochrome,
    setMonochrome,
    status,
    message,
    notify,
    panel,
    setPanel,
    viewport,
    onDown,
    onMove,
    onUp,
    cancel,
    onKey,
    commit,
    run,
    save,
    copy,
    pasteClipboard,
    pasteText,
    selectionAction,
    clipboardText,
    setClipboardText,
    preferences,
    prefs,
    state,
    exportFile,
    importFile,
    pendingDoc,
    setPendingDoc,
    snapshots,
    loadSnapshots: async () => {
      if (doc) setSnapshots(await getSnapshots(doc.id));
    },
    recover: async (id: string) => switchDoc(await restoreSnapshot(id)),
    downloadRecovery: async () =>
      downloadBlob(
        new Blob([await recoveryDownload()], { type: "application/json" }),
        "asciimorph-recovery.json",
      ),
    resize: (w: number, h: number, preserve: boolean) => {
      if (doc) {
        commit(resizeDocument(doc, w, h, preserve));
        setSelection(null);
        setCaret({ x: 0, y: 0 });
      }
    },
    replace: (a: string, b: string) => {
      if (doc) {
        if (graphemes(a).length !== 1 || graphemes(b).length !== 1)
          throw new Error("Find and replacement must each be one character.");
        commit(findReplace(doc, a, b));
      }
    },
    text: doc ? documentText(doc) : "",
  };
}
export type EditorController = ReturnType<typeof useEditor>;
