import { describe, expect, it } from "vitest";
import { createAnimation } from "./project";
import { DEFAULT_SETTINGS } from "@/converter/settings";
import { createDocument } from "@/core/document";
import {
  AnimationHistory,
  deleteFrames,
  duplicateFrames,
  reorderFrames,
  selectRange,
  drawFrameCells,
} from "./editing";
const fixture = () =>
  createAnimation(
    [0, 1, 2, 3].map((i) => ({
      doc: createDocument(4, 2, `Frame ${i}`),
      duration: 100 + i * 10,
    })),
  );
describe("animation editing", () => {
  it("duplicates a noncontiguous selection independently and keeps order", () => {
    const p = fixture(),
      result = duplicateFrames(p, [2, 0, 2]);
    expect(result.frames.map((f) => f.duration)).toEqual([
      100, 110, 120, 100, 120, 130,
    ]);
    result.frames[3].doc.name = "Changed";
    expect(p.frames[0].doc.name).toBe("Frame 0");
  });
  it("never deletes every frame and rejects invalid selections", () => {
    expect(deleteFrames(fixture(), [0, 1, 2, 3]).frames).toHaveLength(1);
    expect(() => duplicateFrames(fixture(), [-1])).toThrow(/selection/i);
    expect(selectRange(3, 1, 4)).toEqual([1, 2, 3]);
  });
  it("moves selected frames as a stable block and preserves untouched frames", () => {
    expect(
      reorderFrames(fixture(), [0, 2], 4).frames.map((f) => f.duration),
    ).toEqual([110, 130, 100, 120]);
  });
  it("restores project and selection with bounded undo/redo and clears stale redo", () => {
    const h = new AnimationHistory(2),
      p = fixture();
    h.commit({ project: p, selection: [0, 2], active: 2 });
    const changed = deleteFrames(p, [0, 2]);
    const restored = h.undo({ project: changed, selection: [0], active: 0 });
    expect(restored?.selection).toEqual([0, 2]);
    expect(restored?.project.frames).toHaveLength(4);
    expect(h.redo(restored!)?.project.frames).toHaveLength(2);
    h.commit({ project: p, selection: [0], active: 0 });
    expect(h.canRedo).toBe(false);
  });
  it("evicts the oldest snapshots when the combined memory budget is reached", () => {
    const project = fixture();
    const snapshot = (active: number) => ({
      project,
      selection: [active],
      active,
    });
    const probe = new AnimationHistory();
    probe.commit(snapshot(0));
    const budget = probe.retainedBytes * 2;
    const history = new AnimationHistory(40, budget);
    history.commit(snapshot(0));
    history.commit(snapshot(1));
    history.commit(snapshot(2));
    expect(history.retainedBytes).toBeLessThanOrEqual(budget);
    expect(history.undo(snapshot(3))?.active).toBe(2);
    expect(history.undo(snapshot(2))?.active).toBe(1);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
    expect(history.retainedBytes).toBeLessThanOrEqual(budget);
    expect(history.redo(snapshot(1))?.active).toBe(2);
    expect(history.redo(snapshot(2))?.active).toBe(3);
    history.clear();
    expect(history.retainedBytes).toBe(0);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
  it("does not retain an oversized snapshot in either undo or redo", () => {
    const project = fixture(),
      snapshot = { project, selection: [0], active: 0 };
    const history = new AnimationHistory(40, 1);
    history.commit(snapshot);
    expect(history.canUndo).toBe(false);
    expect(history.retainedBytes).toBe(0);
    expect(history.undo(snapshot)).toBeUndefined();
    const small = {
      ...snapshot,
      project: createAnimation([{ doc: createDocument(1, 1), duration: 100 }]),
    };
    const probe = new AnimationHistory();
    probe.commit(small);
    const limited = new AnimationHistory(40, probe.retainedBytes);
    limited.commit(small);
    expect(limited.undo(snapshot)).toBeDefined();
    expect(limited.canRedo).toBe(false);
    expect(limited.retainedBytes).toBe(0);
  });
  it("counts retained source images and masks toward the budget", () => {
    const project = fixture();
    const snapshot = { project, selection: [0], active: 0 };
    const probe = new AnimationHistory();
    probe.commit(snapshot);
    const budget = probe.retainedBytes;
    const history = new AnimationHistory(40, budget);
    const masked = {
      ...project,
      frames: project.frames.map((frame) => ({
        ...frame,
        doc: {
          ...frame.doc,
          layers: frame.doc.layers.map((layer) => ({
            ...layer,
            mask: Array(layer.cells.length).fill(1),
          })),
        },
      })),
    };
    history.commit({ ...snapshot, project: masked });
    expect(history.canUndo).toBe(false);
    const source = {
      ...project,
      frames: [
        {
          ...project.frames[0],
          doc: {
            ...project.frames[0].doc,
            conversion: {
              source: { width: 1, height: 1, data: "x".repeat(budget) },
              settings: DEFAULT_SETTINGS,
            },
          },
        },
      ],
    };
    history.commit({ ...snapshot, project: source });
    expect(history.retainedBytes).toBe(0);
  });
  it("keeps forty small edits and releases redo estimates after a branching edit", () => {
    const history = new AnimationHistory(),
      project = fixture();
    const snapshot = { project, selection: [0], active: 0 };
    for (let i = 0; i < 45; i++) history.commit(snapshot);
    let count = 0;
    while (history.undo(snapshot)) count++;
    expect(count).toBe(40);
    history.commit(snapshot);
    expect(history.canRedo).toBe(false);
    const probe = new AnimationHistory();
    probe.commit(snapshot);
    expect(history.retainedBytes).toBe(probe.retainedBytes);
  });
  it("draws bounded cells without mutating earlier frame snapshots", () => {
    const p = fixture(),
      layer = p.frames[0].doc.layers[0];
    const result = drawFrameCells(
      p,
      0,
      [
        { x: 1, y: 0 },
        { x: 100, y: 0 },
      ],
      { char: "@", fg: "#ff0000", bg: null },
    );
    expect(result.frames[0].doc.layers[0].cells[1]?.char).toBe("@");
    expect(layer.cells[1].char).toBe(" ");
    expect(result.frames[1]).toBe(p.frames[1]);
  });
});
