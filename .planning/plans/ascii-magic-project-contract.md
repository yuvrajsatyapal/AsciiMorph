# ASCII Magic project contract implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute inline on `main`; do not create branches, worktrees, commits, pushes or subagents for this planning assignment.

**Goal:** Freeze a safe, versioned project transport and exact registry-validation boundary that later Studio, recipes, persistence, Flow and render adapters share.

**Architecture:** Keep the approved `RenderProjectV1` shape and import `SourceRef` from the existing character contract. Separate bounded transport validation, exact per-mode parameter validation and render readiness; a safely decoded project is not evidence of a working renderer. Register only reviewed schemas and never fabricate renderer readiness from the 96-mode inventory.

**Tech Stack:** Existing TypeScript strict mode, Vitest 5 and browser-independent data modules; no new package, Rust change, React route or Next.js API in this delivery.

**Scope:** Detailed executable version of umbrella Task 1 in [ascii-magic-rebuild.md](ascii-magic-rebuild.md). Approved requirements: [spec](../specs/ascii-magic-rebuild.md), especially interfaces, effects persistence, local sources, export, recipes and explicit character-document adaptation. This file is a plan only: no production code, test creation, benchmark rerun or implementation acceptance is performed while writing it.

## Ownership and dependencies

| File | Responsibility |
| --- | --- |
| `src/render/project.ts` (create) | Approved types, project structural/semantic validation, typed errors and render-preflight checks; no bytes, browser resources or persistence |
| `src/render/project.test.ts` (create) | Project fixtures, strict validation, identity/reference integrity and readiness tests |
| `src/render/project-json.ts` (create) | Shared bounded JSON decoder/sanitizer, so later recipes do not invent weaker validation |
| `src/render/project-json.test.ts` (create) | Malformed/unbounded/hostile transport tests |
| `src/render/catalog/types.ts` (create) | Data-only descriptors, exact parameter-schema and registry interfaces |
| `src/render/catalog/registry.ts` (create) | Checked registry construction, exact parameter validation, defaults and lookup |
| `src/render/catalog/registry.test.ts` (create) | Registration/defaults/readiness/schema tests |
| `src/render/catalog/initial-schemas.ts` (create) | Only the five complete declared shader parameter sets; no shaders, renderer registration or generated 96-mode catchall |
| `src/render/catalog/character-schema.ts` (create in Task 4b) | Small independently specified first character-control schema, reviewed before Studio integration; readiness remains false until actual rendering supports it |
| `src/render/character-contract.ts` (read only) | Existing `SourceRef`, `CharacterSettingsV1`, source dimension/budget constants; do not duplicate or weaken these |
| `docs/verification/reference-parity.md` (existing, narrow update only) | Add links to passing contract evidence; preserve all mode/effect/workflow rows as open unless their own acceptance passes |

Do not create or edit `legacy-adapter.ts`: Rust-core Task 7 owns `legacySettingsToCharacter`, `gridToDocument`, painting and explicit pixel-to-document adaptation. Do not change `AsciiDocument`, converter APIs, worker protocol, source stores, original research JSON or the approved spec. Other workers may edit the dirty tree; stage nothing and preserve their changes. Start implementation by reviewing `git status --short` and the exact owned paths. No Next route is touched; if scope later includes one, read its installed `node_modules/next/dist/docs/` guide first.

## Parent decisions recorded before changing any approved shape

1. **Inactive mode values:** The reference preserves mode-specific state on selection; its forced defaults are a small conditional patch, not a complete reset. The approved project contains only active `style.id/parameters`. Recommend retaining this render shape and adding a separately versioned library/UI save envelope in umbrella Task 5:

   ```ts
   type SavedStudioStateV1 = {
     version: 1;
     project: RenderProjectV1;
     inactiveStyleParameters: Record<string, ParameterMap>;
   };
   ```

   This is a candidate container, not a locked reducer design. It stores only inactive modes, validates each map against that mode's registered schema, and rejects a duplicate entry for the active mode. A switch would archive the outgoing mode-specific values, restore the incoming values/defaults, reconcile shared keys, apply the observed small patch, then the tile patch. Effects/source remain unchanged. Render/worker requests receive only `project`; active recipes remain project-independent and reset their supported look fields to defaults. The future library API must accept this envelope (or an explicit additional state argument) to preserve inactive settings on save/reopen. An in-memory-only bank fails persistence parity. Do not hide the bank under undeclared render parameters or silently add it to the approved project. Record a parent ruling before UI/library execution; this plan does not modify the spec or implement the envelope.
