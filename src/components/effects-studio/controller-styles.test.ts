import { describe, expect, it } from "vitest";
import { createStudioController } from "./controller";

describe("Studio style history", () => {
  it("switches accepted styles atomically with unchanged source and complete undo/redo", () => {
    const base = createStudioController().getSnapshot().project;
    const c = createStudioController({
      project: {
        ...base,
        source: { id: "s", revision: 1, width: 2, height: 2 },
      },
    });
    c.patchParameter("brightness", 13);
    expect(c.selectStyle("pixel")).toBe(true);
    expect(c.selectStyle("mosaic")).toBe(true);
    expect(c.selectStyle("unsupported")).toBe(false);
    expect(c.selectStyle("mosaic")).toBe(false);
    expect(c.getSnapshot().revision).toBe(3);
    expect(c.getSnapshot().project.source?.id).toBe("s");
    c.undo();
    expect(c.getSnapshot().project.style.id).toBe("pixel");
    c.undo();
    expect(c.getSnapshot().project.style.id).toBe("characters");
    expect(c.getSnapshot().project.style.parameters.brightness).toBe(13);
    c.redo();
    expect(c.getSnapshot().project.style.id).toBe("pixel");
    expect(JSON.stringify(c.getSnapshot())).not.toMatch(/rgba|atlas|worker/i);
  });
  it("commits a grouped edit before style selection", () => {
    const c = createStudioController();
    c.beginEdit();
    c.patchParameter("contrast", 17);
    expect(c.selectStyle("pixel")).toBe(true);
    expect(c.getSnapshot().history.undoCount).toBe(2);
    c.undo();
    expect(c.getSnapshot().project.style.id).toBe("characters");
    expect(c.getSnapshot().project.style.parameters.contrast).toBe(17);
  });
});
