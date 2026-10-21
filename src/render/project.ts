import {
  DEFAULT_MEMORY_BUDGET_BYTES,
  MAX_SOURCE_DIMENSION,
} from "./character-contract";
import type { SourceRef } from "./character-contract";
import type { CatalogRegistry } from "./catalog/types";
import { initialCatalogRegistry } from "./catalog/initial-schemas";
import { ProjectValidationError } from "./project-errors";
import { parseBoundedProjectJson, sanitizeProjectJson } from "./project-json";
export { ProjectValidationError } from "./project-errors";
export type { ProjectErrorCode } from "./project-errors";

export type ParameterValue =
  | number
  | string
  | boolean
  | null
  | ParameterValue[]
  | { [key: string]: ParameterValue };
export type ParameterMap = Record<string, ParameterValue>;
export type NormalizedCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type EffectState = {
  id: string;
  key: string;
  enabled: boolean;
  parameters: ParameterMap;
};
export type MaskV1 = {
  id: string;
  targetId: string;
  assetId: string;
  invert: boolean;
  opacity: number;
};
export type TextOverlayV1 = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  fontFamily: string;
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
  rotation: number;
};
export type ExportSettingsV1 = {
  format: "png" | "jpeg" | "gif" | "webm" | "mp4";
  scale: 1 | 2 | 3 | 4;
  fps: 15 | 20 | 24 | 30 | 60;
  durationUs: number;
  quality: number;
  audio: boolean;
};
export type RenderProjectV1 = {
  version: 1;
  id: string;
  name: string;
  source: SourceRef | null;
  crop: NormalizedCrop;
  rotation: 0 | 90 | 180 | 270;
  style: { id: string; parameters: ParameterMap };
  effects: EffectState[];
  masks: MaskV1[];
  text: TextOverlayV1[];
  seed: number;
  timeUs: number;
  export: ExportSettingsV1;
  graph?: never;
};

function invalid(path: string, message = "Invalid project value"): never {
  throw new ProjectValidationError("invalid-project", path, message);
}
function object(
  value: unknown,
  path: string,
  keys: readonly string[],
): Record<string, ParameterValue> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid(path, "Expected record");
  const result = value as Record<string, ParameterValue>;
  for (const key of Object.keys(result))
    if (!keys.includes(key))
      invalid(path ? `${path}.${key}` : key, "Unknown field");
  for (const key of keys)
    if (!Object.hasOwn(result, key))
      invalid(path ? `${path}.${key}` : key, "Missing field");
  return result;
}
function number(
  value: unknown,
  path: string,
  min = -Number.MAX_VALUE,
  max = Number.MAX_VALUE,
  integer = false,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    invalid(path, "Invalid finite number");
  return value;
}
function string(
  value: unknown,
  path: string,
  max = 65536,
  nonempty = false,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (nonempty && !value.trim())
  )
    invalid(path, "Invalid string");
  return value;
}
function id(value: unknown, path: string): string {
  return string(value, path, 128, true);
}
function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalid(path, "Expected boolean");
  return value;
}
function choice<T extends string | number>(
  value: unknown,
  path: string,
  values: readonly T[],
): T {
  if (!values.includes(value as T)) invalid(path, "Invalid selection");
  return value as T;
}
function source(value: unknown, path: string): SourceRef {
  const s = object(value, path, ["id", "revision", "width", "height"]);
  const result = {
    id: id(s.id, `${path}.id`),
    revision: number(
      s.revision,
      `${path}.revision`,
      0,
      Number.MAX_SAFE_INTEGER,
      true,
    ),
    width: number(s.width, `${path}.width`, 1, MAX_SOURCE_DIMENSION, true),
    height: number(s.height, `${path}.height`, 1, MAX_SOURCE_DIMENSION, true),
  };
  if (result.width > DEFAULT_MEMORY_BUDGET_BYTES / 4 / result.height)
    invalid(path, "Source RGBA exceeds memory budget");
  return result;
}
function array(value: unknown, path: string, max: number): ParameterValue[] {
  if (!Array.isArray(value) || value.length > max)
    invalid(path, "Invalid collection count");
  return value;
}

