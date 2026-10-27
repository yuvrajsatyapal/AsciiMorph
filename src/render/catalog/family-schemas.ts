import type { ParameterDescriptor, ParameterRule, StyleSchema } from "./types";
const common: ParameterDescriptor[] = [
  {
    key: "fontSize",
    label: "Cell Size",
    type: "number",
    default: 11,
    min: 3,
    max: 80,
    step: 1,
  },
  {
    key: "brightness",
    label: "Brightness",
    type: "number",
    default: 0,
    min: -100,
    max: 100,
  },
  {
    key: "contrast",
    label: "Contrast",
    type: "number",
    default: 20,
    min: -100,
    max: 100,
  },
  { key: "invert", label: "Invert Mapping", type: "boolean", default: false },
  {
    key: "charOpacity",
    label: "Opacity",
    type: "number",
    default: 100,
    min: 0,
    max: 100,
  },
];
const commonRules: Record<string, ParameterRule> = {
  fontSize: { kind: "number", min: 3, max: 80, integer: true },
  brightness: { kind: "number", min: -100, max: 100 },
  contrast: { kind: "number", min: -100, max: 100 },
  invert: { kind: "boolean" },
  charOpacity: { kind: "number", min: 0, max: 100 },
};
/** Independent bounded family contracts. Only production-smoked raster profiles bind. */
export const initialFamilySchemas: StyleSchema[] = [
  [
    "braille",
    "Braille",
    4,
    {
      key: "brailleThreshold",
      label: "Local profile threshold",
      type: "number",
      default: 50,
      min: 0,
      max: 100,
    },
    { kind: "number", min: 0, max: 100 },
  ],
  ["pixel", "Pixel Art", 10, null, null],
  [
    "mosaic",
    "Mosaic",
    11,
    {
      key: "mosaicShape",
      label: "Tile Shape",
      type: "select",
      default: "square",
      options: [
        { value: "square", label: "Square" },
        { value: "wide", label: "Wide" },
        { value: "tall", label: "Tall" },
      ],
    },
    { kind: "select", values: ["square", "wide", "tall"] },
  ],
].map(([id, name, dispatch, extra, rule]) => {
  const parameter = extra as ParameterDescriptor | null;
  const accepted = id === "pixel" || id === "mosaic" || id === "braille";
  return {
    evidence: "independent-contract",
    defaultsVersion: 1,
    binding: accepted
      ? { dispatchId: dispatch as number, backend: "rust-cpu" as const }
      : null,
    rules: {
      ...commonRules,
      ...(parameter ? { [parameter.key]: rule as ParameterRule } : {}),
    },
    descriptor: {
      id: id as string,
      mode: id as string,
      name: name as string,
      dispatchId: accepted ? (dispatch as number) : 0,
      category: "ASCII & Text",
      tags: [],
      ready: accepted,
      output: "rgba",
      parameters: [...common, ...(parameter ? [parameter] : [])],
    },
  };
});
