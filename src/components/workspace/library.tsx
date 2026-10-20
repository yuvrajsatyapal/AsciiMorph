"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getLibrary,
  readProjectDetails,
  setProjectDetails,
  renameLibraryItem,
  duplicateLibraryItem,
  deleteLibraryItem,
  exportLibrary,
  importLibrary,
  lastBackupAt,
  markBackupDownloaded,
  type LibraryItem,
} from "@/workspace/library";
import { readProject } from "@/editor/persistence";
import { loadAnimation } from "@/animation/persistence";
import { saveActiveDraft } from "@/converter/handoff";
import { workspace } from "@/editor/store";
import { openSavedAnimation } from "@/animation/handoff";
import { downloadBlob } from "@/core/exports";
import { PanelDialog } from "@/components/ui/dialog";
import { prepareNavigation } from "@/workspace/navigation";
const bytes = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MiB`;
export default function ProjectLibrary() {
  const router = useRouter();
  const [items, setItems] = useState<LibraryItem[]>([]),
    [query, setQuery] = useState(""),
    [folder, setFolder] = useState("all"),
    [pins, setPins] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LibraryItem | null>(null),
    [deleting, setDeleting] = useState<LibraryItem | null>(null),
    [name, setName] = useState(""),
    [editFolder, setEditFolder] = useState(""),
    [tags, setTags] = useState("");
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number }>(
      {},
    ),
    [persistent, setPersistent] = useState<boolean | null>(null),
    [backupAt, setBackupAt] = useState<string | null>(null),
    [now, setNow] = useState(0);
  const refresh = useCallback(async () => {
    setItems(await getLibrary());
    setBackupAt(lastBackupAt());
    setNow(Date.now());
    if (navigator.storage?.estimate)
      setEstimate(await navigator.storage.estimate());
    if (navigator.storage?.persisted)
      setPersistent(await navigator.storage.persisted());
  }, []);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let active = true;
    void prepareNavigation()
      .then(refresh)
      .catch((error) => {
        if (active) setError(String(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  const filtered = items.filter(
    (item) =>
      (!pins || item.details.pinned) &&
      (folder === "all" || item.details.folder === folder) &&
      [item.name, item.kind, item.details.folder, ...item.details.tags]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const backupDue = !backupAt || now - Date.parse(backupAt) > 7 * 86400000;
  return (
    <main className="project-library">
      <div className="library-heading">
        <div>
          <p className="eyebrow">YOUR LOCAL WORKSPACE</p>
          <h1>Projects & backups</h1>
          <p>Organize your work and keep a copy outside this browser.</p>
        </div>
        <button
          className="button primary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await prepareNavigation();
              const data = await exportLibrary();
              downloadBlob(
                new Blob([data], { type: "application/json" }),
                `asciimorph-library-${new Date().toISOString().slice(0, 10)}.json`,
              );
              markBackupDownloaded();
              setMessage(
                "Library backup downloaded. Keep the file somewhere safe.",
              );
            })
          }
        >
          Back up entire library
        </button>
      </div>
      {error && (
        <p role="alert" className="workspace-error">
          <strong>Action did not finish.</strong> {error}
        </p>
      )}
      {message && (
        <p role="status" className="library-notice">
          {message}
        </p>
      )}
      <details className="storage-dashboard" open={backupDue}>
        <summary>
          Storage & recovery {backupDue ? "· Backup recommended" : ""}
        </summary>
        <div className="storage-grid">
          <div>
            <h2>Browser storage</h2>
            <p>
              {estimate.usage !== undefined
                ? `${bytes(estimate.usage)} used of ${bytes(estimate.quota || 0)}`
                : "Storage estimates unavailable in this browser."}
            </p>
            <p>
              {persistent === true
                ? "Persistent storage granted."
                : "Browser-managed storage may be removed under device pressure."}
            </p>
            <button
              disabled={busy || persistent === true}
              onClick={() =>
                void run(async () => {
                  if (!navigator.storage?.persist)
                    throw new Error(
                      "Persistent storage is unavailable in this browser.",
                    );
                  const granted = await navigator.storage.persist();
                  setPersistent(granted);
                  setMessage(
                    granted
                      ? "Persistent storage granted."
                      : "This browser did not grant persistent storage. Keep external backups.",
                  );
                })
              }
            >
              Request persistent storage
            </button>
          </div>
          <div>
            <h2>Library backup</h2>
            <p>
              {backupAt
                ? `Last download: ${new Date(backupAt).toLocaleString()}`
                : "No library backup downloaded yet."}
            </p>
            <p>
              Includes artwork, animations, recovery snapshots and saved
              preferences. Imported projects are added as new copies.
            </p>
            <label>
              Restore library backup
              <input
                disabled={busy}
                type="file"
                accept=".json,application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file)
                    void run(async () => {
                      if (file.size > 240_000_000)
                        throw new Error("Backup exceeds 240 MB.");
                      const result = await importLibrary(await file.text());
                      setMessage(
                        `Restored ${result.artworks} artworks and ${result.animations} animations as new copies.`,
                      );
                    });
                }}
              />
            </label>
          </div>
        </div>
        <p className="muted">
          Projects stay until you delete them. Device/browser clearing can still
          remove local data. Download a backup at least weekly and before
          clearing browser data.
        </p>
      </details>
      <div className="library-filters">
        <input
          aria-label="Search projects"
          placeholder="Search names, folders and tags…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label>
          Folder
          <select
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
          >
            <option value="all">All folders</option>
            <option value="">Unfiled</option>
            {[
              ...new Set(
                items.map((item) => item.details.folder).filter(Boolean),
              ),
            ]
              .sort()
              .map((value) => (
                <option key={value}>{value}</option>
              ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={pins}
            onChange={(event) => setPins(event.target.checked)}
          />{" "}
          Pinned only
        </label>
        <span>{filtered.length} {filtered.length === 1 ? "project" : "projects"}</span>
      </div>
      {loading ? (
        <p role="status">Loading local projects…</p>
      ) : filtered.length === 0 ? (
        <p className="library-empty">
          No projects here yet. Create artwork in Studio or save an animation to
          begin.
        </p>
      ) : (
        <div className="library-grid">
          {filtered.map((item) => (
            <article key={item.key} className="library-card">
              <button
                className="library-preview"
                aria-label={`Open ${item.name}`}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await prepareNavigation();
                    await saveActiveDraft();
                    if (item.kind === "artwork") {
                      const doc = await readProject(item.id);
                      if (!doc) throw new Error("Project no longer exists.");
                      workspace.getState().open(doc);
                      router.push("/studio");
                    } else {
                      const project = await loadAnimation(item.id);
                      if (!project)
                        throw new Error("Animation no longer exists.");
                      await openSavedAnimation(project);
                      router.push("/animate");
                    }
                  })
                }
              >
                <pre aria-hidden="true">{item.preview || "+"}</pre>
              </button>
              <div className="library-card-content">
                <h2>{item.name}</h2>
                <small>
                  {item.kind} · {item.width} × {item.height}
                  {item.kind === "animation" ? ` · ${item.frames} frames` : ""}
                </small>
                <p>
                  {item.details.folder || "Unfiled"}
                  {item.details.tags.length
                    ? ` · ${item.details.tags.join(", ")}`
                    : ""}
                </p>
                <div className="library-card-actions">
                  <button
                    disabled={busy}
                    aria-pressed={item.details.pinned}
                    aria-label={`${item.details.pinned ? "Unpin" : "Pin"} ${item.name}`}
                    onClick={() =>
                      void run(async () =>
                        setProjectDetails(item.key, {
                          pinned: !readProjectDetails(item.key).pinned,
                        }),
                      )
                    }
                  >
                    {item.details.pinned ? "★ Pinned" : "☆ Pin"}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setEditing(item);
                      setName(item.name);
                      setEditFolder(item.details.folder);
                      setTags(item.details.tags.join(", "));
                    }}
                  >
                    Organize
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await duplicateLibraryItem(item.key);
                        setMessage("Project duplicated.");
                      })
                    }
                  >
                    Duplicate
                  </button>
                  <button disabled={busy} onClick={() => setDeleting(item)}>
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <PanelDialog
        title="Organize project"
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        {error && (
          <p role="alert" className="workspace-error">
            {error}
          </p>
        )}
        <form
          className="library-edit"
          onSubmit={(event) => {
            event.preventDefault();
            if (editing)
              void run(async () => {
                await renameLibraryItem(editing.key, name);
                setProjectDetails(editing.key, {
                  folder: editFolder.trim(),
                  tags: tags
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                });
                const state = workspace.getState();
                if (
                  editing.kind === "artwork" &&
                  state.activeId === editing.id
                ) {
                  const doc = await readProject(editing.id);
                  if (doc) state.open(doc);
                }
                setEditing(null);
                setMessage("Project updated.");
              });
          }}
        >
          <label>
            Project name
            <input
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Folder
            <input
              maxLength={80}
              placeholder="e.g. Character studies"
              value={editFolder}
              onChange={(event) => setEditFolder(event.target.value)}
            />
          </label>
          <label>
            Tags (comma separated)
            <input
              value={tags}
              maxLength={1800}
              onChange={(event) => setTags(event.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy}>
            Save changes
          </button>
        </form>
      </PanelDialog>
      <PanelDialog
        title="Delete project?"
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        {error && (
          <p role="alert" className="workspace-error">
            {error}
          </p>
        )}
        <p>
          Delete “{deleting?.name}” and its local recovery snapshots? This
          cannot be undone. Download a library backup first if you want to keep
          it.
        </p>
        <div className="workspace-row">
          <button className="button quiet" onClick={() => setDeleting(null)}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => {
              if (deleting)
                void run(async () => {
                  await deleteLibraryItem(deleting.key);
                  const state = workspace.getState();
                  if (
                    deleting.kind === "artwork" &&
                    state.activeId === deleting.id
                  )
                    workspace.setState({
                      activeId: null,
                      past: [],
                      future: [],
                    });
                  setDeleting(null);
                  setMessage("Project deleted.");
                });
            }}
          >
            Delete permanently
          </button>
        </div>
      </PanelDialog>
    </main>
  );
}
