import {
  encodePixels,
  gridDimensions,
  transformedSize,
  type Pixels,
} from "@/converter/engine";
import { characterSet } from "@/converter/presets";
import {
  validateSettings,
  type ConversionSettings,
} from "@/converter/settings";
import {
  createDocument,
  validateDocument,
  type AsciiDocument,
  type Cell,
} from "@/core/document";
import {
  MAX_SOURCE_DIMENSION,
  TRANSPARENT_GLYPH_INDEX,
  validateCharacterSettings,
  validateGrid,
  type CharacterSettingsV1,
  type GlyphCalibrationV1,
  type PackedGlyphGrid,
  type SourceRef,
} from "./character-contract";

/** Converts legacy controls (neutral contrast is zero) without retaining any pixels. */
export function legacySettingsToCharacter(
  settings: ConversionSettings,
  source: SourceRef,
): CharacterSettingsV1 {
  validateSettings(settings);
  characterSet(settings.charset, settings.custom);
  if (
    !source ||
    typeof source.id !== "string" ||
    !source.id.trim() ||
    !Number.isSafeInteger(source.revision) ||
    source.revision < 0 ||
    ![source.width, source.height].every(
      (v) => Number.isSafeInteger(v) && v > 0 && v <= MAX_SOURCE_DIMENSION,
    )
  ) {
    throw new Error("Invalid source reference");
  }
  const size = transformedSize(source, settings);
  const { width, height } = gridDimensions(size.width, size.height, settings);
  return validateCharacterSettings({
    version: 1,
    width,
    height,
    cellWidth: settings.cellWidth,
    cellHeight: settings.cellHeight,
    crop: { ...(settings.crop ?? { x: 0, y: 0, width: 1, height: 1 }) },
    rotation: settings.rotation ?? 0,
    brightness: settings.brightness,
    contrast: settings.contrast,
    gamma: settings.gamma,
    saturation: settings.saturation,
    density: settings.density,
    sharpness: settings.sharpness,
    edge: settings.edge,
    shapeAware: settings.shapeAware ?? false,
    smartEdges: settings.smartEdges ?? false,
    mappingInvert: settings.invert,
    outputInvert: false,
    mode: settings.mode,
    fg: parseInt(settings.fg.slice(1), 16),
    bg: settings.bg === null ? null : parseInt(settings.bg.slice(1), 16),
    mapping: settings.charset === "braille" ? "braille" : "glyph",
    dither: settings.dithering ? "floyd-steinberg" : "none",
    seed: 0,
  });
}
function rgb(bytes: Uint8Array, i: number): string {
  return `#${bytes[i].toString(16).padStart(2, "0")}${bytes[i + 1].toString(16).padStart(2, "0")}${bytes[i + 2].toString(16).padStart(2, "0")}`;
}
/**
 * Explicit editor/text handoff: materializes logical cells only. The legacy editor
 * uses its IBM Plex Mono font at its default size; it cannot retain calibrated
 * font/mask identity. Use packed painting for calibrated preview pixel fidelity.
 * Empty calibrationId means raw Braille dot masks, independent of any supplied
 * glyph dictionary. Independent background opacity is retained in a lower layer.
 */
export function gridToDocument(
  grid: PackedGlyphGrid,
  calibration: GlyphCalibrationV1 | undefined,
  name: string,
): AsciiDocument {
  if (grid.calibrationId && !calibration)
    throw new Error("Glyph calibration is required for legacy handoff");
  validateGrid(grid, grid.calibrationId ? calibration : undefined);
  if (grid.width > 300 || grid.height > 300)
    throw new Error(
      "Legacy documents support at most 300 cells per side; packed grid cannot be handed off without resizing",
    );
  const doc = createDocument(grid.width, grid.height, name);
  doc.cellWidth = grid.cellWidth;
  doc.cellHeight = grid.cellHeight;
  const separateBackground = grid.alpha.some(
    (alpha, i) =>
      grid.background[i * 4 + 3] > 0 &&
      grid.background[i * 4 + 3] / 255 !== alpha,
  );
  const cells: Cell[] = Array.from(grid.glyphIndices, (index, i) => ({
    char:
      index === TRANSPARENT_GLYPH_INDEX
        ? " "
        : grid.calibrationId
          ? calibration!.glyphs[index]
          : String.fromCodePoint(0x2800 + index),
    fg: rgb(grid.foreground, i * 4),
    bg:
      !separateBackground && grid.background[i * 4 + 3] > 0
        ? rgb(grid.background, i * 4)
        : null,
    alpha: grid.alpha[i],
  }));
  doc.layers[0].cells = cells;
  if (separateBackground) {
    doc.layers.unshift({
      id: crypto.randomUUID(),
      name: "Packed background",
      visible: true,
      locked: false,
      opacity: 1,
      cells: Array.from(grid.alpha, (_, i) => ({
        char: " ",
        fg: "#000000",
        bg: grid.background[i * 4 + 3] > 0 ? rgb(grid.background, i * 4) : null,
        alpha: grid.background[i * 4 + 3] / 255,
      })),
    });
    doc.activeLayerId = doc.layers[1].id;
  }
  return doc;
}
/** Retains the original legacy base64 pixel format only on explicit editor handoff. */
export function attachLegacySource(
  doc: AsciiDocument,
  source: Pixels,
  settings: ConversionSettings,
): AsciiDocument {
  validateSettings(settings);
  if (
    !source ||
    ![source.width, source.height].every(
      (v) => Number.isInteger(v) && v >= 1 && v <= 2048,
    ) ||
    source.width * source.height > 4_194_304 ||
    !(source.data instanceof Uint8ClampedArray) ||
    source.data.length !== source.width * source.height * 4
  ) {
    throw new Error(
      "Invalid or oversized legacy source pixel buffer (maximum 2048 per side)",
    );
  }
  const valid = validateDocument(doc);
  return {
    ...valid,
    conversion: {
      source: {
        width: source.width,
        height: source.height,
        data: encodePixels(source.data),
      },
      settings: structuredClone(settings),
    },
  };
}
