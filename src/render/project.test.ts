import { describe, expect, it, vi } from "vitest";
import {
  validateRenderProject,
  parseRenderProjectJson,
  ProjectValidationError,
} from "./project";

function draft() {
  return {
    version: 1,
    id: "project 🦋",
    name: "Draft",
    source: null,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    rotation: 0,
    style: {
      id: "cyanotype",
      parameters: {
        sfx_cyanotype_exposure: 1,
        sfx_cyanotype_blue: 0.65,
        sfx_cyanotype_age: 0.5,
        sfx_cyanotype_paper: 0.3,
        sfx_cyanotype_bleed: 0.25,
        sfx_cyanotype_brush: 0,
        sfx_cyanotype_rinse: 0,
        sfx_cyanotype_blendmode: 0,
        sfx_cyanotype_seed: 0,
      },
    },
    effects: [],
    masks: [],
    text: [],
    seed: 0,
    timeUs: 0,
    export: {
      format: "png",
      scale: 1,
      fps: 30,
      durationUs: 0,
      quality: 1,
      audio: false,
    },
  };
}
function failure(value: unknown, path: string, code = "invalid-project") {
  expect(() => validateRenderProject(value)).toThrowError(
    expect.objectContaining({ code, path }),
  );
}

describe("strict project shell", () => {
  it("accepts detached source-null drafts and JSON without defaults", () => {
    const input = draft();
    const accepted = validateRenderProject(input);
    expect(accepted).toEqual(input);
    expect(accepted).not.toBe(input);
    input.style.parameters.sfx_cyanotype_age = 0.9;
    expect(accepted.style.parameters.sfx_cyanotype_age).toBe(0.5);
    expect(parseRenderProjectJson(JSON.stringify(accepted))).toEqual(accepted);
  });
  it("reports version and graph before descending without invoking getters", () => {
    failure({ version: 2 }, "version", "unsupported-version");
    for (const graph of [undefined, null, {}])
      failure({ ...draft(), graph }, "graph", "unsupported-version-feature");
    const getter = vi.fn(() => 1);
    failure(
      Object.defineProperty(draft(), "graph", { get: getter }),
      "graph",
      "unsupported-version-feature",
    );
    failure(
      Object.defineProperty(draft(), "version", {
        enumerable: true,
        get: getter,
      }),
      "version",
    );
    expect(getter).not.toHaveBeenCalled();
    expect(ProjectValidationError.prototype).toBeInstanceOf(Error);
  });
  it("requires every shell field and rejects extra fields", () => {
    for (const key of Object.keys(draft())) {
      const value: Record<string, unknown> = draft();
      delete value[key];
      failure(value, key);
    }
    for (const key of [
      "zoom",
      "previewWidth",
      "exportWidth",
      "rgba",
      "conversion",
    ])
      failure({ ...draft(), [key]: 1 }, key);
    failure({ ...draft(), crop: { ...draft().crop, zoom: 2 } }, "crop.zoom");
    failure(
      { ...draft(), style: { ...draft().style, extra: true } },
      "style.extra",
    );
    failure(
      { ...draft(), export: { ...draft().export, extra: true } },
      "export.extra",
    );
  });
  it.each([
    ["rotation", 45],
    ["seed", -1],
    ["seed", 2 ** 32],
    ["timeUs", -1],
    ["timeUs", 0.5],
    ["timeUs", Number.MAX_SAFE_INTEGER + 1],
    ["id", " "],
    ["id", "x".repeat(129)],
    ["name", " "],
    ["name", "x".repeat(257)],
  ])("rejects invalid %s=%s", (key, value) =>
    failure({ ...draft(), [key]: value }, key),
  );
  it.each([
    ["revision", -1],
    ["revision", 0.5],
    ["revision", Number.MAX_SAFE_INTEGER + 1],
    ["width", 0],
    ["width", 16385],
    ["height", 16385],
    ["rgba", []],
  ])("rejects invalid source %s", (key, value) =>
    failure(
      {
        ...draft(),
        source: { id: "s", revision: 0, width: 100, height: 100, [key]: value },
      },
      `source.${key}`,
    ),
  );
  it("rejects source allocation over budget and crop overflow", () => {
    failure(
      {
        ...draft(),
        source: { id: "s", revision: 0, width: 16384, height: 16384 },
      },
      "source",
    );
    for (const crop of [
      { x: 0.5, y: 0, width: 0.6, height: 1 },
      { x: 0, y: 0, width: 0, height: 1 },
    ])
      failure({ ...draft(), crop }, crop.width === 0 ? "crop.width" : "crop");
  });
  it.each([
    ["format", "webp"],
    ["scale", 5],
    ["fps", 25],
    ["durationUs", -0.1],
    ["quality", 1.1],
    ["audio", 1],
  ])("rejects export %s", (key, value) =>
    failure(
      { ...draft(), export: { ...draft().export, [key]: value } },
      `export.${key}`,
    ),
  );
});

