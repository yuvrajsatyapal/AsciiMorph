import type { ParameterMap, ParameterValue } from "../project";
export type ParameterRule =
  | { kind: "number"; min: number; max: number; integer?: boolean }
  | { kind: "boolean" }
  | { kind: "color"; opaque?: true }
  | { kind: "select"; values: readonly (string | number | boolean)[] }
  | { kind: "text"; minLength: number; maxLength: number; graphemeRamp?: true }
  | { kind: "array"; item: ParameterRule; minItems: number; maxItems: number }
  | { kind: "object"; fields: Readonly<Record<string, ParameterRule>> }
  | { kind: "null" };
export type ParameterDescriptor = {
  key: string;
  label: string;
  type:
    | "number"
    | "boolean"
    | "color"
    | "select"
    | "text"
    | "curve"
    | "point"
    | "palette"
    | "null";
  default: ParameterValue;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
};
export type StyleDescriptor = {
  id: string;
  mode: string;
  name: string;
  category: string;
  tags: string[];
  parameters: ParameterDescriptor[];
  ready: boolean;
  output: "glyph" | "rgba";
  dispatchId: number;
};
export type EffectDescriptor = {
  key: string;
  phase: number;
  order: number;
  parameters: ParameterDescriptor[];
};
export type SchemaEvidence =
  | "independent-contract"
  | "static-declaration"
  | "runtime-verified";
export type RendererBinding = {
  dispatchId: number;
  backend: "rust-cpu" | "rust-gpu";
};
type SchemaContract = {
  rules: Readonly<Record<string, ParameterRule>>;
  evidence: SchemaEvidence;
  defaultsVersion: 1;
  binding: RendererBinding | null;
};
export type StyleSchema = SchemaContract & { descriptor: StyleDescriptor };
export type EffectSchema = SchemaContract & { descriptor: EffectDescriptor };
export interface CatalogRegistry {
  getStyle(id: string): StyleSchema | undefined;
  getEffect(key: string): EffectSchema | undefined;
  validateStyle(id: string, parameters: unknown): ParameterMap;
  validateEffect(key: string, parameters: unknown): ParameterMap;
  styleDefaults(id: string): ParameterMap;
  effectDefaults(key: string): ParameterMap;
}
