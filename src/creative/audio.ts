import { createDocument } from "@/core/document";
export type AudioMode = "bars" | "rings" | "wave";
export interface AudioFeatures {
  volume: number;
  bands: number[];
  wave: number[];
}
export function audioFeatures(
  time: Uint8Array,
  frequency: Uint8Array,
): AudioFeatures {
  if (
    !time.length ||
    time.length > 32768 ||
    !frequency.length ||
    frequency.length > 32768
  )
    throw new Error("Invalid audio sample");
  let sum = 0;
  const wave = Array.from(time, (v) => (v - 128) / 128);
  for (const v of wave) sum += v * v;
  const bands = Array.from({ length: 32 }, (_, band) => {
    const start = Math.floor((band * frequency.length) / 32),
      end = Math.max(
        start + 1,
        Math.floor(((band + 1) * frequency.length) / 32),
      );
    let sum = 0;
    for (let i = start; i < end; i++)
      sum += (frequency[Math.min(i, frequency.length - 1)] ?? 0) / 255;
    return sum / (end - start);
  });
  return { volume: Math.min(1, Math.sqrt(sum / time.length)), bands, wave };
}
export function audioArtwork(
  features: AudioFeatures,
  mode: AudioMode,
  color: string,
  sensitivity: number,
) {
  if (
    !["bars", "rings", "wave"].includes(mode) ||
    !/^#[\da-f]{6}$/i.test(color) ||
    !Number.isFinite(sensitivity) ||
    sensitivity < 0.25 ||
    sensitivity > 4 ||
    features.bands.length > 32768 ||
    features.wave.length > 32768 ||
    !features.bands.length ||
    !features.wave.length ||
    [features.volume, ...features.bands, ...features.wave].some(
      (v) => !Number.isFinite(v),
    )
  )
    throw new Error("Invalid audio visualization");
  const width = 64,
    height = 24,
    doc = createDocument(width, height, `Audio ${mode}`),
    clamp = (v: number) => Math.max(0, Math.min(1, v));
  doc.background = "#0c0d10";
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const band = clamp(
          features.bands[Math.floor((x / width) * features.bands.length)] *
            sensitivity,
        ),
        volume = clamp(features.volume * sensitivity);
      let on = false,
        char = " ";
      if (mode === "bars") {
        on = height - 1 - y < band * (height - 1);
        char = y % 3 === 0 ? "=" : "|";
      }
      if (mode === "wave") {
        const value =
          features.wave[Math.floor((x / width) * features.wave.length)] *
          sensitivity;
        on =
          Math.abs(y - ((height - 1) / 2 - (value * (height - 2)) / 2)) < 0.8;
        char = "~";
      }
      if (mode === "rings") {
        const radius = Math.hypot(
          (x - (width - 1) / 2) / 2,
          y - (height - 1) / 2,
        );
        on = volume > 0.01 && Math.abs(radius - (2 + volume * 9)) < 0.65;
        char = "*";
      }
      doc.layers[0].cells[y * width + x] = {
        char: on ? char : " ",
        fg: color,
        bg: null,
        alpha: 1,
      };
    }
  return doc;
}
export interface AudioResources {
  context: AudioContext;
  element?: HTMLAudioElement;
  stream?: MediaStream;
  url?: string;
  nodes: AudioNode[];
}
export function releaseAudio(
  resources: AudioResources,
  revoke: (url: string) => void = URL.revokeObjectURL,
) {
  resources.element?.pause();
  if (resources.element) {
    resources.element.removeAttribute("src");
    resources.element.load();
  }
  resources.stream?.getTracks().forEach((track) => track.stop());
  for (const node of resources.nodes) {
    try {
      node.disconnect();
    } catch {}
  }
  void resources.context.close().catch(() => {});
  if (resources.url) revoke(resources.url);
}
