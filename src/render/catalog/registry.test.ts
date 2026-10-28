import { describe, expect, it } from "vitest";
import { createCatalogRegistry } from "./registry";
import type { StyleSchema, ParameterRule } from "./types";

const unit: ParameterRule = { kind: "number", min: 0, max: 1 };
function schema(): StyleSchema {
  return {
    evidence: "independent-contract",
    defaultsVersion: 1,
    binding: null,
    rules: {
      amount: unit,
      enabled: { kind: "boolean" },
      ramp: { kind: "text", minLength: 0, maxLength: 512 },
      point: { kind: "object", fields: { x: unit, y: unit } },
      palette: {
        kind: "array",
        item: { kind: "color" },
        minItems: 1,
        maxItems: 8,
      },
      curve: {
        kind: "array",
        item: { kind: "object", fields: { x: unit, y: unit } },
        minItems: 2,
        maxItems: 32,
      },
      choice: { kind: "select", values: ["a", "b"] },
      nil: { kind: "null" },
    },
    descriptor: {
      id: "test",
      mode: "test",
      name: "Test",
      category: "Test",
      tags: [],
      ready: false,
      output: "rgba",
      dispatchId: 0,
      parameters: [
        {
          key: "amount",
          label: "Amount",
          type: "number",
          default: 0,
          min: 0,
          max: 1,
          step: 0.1,
        },
        { key: "enabled", label: "Enabled", type: "boolean", default: false },
        { key: "ramp", label: "Ramp", type: "text", default: "" },
        {
          key: "point",
          label: "Point",
          type: "point",
          default: { x: 0, y: 1 },
        },
        {
          key: "palette",
          label: "Palette",
          type: "palette",
          default: ["#123456"],
        },
        {
          key: "curve",
          label: "Curve",
          type: "curve",
          default: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
        {
          key: "choice",
          label: "Choice",
          type: "select",
          default: "a",
          options: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        },
        { key: "nil", label: "Nil", type: "null", default: null },
      ],
    },
  };
}
function registry() {
  return createCatalogRegistry([schema()], []);
}

describe("checked exact registry", () => {
  it("accepts detached complete defaults, falsy values and continuous nonstep values", () => {
    const r = registry();
    const defaults = r.styleDefaults("test");
    expect(r.validateStyle("test", defaults)).toEqual(defaults);
    expect(
      r.validateStyle("test", { ...defaults, amount: 0.123 }),
    ).toMatchObject({ amount: 0.123, enabled: false, ramp: "", nil: null });
    (defaults.point as { x: number }).x = 0.5;
    expect(r.styleDefaults("test").point).toEqual({ x: 0, y: 1 });
  });
  it("rejects unknown schemas and full paths for unknown/missing/nested parameters", () => {
    const r = registry();
    const d = r.styleDefaults("test");
    expect(() => r.styleDefaults("missing")).toThrowError(
      expect.objectContaining({ code: "unsupported-schema" }),
    );
    expect(() => r.validateEffect("missing", {})).toThrowError(
      expect.objectContaining({ code: "unsupported-schema" }),
    );
    for (const parameters of [
      { ...d, extra: 0 },
      { ...d, point: { x: 0, y: 0, z: 0 } },
    ])
      expect(() => r.validateStyle("test", parameters)).toThrowError(
        expect.objectContaining({ code: "unknown-parameter" }),
      );
    const missing = { ...d };
    delete missing.amount;
    expect(() => r.validateStyle("test", missing)).toThrow();
    expect(() =>
      r.validateStyle("test", { ...d, point: { x: 2, y: 0 } }),
    ).toThrowError(
      expect.objectContaining({ path: "style.parameters.point.x" }),
    );
  });
  it("rejects wrong types, bounds, enums and malformed composite members", () => {
    const r = registry(),
      d = r.styleDefaults("test");
    for (const [key, value] of [
      ["amount", NaN],
      ["amount", -1],
      ["amount", true],
      ["enabled", 0],
      ["choice", "c"],
      ["nil", false],
      ["ramp", null],
      ["point", null],
      ["palette", []],
      ["palette", ["red"]],
      ["curve", [{ x: 0, y: 0 }]],
      [
        "curve",
        [
          { x: 0, y: 0 },
          { x: 1, y: 1, z: 0 },
        ],
      ],
    ])
      expect(() =>
        r.validateStyle("test", { ...d, [key as string]: value }),
      ).toThrow();
  });
  it("checks duplicate identities, bindings, projection rules and defaults at registration", () => {
    expect(() => createCatalogRegistry([schema(), schema()], [])).toThrow();
    const effect = { key: "fx", phase: 1, order: 0, parameters: [] };
    const fx = {
      descriptor: effect,
      rules: {},
      evidence: "independent-contract" as const,
      defaultsVersion: 1 as const,
      binding: null,
    };
    expect(() => createCatalogRegistry([], [fx, fx])).toThrow();
    const ready = (id: string): StyleSchema => {
      const s = schema();
      s.descriptor.id = id;
      s.descriptor.mode = id;
      s.descriptor.ready = true;
      s.descriptor.dispatchId = 1;
      s.binding = { dispatchId: 1, backend: "rust-cpu" };
      return s;
    };
    expect(() => createCatalogRegistry([ready("a"), ready("b")], [])).toThrow();
    const mutations: ((s: StyleSchema) => void)[] = [
      (s) => {
        s.descriptor.ready = true;
      },
      (s) => {
        s.descriptor.dispatchId = 5;
      },
      (s) => {
        s.descriptor.mode = "alias";
      },
      (s) => {
        s.descriptor.parameters[0].default = 2;
      },
      (s) => {
        s.descriptor.parameters[0].step = 0;
      },
      (s) => {
        s.descriptor.parameters[0].min = -1;
      },
      (s) => {
        s.descriptor.parameters[0].type = "boolean";
      },
      (s) => {
        s.descriptor.parameters[6].options = [{ value: "c", label: "C" }];
      },
      (s) => {
        s.descriptor.parameters.push({ ...s.descriptor.parameters[0] });
      },
      (s) => {
        s.rules = { ...s.rules, amount: { kind: "number", min: 1, max: 0 } };
      },
    ];
    for (const mutate of mutations) {
      const s = schema();
      mutate(s);
      expect(() => createCatalogRegistry([s], [])).toThrow();
    }
  });
  it("stores immutable snapshots and requires all keys even for disabled effects", () => {
    const s = schema();
    const r = createCatalogRegistry([s], []);
    s.descriptor.parameters[0].default = 0.5;
    expect(r.styleDefaults("test").amount).toBe(0);
    expect(Object.isFrozen(r.getStyle("test")?.descriptor.parameters)).toBe(
      true,
    );
    expect(r.getStyle("test")?.descriptor.ready).toBe(false);
  });
});

// Initial data acceptance is deliberately independent of renderer availability.
describe("initial shader schemas", () => {
  it("registers exactly five static declarations, 38 controls and no renderers", async () => {
    const { initialShaderSchemas, initialCatalogRegistry: r } = await import(
      "./initial-schemas"
    );
    expect(initialShaderSchemas.map((s) => s.descriptor.id).sort()).toEqual([
      "anodized",
      "cyanotype",
      "hexhalftone",
      "oilpool",
      "paperstock",
    ]);
    const counts: Record<string, number> = {
      anodized: 5,
      cyanotype: 9,
      hexhalftone: 6,
      oilpool: 6,
      paperstock: 12,
    };
    for (const s of initialShaderSchemas) {
      expect(s.descriptor.parameters).toHaveLength(counts[s.descriptor.id]);
      expect(s).toMatchObject({
        binding: null,
        evidence: "static-declaration",
        descriptor: { ready: false, dispatchId: 0, output: "rgba" },
      });
      expect(
        r.validateStyle(s.descriptor.id, r.styleDefaults(s.descriptor.id)),
      ).toEqual(r.styleDefaults(s.descriptor.id));
    }
    expect(() => r.validateStyle("liquidglass", {})).toThrowError(
      expect.objectContaining({ code: "unsupported-schema" }),
    );
  });
  it("validates exact shader numeric domains without coercion or omission", async () => {
    const { initialCatalogRegistry: r } = await import("./initial-schemas");
    const d = r.styleDefaults("cyanotype");
    for (const value of [0.2, 2])
      expect(() =>
        r.validateStyle("cyanotype", { ...d, sfx_cyanotype_exposure: value }),
      ).not.toThrow();
    for (const value of [0.199, 2.001, "1", true])
      expect(() =>
        r.validateStyle("cyanotype", { ...d, sfx_cyanotype_exposure: value }),
      ).toThrow();
    expect(() =>
      r.validateStyle("cyanotype", { ...d, sfx_cyanotype_seed: 999 }),
    ).not.toThrow();
    for (const value of [1000, 0.5])
      expect(() =>
        r.validateStyle("cyanotype", { ...d, sfx_cyanotype_seed: value }),
      ).toThrow();
    expect(() =>
      r.validateStyle("cyanotype", { ...d, sfx_cyanotype_blendmode: 1.5 }),
    ).toThrow();
    const missing = { ...d };
    delete missing.sfx_cyanotype_seed;
    expect(() => r.validateStyle("cyanotype", missing)).toThrow();
    expect(() => r.validateStyle("cyanotype", { ...d, unknown: 1 })).toThrow();
  });
});

describe("independent four-control character subset", () => {
  it("binds only canonical Characters to complete RGBA dispatch 1", async () => {
    const { initialCharacterSchema: s } = await import("./character-schema");
    const { initialCatalogRegistry: r, initialShaderSchemas } = await import(
      "./initial-schemas"
    );
    expect(s).toMatchObject({
      evidence: "independent-contract",
      binding: { dispatchId: 1, backend: "rust-cpu" },
      descriptor: {
        id: "characters",
        output: "rgba",
        ready: true,
        dispatchId: 1,
      },
    });
    expect(r.styleDefaults("characters")).toMatchObject({
      fontSize: 11,
      charSet: "@#S08Xx+=-;:. ",
      brightness: 0,
      contrast: 20,
    });
    expect(
      ["characters", ...initialShaderSchemas.map((s) => s.descriptor.id)].every(
        (id) => r.getStyle(id),
      ),
    ).toBe(true);
    expect(s.descriptor.parameters).toHaveLength(12);
    expect(
      s.descriptor.parameters.find((p) => p.key === "brightness")?.step,
    ).toBeUndefined();
    expect(
      s.descriptor.parameters.find((p) => p.key === "contrast")?.step,
    ).toBeUndefined();
    const defaults = r.styleDefaults("characters");
    for (const [key, value] of [
      ["fontSize", 3],
      ["fontSize", 80],
      ["fontSize", 3.5],
      ["brightness", -100],
      ["brightness", 100],
      ["contrast", -100],
      ["contrast", 100],
      ["charSet", "e\u0301🦋"],
    ])
      expect(() =>
        r.validateStyle("characters", { ...defaults, [key as string]: value }),
      ).not.toThrow();
    expect(
      r.validateStyle("characters", { ...defaults, charSet: "e\u0301🦋" })
        .charSet,
    ).toBe("e\u0301🦋");
    for (const [key, value] of [
      ["fontSize", 2.99],
      ["fontSize", 80.01],
      ["brightness", -101],
      ["contrast", 101],
      ["charSet", ""],
      ["charSet", "x"],
      ["charSet", "xx"],
      ["charSet", "a\nb"],
      ["charSet", "\u0301ab"],
      ["charSet", "\u200b\u200c"],
      ["charSet", "a\u007fb"],
      ["charSet", "a" + "\u0301".repeat(64) + "b"],
      [
        "charSet",
        Array.from({ length: 257 }, (_, i) =>
          String.fromCodePoint(0x4e00 + i),
        ).join(""),
      ],
    ])
      expect(() =>
        r.validateStyle("characters", { ...defaults, [key as string]: value }),
      ).toThrow();
    expect(() =>
      r.validateStyle("characters", { ...defaults, gamma: 1 }),
    ).toThrow();
  });
});

it("rejects misleading composite descriptor projections and invalid enum defaults", () => {
  for (const mutate of [
    (s: StyleSchema) => {
      s.descriptor.parameters[4].type = "curve";
    },
    (s: StyleSchema) => {
      s.descriptor.parameters[5].type = "palette";
    },
    (s: StyleSchema) => {
      s.descriptor.parameters[7].type = "text";
    },
    (s: StyleSchema) => {
      s.descriptor.parameters[6].default = "invalid";
    },
  ]) {
    const s = schema();
    mutate(s);
    expect(() => createCatalogRegistry([s], [])).toThrow();
  }
});

it("preserves the exact declared Torn Edge label and numeric blend display names", async () => {
  const { initialCatalogRegistry: r, shaderBlendLabels } = await import(
    "./initial-schemas"
  );
  expect(
    r
      .getStyle("paperstock")
      ?.descriptor.parameters.find((p) => p.key === "sfx_paperstock_tear")
      ?.label,
  ).toBe("Torn Edge");
  expect(shaderBlendLabels).toEqual([
    "Normal",
    "Multiply",
    "Screen",
    "Overlay",
    "Soft Light",
    "Hard Light",
    "Color Dodge",
    "Color Burn",
    "Darken",
    "Lighten",
    "Difference",
    "Exclusion",
    "Luminosity",
    "Color",
  ]);
});
