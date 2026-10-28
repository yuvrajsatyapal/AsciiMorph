import type { ParameterDescriptor, ParameterRule } from "./types";
export const contextDescriptors: ParameterDescriptor[] = [
  {
    key: "bgMode",
    label: "Backdrop",
    type: "select",
    default: "blur",
    options: [
      { value: "none", label: "None" },
      { value: "solid", label: "Solid Black" },
      { value: "original", label: "Original" },
      { value: "blur", label: "Blur" },
    ],
  },
  {
    key: "bgBlur",
    label: "Softness",
    type: "number",
    default: 8,
    min: 0,
    max: 60,
    step: 1,
  },
  {
    key: "bgOpacity",
    label: "Backdrop Opacity",
    type: "number",
    default: 100,
    min: 0,
    max: 100,
  },
  {
    key: "coverage",
    label: "Coverage",
    type: "number",
    default: 100,
    min: 0,
    max: 100,
  },
  {
    key: "blend",
    label: "Blend",
    type: "select",
    default: "source-over",
    options: [
      { value: "source-over", label: "Normal" },
      { value: "overlay", label: "Overlay" },
      { value: "color-dodge", label: "Color Dodge" },
      { value: "screen", label: "Screen" },
      { value: "lighter", label: "Lighter" },
    ],
  },
];
export const contextRules: Record<string, ParameterRule> = {
  bgMode: { kind: "select", values: ["none", "solid", "original", "blur"] },
  bgBlur: { kind: "number", min: 0, max: 60 },
  bgOpacity: { kind: "number", min: 0, max: 100 },
  coverage: { kind: "number", min: 0, max: 100 },
  blend: {
    kind: "select",
    values: ["source-over", "overlay", "color-dodge", "screen", "lighter"],
  },
};
/** Only missing additive fields migrate. Historical required fields stay required. */
export function migrateContextParameters(
  id: string,
  p: Record<string, unknown>,
): Record<string, unknown> {
  const legacy =
    id === "characters"
      ? ["fontSize", "charSet", "brightness", "contrast"]
      : id === "pixel"
        ? ["fontSize", "brightness", "contrast", "invert", "charOpacity"]
        : id === "mosaic"
          ? [
              "fontSize",
              "brightness",
              "contrast",
              "invert",
              "charOpacity",
              "mosaicShape",
            ]
          : id === "braille"
            ? [
                "fontSize",
                "brightness",
                "contrast",
                "invert",
                "charOpacity",
                "brailleThreshold",
              ]
            : null;
  if (
    !legacy ||
    legacy.some((k) => !Object.hasOwn(p, k)) ||
    Object.keys(p).some((k) => !legacy.includes(k))
  )
    return p;
  const additions = Object.fromEntries(
    contextDescriptors.map((d) => [d.key, d.default]),
  );
  if (id === "characters")
    Object.assign(additions, {
      invert: false,
      charOpacity: 100,
      randomChars: false,
    });
  return { ...additions, ...p };
}
