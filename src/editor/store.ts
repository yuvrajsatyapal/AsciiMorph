import { createStore } from "zustand/vanilla";
import type { AsciiDocument } from "@/core/document";
export interface Workspace {
  documents: Record<string, AsciiDocument>;
  activeId: string | null;
  past: AsciiDocument[];
  future: AsciiDocument[];
  revision: number;
  open: (doc: AsciiDocument) => void;
  commit: (doc: AsciiDocument, group?: boolean) => void;
  undo: () => void;
  redo: () => void;
}
const estimate = (d: AsciiDocument) =>
  d.width * d.height * d.layers.length * 64;
export function createWorkspace(limit = 80) {
  return createStore<Workspace>((set, get) => ({
    documents: {},
    activeId: null,
    past: [],
    future: [],
    revision: 0,
    open: (doc) =>
      set((s) => ({
        documents: { ...s.documents, [doc.id]: doc },
        activeId: doc.id,
        past: [],
        future: [],
        revision: s.revision + 1,
      })),
    commit: (doc, group = false) => {
      const s = get(),
        old = s.activeId ? s.documents[s.activeId] : null;
      if (!old || doc === old) return;
      const past = group ? [...s.past] : [...s.past, old];
      while (
        past.length > limit ||
        past.reduce((sum, d) => sum + estimate(d), 0) > 24_000_000
      )
        past.shift();
      set({
        documents: {
          ...s.documents,
          [doc.id]: { ...doc, updatedAt: new Date().toISOString() },
        },
        past,
        future: [],
        revision: s.revision + 1,
      });
    },
    undo: () => {
      const s = get(),
        prev = s.past.at(-1);
      if (!prev || !s.activeId) return;
      set({
        documents: { ...s.documents, [s.activeId]: prev },
        past: s.past.slice(0, -1),
        future: [s.documents[s.activeId], ...s.future],
        revision: s.revision + 1,
      });
    },
    redo: () => {
      const s = get(),
        next = s.future[0];
      if (!next || !s.activeId) return;
      set({
        documents: { ...s.documents, [s.activeId]: next },
        past: [...s.past, s.documents[s.activeId]],
        future: s.future.slice(1),
        revision: s.revision + 1,
      });
    },
  }));
}
export const workspace = createWorkspace();
