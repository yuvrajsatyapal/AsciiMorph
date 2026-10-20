import {
  createDocument,
  validateDocument,
  type AsciiDocument,
} from "@/core/document";
export interface AnimationFrame {
  doc: AsciiDocument;
  duration: number;
}
export interface AnimationProject {
  version: 1;
  kind: "asciimorph-animation";
  id: string;
  name: string;
  frames: AnimationFrame[];
}
export const MAX_FRAMES = 120,
  MAX_FRAME_CELLS = 1_000_000,
  MAX_ANIMATION_BYTES = 80_000_000;
export function validateAnimation(value: unknown): AnimationProject {
  return validateAnimationData(value);
}
/** Internal immutable edits may reuse documents from the already validated project. */
export function validateAnimationChange(
  previous: AnimationProject,
  next: AnimationProject,
): AnimationProject {
  return validateAnimationData(
    next,
    new Set(previous.frames.map((frame) => frame.doc)),
  );
}
function validateAnimationData(
  value: unknown,
  trustedDocuments?: ReadonlySet<AsciiDocument>,
): AnimationProject {
  if (!value || typeof value !== "object")
    throw new Error("Invalid animation project.");
  const p = value as Record<string, unknown>;
  if (p.version !== 1 || p.kind !== "asciimorph-animation")
    throw new Error("Unsupported animation version.");
  if (
    typeof p.id !== "string" ||
    !p.id.trim() ||
    p.id.length > 128 ||
    typeof p.name !== "string" ||
    !p.name.trim() ||
    p.name.length > 120
  )
    throw new Error("Invalid animation name or ID.");
  if (
    !Array.isArray(p.frames) ||
    !p.frames.length ||
    p.frames.length > MAX_FRAMES
  )
    throw new Error(`Animation needs 1–${MAX_FRAMES} frames.`);
  let cells = 0,
    total = 0;
  let geometry = "";
  // Reject aggregate resource limits before copying any documents.
  for (const item of p.frames) {
    if (!item || typeof item !== "object")
      throw new Error("Invalid animation frame.");
    const f = item as AnimationFrame;
    if (
      typeof f.duration !== "number" ||
      !Number.isInteger(f.duration) ||
      f.duration < 20 ||
      f.duration > 10000
    )
      throw new Error("Frame duration must be 20–10,000 milliseconds.");
    const d = f.doc;
    if (
      !d ||
      !Array.isArray(d.layers) ||
      !Number.isInteger(d.width) ||
      !Number.isInteger(d.height)
    )
      throw new Error("Invalid frame document.");
    cells += d.width * d.height * d.layers.length;
    total += f.duration;
    if (cells > MAX_FRAME_CELLS || total > 120000)
      throw new Error(
        "Animation exceeds the 1,000,000 cell or two minute budget.",
      );
    const key = [d.width, d.height, d.cellWidth, d.cellHeight].join(":");
    if (geometry && geometry !== key)
      throw new Error("All frames must share canvas and cell dimensions.");
    geometry = key;
  }
  return {
    version: 1,
    kind: "asciimorph-animation",
    id: p.id,
    name: p.name,
    frames: p.frames.map((item) => {
      const f = item as AnimationFrame;
      return {
        doc: trustedDocuments?.has(f.doc) ? f.doc : validateDocument(f.doc),
        duration: f.duration,
      };
    }),
  };
}
export function createAnimation(
  frames: AnimationFrame[] = [{ doc: createDocument(40, 20), duration: 100 }],
): AnimationProject {
  return validateAnimation({
    version: 1,
    kind: "asciimorph-animation",
    id: crypto.randomUUID(),
    name: "Untitled animation",
    frames,
  });
}
export function serializeAnimation(project: AnimationProject) {
  const data = JSON.stringify(validateAnimation(project));
  if (data.length > MAX_ANIMATION_BYTES)
    throw new Error("Animation file exceeds 80 MB.");
  return data;
}
export function parseAnimation(text: string) {
  if (text.length > MAX_ANIMATION_BYTES)
    throw new Error("Animation file exceeds 80 MB.");
  return validateAnimation(JSON.parse(text));
}
export function duplicateFrame(project: AnimationProject, index: number) {
  const source = project.frames[index];
  if (!source) return project;
  const frames = [...project.frames];
  frames.splice(index + 1, 0, {
    doc: validateDocument(source.doc),
    duration: source.duration,
  });
  return validateAnimation({ ...project, frames });
}
export function removeFrame(project: AnimationProject, index: number) {
  return project.frames.length === 1 || !project.frames[index]
    ? project
    : { ...project, frames: project.frames.filter((_, i) => i !== index) };
}
export function moveFrame(
  project: AnimationProject,
  index: number,
  delta: number,
) {
  const target = index + delta;
  if (
    !project.frames[index] ||
    !Number.isInteger(target) ||
    target < 0 ||
    target >= project.frames.length
  )
    return project;
  const frames = [...project.frames];
  frames.splice(target, 0, frames.splice(index, 1)[0]);
  return { ...project, frames };
}
export function frameAt(project: AnimationProject, elapsed: number) {
  const total = project.frames.reduce((sum, f) => sum + f.duration, 0);
  let time = ((elapsed % total) + total) % total;
  for (let i = 0; i < project.frames.length; i++) {
    if (time < project.frames[i].duration) return i;
    time -= project.frames[i].duration;
  }
  return 0;
}
