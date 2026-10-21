import type { StyleSchema } from "./types";

/** Independent four-control subset. Anchors: ui-0306, charSet resolution, ui-0464/0465.
 * Data acceptance does not implement reference tone, sampling, calibrated ramps or output. */
export const initialCharacterSchema: StyleSchema = {
  evidence: "independent-contract",
  defaultsVersion: 1,
  binding: null,
  rules: {
    fontSize: { kind: "number", min: 3, max: 80 },
    charSet: { kind: "text", minLength: 2, maxLength: 512, graphemeRamp: true },
    brightness: { kind: "number", min: -100, max: 100 },
    contrast: { kind: "number", min: -100, max: 100 },
  },
  descriptor: {
    id: "characters",
    mode: "characters",
    name: "Characters",
    category: "ASCII & Text",
    tags: [],
    ready: false,
    output: "glyph",
    dispatchId: 0,
    parameters: [
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
        key: "charSet",
        label: "Character Set",
        type: "text",
        default: "@#S08Xx+=-;:. ",
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
    ],
  },
};
