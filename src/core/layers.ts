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
  patch: Partial<
    Pick<
      Layer,
      | "name"
      | "visible"
      | "locked"
      | "opacity"
      | "blendMode"
      | "groupId"
      | "adjustments"
    >
  >,
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
      ...(source.mask ? { mask: source.mask.slice() } : {}),
      ...(source.adjustments
        ? { adjustments: source.adjustments.slice() }
        : {}),
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

export function setLayerMask(
  doc: AsciiDocument,
  id: string,
  mask: number[] | undefined,
): AsciiDocument {
  if (
    mask &&
    (mask.length !== doc.width * doc.height ||
      mask.some((v) => !Number.isFinite(v) || v < 0 || v > 1))
  )
    throw new Error("Mask must contain one coverage value (0–1) per cell.");
  return {
    ...doc,
    layers: doc.layers.map((l) =>
      l.id === id ? { ...l, mask: mask?.slice() } : l,
    ),
  };
}
export function adjustmentColor(color: string, effect: LayerEffect): string {
  const hex = color.slice(1);
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  const rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  const gray = Math.round(rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722);
  return (
    "#" +
    rgb
      .map((v) =>
        (effect === "invert" ? 255 - v : gray).toString(16).padStart(2, "0"),
      )
      .join("")
  );
}
export function resolvedLayers(doc: AsciiDocument): Layer[] {
  return doc.layers.flatMap((layer) => {
    const group = doc.layerGroups?.find((g) => g.id === layer.groupId);
    if (!layer.visible || !layer.opacity || group?.visible === false) return [];
    const opacity = layer.opacity * (group?.opacity ?? 1);
    if (!layer.mask && !layer.adjustments?.length && !group) return [layer];
    return [
      {
        ...layer,
        opacity,
        cells: layer.cells.map((c, i) => {
          let cell = { ...c, alpha: c.alpha * (layer.mask?.[i] ?? 1) };
          for (const effect of layer.adjustments ?? [])
            cell =
              effect === "fade"
                ? { ...cell, alpha: cell.alpha * 0.75 }
                : {
                    ...cell,
                    fg: adjustmentColor(cell.fg, effect),
                    bg: cell.bg ? adjustmentColor(cell.bg, effect) : null,
                  };
          return cell;
        }),
      },
    ];
  });
}
export function addLayerGroup(
  doc: AsciiDocument,
  name = "New group",
): AsciiDocument {
  if ((doc.layerGroups?.length ?? 0) >= 32) return doc;
  const group = { id: crypto.randomUUID(), name, visible: true, opacity: 1 };
  return {
    ...doc,
    layerGroups: [...(doc.layerGroups ?? []), group],
    layers: doc.layers.map((l) =>
      l.id === activeLayer(doc).id ? { ...l, groupId: group.id } : l,
    ),
  };
}
export function blendColor(
  bottom: string,
  top: string,
  alpha: number,
  mode = "normal",
) {
  const rgb = (v: string) => {
    let h = v.slice(1);
    if (h.length === 3)
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  };
  const b = rgb(bottom),
    t = rgb(top);
  return (
    "#" +
    b
      .map((v, i) => {
        const u = t[i];
        const mixed =
          mode === "multiply"
            ? v * u
            : mode === "screen"
              ? 1 - (1 - v) * (1 - u)
              : mode === "overlay"
                ? v < 0.5
                  ? 2 * v * u
                  : 1 - 2 * (1 - v) * (1 - u)
                : u;
        return Math.round(255 * (v * (1 - alpha) + mixed * alpha))
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}
// ASCII cells hold one grapheme. Merge bakes effects and keeps the upper nonblank glyph.
export function mergeLayerDown(doc: AsciiDocument, id: string): AsciiDocument {
  const index = doc.layers.findIndex((l) => l.id === id);
  if (index < 1) return doc;
  const top = doc.layers[index],
    bottom = doc.layers[index - 1];
  if (top.locked || bottom.locked)
    throw new Error("Unlock both layers before merging.");
  if (top.groupId !== bottom.groupId)
    throw new Error("Move both layers into the same group before merging.");
  if (
    [top, bottom].some(
      (layer) => layer.blendMode && layer.blendMode !== "normal",
    )
  )
    throw new Error(
      "Set both layers to Normal blend mode before merging; other blend modes depend on the layers beneath them.",
    );
  const resolved = resolvedLayers({
    ...doc,
    layerGroups: undefined,
    layers: [
      { ...bottom, groupId: undefined },
      { ...top, groupId: undefined },
    ],
  });
  const b = resolved.find((l) => l.id === bottom.id),
    t = resolved.find((l) => l.id === top.id);
  const cells = bottom.cells.map((_, i) => {
    const low = b?.cells[i],
      high = t?.cells[i];
    const la = low ? low.alpha * (b?.opacity ?? 1) : 0,
      ha = high ? high.alpha * (t?.opacity ?? 1) : 0;
    const visibleHigh =
      high && (high.char !== " " || high.bg !== null) && ha > 0;
    const a = visibleHigh ? ha + la * (1 - ha) : la;
    if (!visibleHigh) return low ? { ...low, alpha: la } : blankCell();
    return {
      char: high.char !== " " ? high.char : ha === 1 ? " " : (low?.char ?? " "),
      fg: blendColor(
        low?.fg ?? high.fg,
        high.fg,
        la ? ha / (a || 1) : 1,
        top.blendMode,
      ),
      bg: high.bg
        ? blendColor(low?.bg ?? high.bg, high.bg, ha, top.blendMode)
        : (low?.bg ?? null),
      alpha: a,
    };
  });
  const merged: Layer = {
    ...bottom,
    visible: true,
    opacity: 1,
    cells,
    mask: undefined,
    adjustments: undefined,
  };
  const layers = [...doc.layers];
  layers.splice(index - 1, 2, merged);
  return { ...doc, layers, activeLayerId: merged.id };
}
