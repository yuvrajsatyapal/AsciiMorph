export interface ConversionSettings {
  rotation?: 0 | 90 | 180 | 270;
  crop?: { x: number; y: number; width: number; height: number };
  shapeAware?: boolean;
  width: number;
  height: number;
  preserveAspect: boolean;
  cellWidth: number;
  cellHeight: number;
  density: number;
  charset: string;
  custom: string;
  brightness: number;
  contrast: number;
  gamma: number;
  saturation: number;
  invert: boolean;
  sharpness: number;
  edge: number;
  dithering: boolean;
  smartEdges?: boolean;
  mode: "monochrome" | "grayscale" | "color";
  fg: string;
  bg: string | null;
}
export const DEFAULT_SETTINGS: ConversionSettings = {
  width: 80,
  height: 40,
  preserveAspect: true,
  cellWidth: 9,
  cellHeight: 18,
  density: 1,
  charset: "classic",
  custom: " .:-=+*#%@",
  brightness: 0,
  contrast: 0,
  gamma: 1,
  saturation: 100,
  invert: false,
  sharpness: 0,
  edge: 0,
  dithering: false,
  smartEdges: false,
  mode: "monochrome",
  fg: "#e9b86e",
  bg: null,
};
export const VISUAL_PRESETS: Record<string, Partial<ConversionSettings>> = {
  "Detailed portrait": {
    charset: "detailed",
    contrast: 15,
    gamma: 1.15,
    sharpness: 25,
    edge: 0,
    shapeAware: true,
    smartEdges: false,
    dithering: false,
  },
  "Line drawing": {
    charset: "classic",
    contrast: 30,
    gamma: 1,
    sharpness: 30,
    edge: 85,
    smartEdges: true,
    shapeAware: true,
    dithering: false,
  },
  "Color poster": {
    charset: "blocks",
    mode: "color",
    contrast: 25,
    saturation: 130,
    edge: 0,
    sharpness: 10,
    dithering: true,
  },
  "Soft photograph": {
    charset: "detailed",
    mode: "grayscale",
    contrast: 0,
    gamma: 1.3,
    sharpness: 5,
    edge: 0,
    dithering: true,
  },
};
export function validateSettings(s: ConversionSettings) {
  if (
    typeof s.charset !== "string" ||
    typeof s.custom !== "string" ||
    s.custom.length > 512 ||
    /[\u0000-\u001f\u007f]/.test(s.custom)
  )
    throw new Error("Invalid character settings");
  if (s.crop !== undefined && (!s.crop || typeof s.crop !== "object"))
    throw new Error("Invalid crop");
  if (s.rotation !== undefined && ![0, 90, 180, 270].includes(s.rotation))
    throw new Error("Invalid rotation");
  if (s.shapeAware !== undefined && typeof s.shapeAware !== "boolean")
    throw new Error("Invalid shape matching");
  if (s.crop) {
    const c = s.crop;
    if (
      ![c.x, c.y, c.width, c.height].every(Number.isFinite) ||
      c.x < 0 ||
      c.y < 0 ||
      c.width <= 0 ||
      c.height <= 0 ||
      c.x + c.width > 1.000001 ||
      c.y + c.height > 1.000001
    )
      throw new Error("Invalid crop");
  }

  const ranges: [keyof ConversionSettings, number, number][] = [
    ["width", 1, 300],
    ["height", 1, 300],
    ["cellWidth", 7, 16],
    ["cellHeight", 14, 28],
    ["density", 0.25, 3],
    ["brightness", -100, 100],
    ["contrast", -100, 100],
    ["gamma", 0.1, 3],
    ["saturation", 0, 200],
    ["sharpness", 0, 100],
    ["edge", 0, 100],
  ];
  for (const [key, min, max] of ranges) {
    const v = s[key];
    if (
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      v < min ||
      v > max ||
      (["width", "height"].includes(key) && !Number.isInteger(v))
    )
      throw new Error(`Invalid ${key}`);
  }
  if (s.smartEdges !== undefined && typeof s.smartEdges !== "boolean")
    throw new Error("Invalid smartEdges");
  for (const key of ["preserveAspect", "invert", "dithering"] as const)
    if (typeof s[key] !== "boolean") throw new Error(`Invalid ${key}`);
  if (!["monochrome", "grayscale", "color"].includes(s.mode))
    throw new Error("Invalid color mode");
  if (
    !/^#[a-f\d]{6}$/i.test(s.fg) ||
    (s.bg !== null && !/^#[a-f\d]{6}$/i.test(s.bg))
  )
    throw new Error("Invalid color");
}