import { createCatalogRegistry } from "./catalog/registry";
import {
  initialShaderSchemas,
  initialCatalogRegistry,
} from "./catalog/initial-schemas";
import type { EffectSchema, StyleSchema } from "./catalog/types";
function effectSchema(
  key: string,
  binding: EffectSchema["binding"] = null,
): EffectSchema {
  return {
    descriptor: {
      key,
      phase: 1,
      order: 1,
      parameters: [
        {
          key: "amount",
          label: "Amount",
          type: "number",
          default: 0,
          min: 0,
          max: 1,
        },
      ],
    },
    rules: { amount: { kind: "number", min: 0, max: 1 } },
    evidence: "independent-contract",
    defaultsVersion: 1,
    binding,
  };
}
function effectDraft() {
  return {
    ...draft(),
    effects: [
      { id: "second", key: "b", enabled: false, parameters: { amount: 0.2 } },
      { id: "first", key: "a", enabled: true, parameters: { amount: 0.7 } },
    ],
    masks: [
      {
        id: "paint",
        targetId: "style",
        assetId: "asset 🦋",
        invert: false,
        opacity: 0.5,
      },
    ],
  };
}
function effectRegistry() {
  return createCatalogRegistry(initialShaderSchemas, [
    effectSchema("a"),
    effectSchema("b"),
  ]);
}
function overlay() {
  return {
    id: "t",
    text: "e\u0301 🦋\n漢字",
    x: 0.25,
    y: 0.5,
    width: 0.4,
    fontFamily: "Local Mono",
    fontSize: 0.05,
    color: "#AABBCC80",
    align: "center",
    rotation: 15,
  };
}

