import { migrateContextParameters } from "./style-context-schema";
import type { ParameterMap, ParameterValue } from "../project";
import { ProjectValidationError } from "../project-errors";
import { sanitizeProjectJson } from "../project-json";
import type {
  CatalogRegistry,
  EffectSchema,
  ParameterDescriptor,
  ParameterRule,
  StyleSchema,
} from "./types";

function invalid(path: string, message: string): never {
  throw new ProjectValidationError("invalid-project", path, message);
}
function record(value: unknown, path: string): Record<string, ParameterValue> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    invalid(path, "Expected object");
  return value as Record<string, ParameterValue>;
}
function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
) {
  for (const key of Object.keys(value))
    if (!keys.includes(key))
      throw new ProjectValidationError(
        "unknown-parameter",
        `${path}.${key}`,
        "Unknown parameter",
      );
  for (const key of keys)
    if (!Object.hasOwn(value, key))
      invalid(`${path}.${key}`, "Missing parameter");
}
const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
function validateRule(
  rule: ParameterRule,
  value: ParameterValue,
  path: string,
): void {
  switch (rule.kind) {
    case "number":
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < rule.min ||
        value > rule.max ||
        (rule.integer && !Number.isSafeInteger(value))
      )
        invalid(path, "Invalid number");
      return;
    case "boolean":
      if (typeof value !== "boolean") invalid(path, "Expected boolean");
      return;
    case "null":
      if (value !== null) invalid(path, "Expected null");
      return;
    case "color":
      if (
        typeof value !== "string" ||
        !(rule.opaque ? /^#[\da-f]{6}$/i : /^#[\da-f]{6}([\da-f]{2})?$/i).test(
          value,
        )
      )
        invalid(path, "Expected #RRGGBB or #RRGGBBAA");
      return;
    case "select":
      if (!rule.values.some((candidate) => candidate === value))
        invalid(path, "Invalid selection");
      return;
    case "text": {
      if (
        typeof value !== "string" ||
        value.length < rule.minLength ||
        value.length > rule.maxLength
      )
        invalid(path, "Invalid text length");
      if (rule.graphemeRamp) {
        const graphemes = Array.from(
          segmenter.segment(value),
          (item) => item.segment,
        );
        if (
          graphemes.length < 2 ||
          graphemes.length > 256 ||
          new Set(graphemes).size !== graphemes.length ||
          graphemes.some(
            (g) =>
              g.length > 64 ||
              /^\p{Mark}/u.test(g) ||
              /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(g) ||
              !/[^\p{Cf}]/u.test(g),
          )
        )
          invalid(path, "Invalid printable unique grapheme ramp");
      }
      return;
    }
    case "array":
      if (
        !Array.isArray(value) ||
        value.length < rule.minItems ||
        value.length > rule.maxItems
      )
        invalid(path, "Invalid array length");
      value.forEach((item, i) =>
        validateRule(rule.item, item, `${path}[${i}]`),
      );
      return;
    case "object": {
      const fields = record(value, path);
      exact(fields, Object.keys(rule.fields), path);
      for (const [key, child] of Object.entries(rule.fields))
        validateRule(child, fields[key], `${path}.${key}`);
      return;
    }
  }
}
function checkRule(rule: ParameterRule, path: string): void {
  const keys: Record<ParameterRule["kind"], string[]> = {
    number: ["kind", "min", "max", "integer"],
    boolean: ["kind"],
    color: ["kind", "opaque"],
    select: ["kind", "values"],
    text: ["kind", "minLength", "maxLength", "graphemeRamp"],
    array: ["kind", "item", "minItems", "maxItems"],
    object: ["kind", "fields"],
    null: ["kind"],
  };
  if (!rule || typeof rule !== "object" || !Object.hasOwn(keys, rule.kind))
    invalid(path, "Invalid rule");
  for (const key of Object.keys(rule))
    if (!keys[rule.kind].includes(key)) invalid(path, "Unknown rule field");
  const range = (min: number, max: number, integer = false) => {
    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      min > max ||
      (integer &&
        (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 0))
    )
      invalid(path, "Invalid rule bounds");
  };
  switch (rule.kind) {
    case "color":
      if (rule.opaque !== undefined && rule.opaque !== true)
        invalid(path, "Invalid opaque flag");
      break;
    case "number":
      range(rule.min, rule.max);
      if (rule.integer !== undefined && typeof rule.integer !== "boolean")
        invalid(path, "Invalid integer flag");
      break;
    case "text":
      range(rule.minLength, rule.maxLength, true);
      if (
        rule.maxLength > 65536 ||
        (rule.graphemeRamp !== undefined && rule.graphemeRamp !== true)
      )
        invalid(path, "Invalid text rule");
      break;
    case "array":
      range(rule.minItems, rule.maxItems, true);
      if (rule.maxItems > 1024) invalid(path, "Invalid array rule");
      checkRule(rule.item, `${path}.item`);
      break;
    case "object":
      for (const [key, child] of Object.entries(record(rule.fields, path)))
        checkRule(child as ParameterRule, `${path}.${key}`);
      break;
    case "select":
      if (
        !Array.isArray(rule.values) ||
        !rule.values.length ||
        new Set(rule.values).size !== rule.values.length ||
        rule.values.some(
          (v) =>
            !["string", "number", "boolean"].includes(typeof v) ||
            (typeof v === "number" && !Number.isFinite(v)),
        )
      )
        invalid(path, "Invalid select rule");
      break;
  }
}
function isPoint(rule: ParameterRule): boolean {
  return (
    rule.kind === "object" &&
    Object.keys(rule.fields).length === 2 &&
    rule.fields.x?.kind === "number" &&
    rule.fields.y?.kind === "number"
  );
}
function checkDescriptor(
  d: ParameterDescriptor,
  rule: ParameterRule,
  path: string,
) {
  if (!d.key || !d.label || typeof d.label !== "string")
    invalid(path, "Invalid descriptor");
  const expected =
    rule.kind === "array"
      ? rule.item.kind === "color"
        ? "palette"
        : isPoint(rule.item)
          ? "curve"
          : null
      : rule.kind === "object"
        ? isPoint(rule)
          ? "point"
          : null
        : rule.kind;
  if (d.type !== expected)
    invalid(path, "Descriptor projection does not match rule");
  if (rule.kind === "number") {
    if (
      d.min !== rule.min ||
      d.max !== rule.max ||
      (d.step !== undefined && (!Number.isFinite(d.step) || d.step <= 0))
    )
      invalid(path, "Descriptor range/step does not match rule");
  } else if (d.min !== undefined || d.max !== undefined || d.step !== undefined)
    invalid(path, "Unexpected numeric descriptor metadata");
  if (
    rule.kind === "select" &&
    rule.values.every((v) => typeof v === "string")
  ) {
    if (
      !d.options ||
      d.options.length !== rule.values.length ||
      d.options.some(
        (o, i) =>
          o.value !== rule.values[i] || typeof o.label !== "string" || !o.label,
      )
    )
      invalid(path, "Descriptor options do not match rule");
  } else if (d.options !== undefined)
    invalid(path, "Unexpected descriptor options");
  validateRule(rule, d.default, `${path}.default`);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
/** Checked snapshots: metadata never grants session capability on its own. */
export function createCatalogRegistry(
  styles: readonly StyleSchema[],
  effects: readonly EffectSchema[],
): CatalogRegistry {
  const styleMap = new Map<string, StyleSchema>(),
    effectMap = new Map<string, EffectSchema>(),
    dispatches = new Set<number>();
  function prepare<T extends StyleSchema | EffectSchema>(
    original: T,
    isStyle: boolean,
  ): T {
    const schema = sanitizeProjectJson(original) as unknown as T;
    const d = schema.descriptor;
    if (
      schema.defaultsVersion !== 1 ||
      ![
        "independent-contract",
        "static-declaration",
        "runtime-verified",
      ].includes(schema.evidence)
    )
      invalid("registry", "Invalid schema provenance/version");
    if (
      !schema.rules ||
      typeof schema.rules !== "object" ||
      Array.isArray(schema.rules)
    )
      invalid("registry.rules", "Expected rules");
    if (!Array.isArray(d.parameters))
      invalid("registry.parameters", "Expected descriptors");
    const seen = new Set<string>();
    for (const descriptor of d.parameters) {
      if (
        seen.has(descriptor.key) ||
        !Object.hasOwn(schema.rules, descriptor.key)
      )
        invalid("registry.parameters", "Duplicate or missing descriptor rule");
      seen.add(descriptor.key);
      checkRule(
        schema.rules[descriptor.key],
        `registry.rules.${descriptor.key}`,
      );
      checkDescriptor(
        descriptor,
        schema.rules[descriptor.key],
        `registry.parameters.${descriptor.key}`,
      );
    }
    if (seen.size !== Object.keys(schema.rules).length)
      invalid("registry.parameters", "Missing descriptor");
    const binding = schema.binding;
    if (binding !== null) {
      if (
        !binding ||
        !Number.isSafeInteger(binding.dispatchId) ||
        binding.dispatchId <= 0 ||
        !["rust-cpu", "rust-gpu"].includes(binding.backend) ||
        dispatches.has(binding.dispatchId)
      )
        invalid("registry.binding", "Invalid or duplicate binding");
      dispatches.add(binding.dispatchId);
    }
    if (isStyle) {
      const style = d as StyleSchema["descriptor"];
      if (
        !style.id ||
        style.id !== style.mode ||
        typeof style.name !== "string" ||
        !style.name ||
        typeof style.category !== "string" ||
        !Array.isArray(style.tags) ||
        style.tags.some((t) => typeof t !== "string") ||
        !["rgba", "glyph"].includes(style.output) ||
        style.ready !== (binding !== null) ||
        style.dispatchId !== (binding?.dispatchId ?? 0)
      )
        invalid("registry.descriptor", "Invalid style descriptor/binding");
    } else {
      const effect = d as EffectSchema["descriptor"];
      if (
        typeof effect.key !== "string" ||
        !effect.key ||
        !Number.isSafeInteger(effect.phase) ||
        effect.phase < 0 ||
        !Number.isSafeInteger(effect.order) ||
        effect.order < 0
      )
        invalid("registry.descriptor", "Invalid effect descriptor");
    }
    return freeze(schema);
  }
  for (const value of styles) {
    const schema = prepare(value, true);
    if (styleMap.has(schema.descriptor.id))
      invalid("registry", "Duplicate style");
    styleMap.set(schema.descriptor.id, schema);
  }
  for (const value of effects) {
    const schema = prepare(value, false);
    if (effectMap.has(schema.descriptor.key))
      invalid("registry", "Duplicate effect");
    effectMap.set(schema.descriptor.key, schema);
  }
  function requireSchema<T>(map: Map<string, T>, id: string, path: string): T {
    const value = map.get(id);
    if (!value)
      throw new ProjectValidationError(
        "unsupported-schema",
        path,
        `Unknown schema ${id}`,
      );
    return value;
  }
  function validate(
    schema: StyleSchema | EffectSchema,
    value: unknown,
    path: string,
  ): ParameterMap {
    const raw = record(sanitizeProjectJson(value), path);
    const result =
      path === "style.parameters"
        ? (migrateContextParameters(
            "id" in schema.descriptor ? schema.descriptor.id : "",
            raw,
          ) as ParameterMap)
        : raw;
    exact(result, Object.keys(schema.rules), path);
    for (const [key, rule] of Object.entries(schema.rules))
      validateRule(rule, result[key], `${path}.${key}`);
    return result;
  }
  function defaults(schema: StyleSchema | EffectSchema): ParameterMap {
    return sanitizeProjectJson(
      Object.fromEntries(
        schema.descriptor.parameters.map((p) => [p.key, p.default]),
      ),
    ) as ParameterMap;
  }
  return Object.freeze({
    getStyle: (id: string) => styleMap.get(id),
    getEffect: (key: string) => effectMap.get(key),
    validateStyle: (id: string, p: unknown) =>
      validate(requireSchema(styleMap, id, "style.id"), p, "style.parameters"),
    validateEffect: (key: string, p: unknown) =>
      validate(
        requireSchema(effectMap, key, "effect.key"),
        p,
        "effect.parameters",
      ),
    styleDefaults: (id: string) =>
      defaults(requireSchema(styleMap, id, "style.id")),
    effectDefaults: (key: string) =>
      defaults(requireSchema(effectMap, key, "effect.key")),
  });
}