/** Own root feature checks deliberately precede recursive sanitation (even graph:undefined). */
function precheck(value: unknown): void {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    invalid("", "Expected plain project record");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.hasOwn(descriptors, "version")) {
    const descriptor = descriptors.version;
    if (!("value" in descriptor))
      invalid("version", "Expected own version data");
    if (descriptor.value !== 1)
      throw new ProjectValidationError(
        "unsupported-version",
        "version",
        "Unsupported project version",
      );
  }
  if (Object.hasOwn(descriptors, "graph"))
    throw new ProjectValidationError(
      "unsupported-version-feature",
      "graph",
      "Flow graph is not supported by this version",
    );
}
/** Validates and detaches a complete saved project; this does not establish render readiness. */
export function validateRenderProject(
  value: unknown,
  registry: CatalogRegistry = initialCatalogRegistry,
): RenderProjectV1 {
  precheck(value);
  const p = object(sanitizeProjectJson(value), "", [
    "version",
    "id",
    "name",
    "source",
    "crop",
    "rotation",
    "style",
    "effects",
    "masks",
    "text",
    "seed",
    "timeUs",
    "export",
  ]);
  const crop = object(p.crop, "crop", ["x", "y", "width", "height"]);
  const c = {
    x: number(crop.x, "crop.x", 0, 1),
    y: number(crop.y, "crop.y", 0, 1),
    width: number(crop.width, "crop.width", Number.MIN_VALUE, 1),
    height: number(crop.height, "crop.height", Number.MIN_VALUE, 1),
  };
  if (c.x + c.width > 1.000001 || c.y + c.height > 1.000001)
    invalid("crop", "Crop outside normalized frame");
  const style = object(p.style, "style", ["id", "parameters"]);
  const styleId = id(style.id, "style.id");
  const parameters = registry.validateStyle(styleId, style.parameters);
  const effects = array(p.effects, "effects", 64).map(
    (value, i): EffectState => {
      const path = `effects[${i}]`,
        e = object(value, path, ["id", "key", "enabled", "parameters"]);
      const key = id(e.key, `${path}.key`);
      let parameters: ParameterMap;
      try {
        parameters = registry.validateEffect(key, e.parameters);
      } catch (error) {
        if (error instanceof ProjectValidationError)
          throw new ProjectValidationError(
            error.code,
            error.path.replace(/^effect(?=\.)/, path),
            error.message,
          );
        throw error;
      }
      return {
        id: id(e.id, `${path}.id`),
        key,
        enabled: boolean(e.enabled, `${path}.enabled`),
        parameters,
      };
    },
  );
  const masks = array(p.masks, "masks", 64).map((value, i): MaskV1 => {
    const path = `masks[${i}]`,
      m = object(value, path, [
        "id",
        "targetId",
        "assetId",
        "invert",
        "opacity",
      ]);
    return {
      id: id(m.id, `${path}.id`),
      targetId: id(m.targetId, `${path}.targetId`),
      assetId: id(m.assetId, `${path}.assetId`),
      invert: boolean(m.invert, `${path}.invert`),
      opacity: number(m.opacity, `${path}.opacity`, 0, 1),
    };
  });
  const text = array(p.text, "text", 128).map((value, i): TextOverlayV1 => {
    const path = `text[${i}]`,
      t = object(value, path, [
        "id",
        "text",
        "x",
        "y",
        "width",
        "fontFamily",
        "fontSize",
        "color",
        "align",
        "rotation",
      ]);
    const color = string(t.color, `${path}.color`);
    if (!/^#[\da-f]{6}([\da-f]{2})?$/i.test(color))
      invalid(`${path}.color`, "Expected #RRGGBB or #RRGGBBAA");
    return {
      id: id(t.id, `${path}.id`),
      text: string(t.text, `${path}.text`),
      x: number(t.x, `${path}.x`),
      y: number(t.y, `${path}.y`),
      width: number(t.width, `${path}.width`, Number.MIN_VALUE),
      fontFamily: string(t.fontFamily, `${path}.fontFamily`, 256, true),
      fontSize: number(t.fontSize, `${path}.fontSize`, Number.MIN_VALUE),
      color,
      align: choice(t.align, `${path}.align`, ["left", "center", "right"]),
      rotation: number(t.rotation, `${path}.rotation`),
    };
  });
  for (const [collection, name] of [
    [effects, "effects"],
    [masks, "masks"],
    [text, "text"],
  ] as const) {
    const seen = new Set<string>();
    collection.forEach((item, i) => {
      if (seen.has(item.id) || (name === "effects" && item.id === "style"))
        invalid(`${name}[${i}].id`, "Duplicate or reserved identity");
      seen.add(item.id);
    });
  }
  const effectIds = new Set(effects.map((effect) => effect.id));
  masks.forEach((mask, i) => {
    if (mask.targetId !== "style" && !effectIds.has(mask.targetId))
      invalid(`masks[${i}].targetId`, "Unresolved mask target");
  });
  const exp = object(p.export, "export", [
    "format",
    "scale",
    "fps",
    "durationUs",
    "quality",
    "audio",
  ]);
  return {
    version: 1,
    id: id(p.id, "id"),
    name: string(p.name, "name", 256, true),
    source: p.source === null ? null : source(p.source, "source"),
    crop: c,
    rotation: choice(p.rotation, "rotation", [0, 90, 180, 270]),
    style: { id: styleId, parameters },
    effects,
    masks,
    text,
    seed: number(p.seed, "seed", 0, 2 ** 32 - 1, true),
    timeUs: number(p.timeUs, "timeUs", 0, Number.MAX_SAFE_INTEGER, true),
    export: {
      format: choice(exp.format, "export.format", [
        "png",
        "jpeg",
        "gif",
        "webm",
        "mp4",
      ]),
      scale: choice(exp.scale, "export.scale", [1, 2, 3, 4]),
      fps: choice(exp.fps, "export.fps", [15, 20, 24, 30, 60]),
      durationUs: number(
        exp.durationUs,
        "export.durationUs",
        0,
        Number.MAX_SAFE_INTEGER,
        true,
      ),
      quality: number(exp.quality, "export.quality", 0, 1),
      audio: boolean(exp.audio, "export.audio"),
    },
  };
}
export function parseRenderProjectJson(
  json: string,
  registry: CatalogRegistry = initialCatalogRegistry,
): RenderProjectV1 {
  // Parse raw JSON only after the same pre-parse byte check. Feature checks run on decoded own data.
  return validateRenderProject(
    parseBoundedProjectJson(json, precheck),
    registry,
  );
}

export type ProjectReadiness =
  | { ready: true }
  | {
      ready: false;
      issues: {
        code: import("./project-errors").ProjectErrorCode;
        path: string;
        message: string;
      }[];
    };
export interface RenderResources {
  /** Descriptor for an already service-validated uploaded source. */
  source: SourceRef | null;
  maskAssets: ReadonlyMap<
    string,
    { width: number; height: number; alpha: Uint8Array }
  >;
  supportsBinding(binding: import("./catalog/types").RendererBinding): boolean;
}
/** Pure preflight only; codec checks, allocation, output parity and submission belong to the service. */
export function getProjectReadiness(
  project: RenderProjectV1,
  registry: CatalogRegistry,
  resources: RenderResources,
): ProjectReadiness {
  let validated: RenderProjectV1;
  try {
    validated = validateRenderProject(project, registry);
  } catch (error) {
    if (error instanceof ProjectValidationError)
      return {
        ready: false,
        issues: [
          { code: error.code, path: error.path, message: error.message },
        ],
      };
    throw error;
  }
  const issues: Extract<ProjectReadiness, { ready: false }>["issues"] = [];
  const issue = (
    code: import("./project-errors").ProjectErrorCode,
    path: string,
    message: string,
  ) => issues.push({ code, path, message });
  const expected = validated.source,
    actual = resources.source;
  if (!expected || !actual)
    issue("missing-source", "source", "A matching uploaded source is required");
  else if (
    expected.id !== actual.id ||
    expected.revision !== actual.revision ||
    expected.width !== actual.width ||
    expected.height !== actual.height
  )
    issue(
      "source-mismatch",
      "source",
      "Uploaded source identity/revision/geometry differs",
    );
  let maskBytes = 0;
  const charged = new Set<string>();
  validated.masks.forEach((mask, i) => {
    const asset = resources.maskAssets.get(mask.assetId),
      path = `masks[${i}].assetId`;
    if (
      !asset ||
      !Number.isSafeInteger(asset.width) ||
      !Number.isSafeInteger(asset.height) ||
      asset.width < 1 ||
      asset.height < 1 ||
      asset.width > MAX_SOURCE_DIMENSION ||
      asset.height > MAX_SOURCE_DIMENSION ||
      asset.width > DEFAULT_MEMORY_BUDGET_BYTES / asset.height ||
      !(asset.alpha instanceof Uint8Array) ||
      asset.alpha.length !== asset.width * asset.height ||
      asset.alpha.byteLength !== asset.width * asset.height
    ) {
      issue("missing-mask-asset", path, "Missing or invalid mask alpha plane");
      return;
    }
    if (!charged.has(mask.assetId)) {
      charged.add(mask.assetId);
      maskBytes += asset.alpha.byteLength;
      if (maskBytes > DEFAULT_MEMORY_BUDGET_BYTES)
        issue("not-ready", path, "Referenced mask assets exceed memory budget");
    }
  });
  const style = registry.getStyle(validated.style.id)!;
  if (!style.binding || resources.supportsBinding(style.binding) !== true)
    issue(
      "not-ready",
      "style.id",
      "Style renderer unavailable in this session",
    );
  validated.effects.forEach((effect, i) => {
    if (!effect.enabled) return;
    const schema = registry.getEffect(effect.key)!;
    if (!schema.binding || resources.supportsBinding(schema.binding) !== true)
      issue(
        "not-ready",
        `effects[${i}].key`,
        "Effect renderer unavailable in this session",
      );
  });
  return issues.length ? { ready: false, issues } : { ready: true };
}
