import {
  createDocument,
  validateDocument,
  type AsciiDocument,
  type Cell,
} from "@/core/document";

export interface FigletFont {
  height: number;
  glyphs: Map<string, string[]>;
}
export interface TypographyOptions {
  alignment?: "left" | "center" | "right";
  spacing?: number;
  foreground?: string;
  background?: string | null;
  kerning?: boolean;
  lineSpacing?: number;
  outline?: boolean;
  gradient?: string;
}

/** Reads full-width FIGlet fonts. Kerning/smushing is deliberately disabled. */
export function parseFiglet(source: string): FigletFont {
  if (source.length > 1_000_000) throw new Error("FIGlet font is too large.");
  const lines = source.replaceAll("\r", "").split("\n");
  const header = lines[0].match(
    /^flf2a(.)\s+(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(\d+)(?:\s|$)/,
  );
  if (!header) throw new Error("Invalid FIGlet font header.");
  const hardblank = header[1],
    height = Number(header[2]),
    comments = Number(header[6]);
  if (height < 1 || height > 30 || comments > 1000)
    throw new Error("Invalid FIGlet font dimensions.");
  let cursor = 1 + comments;
  const glyphs = new Map<string, string[]>();
  for (let code = 32; code <= 126; code++) {
    const rows: string[] = [];
    for (let row = 0; row < height; row++) {
      const raw = lines[cursor++];
      if (!raw) throw new Error("Truncated FIGlet font.");
      const endmark = raw.at(-1)!;
      const suffix = row === height - 1 ? endmark.repeat(2) : endmark;
      if (!raw.endsWith(suffix))
        throw new Error("Invalid FIGlet glyph endmark.");
      rows.push(raw.slice(0, -suffix.length).replaceAll(hardblank, " "));
    }
    const width = Math.max(...rows.map((row) => row.length));
    if (width < 1 || width > 100)
      throw new Error("Invalid FIGlet glyph width.");
    glyphs.set(
      String.fromCharCode(code),
      rows.map((row) => row.padEnd(width, " ")),
    );
  }
  return { height, glyphs };
}

export function renderTypography(
  font: FigletFont,
  text: string,
  options: TypographyOptions = {},
): string[] {
  const lineSpacing = options.lineSpacing ?? 1;
  if (!Number.isInteger(lineSpacing) || lineSpacing < 0 || lineSpacing > 8)
    throw new Error("Line spacing must be between 0 and 8.");
  const spacing = options.spacing ?? 1,
    alignment = options.alignment ?? "left";
  if (!Number.isInteger(spacing) || spacing < 0 || spacing > 8)
    throw new Error("Spacing must be between 0 and 8.");
  if (!["left", "center", "right"].includes(alignment))
    throw new Error("Invalid text alignment.");
  if (text.length > 1000)
    throw new Error("Text must be at most 1,000 characters.");
  const paragraphs = text.replaceAll("\r", "").split("\n");
  if (paragraphs.length * (font.height + lineSpacing) - 1 > 300)
    throw new Error("Typography exceeds 300 rows.");
  const blocks = paragraphs.map((paragraph) => {
    const glyphs = Array.from(paragraph).map((char) => {
      const glyph = font.glyphs.get(char);
      if (!glyph)
        throw new Error(
          `Unsupported character: ${char}. Use printable ASCII characters.`,
        );
      if (!options.kerning || char === " ") return glyph;
      const occupied = glyph.flatMap((row) =>
        Array.from(row).flatMap((v, i) => (v.trim() ? [i] : [])),
      );
      const left = Math.min(...occupied),
        right = Math.max(...occupied);
      return occupied.length
        ? glyph.map((row) => row.slice(left, right + 1))
        : glyph;
    });
    return Array.from({ length: font.height }, (_, row) =>
      glyphs.map((glyph) => glyph[row]).join(" ".repeat(spacing)),
    );
  });
  const width = Math.max(1, ...blocks.flat().map((row) => row.length));
  if (width > 300)
    throw new Error(
      "Typography exceeds 300 columns. Shorten the text or add a new line.",
    );
  const height = paragraphs.length * (font.height + lineSpacing) - 1;
  if (width * height > 60000)
    throw new Error("Typography exceeds 60,000 cells.");
  return blocks.flatMap((block, index) => {
    const free = width - block[0].length;
    const left =
      alignment === "right"
        ? free
        : alignment === "center"
          ? Math.floor(free / 2)
          : 0;
    const rows = block.map((row) =>
      (" ".repeat(left) + row).padEnd(width, " "),
    );
    return index === blocks.length - 1
      ? rows
      : [
          ...rows,
          ...Array.from({ length: lineSpacing }, () => " ".repeat(width)),
        ];
  });
}

export function typographyDocument(
  font: FigletFont,
  text: string,
  options: TypographyOptions = {},
): AsciiDocument {
  let rows = renderTypography(font, text, options);
  if (options.outline) {
    const base = rows;
    const width = base[0].length + 2;
    rows = Array.from({ length: base.length + 2 }, (_, y) =>
      Array.from({ length: width }, (_, x) => {
        const char = base[y - 1]?.[x - 1] ?? " ";
        if (char.trim()) return char;
        return [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ].some(([dx, dy]) => (base[y - 1 + dy]?.[x - 1 + dx] ?? " ").trim())
          ? "."
          : " ";
      }).join(""),
    );
  }
  if (options.gradient && !/^#[a-f0-9]{6}$/i.test(options.gradient))
    throw new Error("Invalid gradient color");
  const colorAt = (row: number) => {
    const start = options.foreground ?? "#E9B86E";
    if (!options.gradient) return start;
    const fraction = row / Math.max(1, rows.length - 1);
    return (
      "#" +
      [1, 3, 5]
        .map((offset) =>
          Math.round(
            parseInt(start.slice(offset, offset + 2), 16) * (1 - fraction) +
              parseInt(options.gradient!.slice(offset, offset + 2), 16) *
                fraction,
          )
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    );
  };
  const doc = createDocument(
    rows[0].length,
    rows.length,
    text.trim().slice(0, 80) || "Typography",
  );
  doc.background = options.background ?? null;
  doc.layers[0].name = "Morph Grid typography";
  doc.layers[0].cells = rows.flatMap((row, index) =>
    Array.from(row, (char) => ({
      char,
      fg: colorAt(index),
      bg: null,
      alpha: 1,
    })),
  );
  return validateDocument(doc);
}

/** Places visible glyphs into a new, clipped layer. The target remains untouched. */
export function placeTypography(
  target: AsciiDocument,
  lettering: AsciiDocument,
  x: number,
  y: number,
): AsciiDocument {
  validateDocument(target);
  validateDocument(lettering);
  if (!Number.isInteger(x) || !Number.isInteger(y))
    throw new Error("Placement must use whole cells");
  if (target.layers.length >= 8)
    throw new Error("Project already has the maximum number of layers");
  const cells: Cell[] = Array.from(
    { length: target.width * target.height },
    () => ({ char: " ", fg: "#E9B86E", bg: null, alpha: 0 }),
  );
  for (let row = 0; row < lettering.height; row++)
    for (let col = 0; col < lettering.width; col++) {
      const cell = lettering.layers[0].cells[row * lettering.width + col],
        tx = x + col,
        ty = y + row;
      if (
        cell.char.trim() &&
        tx >= 0 &&
        tx < target.width &&
        ty >= 0 &&
        ty < target.height
      )
        cells[ty * target.width + tx] = { ...cell };
    }
  const id = crypto.randomUUID();
  return validateDocument({
    ...target,
    updatedAt: new Date().toISOString(),
    activeLayerId: id,
    layers: [
      ...target.layers,
      {
        id,
        name: "Typography: " + lettering.name.slice(0, 70),
        visible: true,
        locked: false,
        opacity: 1,
        cells,
      },
    ],
  });
}
