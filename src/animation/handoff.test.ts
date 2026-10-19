import "fake-indexeddb/auto";
import { beforeEach, expect, it } from "vitest";
import { workspace } from "@/editor/store";
import { createDocument } from "@/core/document";
import { createAnimation } from "./project";
import {
  editAnimationFrame,
  frameEditFor,
  updateAnimationFrame,
} from "./handoff";
import { loadAnimation, saveAnimation } from "./persistence";
beforeEach(() => {
  sessionStorage.clear();
});
it("round trips an edited frame and preserves other frames and timing", async () => {
  workspace.getState().open(createDocument(2, 1, "Existing draft"));
  const p = createAnimation([
    { doc: createDocument(2, 1), duration: 120 },
    { doc: createDocument(2, 1), duration: 340 },
  ]);
  const studio = await editAnimationFrame(p, 1);
  expect(frameEditFor(studio.id)?.index).toBe(1);
  const edited = {
    ...studio,
    layers: studio.layers.map((l) => ({
      ...l,
      cells: l.cells.map((c, i) => (i === 0 ? { ...c, char: "X" } : c)),
    })),
  };
  workspace.getState().commit(edited);
  await updateAnimationFrame(edited);
  const restored = await loadAnimation();
  expect(restored?.frames[0]).toEqual(p.frames[0]);
  expect(restored?.frames[1].duration).toBe(340);
  expect(restored?.frames[1].doc.layers[0].cells[0].char).toBe("X");
  expect(frameEditFor("unrelated")).toBeNull();
});
it("refuses a stale editing link after the timeline changes", async () => {
  const p = createAnimation();
  const studio = await editAnimationFrame(p, 0);
  await saveAnimation({ ...p, name: "Changed elsewhere" });
  await expect(updateAnimationFrame(studio)).rejects.toThrow("changed");
});
