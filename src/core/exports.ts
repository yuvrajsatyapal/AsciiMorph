import { serializeDocument, type AsciiDocument } from "./document";
import { ART_FONT, documentText, ensureArtworkFont, paint } from "./render";
export type ExportFormat = "txt" | "png" | "svg" | "webp" | "html" | "json";
export const MAX_RASTER_PIXELS = 32000000;
function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
async function embeddedFont() {
  const [font, license] = await Promise.all([
    fetch("/fonts/ibm-plex-mono-latin-400-normal.woff2"),
    fetch("/fonts/IBM-Plex-OFL.txt"),
  ]);
  if (!font.ok || !license.ok)
    throw new Error("Could not load the artwork font and license.");
  const bytes = new Uint8Array(await font.arrayBuffer());
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return {
    data: `data:font/woff2;base64,${btoa(binary)}`,
    license: await license.text(),
  };
}
async function svgDocument(doc: AsciiDocument, mono: boolean) {
  const font = await embeddedFont(),
    w = doc.width * doc.cellWidth,
    h = doc.height * doc.cellHeight;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><metadata>${escape(font.license)}</metadata><defs><style>@font-face{font-family:'IBM Plex Mono';src:url('${font.data}') format('woff2')}</style>`,
  ];
  for (let i = 0; i < doc.width * doc.height; i++)
    parts.push(
      `<clipPath id="c${i}"><rect x="${(i % doc.width) * doc.cellWidth}" y="${Math.floor(i / doc.width) * doc.cellHeight}" width="${doc.cellWidth}" height="${doc.cellHeight}"/></clipPath>`,
    );
  parts.push("</defs>");
  if (doc.background)
    parts.push(
      `<rect width="${w}" height="${h}" fill="${mono ? "#000000" : escape(doc.background)}"/>`,
    );
  for (const l of doc.layers) {
    if (!l.visible || l.opacity === 0) continue;
    parts.push(`<g opacity="${l.opacity}">`);
    l.cells.forEach((c, i) => {
      if (c.alpha === 0 || (c.char === " " && c.bg === null)) return;
      const x = (i % doc.width) * doc.cellWidth,
        y = Math.floor(i / doc.width) * doc.cellHeight;
      parts.push(`<g opacity="${c.alpha}" clip-path="url(#c${i})">`);
      if (c.bg)
        parts.push(
          `<rect x="${x}" y="${y}" width="${doc.cellWidth}" height="${doc.cellHeight}" fill="${mono ? "#000000" : escape(c.bg)}"/>`,
        );
      parts.push(
        `<text x="${x + doc.cellWidth / 2}" y="${y + doc.cellHeight / 2}" dominant-baseline="central" text-anchor="middle" font-family="${escape(ART_FONT)}" font-size="${doc.fontSize}" fill="${mono ? "#ffffff" : escape(c.fg)}" xml:space="preserve">${escape(c.char)}</text></g>`,
      );
    });
    parts.push("</g>");
  }
  parts.push("</svg>");
  return parts.join("");
}
export async function exportDocument(
  doc: AsciiDocument,
  format: ExportFormat,
  monochrome = false,
): Promise<Blob> {
  if (format === "txt")
    return new Blob([documentText(doc)], { type: "text/plain;charset=utf-8" });
  if (format === "json")
    return new Blob([serializeDocument(doc)], { type: "application/json" });
  if (format === "svg" || format === "html") {
    const svg = await svgDocument(doc, monochrome);
    return new Blob(
      [
        format === "svg"
          ? svg
          : `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escape(doc.name)}</title><body style="margin:0">${svg}</body></html>`,
      ],
      { type: format === "svg" ? "image/svg+xml" : "text/html;charset=utf-8" },
    );
  }
  if (format !== "png" && format !== "webp")
    throw new Error("Unsupported export format.");
  if (
    Math.ceil(doc.width * doc.cellWidth) *
      Math.ceil(doc.height * doc.cellHeight) >
    MAX_RASTER_PIXELS
  )
    throw new Error(
      "Image is too large. Reduce canvas size or cell dimensions before exporting.",
    );
  await ensureArtworkFont(doc.fontSize);
  const canvas = document.createElement("canvas");
  paint(canvas, doc, { monochrome, pixelRatio: 1 });
  const type = `image/${format}`;
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Image export failed."));
      else if (blob.type !== type)
        reject(
          new Error(
            `${format.toUpperCase()} export is unsupported by this browser.`,
          ),
        );
      else resolve(blob);
    }, type),
  );
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
