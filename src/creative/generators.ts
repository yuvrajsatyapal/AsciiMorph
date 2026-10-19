import { createDocument } from "@/core/document";
export type GeneratorMode = "noise" | "waves" | "particles" | "fractal";
export interface GeneratorSettings {
  mode: GeneratorMode;
  width: number;
  height: number;
  seed: number;
  scale: number;
  speed: number;
  color: string;
}
export const DEFAULT_GENERATOR: GeneratorSettings = {
  mode: "waves",
  width: 80,
  height: 40,
  seed: 42,
  scale: 1,
  speed: 1,
  color: "#e9b86e",
};
function random(seed: number) {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function generate(s: GeneratorSettings, time = 0) {
  if (
    !["noise", "waves", "particles", "fractal"].includes(s.mode) ||
    !Number.isInteger(s.seed) ||
    !Number.isFinite(time) ||
    !Number.isFinite(s.scale) ||
    s.scale < 0.2 ||
    s.scale > 5 ||
    !Number.isFinite(s.speed) ||
    s.speed < 0 ||
    s.speed > 5 ||
    !/^#[a-f0-9]{6}$/i.test(s.color)
  )
    throw new Error("Invalid generator settings");
  const doc = createDocument(s.width, s.height, `${s.mode} · seed ${s.seed}`),
    rand = random(s.seed),
    ramp = " .:-=+*#%@",
    t = time * s.speed,
    phase = (s.seed % 10007) * 0.61803398875;
  const particles = Array.from({ length: 32 }, () => [
    rand() * 2 - 1,
    rand() * 2 - 1,
    rand() * 6.28,
    0.3 + rand(),
  ]);
  doc.background = "#0c0d10";
  doc.layers[0].cells = doc.layers[0].cells.map((c, i) => {
    const x = (((i % s.width) / s.width) * 2 - 1) * s.scale,
      y = ((Math.floor(i / s.width) / s.height) * 2 - 1) * s.scale;
    let v = 0;
    if (s.mode === "noise") {
      v =
        (Math.sin((x * 127.1 + y * 311.7 + s.seed) * 43.5453 + t * 2) *
          43758.5453) %
        1;
      v -= Math.floor(v);
    }
    if (s.mode === "waves")
      v =
        (Math.sin(x * 9 + Math.sin(y * 5 + t + phase) + t + phase) +
          Math.cos(y * 8 - t + phase) +
          2) /
        4;
    if (s.mode === "particles")
      for (const [px, py, phase, rate] of particles)
        v +=
          Math.exp(
            -(
              (x - px - Math.sin(t * rate + phase) * 0.25) ** 2 +
              (y - py - Math.cos(t * rate + phase) * 0.25) ** 2
            ) * 180,
          ) * 0.8;
    if (s.mode === "fractal") {
      let zx = x * 1.5,
        zy = y * 1.2,
        n = 0;
      const cr = -0.7 + Math.sin(t * 0.2 + s.seed) * 0.12,
        ci = 0.27 + Math.cos(t * 0.2) * 0.06;
      while (zx * zx + zy * zy < 4 && n < 40) {
        const nx = zx * zx - zy * zy + cr;
        zy = 2 * zx * zy + ci;
        zx = nx;
        n++;
      }
      v = n / 40;
    }
    return {
      ...c,
      char: ramp[Math.round(Math.min(1, Math.max(0, v)) * 9)],
      fg: s.color,
    };
  });
  return doc;
}
