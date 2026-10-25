import { initialCatalogRegistry } from "@/render/catalog/initial-schemas";
import type { RenderProjectV1 } from "@/render/project";
import {
  validateStyleSettings,
  type StyleSettingsV1,
} from "@/render/style-contract";

/** Internal service capability. Catalog readiness is reserved for Task 18. */
export const STUDIO_STYLE_IDS = ["characters", "pixel", "mosaic"] as const;
export type StudioStyleId = (typeof STUDIO_STYLE_IDS)[number];
export function isStudioStyleId(id: string): id is StudioStyleId {
  return (STUDIO_STYLE_IDS as readonly string[]).includes(id);
}

export function switchStyle(
  previous: RenderProjectV1["style"],
  id: string,
): RenderProjectV1["style"] {
  if (!isStudioStyleId(id)) throw new Error(`Studio style ${id} unavailable`);
  const from = initialCatalogRegistry.getStyle(previous.id);
  const to = initialCatalogRegistry.getStyle(id)!;
  const parameters = initialCatalogRegistry.styleDefaults(id);
  if (from)
    for (const [key, value] of Object.entries(previous.parameters)) {
      // Same key is insufficient: the rule must have the same accepted domain.
      if (
        key in to.rules &&
        JSON.stringify(from.rules[key]) === JSON.stringify(to.rules[key])
      )
        parameters[key] = value;
    }
  return {
    id,
    parameters: initialCatalogRegistry.validateStyle(id, parameters),
  };
}

/** Raster family binder. Preserves project data upstream; refuses any unsupported operation. */
export function bindStyleProject(
  project: RenderProjectV1,
  scale: 1 | 2 | 3 | 4,
): StyleSettingsV1 {
  if (project.style.id !== "pixel" && project.style.id !== "mosaic")
    throw new Error("Studio raster style unavailable");
  if (
    project.effects.some((effect) => effect.enabled) ||
    project.masks.length ||
    project.text.length
  )
    throw new Error("Unsupported active operations in Studio raster binding");
  if (!project.source) throw new Error("A committed source is required");
  const p = project,
    ref = project.source,
    crop = p.crop;
  const width =
    Math.min(ref.width, Math.ceil((crop.x + crop.width) * ref.width)) -
    Math.floor(crop.x * ref.width);
  const height =
    Math.min(ref.height, Math.ceil((crop.y + crop.height) * ref.height)) -
    Math.floor(crop.y * ref.height);
  const swapped = p.rotation === 90 || p.rotation === 270;
  return validateStyleSettings(
    {
      version: 1,
      styleId: p.style.id,
      frameWidth: (swapped ? height : width) * scale,
      frameHeight: (swapped ? width : height) * scale,
      renderScale: scale,
      crop: { ...crop },
      rotation: p.rotation,
      seed: p.seed,
      timeUs: p.timeUs,
      parameters: p.style.parameters,
    },
    ref,
  );
}
