import {
  DITHER_ALGORITHMS,
  DITHER_PALETTES,
  DITHER_CHROMA,
  DITHER_DIRECTIONS,
} from "../dither-contract";
import { contextDescriptors, contextRules } from "./style-context-schema";
import type { ParameterDescriptor, ParameterRule, StyleSchema } from "./types";
const labels: Record<string, string> = {
  floyd: "Floyd–Steinberg",
  atkinson: "Atkinson",
  stucki: "Stucki",
  sierraLite: "Sierra Lite",
  bayer2: "Bayer 2 × 2",
  bayer4: "Bayer 4 × 4",
  bayer8: "Bayer 8 × 8",
  bayer16: "Bayer 16 × 16",
  halftone: "Halftone",
  radial: "Radial",
  linesH: "Horizontal Lines",
  linesV: "Vertical Lines",
  linesD: "Diagonal Lines",
  whiteNoise: "White Noise",
  blueNoise: "Blue Noise",
  original: "Source RGB332 (local)",
  mono: "Monochrome",
  grey4: "4 Grays",
  grey8: "8 Grays",
  rgb3: "RGB 3-bit",
  gameboy: "Game Boy",
  cga0: "CGA 0",
  cga1: "CGA 1",
  pico8: "PICO-8",
  c64: "Commodore 64",
  nes16: "NES 16",
  cyberpunk: "Cyberpunk",
  pastel: "Pastel",
  riso: "Risograph",
  sepia: "Sepia",
  custom: "Custom",
  standard: "RGB Distance",
  luminance: "Luminance",
  perChannel: "Per Channel",
};
const rules: Record<string, ParameterRule> = { ...contextRules };
const descriptors: ParameterDescriptor[] = [];
function select(
  key: string,
  label: string,
  values: readonly string[],
  value: string,
) {
  rules[key] = { kind: "select", values };
  descriptors.push({
    key,
    label,
    type: "select",
    default: value,
    options: values.map((value) => ({ value, label: labels[value] ?? value })),
  });
}
function number(
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
) {
  rules[key] = { kind: "number", min, max, integer: true };
  descriptors.push({
    key,
    label,
    type: "number",
    default: value,
    min,
    max,
    step: 1,
  });
}
select("ditherAlgorithm", "Algorithm", DITHER_ALGORITHMS, "floyd");
select("ditherPalette", "Palette", DITHER_PALETTES, "mono");
select("ditherChroma", "Chroma", DITHER_CHROMA, "standard");
number("ditherPixelSize", "Pixel Size", 2, 1, 12);
number("ditherStrength", "Strength", 100, 0, 100);
number("ditherContrast", "Contrast", 110, 0, 200);
number("ditherThreshold", "Threshold", 50, 0, 100);
number("ditherAngle", "Angle", 0, 0, 180);
rules.ditherCustomPalette = {
  kind: "array",
  item: { kind: "color", opaque: true },
  minItems: 2,
  maxItems: 64,
};
descriptors.push({
  key: "ditherCustomPalette",
  label: "Custom Palette",
  type: "palette",
  default: ["#000000", "#ffffff"],
});
for (const key of ["ditherAnimate", "ditherShimmer"]) {
  rules[key] = { kind: "select", values: [false] };
  descriptors.push({
    key,
    label: key === "ditherAnimate" ? "Animate" : "Shimmer",
    type: "select",
    default: false,
  });
}
select("ditherDirection", "Direction", DITHER_DIRECTIONS, "right");
number("ditherSpeed", "Speed", 4, 1, 4);
export const ditherSchema: StyleSchema = {
  evidence: "independent-contract",
  defaultsVersion: 1,
  binding: { dispatchId: 15, backend: "rust-cpu" },
  rules,
  descriptor: {
    id: "dither",
    mode: "dither",
    name: "Dither",
    category: "ASCII & Text",
    tags: ["palette", "diffusion", "ordered"],
    ready: true,
    output: "rgba",
    dispatchId: 15,
    parameters: [...descriptors, ...contextDescriptors],
  },
};
