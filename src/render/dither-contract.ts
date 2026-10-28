import { styleNumber, styleObject } from "./style-contract";
export const DITHER_ALGORITHMS = [
  "bayer2",
  "bayer4",
  "bayer8",
  "bayer16",
  "halftone",
  "radial",
  "linesH",
  "linesV",
  "linesD",
  "whiteNoise",
  "blueNoise",
  "floyd",
  "atkinson",
  "stucki",
  "sierraLite",
] as const;
export const DITHER_PALETTES = [
  "mono",
  "grey4",
  "rgb3",
  "gameboy",
  "cga0",
  "cga1",
  "pico8",
  "c64",
  "nes16",
  "cyberpunk",
  "pastel",
  "riso",
  "sepia",
  "grey8",
  "original",
  "custom",
] as const;
export const DITHER_CHROMA = ["standard", "luminance", "perChannel"] as const;
export const DITHER_DIRECTIONS = [
  "right",
  "left",
  "down",
  "up",
  "downright",
  "downleft",
  "upright",
  "upleft",
] as const;
export interface DitherParameters {
  algorithm: (typeof DITHER_ALGORITHMS)[number];
  palette: (typeof DITHER_PALETTES)[number];
  chroma: (typeof DITHER_CHROMA)[number];
  pixelSize: number;
  strength: number;
  contrast: number;
  threshold: number;
  angle: number;
  customPalette: string[];
  animate: false;
  shimmer: false;
  direction: (typeof DITHER_DIRECTIONS)[number];
  speed: number;
}
export function validateDitherParameters(value: unknown): DitherParameters {
  const p = styleObject(
    value,
    "algorithm palette chroma pixelSize strength contrast threshold angle customPalette animate shimmer direction speed",
  );
  function choice<T extends string>(value: unknown, choices: readonly T[]): T {
    if (typeof value !== "string" || !choices.includes(value as T))
      throw new Error("Invalid Dither selection");
    return value as T;
  }
  if (p.animate !== false || p.shimmer !== false)
    throw new Error("Dither animation unavailable");
  if (
    !Array.isArray(p.customPalette) ||
    p.customPalette.length < 2 ||
    p.customPalette.length > 64
  )
    throw new Error("Invalid Dither palette count");
  const colors: string[] = [];
  for (let i = 0; i < p.customPalette.length; i++) {
    const d = Object.getOwnPropertyDescriptor(p.customPalette, String(i));
    if (
      !d ||
      !("value" in d) ||
      typeof d.value !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(d.value)
    )
      throw new Error("Invalid opaque Dither color");
    colors.push(d.value.toLowerCase());
  }
  return {
    algorithm: choice(p.algorithm, DITHER_ALGORITHMS),
    palette: choice(p.palette, DITHER_PALETTES),
    chroma: choice(p.chroma, DITHER_CHROMA),
    pixelSize: styleNumber(p.pixelSize, 1, 12, true),
    strength: styleNumber(p.strength, 0, 100, true),
    contrast: styleNumber(p.contrast, 0, 200, true),
    threshold: styleNumber(p.threshold, 0, 100, true),
    angle: styleNumber(p.angle, 0, 180, true),
    customPalette: colors,
    animate: false,
    shimmer: false,
    direction: choice(p.direction, DITHER_DIRECTIONS),
    speed: styleNumber(p.speed, 1, 4, true),
  };
}
