import {
  parseAnimation,
  serializeAnimation,
  type AnimationProject,
} from "./project";
const KEY = "asciimorph-animation-v1";
const MAX_STORED_CHARACTERS = 80_000_000;
export interface AnimationSummary {
  id: string;
  name: string;
  updatedAt: string;
  frames: number;
  characters: number;
}
interface LocalArchive {
  kind: "animation-archive";
  latest: string;
  projects: Record<string, string>;
  catalog: AnimationSummary[];
}
function summary(project: AnimationProject, data: string): AnimationSummary {
  return {
    id: project.id,
    name: project.name,
    updatedAt: new Date().toISOString(),
    frames: project.frames.length,
    characters: data.length,
  };
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("asciimorph-animation", 2);
    req.onupgradeneeded = () => {
      const db = req.result,
        tx = req.transaction!;
      if (!db.objectStoreNames.contains("projects"))
        db.createObjectStore("projects");
      const catalog = db.createObjectStore("catalog", { keyPath: "id" });
      const projects = tx.objectStore("projects");
      const old = projects.get("latest");
      old.onsuccess = () => {
        if (typeof old.result !== "string") return;
        try {
          const project = parseAnimation(old.result);
          projects.put(old.result, `project:${project.id}`);
          catalog.put(summary(project, old.result));
        } catch {
          tx.abort();
        }
      };
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () =>
      reject(req.error || new Error("Animation storage unavailable."));
    req.onblocked = () =>
      reject(new Error("Animation storage is blocked by another tab."));
  });
}
function readLocal(): LocalArchive {
  const raw = localStorage.getItem(KEY);
  if (!raw)
    return { kind: "animation-archive", latest: "", projects: {}, catalog: [] };
  if (raw.length > MAX_STORED_CHARACTERS)
    throw new Error("Animation archive exceeds storage budget.");
  const value = JSON.parse(raw);
  if (value?.kind === "animation-archive") {
    if (
      typeof value.latest !== "string" ||
      !value.projects ||
      typeof value.projects !== "object" ||
      !Array.isArray(value.catalog)
    )
      throw new Error("Invalid animation archive.");
    return value as LocalArchive;
  }
  const project = parseAnimation(raw);
  return {
    kind: "animation-archive",
    latest: project.id,
    projects: { [project.id]: raw },
    catalog: [summary(project, raw)],
  };
}
export async function saveAnimation(project: AnimationProject) {
  const data = serializeAnimation(project),
    row = summary(project, data);
  if (typeof indexedDB === "undefined") {
    const old = readLocal(),
      catalog = [row, ...old.catalog.filter((item) => item.id !== project.id)];
    const archive: LocalArchive = {
      kind: "animation-archive",
      latest: project.id,
      catalog,
      projects: Object.fromEntries(
        catalog.map((item) => [
          item.id,
          item.id === project.id ? data : old.projects[item.id],
        ]),
      ),
    };
    const serialized = JSON.stringify(archive);
    if (serialized.length > MAX_STORED_CHARACTERS)
      throw new Error(
        "Animation storage budget reached. Back up and explicitly delete projects in the library.",
      );
    localStorage.setItem(KEY, serialized);
    return;
  }
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["projects", "catalog"], "readwrite"),
        projects = tx.objectStore("projects"),
        catalog = tx.objectStore("catalog");
      projects.put(data, `project:${project.id}`);
      projects.put(data, "latest");
      catalog.put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error || new Error("Animation save failed."));
      tx.onabort = () =>
        reject(tx.error || new Error("Animation save aborted."));
    });
  } finally {
    db.close();
  }
}
export async function listAnimations(): Promise<AnimationSummary[]> {
  if (typeof indexedDB === "undefined") return readLocal().catalog;
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction("catalog").objectStore("catalog").getAll();
      req.onsuccess = () =>
        resolve(
          (req.result as AnimationSummary[]).sort((a, b) =>
            b.updatedAt.localeCompare(a.updatedAt),
          ),
        );
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export async function loadAnimation(
  id?: string,
): Promise<AnimationProject | null> {
  let data: unknown;
  if (typeof indexedDB === "undefined") {
    const archive = readLocal();
    data = archive.projects[id || archive.latest];
  } else {
    const db = await database();
    try {
      data = await new Promise((resolve, reject) => {
        const req = db
          .transaction("projects")
          .objectStore("projects")
          .get(id ? `project:${id}` : "latest");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }
  return typeof data === "string" ? parseAnimation(data) : null;
}

export async function deleteAnimation(id: string) {
  if (typeof indexedDB === "undefined") {
    const archive = readLocal();
    delete archive.projects[id];
    archive.catalog = archive.catalog.filter((row) => row.id !== id);
    if (archive.latest === id) archive.latest = archive.catalog[0]?.id || "";
    localStorage.setItem(KEY, JSON.stringify(archive));
    return;
  }
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["projects", "catalog"], "readwrite");
      const projects = tx.objectStore("projects"),
        catalog = tx.objectStore("catalog");
      const latest = projects.get("latest");
      latest.onsuccess = () => {
        const current =
          typeof latest.result === "string"
            ? parseAnimation(latest.result)
            : null;
        projects.delete(`project:${id}`);
        catalog.delete(id);
        if (current?.id === id) {
          const rows = catalog.getAll();
          rows.onsuccess = () => {
            const remaining = (rows.result as AnimationSummary[]).sort((a, b) =>
              b.updatedAt.localeCompare(a.updatedAt),
            );
            if (!remaining[0]) projects.delete("latest");
            else {
              const next = projects.get(`project:${remaining[0].id}`);
              next.onsuccess = () => projects.put(next.result, "latest");
            }
          };
        }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(tx.error || new Error("Delete failed."));
    });
  } finally {
    db.close();
  }
}
