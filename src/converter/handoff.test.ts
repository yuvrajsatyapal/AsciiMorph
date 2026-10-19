import { beforeEach, expect, it, vi } from "vitest";
import { workspace } from "@/editor/store";
import {
  createDocument,
  serializeDocument,
  parseDocument,
} from "@/core/document";
import { readProject, saveProject } from "@/editor/persistence";
import { openInStudio, saveActiveDraft } from "./handoff";
beforeEach(() =>
  workspace.setState({ documents: {}, activeId: null, past: [], future: [] }),
);
it("saves pending draft and distinct converted project before opening it", async () => {
  const old = createDocument(2, 1, "Previous draft");
  old.layers[0].cells[0].char = "X";
  workspace.getState().open(old);
  const converted = createDocument(2, 1, "Image");
  converted.layers[0].cells[1] = {
    char: "@",
    fg: "#ff0000",
    bg: null,
    alpha: 0.5,
  };
  const next = await openInStudio(converted);
  expect(next.id).not.toBe(converted.id);
  expect(next.id).not.toBe(old.id);
  expect(await readProject(old.id)).toEqual(old);
  expect(await readProject(next.id)).toEqual(next);
  expect(workspace.getState().activeId).toBe(next.id);
  const changed = parseDocument(serializeDocument(next));
  changed.layers[0].cells[0].char = "Z";
  workspace.getState().commit(changed);
  workspace.getState().undo();
  expect(workspace.getState().documents[next.id]).toEqual(next);
  workspace.getState().redo();
  expect(workspace.getState().documents[next.id].layers[0].cells[0].char).toBe(
    "Z",
  );
});
it("refuses navigation and retains workspace when saving fails", async () => {
  const old = createDocument(1, 1);
  workspace.getState().open(old);
  const fail = vi.fn().mockRejectedValue(new Error("quota"));
  await expect(openInStudio(createDocument(1, 1), fail)).rejects.toThrow(
    "quota",
  );
  expect(workspace.getState().activeId).toBe(old.id);
  expect(fail).toHaveBeenCalledTimes(1);
});
it("serializes concurrent draft saves and blocks handoff if editing continues", async () => {
  const old = createDocument(1, 1);
  workspace.getState().open(old);
  await saveActiveDraft();
  expect(await readProject(old.id)).toEqual(old);
  const changing = async (d: typeof old) => {
    await saveProject(d);
    workspace.getState().commit({ ...old, name: "New change" });
  };
  await expect(openInStudio(createDocument(1, 1), changing)).rejects.toThrow(
    /changed/i,
  );
  expect(workspace.getState().activeId).toBe(old.id);
});
