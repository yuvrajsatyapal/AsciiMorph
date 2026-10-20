import { graphemes, validateDocument, type Cell } from "@/core/document";
import { validateAnimation, type AnimationProject } from "./project";
export interface AnimationSnapshot {
  project: AnimationProject;
  selection: number[];
  active: number;
}
function indices(project: AnimationProject, selection: number[]) {
  if (
    !selection.length ||
    selection.some(
      (i) => !Number.isInteger(i) || i < 0 || i >= project.frames.length,
    )
  )
    throw new Error("Invalid frame selection.");
  return [...new Set(selection)].sort((a, b) => a - b);
}
export function selectRange(anchor: number, end: number, count: number) {
  const start = Math.max(0, Math.min(anchor, end)),
    last = Math.min(count - 1, Math.max(anchor, end));
  return Array.from(
    { length: Math.max(0, last - start + 1) },
    (_, i) => start + i,
  );
}
export function duplicateFrames(
  project: AnimationProject,
  selection: number[],
) {
  const chosen = indices(project, selection),
    after = chosen.at(-1)! + 1,
    frames = [...project.frames];
  frames.splice(
    after,
    0,
    ...chosen.map((i) => ({
      doc: validateDocument(project.frames[i].doc),
      duration: project.frames[i].duration,
    })),
  );
  return validateAnimation({ ...project, frames });
}
export function deleteFrames(project: AnimationProject, selection: number[]) {
  const chosen = new Set(indices(project, selection));
  const frames = project.frames.filter((_, i) => !chosen.has(i));
  return { ...project, frames: frames.length ? frames : [project.frames[0]] };
}
/** target is a gap in the original timeline, from 0 through frame count. */
export function reorderFrames(
  project: AnimationProject,
  selection: number[],
  target: number,
) {
  const chosen = indices(project, selection);
  if (!Number.isInteger(target) || target < 0 || target > project.frames.length)
    throw new Error("Invalid frame destination.");
  const keep = project.frames.filter((_, i) => !chosen.includes(i)),
    at = target - chosen.filter((i) => i < target).length;
  keep.splice(at, 0, ...chosen.map((i) => project.frames[i]));
  return { ...project, frames: keep };
}
export function drawFrameCells(
  project: AnimationProject,
  index: number,
  points: { x: number; y: number }[],
  brush: Pick<Cell, "char" | "fg" | "bg">,
) {
  const frame = project.frames[index];
  if (!frame) throw new Error("Frame is unavailable.");
  const doc = frame.doc,
    layer =
      doc.layers.find((l) => l.id === doc.activeLayerId) || doc.layers.at(-1)!;
  if (layer.locked || !layer.visible)
    throw new Error(
      "Select a visible, unlocked layer in Studio before drawing.",
    );
  const char = graphemes(brush.char)[0] || " ",
    cells = [...layer.cells];
  for (const { x, y } of points)
    if (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      y >= 0 &&
      x < doc.width &&
      y < doc.height
    )
      cells[y * doc.width + x] = { ...brush, char, alpha: 1 };
  const updated = validateDocument({
    ...doc,
    updatedAt: new Date().toISOString(),
    layers: doc.layers.map((l) => (l.id === layer.id ? { ...l, cells } : l)),
  });
  return {
    ...project,
    frames: project.frames.map((f, i) =>
      i === index ? { ...f, doc: updated } : f,
    ),
  };
}
interface HistoryEntry {
  snapshot: AnimationSnapshot;
  bytes: number;
}
/**
 * Conservative working estimate, not a browser heap measurement. Count every
 * snapshot independently, even when immutable documents share references.
 * Include maximum validated cell strings, masks and retained conversion sources.
 */
function snapshotBytes({ project, selection }: AnimationSnapshot) {
  let bytes = 1024 + selection.length * 8;
  for (const { doc } of project.frames) {
    bytes += 4096 + (doc.conversion?.source.data.length ?? 0) * 2;
    bytes += (doc.layerGroups?.length ?? 0) * 512;
    for (const layer of doc.layers)
      bytes += 1024 + layer.cells.length * 320 + (layer.mask?.length ?? 0) * 8;
  }
  return bytes;
}
/** Snapshots must remain immutable. Undo and redo share one estimated 24 MB budget. */
export class AnimationHistory {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  constructor(
    private limit = 40,
    private byteBudget = 24_000_000,
  ) {
    if (
      !Number.isInteger(limit) ||
      limit < 0 ||
      !Number.isFinite(byteBudget) ||
      byteBudget < 0
    )
      throw new Error("Invalid animation history budget.");
  }
  get retainedBytes() {
    return [...this.past, ...this.future].reduce(
      (sum, entry) => sum + entry.bytes,
      0,
    );
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  clear() {
    this.past = [];
    this.future = [];
  }
  private entry(snapshot: AnimationSnapshot): HistoryEntry {
    return {
      snapshot: { ...snapshot, selection: [...snapshot.selection] },
      bytes: snapshotBytes(snapshot),
    };
  }
  private trim(preferred: HistoryEntry[], other: HistoryEntry[]) {
    while (
      this.past.length + this.future.length > this.limit ||
      this.retainedBytes > this.byteBudget
    ) {
      // Discard the most distant undo/redo step, preserving the nearest steps.
      if (other.length) other.shift();
      else preferred.shift();
    }
  }
  commit(snapshot: AnimationSnapshot) {
    this.future = [];
    this.past.push(this.entry(snapshot));
    this.trim(this.past, this.future);
  }
  undo(current: AnimationSnapshot) {
    const previous = this.past.pop();
    if (previous) {
      const entry = this.entry(current);
      if (entry.bytes <= this.byteBudget) this.future.push(entry);
      else this.future = [];
      this.trim(this.future, this.past);
    }
    return previous?.snapshot;
  }
  redo(current: AnimationSnapshot) {
    const next = this.future.pop();
    if (next) {
      const entry = this.entry(current);
      if (entry.bytes <= this.byteBudget) this.past.push(entry);
      else this.past = [];
      this.trim(this.past, this.future);
    }
    return next?.snapshot;
  }
}
