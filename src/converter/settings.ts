export interface ConversionSettings {
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
  mode: "monochrome",
  fg: "#e9b86e",
  bg: null,
};
export function validateSettings(s: ConversionSettings) {
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