2. **Shared look state:** Per-mode snapshots alone cannot reproduce global/shared reference keys such as `fontSize`, `charSet`, `distortAmount`, coverage/brightness/contrast/backdrop or touch flags. Different modes can expose the same key with different labels/bounds, and selection patches/ground rules can update it globally. Keep touched flags/transitional shader-contrast tracking in the future Studio state; they are not renderer inputs. Verify key-sharing semantics and define an explicit shared-versus-mode-local partition/reducer before locking the envelope; do not naively restore entire old maps and resurrect stale shared values. A new top-level shared-look field would be a separate project-shape decision; none is added here. This investigation does not block strict validation of the current active project.
3. **Mask targets — parent ruling:** `MaskV1.targetId === "style"` names the persistent logical style stage, independent of the selected canonical mode ID. Other targets must resolve to an effect instance's `id`; reserve that namespace by rejecting `EffectState.id === "style"` and duplicate effect IDs. Do not target the current mode ID: selecting another mode must not break an existing painted style mask. Initial V1 excludes text/source/Flow targets until a scoped extension defines them. This resolves the string namespace without changing the approved project shape. A missing-source saved draft remains valid; mask-asset readiness is separate.
4. **Initial schemas versus first renderable style:** Bootstrap schema tests from the five complete declared shader schemas, all unavailable for rendering. This does not choose cyanotype as Studio's initial visible style. Task 4b explicitly supplies a small reviewed independent character/UI schema; a future project-to-character render adapter must back those controls before the first character Studio integration. Do not derive a complete character UI schema from `CharacterSettingsV1` or inferred renderer reads.

These are architecture rulings for the parent, not another user permission gate. Continue independent transport/schema tasks while the parent resolves them.

## Evidence and validation policy

Read `docs/research/ascii-magic/2026-10-20/{parameter-evidence,panel-lifecycle-evidence,character-parameter-semantics}.md` and their JSON when authoring descriptors. Evidence currently establishes 688 baseline keys, 521 native descriptor variants across 497 keys, and 38 complete declared shader descriptors across five modes; complete runtime-verified mode schemas remain zero. Baseline defaults, tile patches, state reads, UI declarations and runtime proof are different evidence classes. Never broaden an enum from sample presets or derive ranges from renderer arithmetic.

Reference contrast evidence establishes recipe/initial-state baseline 20, a generic Contrast control range -100..100, shader entry assignment 0, conditional shader-exit restoration 100, and a separate node-default seed 100. The focused [character semantics evidence](../../docs/research/ascii-magic/2026-10-20/character-parameter-semantics.md) now proves common character CPU factor `K(c)=259*(c+255)/(255*(259-c))`, applied around pivot 128 with brightness addition `2.55*B`. Its mathematical neutral is 0; 20 is not neutral and 100 is neither neutral nor the ordinary baseline. Dither's separately named `ditherContrast` uses a different factor and must not share a conversion solely because its label matches.

`CharacterSettingsV1.contrast` is also neutral at 0, but the current core factor is `(1+C/100)/(1-C/100)` around pivot 127.5. Derived **isolated affine-stage** mapping at gamma 1 is `C=100*(K-1)/(K+1)` and `Bcore=B+(1-K)/5.1`. At reference contrast 20, `K=1.168676675691197`, core contrast `7.777861844594087`, and brightness adjustment `-0.03307385797866609`. This algebra is not implemented behavior or complete-render parity. **Project→core tone conversion remains a pre-UI implementation/fixture gate:** verify supported bounds, both pivots, clipping, gamma, sampling/color order and complete glyph output; do not silently clamp a mapped brightness outside the existing core range. Neither this validator nor Studio may forward raw reference values or assume an offset/slope-only match. A future `RenderProject`→character/render adapter owns the validated stage conversion or an explicitly expanded reference-tone contract. Rust-core Task 7's `legacySettingsToCharacter` adapts existing legacy settings and retains its current neutral-0 domain.

The focused evidence proves reference cell height `F*S`, cell width `.6*F*S` for font size F/render scale S, with Characters grid dimensions using floor after output dimensions are rounded. At scale 1, baseline 11 already means 6.6×11; only UI integers 14..26 directly fit the existing core's `cellWidth` 7..16 and `cellHeight` 14..28. **Geometry representation is an additional pre-UI blocker:** either prove a mapping that preserves the full 3..80 control range and reference grid behavior without clipping, or deliberately extend and validate the character geometry contract/calibration/WASM/Rust/paint boundaries together. Never silently clamp the UI range, round fractional cell width away, reuse the ceiling rule of other grid modes for Characters, or declare full-range rendering from schema validation alone. Cell-count/memory/export budgets remain separate limits and must report failures visibly.

## Contract and error interface

Keep these exact approved types (`SourceRef` imported, not redeclared):

```ts
import type { SourceRef } from "./character-contract";
export type ParameterValue = number | string | boolean | null |
  ParameterValue[] | { [key: string]: ParameterValue };
export type ParameterMap = Record<string, ParameterValue>;
export type NormalizedCrop = { x: number; y: number; width: number; height: number };
export type EffectState = { id: string; key: string; enabled: boolean; parameters: ParameterMap };
export type MaskV1 = { id: string; targetId: string; assetId: string; invert: boolean; opacity: number };
export type TextOverlayV1 = {
  id: string; text: string; x: number; y: number; width: number;
  fontFamily: string; fontSize: number; color: string;
  align: "left" | "center" | "right"; rotation: number;
};
export type ExportSettingsV1 = {
  format: "png" | "jpeg" | "gif" | "webm" | "mp4";
  scale: 1 | 2 | 3 | 4; fps: 15 | 20 | 24 | 30 | 60;
  durationUs: number; quality: number; audio: boolean;
};
export type RenderProjectV1 = {
  version: 1; id: string; name: string; source: SourceRef | null;
  crop: NormalizedCrop; rotation: 0 | 90 | 180 | 270;
  style: { id: string; parameters: ParameterMap };
  effects: EffectState[]; masks: MaskV1[]; text: TextOverlayV1[];
  seed: number; timeUs: number; export: ExportSettingsV1;
  graph?: never;
};
```

