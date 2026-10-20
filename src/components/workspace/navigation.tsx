"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelDialog } from "@/components/ui/dialog";
import { prepareNavigation } from "@/workspace/navigation";
import { usePersistentState } from "@/workspace/preferences";
export const WORKSPACE_TOOLS = [
  ["/studio", "Draw", "Draw with characters, layers and selections"],
  ["/convert", "Image", "Convert and revise a source image"],
  ["/animate", "Animate", "Edit frames, draw and export a loop"],
  ["/type", "Type", "Compose ASCII lettering"],
  ["/generate", "Generate", "Build procedural patterns"],
  ["/three", "3D", "Render a mesh in characters"],
  ["/audio", "Audio", "Visualize sound and frequency"],
  ["/gallery", "Gallery", "Find artwork and reusable templates"],
  ["/projects", "Projects", "Organize, back up and restore your work"],
] as const;
export function WorkspaceNavigation() {
  const path = usePathname(),
    router = useRouter();
  const [commands, setCommands] = useState(false),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [walkthrough, setWalkthrough] = useState(-1);
  const [introduced, setIntroduced] = usePersistentState("introduced", false);
  const visible = WORKSPACE_TOOLS.some(([url]) => path === url);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommands((value) => !value);
      }
    };
    const storageError = (event: Event) =>
      setError(String((event as CustomEvent).detail));
    window.addEventListener("keydown", key);
    window.addEventListener("asciimorph-storage-error", storageError);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("asciimorph-storage-error", storageError);
    };
  }, []);
  async function go(url: string) {
    if (busy) return;
    setBusy(true);
    try {
      await prepareNavigation();
      router.push(url);
      setCommands(false);
      setQuery("");
      setError("");
    } catch (error) {
      setError(
        `Could not leave safely: ${error instanceof Error ? error.message : String(error)}. Download a project backup before leaving.`,
      );
    } finally {
      setBusy(false);
    }
  }
  const steps = [
    [
      "Start with a tool",
      "Draw from scratch, convert an image, or open a sample from the gallery. The navigation above stays available across tools.",
    ],
    [
      "Carry your artwork forward",
      "Use Open in Studio to keep editing a result, or send frames to Animation. Tool settings stay available when you return.",
    ],
    [
      "Keep a copy outside this browser",
      "Projects contains your local artwork, animations and recovery snapshots. Download a library backup regularly; browser storage can be cleared by your device.",
    ],
  ];
  return (
    <>
      {visible && (
        <div className="workspace-bar">
          <Link prefetch={false}
            href="/"
            className="workspace-brand"
            onClick={(event) => {
              event.preventDefault();
              void go("/");
            }}
            title="AsciiMorph home"
          >
            {"{ }"}
          </Link>
          <nav aria-label="Workspace tools">
            {WORKSPACE_TOOLS.map(([url, label, description]) => (
              <Link prefetch={false}
                key={url}
                href={url}
                aria-current={path === url ? "page" : undefined}
                title={description}
                onClick={(event) => {
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  void go(url);
                }}
              >
                {label}
              </Link>
            ))}
          </nav>
          <button
            onClick={() => setCommands(true)}
            title="Search tools and commands (Ctrl or Command K)"
            aria-label="Search commands"
          >
            ⌘ K
          </button>
          <button onClick={() => setWalkthrough(0)} title="Workspace guide">
            ?
          </button>
        </div>
      )}
      {visible && !introduced && (
        <div className="workspace-intro">
          <span>New here? Take a quick workspace tour.</span>
          <button onClick={() => setWalkthrough(0)}>Show me</button>
          <button
            aria-label="Dismiss introduction"
            onClick={() => setIntroduced(true)}
          >
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="workspace-error" role="alert">
          <strong>Work needs attention.</strong> {error}
          <button
            onClick={() => setError("")}
            aria-label="Dismiss workspace error"
          >
            ×
          </button>
        </div>
      )}
      <PanelDialog
        title="Search tools and commands"
        open={commands}
        onOpenChange={setCommands}
      >
        {error && (
          <p role="alert" className="workspace-error">
            {error}
          </p>
        )}
        <input
          className="workspace-search"
          aria-label="Search commands"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type a tool or action…"
        />
        <div className="workspace-command-results">
          {[
            ...WORKSPACE_TOOLS,
            [
              "/studio?demo=orbit",
              "Open sample project",
              "Start with the Orbit character study",
            ] as const,
          ]
            .filter((item) =>
              item.join(" ").toLowerCase().includes(query.toLowerCase()),
            )
            .map(([url, label, description]) => (
              <button disabled={busy} key={url} onClick={() => void go(url)}>
                <strong>{label}</strong>
                <small>{description}</small>
              </button>
            ))}
        </div>
        <p className="muted">
          Ctrl / ⌘ K opens this menu. Use Tab and Enter to select a command.
        </p>
      </PanelDialog>
      <PanelDialog
        title={steps[Math.max(0, walkthrough)][0]}
        open={walkthrough >= 0}
        onOpenChange={(open) => {
          if (!open) {
            setWalkthrough(-1);
            setIntroduced(true);
          }
        }}
      >
        <p>{steps[Math.max(0, walkthrough)][1]}</p>
        <div className="workspace-row">
          <span>Step {walkthrough + 1} of 3</span>
          <button
            className="button primary"
            onClick={() => {
              if (walkthrough < 2) setWalkthrough(walkthrough + 1);
              else {
                setWalkthrough(-1);
                setIntroduced(true);
              }
            }}
          >
            {walkthrough < 2 ? "Next" : "Start creating"}
          </button>
        </div>
      </PanelDialog>
    </>
  );
}
