import { expect, it } from "vitest";
import {
  contextFromParameters,
  encodeStyleContext,
  validateStyleContext,
} from "./style-context";
it("omits defaults, captures changes and rejects malformed contexts", () => {
  expect(contextFromParameters({}, 0)).toBeUndefined();
  const c = contextFromParameters({ coverage: 0, bgMode: "none" }, 42)!;
  expect(encodeStyleContext(c).length).toBe(64);
  expect(c.seed).toBe(42);
  expect(() => validateStyleContext({ ...c, version: 2 })).toThrow();
  expect(() => validateStyleContext({ ...c, softness: 61 })).toThrow();
  expect(() => validateStyleContext({ ...c, unknown: 1 })).toThrow();
});
import { initialCatalogRegistry as registry } from "./catalog/initial-schemas";
it("migrates only complete historical parameter shapes and preserves canonical ramps", () => {
  const old = { fontSize: 11, charSet: "@. ", brightness: 0, contrast: 20 };
  expect(registry.validateStyle("characters", old)).toEqual({
    ...old,
    bgMode: "blur",
    bgBlur: 8,
    bgOpacity: 100,
    coverage: 100,
    blend: "source-over",
    invert: false,
    charOpacity: 100,
    randomChars: false,
  });
  const { fontSize, ...missing } = old;
  void fontSize;
  expect(() => registry.validateStyle("characters", missing)).toThrow();
  expect(() =>
    registry.validateStyle("characters", { ...old, unknown: 0 }),
  ).toThrow();
  expect(() =>
    registry.validateStyle("characters", { ...old, bgOpacity: null }),
  ).toThrow();
  expect(
    contextFromParameters(registry.validateStyle("characters", old), 0, true),
  ).toBeUndefined();
});
it("rejects accessors without invoking them and detaches validated values", async () => {
  const { STYLE_CONTEXT_DEFAULTS: d } = await import("./style-context");
  const c = { ...d };
  let calls = 0;
  Object.defineProperty(c, "opacity", {
    get() {
      calls++;
      return 100;
    },
    enumerable: true,
  });
  expect(() => validateStyleContext(c)).toThrow();
  expect(calls).toBe(0);
  for (const bad of [null, Infinity, NaN, "100"])
    expect(() => validateStyleContext({ ...d, opacity: bad })).toThrow();
  const input = { ...d },
    result = validateStyleContext(input);
  input.coverage = 0;
  expect(result.coverage).toBe(100);
});
it("rejects partial additive parameter shapes rather than silently defaulting them", () => {
  expect(() =>
    registry.validateStyle("characters", {
      fontSize: 11,
      charSet: "@. ",
      brightness: 0,
      contrast: 20,
      bgMode: "none",
    }),
  ).toThrow();
});
