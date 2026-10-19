import { describe, it, expect, beforeEach } from "vitest";
import { createDocument } from "../core/document";
import { createWorkspace } from "./store";
import {
  saveProject,
  listProjects,
  getSnapshots,
  restoreSnapshot,
  readProject,
} from "./persistence";
const changed = (d: ReturnType<typeof createDocument>, char = "#") => ({
  ...d,
  layers: [
    {
      ...d.layers[0],
      cells: d.layers[0].cells.map((c, i) => (i === 0 ? { ...c, char } : c)),
    },
  ],
});
describe("workspace transactions", () => {
  it("isolates document identity and atomically undoes and redoes", () => {
    const s = createWorkspace();
    const d = createDocument(4, 3);
    s.getState().open(d);
    s.getState().commit(changed(d));
    expect(s.getState().documents[d.id].layers[0].cells[0].char).toBe("#");
    s.getState().undo();
    expect(s.getState().documents[d.id].layers[0].cells[0].char).toBe(" ");
    s.getState().redo();
    expect(s.getState().documents[d.id].layers[0].cells[0].char).toBe("#");
  });
  it("clears redo when a new edit branches from history", () => {
    const s = createWorkspace();
    const d = createDocument(3, 2);
    s.getState().open(d);
    s.getState().commit(changed(d));
    s.getState().undo();
    s.getState().commit(changed(d, "@"));
    expect(s.getState().future).toHaveLength(0);
  });
  it("retains previous documents on opening another", () => {
    const s = createWorkspace();
    const a = createDocument(),
      b = createDocument();
    s.getState().open(a);
    s.getState().open(b);
    expect(Object.keys(s.getState().documents)).toHaveLength(2);
    expect(s.getState().activeId).toBe(b.id);
  });
  it("bounds history and ignores no-op commits", () => {
    const s = createWorkspace(2);
    const a = createDocument(2, 2);
    s.getState().open(a);
    s.getState().commit(a);
    expect(s.getState().past).toHaveLength(0);
    for (const c of ["a", "b", "c"])
      s.getState().commit(changed(s.getState().documents[a.id], c));
    expect(s.getState().past.length).toBeLessThanOrEqual(2);
  });
});
describe("local autosave and snapshots", () => {
  beforeEach(() => {});
  it("stores editable documents and retrieves recovery points", async () => {
    const a = createDocument(3, 2);
    await saveProject(a);
    await saveProject(changed(a));
    expect((await readProject(a.id))?.layers[0].cells[0].char).toBe("#");
    expect((await listProjects()).some((d) => d.id === a.id)).toBe(true);
    const snaps = await getSnapshots(a.id);
    expect(snaps.length).toBe(2);
    const restored = await restoreSnapshot(snaps[snaps.length - 1].id);
    expect(restored.id).not.toBe(a.id);
    expect(restored.layers[0].cells[0].char).toBe(" ");
  });
  it("keeps only ten snapshots per document", async () => {
    const a = createDocument(2, 2);
    for (let n = 0; n < 12; n++) await saveProject(changed(a, String(n % 10)));
    expect((await getSnapshots(a.id)).length).toBe(10);
  });
});
