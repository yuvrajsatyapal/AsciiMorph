import {
  createDocument,
  validateDocument,
  type AsciiDocument,
} from "@/core/document";
export type GalleryCategory =
  | "All"
  | "Geometry"
  | "Nature"
  | "Characters"
  | "Patterns"
  | "My creations";
export interface Template {
  id: string;
  name: string;
  category: Exclude<GalleryCategory, "All" | "My creations">;
  description: string;
  tags: string[];
  rows: string[];
  foreground: string;
}
function field(
  width: number,
  height: number,
  sample: (x: number, y: number) => string,
): string[] {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => sample(x, y)).join(""),
  );
}
const orbit = field(45, 19, (x, y) => {
  const u = (x - 22) / 20,
    v = (y - 9) / 7;
  const ring = Math.abs(u * u + v * v - 0.72) < 0.12;
  return ring ? "+" : Math.hypot(u * 1.5, v) < 0.44 ? "@" : " ";
});
export const templates: Template[] = [
  {
    id: "orbital",
    name: "Orbital study",
    category: "Geometry",
    description: "A tiny planet in an elliptical orbit.",
    tags: ["space", "planet", "ring"],
    rows: orbit,
    foreground: "#E9B86E",
  },
  {
    id: "ridge",
    name: "Quiet ridge",
    category: "Nature",
    description: "Layered mountain silhouettes, drawn with slashes.",
    tags: ["mountain", "landscape"],
    rows: field(45, 16, (x, y) => {
      const h = Math.round(5 + 6 * Math.abs(Math.sin(x * 0.13)));
      return y === h ? "/" : y === h + 1 ? "^" : y > h + 1 ? "." : " ";
    }),
    foreground: "#9fcba7",
  },
  {
    id: "rain",
    name: "Rain at midnight",
    category: "Nature",
    description: "A diagonal curtain of rain over still water.",
    tags: ["water", "weather"],
    rows: field(42, 16, (x, y) =>
      y > 12
        ? (x + y) % 5 === 0
          ? "~"
          : " "
        : (x + y * 2) % 9 === 0
          ? "/"
          : " ",
    ),
    foreground: "#8bb9de",
  },
  {
    id: "fern",
    name: "Terminal fern",
    category: "Nature",
    description: "A branching botanical specimen.",
    tags: ["plant", "leaf", "botanical"],
    rows: field(33, 19, (x, y) =>
      x === 16
        ? "|"
        : y % 3 === 0 && Math.abs(x - 16) <= Math.floor((19 - y) / 2)
          ? x < 16
            ? "\\"
            : "/"
          : " ",
    ),
    foreground: "#a8c78c",
  },
  {
    id: "signal",
    name: "Signal field",
    category: "Patterns",
    description: "An original interference pattern of dots and crosses.",
    tags: ["wave", "texture", "interference"],
    rows: field(45, 17, (x, y) => {
      const wave = Math.sin(x * 0.35 + y * 0.6) * Math.cos(y * 0.7 - x * 0.15);
      return wave > 0.6 ? "#" : wave > 0.2 ? "+" : wave > -0.2 ? "." : " ";
    }),
    foreground: "#E9B86E",
  },
  {
    id: "woven",
    name: "Woven grid",
    category: "Patterns",
    description: "A repeat of diagonal stitches.",
    tags: ["tile", "fabric", "grid"],
    rows: field(42, 16, (x, y) =>
      (x + y) % 6 === 0 ? "/" : (x - y + 96) % 6 === 0 ? "\\" : " ",
    ),
    foreground: "#c6b0df",
  },
  {
    id: "diamond",
    name: "Diamond echo",
    category: "Geometry",
    description: "Concentric diamonds from a Manhattan distance field.",
    tags: ["diamond", "minimal", "concentric"],
    rows: field(41, 19, (x, y) =>
      Math.floor(Math.abs(x - 20) / 2 + Math.abs(y - 9)) % 4 === 0 ? "+" : " ",
    ),
    foreground: "#e0a591",
  },
  {
    id: "robot",
    name: "Little machine",
    category: "Characters",
    description: "A friendly terminal robot ready for customization.",
    tags: ["robot", "mascot", "face"],
    rows: [
      "        |        ",
      "     .--+--.     ",
      "     | o o |     ",
      "     |  =  |     ",
      "     '-----'     ",
      "   .---| |---.   ",
      "  /| [:::] |\\  ",
      " / |       | \\ ",
      "   '-------'     ",
      "     |   |       ",
      "    _|   |_      ",
    ],
    foreground: "#E9B86E",
  },
  {
    id: "cat",
    name: "Night companion",
    category: "Characters",
    description: "An original small cat portrait.",
    tags: ["cat", "animal", "mascot"],
    rows: [
      "    /\\     /\\    ",
      "   /  '---'  \\   ",
      "  |  o   o  |    ",
      "  |    ^    |    ",
      "   \\  ---  /     ",
      "    '-----'      ",
      "    /     \\     ",
      "   /|     |\\    ",
      "  (_|_____|_)    ",
    ],
    foreground: "#c6b0df",
  },
  {
    id: "compass",
    name: "Four directions",
    category: "Geometry",
    description: "A radial compass built from straight strokes.",
    tags: ["star", "compass", "radial"],
    rows: field(33, 17, (x, y) => {
      const a = x - 16,
        b = y - 8;
      return a === 0
        ? "|"
        : b === 0
          ? "-"
          : Math.abs(a) === Math.abs(b) * 2
            ? a * b > 0
              ? "\\"
              : "/"
            : " ";
    }),
    foreground: "#9ebdd0",
  },
];
export function templateDocument(template: Template): AsciiDocument {
  const width = Math.max(...template.rows.map((row) => Array.from(row).length));
  const doc = createDocument(width, template.rows.length, template.name);
  doc.layers[0].name = "Original template";
  doc.layers[0].cells = template.rows.flatMap((row) =>
    Array.from(row.padEnd(width, " "), (char) => ({
      char,
      fg: template.foreground,
      bg: null,
      alpha: 1,
    })),
  );
  return validateDocument(doc);
}
export interface GalleryEntry {
  id: string;
  name: string;
  category: Exclude<GalleryCategory, "All">;
  description: string;
  tags: string[];
  document: AsciiDocument;
}
export function galleryEntries(projects: AsciiDocument[]): GalleryEntry[] {
  return [
    ...templates.map((template) => ({
      ...template,
      id: `template:${template.id}`,
      document: templateDocument(template),
    })),
    ...projects.map((doc) => ({
      id: `project:${doc.id}`,
      name: doc.name,
      category: "My creations" as const,
      description: `${doc.width} × ${doc.height} cells · Saved on this device`,
      tags: ["saved", "local"],
      document: validateDocument(doc),
    })),
  ];
}
export function searchGallery(
  entries: GalleryEntry[],
  query: string,
  category: GalleryCategory,
): GalleryEntry[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter(
    (entry) =>
      (category === "All" || entry.category === category) &&
      terms.every((term) =>
        [entry.name, entry.description, entry.category, ...entry.tags]
          .join(" ")
          .toLocaleLowerCase()
          .includes(term),
      ),
  );
}
const FAVORITES_KEY = "asciimorph.gallery.favorites.v1";
const validFavorite = (value: unknown): value is string =>
  typeof value === "string" &&
  /^(template|project):[a-zA-Z0-9_-]{1,128}$/.test(value);
export function readFavorites(storage: Pick<Storage, "getItem">): string[] {
  try {
    const raw = storage.getItem(FAVORITES_KEY);
    if (!raw || raw.length > 100_000) return [];
    const values: unknown = JSON.parse(raw);
    return Array.isArray(values)
      ? [...new Set(values.filter(validFavorite))].slice(0, 500)
      : [];
  } catch {
    return [];
  }
}
export function writeFavorites(
  values: string[],
  storage: Pick<Storage, "setItem">,
): void {
  if (values.length > 500 || !values.every(validFavorite))
    throw new Error("Invalid favorite list.");
  storage.setItem(FAVORITES_KEY, JSON.stringify([...new Set(values)]));
}
