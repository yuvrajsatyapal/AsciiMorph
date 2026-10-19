"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type AsciiDocument } from "@/core/document";
import { documentText, ensureArtworkFont, paint } from "@/core/render";
import {
  downloadBlob,
  exportDocument,
  type ExportFormat,
} from "@/core/exports";
import { openInStudio } from "@/converter/handoff";

export function GalleryArtwork({
  doc,
  label,
}: {
  doc: AsciiDocument;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void ensureArtworkFont(doc.fontSize)
      .then(() => {
        if (live && ref.current) paint(ref.current, doc, { pixelRatio: 1 });
      })
      .catch((error: unknown) => {
        if (live) setError(String(error));
      });
    return () => {
      live = false;
    };
  }, [doc]);
  return error ? (
    <p role="alert">{error}</p>
  ) : (
    <canvas
      ref={ref}
      aria-label={label}
      style={{ maxWidth: "100%", height: "auto" }}
    />
  );
}

export function ArtworkActions({ doc }: { doc: AsciiDocument }) {
  const router = useRouter();
  const [format, setFormat] = useState<ExportFormat>("png");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setStatus("");
    try {
      await task();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="type-actions">
      <div className="type-action-row">
        <button
          className="type-primary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await openInStudio(doc);
              router.push("/studio");
            })
          }
        >
          Open in Studio
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await navigator.clipboard.writeText(documentText(doc));
              setStatus("ASCII copied to clipboard.");
            })
          }
        >
          Copy ASCII
        </button>
        <label>
          Export format
          <select
            aria-label="Export format"
            value={format}
            onChange={(event) => setFormat(event.target.value as ExportFormat)}
          >
            {(["png", "svg", "txt", "json", "webp", "html"] as const).map(
              (value) => (
                <option key={value} value={value}>
                  {value.toUpperCase()}
                </option>
              ),
            )}
          </select>
        </label>
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const blob = await exportDocument(doc, format);
              downloadBlob(
                blob,
                `${doc.name.replace(/[^a-z0-9_-]/gi, "-").slice(0, 80) || "asciimorph"}.${format}`,
              );
              setStatus(`${format.toUpperCase()} exported.`);
            })
          }
        >
          {busy ? "Working…" : "Export"}
        </button>
      </div>
      <p aria-live="polite" className="type-status">
        {status}
      </p>
    </div>
  );
}
