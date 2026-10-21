import type { ParameterValue } from "./project";
import { ProjectValidationError } from "./project-errors";

const MAX_BYTES = 1_048_576;
const encoder = new TextEncoder();
const poison = new Set(["__proto__", "prototype", "constructor"]);
function fail(path: string, message: string): never {
  throw new ProjectValidationError("invalid-project", path, message);
}

/** Canonical JSON UTF-8 budgets cover syntax and values across the detached snapshot. */
export function sanitizeProjectJson(value: unknown): ParameterValue {
  let nodes = 0,
    bytes = 0;
  const ancestors = new WeakSet<object>();
  function charge(text: string, path: string) {
    bytes += encoder.encode(text).byteLength;
    if (bytes > MAX_BYTES) fail(path, "JSON UTF-8 content budget exceeded");
  }
  function copy(input: unknown, path: string, depth: number): ParameterValue {
    if (++nodes > 32_768 || depth > 16)
      fail(path, "JSON node/depth budget exceeded");
    if (input === null || typeof input === "boolean") {
      charge(input === null ? "null" : String(input), path);
      return input;
    }
    if (typeof input === "number") {
      if (!Number.isFinite(input)) fail(path, "Expected finite JSON number");
      charge(String(input), path);
      return input;
    }
    if (typeof input === "string") {
      if (input.length > 65_536) fail(path, "JSON string too long");
      // Stringification is safe only after primitive type/length validation.
      charge(JSON.stringify(input), path);
      return input;
    }
    if (typeof input !== "object") fail(path, "Expected JSON data");
    const array = Array.isArray(input);
    const proto = Object.getPrototypeOf(input);
    if (
      array
        ? proto !== Array.prototype
        : proto !== Object.prototype && proto !== null
    )
      fail(path, "Expected plain JSON object/array");
    if (ancestors.has(input)) fail(path, "Cyclic JSON data");
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(descriptors);
    for (const key of keys) {
      if (typeof key !== "string") fail(path, "Symbol keys are unsupported");
      const fieldPath = path ? `${path}.${key}` : key;
      if (poison.has(key) || key.length > 128)
        fail(fieldPath, "Invalid dictionary key");
      const descriptor = descriptors[key];
      if (
        !("value" in descriptor) ||
        (!descriptor.enumerable && !(array && key === "length"))
      )
        fail(fieldPath, "Expected enumerable own data property");
    }
    const length = array ? (descriptors.length.value as number) : keys.length;
    if (length > 1024) fail(path, "JSON member budget exceeded");
    if (
      array &&
      (keys.length !== length + 1 ||
        keys.some(
          (key) =>
            key !== "length" &&
            (typeof key !== "string" ||
              !/^(0|[1-9]\d*)$/.test(key) ||
              Number(key) >= length),
        ))
    )
      fail(path, "Sparse or extended array");
    charge((array ? "[]" : "{}") + ",".repeat(Math.max(0, length - 1)), path);
    ancestors.add(input);
    try {
      if (array) {
        const result: ParameterValue[] = [];
        for (let i = 0; i < length; i++)
          result.push(
            copy(descriptors[String(i)].value, `${path}[${i}]`, depth + 1),
          );
        return result;
      }
      const result: Record<string, ParameterValue> = {};
      for (const key of keys as string[]) {
        const fieldPath = path ? `${path}.${key}` : key;
        charge(JSON.stringify(key) + ":", fieldPath);
        Object.defineProperty(result, key, {
          value: copy(descriptors[key].value, fieldPath, depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return result;
    } finally {
      ancestors.delete(input);
    }
  }
  return copy(value, "", 0);
}

export function parseBoundedProjectJson(
  text: string,
  preSanitize?: (value: unknown) => void,
): unknown {
  if (
    typeof text !== "string" ||
    text.length > MAX_BYTES ||
    encoder.encode(text).byteLength > MAX_BYTES
  )
    fail("", "JSON input exceeds UTF-8 byte budget");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail("", "Malformed JSON");
  }
  preSanitize?.(value);
  return sanitizeProjectJson(value);
}
