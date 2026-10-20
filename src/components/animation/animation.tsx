"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createDocument } from "@/core/document";
import {
  ensureArtworkFont,
  paint,
  previewPixelRatio,
  documentText,
} from "@/core/render";
import { downloadBlob } from "@/core/exports";
import { workspace } from "@/editor/store";
import { editAnimationFrame } from "@/animation/handoff";
import {
  createAnimation,
  frameAt,
  parseAnimation,
  serializeAnimation,
  validateAnimation,
  validateAnimationChange,
  type AnimationProject,
  type AnimationFrame,
} from "@/animation/project";
import {
  loadAnimation,
  saveAnimation,
  listAnimations,
  type AnimationSummary,
} from "@/animation/persistence";
import { consumeAnimation } from "@/animation/handoff";
import {
  exportAnimation,
  type MotionExportOptions,
} from "@/creative/recording";
import {
  AnimationHistory,
  deleteFrames,
  duplicateFrames,
  reorderFrames,
  selectRange,
  drawFrameCells,
} from "@/animation/editing";
import { registerNavigationGuard } from "@/workspace/navigation";
import { usePersistentState } from "@/workspace/preferences";
import { ExportSettings } from "./export-settings";
import { MediaImport } from "@/components/creative/media-import";
import "./animation.css";
export default function Animation() {
  const router = useRouter();
  const [project, setProject] = useState<AnimationProject | null>(null),
    [selected, setSelected] = useState(0),
    [playing, setPlaying] = useState(false),
    [onion, setOnion] = usePersistentState("animation-onion", true),
    [selection, setSelection] = useState<number[]>([0]),
    [drawing, setDrawing] = usePersistentState("animation-drawing", false),
    [brush, setBrush] = usePersistentState("animation-brush", {
      char: "@",
      fg: "#e9b86e",
      erase: false,
    }),
    [exportOptions, setExportOptions] = usePersistentState<MotionExportOptions>(
      "motion-export",
      {},
    ),
    [, refreshHistory] = useState(0),
    [message, setMessage] = useState(""),
    [status, setStatus] = useState(""),
    [exporting, setExporting] = useState(false),
    [recovery, setRecovery] = useState(false),
    [soundtrack, setSoundtrack] = useState<File | null>(null),
    [projects, setProjects] = useState<AnimationSummary[]>([]);
  const history = useRef(new AnimationHistory()),
    stroke = useRef<{
      base: AnimationProject;
      points: { x: number; y: number }[];
      last: { x: number; y: number } | null;
    } | null>(null),
    dragged = useRef<number[]>([]),
    anchor = useRef(0),
    canvas = useRef<HTMLCanvasElement>(null),
    previous = useRef<HTMLCanvasElement>(null),
    next = useRef<HTMLCanvasElement>(null),
    abort = useRef<AbortController | null>(null),
    saved = useRef<AnimationProject | null>(null);
  const run = useCallback((work: () => unknown | Promise<unknown>) => {
    try {
      void Promise.resolve(work()).catch((e) =>
        setMessage(e instanceof Error ? e.message : String(e)),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    let active = true;
    run(async () => {
      const handed = consumeAnimation();
      try {
        const restored = handed || (await loadAnimation());
        if (active) setProject(restored || createAnimation());
      } catch (e) {
        if (active) {
          setRecovery(true);
          setProject(createAnimation());
          setMessage(
            `Recovery: ${e instanceof Error ? e.message : "Storage unavailable"}. Existing data has not been overwritten.`,
          );
        }
      }
    });
    return () => {
      active = false;
      abort.current?.abort();
    };
  }, [run]);
  useEffect(() => {
    if (!project || recovery) return;
    setStatus("Unsaved changes");
    const timer = setTimeout(() => {
      void saveAnimation(project)
        .then(() => {
          saved.current = project;
          setStatus("Saved locally");
        })
        .catch((e) => {
          setStatus("Not saved — download JSON to keep your animation");
          setMessage(e instanceof Error ? e.message : String(e));
        });
    }, 650);
    return () => clearTimeout(timer);
  }, [project, recovery]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (project && saved.current !== project) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [project]);
  useEffect(() => {
    if (!playing || !project) return;
    let timer: number;
    const offset = project.frames
        .slice(0, selected)
        .reduce((sum, f) => sum + f.duration, 0),
      start = performance.now();
    const tick = () => {
      setSelected(frameAt(project, performance.now() - start + offset));
      timer = requestAnimationFrame(tick);
    };
    timer = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(timer); // selected is deliberately captured at playback start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, project]);
  useEffect(() => {
    if (status !== "Saved locally") return;
    let active = true;
    void listAnimations()
      .then((rows) => {
        if (active) setProjects(rows);
      })
      .catch((error) => {
        if (active) setMessage(String(error));
      });
    return () => {
      active = false;
    };
  }, [status]);
  const frameTexts = useMemo(
    () => project?.frames.map((item) => documentText(item.doc)) || [],
    [project],
  );
  const frame = project?.frames[selected];
  useEffect(() => {
    let active = true;
    if (!project || !frame) return;
    run(async () => {
      await ensureArtworkFont(frame.doc.fontSize);
      if (!active) return;
      const docs = [
          frame.doc,
          project.frames[selected - 1]?.doc,
          project.frames[selected + 1]?.doc,
        ],
        surfaces = [canvas.current, previous.current, next.current];
      surfaces.forEach((surface, i) => {
        const d = docs[i];
        if (surface && d)
          paint(surface, d, {
            pixelRatio: previewPixelRatio(
              d.width * d.cellWidth,
              d.height * d.cellHeight,
              window.devicePixelRatio || 1,
            ),
          });
      });
    });
    return () => {
      active = false;
    };
  }, [project, selected, frame, run, onion, playing]);
  useEffect(
    () =>
      registerNavigationGuard(async () => {
        if (recovery)
          throw new Error(
            "Animation recovery needs attention before navigating.",
          );
        if (project && saved.current !== project) {
          try {
            await saveAnimation(project);
            saved.current = project;
            setStatus("Saved locally");
          } catch (error) {
            setStatus("Not saved — download JSON to keep your animation");
            throw error;
          }
        }
      }),
    [project, recovery],
  );
  const replace = (p: AnimationProject, index = selected, chosen = [index]) => {
    if (recovery) throw new Error("Start a new animation before editing.");
    const validated =
      project && project.id === p.id
        ? validateAnimationChange(project, p)
        : validateAnimation(p);
    if (project && project.id === p.id)
      history.current.commit({ project, selection, active: selected });
    else history.current.clear();
    setPlaying(false);
    setProject(validated);
    const active = Math.max(0, Math.min(index, p.frames.length - 1));
    setSelected(active);
    anchor.current = active;
    setSelection(
      chosen.filter((i) => i >= 0 && i < p.frames.length).length
        ? chosen.filter((i) => i >= 0 && i < p.frames.length)
        : [active],
    );
    refreshHistory((v) => v + 1);
  };
  const importFrames = async (frames: AnimationFrame[]) => {
    if (!frames.length) return;
    const newProject = createAnimation(frames);
    await save();
    replace(newProject, 0);
    setMessage(`Imported ${frames.length} frames.`);
  };
  const save = async () => {
    if (recovery)
      throw new Error(
        "Choose Start a new animation before replacing unavailable recovery data.",
      );
    if (project) {
      try {
        await saveAnimation(project);
        saved.current = project;
        setStatus("Saved locally");
      } catch (error) {
        setStatus("Not saved — download JSON to keep your animation");
        throw error;
      }
    }
  };
  const travel = (redo = false) => {
    if (!project || playing || exporting) return;
    const current = { project, selection, active: selected },
      snapshot = redo
        ? history.current.redo(current)
        : history.current.undo(current);
    if (snapshot) {
      setProject(snapshot.project);
      setSelected(snapshot.active);
      anchor.current = snapshot.active;
      setSelection(snapshot.selection);
      refreshHistory((v) => v + 1);
    }
  };
  const select = (index: number, range = false, toggle = false) => {
    if (range)
      setSelection(
        selectRange(anchor.current, index, project?.frames.length || 0),
      );
    else if (toggle)
      setSelection((old) =>
        old.includes(index) && old.length > 1
          ? old.filter((i) => i !== index)
          : [...new Set([...old, index])],
      );
    else setSelection([index]);
    if (!range) anchor.current = index;
    setSelected(index);
  };
  const moveSelection = (target: number, chosen = selection) => {
    if (!project) return;
    const result = reorderFrames(project, chosen, target),
      moved = chosen
        .map((i) => result.frames.indexOf(project.frames[i]))
        .sort((a, b) => a - b);
    replace(result, moved[0], moved);
  };
  const drawAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!stroke.current || !project || !frame) return;
    const rect = event.currentTarget.getBoundingClientRect(),
      aspect =
        (frame.doc.width * frame.doc.cellWidth) /
        (frame.doc.height * frame.doc.cellHeight),
      w = Math.min(rect.width, rect.height * aspect),
      h = w / aspect;
    if (!w || !h) return;
    const x = Math.floor(
        ((event.clientX - rect.left - (rect.width - w) / 2) / w) *
          frame.doc.width,
      ),
      y = Math.floor(
        ((event.clientY - rect.top - (rect.height - h) / 2) / h) *
          frame.doc.height,
      ),
      point = { x, y },
      last = stroke.current.last;
    if (x < 0 || y < 0 || x >= frame.doc.width || y >= frame.doc.height) {
      stroke.current.last = null;
      return;
    }
    if (last) {
      const steps = Math.max(Math.abs(x - last.x), Math.abs(y - last.y));
      for (let i = 1; i <= steps; i++)
        stroke.current.points.push({
          x: Math.round(last.x + ((x - last.x) * i) / steps),
          y: Math.round(last.y + ((y - last.y) * i) / steps),
        });
    } else stroke.current.points.push(point);
    stroke.current.last = point;
    setProject(
      drawFrameCells(stroke.current.base, selected, stroke.current.points, {
        char: brush.erase ? " " : brush.char,
        fg: brush.fg,
        bg: null,
      }),
    );
  };
  if (!project || !frame)
    return (
      <main className="animation-page">
        <h1>Opening animation…</h1>
      </main>
    );
  if (recovery)
    return (
      <main className="animation-page">
        <Link prefetch={false} href="/create">Back to creative tools</Link>
        <h1>Animation recovery needs attention.</h1>
        <p role="alert">{message}</p>
        <p>
          Existing storage has been preserved. You can retry recovery by
          reloading, or start a new animation.
        </p>
        <button className="button primary" onClick={() => setRecovery(false)}>
          Start a new animation
        </button>
      </main>
    );
  return (
    <main
      className="animation-page"
      tabIndex={0}
      onKeyDown={(e) => {
        if (
          (e.target as HTMLElement).closest(
            "input,textarea,select,[contenteditable=true]",
          ) ||
          playing ||
          exporting
        )
          return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          travel(e.shiftKey);
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
          e.preventDefault();
          travel(true);
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
          e.preventDefault();
          setSelection(project.frames.map((_, i) => i));
          return;
        }
        const index =
          e.key === "ArrowRight"
            ? Math.min(project.frames.length - 1, selected + 1)
            : e.key === "ArrowLeft"
              ? Math.max(0, selected - 1)
              : e.key === "Home"
                ? 0
                : e.key === "End"
                  ? project.frames.length - 1
                  : null;
        if (index !== null) {
          e.preventDefault();
          select(index, e.shiftKey);
          return;
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          run(() => replace(deleteFrames(project, selection), 0));
        }
      }}
    >
      <header>
        <Link prefetch={false} href="/" className="wordmark">
          AsciiMorph
        </Link>
        <nav>
          <Link prefetch={false} href="/create">Create</Link>
          <Link prefetch={false}
            href="/studio"
            onClick={(e) => {
              e.preventDefault();
              run(async () => {
                await save();
                router.push("/studio");
              });
            }}
          >
            Studio
          </Link>
        </nav>
      </header>
      {recovery && (
        <p role="alert">
          Local recovery could not be read.{" "}
          <button className="button quiet" onClick={() => setRecovery(false)}>
            Start a new animation
          </button>
        </p>
      )}
      <div className="animation-heading">
        <div>
          <p className="eyebrow">FRAME BY FRAME</p>
          <h1>Make your characters move.</h1>
          <p>Build a loop, adjust its rhythm, then open any frame in Studio.</p>
        </div>
        <div>
          <button className="button quiet" onClick={() => run(save)}>
            Save locally
          </button>
          <button
            className="button primary"
            onClick={() =>
              run(async () => {
                await save();
                await editAnimationFrame(project, selected);
                router.push("/studio");
              })
            }
          >
            Edit selected frame in Studio
          </button>
        </div>
      </div>
      <label className="animation-name">
        Saved animations
        <select
          aria-label="Saved animations"
          value={
            projects.some((item) => item.id === project.id) ? project.id : ""
          }
          disabled={playing || exporting}
          onChange={(event) => {
            const id = event.target.value;
            if (!id) return;
            run(async () => {
              await save();
              const selectedProject = await loadAnimation(id);
              if (!selectedProject)
                throw new Error("Saved animation could not be found.");
              replace(selectedProject, 0);
            });
          }}
        >
          <option value="" disabled>
            Choose an animation
          </option>
          {projects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.frames} frames
            </option>
          ))}
        </select>
        <button
          className="button quiet"
          onClick={() =>
            run(async () => {
              await save();
              replace(createAnimation(), 0);
            })
          }
        >
          New animation
        </button>
      </label>
      <p className="muted">
        Saved animations stay until you delete them in Projects. Download
        project JSON or back up your whole library for an independent copy.
      </p>
      <label className="animation-name">
        Animation name
        <input
          value={project.name}
          maxLength={120}
          onChange={(e) => {
            if (e.target.value.trim())
              replace(
                { ...project, name: e.target.value },
                selected,
                selection,
              );
          }}
          onBlur={() => {
            if (!project.name.trim())
              setProject({ ...project, name: "Untitled animation" });
          }}
        />
      </label>
      <div className="animation-workspace">
        <section className="animation-preview" aria-label="Animation preview">
          <div
            className="animation-canvas-stack"
            style={{
              aspectRatio: `${frame.doc.width * frame.doc.cellWidth} / ${frame.doc.height * frame.doc.cellHeight}`,
            }}
          >
            {onion && !playing && selected > 0 && (
              <canvas ref={previous} className="onion" aria-hidden="true" />
            )}
            <canvas
              ref={canvas}
              aria-label={`Frame ${selected + 1}${drawing ? ", drawing enabled" : ""}`}
              style={{
                touchAction: drawing ? "none" : "auto",
                cursor: drawing ? "crosshair" : "default",
              }}
              onPointerDown={(e) => {
                if (!drawing || playing || exporting) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                history.current.commit({
                  project,
                  selection,
                  active: selected,
                });
                stroke.current = { base: project, points: [], last: null };
                run(() => drawAt(e));
                refreshHistory((v) => v + 1);
              }}
              onPointerMove={(e) => {
                if (stroke.current) run(() => drawAt(e));
              }}
              onPointerUp={() => {
                stroke.current = null;
              }}
              onPointerCancel={() => {
                stroke.current = null;
              }}
              onLostPointerCapture={() => {
                stroke.current = null;
              }}
            />
            {onion && !playing && selected < project.frames.length - 1 && (
              <canvas
                ref={next}
                className="onion onion-next"
                aria-hidden="true"
              />
            )}
          </div>
          <div className="animation-playback">
            <button
              className="button primary"
              aria-pressed={playing}
              onClick={() => setPlaying((v) => !v)}
            >
              {playing ? "Pause" : "Play loop"}
            </button>
            <label>
              <input
                type="checkbox"
                checked={onion}
                onChange={(e) => setOnion(e.target.checked)}
              />
              Onion skin
            </label>
            <span>
              {selected + 1} / {project.frames.length} ·{" "}
              {(
                project.frames.reduce((s, f) => s + f.duration, 0) / 1000
              ).toFixed(2)}
              s
            </span>
          </div>
          <details>
            <summary>Accessible frame text</summary>
            <pre>{frameTexts[selected]}</pre>
          </details>
        </section>
        <aside className="animation-controls">
          <details open>
            <summary>Frame and export controls</summary>
            <h2>Frames</h2>
            <div className="animation-action-grid">
              <button
                disabled={playing || !history.current.canUndo}
                onClick={() => travel()}
              >
                Undo
              </button>
              <button
                disabled={playing || !history.current.canRedo}
                onClick={() => travel(true)}
              >
                Redo
              </button>
              <button
                disabled={playing}
                onClick={() => setSelection(project.frames.map((_, i) => i))}
              >
                Select all
              </button>
            </div>
            <p>
              {selection.length} selected. Shift-click for a range; Ctrl/⌘-click
              to toggle. Arrow keys navigate; Shift extends; Ctrl/⌘ Z undoes.
              Drag frames to reorder.
            </p>
            <p className="muted">
              Undo history keeps up to 40 steps within an estimated 24 MB
              budget. Large animations may have fewer undo steps.
            </p>
            <div className="animation-range">
              <label>
                Range start
                <input
                  aria-label="Frame range start"
                  type="number"
                  min="1"
                  max={project.frames.length}
                  value={Math.min(...selection) + 1}
                  onChange={(e) => {
                    const i = Math.max(
                      0,
                      Math.min(
                        project.frames.length - 1,
                        Number(e.target.value) - 1,
                      ),
                    );
                    setSelection(
                      selectRange(
                        i,
                        Math.max(...selection),
                        project.frames.length,
                      ),
                    );
                    setSelected(i);
                  }}
                />
              </label>
              <label>
                Range end
                <input
                  aria-label="Frame range end"
                  type="number"
                  min="1"
                  max={project.frames.length}
                  value={Math.max(...selection) + 1}
                  onChange={(e) =>
                    setSelection(
                      selectRange(
                        Math.min(...selection),
                        Math.max(
                          0,
                          Math.min(
                            project.frames.length - 1,
                            Number(e.target.value) - 1,
                          ),
                        ),
                        project.frames.length,
                      ),
                    )
                  }
                />
              </label>
            </div>
            <div className="animation-action-grid">
              <button
                disabled={playing}
                onClick={() =>
                  run(() => {
                    const doc = createDocument(
                      frame.doc.width,
                      frame.doc.height,
                      "Blank frame",
                    );
                    doc.cellWidth = frame.doc.cellWidth;
                    doc.cellHeight = frame.doc.cellHeight;
                    doc.fontSize = frame.doc.fontSize;
                    replace(
                      {
                        ...project,
                        frames: [
                          ...project.frames,
                          { doc, duration: frame.duration },
                        ],
                      },
                      project.frames.length,
                    );
                  })
                }
              >
                Add blank
              </button>
              <button
                disabled={playing}
                onClick={() =>
                  run(() =>
                    replace(
                      duplicateFrames(project, selection),
                      Math.max(...selection) + 1,
                      selection.map((_, i) => Math.max(...selection) + 1 + i),
                    ),
                  )
                }
              >
                Duplicate
              </button>
              <button
                disabled={playing || project.frames.length === 1}
                onClick={() =>
                  replace(
                    deleteFrames(project, selection),
                    Math.max(
                      0,
                      selected - selection.filter((i) => i <= selected).length,
                    ),
                  )
                }
              >
                Delete
              </button>
              <button
                disabled={playing || Math.min(...selection) === 0}
                onClick={() => moveSelection(Math.min(...selection) - 1)}
              >
                Move earlier
              </button>
              <button
                disabled={
                  playing ||
                  Math.max(...selection) === project.frames.length - 1
                }
                onClick={() => moveSelection(Math.max(...selection) + 2)}
              >
                Move later
              </button>
            </div>
            <label>
              Frame duration (ms)
              <input
                aria-label="Frame duration"
                type="number"
                min="20"
                max="10000"
                step="10"
                value={frame.duration}
                disabled={playing}
                onChange={(e) =>
                  run(() =>
                    replace({
                      ...project,
                      frames: project.frames.map((f, i) =>
                        selection.includes(i)
                          ? { ...f, duration: Number(e.target.value) }
                          : f,
                      ),
                    }),
                  )
                }
              />
            </label>
            <p className="muted">
              20–10,000 ms per frame. Up to 120 frames and two minutes, within
              the cell budget.
            </p>
            <button
              className="button quiet"
              disabled={playing}
              onClick={() =>
                run(() => {
                  const state = workspace.getState();
                  const doc = state.activeId
                    ? state.documents[state.activeId]
                    : null;
                  if (!doc)
                    throw new Error(
                      "No Studio artwork is open. Open a frame in Studio and draw first.",
                    );
                  replace(
                    {
                      ...project,
                      frames: [
                        ...project.frames,
                        { doc, duration: frame.duration },
                      ],
                    },
                    project.frames.length,
                  );
                })
              }
            >
              Add current Studio artwork
            </button>
            <h2>Draw on this frame</h2>
            <label>
              <input
                type="checkbox"
                checked={drawing}
                disabled={playing}
                onChange={(e) => setDrawing(e.target.checked)}
              />
              Draw directly on preview
            </label>
            <label>
              Drawing character
              <input
                aria-label="Drawing character"
                value={brush.char}
                maxLength={16}
                onChange={(e) => setBrush({ ...brush, char: e.target.value })}
              />
            </label>
            <label>
              Drawing color
              <input
                type="color"
                aria-label="Drawing color"
                value={brush.fg}
                onChange={(e) => setBrush({ ...brush, fg: e.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={brush.erase}
                onChange={(e) =>
                  setBrush({ ...brush, erase: e.target.checked })
                }
              />
              Erase cells
            </label>
            <h2>Import and export</h2>
            <ExportSettings
              value={exportOptions}
              onChange={setExportOptions}
              disabled={exporting}
            />

            <label>
              Soundtrack (optional)
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (file.size > 40 * 1024 * 1024) {
                    setMessage("Soundtrack must be 40 MiB or smaller.");
                    return;
                  }
                  setSoundtrack(file);
                }}
              />
            </label>
            {soundtrack && (
              <p>
                {soundtrack.name}{" "}
                <button onClick={() => setSoundtrack(null)}>
                  Remove soundtrack
                </button>
              </p>
            )}
            <label className="animation-file">
              Import animation JSON
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file)
                    run(async () => {
                      if (file.size > 80_000_000)
                        throw new Error("Animation exceeds 80 MB.");
                      const imported = parseAnimation(await file.text());
                      await save();
                      replace({ ...imported, id: crypto.randomUUID() }, 0);
                    });
                }}
              />
            </label>
            <button
              className="button quiet"
              onClick={() =>
                run(() =>
                  downloadBlob(
                    new Blob([serializeAnimation(project)], {
                      type: "application/json",
                    }),
                    `${project.name.replace(/[^a-z0-9_-]/gi, "_")}.animation.json`,
                  ),
                )
              }
            >
              Download project JSON
            </button>
            <div className="animation-action-grid">
              {(["gif", "webm", "mp4"] as const).map((format) => (
                <button
                  key={format}
                  disabled={exporting}
                  onClick={() =>
                    run(async () => {
                      setExporting(true);
                      abort.current = new AbortController();
                      try {
                        const blob = await exportAnimation(
                          project.frames,
                          format,
                          abort.current.signal,
                          soundtrack || undefined,
                          exportOptions,
                        );
                        downloadBlob(blob, `animation.${format}`);
                        setMessage(`Exported ${format.toUpperCase()}.`);
                      } finally {
                        setExporting(false);
                        abort.current = null;
                      }
                    })
                  }
                >
                  Export {format.toUpperCase()}
                </button>
              ))}
              {exporting && (
                <button onClick={() => abort.current?.abort()}>
                  Cancel export
                </button>
              )}
            </div>
            <p className="muted">
              Video export availability depends on your browser’s encoders.
            </p>
            <MediaImport onFrames={importFrames} />
          </details>
        </aside>
      </div>
      <ol className="animation-timeline" aria-label="Animation frames">
        {project.frames.map((f, i) => (
          <li
            key={i}
            draggable={!playing && !exporting}
            onDragStart={(e) => {
              dragged.current = selection.includes(i) ? selection : [i];
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(i));
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragged.current.length) {
                run(() => moveSelection(i, dragged.current));
                dragged.current = [];
              }
            }}
          >
            <button
              disabled={playing}
              aria-pressed={selection.includes(i)}
              aria-current={selected === i ? "step" : undefined}
              onClick={(e) => select(i, e.shiftKey, e.ctrlKey || e.metaKey)}
            >
              <span>Frame {i + 1}</span>
              <pre aria-hidden="true">{frameTexts[i].slice(0, 600)}</pre>
              <small>{f.duration} ms</small>
            </button>
          </li>
        ))}
        <li
          role="presentation"
          className="animation-drop-end"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (dragged.current.length) {
              run(() => moveSelection(project.frames.length, dragged.current));
              dragged.current = [];
            }
          }}
        >
          <span>Drop at end</span>
        </li>
      </ol>
      <p role="status">{status}</p>
      {message && (
        <p role="alert" className="animation-message">
          {message}
          <button aria-label="Dismiss message" onClick={() => setMessage("")}>
            ×
          </button>
        </p>
      )}
    </main>
  );
}
