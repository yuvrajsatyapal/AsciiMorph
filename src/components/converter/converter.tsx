"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { Braces, ArrowRight, Upload } from "lucide-react";
import { useConverter } from "@/converter/use-converter";
import { gridDimensions, transformedSize } from "@/converter/engine";
import { openInStudio } from "@/converter/handoff";
import { workspace } from "@/editor/store";
import {
  exportDocument,
  downloadBlob,
  type ExportFormat,
} from "@/core/exports";
import { Settings } from "./settings";
import { Preview } from "./preview";
import "./converter.css";
export default function Converter() {
  const c = useConverter(),
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false),
    [dragging, setDragging] = useState(false);
  const notify = useCallback((s: string) => setMessage(s), []);
  const perform = async (work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Operation failed. Please retry.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const handoff = () =>
    perform(async () => {
      if (!c.result) return;
      await openInStudio(c.result);
      router.push("/studio");
    });
  const download = (format: ExportFormat) =>
    perform(async () => {
      if (!c.result) return;
      const blob = await exportDocument(c.result, format);
      downloadBlob(
        blob,
        `${c.result.name}.${format === "json" ? "asciimorph.json" : format}`,
      );
    });
  const fileInput = (
    <label className="conversion-upload-button">
      <Upload size={16} />
      {c.source ? "Replace image" : "Browse files"}
      <input
        aria-label="Browse image"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/bmp,.bmp"
        disabled={busy || c.loading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) {
            setMessage("");
            void c.upload(file);
          }
        }}
      />
    </label>
  );
  return (
    <main className="converter">
      <a href="#conversion-main" className="skip-link">
        Skip to conversion
      </a>
      <header className="conversion-header">
        <Link prefetch={false} href="/" className="wordmark">
          <Braces size={23} />
          <span>AsciiMorph</span>
        </Link>
        <span className="conversion-breadcrumb">IMAGE → CHARACTERS</span>
        <Link prefetch={false} href="/create" className="button quiet">
          Creative tools
        </Link>
        <Link prefetch={false} href="/studio" className="button quiet">
          Open Studio <ArrowRight size={15} />
        </Link>
      </header>
      <div className="conversion-heading">
        <div>
          <span className="control-caption">A DIFFERENT WAY TO SEE</span>
          <h1>Find the characters in your image.</h1>
          <p>
            Your image stays on this device. Shape the result, then make it your
            own in Studio.
          </p>
        </div>
        <button
          className="button primary"
          disabled={!c.result || busy}
          onClick={() => void handoff()}
        >
          {busy ? "Working…" : "Edit in Studio"}
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="conversion-layout" id="conversion-main">
        <div className="conversion-main">
          <div
            className="conversion-upload"
            data-dragging={dragging}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (busy || c.loading) return;
              const files = e.dataTransfer.files;
              if (files.length !== 1) {
                setMessage("Drop one image at a time.");
                return;
              }
              setMessage("");
              void c.upload(files[0]);
            }}
          >
            <div>
              <h2>
                {c.source
                  ? c.source.name
                  : "Drop an image. Discover its texture."}
              </h2>
              <p>PNG, JPEG, WebP, BMP · Up to 12 MiB · 24 megapixels</p>
            </div>
            <div className="conversion-upload-actions">
              {fileInput}
              {(c.source || c.loading) && (
                <button
                  disabled={busy}
                  onClick={c.remove}
                  aria-label="Remove image"
                >
                  Remove image
                </button>
              )}
            </div>
          </div>
          <div
            className="conversion-status"
            data-testid="conversion-status"
            role="status"
            aria-live="polite"
          >
            {c.loading
              ? "Decoding image locally…"
              : c.cancelled
                ? "Cancelled. Ready to retry."
                : c.processing
                  ? "Processing image…"
                  : c.result
                    ? `Ready · ${c.result.width} × ${c.result.height} editable cells · ${c.engine}`
                    : c.error
                      ? "Conversion unavailable"
                      : "Choose an image to begin."}
            {(c.loading || c.processing) && (
              <button onClick={c.cancel}>Cancel</button>
            )}
            {(c.cancelled || c.error) && c.source && (
              <button onClick={c.resume}>Retry conversion</button>
            )}
          </div>
          {(c.error || message) && (
            <div className="conversion-error" role="alert">
              <p>{c.error || message}</p>
              <p>
                Your existing projects are preserved. Retry the action or export
                your work.
              </p>
              <button onClick={() => setMessage("")}>Dismiss</button>
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const s = workspace.getState(),
                      doc = s.activeId ? s.documents[s.activeId] : null;
                    if (!doc)
                      throw new Error("No current Studio draft in memory.");
                    downloadBlob(
                      await exportDocument(doc, "json"),
                      `${doc.name}.asciimorph.json`,
                    );
                  })
                }
              >
                Download Studio draft
              </button>
            </div>
          )}
          {c.source ? (
            <Preview doc={c.result} source={c.source} onError={notify} />
          ) : (
            <div className="conversion-empty">
              <pre aria-hidden="true">
                {
                  "     . : + # @\n   . : + # @ # +\n . : + # @ # + : .\n   . : + # + :\n     . : + ."
                }
              </pre>
              <h2>A photograph, reimagined one cell at a time.</h2>
              <p>
                Start with a local image. Every character in the result will be
                editable.
              </p>
              {c.loading && <progress aria-label="Decoding image" />}
            </div>
          )}
          <div
            className="conversion-exports"
            aria-label="Export converted artwork"
          >
            <span>TAKE IT WITH YOU</span>
            {(
              [
                ["txt", "TXT"],
                ["png", "PNG"],
                ["svg", "SVG"],
                ["webp", "WebP"],
                ["html", "HTML"],
                ["json", "JSON"],
              ] as const
            ).map(([format, label]) => (
              <button
                key={format}
                aria-label={`Export ${label}`}
                disabled={!c.result || busy}
                onClick={() => void download(format)}
              >
                {label}
              </button>
            ))}
            <p>
              TXT contains characters; editable JSON preserves cells and color.
              Unicode glyph appearance varies across systems.
            </p>
          </div>
        </div>
        <aside
          className="conversion-inspector"
          aria-label="Conversion controls"
        >
          <div className="conversion-settings-heading">
            <h2>Make it yours</h2>
            <button disabled={busy} onClick={c.reset}>
              Reset settings
            </button>
          </div>
          <Settings
            s={c.settings}
            update={c.update}
            busy={busy}
            dimensions={
              c.source
                ? gridDimensions(
                    transformedSize(c.source.pixels, c.settings).width,
                    transformedSize(c.source.pixels, c.settings).height,
                    c.settings,
                  )
                : undefined
            }
          />
        </aside>
      </div>
    </main>
  );
}