`graph?: never` is the supported first-delivery TypeScript surface, not a fabricated `FlowGraphV1` model. Any own `graph` field (including `undefined`/`null`) throws `unsupported-version-feature` at path `graph`. Flow Task 6 supplies its real versioned model and updates this declaration intentionally. Type assertions cannot bypass runtime rejection.

```ts
export type ProjectErrorCode = "invalid-project" | "unsupported-version" |
  "unsupported-version-feature" | "unknown-parameter" | "unsupported-schema" |
  "not-ready" | "missing-source" | "source-mismatch" | "missing-mask-asset";
export class ProjectValidationError extends Error {
  constructor(public readonly code: ProjectErrorCode,
    public readonly path: string, message: string) {
    super(message);
    this.name = "ProjectValidationError";
  }
}
// Public application/import entry; default registry is the reviewed initial registry.
export function validateRenderProject(value: unknown,
  registry?: CatalogRegistry): RenderProjectV1;
export function parseRenderProjectJson(json: string,
  registry?: CatalogRegistry): RenderProjectV1;
export type ProjectReadiness = { ready: true } |
  { ready: false; issues: { code: ProjectErrorCode; path: string; message: string }[] };
export function getProjectReadiness(project: RenderProjectV1,
  registry: CatalogRegistry, resources: RenderResources): ProjectReadiness;
```

An optional registry argument supports real injected registries and test fixtures while retaining the approved one-argument entry. Keep descriptor imports type-only where necessary to avoid runtime circular imports.

### Three distinct checks

| Boundary | Establishes | Does not establish |
| --- | --- | --- |
| Internal transport decoder | Exact project shell, JSON-only maps, finite values, limits and reference shape | A mode accepts these keys or can render |
| `validateRenderProject` | Transport plus registered mode/effect schema, exact keys/types/ranges and project reference integrity | Source bytes exist, GPU/encoder works, renderer installed |
| `getProjectReadiness` | Revalidates current semantic inputs, requires source identity, valid referenced mask planes, enabled renderer bindings and actual capability flags | Reference-quality output or completed inventory acceptance |

Do not export the transport-only result as an accepted `RenderProjectV1`. Keep it module-private or distinctly branded; import/apply/save entry points use full semantic validation. An ID with no reviewed schema raises `unsupported-schema`, preserving the caller's original raw import for recovery instead of changing the current project. Schema-known/unrenderable projects may save; render readiness remains visibly false. Disabled effects still require known valid schema/data, but do not require a renderer binding until enabled. Unknown fields are never silently ignored.

### Proposed conservative transport limits (engineering policy, not reference observations)

- JSON input maximum 1,048,576 UTF-8 bytes; total recursive nodes 32,768; maximum depth 16; each array/object at most 1,024 members; a string at most 65,536 UTF-16 units; key at most 128. Apply budgets across the entire project, not separately per parameter map. Count object keys/string values toward the aggregate UTF-8 byte budget for object input too.
- Project ID, effect/mask/text ID and asset ID: 1..128 non-whitespace characters; names at most 256 units, nonempty after trim. IDs are opaque exact strings, never normalized or used as HTML/paths. Reject dangerous dictionary keys `__proto__`, `prototype`, `constructor` everywhere.
- At most 64 effects, 64 masks and 128 text overlays, plus the aggregate budgets above. Reject sparse arrays, extra array properties, symbol keys, accessor properties, cycles, bigint, functions, undefined, typed arrays, Date, custom prototypes and nonfinite numbers. Plain/null-prototype records are accepted, then copied into fresh records using safe own-data properties; never `Object.assign` untrusted dictionaries or evaluate getters. Repeated acyclic objects can be copied; count each occurrence. Use a recursion-path WeakSet, not a global seen set that mistakes sharing for a cycle.
- Check JSON string byte size before `JSON.parse`; catch its syntax error as `invalid-project`. Recursive sanitation occurs before property reads. Object input must pass the same sanitation. `JSON.stringify` is not validation: it drops undefined and converts NaN to null. Untrusted callers supply plain data; no attempt is made to execute or support Proxy-backed objects.
- Structural validation returns a detached validated snapshot. Changing the supplied nested map/array after validation cannot mutate the accepted project. Do not trim user text, normalize Unicode, round, clamp or silently default malformed imports.

### Field rules

