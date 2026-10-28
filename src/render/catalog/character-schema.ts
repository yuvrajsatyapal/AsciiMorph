import { contextDescriptors, contextRules } from "./style-context-schema";
import type { StyleSchema } from "./types";

/** Independent four-control subset. Anchors: ui-0306, charSet resolution, ui-0464/0465.
 * Complete Rust context v1 is independently implemented; reference parity stays open. */
export const initialCharacterSchema: StyleSchema = {
  evidence: "independent-contract",
  defaultsVersion: 1,
  binding: { dispatchId: 1, backend: "rust-cpu" },
  rules: {
    ...contextRules,
    invert: { kind: "boolean" },
    charOpacity: { kind: "number", min: 0, max: 100 },
    randomChars: { kind: "boolean" },
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
    ready: true,
    output: "rgba",
    dispatchId: 1,
    parameters: [
      ...contextDescriptors,
      {
        key: "invert",
        label: "Invert Mapping",
        type: "boolean",
        default: false,
      },
      {
        key: "charOpacity",
        label: "Opacity",
        type: "number",
        default: 100,
        min: 0,
        max: 100,
      },
      {
        key: "randomChars",
        label: "Random Characters",
        type: "boolean",
        default: false,
      },
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
