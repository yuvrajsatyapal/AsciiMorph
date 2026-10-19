"use client";
import type { EditorController } from "@/editor/use-editor";
import {
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
              {l.name}
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
      <h3>Layer effects</h3>
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