| Fields | Exact rule |
| --- | --- |
| Project/shell | Required keys exactly as approved; only graph is recognized-but-unsupported; missing required/extra fields fail |
| version | Exactly 1; unknown version reports `unsupported-version` before shape migration |
| source | Null valid for saved drafts; otherwise exactly `id revision width height`, ID policy above, safe integer revision >=0; positive integer dimensions <= `MAX_SOURCE_DIMENSION`; width*height*4 <= `DEFAULT_MEMORY_BUDGET_BYTES` using overflow-safe comparisons; never accept `rgba`, blob, URL or encoded bytes |
| crop | Exactly four finite numbers: x/y in [0,1], width/height >0 and <=1; x+width/y+height <=1.000001 to match current core contract |
| rotation/seed/timeUs | Quarter-turn enum; uint32 seed; nonnegative safe integer microseconds, never milliseconds/floating timestamps |
| style | Exactly id/parameters; ID resolves a canonical mode schema, not a tile alias; map is complete/exact against that schema |
| effects | Preserve array order and enabled flag. Unique nonempty instance IDs; key resolves effect descriptor. Validate disabled maps too. Do not reorder to canonical order or discard an unrecognized effect |
| masks | Unique IDs; target is reserved logical stage `style` or a valid effect instance ID, never a canonical mode ID/another mask/text/source/graph; effect ID `style` is forbidden; assetId is opaque store reference; boolean invert; finite opacity [0,1]. Require asset bytes only at readiness |
| text | Unique IDs; text permits empty/Unicode/combining/emoji/newlines under string budgets. x/y/width are fractional output-frame coordinates, width >0; fontSize >0 is a fraction of output height; rotation is finite degrees. Do not force x/y into [0,1] or drop intentionally off-canvas text. fontFamily is a bounded nonempty string; color independently specified as #RRGGBB or #RRGGBBAA; align exact enum |
| export | Exact declared formats/scales/fps; durationUs nonnegative safe integer, quality [0,1], audio boolean. Zero duration accepted for still draft settings; animated export later requires positive duration and real encoder/audio capabilities. Schema acceptance never enables a codec |

Font/color parsing is data validation, not CSS/HTML rendering. Later text paint uses canvas-safe APIs and independently audited font assets. Source dimensions remain original/oriented dimensions; no preview/export width or zoom enters this schema. Source RGBA/peak budgets and export allocation preflight remain service responsibilities too.

## Task 1: Define strict types, fixture and failure paths

**Files:** `src/render/project.ts`, `src/render/project.test.ts`; imports only from `character-contract.ts` and catalog types.

- [ ] Add approved types/error interface above and write the initial failing tests with this shared fixture (schema values become available in Task 4):

  ```ts
  const cyanotypeParameters = () => ({
    sfx_cyanotype_exposure: 1, sfx_cyanotype_blue: 0.65,
    sfx_cyanotype_age: 0.5, sfx_cyanotype_paper: 0.3,
    sfx_cyanotype_bleed: 0.25, sfx_cyanotype_brush: 0,
    sfx_cyanotype_rinse: 0, sfx_cyanotype_blendmode: 0,
    sfx_cyanotype_seed: 0,
  });
  const draft = () => ({
    version: 1, id: "project-a", name: "Draft e\u0301 🦋", source: null,
    crop: { x: 0, y: 0, width: 1, height: 1 }, rotation: 0,
    style: { id: "cyanotype", parameters: cyanotypeParameters() },
    effects: [], masks: [], text: [], seed: 0, timeUs: 0,
    export: { format: "png", scale: 1, fps: 30,
      durationUs: 0, quality: 0.9, audio: false },
  });
  it("rejects unsupported versions and graph without discarding data", () => {
    expect(() => validateRenderProject({ ...draft(), version: 2 }))
      .toThrow(expect.objectContaining({ code: "unsupported-version" }));
    for (const graph of [null, undefined, { version: 1, nodes: [] }]) {
      expect(() => validateRenderProject({ ...draft(), graph }))
        .toThrow(expect.objectContaining({ code: "unsupported-version-feature", path: "graph" }));
    }
  });
  it("accepts empty-source drafts without claiming render readiness", () => {
    expect(validateRenderProject(draft()).source).toBeNull();
  });
  ```

- [ ] Run `npx vitest run src/render/project.test.ts`; expect missing validation implementation/import failure. Then implement shell checking using the exact field table, backed by Task 2 sanitation and Task 3 schema lookup. After confirming a plain root record, inspect its own property descriptors without evaluating getters: an own data `version` other than 1 reports unsupported version; any own `graph` descriptor reports unsupported feature before recursively sanitizing its value. This preserves the specified error for `graph:undefined` without reading accessors. All remaining root/nested data then passes sanitation and exact shape checks. Never delete fields. Complete the draft test after Task 4 rather than inventing a permissive schema stub.
- [ ] Add table cases for each missing shell key, each nested extra key, null versus missing source, source revision -1/fraction/unsafe integer, width 0/16,385, rotation 45, seed -1/2**32, negative/fractional timeUs, out-of-frame crop, malformed export format/scale/fps/quality/duration/audio. Each must report a stable path and leave input unchanged. Re-run the targeted file after Tasks 2–4 and require PASS.

## Task 2: Bound and sanitize the entire JSON transport