describe("project reference integrity and persistence", () => {
  it("retains effect order, disabled values, stable style targets and exact opaque effect IDs", () => {
    const input = effectDraft(),
      r = effectRegistry();
    expect(validateRenderProject(input, r)).toEqual(input);
    const alternate = {
      ...input,
      style: { id: "anodized", parameters: r.styleDefaults("anodized") },
    };
    expect(validateRenderProject(alternate, r).masks).toEqual(input.masks);
    input.effects[0].id = "cyanotype";
    input.masks[0].targetId = "cyanotype";
    expect(() => validateRenderProject(input, r)).not.toThrow();
    input.masks[0].targetId = "first";
    expect(() => validateRenderProject(input, r)).not.toThrow();
  });
  it("rejects duplicate/reserved identities, missing targets, unsupported effects and malformed members", () => {
    const r = effectRegistry();
    const bad = [
      {
        ...effectDraft(),
        effects: [{ ...effectDraft().effects[0], id: "style" }],
      },
      {
        ...effectDraft(),
        effects: [effectDraft().effects[0], effectDraft().effects[0]],
      },
      {
        ...effectDraft(),
        masks: [{ ...effectDraft().masks[0], targetId: "cyanotype" }],
      },
      {
        ...effectDraft(),
        masks: [effectDraft().masks[0], effectDraft().masks[0]],
      },
      {
        ...effectDraft(),
        masks: [{ ...effectDraft().masks[0], opacity: 1.1 }],
      },
      { ...effectDraft(), masks: [{ ...effectDraft().masks[0], invert: 0 }] },
      {
        ...effectDraft(),
        masks: [{ ...effectDraft().masks[0], assetId: " " }],
      },
      {
        ...effectDraft(),
        effects: [{ ...effectDraft().effects[0], parameters: { amount: 2 } }],
      },
      {
        ...effectDraft(),
        effects: [{ ...effectDraft().effects[0], key: "unknown" }],
      },
      { ...draft(), effects: [null] },
      { ...draft(), masks: [null] },
      { ...draft(), text: [null] },
    ];
    for (const value of bad)
      expect(() => validateRenderProject(value, r)).toThrow();
  });
  it("keeps normalized Unicode/offcanvas text independent of source dimensions", () => {
    const input = { ...draft(), text: [overlay()] };
    expect(validateRenderProject(input).text).toEqual(input.text);
    const sourced = {
      ...input,
      source: { id: "s", revision: 8, width: 1920, height: 1080 },
    };
    expect(validateRenderProject(sourced).text).toEqual(input.text);
    expect(
      validateRenderProject({
        ...input,
        text: [{ ...overlay(), text: "", x: -2 }],
      }).text[0].x,
    ).toBe(-2);
    for (const [key, value] of [
      ["width", 0],
      ["fontSize", 0],
      ["color", "red"],
      ["align", "justify"],
      ["x", Infinity],
      ["extra", 0],
    ])
      expect(() =>
        validateRenderProject({
          ...input,
          text: [{ ...overlay(), [key as string]: value }],
        }),
      ).toThrow();
    expect(() =>
      validateRenderProject({ ...input, text: [overlay(), overlay()] }),
    ).toThrow();
  });
  it("bounds collection counts and rejects nested extras", () => {
    for (const [key, count] of [
      ["effects", 65],
      ["masks", 65],
      ["text", 129],
    ] as const)
      expect(() =>
        validateRenderProject({ ...draft(), [key]: Array(count).fill(null) }),
      ).toThrowError(expect.objectContaining({ path: key }));
    const r = effectRegistry();
    for (const key of ["effects", "masks"] as const) {
      const input = effectDraft();
      (input[key][0] as unknown as Record<string, unknown>).extra = 0;
      expect(() => validateRenderProject(input, r)).toThrow();
    }
  });
  it("stores all export choices, quarter turns and exact safe bounds without capability claims", () => {
    for (const format of ["png", "jpeg", "gif", "webm", "mp4"])
      for (const scale of [1, 2, 3, 4])
        for (const fps of [15, 20, 24, 30, 60])
          expect(
            validateRenderProject({
              ...draft(),
              export: { ...draft().export, format, scale, fps, audio: true },
            }).export,
          ).toMatchObject({ format, scale, fps, audio: true });
    for (const rotation of [0, 90, 180, 270])
      expect(
        validateRenderProject({
          ...draft(),
          rotation,
          seed: 2 ** 32 - 1,
          timeUs: Number.MAX_SAFE_INTEGER,
          source: {
            id: "s",
            revision: Number.MAX_SAFE_INTEGER,
            width: 1,
            height: 16384,
          },
          crop: { x: 0.5, y: 0.5, width: 0.5000005, height: 0.5000005 },
        }).rotation,
      ).toBe(rotation);
  });
});

import { getProjectReadiness } from "./project";
import type { RenderProjectV1, RenderResources } from "./project";
const sourceRef = { id: "source", revision: 2, width: 10, height: 10 };
function renderRegistry() {
  const s: StyleSchema = {
    descriptor: {
      id: "render",
      mode: "render",
      name: "Test renderer",
      category: "Test",
      tags: [],
      parameters: [],
      ready: true,
      output: "rgba",
      dispatchId: 101,
    },
    rules: {},
    evidence: "independent-contract",
    defaultsVersion: 1,
    binding: { dispatchId: 101, backend: "rust-cpu" },
  };
  return createCatalogRegistry(
    [s],
    [
      effectSchema("available", { dispatchId: 102, backend: "rust-cpu" }),
      effectSchema("unavailable"),
    ],
  );
}
function renderProject(): RenderProjectV1 {
  return validateRenderProject(
    { ...draft(), source: sourceRef, style: { id: "render", parameters: {} } },
    renderRegistry(),
  );
}
function resources(): RenderResources {
  return {
    source: { ...sourceRef },
    maskAssets: new Map(),
    supportsBinding: () => true,
  };
}
function issueCodes(
  project: RenderProjectV1,
  r = renderRegistry(),
  res = resources(),
) {
  const result = getProjectReadiness(project, r, res);
  return result.ready ? [] : result.issues.map((i) => i.code);
}

