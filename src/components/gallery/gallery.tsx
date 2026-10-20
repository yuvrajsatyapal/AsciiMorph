"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { type AsciiDocument } from "@/core/document";
import { documentText } from "@/core/render";
import { listProjects } from "@/editor/persistence";
import {
  galleryEntries,
  readCustomTemplates,
  saveCustomTemplate,
  deleteCustomTemplate,
  type CustomTemplate,
  readFavorites,
  searchGallery,
  writeFavorites,
  type GalleryCategory,
} from "@/gallery/catalog";
import {
  GalleryArtwork,
  ArtworkActions,
} from "@/components/typography/artwork";
import "@/components/typography/typography.css";
import "./gallery.css";
const categories: GalleryCategory[] = [
  "All",
  "Geometry",
  "Nature",
  "Characters",
  "Patterns",
  "My creations",
];
export default function Gallery() {
  const [custom, setCustom] = useState<CustomTemplate[]>([]),
    [collection, setCollection] = useState("All"),
    [collectionName, setCollectionName] = useState("My templates"),
    [tags, setTags] = useState("");
  const [projects, setProjects] = useState<AsciiDocument[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GalleryCategory>("All");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [selection, setSelection] = useState("template:orbital");
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => {
      if (!live) return;
      try {
        setFavorites(readFavorites(window.localStorage));
        setCustom(readCustomTemplates(window.localStorage));
      } catch {
        setMessage("Favorites storage is unavailable in this browser.");
      }
      setLoaded(true);
    });
    void listProjects()
      .then((saved) => {
        if (live) setProjects(saved);
      })
      .catch((error: unknown) => {
        if (live) setMessage(`Could not load saved projects: ${String(error)}`);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    const onStorage = () => {
      try {
        if (live) setFavorites(readFavorites(window.localStorage));
      } catch {
        if (live)
          setMessage("Favorites storage is unavailable in this browser.");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      live = false;
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const entries = useMemo(
    () => [
      ...galleryEntries(projects),
      ...custom.map((item) => ({
        id: `custom:${item.id}`,
        name: item.name,
        category: "My creations" as const,
        description: `Reusable template · ${item.collection}`,
        tags: item.tags,
        document: item.document,
      })),
    ],
    [projects, custom],
  );
  const filtered = useMemo(
    () =>
      searchGallery(entries, query, category).filter(
        (entry) =>
          (!onlyFavorites || favorites.includes(entry.id)) &&
          (collection === "All" ||
            custom.some(
              (item) =>
                `custom:${item.id}` === entry.id &&
                item.collection === collection,
            )),
      ),
    [entries, query, category, onlyFavorites, favorites, collection, custom],
  );
  const selected = entries.find((entry) => entry.id === selection);
  function toggleFavorite(id: string) {
    const next = favorites.includes(id)
      ? favorites.filter((value) => value !== id)
      : [...favorites, id];
    try {
      writeFavorites(next, window.localStorage);
      setFavorites(next);
      setMessage("");
    } catch (error) {
      setMessage(`Could not save favorite: ${String(error)}`);
    }
  }
  return (
    <main className="type-page gallery-page">
      <header className="type-header">
        <Link prefetch={false} href="/" className="mono">
          {"{ }"} AsciiMorph
        </Link>
        <nav aria-label="Creative tools">
          <Link prefetch={false} href="/create">All tools</Link>
          <Link prefetch={false} href="/type">Typography</Link>
          <Link prefetch={false} href="/studio">Studio</Link>
        </nav>
      </header>
      <div className="type-title">
        <p className="type-eyebrow">A STARTING POINT, NOT A FINISH LINE</p>
        <h1>The character library</h1>
        <p>
          Original patterns, small companions, and your own local creations.
          Pick one and take it somewhere new.
        </p>
      </div>
      <section className="gallery-filters" aria-label="Gallery filters">
        <label>
          Search the library
          <input
            type="search"
            aria-label="Search gallery"
            placeholder="Try orbital, plant, pattern…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          Category
          <select
            aria-label="Gallery category"
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as GalleryCategory)
            }
          >
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Template collection
          <select
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
          >
            <option>All</option>
            {[...new Set(custom.map((item) => item.collection))].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
        <button
          aria-pressed={onlyFavorites}
          onClick={() => setOnlyFavorites(!onlyFavorites)}
        >
          ★ Favorites{favorites.length ? ` (${favorites.length})` : ""}
        </button>
      </section>
      <p role="status" className="gallery-message">
        {message ||
          (loading
            ? "Loading your local projects…"
            : `${filtered.length} ${filtered.length === 1 ? "creation" : "creations"} · Saved projects stay on this device`)}
      </p>
      <div className="gallery-layout">
        <section aria-label="Gallery artworks" className="gallery-grid">
          {filtered.map((entry) => (
            <article
              className={`gallery-card ${selection === entry.id ? "is-selected" : ""}`}
              key={entry.id}
            >
              <button
                className="gallery-card-preview"
                aria-label={`Preview ${entry.name}`}
                aria-pressed={selection === entry.id}
                onClick={() => setSelection(entry.id)}
              >
                <pre
                  aria-hidden="true"
                  style={{
                    color:
                      entry.document.layers[0]?.cells.find((cell) =>
                        cell.char.trim(),
                      )?.fg || "#e9b86e",
                  }}
                >
                  {documentText(entry.document)}
                </pre>
              </button>
              <div className="gallery-card-body">
                <div>
                  <h2>{entry.name}</h2>
                  <p>{entry.category}</p>
                  <p>{entry.tags.map((tag) => `#${tag}`).join(" ")}</p>
                </div>
                <button
                  className="gallery-favorite"
                  aria-label={`${favorites.includes(entry.id) ? "Unfavorite" : "Favorite"} ${entry.name}`}
                  aria-pressed={favorites.includes(entry.id)}
                  disabled={!loaded}
                  onClick={() => toggleFavorite(entry.id)}
                >
                  {favorites.includes(entry.id) ? "★" : "☆"}
                </button>
              </div>
            </article>
          ))}
          {!filtered.length && (
            <div className="gallery-empty">
              <h2>
                {category === "My creations"
                  ? "Your next creation belongs here."
                  : "No matching creations."}
              </h2>
              <p>
                {category === "My creations"
                  ? "Save a project in Studio, then return to see it here."
                  : "Try another search, category, or favorite filter."}
              </p>
              <Link prefetch={false} href="/studio">Open Studio →</Link>
            </div>
          )}
        </section>
        <section className="gallery-detail" aria-label="Selected artwork">
          {selected && (
            <>
              <p className="type-eyebrow">{selected.category}</p>
              <h2>{selected.name}</h2>
              <p className="type-help">{selected.description}</p>
              <div className="type-preview">
                <GalleryArtwork
                  doc={selected.document}
                  label={`Preview of ${selected.name}`}
                />
              </div>
              <p className="type-help">
                {selected.document.width} × {selected.document.height} cells ·
                Fully editable
              </p>
              <ArtworkActions doc={selected.document} />
              <section
                className="type-controls"
                aria-label="Reusable template settings"
              >
                <h3>Save as reusable template</h3>
                <label>
                  Tags (comma separated)
                  <input
                    maxLength={500}
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                  />
                </label>
                <label>
                  Collection name
                  <input
                    maxLength={80}
                    value={collectionName}
                    onChange={(e) => setCollectionName(e.target.value)}
                  />
                </label>
                <button
                  onClick={() => {
                    try {
                      saveCustomTemplate(
                        selected.document,
                        tags.split(","),
                        collectionName,
                        localStorage,
                      );
                      setCustom(readCustomTemplates(localStorage));
                      setMessage(
                        "Reusable template saved. Open it in Studio to start a fresh copy.",
                      );
                    } catch (error) {
                      setMessage(`Could not save template: ${String(error)}`);
                    }
                  }}
                >
                  Save reusable template
                </button>
                {selected.id.startsWith("custom:") && (
                  <button
                    onClick={() => {
                      try {
                        deleteCustomTemplate(
                          selected.id.slice(7),
                          localStorage,
                        );
                        setCustom(readCustomTemplates(localStorage));
                        setSelection("template:orbital");
                        setMessage(
                          "Template removed; original projects remain saved.",
                        );
                      } catch (error) {
                        setMessage(String(error));
                      }
                    }}
                  >
                    Delete custom template
                  </button>
                )}
                <p className="type-help">
                  Templates keep colors and layers. Search tags or filter by
                  collection. Export a whole-library backup in Projects to
                  protect this library.
                </p>
              </section>
              <details className="type-text">
                <summary>ASCII text view</summary>
                <pre>{documentText(selected.document)}</pre>
              </details>
              <p className="type-help">
                Original templates were created for AsciiMorph. Your current
                Studio draft is saved before opening a copy.
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