**Files:** `src/render/project-json.ts`, `src/render/project-json.test.ts`; use from `project.ts`.

- [ ] Write failure cases for every limit at the boundary and one beyond: UTF-8 multibyte size, depth 16/17, member 1,024/1,025, nodes 32,768/32,769, long keys/strings. Keep fixtures under the other limits so the assertion identifies the intended budget. Also test cycles, sparse arrays, symbol keys, extra array property, `Object.create({ inherited: true })`, Date, typed arrays, undefined/function/bigint/NaN/Infinity at nested paths, and getter rejection without getter execution:

  ```ts
  it("rejects prototype keys and never invokes an accessor", () => {
    const getter = vi.fn(() => 1);
    const accessor = Object.defineProperty({}, "value", { enumerable: true, get: getter });
    expect(() => sanitizeProjectJson(accessor)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    for (const key of ["__proto__", "constructor", "prototype"]) {
      const input = JSON.parse(`{"nested":{"${key}":1}}`);
      expect(() => sanitizeProjectJson(input)).toThrow();
    }
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  });
  ```

- [ ] Run `npx vitest run src/render/project-json.test.ts`; expect absent exports. Implement `parseBoundedProjectJson(text: string): unknown` and `sanitizeProjectJson(value: unknown): ParameterValue` with one aggregate budget per call. Inspect prototypes and `Object.getOwnPropertyDescriptors` before reading values; enumerate `Reflect.ownKeys`; reject accessor/nonenumerable object data and unexpected array properties; reject dangerous keys. Arrays require exactly indexed own data elements plus their standard length. Recursively copy validated primitives and members; count keys, nodes, depth and UTF-8 content before allocating copies. Remove an object from the cycle-path WeakSet after its subtree. Parser checks pre-parse byte size, catches syntax errors, then sanitizes. Object input undergoes identical bounds/sanitization without serialization shortcuts.
- [ ] Run both JSON and project test files; JSON tests must PASS. Add mutation test: validate a draft, mutate its original `style.parameters`, and assert the returned map is unchanged. No browser, WASM or package install is needed.

## Task 3: Define checked registry and exact parameter schemas

**Files:** `src/render/catalog/{types,registry}.ts`, `src/render/catalog/registry.test.ts`.

- [ ] Keep umbrella descriptor fields (`key,label,type,default,min,max,step,options`; style `id,mode,name,category,tags,parameters,ready,output,dispatchId`). Add an internal recursive `ParameterRule` discriminated union for number/boolean/color/select/text/array/object/null, required exact object members and bounded array members. It is the validation source; UI descriptors are a checked projection, never a second mutable definition. Keep evidence/readiness outside imported parameter values. Registry's concrete interface:

  ```ts
  export type ParameterRule =
    | { kind: "number"; min: number; max: number; integer?: boolean }
    | { kind: "boolean" }
    | { kind: "color" }
    | { kind: "select"; values: readonly (string | number | boolean)[] }
    | { kind: "text"; minLength: number; maxLength: number; graphemeRamp?: true }
    | { kind: "array"; item: ParameterRule; minItems: number; maxItems: number }
    | { kind: "object"; fields: Readonly<Record<string, ParameterRule>> }
    | { kind: "null" };
  export type ParameterDescriptor = {
    key: string; label: string;
    type: "number" | "boolean" | "color" | "select" | "text" | "curve" | "point";
    default: ParameterValue; min?: number; max?: number; step?: number;
    options?: { value: string; label: string }[];
  };
  export type StyleDescriptor = {
    id: string; mode: string; name: string; category: string; tags: string[];
    parameters: ParameterDescriptor[]; ready: boolean;
    output: "glyph" | "rgba"; dispatchId: number;
  };
  export type EffectDescriptor = {
    key: string; phase: number; order: number; parameters: ParameterDescriptor[];
  };
  export type SchemaEvidence = "independent-contract" | "static-declaration" | "runtime-verified";
  export type RendererBinding = { dispatchId: number; backend: "rust-cpu" | "rust-gpu" };
  type SchemaContract = {
    rules: Readonly<Record<string, ParameterRule>>;
    evidence: SchemaEvidence; defaultsVersion: 1; binding: RendererBinding | null;
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
  ```

  `dispatchId: 0` means unavailable and must never dispatch; positive unique IDs require an actual binding. Registry descriptor `ready` derives from binding installation and must agree with it; actual session capability is an additional readiness check. A style's canonical `id === mode`; tile IDs/patches belong to catalog UI. Effects additionally retain their approved phase/fixed-order metadata; project effect instance IDs are unrelated to keys. This delivery has no production effect schema until independently reviewed exact effect rules are supplied; an empty effects array is valid, unsupported keys fail visibly. Optional numeric min/max/step are projected from number rules; only string-valued selects use the approved string `options` field. Numeric blend indices remain number descriptors with evidence labels held separately rather than changing their transport type.
