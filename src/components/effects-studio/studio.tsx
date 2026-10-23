"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  shouldHandleHistoryShortcut,
  type StudioSnapshot,
  type StudioView,
} from "./controller";
import { useStudio } from "./use-studio";
import type { StudioRuntime } from "./runtime";
import { StudioViewport } from "./viewport";
import { Catalog } from "./catalog";
import { CATALOG } from "./catalog-data";
import { Properties } from "./properties";
import { Toolbar, Icon } from "./toolbar";
import { Actions } from "./actions";
import { StudioDialog, useFocusBoundary } from "./dialogs";
const preferenceKey = "asciimorph:studio:ui:v1";
type Preferences = Pick<
  StudioView,
  | "favorites"
  | "catalogWidth"
  | "catalogCollapsed"
  | "dockOpen"
  | "dockCollapsed"
  | "activeGroup"
>;
export function readStudioPreferences(): Partial<Preferences> {
  try {
    const raw = localStorage.getItem(preferenceKey);
    if (!raw) return {};
    const v = JSON.parse(raw);
    const keys = [
      "version",
      "favorites",
      "catalogWidth",
      "catalogCollapsed",
      "dockOpen",
      "dockCollapsed",
      "activeGroup",
    ];
    if (
      !v ||
      typeof v !== "object" ||
      Object.keys(v).some((k) => !keys.includes(k)) ||
      v.version !== 1 ||
      !Array.isArray(v.favorites) ||
      v.favorites.length > 105 ||
      v.favorites.some(
        (id: unknown) =>
          typeof id !== "string" || !CATALOG.some((t) => t.id === id),
      ) ||
      new Set(v.favorites).size !== v.favorites.length ||
      !Number.isFinite(v.catalogWidth) ||
      v.catalogWidth < 240 ||
      v.catalogWidth > 420 ||
      ["catalogCollapsed", "dockOpen", "dockCollapsed"].some(
        (k) => typeof v[k] !== "boolean",
      ) ||
      !["characters", "color"].includes(v.activeGroup)
    )
      return {};
    const {
      favorites,
      catalogWidth,
      catalogCollapsed,
      dockOpen,
      dockCollapsed,
      activeGroup,
    } = v;
    return {
      favorites,
      catalogWidth,
      catalogCollapsed,
      dockOpen,
      dockCollapsed,
      activeGroup,
    };
  } catch {
    return {};
  }
}
export function writeStudioPreferences(v: StudioView) {
  try {
    localStorage.setItem(
      preferenceKey,
      JSON.stringify({
        version: 1,
        favorites: v.favorites,
        catalogWidth: v.catalogWidth,
        catalogCollapsed: v.catalogCollapsed,
        dockOpen: v.dockOpen,
        dockCollapsed: v.dockCollapsed,
        activeGroup: v.activeGroup,
      }),
    );
  } catch {
    /* Storage is optional; editing remains available. */
  }
}
function useCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = matchMedia(
      "(max-width: 1000px), (pointer: coarse) and (max-height: 800px)",
    );
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}
export function StudioShell({
  runtime,
  snapshot: s,
}: {
  runtime: StudioRuntime;
  snapshot: StudioSnapshot;
}) {
  const [paintError, setPaintError] = useState<string | null>(null),
    [paintAttempt, setPaintAttempt] = useState(0);
  const onPaintError = useCallback(
    (reason: unknown) =>
      setPaintError(reason instanceof Error ? reason.message : String(reason)),
    [],
  );
  const c = runtime.controller;
  const compact = useCompact();
  const [dialog, setDialog] = useState<"help" | "menu" | "export" | null>(null);
  const dialogTrigger = useRef<HTMLElement | null>(null);
  const openDialog = (next: "help" | "menu" | "export") => {
    // Sheet cleanup releases its trap and scroll lock before the dialog owns them.
    c.setView({ mobileSheet: null });
    setDialog(next);
  };
  const reopen = useRef<HTMLButtonElement>(null),
    stylesTrigger = useRef<HTMLButtonElement>(null),
    controlsTrigger = useRef<HTMLButtonElement>(null),
    sheet = useRef<HTMLElement>(null);
  const rangeGesture = useRef(false);
  const stage = useRef<HTMLDivElement>(null),
    panStart = useRef<{
      x: number;
      y: number;
      left: number;
      top: number;
    } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [preferencesReady, setPreferencesReady] = useState(false);
  useEffect(() => {
    c.setView(readStudioPreferences());
    setPreferencesReady(true);
  }, [c]);
  useEffect(() => {
    if (preferencesReady) writeStudioPreferences(s.view);
  }, [preferencesReady, s.view]);
  useEffect(() => {
    const release = () => {
      c.releaseCompare();
      c.commitEdit();
    };
    const endRange = () => {
      if (rangeGesture.current) {
        rangeGesture.current = false;
        c.commitEdit();
      }
    };
    const key = (e: KeyboardEvent) => {
      const target =
        e.target instanceof HTMLElement
          ? (e.target.closest<HTMLElement>(
              'input,textarea,select,[contenteditable="true"]',
            ) ?? e.target)
          : null;
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        shouldHandleHistoryShortcut(target)
      ) {
        e.preventDefault();
        if (e.shiftKey) c.redo();
        else c.undo();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "y" &&
        shouldHandleHistoryShortcut(target)
      ) {
        e.preventDefault();
        c.redo();
      }
    };
    window.addEventListener("blur", release);
    window.addEventListener("pointerup", endRange);
    window.addEventListener("pointercancel", endRange);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("blur", release);
      window.removeEventListener("pointerup", endRange);
      window.removeEventListener("pointercancel", endRange);
      window.removeEventListener("keydown", key);
    };
  }, [c]);
  useEffect(() => {
    if (!compact && s.view.mobileSheet) c.setView({ mobileSheet: null });
  }, [compact, c, s.view.mobileSheet]);
  const sheetOpen = compact && !!s.view.mobileSheet;
  useFocusBoundary(
    sheet,
    sheetOpen,
    () => c.setView({ mobileSheet: null }),
    s.view.mobileSheet === "styles"
      ? stylesTrigger.current
      : controlsTrigger.current,
  );
  const priorDock = useRef({
    open: s.view.dockOpen,
    collapsed: s.view.dockCollapsed,
  });
  useLayoutEffect(() => {
    const previous = priorDock.current;
    if (
      (previous.open && !s.view.dockOpen) ||
      (!previous.collapsed && s.view.dockCollapsed)
    )
      reopen.current?.focus();
    priorDock.current = {
      open: s.view.dockOpen,
      collapsed: s.view.dockCollapsed,
    };
  }, [s.view.dockOpen, s.view.dockCollapsed]);
  const closeDock = () => {
    c.commitEdit();
    c.setView({ dockOpen: false });
    reopen.current?.focus();
  };
  const collapseDock = () => {
    c.commitEdit();
    c.setView({ dockCollapsed: !s.view.dockCollapsed });
    if (!s.view.dockCollapsed) reopen.current?.focus();
  };
  const left = compact ? 0 : s.view.catalogCollapsed ? 54 : s.view.catalogWidth,
    right = compact
      ? 0
      : !s.view.dockOpen
        ? 0
        : s.view.dockCollapsed
          ? 52
          : 340;
  const css = {
    "--studio-left": `${left}px`,
    "--studio-right": `${right}px`,
  } as CSSProperties;
  const transfer = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void c.loadFile(file);
  };
  return (
    <main
      className={`effects-studio ${compact ? "studio-compact" : ""}`}
      style={css}
      aria-label="AsciiMorph Studio"
      onClickCapture={(event) => {
        const button =
          event.target instanceof Element
            ? event.target.closest<HTMLButtonElement>("button")
            : null;
        if (button?.closest(".studio-toolbar, .studio-actions"))
          dialogTrigger.current = button;
      }}
      onPointerDownCapture={(e) => {
        if (e.target instanceof HTMLInputElement && e.target.type === "range")
          rangeGesture.current = true;
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        transfer(e.dataTransfer.files);
      }}
      onPaste={(e) => {
        if (
          e.target instanceof HTMLElement &&
          !shouldHandleHistoryShortcut(e.target)
        )
          return;
        const image = Array.from(e.clipboardData.items)
          .find(
            (item) => item.kind === "file" && item.type.startsWith("image/"),
          )
          ?.getAsFile();
        if (image) {
          e.preventDefault();
          void c.loadFile(image);
        }
      }}
    >
      <Toolbar controller={c} snapshot={s} open={openDialog} />
      <aside
        className={`studio-catalog ${s.view.catalogCollapsed && !compact ? "is-collapsed" : ""}`}
        aria-label="Style catalog"
        hidden={compact}
      >
        {s.view.catalogCollapsed ? (
          <button
            aria-label="Expand style catalog"
            onClick={() => c.setView({ catalogCollapsed: false })}
          >
            <Icon name="expand" />
          </button>
        ) : (
          <Catalog
            controller={c}
            snapshot={s}
            runtime={runtime}
            collapse={() => c.setView({ catalogCollapsed: true })}
          />
        )}
        {!s.view.catalogCollapsed && (
          <div
            role="separator"
            aria-label="Resize style catalog"
            aria-orientation="vertical"
            aria-valuemin={240}
            aria-valuemax={420}
            aria-valuenow={s.view.catalogWidth}
            tabIndex={0}
            className="studio-catalog-resizer"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                c.setView({
                  catalogWidth:
                    s.view.catalogWidth + (e.key === "ArrowRight" ? 10 : -10),
                });
              }
              if (e.key === "Home") c.setView({ catalogWidth: 240 });
              if (e.key === "End") c.setView({ catalogWidth: 420 });
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture?.(e.pointerId))
                c.setView({ catalogWidth: e.clientX });
            }}
            onPointerUp={(e) =>
              e.currentTarget.releasePointerCapture?.(e.pointerId)
            }
          />
        )}
      </aside>
      <div
        className="studio-stage"
        ref={stage}
        aria-label="Image stage"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          panStart.current = {
            x: e.clientX,
            y: e.clientY,
            left: pan.x,
            top: pan.y,
          };
        }}
        onPointerMove={(e) => {
          const p = panStart.current;
          if (p)
            setPan({ x: p.left + e.clientX - p.x, y: p.top + e.clientY - p.y });
        }}
        onPointerUp={() => {
          panStart.current = null;
        }}
        onPointerCancel={() => {
          panStart.current = null;
        }}
      >
        <div
          className="studio-preview"
          style={{ transform: `translate(${pan.x}px,${pan.y}px)` }}
        >
          <StudioViewport
            key={paintAttempt}
            runtime={runtime}
            snapshot={s}
            onPaintError={onPaintError}
          />
        </div>
        {s.view.compare && (
          <span className="studio-compare-label">Original</span>
        )}
        <div className="studio-stage-status" role="status">
          {s.loading
            ? "Opening local image…"
            : s.status === "rendering"
              ? "Rendering Characters…"
              : s.status === "idle"
                ? "Preparing Characters…"
                : ""}
        </div>
        <span className="studio-session">Local · current session</span>
        <Actions
          controller={c}
          exportImage={() => {
            c.commitEdit();
            openDialog("export");
          }}
        />
      </div>
      <button
        ref={reopen}
        className="studio-reopen"
        aria-label="Open controls"
        hidden={compact || (s.view.dockOpen && !s.view.dockCollapsed)}
        onClick={() => c.setView({ dockOpen: true, dockCollapsed: false })}
      >
        <Icon name="layers" />
      </button>
      <aside
        data-testid="properties-dock"
        className={`studio-properties ${s.view.dockCollapsed ? "is-collapsed" : ""} ${!s.view.dockOpen ? "is-closed" : ""}`}
        aria-label="Properties"
        aria-hidden={compact || !s.view.dockOpen}
        inert={compact || !s.view.dockOpen}
      >
        <Properties
          controller={c}
          snapshot={s}
          close={closeDock}
          collapse={collapseDock}
        />
      </aside>
      {paintError && (
        <div className="studio-error" role="alert">
          Preview could not be painted: {paintError}
          <button
            onClick={() => {
              setPaintError(null);
              setPaintAttempt((n) => n + 1);
            }}
          >
            Retry preview
          </button>
        </div>
      )}
      {s.error && (
        <div className="studio-error" role="alert">
          {s.error.message}
          {s.error.stage === "render" && (
            <button onClick={() => void runtime.retry()}>Retry renderer</button>
          )}
        </div>
      )}
      {compact && (
        <nav className="studio-mobile-tabs" aria-label="Studio panels">
          <button
            ref={stylesTrigger}
            aria-expanded={s.view.mobileSheet === "styles"}
            onClick={() =>
              c.setView({
                mobileSheet: s.view.mobileSheet === "styles" ? null : "styles",
              })
            }
          >
            Styles
          </button>
          <button
            ref={controlsTrigger}
            aria-expanded={s.view.mobileSheet === "controls"}
            onClick={() =>
              c.setView({
                mobileSheet:
                  s.view.mobileSheet === "controls" ? null : "controls",
                dockCollapsed: false,
              })
            }
          >
            Controls
          </button>
        </nav>
      )}
      {sheetOpen && (
        <div
          className="studio-sheet-layer"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) c.setView({ mobileSheet: null });
          }}
        >
          <aside
            ref={sheet}
            tabIndex={-1}
            className={`studio-sheet ${s.view.mobileSheet}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              s.view.mobileSheet === "styles"
                ? "Styles sheet"
                : "Controls sheet"
            }
          >
            <button
              className="studio-sheet-close"
              aria-label="Close panel"
              onClick={() => c.setView({ mobileSheet: null })}
            >
              Close panel <Icon name="close" />
            </button>
            {s.view.mobileSheet === "styles" ? (
              <Catalog
                controller={c}
                snapshot={s}
                runtime={runtime}
                collapse={() => c.setView({ mobileSheet: null })}
              />
            ) : (
              <Properties
                controller={c}
                snapshot={s}
                close={() => c.setView({ mobileSheet: null })}
                collapse={() => c.setView({ mobileSheet: null })}
              />
            )}
          </aside>
        </div>
      )}
      {dialog && (
        <StudioDialog
          title={
            dialog === "help"
              ? "Studio help"
              : dialog === "menu"
                ? "Studio menu"
                : "Export image"
          }
          kind={dialog}
          returnTo={dialogTrigger.current}
          close={() => setDialog(null)}
        >
          {dialog === "help" ? (
            <>
              <p>
                Upload or drop a PNG, JPEG, WebP or BMP, or paste an image file.
                Up to 12 MiB, 4 million pixels and 8192 pixels per side. Sources
                stay in this current local session.
              </p>
              <p>
                Characters uses the Rust renderer. Adjust Font Size and
                Character Set, or open Color for Brightness and Contrast. Drag
                the stage to pan; zoom changes your view. Hold Compare or toggle
                Original to inspect your source.
              </p>
              <p>
                Undo: Ctrl/⌘ Z. Redo: Ctrl/⌘ Shift Z. Text fields keep native
                undo. Other styles, Flow, Library and generation are
                unavailable.
              </p>
            </>
          ) : dialog === "menu" ? (
            <>
              <p>
                Leaving this page loses the current image and edits. Only
                favorites and panel preferences are saved on this device.
              </p>
              <a href="/studio">Open legacy Studio</a>
              <p className="studio-note">
                The legacy editor has a separate project workflow.
              </p>
            </>
          ) : (
            <>
              <p>PNG/JPEG encoding is not available in this milestone.</p>
              <p className="studio-note">
                Full-frame image export will follow. No download is produced
                here.
              </p>
              <button disabled>Export unavailable</button>
            </>
          )}
        </StudioDialog>
      )}
    </main>
  );
}
export default function Studio() {
  const { runtime, snapshot } = useStudio();
  useEffect(() => {
    if (runtime) void runtime.controller.loadOwnedDefault();
  }, [runtime]);
  return runtime && snapshot ? (
    <StudioShell runtime={runtime} snapshot={snapshot} />
  ) : (
    <main className="effects-studio studio-boot" aria-label="AsciiMorph Studio">
      <span role="status">Opening Studio…</span>
    </main>
  );
}
