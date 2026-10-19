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
  duplicateFrame,
  removeFrame,
  moveFrame,
  frameAt,
  parseAnimation,
  serializeAnimation,
  validateAnimation,
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
import { exportAnimation } from "@/creative/recording";
import { MediaImport } from "@/components/creative/media-import";
import "./animation.css";
export default function Animation() {
  const router = useRouter();
  const [project, setProject] = useState<AnimationProject | null>(null),
    [selected, setSelected] = useState(0),
    [playing, setPlaying] = useState(false),
    [onion, setOnion] = useState(true),
    [message, setMessage] = useState(""),
    [status, setStatus] = useState(""),
    [exporting, setExporting] = useState(false),
    [recovery, setRecovery] = useState(false),
    [soundtrack, setSoundtrack] = useState<File | null>(null),
    [projects, setProjects] = useState<AnimationSummary[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null),
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
  const replace = (p: AnimationProject, index = selected) => {
    if (recovery) throw new Error("Start a new animation before editing.");
    setPlaying(false);
    setProject(validateAnimation(p));
    setSelected(Math.min(index, p.frames.length - 1));
  };
  const importFrames = async (frames: AnimationFrame[]) => {
    if (!frames.length) return;
    const newProject = createAnimation(frames);
    await save();
    setPlaying(false);
    setSelected(0);
    setProject(newProject);
    setMessage(`Imported ${frames.length} frames.`);
  };
  const save = async () => {
    if (recovery)
      throw new Error(
        "Choose Start a new animation before replacing unavailable recovery data.",
      );
    if (project) {
      await saveAnimation(project);
      saved.current = project;
      setStatus("Saved locally");
    }
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
        <Link href="/create">Back to creative tools</Link>
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
    <main className="animation-page">
      <header>
        <Link href="/" className="wordmark">
          AsciiMorph
        </Link>
        <nav>
          <Link href="/create">Create</Link>
          <Link
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
        Keeps up to eight recent animations within the local storage budget.
        Download project JSON for a permanent copy.
      </p>
      <label className="animation-name">
        Animation name
        <input
          value={project.name}
          maxLength={120}
          onChange={(e) => setProject({ ...project, name: e.target.value })}
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
            <canvas ref={canvas} aria-label={`Frame ${selected + 1}`} />
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
          <h2>Frames</h2>
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
                  replace(duplicateFrame(project, selected), selected + 1),
                )
              }
            >
              Duplicate
            </button>
            <button
              disabled={playing || project.frames.length === 1}
              onClick={() => replace(removeFrame(project, selected))}
            >
              Delete
            </button>
            <button
              disabled={playing || selected === 0}
              onClick={() =>
                replace(moveFrame(project, selected, -1), selected - 1)
              }
            >
              Move earlier
            </button>
            <button
              disabled={playing || selected === project.frames.length - 1}
              onClick={() =>
                replace(moveFrame(project, selected, 1), selected + 1)
              }
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
                      i === selected
                        ? { ...f, duration: Number(e.target.value) }
                        : f,
                    ),
                  }),
                )
              }
            />
          </label>
          <p className="muted">
            20–10,000 ms per frame. Up to 120 frames and two minutes, within the
            cell budget.
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
          <h2>Import and export</h2>
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
                    replace(imported, 0);
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
        </aside>
      </div>
      <ol className="animation-timeline" aria-label="Animation frames">
        {project.frames.map((f, i) => (
          <li key={i}>
            <button
              disabled={playing}
              aria-pressed={selected === i}
              onClick={() => setSelected(i)}
            >
              <span>Frame {i + 1}</span>
              <pre aria-hidden="true">{frameTexts[i].slice(0, 600)}</pre>
              <small>{f.duration} ms</small>
            </button>
          </li>
        ))}
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
