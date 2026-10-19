"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  parseFiglet,
  typographyDocument,
  type FigletFont,
  type TypographyOptions,
} from "@/typography/figlet";
import { documentText } from "@/core/render";
import { GalleryArtwork, ArtworkActions } from "./artwork";
import "./typography.css";
export default function Typography() {
  const [font, setFont] = useState<FigletFont | null>(null);
  const [loadError, setLoadError] = useState("");
  const [text, setText] = useState("MORPH");
  const [alignment, setAlignment] =
    useState<TypographyOptions["alignment"]>("left");
  const [spacing, setSpacing] = useState(1);
  const [foreground, setForeground] = useState("#e9b86e");
  const [background, setBackground] = useState("#0c0d10");
  const [transparent, setTransparent] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/fonts/figlet/morph-grid.flf", { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Could not load the bundled FIGlet font.");
        const parsed = parseFiglet(await response.text());
        if (!abort.signal.aborted) setFont(parsed);
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) setLoadError(String(error));
      });
    return () => abort.abort();
  }, []);
  const result = useMemo(() => {
    if (!font) return { doc: null, error: "" };
    try {
      return {
        doc: typographyDocument(font, text, {
          alignment,
          spacing,
          foreground,
          background: transparent ? null : background,
        }),
        error: "",
      };
    } catch (error) {
      return {
        doc: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [font, text, alignment, spacing, foreground, background, transparent]);
  return (
    <main className="type-page">
      <header className="type-header">
        <Link href="/" className="mono">
          {"{ }"} AsciiMorph
        </Link>
        <nav aria-label="Creative tools">
          <Link href="/create">All tools</Link>
          <Link href="/gallery">Gallery</Link>
          <Link href="/studio">Studio</Link>
        </nav>
      </header>
      <div className="type-title">
        <p className="type-eyebrow">WORDS, WITH CHARACTER</p>
        <h1>Typography lab</h1>
        <p>
          Build a banner from the grid up. Real FIGlet lettering, ready to make
          your own.
        </p>
      </div>
      <div className="type-layout">
        <section className="type-controls" aria-label="Typography settings">
          <label>
            Your text
            <textarea
              aria-label="Your text"
              value={text}
              maxLength={1000}
              rows={5}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
            />
          </label>
          <p className="type-help">
            Printable ASCII · 300 columns maximum · Add new lines for longer
            text.
          </p>
          <label>
            FIGlet font
            <input
              aria-label="FIGlet font"
              value="Morph Grid · 5 rows"
              readOnly
            />
          </label>
          <p className="type-help">
            An original block alphabet. Lowercase is rendered as capitals.{" "}
            <a
              href="/fonts/figlet/LICENSE.txt"
              target="_blank"
              rel="noreferrer"
            >
              CC0 font license ↗
            </a>
          </p>
          <label>
            Alignment
            <select
              aria-label="Alignment"
              value={alignment}
              onChange={(event) =>
                setAlignment(
                  event.target.value as TypographyOptions["alignment"],
                )
              }
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label>
            Letter spacing <output>{spacing} cells</output>
            <input
              aria-label="Letter spacing"
              type="range"
              min={0}
              max={8}
              value={spacing}
              onChange={(event) => setSpacing(Number(event.target.value))}
            />
          </label>
          <div className="type-colors">
            <label>
              Letter color
              <input
                aria-label="Letter color"
                type="color"
                value={foreground}
                onChange={(event) => setForeground(event.target.value)}
              />
            </label>
            <label>
              Background
              <input
                aria-label="Background color"
                type="color"
                value={background}
                onChange={(event) => setBackground(event.target.value)}
                disabled={transparent}
              />
            </label>
          </div>
          <label className="type-check">
            <input
              type="checkbox"
              checked={transparent}
              onChange={(event) => setTransparent(event.target.checked)}
            />
            Transparent background
          </label>
        </section>
        <section className="type-output" aria-label="Typography result">
          <div className="type-preview-heading">
            <h2>Live preview</h2>
            {result.doc && (
              <span>
                {result.doc.width} × {result.doc.height} cells
              </span>
            )}
          </div>
          <div className="type-preview">
            {result.doc ? (
              <GalleryArtwork
                doc={result.doc}
                label="FIGlet typography preview"
              />
            ) : (
              <p role={result.error || loadError ? "alert" : "status"}>
                {result.error || loadError || "Loading local font…"}
              </p>
            )}
          </div>
          {result.doc && (
            <>
              <ArtworkActions doc={result.doc} />
              <details className="type-text">
                <summary>ASCII text view</summary>
                <pre>{documentText(result.doc)}</pre>
              </details>
            </>
          )}
          <p className="type-help">
            Opening in Studio saves your existing draft first. All processing
            stays in this browser.
          </p>
        </section>
      </div>
    </main>
  );
}
