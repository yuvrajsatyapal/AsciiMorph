import { describe, expect, it, vi } from "vitest";
import { parseBoundedProjectJson, sanitizeProjectJson } from "./project-json";

describe("bounded detached JSON", () => {
  it("rejects malformed JSON and bounds raw UTF-8 before parsing", () => {
    expect(() => parseBoundedProjectJson("{")).toThrow();
    const max = '"' + "x".repeat(65536) + '"';
    expect(
      parseBoundedProjectJson(max + " ".repeat(1048576 - max.length)),
    ).toHaveLength(65536);
    expect(() =>
      parseBoundedProjectJson(max + " ".repeat(1048577 - max.length)),
    ).toThrow();
    expect(() =>
      parseBoundedProjectJson('"' + "🦋".repeat(262144) + '"'),
    ).toThrow();
  });
  it("bounds depth, members, keys and strings inclusively", () => {
    function deep(n: number): unknown {
      let v: unknown = 0;
      for (let i = 0; i < n; i++) v = [v];
      return v;
    }
    expect(() => sanitizeProjectJson(deep(16))).not.toThrow();
    expect(() => sanitizeProjectJson(deep(17))).toThrow();
    expect(sanitizeProjectJson(Array(1024).fill(0))).toHaveLength(1024);
    expect(() => sanitizeProjectJson(Array(1025).fill(0))).toThrow();
    expect(() =>
      sanitizeProjectJson(
        Object.fromEntries(
          Array.from({ length: 1024 }, (_, i) => [String(i), 0]),
        ),
      ),
    ).not.toThrow();
    expect(() =>
      sanitizeProjectJson(
        Object.fromEntries(
          Array.from({ length: 1025 }, (_, i) => [String(i), 0]),
        ),
      ),
    ).toThrow();
    expect(() => sanitizeProjectJson({ ["k".repeat(128)]: 0 })).not.toThrow();
    expect(() => sanitizeProjectJson({ ["k".repeat(129)]: 0 })).toThrow();
    expect(sanitizeProjectJson("x".repeat(65536))).toHaveLength(65536);
    expect(() => sanitizeProjectJson("x".repeat(65537))).toThrow();
  });
  it("counts aggregate nodes and UTF-8 content per occurrence", () => {
    const boundary = Array.from({ length: 32 }, (_, i) =>
      Array(i === 31 ? 1022 : 1023).fill(0),
    );
    expect(() => sanitizeProjectJson(boundary)).not.toThrow();
    boundary[31].push(0);
    expect(() => sanitizeProjectJson(boundary)).toThrow();
    const strings = Array(16).fill("x".repeat(65536));
    strings[15] = "x".repeat(65536 - 49);
    expect(() => sanitizeProjectJson(strings)).not.toThrow();
    strings[15] += "x";
    expect(() => sanitizeProjectJson(strings)).toThrow();
    expect(() =>
      sanitizeProjectJson(Array(9).fill("é".repeat(65536))),
    ).toThrow();
    const keyBytes = Object.fromEntries(
      Array.from({ length: 16 }, (_, i) => [String(i), "x".repeat(65536)]),
    );
    expect(() => sanitizeProjectJson(keyBytes)).toThrow();
  });
  it("detaches repeated acyclic objects but rejects cycles", () => {
    const shared = { nested: [1] };
    const result = sanitizeProjectJson([shared, shared]) as {
      nested: number[];
    }[];
    expect(result[0]).toEqual(shared);
    expect(result[0]).not.toBe(result[1]);
    shared.nested[0] = 2;
    expect(result[0].nested).toEqual([1]);
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => sanitizeProjectJson(cyclic)).toThrow();
    expect(
      sanitizeProjectJson(Object.assign(Object.create(null), { safe: false })),
    ).toEqual({ safe: false });
  });
  it("rejects prototype keys and never invokes accessors or toJSON", () => {
    const getter = vi.fn(() => 1);
    for (const input of [
      Object.defineProperty({}, "value", { enumerable: true, get: getter }),
      Object.defineProperty([1], "0", { get: getter }),
    ])
      expect(() => sanitizeProjectJson(input)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    for (const key of ["__proto__", "constructor", "prototype"])
      expect(() =>
        sanitizeProjectJson(JSON.parse(`{"nested":{"${key}":1}}`)),
      ).toThrow();
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
    const toJSON = vi.fn();
    expect(() => sanitizeProjectJson({ toJSON })).toThrow();
    expect(toJSON).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    () => 0,
    1n,
    NaN,
    Infinity,
    new Date(),
    new Uint8Array(1),
    Object.create({ inherited: true }),
  ])("rejects non-JSON nested values %s", (value) =>
    expect(() => sanitizeProjectJson({ nested: value })).toThrow(),
  );
  it("rejects sparse, extra, symbolic and hidden properties", () => {
    for (const value of [
      Array(2),
      Object.assign([1], { extra: 2 }),
      { [Symbol()]: 1 },
      Object.defineProperty({}, "hidden", { value: 1 }),
      Object.defineProperty([1], "0", { enumerable: false }),
    ])
      expect(() => sanitizeProjectJson(value)).toThrow();
  });
});

it("charges full serialized bytes including numeric syntax and escaped strings", () => {
  const strings = Array(16).fill("x".repeat(65536));
  strings[15] = "x".repeat(65536 - 49);
  const accepted = sanitizeProjectJson(strings);
  const json = JSON.stringify(accepted);
  expect(new TextEncoder().encode(json)).toHaveLength(1048576);
  expect(parseBoundedProjectJson(json)).toEqual(accepted);
  strings[15] += "x";
  expect(() => sanitizeProjectJson(strings)).toThrow();
  const escaped = Array(32).fill("\n".repeat(16384));
  expect(() => sanitizeProjectJson(escaped)).toThrow();
  const mixed = [
    ...Array(15).fill("x".repeat(65536)),
    ...Array.from({ length: 4 }, () => Array(1000).fill(Number.MAX_VALUE)),
  ];
  expect(() => sanitizeProjectJson(mixed)).toThrow();
});
