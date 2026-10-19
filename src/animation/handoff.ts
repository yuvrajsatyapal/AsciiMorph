import { type AsciiDocument, validateDocument } from "@/core/document";
import { openInStudio, saveActiveDraft } from "@/converter/handoff";
import {
  createAnimation,
  serializeAnimation,
  validateAnimation,
  type AnimationFrame,
  type AnimationProject,
} from "./project";
import { loadAnimation, saveAnimation } from "./persistence";
let pending: AnimationProject | null = null;
export async function openAnimation(frames: AnimationFrame[]): Promise<void> {
  const project = createAnimation(frames);
  await saveAnimation(project);
  pending = project;
}
export function consumeAnimation() {
  const result = pending;
  pending = null;
  return result;
}

// A tab-local editing relationship prevents a Studio snapshot from accidentally
// replacing a different animation or a frame that was reordered in another tab.
interface FrameEdit {
  projectId: string;
  index: number;
  studioId: string;
  signature: string;
}
const EDIT_KEY = "asciimorph-frame-edit-v1";
function signature(project: AnimationProject) {
  const text = serializeAnimation(project);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  }
  return `${text.length}:${hash >>> 0}`;
}
export function frameEditFor(studioId: string): FrameEdit | null {
  try {
    const raw = sessionStorage.getItem(EDIT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as FrameEdit;
    if (
      typeof value.projectId !== "string" ||
      typeof value.studioId !== "string" ||
      typeof value.signature !== "string" ||
      !Number.isInteger(value.index) ||
      value.index < 0 ||
      value.studioId !== studioId
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export async function editAnimationFrame(
  project: AnimationProject,
  index: number,
) {
  if (!project.frames[index])
    throw new Error("Select an animation frame first.");
  await saveAnimation(project);
  const studio = await openInStudio(project.frames[index].doc);
  sessionStorage.setItem(
    EDIT_KEY,
    JSON.stringify({
      projectId: project.id,
      index,
      studioId: studio.id,
      signature: signature(project),
    } satisfies FrameEdit),
  );
  return studio;
}
export async function updateAnimationFrame(doc: AsciiDocument) {
  const link = frameEditFor(doc.id);
  if (!link)
    throw new Error("This artwork is not linked to an animation frame.");
  await saveActiveDraft();
  const current = await loadAnimation();
  if (
    !current ||
    current.id !== link.projectId ||
    signature(current) !== link.signature
  )
    throw new Error(
      "The animation changed since this frame was opened. Return to animation and open the frame again to keep all edits.",
    );
  const updated = validateAnimation({
    ...current,
    frames: current.frames.map((f, i) =>
      i === link.index ? { ...f, doc: validateDocument(doc) } : f,
    ),
  });
  await saveAnimation(updated);
  sessionStorage.setItem(
    EDIT_KEY,
    JSON.stringify({ ...link, signature: signature(updated) }),
  );
  return updated;
}
