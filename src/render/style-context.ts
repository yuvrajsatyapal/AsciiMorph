/** Independently specified optional SCX1 job context. No pixel rendering in JS. */
import type { ParameterMap } from "./project";
export const BACKDROPS = ["none", "solid", "original", "blur"] as const;
export const BLENDS = [
  "source-over",
  "overlay",
  "color-dodge",
  "screen",
  "lighter",
] as const;
export interface StyleContextV1 {
  version: 1;
  backdrop: (typeof BACKDROPS)[number];
  blend: (typeof BLENDS)[number];
  softness: number;
  backgroundOpacity: number;
  opacity: number;
  coverage: number;
  invert: boolean;
  random: boolean;
  seed: number;
}
export const STYLE_CONTEXT_DEFAULTS: StyleContextV1 = Object.freeze({
  version: 1,
  backdrop: "blur",
  blend: "source-over",
  softness: 8,
  backgroundOpacity: 100,
  opacity: 100,
  coverage: 100,
  invert: false,
  random: false,
  seed: 0,
});
export function validateStyleContext(value: unknown): StyleContextV1 {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid style context");
  const fields: Record<string, unknown> = {};
  for (const k of Object.keys(STYLE_CONTEXT_DEFAULTS)) {
    const d = Object.getOwnPropertyDescriptor(value, k);
    if (!d || !("value" in d))
      throw new Error("Invalid style context accessor/field");
    fields[k] = d.value;
  }
  const c = fields as unknown as StyleContextV1;
  if (
    Reflect.ownKeys(value).length !==
      Object.keys(STYLE_CONTEXT_DEFAULTS).length ||
    Reflect.ownKeys(value).some(
      (k) => typeof k !== "string" || !Object.hasOwn(STYLE_CONTEXT_DEFAULTS, k),
    ) ||
    Object.keys(STYLE_CONTEXT_DEFAULTS).some((k) => !Object.hasOwn(c, k))
  )
    throw new Error("Invalid style context fields");
  if (
    c.version !== 1 ||
    !BACKDROPS.includes(c.backdrop) ||
    !BLENDS.includes(c.blend) ||
    typeof c.invert !== "boolean" ||
    typeof c.random !== "boolean"
  )
    throw new Error("Invalid style context version/selection");
  for (const [v, max] of [
    [c.softness, 60],
    [c.backgroundOpacity, 100],
    [c.opacity, 100],
    [c.coverage, 100],
    [c.seed, 0xffffffff],
  ])
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max)
      throw new Error("Invalid style context number");
  if (!Number.isInteger(c.seed)) throw new Error("Invalid style context seed");
  return { ...c };
}
export function contextFromParameters(
  p: ParameterMap,
  seed: number,
  characters = false,
): StyleContextV1 | undefined {
  const c = validateStyleContext({
    ...STYLE_CONTEXT_DEFAULTS,
    backdrop: p.bgMode ?? "blur",
    softness: p.bgBlur ?? 8,
    backgroundOpacity: p.bgOpacity ?? 100,
    opacity: characters ? (p.charOpacity ?? 100) : 100,
    coverage: p.coverage ?? 100,
    blend: p.blend ?? "source-over",
    invert: characters ? (p.invert ?? false) : false,
    random: characters ? (p.randomChars ?? false) : false,
    seed: 0,
  });
  if (
    Object.keys(c).every(
      (k) =>
        c[k as keyof StyleContextV1] ===
        STYLE_CONTEXT_DEFAULTS[k as keyof StyleContextV1],
    )
  )
    return undefined;
  return { ...c, seed };
}
export function encodeStyleContext(value: StyleContextV1): Uint8Array {
  const c = validateStyleContext(value),
    b = new Uint8Array(64),
    v = new DataView(b.buffer);
  for (const [o, n] of [
    [0, 0x31584353],
    [4, 1],
    [8, BACKDROPS.indexOf(c.backdrop)],
    [12, BLENDS.indexOf(c.blend)],
    [48, +c.invert],
    [52, +c.random],
    [56, c.seed],
  ])
    v.setUint32(o, n, true);
  for (const [o, n] of [
    [16, c.softness],
    [24, c.backgroundOpacity],
    [32, c.opacity],
    [40, c.coverage],
  ])
    v.setFloat64(o, n, true);
  return b;
}
export function appendStyleContext(
  base: Uint8Array,
  c?: StyleContextV1,
): Uint8Array {
  if (!c) return base;
  const b = new Uint8Array(base.length + 64);
  b.set(base);
  b.set(encodeStyleContext(c), base.length);
  return b;
}
