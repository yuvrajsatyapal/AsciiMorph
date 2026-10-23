"use client";
import { useEffect, useRef, useState } from "react";
import type {
  PaintedIdentity,
  StudioController,
  StudioSnapshot,
} from "./controller";
import type { StudioRuntime } from "./runtime";
import { paintStudioFrame } from "./viewport";
import { CATALOG, CATEGORIES, type CatalogTile } from "./catalog-data";
import { Icon } from "./toolbar";
function AcceptedThumbnail({
  runtime,
  snapshot,
}: {
  runtime: StudioRuntime;
  snapshot: StudioSnapshot;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const accepted = runtime.getFrame();
    if (
      !accepted ||
      !snapshot.frame ||
      !Object.entries(snapshot.frame).every(
        ([key, value]) =>
          accepted.identity[key as keyof PaintedIdentity] === value,
      )
    )
      return;
    const target = canvas.current!;
    const release = runtime.retainCanvas(target);
    // Yield until the main-stage effects have painted. Thumbnail has no render or
    // source jobs and rechecks identity before touching its own canvas only.
    const paint = () => {
      if (
        runtime.getFrame() !== accepted ||
        runtime.getSnapshot().frame !== snapshot.frame
      )
        return;
      try {
        paintStudioFrame(target, accepted.frame);
        setFailed(false);
      } catch {
        setFailed(true);
      }
    };
    const idle = typeof window.requestIdleCallback === "function";
    const timer = idle
      ? window.requestIdleCallback(paint, { timeout: 200 })
      : window.setTimeout(paint, 16);
    return () => {
      if (idle) window.cancelIdleCallback(timer);
      else window.clearTimeout(timer);
      target.width = target.height = 0;
      release();
    };
  }, [runtime, snapshot.frame]);
  return (
    <>
      <canvas
        ref={canvas}
        aria-label="Accepted Characters thumbnail"
        hidden={failed}
      />
      {failed && (
        <span className="studio-thumbnail-error">Thumbnail unavailable</span>
      )}
    </>
  );
}
function Tile({
  tile,
  controller: c,
  snapshot: s,
  runtime,
}: {
  tile: CatalogTile;
  controller: StudioController;
  snapshot: StudioSnapshot;
  runtime: StudioRuntime;
}) {
  const favorite = s.view.favorites.includes(tile.id);
  return (
    <article className={`studio-tile ${tile.available ? "selected" : ""}`}>
      <button
        className="studio-tile-pick"
        disabled={!tile.available}
        aria-label={
          tile.available
            ? `${tile.label} — selected`
            : `${tile.label} — unavailable`
        }
        aria-pressed={tile.available ? true : undefined}
        onClick={() =>
          c.setView({
            activeGroup: "characters",
            dockOpen: true,
            dockCollapsed: false,
          })
        }
      >
        <span className="studio-tile-visual">
          {tile.available ? (
            <AcceptedThumbnail runtime={runtime} snapshot={s} />
          ) : (
            <span className="studio-placeholder" aria-hidden="true">
              ＋
            </span>
          )}
          <span className="studio-tile-badge">
            {tile.available ? "Live Characters" : "Unavailable"}
          </span>
        </span>
        <span className="studio-tile-title">{tile.label}</span>
      </button>
      <button
        className="studio-favorite"
        aria-label={`${favorite ? "Unfavorite" : "Favorite"} ${tile.label}`}
        aria-pressed={favorite}
        onClick={() =>
          c.setView({
            favorites: favorite
              ? s.view.favorites.filter((id) => id !== tile.id)
              : [...s.view.favorites, tile.id],
          })
        }
      >
        <Icon name="star" />
      </button>
    </article>
  );
}
export function Catalog({
  controller: c,
  snapshot: s,
  runtime,
  collapse,
}: {
  controller: StudioController;
  snapshot: StudioSnapshot;
  runtime: StudioRuntime;
  collapse: () => void;
}) {
  const [category, setCategory] = useState("all"),
    [favorites, setFavorites] = useState(false);
  const filtered = CATALOG.filter(
    (tile) =>
      (!favorites || s.view.favorites.includes(tile.id)) &&
      (category === "all" || tile.category === category) &&
      tile.label.toLowerCase().includes(s.view.search.toLowerCase()),
  );
  const browsing = !s.view.search && !favorites && category === "all";
  const suggested = [...CATALOG]
    .sort(
      (a, b) =>
        Number(b.available) - Number(a.available) ||
        Number(s.view.favorites.includes(b.id)) -
          Number(s.view.favorites.includes(a.id)) ||
        a.order - b.order,
    )
    .slice(0, 3);
  const tile = (t: CatalogTile) => (
    <Tile key={t.id} tile={t} controller={c} snapshot={s} runtime={runtime} />
  );
  return (
    <>
      <header className="studio-panel-heading">
        <span>Styles</span>
        <button aria-label="Collapse style catalog" onClick={collapse}>
          <Icon name="collapse" />
        </button>
      </header>
      <div className="studio-catalog-body">
        <div className="studio-segment">
          <button aria-pressed="true">Realtime</button>
          <button disabled title="Generative services are unavailable">
            Generative
          </button>
        </div>
        <label className="studio-search">
          <Icon name="search" />
          <input
            aria-label="Search styles"
            placeholder="Search styles…"
            value={s.view.search}
            onChange={(e) => c.setView({ search: e.target.value })}
          />
        </label>
        <div className="studio-catalog-tabs">
          <button aria-pressed={!favorites} onClick={() => setFavorites(false)}>
            All styles
          </button>
          <button aria-pressed={favorites} onClick={() => setFavorites(true)}>
            Favorites
          </button>
        </div>
        <label className="studio-category">
          Category
          <select
            aria-label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All categories</option>
            {CATEGORIES.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {browsing && (
          <>
            <h2 className="studio-section-label">Suggested</h2>
            <p className="studio-ranking-note">
              Available first, then favorites
            </p>
            <div className="studio-catalog-grid suggested">
              {suggested.map(tile)}
            </div>
            <h2 className="studio-section-label">Featured</h2>
            <div className="studio-featured">
              {tile(CATALOG.find((t) => t.id === "cyanotype")!)}
            </div>
          </>
        )}
        {filtered.length === 0 ? (
          <p className="studio-note">
            No styles match. Try another category or clear your search.
          </p>
        ) : (
          CATEGORIES.map(([id, label]) => {
            const group = filtered.filter((t) => t.category === id);
            return group.length ? (
              <section key={id}>
                <h2 className="studio-category-heading">{label}</h2>
                <div className="studio-catalog-grid">{group.map(tile)}</div>
              </section>
            ) : null;
          })
        )}
        <p className="studio-note">
          105 styles · 96 modes. Only Characters is available. Other previews
          are neutral placeholders.
        </p>
      </div>
    </>
  );
}