describe("resource and renderer readiness", () => {
  it("requires a matching nonnull source and reports independent renderer failures", () => {
    expect(
      getProjectReadiness(renderProject(), renderRegistry(), resources()),
    ).toEqual({ ready: true });
    expect(issueCodes({ ...renderProject(), source: null })).toContain(
      "missing-source",
    );
    expect(
      issueCodes(renderProject(), renderRegistry(), {
        ...resources(),
        source: null,
      }),
    ).toContain("missing-source");
    for (const patch of [
      { revision: 3 },
      { width: 11 },
      { height: 11 },
      { id: "other" },
    ])
      expect(
        issueCodes(renderProject(), renderRegistry(), {
          ...resources(),
          source: { ...sourceRef, ...patch },
        }),
      ).toContain("source-mismatch");
    expect(
      issueCodes(renderProject(), renderRegistry(), {
        ...resources(),
        supportsBinding: () => false,
      }),
    ).toContain("not-ready");
    const unavailable = getProjectReadiness(
      validateRenderProject(draft()),
      effectRegistry(),
      { ...resources(), source: null },
    );
    expect(unavailable.ready).toBe(false);
    if (!unavailable.ready)
      expect(unavailable.issues.map((i) => i.code)).toEqual([
        "missing-source",
        "not-ready",
      ]);
  });
  it("requires supported bindings only for enabled effects, while still validating disabled values", () => {
    const effect = {
      id: "fx",
      key: "unavailable",
      enabled: false,
      parameters: { amount: 0 },
    };
    expect(issueCodes({ ...renderProject(), effects: [effect] })).toEqual([]);
    expect(
      issueCodes({
        ...renderProject(),
        effects: [{ ...effect, enabled: true }],
      }),
    ).toContain("not-ready");
    expect(
      issueCodes({
        ...renderProject(),
        effects: [{ ...effect, parameters: { amount: 2 } }],
      }),
    ).toContain("invalid-project");
    expect(
      issueCodes(
        {
          ...renderProject(),
          effects: [{ ...effect, key: "available", enabled: true }],
        },
        renderRegistry(),
        { ...resources(), supportsBinding: (b) => b.dispatchId === 101 },
      ),
    ).toContain("not-ready");
  });
  it("checks each referenced plane and never confuses asset absence with a valid draft", () => {
    const p = {
      ...renderProject(),
      masks: [
        {
          id: "m1",
          targetId: "style",
          assetId: "a",
          invert: false,
          opacity: 1,
        },
        {
          id: "m2",
          targetId: "style",
          assetId: "b",
          invert: false,
          opacity: 0,
        },
      ],
    };
    const missing = getProjectReadiness(p, renderRegistry(), resources());
    expect(missing.ready).toBe(false);
    if (!missing.ready)
      expect(
        missing.issues
          .filter((i) => i.code === "missing-mask-asset")
          .map((i) => i.path),
      ).toEqual(["masks[0].assetId", "masks[1].assetId"]);
    for (const asset of [
      { width: 2, height: 2, alpha: new Uint8Array(3) },
      { width: 0, height: 2, alpha: new Uint8Array(0) },
      { width: 16385, height: 1, alpha: new Uint8Array(16385) },
      { width: 1, height: 1, alpha: new Uint8ClampedArray(1) },
    ])
      expect(
        issueCodes(p, renderRegistry(), {
          ...resources(),
          maskAssets: new Map([
            [
              "a",
              asset as { width: number; height: number; alpha: Uint8Array },
            ],
          ]),
        }),
      ).toContain("missing-mask-asset");
    const valid = { width: 1, height: 1, alpha: new Uint8Array([128]) };
    expect(
      issueCodes(p, renderRegistry(), {
        ...resources(),
        maskAssets: new Map([
          ["a", valid],
          ["b", valid],
        ]),
      }),
    ).toEqual([]);
    expect(
      issueCodes(p, renderRegistry(), {
        ...resources(),
        source: null,
        maskAssets: new Map(),
      }),
    ).toEqual(["missing-source", "missing-mask-asset", "missing-mask-asset"]);
  });
  it("charges unique referenced IDs once, distinct aliased IDs separately, and ignores unused store entries", () => {
    const asset = {
      width: 16384,
      height: 8192,
      alpha: new Uint8Array(16384 * 8192),
    };
    const mask = (id: string, assetId: string) => ({
      id,
      targetId: "style",
      assetId,
      invert: false,
      opacity: 1,
    });
    const res = {
      ...resources(),
      maskAssets: new Map([
        ["a", asset],
        ["b", asset],
        ["c", asset],
        ["unused", { width: 0, height: 0, alpha: new Uint8Array() }],
      ]),
    };
    expect(
      issueCodes(
        {
          ...renderProject(),
          masks: [mask("1", "a"), mask("2", "a"), mask("3", "a")],
        },
        renderRegistry(),
        res,
      ),
    ).toEqual([]);
    expect(
      issueCodes(
        { ...renderProject(), masks: [mask("1", "a"), mask("2", "b")] },
        renderRegistry(),
        res,
      ),
    ).toEqual([]);
    expect(
      issueCodes(
        {
          ...renderProject(),
          masks: [mask("1", "a"), mask("2", "b"), mask("3", "c")],
        },
        renderRegistry(),
        res,
      ),
    ).toContain("not-ready");
  });
  it("revalidates mutable callers and preflights the available Characters binding", () => {
    const invalid = {
      ...renderProject(),
      style: { id: "missing", parameters: {} },
    };
    expect(issueCodes(invalid)).toEqual(["unsupported-schema"]);
    const p = {
      ...draft(),
      source: sourceRef,
      style: {
        id: "characters",
        parameters: {
          fontSize: 11,
          charSet: "@#S08Xx+=-;:. ",
          brightness: 0,
          contrast: 20,
        },
      },
    };
    const result = getProjectReadiness(
      validateRenderProject(p),
      initialCatalogRegistry,
      resources(),
    );
    // Full Characters font/atlas/context/budget admission is the exact adapter's job.
    expect(result).toEqual({ ready: true });
  });
});

