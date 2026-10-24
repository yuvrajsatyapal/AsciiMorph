import { initialFamilySchemas } from "./family-schemas";
import { initialCharacterSchema } from "./character-schema";
import { createCatalogRegistry } from "./registry";
import type { ParameterRule, StyleSchema } from "./types";

/** Independently transcribed static declarations; no renderer implementation or binding. */
type Control = readonly [
  suffix: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
];
const declarations: readonly [string, string, readonly Control[]][] = [
  [
    "cyanotype",
    "Cyanotype",
    [
      ["exposure", "Sun Time", 1, 0.2, 2, 0.01],
      ["blue", "Prussian Depth", 0.65, 0, 1, 0.01],
      ["age", "Yellowing", 0.5, 0, 1, 0.01],
      ["paper", "Paper Tooth", 0.3, 0, 1, 0.01],
      ["bleed", "Wick", 0.25, 0, 1, 0.01],
      ["brush", "Ragged Coat", 0, 0, 1, 0.01],
      ["rinse", "Rinse Streaks", 0, 0, 1, 0.01],
      ["blendmode", "Blend Mode", 0, 0, 13, 1],
      ["seed", "Seed", 0, 0, 999, 1],
    ],
  ],
  [
    "hexhalftone",
    "Honeycomb Screen",
    [
      ["size", "Dot Size", 13, 3, 40, 0.5],
      ["angle", "Screen Angle", 0, 0, 60, 1],
      ["color", "Photo Colour Ink", 0, 0, 1, 0.01],
      ["paper", "Paper Tone", 0.45, 0, 1, 0.01],
      ["shape", "Dot Shape", 0, 0, 1, 0.01],
      ["blendmode", "Blend Mode", 0, 0, 13, 1],
    ],
  ],
  [
    "paperstock",
    "Crumpled Print",
    [
      ["intensity", "Paper Strength", 0.8, 0, 1, 0.01],
      ["crumple", "Crush", 0.95, 0, 2, 0.01],
      ["crumple_scale", "Crease Size", 5, 1, 10, 0.1],
      ["flatness", "Smoothing", 7, 1, 60, 0.1],
      ["displace", "Warp", 0.0016, 0, 0.08, 0.0001],
      ["fiber", "Pulp Fibres", 0.44, 0, 1, 0.01],
      ["fiber_scale", "Fibre Length", 1.7, 0.5, 4, 0.01],
      ["light_angle", "Lamp Angle", 0.18, 0, 1, 0.01],
      ["light_elev", "Lamp Height", 0.52, 0, 1, 0.01],
      ["tear", "Torn Edge", 0, 0, 1, 0.01],
      ["blendmode", "Blend Mode", 0, 0, 13, 1],
      ["seed", "Seed", 0, 0, 999, 1],
    ],
  ],
  [
    "oilpool",
    "Oil Pool",
    [
      ["scale", "Scale", 1, 0.3, 3, 0.01],
      ["bands", "Bands", 0.6, 0, 1, 0.01],
      ["strength", "Strength", 0.6, 0, 1, 0.01],
      ["islands", "Puddle Islands", 0, 0, 1, 0.01],
      ["blendmode", "Blend Mode", 0, 0, 13, 1],
      ["seed", "Seed", 0, 0, 999, 1],
    ],
  ],
  [
    "anodized",
    "Anodized",
    [
      ["shift", "Oxide Shift", 0.18, 0, 1, 0.01],
      ["brush", "Brushing", 0.5, 0, 1, 0.01],
      ["metal", "Metal", 0.6, 0, 1, 0.01],
      ["torch", "Torch Rings", 0, 0, 1, 0.01],
      ["blendmode", "Blend Mode", 0, 0, 13, 1],
    ],
  ],
];
export const shaderBlendLabels = Object.freeze([
  "Normal",
  "Multiply",
  "Screen",
  "Overlay",
  "Soft Light",
  "Hard Light",
  "Color Dodge",
  "Color Burn",
  "Darken",
  "Lighten",
  "Difference",
  "Exclusion",
  "Luminosity",
  "Color",
]);
const shaders: StyleSchema[] = declarations.map(([id, name, controls]) => ({
  evidence: "static-declaration",
  defaultsVersion: 1,
  binding: null,
  rules: Object.fromEntries(
    controls.map(([suffix, , , min, max]) => [
      `sfx_${id}_${suffix}`,
      {
        kind: "number",
        min,
        max,
        ...(["blendmode", "seed"].includes(suffix) ? { integer: true } : {}),
      } satisfies ParameterRule,
    ]),
  ),
  descriptor: {
    id,
    mode: id,
    name,
    category: "Shader",
    tags: [],
    ready: false,
    output: "rgba",
    dispatchId: 0,
    parameters: controls.map(([suffix, label, value, min, max, step]) => ({
      key: `sfx_${id}_${suffix}`,
      label,
      type: "number",
      default: value,
      min,
      max,
      step,
    })),
  },
}));
// Publish only the checked immutable snapshots, not mutable registration inputs.
export const initialCatalogRegistry = createCatalogRegistry(
  [...shaders, initialCharacterSchema, ...initialFamilySchemas],
  [],
);
export const initialShaderSchemas = Object.freeze(
  shaders.map((s) => initialCatalogRegistry.getStyle(s.descriptor.id)!),
);
