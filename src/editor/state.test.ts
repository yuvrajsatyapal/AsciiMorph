import { describe, it, expect, afterEach, vi } from "vitest";
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
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
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
  it.each(["same", "backward"] as const)(
    "orders recovery points and deduplicates the latest save with a %s clock",
    async (clock) => {
      const a = createDocument(3, 2);
      const start = Date.parse("2026-10-24T10:00:00.000Z");
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(start);
      const uuid = vi.spyOn(crypto, "randomUUID");
      for (const n of [3, 2, 1])
        uuid.mockReturnValueOnce(
          `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        );
      await saveProject(a);
      if (clock === "backward") vi.setSystemTime(start - 1000);
      const latest = changed(a);
      await saveProject(latest);
      await saveProject(latest);
      const snaps = await getSnapshots(a.id);
      expect(snaps).toHaveLength(2);
      expect((await restoreSnapshot(snaps[0].id)).layers[0].cells[0].char).toBe(
        "#",
      );
      expect((await restoreSnapshot(snaps[1].id)).layers[0].cells[0].char).toBe(
        " ",
      );
      expect(new Date(snaps[0].savedAt).getTime()).toBeGreaterThan(
        new Date(snaps[1].savedAt).getTime(),
      );
    },
  );
  it.each(["same", "backward"] as const)(
    "retains the newest ten saves with a %s clock independent of UUID order",
    async (clock) => {
      const a = createDocument(2, 2);
      const start = Date.parse("2026-10-24T11:00:00.000Z");
      vi.useFakeTimers({ toFake: ["Date"] });
      const uuid = vi.spyOn(crypto, "randomUUID");
      for (let n = 0; n < 12; n++) {
        vi.setSystemTime(start - (clock === "backward" ? n * 1000 : 0));
        uuid.mockReturnValueOnce(
          `00000000-0000-4000-8000-${String(100 - n).padStart(12, "0")}`,
        );
        await saveProject(changed(a, String.fromCharCode(65 + n)));
      }
      const snaps = await getSnapshots(a.id);
      expect(snaps).toHaveLength(10);
      const recovered = [];
      for (const snap of snaps)
        recovered.push(
          (await restoreSnapshot(snap.id)).layers[0].cells[0].char,
        );
      expect(recovered).toEqual([
        "L",
        "K",
        "J",
        "I",
        "H",
        "G",
        "F",
        "E",
        "D",
        "C",
      ]);
    },
  );
});
