"use client";
import {
  useEffect,
  useRef,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { AsciiDocument } from "@/core/document";
import {
  paint,
  documentText,
  ensureArtworkFont,
  backingSize,
  previewPixelRatio,
} from "@/core/render";
import type { Point, Rect } from "@/editor/interaction";
interface Props {
  doc: AsciiDocument;
  selection: Rect | null;
  caret: Point;
  zoom: number;
  grid: boolean;
  monochrome: boolean;
  viewportRef: RefObject<HTMLDivElement | null>;
  onDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onCancel: () => void;
  onKey: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  onError: (message: string) => void;
}
export function EditorCanvas({
  doc,
  selection,
  caret,
  zoom,
  grid,
  monochrome,
  viewportRef,
  onDown,
  onMove,
  onUp,
  onCancel,
  onKey,
  onError,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    overlay = useRef<HTMLCanvasElement>(null),
    previous = useRef<AsciiDocument | null>(null);
  useEffect(() => {
    let active = true;
    async function render() {
      try {
        await ensureArtworkFont(doc.fontSize);
        if (!active || !canvas.current) return;
        paint(canvas.current, doc, {
          previous: previous.current,
          monochrome,
          pixelRatio: previewPixelRatio(
            doc.width * doc.cellWidth,
            doc.height * doc.cellHeight,
            window.devicePixelRatio || 1,
          ),
        });
        previous.current = doc;
      } catch (error) {
        onError(
          error instanceof Error ? error.message : "Canvas rendering failed",
        );
      }
    }
    void render();
    return () => {
      active = false;
    };
  }, [doc, monochrome, onError]);
  useEffect(() => {
    const c = overlay.current;
    if (!c) return;
    try {
      backingSize(doc.width * doc.cellWidth, doc.height * doc.cellHeight);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Canvas is too large");
      return;
    }
    c.width = doc.width * doc.cellWidth;
    c.height = doc.height * doc.cellHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (grid) {
      ctx.strokeStyle = "#adb3bd25";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let x = 0; x <= doc.width; x++) {
        ctx.moveTo(x * doc.cellWidth, 0);
        ctx.lineTo(x * doc.cellWidth, c.height);
      }
      for (let y = 0; y <= doc.height; y++) {
        ctx.moveTo(0, y * doc.cellHeight);
        ctx.lineTo(c.width, y * doc.cellHeight);
      }
      ctx.stroke();
    }
    if (selection) {
      ctx.fillStyle = "#E9B86E18";
      ctx.fillRect(
        selection.x * doc.cellWidth,
        selection.y * doc.cellHeight,
        selection.width * doc.cellWidth,
        selection.height * doc.cellHeight,
      );
      ctx.strokeStyle = "#E9B86E";
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(
        selection.x * doc.cellWidth + 0.5,
        selection.y * doc.cellHeight + 0.5,
        selection.width * doc.cellWidth - 1,
        selection.height * doc.cellHeight - 1,
      );
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = "#91D3BD";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      caret.x * doc.cellWidth + 0.5,
      caret.y * doc.cellHeight + 0.5,
      doc.cellWidth - 1,
      doc.cellHeight - 1,
    );
  }, [
    doc.width,
    doc.height,
    doc.cellWidth,
    doc.cellHeight,
    grid,
    selection,
    caret,
    onError,
  ]);
  return (
    <section
      className="editor-viewport"
      ref={viewportRef}
      aria-label="Canvas viewport"
    >
      <div className="canvas-surround">
        <div className="canvas-topline">
          <span>{doc.name}</span>
          <span>
            {doc.width} × {doc.height}
          </span>
        </div>
        <div
          data-testid="canvas-input"
          className="canvas-input"
          role="application"
          aria-label="ASCII drawing canvas. Arrow keys move the cursor. Type in Text mode. Press question mark for shortcuts."
          tabIndex={0}
          style={{
            width: doc.width * doc.cellWidth * zoom,
            height: doc.height * doc.cellHeight * zoom,
          }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
          onLostPointerCapture={onCancel}
          onKeyDown={onKey}
        >
          <canvas data-testid="ascii-canvas" ref={canvas} aria-hidden="true" />
          <canvas ref={overlay} className="canvas-overlay" aria-hidden="true" />
        </div>
        <p className="canvas-hint">Made of characters. Made by you.</p>
      </div>
      <pre
        className="sr-only"
        data-testid="document-text"
        aria-label="Artwork text representation"
      >
        {documentText(doc)}
      </pre>
    </section>
  );
}