- [ ] Write failing cases for duplicate mode/effect keys, duplicate positive dispatch IDs, invalid enum/default/range/step, parameters not matching descriptors, and unknown nested keys. Use a test-only independently specified schema with rules `{ amount:number[0,1], enabled:boolean, ramp:text, point:{x:number[0,1],y:number[0,1]}, palette:array(color,1..8), curve:array({x:number[0,1],y:number[0,1]},2..32) }`. Do not place this test mode in the production catalog. Assert false/0/empty string/null obey their exact rule instead of truthiness. Number rules accept finite values/ranges and integer-only where specified; descriptor `step` is a UI increment, not an automatic quantization rule for continuous imported values. Blend/seed indices explicitly use integer rules.
- [ ] Run `npx vitest run src/render/catalog/registry.test.ts`; expect missing registry. Implement `createCatalogRegistry(styles: readonly StyleSchema[], effects: readonly EffectSchema[]): CatalogRegistry` by validating registration once, storing immutable copies in Maps, and recursively validating exact parameter sets. Unknown style/effect raises `unsupported-schema`; unknown parameter raises `unknown-parameter` with full path. Invalid value raises `invalid-project`. Defaults and validation return detached maps. Require all declared keys on import; filling omitted values is a deliberate versioned migration/recipe action, never validation.
- [ ] Re-run registry tests and typecheck. Test a schema-known descriptor with `binding:null` validates parameters but remains `ready:false`. Do not accept caller-controlled `ready:true` as proof or create a registry entry for each inventory row.

## Task 4: Register the bounded initial shader data, all nonrenderable

**Files:** `src/render/catalog/initial-schemas.ts`, registry tests and project fixture.

- [ ] Write tests asserting initial registry IDs exactly `anodized, cyanotype, hexhalftone, oilpool, paperstock`; control counts 5/9/6/6/12 respectively (38 total); each `binding:null`, `ready:false`, `dispatchId:0`, output `rgba`; static-declaration evidence; default maps validate. Assert an unregistered inventory mode such as `liquidglass` fails `unsupported-schema` and no fake passthrough applies.
- [ ] Run registry tests and expect initial registry missing. Independently author data from the **Shader control descriptors** table in `parameter-evidence.md`, using the machine-readable ledger to verify exact labels/keys/options. The compact tuples below are suffix/default/min/max/step; prefix keys with `sfx_<mode>_`. Preserve exact evidence labels. Blend fields are integer UI-number values 0..13 with the 14 evidence names as display labels, not string replacements; seeds are integer 0..999. All other listed values are continuous finite numeric fields.

  ```text
  cyanotype: exposure/1/.2/2/.01, blue/.65/0/1/.01, age/.5/0/1/.01,
    paper/.3/0/1/.01, bleed/.25/0/1/.01, brush/0/0/1/.01,
    rinse/0/0/1/.01, blendmode/0/0/13/1, seed/0/0/999/1
  hexhalftone: size/13/3/40/.5, angle/0/0/60/1, color/0/0/1/.01,
    paper/.45/0/1/.01, shape/0/0/1/.01, blendmode/0/0/13/1
  paperstock: intensity/.8/0/1/.01, crumple/.95/0/2/.01,
    crumple_scale/5/1/10/.1, flatness/7/1/60/.1, displace/.0016/0/.08/.0001,
    fiber/.44/0/1/.01, fiber_scale/1.7/.5/4/.01,
    light_angle/.18/0/1/.01, light_elev/.52/0/1/.01, tear/0/0/1/.01,
    blendmode/0/0/13/1, seed/0/0/999/1
  oilpool: scale/1/.3/3/.01, bands/.6/0/1/.01, strength/.6/0/1/.01,
    islands/0/0/1/.01, blendmode/0/0/13/1, seed/0/0/999/1
  anodized: shift/.18/0/1/.01, brush/.5/0/1/.01, metal/.6/0/1/.01,
    torch/0/0/1/.01, blendmode/0/0/13/1
  ```

- [ ] Inject/export this validated initial registry as the default for `validateRenderProject`. Never import research JSON or reference bundles at runtime. Add boundary tests exposure .2/2 accepted, .199/2.001 rejected, seed 999 accepted/1000 or .5 rejected, wrong string/boolean rejected, unknown key rejected, missing key rejected. Re-run project/registry/JSON tests; all must PASS. These are schema-data tests, not renderer or reference-runtime acceptance.

## Task 4b: Review a small independent first character schema before UI integration

**Files:** `src/render/catalog/character-schema.ts`, registry tests; register through `initial-schemas.ts` only after the schema review below. No render adapter or UI is implemented by this data task.

