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
  range?: { sampleRate: number; minHz: number; maxHz: number },
): AudioFeatures {
  if (
    !time.length ||
    time.length > 32768 ||
    !frequency.length ||
    frequency.length > 32768
  )
    throw new Error("Invalid audio sample");
  let first = 0,
    last = frequency.length;
  if (range) {
    if (
      ![range.sampleRate, range.minHz, range.maxHz].every(Number.isFinite) ||
      range.sampleRate <= 0 ||
      range.minHz < 0 ||
      range.maxHz <= range.minHz ||
      range.maxHz > range.sampleRate / 2
    )
      throw new Error("Invalid frequency range");
    first = Math.min(
      frequency.length - 1,
      Math.floor((range.minHz / (range.sampleRate / 2)) * frequency.length),
    );
    last = Math.max(
      first + 1,
      Math.ceil((range.maxHz / (range.sampleRate / 2)) * frequency.length),
    );
  }
  let sum = 0;
  const wave = Array.from(time, (v) => (v - 128) / 128);
  for (const v of wave) sum += v * v;
  const bands = Array.from({ length: 32 }, (_, band) => {
    const start = first + Math.floor((band * (last - first)) / 32),
      end = Math.max(
        start + 1,
        first + Math.floor(((band + 1) * (last - first)) / 32),
      );
    let sum = 0;
    for (let i = start; i < end; i++)
      sum += (frequency[Math.min(i, frequency.length - 1)] ?? 0) / 255;
    return sum / (end - start);
  });
  return {
    volume: range
      ? Math.min(
          1,
          Math.sqrt(bands.reduce((sum, v) => sum + v * v, 0) / bands.length),
        )
      : Math.min(1, Math.sqrt(sum / time.length)),
    bands,
    wave,
  };
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
function probeAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const element = document.createElement("audio"),
      url = URL.createObjectURL(file);
    const cleanup = () => {
      element.removeEventListener("loadedmetadata", loaded);
      element.removeEventListener("error", failed);
      element.pause();
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(url);
    };
    const loaded = () => {
      const duration = element.duration;
      cleanup();
      resolve(duration);
    };
    const failed = () => {
      cleanup();
      reject(
        new Error("This audio format is unsupported or could not be decoded."),
      );
    };
    element.addEventListener("loadedmetadata", loaded);
    element.addEventListener("error", failed);
    element.preload = "metadata";
    try {
      element.src = url;
      element.load();
    } catch {
      failed();
    }
  });
}

function validateAudioDuration(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600)
    throw new Error("Choose audio up to 10 minutes long.");
}

export async function decodeAudioFile(
  file: File,
  context: AudioContext,
  probe: (file: File) => Promise<number> = probeAudioDuration,
) {
  validateAudioDuration(await probe(file));
  const bytes = await file.arrayBuffer();
  let buffer: AudioBuffer;
  try {
    buffer = await context.decodeAudioData(bytes);
  } catch {
    throw new Error(
      "This audio format is unsupported or could not be decoded.",
    );
  }
  validateAudioDuration(buffer.duration);
  return buffer;
}

/** Decoded PCM avoids silent MediaElementAudioSource output in WebKit. */
export class AudioFilePlayback {
  private source: AudioBufferSourceNode | null = null;
  private offset = 0;
  private startedAt = 0;
  constructor(
    private context: AudioContext,
    readonly buffer: AudioBuffer,
    private output: AudioNode,
    private onEnded: () => void,
  ) {}
  get position() {
    return Math.min(
      this.buffer.duration,
      this.offset +
        (this.source ? this.context.currentTime - this.startedAt : 0),
    );
  }
  play() {
    if (this.source) return;
    if (this.offset >= this.buffer.duration) this.offset = 0;
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.output);
    source.onended = () => {
      if (this.source !== source) return;
      source.disconnect();
      this.source = null;
      this.offset = this.buffer.duration;
      this.onEnded();
    };
    this.startedAt = this.context.currentTime;
    this.source = source;
    source.start(0, this.offset);
  }
  pause() {
    const source = this.source;
    if (!source) return;
    this.offset = this.position;
    this.source = null;
    source.onended = null;
    source.stop();
    source.disconnect();
  }
  seek(position: number) {
    if (!Number.isFinite(position)) return;
    const playing = !!this.source;
    this.pause();
    this.offset = Math.max(0, Math.min(position, this.buffer.duration));
    if (playing) {
      if (this.offset === this.buffer.duration) this.onEnded();
      else this.play();
    }
  }
}
export interface AudioResources {
  context: AudioContext;
  playback?: AudioFilePlayback;
  element?: HTMLAudioElement;
  stream?: MediaStream;
  url?: string;
  nodes: AudioNode[];
}
export function releaseAudio(
  resources: AudioResources,
  revoke: (url: string) => void = URL.revokeObjectURL,
) {
  resources.playback?.pause();
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

/** Normalized positive energy rise, used to accent beats without inventing tempo. */
export function beatResponse(
  energy: number,
  baseline: number,
  sensitivity: number,
) {
  return Math.max(0, Math.min(1, (energy - baseline * 1.15) * sensitivity * 3));
}
