import {
  validateBackupPreference,
  prepareBackupPreferences,
} from "./backup-preferences";
import {
  validateDocument,
  parseDocument,
  type AsciiDocument,
} from "@/core/document";
import { validateAnimation, type AnimationProject } from "@/animation/project";
import {
  listProjects,
  readProject,
  saveProject,
  deleteProject,
  getSnapshots,
  importSnapshots,
  type Snapshot,
} from "@/editor/persistence";
import {
  listAnimations,
  loadAnimation,
  saveAnimation,
  deleteAnimation,
} from "@/animation/persistence";
import { documentText } from "@/core/render";
export interface ProjectDetails {
  folder: string;
  pinned: boolean;
  tags: string[];
}
export interface LibraryItem {
  key: string;
  id: string;
  kind: "artwork" | "animation";
  name: string;
  updatedAt: string;
  preview: string;
  width: number;
  height: number;
  frames: number;
  details: ProjectDetails;
}
const DETAILS = "asciimorph-library-details";
const LAST_BACKUP = "asciimorph-library-backup-at";
const emptyDetails = (): ProjectDetails => ({
  folder: "",
  pinned: false,
  tags: [],
});
function validatedDetails(value: unknown): ProjectDetails {
  if (!value || typeof value !== "object")
    throw new Error("Invalid project details.");
  const d = value as ProjectDetails;
  if (
    typeof d.folder !== "string" ||
    d.folder.length > 80 ||
    typeof d.pinned !== "boolean" ||
    !Array.isArray(d.tags) ||
    d.tags.length > 30 ||
    d.tags.some((t) => typeof t !== "string" || t.length > 60)
  )
    throw new Error("Invalid project details.");
  return { folder: d.folder, pinned: d.pinned, tags: [...d.tags] };
}
function allDetails(): Record<string, ProjectDetails> {
  const raw: unknown = JSON.parse(localStorage.getItem(DETAILS) || "{}");
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error(
      "Library details are damaged. Export a backup before clearing storage.",
    );
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, validatedDetails(value)]),
  );
}
export function readProjectDetails(key: string) {
  return allDetails()[key] || emptyDetails();
}
export function setProjectDetails(key: string, patch: Partial<ProjectDetails>) {
  const details = allDetails();
  details[key] = validatedDetails({
    ...(details[key] || emptyDetails()),
    ...patch,
  });
  localStorage.setItem(DETAILS, JSON.stringify(details));
}
function splitKey(key: string): ["artwork" | "animation", string] {
  const offset = key.indexOf(":"),
    kind = key.slice(0, offset),
    id = key.slice(offset + 1);
  if ((kind !== "artwork" && kind !== "animation") || !id)
    throw new Error("Invalid library selection.");
  return [kind, id];
}
export async function getLibrary(): Promise<LibraryItem[]> {
  const [docs, animations] = await Promise.all([
    listProjects(),
    listAnimations(),
  ]);
  const details = allDetails();
  const item = (
    doc: AsciiDocument,
    kind: LibraryItem["kind"],
    id: string,
    name: string,
    updatedAt: string,
    frames: number,
  ): LibraryItem => ({
    key: `${kind}:${id}`,
    kind,
    id,
    name,
    updatedAt,
    frames,
    width: doc.width,
    height: doc.height,
    preview: documentText(doc)
      .split("\n")
      .slice(0, 20)
      .map((line) => line.slice(0, 90))
      .join("\n"),
    details: details[`${kind}:${id}`] || emptyDetails(),
  });
  const result = docs.map((doc) =>
    item(doc, "artwork", doc.id, doc.name, doc.updatedAt, 1),
  );
  // Load one animation at a time to bound peak memory when building thumbnails.
  for (const row of animations) {
    const project = await loadAnimation(row.id);
    if (project)
      result.push(
        item(
          project.frames[0].doc,
          "animation",
          project.id,
          project.name,
          row.updatedAt,
          project.frames.length,
        ),
      );
  }
  return result.sort(
    (a, b) =>
      Number(b.details.pinned) - Number(a.details.pinned) ||
      b.updatedAt.localeCompare(a.updatedAt),
  );
}
export async function renameLibraryItem(key: string, name: string) {
  if (!name.trim() || name.length > 120)
    throw new Error("Name must contain 1–120 characters.");
  const [kind, id] = splitKey(key);
  if (kind === "artwork") {
    const doc = await readProject(id);
    if (!doc) throw new Error("Artwork no longer exists.");
    await saveProject({
      ...doc,
      name: name.trim(),
      updatedAt: new Date().toISOString(),
    });
  } else {
    const project = await loadAnimation(id);
    if (!project) throw new Error("Animation no longer exists.");
    await saveAnimation({ ...project, name: name.trim() });
  }
}
export async function duplicateLibraryItem(key: string) {
  const [kind, id] = splitKey(key),
    newId = crypto.randomUUID(),
    now = new Date().toISOString();
  if (kind === "artwork") {
    const doc = await readProject(id);
    if (!doc) throw new Error("Artwork no longer exists.");
    await saveProject({
      ...doc,
      id: newId,
      name: `${doc.name.slice(0, 115)} copy`,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    const project = await loadAnimation(id);
    if (!project) throw new Error("Animation no longer exists.");
    await saveAnimation({
      ...project,
      id: newId,
      name: `${project.name.slice(0, 115)} copy`,
      frames: project.frames.map((f) => ({
        ...f,
        doc: { ...f.doc, id: crypto.randomUUID() },
      })),
    });
  }
  const copy = `${kind}:${newId}`;
  setProjectDetails(copy, { ...readProjectDetails(key), pinned: false });
  return copy;
}
export async function deleteLibraryItem(key: string) {
  const [kind, id] = splitKey(key);
  if (kind === "artwork") await deleteProject(id);
  else await deleteAnimation(id);
  const details = allDetails();
  delete details[key];
  localStorage.setItem(DETAILS, JSON.stringify(details));
}
export interface LibraryBackup {
  kind: "asciimorph-library";
  version: 1;
  createdAt: string;
  artworks: { document: AsciiDocument; snapshots: Snapshot[] }[];
  animations: AnimationProject[];
  details: Record<string, ProjectDetails>;
  preferences: Record<string, string>;
}
const isPreference = (key: string) =>
  key.startsWith("asciimorph-workspace:") ||
  [
    "asciimorph.gallery.favorites.v1",
    "asciimorph.gallery.templates.v1",
    "asciimorph-preferences",
    "asciimorph-gallery-favorites",
    "asciimorph-gallery-templates",
    "asciimorph-generator-presets",
  ].includes(key);
export const MAX_LIBRARY_BYTES = 240_000_000;
function assertBackupSize(text: string, byteLimit: number) {
  if (
    text.length > byteLimit ||
    new TextEncoder().encode(text).byteLength > byteLimit
  )
    throw new Error(
      "Library backup exceeds the restore budget (240 MB). Export individual projects before removing unneeded local copies.",
    );
}
export async function exportLibrary(byteLimit = MAX_LIBRARY_BYTES) {
  const docs = await listProjects(),
    animations: AnimationProject[] = [],
    artworks: LibraryBackup["artworks"] = [];
  for (const doc of docs)
    artworks.push({ document: doc, snapshots: await getSnapshots(doc.id) });
  for (const row of await listAnimations()) {
    const project = await loadAnimation(row.id);
    if (project) animations.push(project);
  }
  const preferences: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (isPreference(key)) preferences[key] = localStorage.getItem(key)!;
  }
  const archive: LibraryBackup = {
    kind: "asciimorph-library",
    version: 1,
    createdAt: new Date().toISOString(),
    artworks,
    animations,
    details: allDetails(),
    preferences,
  };
  if (artworks.length + animations.length > 2000)
    throw new Error(
      "Library backup exceeds the restore budget (2,000 projects). Export individual projects first.",
    );
  const data = JSON.stringify(archive);
  assertBackupSize(data, byteLimit);
  return data;
}
export function markBackupDownloaded() {
  localStorage.setItem(LAST_BACKUP, new Date().toISOString());
}
export function lastBackupAt() {
  return localStorage.getItem(LAST_BACKUP);
}
export function parseLibrary(
  text: string,
  byteLimit = MAX_LIBRARY_BYTES,
): LibraryBackup {
  assertBackupSize(text, byteLimit);
  const value = JSON.parse(text) as LibraryBackup;
  if (
    !value ||
    value.kind !== "asciimorph-library" ||
    value.version !== 1 ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Array.isArray(value.artworks) ||
    !Array.isArray(value.animations) ||
    value.artworks.length + value.animations.length > 2000
  )
    throw new Error("Invalid library backup.");
  const artworks = value.artworks.map((item) => {
    if (!item || !Array.isArray(item.snapshots) || item.snapshots.length > 100)
      throw new Error("Invalid recovery snapshots.");
    const document = validateDocument(item.document);
    const snapshots = item.snapshots.map((row) => {
      if (
        !row ||
        typeof row.id !== "string" ||
        typeof row.data !== "string" ||
        row.documentId !== document.id ||
        !Number.isFinite(Date.parse(row.savedAt))
      )
        throw new Error("Invalid recovery snapshot.");
      const snapshot = parseDocument(row.data);
      if (snapshot.id !== document.id)
        throw new Error("Snapshot does not belong to its project.");
      return { ...row, data: JSON.stringify(snapshot) };
    });
    return { document, snapshots };
  });
  const animations = value.animations.map(validateAnimation);
  const keys = [
    ...artworks.map((item) => `artwork:${item.document.id}`),
    ...animations.map((item) => `animation:${item.id}`),
  ];
  if (new Set(keys).size !== keys.length)
    throw new Error("Duplicate project IDs in backup.");
  if (
    !value.details ||
    typeof value.details !== "object" ||
    Array.isArray(value.details) ||
    !value.preferences ||
    typeof value.preferences !== "object" ||
    Array.isArray(value.preferences)
  )
    throw new Error("Invalid library metadata.");
  const details = Object.fromEntries(
    Object.entries(value.details).map(([key, item]) => [
      key,
      validatedDetails(item),
    ]),
  );
  const preferences = Object.fromEntries(
    Object.entries(value.preferences).map(([key, item]) => {
      if (
        !isPreference(key) ||
        typeof item !== "string" ||
        item.length > 40_000_000
      )
        throw new Error("Invalid workspace preferences.");
      validateBackupPreference(key, item);
      return [key, item];
    }),
  );
  return { ...value, artworks, animations, details, preferences };
}
export async function importLibrary(text: string) {
  const backup = parseLibrary(text); // Complete validation before the first write.
  const keyMap = new Map<string, string>([
    ...backup.artworks.map(
      (item) =>
        [`artwork:${item.document.id}`, `artwork:${crypto.randomUUID()}`] as [
          string,
          string,
        ],
    ),
    ...backup.animations.map(
      (item) =>
        [`animation:${item.id}`, `animation:${crypto.randomUUID()}`] as [
          string,
          string,
        ],
    ),
  ]);
  const preferenceWrites = prepareBackupPreferences(backup.preferences, keyMap);
  let artworks = 0,
    animations = 0;
  try {
    for (const item of backup.artworks) {
      const id = keyMap.get(`artwork:${item.document.id}`)!.slice(8);
      await saveProject({ ...item.document, id });
      await importSnapshots(id, item.snapshots);
      keyMap.set(`artwork:${item.document.id}`, `artwork:${id}`);
      artworks++;
    }
    for (const project of backup.animations) {
      const id = keyMap.get(`animation:${project.id}`)!.slice(10);
      await saveAnimation({
        ...project,
        id,
        frames: project.frames.map((frame) => ({
          ...frame,
          doc: { ...frame.doc, id: crypto.randomUUID() },
        })),
      });
      keyMap.set(`animation:${project.id}`, `animation:${id}`);
      animations++;
    }
    for (const [key, details] of Object.entries(backup.details)) {
      const importedKey = keyMap.get(key);
      if (importedKey) setProjectDetails(importedKey, details);
    }
    // Restore additive collections while preserving current tool settings.
    for (const [key, value] of preferenceWrites)
      localStorage.setItem(key, value);
  } catch (error) {
    throw new Error(
      `Import stopped after ${artworks} artworks and ${animations} animations. Existing projects are preserved; some new copies may be present. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return { artworks, animations };
}