- [ ] Specify the first exact character map as an **independent subset**, not the complete reference mode. Use this deliberately small candidate for review against the approved control design:

  ```ts
  const initialCharacterParameters = {
    fontSize: 11,
    charSet: "@#S08Xx+=-;:. ",
    brightness: 0,
    contrast: 20,
  };
  ```

  `fontSize` is a UI cell-size value, finite 3..80, step 1, with baseline/default 11 (shared `ui-0306` declaration; exact parent mounting remains the separate lifecycle evidence). This is accepted schema data while its representation in the narrower current core geometry remains unresolved; full range readiness stays false. `charSet` is bounded custom text: 2..256 unique printable graphemes, no newline/control-only/leading-combining-mark graphemes, <=512 UTF-16 input units and <=64 units per grapheme, preserving exact accepted Unicode and ordering. Repeated glyphs fail this independent schema rather than silently deduplicating during import. Brightness is finite -100..100/default 0 (`ui-0464`); contrast is finite -100..100 and independently defaults to 20, following the recorded recipe/initial-state baseline and approved prototype (`ui-0465`). Character contrast 0 is mathematically neutral by the focused static proof; conversion into the current core still needs numerical/render fixtures. No step was statically resolved for these last two controls; do not claim one as reference evidence. All four keys are required and every other character key fails until the schema is deliberately extended. Renderer-specific geometry, calibration, color, mapping and algorithm defaults are explicit future adapter inputs, never hidden undeclared parameter keys.
- [ ] Write failing registry tests for exactly these four keys, exact defaults, invalid empty/single/duplicate/control ramps, Unicode `e\u0301`/emoji retention, bound violations and unknown keys. Mark evidence `independent-contract` with individual static anchors; descriptor `ready:false`, `binding:null`, `dispatchId:0`, output `glyph`. Assert schema validation accepts the map but readiness rejects rendering. Re-run `npx vitest run src/render/catalog/registry.test.ts` and observe missing character schema failure.
- [ ] Review the four control meanings/defaults against the approved design and document the independent subset decision in the plan/ledger. Implement the exact descriptor/rule data after review; retain the five-schema shader assertion over the exported shader list, and add a separate combined initial-registry assertion containing `characters` plus those five shader modes. Run registry/project tests and require PASS. No permissive `{[key:string]:any}` or parameter transport passthrough may bootstrap a working style.
- [ ] Hand off two explicit pre-UI blockers to the character render-adapter owner. First, use the cited exact formula and derived slope/intercept mapping to implement project→`CharacterSettingsV1` tone conversion, or expand the tone contract if supported bounds/pipeline ordering require it. Add numerical fixtures at contrast -100/0/20/100, brightness -100/0/100, channel 0/1/127/128/254/255 and gamma 1; assert isolated affine outputs against the research equation, including clipping and mapped-brightness boundary policy. Keep full sampling/color/gamma/glyph equivalence as a distinct fixture gate, not a conclusion from this algebra. Second, prove full 3..80 cell-size geometry representation or implement a coordinated new geometry contract across TypeScript validation, calibration, packed grid, WASM/Rust and painting; fixture F=3/11/14/26/80, fractional widths, scale changes, floor grid sizing and nonclipping output. Then implement measured custom-ramp calibration. Verify every control changes rendered output before changing any descriptor/control readiness. Core Task 7's legacy adapter retains the old neutral-0 settings domain; the new project adapter is a separate responsibility. Unsupported controls remain unavailable while this schema-only task is complete. Additional character controls are added in reviewed exact increments as their implementations pass; this subset does not close the `characters` parity row.

## Task 5: Enforce reference integrity, text/geometry and export persistence

**Files:** `src/render/project.ts`, `src/render/project.test.ts`.

- [ ] Write tests that construct a test-registry effect with a real exact scalar schema; two differently keyed effect instances must remain in supplied order with all enabled/disabled parameters unchanged. Reject duplicate effect IDs, reserved effect ID `style`, unresolved mask targets, canonical-mode-ID mask targets, invalid opacity/invert/asset ID, malformed nested curves/points/palettes and null effects/text members. Accept target `style` and a resolved effect instance ID; switching canonical style mode while retaining target `style` must leave a valid painted-mask reference. Source null plus a stored mask reference is a valid draft if references resolve; resource lookup is separate.
- [ ] Add table tests covering normalized text units with source 1920×1080, x=.25,y=.5,width=.4,fontSize=.05,rotation=15 and UTF-8 content `e\u0301 🦋\n漢字`. Validate without source dimensions and retain exact numbers/string; source changes must not scale stored geometry. Accept intentional negative x and empty text; reject zero width/fontSize, nonfinite geometry, invalid color/align and unknown text fields. Reject `zoom`, `previewWidth`, `exportWidth`, `rgba` and legacy inline conversion/source bytes as undeclared project fields.
- [ ] Run project tests; expect integrity checks to fail before implementation. Implement exact field-table checks and registry semantic validation over sanitized copies. Use Sets/Maps for IDs/references, never object-prototype lookup. Reserve logical target `style` and reject an effect using that instance ID; resolve other targets against effect IDs. Canonical style mode IDs are renderer selections, not mask identities. Preserve order and values; no sorting, Unicode normalization, dropping disabled effects or import coercion.
- [ ] Test every allowed export enum, valid source/crop/quarter-turn combinations, independent source revision, null-source draft, uint32/time boundaries, PNG alpha-support intent via stored format only and JPEG/MP4 settings retained without falsely establishing encoder support. Run targeted tests; expect PASS. This task stores export choices; it does not implement alpha flattening, container encoding or inferred trim/audio models.

## Task 6: Make render readiness explicit and dependent on actual resources

**Files:** `src/render/project.ts`, `src/render/project.test.ts`; no worker/service mutation.

