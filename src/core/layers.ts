import { blankCell, type AsciiDocument, type Layer } from "./document";
export function activeLayer(doc: AsciiDocument) {
  return doc.layers.find((l) => l.id === doc.activeLayerId) || doc.layers[0];
}
export function selectLayer(doc: AsciiDocument, id: string): AsciiDocument {
  return doc.layers.some((l) => l.id === id) && activeLayer(doc).id !== id
    ? { ...doc, activeLayerId: id }
    : doc;
}
export function addLayer(doc: AsciiDocument): AsciiDocument {
  if (doc.layers.length >= 8) return doc;
  const layer: Layer = {
    id: crypto.randomUUID(),
    name: `Layer ${doc.layers.length + 1}`,
    visible: true,
    locked: false,
    opacity: 1,
    cells: Array.from({ length: doc.width * doc.height }, blankCell),
  };
  return { ...doc, layers: [...doc.layers, layer], activeLayerId: layer.id };
}
export function updateLayer(
  doc: AsciiDocument,
  id: string,
  patch: Partial<Pick<Layer, "name" | "visible" | "locked" | "opacity">>,
): AsciiDocument {
  if (
    patch.name !== undefined &&
    (!patch.name.trim() || patch.name.length > 120)
  )
    throw new Error("Layer name must contain 1–120 characters.");
  if (
    patch.opacity !== undefined &&
    (!Number.isFinite(patch.opacity) || patch.opacity < 0 || patch.opacity > 1)
  )
    throw new Error("Opacity must be between 0 and 1.");
  return {
    ...doc,
    layers: doc.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
  };
}
export function duplicateLayer(doc: AsciiDocument, id: string): AsciiDocument {
  const i = doc.layers.findIndex((l) => l.id === id);
  if (i < 0 || doc.layers.length >= 8) return doc;
  const source = doc.layers[i],
    copy = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name.slice(0, 114)} copy`,
      cells: source.cells.map((c) => ({ ...c })),
    };
  const layers = [...doc.layers];
  layers.splice(i + 1, 0, copy);
  return { ...doc, layers, activeLayerId: copy.id };
}
export function deleteLayer(doc: AsciiDocument, id: string): AsciiDocument {
  if (doc.layers.length === 1 || !doc.layers.some((l) => l.id === id))
    return doc;
  const layers = doc.layers.filter((l) => l.id !== id);
  return {
    ...doc,
    layers,
    activeLayerId:
      activeLayer(doc).id === id ? layers.at(-1)!.id : activeLayer(doc).id,
  };
}
export function moveLayer(
  doc: AsciiDocument,
  id: string,
  delta: number,
): AsciiDocument {
  const i = doc.layers.findIndex((l) => l.id === id),
    target = i + delta;
  if (
    i < 0 ||
    !Number.isInteger(target) ||
    target < 0 ||
    target >= doc.layers.length
  )
    return doc;
  const layers = [...doc.layers];
  layers.splice(target, 0, layers.splice(i, 1)[0]);
  return { ...doc, layers };
}
export type LayerEffect = "invert" | "grayscale" | "fade";
export function layerEffect(
  doc: AsciiDocument,
  effect: LayerEffect,
): AsciiDocument {
  const layer = activeLayer(doc);
  if (layer.locked) return doc;
  const convert = (color: string) => {
    const hex = color.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex;
    const rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
    const gray = Math.round(
      rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722,
    );
    return (
      "#" +
      rgb
        .map((v) =>
          (effect === "invert" ? 255 - v : gray).toString(16).padStart(2, "0"),
        )
        .join("")
    );
  };
  return {
    ...doc,
    layers: doc.layers.map((l) =>
      l.id !== layer.id
        ? l
        : {
            ...l,
            cells: l.cells.map((c) =>
              effect === "fade"
                ? { ...c, alpha: c.alpha * 0.75 }
                : { ...c, fg: convert(c.fg), bg: c.bg ? convert(c.bg) : null },
            ),
          },
    ),
  };
}