describe("project JSON integration and recovery", () => {
  it("round trips full Unicode projects and effect order without replacing the caller on failure", () => {
    const r = effectRegistry();
    const current = validateRenderProject(
      { ...effectDraft(), text: [overlay()] },
      r,
    );
    const serialized = JSON.stringify(current);
    expect(parseRenderProjectJson(serialized, r)).toEqual(current);
    const snapshot = structuredClone(current);
    for (const value of [
      { ...current, extra: 0 },
      { ...current, graph: {} },
      { ...current, style: { id: "missing", parameters: {} } },
      {
        ...current,
        effects: [{ ...current.effects[0], parameters: { amount: null } }],
      },
      { ...current, masks: [{ ...current.masks[0], targetId: "missing" }] },
    ])
      expect(() => parseRenderProjectJson(JSON.stringify(value), r)).toThrow();
    expect(current).toEqual(snapshot);
  });
  it("keeps unsupported version/graph precedence before descending parsed JSON", () => {
    expect(() =>
      parseRenderProjectJson('{"version":2,"nested":{"constructor":1}}'),
    ).toThrowError(
      expect.objectContaining({ code: "unsupported-version", path: "version" }),
    );
    expect(() =>
      parseRenderProjectJson('{"version":1,"graph":{"constructor":1}}'),
    ).toThrowError(
      expect.objectContaining({
        code: "unsupported-version-feature",
        path: "graph",
      }),
    );
  });
});