- [ ] Define nonserializable preflight inputs in this module, separate from project JSON:

  ```ts
  export interface RenderResources {
    source: SourceRef | null;
    maskAssets: ReadonlyMap<string, {
      width: number; height: number; alpha: Uint8Array;
    }>;
    supportsBinding(binding: RendererBinding): boolean;
  }
  ```

  A source supplied here must represent a service-validated uploaded source; this function checks exact id/revision/width/height identity, not only id. Mask alpha plane validation requires positive integer dimensions within source dimension/budget bounds, `alpha instanceof Uint8Array`, exact width*height length and total mask memory budget. No alpha bytes enter validated project JSON. Geometry mapping of a mask to its target is normalized-frame based in later rendering, not a requirement that all target resolutions equal source resolution.
- [ ] Write failing tests for null project/source, same ID with wrong revision, same ID/revision with wrong geometry, missing referenced mask asset, short alpha plane and schema-known unavailable style. Use test-only registered renderer bindings plus validated source references to test success; enabled unavailable effect fails, disabled unavailable effect does not block. Never mark any of the five initial production styles ready in tests to manufacture successful production dispatch.
- [ ] Run project tests; expect readiness missing. Implement `getProjectReadiness` as a pure function: revalidate semantics, return stable issues for every missing/mismatched source and mask and unsupported binding; return ready only with a nonnull matching source plus supported active style/all enabled effects. Source errors must be visible even if another not-ready issue also exists. Does not allocate a frame, submit a worker job or choose an encoder. Export scheduling adds its own full-scale allocation/codec/audio checks later.
- [ ] Run targeted tests plus `src/render/character-contract.test.ts`; require PASS. The actual project→character submission adapter is a separate follow-on responsibility, including contrast domains, calibrated Unicode ramp validation and output grid dimensions. Core Task 7 continues owning legacy settings/document adaptation and explicit pixel-style-to-document rejection. This contract never exports an automatic flatten-to-document function.

## Task 7: Validate integration boundaries and record honest completion

**Files:** Owned tests above; narrow evidence link update to `docs/verification/reference-parity.md` only.

- [ ] Add one cross-boundary test: parse valid UTF-8 project JSON, validate, serialize/reparse, and compare the full project including effect order and Unicode text. Unknown field, unsupported graph/schema, malformed nested value or missing mask reference must fail without mutating/replacing the caller's current valid project. Recipe-specific resets/defaults-version/base64url/source exclusion remain umbrella Task 5; project JSON is never labeled a recipe code.
- [ ] Run `npx vitest run src/render/project.test.ts src/render/project-json.test.ts src/render/catalog/registry.test.ts src/render/character-contract.test.ts`; expect PASS. Then run `npx vitest run src/core/document.test.ts src/converter/engine.test.ts` and `npm run typecheck`. Run lint only on the owned new files (`npx eslint src/render/project.ts src/render/project.test.ts src/render/project-json.ts src/render/project-json.test.ts src/render/catalog`) and inspect `git diff --check`. If an existing unrelated failure appears, report its exact file/test separately without modifying another worker's files. No benchmark or full browser suite is justified by pure data-contract implementation.
- [ ] Link passed contract cases/command result in the existing parity ledger. Do not recreate its 105 tiles/96 modes or mark any style/effect/Flow/export ready. Record static-only shader provenance, the independently specified character subset with its pending render adapter, save-envelope decision, source/mask ownership and unsupported graph behavior. Contract completion means safe shared data and exact initial schema checks; it does not mean full umbrella Task 1's later character adaptation or product parity is accepted.
- [ ] Inspect only owned-file diffs and report what passed, remaining integration prerequisites and parent decisions. Preserve dirty source edits and no commits/pushes/branches. Future library/recipe/UI/Flow workers consume these interfaces; add reviewed schemas as their family implementations proceed, never weaken unknown-key rejection to accommodate incomplete capture.

## Self-review coverage

| Requirement | Covered by |
| --- | --- |
| Approved project/export/text/mask/source shape | Contract block, field table, Tasks 1/5 |
| Exact unknown/nonfinite/nested-data rejection; bounded JSON/prototype safety | Tasks 2/3/4 |
| Honest schema/data/readiness distinction | Three-check table, Tasks 3/4/4b/6 |
| Source/preview/export independence | Field table, Tasks 5/6; adapter receives resolved geometry later |
| Inactive values across mode switch and saved project | Candidate envelope plus mandatory key-sharing investigation; implementation belongs to Studio/library plans and does not block strict active contract |
| Unknown Flow rejected visibly | graph policy and Tasks 1/7 |
| No duplicate legacy adapter; unresolved contrast/geometry block UI readiness | Ownership exclusion, evidence policy, Tasks 4b/6 |
| Existing ledger preserved; registry labels do not prove parity | Task 7 |

Before affected UI/library integration, resolve the deferred envelope/shared-global model and verify the umbrella plan links this file; the mask-target namespace has the parent ruling above. Strict active-project transport/schema work proceeds independently; the proposed save container does not block it. No approved spec is silently changed by this plan.
