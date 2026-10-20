import {
  parseDocument,
  serializeDocument,
  type AsciiDocument,
} from "@/core/document";
export interface Snapshot {
  id: string;
  documentId: string;
  savedAt: string;
  data: string;
}
let connection: Promise<IDBDatabase> | null = null;
function database() {
  if (!connection)
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("asciimorph", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore("documents", { keyPath: "id" });
        const snapshots = db.createObjectStore("snapshots", { keyPath: "id" });
        snapshots.createIndex("documentId", "documentId");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        connection = null;
        reject(req.error || new Error("Browser storage is unavailable"));
      };
      req.onblocked = () => {
        connection = null;
        reject(
          new Error(
            "Storage is blocked by another tab. Close older AsciiMorph tabs and retry.",
          ),
        );
      };
    });
  return connection;
}
function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(tx.error || new Error("Save transaction aborted"));
    tx.onerror = () => reject(tx.error || new Error("Save transaction failed"));
  });
}
export async function saveProject(doc: AsciiDocument) {
  const data = serializeDocument(doc);
  const db = await database();
  const tx = db.transaction(["documents", "snapshots"], "readwrite");
  const completed = done(tx);
  const snapshots = tx.objectStore("snapshots");
  const existing = (await request(
    snapshots.index("documentId").getAll(doc.id),
  )) as Snapshot[];
  existing.sort(
    (a, b) => b.savedAt.localeCompare(a.savedAt) || b.id.localeCompare(a.id),
  );
  tx.objectStore("documents").put({
    id: doc.id,
    updatedAt: doc.updatedAt,
    data,
  });
  if (existing[0]?.data !== data) {
    snapshots.put({
      id: crypto.randomUUID(),
      documentId: doc.id,
      savedAt: new Date().toISOString(),
      data,
    });
    for (const old of existing.slice(9)) snapshots.delete(old.id);
  }
  await completed;
}
export async function readProject(id: string) {
  const db = await database();
  const row = (await request(
    db.transaction("documents").objectStore("documents").get(id),
  )) as { data: string } | undefined;
  return row ? parseDocument(row.data) : null;
}
export async function listProjects(): Promise<AsciiDocument[]> {
  const db = await database();
  const rows = (await request(
    db.transaction("documents").objectStore("documents").getAll(),
  )) as { data: string }[];
  return rows
    .map((row) => parseDocument(row.data))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function getSnapshots(documentId: string): Promise<Snapshot[]> {
  const db = await database();
  const rows = (await request(
    db
      .transaction("snapshots")
      .objectStore("snapshots")
      .index("documentId")
      .getAll(documentId),
  )) as Snapshot[];
  return rows.reverse().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
export async function restoreSnapshot(id: string): Promise<AsciiDocument> {
  const db = await database();
  const row = (await request(
    db.transaction("snapshots").objectStore("snapshots").get(id),
  )) as Snapshot | undefined;
  if (!row) throw new Error("Snapshot is no longer available");
  const doc = parseDocument(row.data);
  const now = new Date().toISOString();
  return {
    ...doc,
    id: crypto.randomUUID(),
    name: `${doc.name.slice(0, 100)} recovered`,
    createdAt: now,
    updatedAt: now,
  };
}
export async function recoveryDownload(): Promise<string> {
  const db = await database();
  const rows = await request(
    db.transaction("documents").objectStore("documents").getAll(),
  );
  return JSON.stringify(rows, null, 2);
}

export async function deleteProject(id: string) {
  const db = await database();
  const tx = db.transaction(["documents", "snapshots"], "readwrite");
  const completed = done(tx);
  tx.objectStore("documents").delete(id);
  const store = tx.objectStore("snapshots");
  const rows = await request(store.index("documentId").getAllKeys(id));
  rows.forEach((key) => store.delete(key));
  await completed;
}
/** Restore recovery rows on a newly imported project without accumulating its temporary save snapshot. */
export async function importSnapshots(documentId: string, source: Snapshot[]) {
  if (!source.length) return;
  const rows = source.map(row => ({
    id: crypto.randomUUID(), documentId,
    savedAt: row.savedAt,
    data: serializeDocument({ ...parseDocument(row.data), id: documentId }),
  }));
  const db = await database();
  const tx = db.transaction("snapshots", "readwrite"), completed = done(tx);
  const store = tx.objectStore("snapshots");
  const existing = await request(store.index("documentId").getAllKeys(documentId));
  existing.forEach(key => store.delete(key));
  rows.forEach(row => store.put(row));
  await completed;
}
