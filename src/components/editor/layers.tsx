"use client";
import { useRouter } from "next/navigation";
import { requestConversionRevision } from "@/converter/revision";
import { saveActiveDraft } from "@/converter/handoff";
import type { Layer, AsciiDocument } from "@/core/document";
import type { EditorController } from "@/editor/use-editor";
import {
  addLayerGroup,
  mergeLayerDown,
  setLayerMask,
  resolvedLayers,
  activeLayer,
  addLayer,
  deleteLayer,
  duplicateLayer,
  layerEffect,
  moveLayer,
  selectLayer,
  updateLayer,
  type LayerEffect,
} from "@/core/layers";
export function LayerPanel({ e }: { e: EditorController }) {
  const router = useRouter();
  const d = e.doc;
  if (!d) return null;
  const selected = activeLayer(d);
  return (
    <section className="layer-panel">
      <h3>
        Layers <small>{d.layers.length}/8</small>
      </h3>
      <button
        className="button quiet"
        disabled={d.layers.length >= 8}
        onClick={() => {
          e.cancel();
          e.commit(addLayer(d));
        }}
      >
        Add layer
      </button>
      {d.conversion && (
        <button
          className="button quiet"
          onClick={() =>
            void e.run(async () => {
              await saveActiveDraft();
              requestConversionRevision(d);
              router.push("/convert");
            })
          }
        >
          Revise original conversion
        </button>
      )}
      <ol>
        {[...d.layers].reverse().map((l) => (
          <li key={l.id} data-active={l.id === selected.id}>
            <button
              aria-pressed={l.id === selected.id}
              onClick={() => {
                e.cancel();
                e.commit(selectLayer(d, l.id));
              }}
            >
              <LayerThumbnail layer={l} doc={d} />
              {l.name}
              {l.groupId && (
                <small>
                  {" "}
                  · {d.layerGroups?.find((g) => g.id === l.groupId)?.name}
                </small>
              )}
            </button>
            <label>
              <input
                aria-label={`Show ${l.name}`}
                type="checkbox"
                checked={l.visible}
                onChange={(ev) =>
                  e.commit(updateLayer(d, l.id, { visible: ev.target.checked }))
                }
              />
              Show
            </label>
            <label>
              <input
                aria-label={`Lock ${l.name}`}
                type="checkbox"
                checked={l.locked}
                onChange={(ev) =>
                  e.commit(updateLayer(d, l.id, { locked: ev.target.checked }))
                }
              />
              Lock
            </label>
          </li>
        ))}
      </ol>
      <label>
        Layer name
        <input
          key={`${selected.id}-${selected.name}`}
          defaultValue={selected.name}
          maxLength={120}
          onBlur={(ev) =>
            e.run(() =>
              e.commit(updateLayer(d, selected.id, { name: ev.target.value })),
            )
          }
        />
      </label>
      <label>
        Opacity {Math.round(selected.opacity * 100)}%
        <input
          aria-label="Layer opacity"
          type="range"
          min="0"
          max="100"
          value={selected.opacity * 100}
          onChange={(ev) =>
            e.commit(
              updateLayer(d, selected.id, {
                opacity: Number(ev.target.value) / 100,
              }),
            )
          }
        />
      </label>
      <div className="layer-actions">
        <button
          disabled={d.layers.length >= 8}
          onClick={() => e.commit(duplicateLayer(d, selected.id))}
        >
          Duplicate
        </button>
        <button
          disabled={d.layers.length === 1}
          onClick={() => e.commit(deleteLayer(d, selected.id))}
        >
          Delete
        </button>
        <button
          disabled={d.layers.at(-1)?.id === selected.id}
          onClick={() => e.commit(moveLayer(d, selected.id, 1))}
        >
          Raise
        </button>
        <button
          disabled={d.layers[0].id === selected.id}
          onClick={() => e.commit(moveLayer(d, selected.id, -1))}
        >
          Lower
        </button>
      </div>
      <label>
        Blend mode
        <select
          aria-label="Layer blend mode"
          value={selected.blendMode ?? "normal"}
          onChange={(ev) =>
            e.commit(
              updateLayer(d, selected.id, {
                blendMode: ev.target.value as Layer["blendMode"],
              }),
            )
          }
        >
          {["normal", "multiply", "screen", "overlay"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label>
        Group
        <select
          aria-label="Layer group"
          value={selected.groupId ?? ""}
          onChange={(ev) =>
            e.commit(
              updateLayer(d, selected.id, {
                groupId: ev.target.value || undefined,
              }),
            )
          }
        >
          <option value="">No group</option>
          {d.layerGroups?.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={(d.layerGroups?.length ?? 0) >= 32}
        onClick={() =>
          e.commit(
            addLayerGroup(d, `Group ${(d.layerGroups?.length ?? 0) + 1}`),
          )
        }
      >
        Create group
      </button>
      {d.layerGroups?.map((g) => (
        <div className="layer-group-controls" key={g.id}>
          <label>
            <input
              type="checkbox"
              aria-label={`Show group ${g.name}`}
              checked={g.visible}
              onChange={(ev) =>
                e.commit({
                  ...d,
                  layerGroups: d.layerGroups?.map((item) =>
                    item.id === g.id
                      ? { ...item, visible: ev.target.checked }
                      : item,
                  ),
                })
              }
            />
            {g.name}
          </label>
          <label>
            Group opacity
            <input
              type="range"
              aria-label={`${g.name} opacity`}
              min={0}
              max={100}
              value={g.opacity * 100}
              onChange={(ev) =>
                e.commit({
                  ...d,
                  layerGroups: d.layerGroups?.map((item) =>
                    item.id === g.id
                      ? { ...item, opacity: Number(ev.target.value) / 100 }
                      : item,
                  ),
                })
              }
            />
          </label>
          <button
            onClick={() =>
              e.commit({
                ...d,
                layerGroups: d.layerGroups?.filter((item) => item.id !== g.id),
                layers: d.layers.map((l) =>
                  l.groupId === g.id ? { ...l, groupId: undefined } : l,
                ),
              })
            }
          >
            Ungroup {g.name}
          </button>
        </div>
      ))}
      <h3>Cell mask</h3>
      <div className="layer-actions">
        <button
          disabled={!e.selection || selected.locked}
          onClick={() => {
            if (!e.selection) return;
            const r = e.selection;
            e.commit(
              setLayerMask(
                d,
                selected.id,
                selected.cells.map((_, i) =>
                  i % d.width >= r.x &&
                  i % d.width < r.x + r.width &&
                  Math.floor(i / d.width) >= r.y &&
                  Math.floor(i / d.width) < r.y + r.height
                    ? 1
                    : 0,
                ),
              ),
            );
          }}
        >
          Mask to selection
        </button>
        <button
          disabled={!selected.mask || selected.locked}
          onClick={() =>
            e.commit(
              setLayerMask(
                d,
                selected.id,
                selected.mask?.map((v) => 1 - v),
              ),
            )
          }
        >
          Invert mask
        </button>
        <button
          disabled={!selected.mask || selected.locked}
          onClick={() => e.commit(setLayerMask(d, selected.id, undefined))}
        >
          Remove mask
        </button>
      </div>
      <button
        disabled={d.layers[0].id === selected.id || selected.locked}
        onClick={() => e.run(() => e.commit(mergeLayerDown(d, selected.id)))}
      >
        Merge down
      </button>
      <p className="muted">
        Merge bakes effects and keeps the upper glyph where characters overlap.
        Export first to preserve layered appearance.
      </p>
      <h3>Reusable adjustments</h3>
      <div className="layer-actions">
        {(["invert", "grayscale", "fade"] as LayerEffect[]).map((effect) => (
          <button
            key={effect}
            disabled={selected.locked}
            aria-pressed={selected.adjustments?.includes(effect) ?? false}
            onClick={() =>
              e.commit(
                updateLayer(d, selected.id, {
                  adjustments: selected.adjustments?.includes(effect)
                    ? selected.adjustments.filter((v) => v !== effect)
                    : [...(selected.adjustments ?? []), effect],
                }),
              )
            }
          >
            {effect}
          </button>
        ))}
      </div>
      <h3>Apply to cells</h3>
      <div className="layer-actions">
        {(["invert", "grayscale", "fade"] as LayerEffect[]).map((effect) => (
          <button
            disabled={selected.locked}
            key={effect}
            onClick={() => e.commit(layerEffect(d, effect))}
          >
            {effect}
          </button>
        ))}
      </div>
    </section>
  );
}

function LayerThumbnail({ layer, doc }: { layer: Layer; doc: AsciiDocument }) {
  const preview =
    resolvedLayers({
      ...doc,
      layerGroups: undefined,
      layers: [{ ...layer, visible: true, opacity: 1, groupId: undefined }],
    })[0] ?? layer;
  const columns = Math.min(12, doc.width),
    rows = Math.min(6, doc.height);
  return (
    <svg
      className="layer-thumbnail"
      aria-label={`${layer.name} thumbnail`}
      role="img"
      width="72"
      height="36"
      viewBox={`0 0 ${columns * 6} ${rows * 6}`}
    >
      <rect width="100%" height="100%" fill="#101216" />
      {Array.from({ length: rows * columns }, (_, i) => {
        const x = i % columns,
          y = Math.floor(i / columns),
          source =
            Math.floor((y * doc.height) / rows) * doc.width +
            Math.floor((x * doc.width) / columns),
          c = preview.cells[source];
        return (
          <g key={i} opacity={c.alpha}>
            {c.bg && (
              <rect x={x * 6} y={y * 6} width={6} height={6} fill={c.bg} />
            )}
            <text x={x * 6} y={y * 6 + 5} fontSize={6} fill={c.fg}>
              {c.char}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
