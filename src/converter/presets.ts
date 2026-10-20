import { graphemes } from "@/core/document";
import { ART_FONT, ensureArtworkFont } from "@/core/render";
export const PRESETS = [
  { id: "classic", name: "Classic ASCII", ramp: " .:-=+*#%@" },
  {
    id: "detailed",
    name: "Detailed ASCII",
    ramp: " .'`^\",:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  },
  { id: "minimal", name: "Minimal ASCII", ramp: " .o@" },
  { id: "blocks", name: "Blocks", ramp: " ░▒▓█" },
  { id: "binary", name: "Binary", ramp: " 01" },
  { id: "numbers", name: "Numbers", ramp: " 1234567890" },
  { id: "geometric", name: "Geometric", ramp: " ·△◇○◆●■" },
  { id: "stars", name: "Stars", ramp: " ·✧✦★" },
  { id: "matrix", name: "Matrix", ramp: " .:01ｱｲｳｴｵ" },
  { id: "braille", name: "Braille · 2×4 dots", ramp: "" },
] as const;
export function characterSet(id: string, custom: string) {
  const text =
    id === "custom" ? custom : PRESETS.find((p) => p.id === id)?.ramp;
  if (
    typeof text !== "string" ||
    text.length > 512 ||
    /[\u0000-\u001f\u007f]/.test(text)
  )
    throw new Error("Choose 2–256 printable characters, sparse to dense.");
  if (id === "braille") return [];
  const chars = graphemes(text);
  if (chars.some((char) => char.length > 64))
    throw new Error(
      "Each character must fit the editable cell character limit.",
    );
  if (chars.length < 2 || chars.length > 256)
    throw new Error("Choose 2–256 printable characters, sparse to dense.");
  const unique = [...new Set(chars)];
  if (unique.length < 2)
    throw new Error("Choose at least two different characters.");
  return unique;
}
export interface Calibration {
  chars: string[];
  coverage: number[];
  shapes?: number[][];
}
// Measure the actual browser font (including Unicode fallback) once per preset.
const cache = new Map<string, Calibration>();
export async function calibrate(
  id: string,
  custom: string,
): Promise<Calibration | undefined> {
  const chars = characterSet(id, custom);
  if (id === "braille" || id === "custom") return undefined;
  const key = id;
  if (cache.has(key)) return cache.get(key);
  await ensureArtworkFont(14);
  const c = document.createElement("canvas");
  c.width = 18;
  c.height = 36;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.font = `28px ${ART_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const measured = chars
    .map((char) => {
      ctx.clearRect(0, 0, 18, 36);
      ctx.fillStyle = "#fff";
      ctx.fillText(char, 9, 18);
      const pixels = ctx.getImageData(0, 0, 18, 36).data;
      let area = 0;
      for (let i = 3; i < pixels.length; i += 4) area += pixels[i] / 255;
      const shape = Array(9).fill(0) as number[];
      for (let y = 0; y < 36; y++)
        for (let x = 0; x < 18; x++)
          shape[Math.floor(y / 12) * 3 + Math.floor(x / 6)] +=
            pixels[(y * 18 + x) * 4 + 3] / 255 / 72;
      return { char, area, shape };
    })
    .sort((a, b) => a.area - b.area);
  const max = measured.at(-1)!.area || 1;
  const result = {
    chars: measured.map((v) => v.char),
    coverage: measured.map((v) => v.area / max),
    shapes: measured.map((v) => v.shape),
  };
  cache.set(key, result);
  return result;
}
