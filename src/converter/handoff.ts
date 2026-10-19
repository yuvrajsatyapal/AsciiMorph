import { type AsciiDocument, validateDocument } from "@/core/document";
import { workspace } from "@/editor/store";
import { saveProject } from "@/editor/persistence";
type Save = (doc: AsciiDocument) => Promise<void>;
let queue: Promise<void> = Promise.resolve();
function sequential<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work);
  queue = result.then(
    () => {},
    () => {},
  );
  return result;
}
export function saveActiveDraft(save: Save = saveProject) {
  return sequential(async () => {
    const state = workspace.getState(),
      doc = state.activeId ? state.documents[state.activeId] : null;
    if (doc) await save(doc);
    const now = workspace.getState();
    if (doc && (now.activeId !== doc.id || now.documents[doc.id] !== doc))
      throw new Error("Artwork changed while saving. Please retry.");
  });
}
export function openInStudio(result: AsciiDocument, save: Save = saveProject) {
  return sequential(async () => {
    const state = workspace.getState(),
      old = state.activeId ? state.documents[state.activeId] : null;
    if (old) await save(old);
    const now = workspace.getState();
    if (old && (now.activeId !== old.id || now.documents[old.id] !== old))
      throw new Error("Artwork changed while saving. Please retry.");
    const timestamp = new Date().toISOString();
    const doc = validateDocument({
      ...result,
      id: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await save(doc);
    const latest = workspace.getState();
    if (
      latest.activeId !== state.activeId ||
      (old && latest.documents[old.id] !== old)
    )
      throw new Error("Artwork changed while saving. Please retry.");
    workspace.getState().open(doc);
    return doc;
  });
}
