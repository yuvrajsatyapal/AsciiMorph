import type { AsciiDocument } from "@/core/document";
let pending: AsciiDocument | null = null;
export function requestConversionRevision(doc: AsciiDocument) {
  if (!doc.conversion)
    throw new Error("This project has no retained image source.");
  pending = doc;
}
export function takeConversionRevision() {
  const doc = pending;
  pending = null;
  return doc;
}
