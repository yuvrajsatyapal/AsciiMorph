import { readCustomTemplates, type CustomTemplate } from "@/gallery/catalog";
import { generate, type GeneratorSettings } from "@/creative/generators";
const TEMPLATES = "asciimorph.gallery.templates.v1";
const FAVORITES = "asciimorph.gallery.favorites.v1";
const PRESETS = "asciimorph-workspace:generator.presets";
type Preset = { name: string; settings: GeneratorSettings };
function presets(raw: string): Preset[] {
  const entries: unknown = JSON.parse(raw);
  if (!Array.isArray(entries) || entries.length > 50)
    throw new Error("Invalid generator preset collection.");
  return entries.map((entry: Preset) => {
    if (
      !entry ||
      typeof entry.name !== "string" ||
      !entry.name.trim() ||
      entry.name.length > 120 ||
      !entry.settings
    )
      throw new Error("Invalid generator preset.");
    const s = entry.settings;
    if (
      !Number.isInteger(s.width) ||
      !Number.isInteger(s.height) ||
      s.width < 1 ||
      s.height < 1 ||
      s.width > 300 ||
      s.height > 300 ||
      s.width * s.height > 60000
    )
      throw new Error("Invalid generator preset dimensions.");
    generate({ ...s, width: 1, height: 1 });
    return entry;
  });
}
function favorites(raw: string): string[] {
  const entries: unknown = JSON.parse(raw);
  if (
    !Array.isArray(entries) ||
    entries.length > 500 ||
    entries.some(
      (entry) =>
        typeof entry !== "string" ||
        !/^(template|project|custom):[a-zA-Z0-9_-]{1,128}$/.test(entry),
    )
  )
    throw new Error("Invalid gallery favorites.");
  return entries;
}
export function validateBackupPreference(key: string, raw: string) {
  if (key === TEMPLATES) readCustomTemplates({ getItem: () => raw });
  else if (key === PRESETS) presets(raw);
  else if (key === FAVORITES) favorites(raw);
  else if (key === "asciimorph-workspace:audio.cues") {
    const cues: unknown = JSON.parse(raw);
    if (
      !Array.isArray(cues) ||
      cues.length > 100 ||
      cues.some(
        (cue) =>
          !cue ||
          typeof cue.time !== "number" ||
          !Number.isFinite(cue.time) ||
          cue.time < 0 ||
          !["bars", "rings", "wave"].includes(cue.mode),
      )
    )
      throw new Error("Invalid audio timeline cues.");
  } else JSON.parse(raw);
}
/** Build the complete merge before writing projects; collection limits never silently drop work. */
export function prepareBackupPreferences(
  source: Record<string, string>,
  keys: Map<string, string>,
) {
  const writes = new Map<string, string>(),
    customKeys = new Map<string, string>();
  for (const [key, raw] of Object.entries(source)) {
    if (key === FAVORITES) continue;
    const existing = localStorage.getItem(key);
    if (key === TEMPLATES) {
      const current = readCustomTemplates({ getItem: () => existing });
      const incoming = readCustomTemplates({ getItem: () => raw });
      const combined: CustomTemplate[] = [...current];
      for (const entry of incoming) {
        const collision = combined.find((item) => item.id === entry.id);
        if (collision && JSON.stringify(collision) === JSON.stringify(entry)) {
          customKeys.set(entry.id, entry.id);
          continue;
        }
        const id = collision ? crypto.randomUUID() : entry.id;
        customKeys.set(entry.id, id);
        combined.push({ ...entry, id });
      }
      const serialized = JSON.stringify(combined);
      readCustomTemplates({ getItem: () => serialized });
      writes.set(key, serialized);
    } else if (key === PRESETS) {
      const combined = existing === null ? [] : presets(existing);
      for (const entry of presets(raw)) {
        if (
          combined.some(
            (item) => JSON.stringify(item) === JSON.stringify(entry),
          )
        )
          continue;
        const name = combined.some((item) => item.name === entry.name)
          ? `${entry.name.slice(0, 109)} imported`
          : entry.name;
        combined.push({ ...entry, name });
      }
      const serialized = JSON.stringify(combined);
      presets(serialized);
      writes.set(key, serialized);
    } else if (existing === null) writes.set(key, raw);
  }
  if (source[FAVORITES]) {
    const imported = favorites(source[FAVORITES]).map((key) => {
      if (key.startsWith("project:"))
        return (
          keys
            .get(`artwork:${key.slice(8)}`)
            ?.replace(/^artwork:/, "project:") || key
        );
      if (key.startsWith("custom:"))
        return `custom:${customKeys.get(key.slice(7)) || key.slice(7)}`;
      return key;
    });
    const combined = JSON.stringify([
      ...new Set([
        ...favorites(localStorage.getItem(FAVORITES) || "[]"),
        ...imported,
      ]),
    ]);
    favorites(combined);
    writes.set(FAVORITES, combined);
  }
  return writes;
}
