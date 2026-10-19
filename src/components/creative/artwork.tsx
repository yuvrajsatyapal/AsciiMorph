"use client";
import { useEffect, useRef, useState } from "react";
import type { AsciiDocument } from "@/core/document";
import { documentText, ensureArtworkFont, paint } from "@/core/render";
import {
  exportDocument,
  downloadBlob,
  type ExportFormat,
} from "@/core/exports";
import { openInStudio } from "@/converter/handoff";
import { useRouter } from "next/navigation";
export function Artwork({ doc }: { doc: AsciiDocument }) {
  const ref = useRef<HTMLCanvasElement>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void ensureArtworkFont(doc.fontSize)
      .then(() => {
        if (live && ref.current) paint(ref.current, doc, { pixelRatio: 1 });
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [doc]);
  return (
    <div className="creative-preview">
      <canvas ref={ref} aria-label="ASCII artwork preview" />
      {error && <p role="alert">{error}</p>}
      <details>
        <summary>Accessible text view</summary>
        <pre>{documentText(doc)}</pre>
      </details>
    </div>
  );
}
export function ArtworkActions({ doc }: { doc: AsciiDocument }) {
  const router = useRouter(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [format, setFormat] = useState<ExportFormat>("png");
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="creative-actions">
      <button
        disabled={busy}
        className="button primary"
        onClick={() =>
          void run(async () => {
            await openInStudio(doc);
            router.push("/studio");
          })
        }
      >
        Edit in Studio
      </button>
      <label>
        Export format
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as ExportFormat)}
        >
          {["png", "svg", "txt", "webp", "html", "json"].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <button
        disabled={busy}
        onClick={() =>
          void run(async () =>
            downloadBlob(
              await exportDocument(doc, format),
              `artwork.${format}`,
            ),
          )
        }
      >
        Export artwork
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
