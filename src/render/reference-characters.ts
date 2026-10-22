/** Versioned reference Characters contracts. Numeric rendering belongs to Rust.
 * Glyph layers are intermediate; project binding requires complete Rust context v1.
 */
import { graphemes } from "@/core/document";
import { validateRenderProject } from "./project";
import { initialCatalogRegistry } from "./catalog/initial-schemas";
import { readReferenceCalibrationIdentity } from "./glyph-calibration";
import { MAX_BACKING_PIXELS, MAX_BACKING_SIDE } from "@/core/render";
import {
  DEFAULT_MEMORY_BUDGET_BYTES,
  MAX_CHARACTER_CELLS,
  MAX_SOURCE_DIMENSION,
  TRANSPARENT_GLYPH_INDEX,
  validateGlyphCalibration,
  validateGrid,
  type GlyphCalibrationV1,
  type PackedGlyphGrid,
  type SourceRef,
} from "./character-contract";

export interface ReferenceCharacterAtlasV1 {
  version: 1;
  calibration: GlyphCalibrationV1;
  originX: number;
  originY: number;
  placement: "top-start-ltr";
  ordering: "input";
  fontPolicy: "reference-system-monospace" | "verified-family";
  /** Exactly the literal U+0020 entry, or the transparent sentinel when absent. */
  spaceIndexOr65535: number;
}
export interface ReferenceCharactersSettingsV1 {
  version: 1;
  frameWidth: number;
  frameHeight: number;
  fontSize: number;
  renderScale: 1 | 2 | 3 | 4;
  brightness: number;
  contrast: number;
  crop: { x: number; y: number; width: number; height: number };
  rotation: 0 | 90 | 180 | 270;
  backdrop: "none" | "solid" | "blur";
}
export interface ReferenceCharactersFrameV1 {
  version: 1;
  width: number;
  height: number;
  rgba: Uint8Array;
  grid: PackedGlyphGrid | null;
}
export interface ReferenceGlyphLayerV1 extends ReferenceCharactersFrameV1 {
  kind: "reference-glyph-layer";
}
/** Frozen profile version, not extra project controls or a capability claim. */
export const REFERENCE_CHARACTERS_CONTEXT_V1 = Object.freeze({
  version: 1,
  defaultsVersion: 1,
  mode: "characters",
  darkThreshold: 30,
  edgeEmphasis: 0,
  coverage: 100,
  charOpacity: 100,
  invert: false,
  randomChars: false,
  blend: "source-over",
  depth: false,
  lights: false,
  animation: false,
  glyphBloom: false,
  chroma: false,
  bitmap: false,
  grading: false,
  overlay: false,
  levels: false,
  curves: false,
  postEffects: false,
  text: false,
  masks: false,
  glyphOffsetX: 0,
  glyphOffsetY: 0,
  glyphScale: 1,
  bgMode: "blur",
  bgBlur: 8,
  bgOpacity: 100,
  bgSolidColor: "#000000",
} as const);
export type ReferenceCharactersContextV1 =
  typeof REFERENCE_CHARACTERS_CONTEXT_V1;
const ATLAS_LIMIT = 16 * 1024 * 1024;
type Fields = Record<string, unknown>;
function fail(field: string): never {
  throw new Error(`Invalid reference Characters ${field}`);
}
function object(value: unknown, keys: string): Fields {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("object");
  const s = value as Fields,
    allowed = keys.split(" ");
  if (
    Reflect.ownKeys(s).some(
      (k) => typeof k !== "string" || !allowed.includes(k),
    ) ||
    allowed.some((k) => !Object.hasOwn(s, k))
  )
    fail("fields");
  return s;
}
function number(
  value: unknown,
  min: number,
  max: number,
  field: string,
  integer = false,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    fail(field);
  return value;
}
function strictSettings(value: unknown): ReferenceCharactersSettingsV1 {
  const s = object(
    value,
    "version frameWidth frameHeight fontSize renderScale brightness contrast crop rotation backdrop",
  );
  if (s.version !== 1) fail("version");
  const w = number(s.frameWidth, 1, MAX_BACKING_SIDE, "frameWidth", true),
    h = number(s.frameHeight, 1, MAX_BACKING_SIDE, "frameHeight", true);
  if (w * h > MAX_BACKING_PIXELS) fail("backing pixels");
  number(s.fontSize, 3, 80, "fontSize");
  number(s.brightness, -100, 100, "brightness");
  number(s.contrast, -100, 100, "contrast");
  if (![1, 2, 3, 4].includes(s.renderScale as number)) fail("renderScale");
  if (![0, 90, 180, 270].includes(s.rotation as number)) fail("rotation");
  if (!["none", "solid", "blur"].includes(s.backdrop as string))
    fail("backdrop");
  const c = object(s.crop, "x y width height");
  const x = number(c.x, 0, 1, "crop.x"),
    y = number(c.y, 0, 1, "crop.y"),
    cw = number(c.width, Number.MIN_VALUE, 1, "crop.width"),
    ch = number(c.height, Number.MIN_VALUE, 1, "crop.height");
  if (x + cw > 1 || y + ch > 1) fail("crop extent");
  const settings = value as ReferenceCharactersSettingsV1;
  const [columns, rows] = gridSize(settings);
  if (columns * rows > MAX_CHARACTER_CELLS) fail("cell count");
  return settings;
}
function gridSize(s: ReferenceCharactersSettingsV1): [number, number] {
  return [
    Math.floor(s.frameWidth / (0.6 * s.fontSize * s.renderScale)),
    Math.floor(s.frameHeight / (s.fontSize * s.renderScale)),
  ];
}
/** Pure geometry and limits validation; does not sample source or render pixels. */
export function validateReferenceCharactersSettings(
  value: unknown,
  source: SourceRef,
  maxBytes = DEFAULT_MEMORY_BUDGET_BYTES,
): ReferenceCharactersSettingsV1 {
  const s = strictSettings(value),
    src = object(source, "id revision width height");
  if (typeof src.id !== "string" || !src.id.trim()) fail("source id");
  number(src.revision, 0, Number.MAX_SAFE_INTEGER, "source revision", true);
  const width = number(
      src.width,
      1,
      MAX_SOURCE_DIMENSION,
      "source width",
      true,
    ),
    height = number(src.height, 1, MAX_SOURCE_DIMENSION, "source height", true);
  const sourceBytes = width * height * 4;
  if (sourceBytes > DEFAULT_MEMORY_BUDGET_BYTES) fail("source budget");
  const c = s.crop,
    left = Math.min(width, Math.floor(c.x * width)),
    top = Math.min(height, Math.floor(c.y * height));
  const cropWidth = Math.min(width, Math.ceil((c.x + c.width) * width)) - left,
    cropHeight = Math.min(height, Math.ceil((c.y + c.height) * height)) - top;
  if (cropWidth <= 0 || cropHeight <= 0) fail("empty crop extent");
  const swapped = s.rotation === 90 || s.rotation === 270;
  if (
    s.frameWidth !==
      Math.max(
        1,
        Math.round((swapped ? cropHeight : cropWidth) * s.renderScale),
      ) ||
    s.frameHeight !==
      Math.max(
        1,
        Math.round((swapped ? cropWidth : cropHeight) * s.renderScale),
      )
  )
    fail("source-derived frame");
  const [columns, rows] = gridSize(s);
  // Output + serialization + packed grid. Atlas and other retained jobs are admitted separately.
  const peak =
    sourceBytes + s.frameWidth * s.frameHeight * 8 + columns * rows * 28 + 4096;
  if (peak > number(maxBytes, 1, DEFAULT_MEMORY_BUDGET_BYTES, "budget", true))
    fail("frame budget");
  return s;
}
export function validateReferenceCharactersContext(
  value: unknown,
): ReferenceCharactersContextV1 {
  const s = object(
    value,
    Object.keys(REFERENCE_CHARACTERS_CONTEXT_V1).join(" "),
  );
  for (const [key, expected] of Object.entries(REFERENCE_CHARACTERS_CONTEXT_V1))
    if (s[key] !== expected) fail(`context.${key}`);
  return value as ReferenceCharactersContextV1;
}
export function validateReferenceCharacterAtlas(
  value: unknown,
): ReferenceCharacterAtlasV1 {
  const a = object(
    value,
    "version calibration originX originY placement ordering fontPolicy spaceIndexOr65535",
  );
  if (
    a.version !== 1 ||
    a.placement !== "top-start-ltr" ||
    a.ordering !== "input" ||
    !["reference-system-monospace", "verified-family"].includes(
      a.fontPolicy as string,
    )
  )
    fail("atlas profile");
  const c = validateGlyphCalibration(a.calibration);
  number(a.originX, -c.maskWidth, c.maskWidth, "originX");
  number(a.originY, -c.maskHeight, c.maskHeight, "originY");
  const space = number(
      a.spaceIndexOr65535,
      0,
      TRANSPARENT_GLYPH_INDEX,
      "spaceIndexOr65535",
      true,
    ),
    actual = c.glyphs.indexOf(" ");
  if (space !== (actual < 0 ? TRANSPARENT_GLYPH_INDEX : actual))
    fail("literal space correspondence");
  // Backing buffers count, including oversized views; shared backing counts once.
  const bytes = [
    ...new Set([c.masks.buffer, c.coverage.buffer, c.shapes.buffer]),
  ].reduce((sum, buffer) => sum + buffer.byteLength, 0);
  if (bytes > ATLAS_LIMIT) fail("atlas budget");
  return value as ReferenceCharacterAtlasV1;
}
function frame(
  value: unknown,
  settings: ReferenceCharactersSettingsV1,
  atlas: ReferenceCharacterAtlasV1,
  source: SourceRef,
  intermediate: boolean,
): ReferenceCharactersFrameV1 {
  const f = object(
      value,
      `version width height rgba grid${intermediate ? " kind" : ""}`,
    ),
    s = validateReferenceCharactersSettings(settings, source),
    a = validateReferenceCharacterAtlas(atlas);
  if (
    intermediate &&
    (f.kind !== "reference-glyph-layer" || s.backdrop !== "none")
  )
    fail("glyph-layer context");
  if (
    f.version !== 1 ||
    f.width !== s.frameWidth ||
    f.height !== s.frameHeight ||
    !(f.rgba instanceof Uint8Array) ||
    f.rgba.length !== s.frameWidth * s.frameHeight * 4
  )
    fail("frame");
  const buffers = new Set<ArrayBufferLike>([
    f.rgba.buffer,
    a.calibration.masks.buffer,
    a.calibration.coverage.buffer,
    a.calibration.shapes.buffer,
  ]);
  const [columns, rows] = gridSize(s);
  if (columns === 0 || rows === 0) {
    if (f.grid !== null) fail("empty grid");
    if (intermediate && f.rgba.some((v) => v !== 0))
      fail("painted empty glyph layer");
  } else {
    if (f.grid === null) fail("missing grid");
    const g = f.grid as PackedGlyphGrid;
    validateGrid(g, a.calibration);
    for (const array of [g.glyphIndices, g.foreground, g.background, g.alpha])
      buffers.add(array.buffer);
    if (
      g.width !== columns ||
      g.height !== rows ||
      Math.abs(g.cellWidth - 0.6 * s.fontSize * s.renderScale) > 1e-10 ||
      Math.abs(g.cellHeight - s.fontSize * s.renderScale) > 1e-10
    )
      fail("grid geometry");
    for (const index of g.glyphIndices)
      if (index === a.spaceIndexOr65535 && index !== TRANSPARENT_GLYPH_INDEX)
        fail("unskipped ordinary space");
    if (g.background.some((v) => v !== 0)) fail("glyph-layer background");
  }
  if (
    [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0) >
    DEFAULT_MEMORY_BUDGET_BYTES
  )
    fail("result backing budget");
  return value as ReferenceCharactersFrameV1;
}
export function validateReferenceCharactersFrame(
  value: unknown,
  settings: ReferenceCharactersSettingsV1,
  atlas: ReferenceCharacterAtlasV1,
  source: SourceRef,
): ReferenceCharactersFrameV1 {
  return frame(value, settings, atlas, source, false);
}
export function validateReferenceGlyphLayer(
  value: unknown,
  settings: ReferenceCharactersSettingsV1,
  atlas: ReferenceCharacterAtlasV1,
  source: SourceRef,
): ReferenceGlyphLayerV1 {
  return frame(value, settings, atlas, source, true) as ReferenceGlyphLayerV1;
}

/** Canonical arithmetic shared by calibration callers and the project adapter.
 * Font pixels use F*S; Rust cell width deliberately uses (.6*F)*S.
 */
export function prepareCharactersGeometry(
  fontSize: number,
  scale: 1 | 2 | 3 | 4,
) {
  number(fontSize, 3, 80, "fontSize");
  if (![1, 2, 3, 4].includes(scale)) fail("renderScale");
  return {
    fontPixelSize: fontSize * scale,
    cellWidth: 0.6 * fontSize * scale,
    cellHeight: fontSize * scale,
  };
}
export interface CharactersProjectResources {
  source: SourceRef | null;
  calibrationId: string | null;
  fontFamily: string | null;
  fontRevision: string | null;
  charactersProfileVersion: 1 | null;
  charactersContextVersion: 1 | null;
  /** Configured session budget; worker admission still includes other live jobs. */
  memoryBudgetBytes: number;
}
export interface PreparedCharactersProject {
  source: SourceRef;
  sourceId: string;
  sourceRevision: number;
  calibrationId: string;
  settings: ReferenceCharactersSettingsV1;
  context: ReferenceCharactersContextV1;
  binding: { dispatchId: number; backend: "rust-cpu" };
}
/** Strict four-control project binding. Caller owns jobId/revision/timeUs, uploads
 * and invokes renderCharactersPreview/Export; this function never renders in JS.
 */
export function prepareCharactersProject(
  project: unknown,
  scale: 1 | 2 | 3 | 4,
  atlas: ReferenceCharacterAtlasV1,
  resources: CharactersProjectResources,
): PreparedCharactersProject {
  if (arguments.length !== 4) fail("adapter arguments");
  const p = validateRenderProject(project);
  if (p.style.id !== "characters") fail("unsupported style");
  if (p.effects.length)
    fail("unsupported effects (including disabled effects)");
  if (p.masks.length) fail("unsupported masks");
  if (p.text.length) fail("unsupported text");
  if (!p.source) fail("missing project source");
  if (!resources || resources.charactersProfileVersion !== 1)
    fail("missing WASM profile capability");
  if (resources.charactersContextVersion !== 1)
    fail("missing complete context capability");
  const source = p.source,
    retained = resources.source;
  if (
    !retained ||
    retained.id !== source.id ||
    retained.revision !== source.revision ||
    retained.width !== source.width ||
    retained.height !== source.height
  )
    fail("missing or mismatched source resource");
  const a = validateReferenceCharacterAtlas(atlas),
    c = a.calibration;
  if (resources.calibrationId !== c.id)
    fail("missing or mismatched atlas resource");
  const font = readReferenceCalibrationIdentity(a);
  const { fontSize, charSet, brightness, contrast } = p.style.parameters as {
    fontSize: number;
    charSet: string;
    brightness: number;
    contrast: number;
  };
  const geometry = prepareCharactersGeometry(fontSize, scale);
  if (
    !resources.fontFamily ||
    resources.fontRevision === null ||
    font.fontFamily !== resources.fontFamily ||
    font.fontRevision !== resources.fontRevision ||
    font.fontPixelSize !== geometry.fontPixelSize
  )
    fail("missing or mismatched measured font resource");
  if (
    c.cellWidth !== geometry.cellWidth ||
    c.cellHeight !== geometry.cellHeight
  )
    fail("atlas geometry");
  const glyphs = graphemes(charSet);
  if (
    glyphs.length !== c.glyphs.length ||
    glyphs.some((g, i) => g !== c.glyphs[i])
  )
    fail("atlas ramp order");
  const crop = p.crop,
    left = Math.floor(crop.x * source.width),
    top = Math.floor(crop.y * source.height),
    width =
      Math.min(source.width, Math.ceil((crop.x + crop.width) * source.width)) -
      left,
    height =
      Math.min(
        source.height,
        Math.ceil((crop.y + crop.height) * source.height),
      ) - top,
    swapped = p.rotation === 90 || p.rotation === 270;
  const settings = validateReferenceCharactersSettings(
    {
      version: 1,
      frameWidth: Math.max(1, Math.round((swapped ? height : width) * scale)),
      frameHeight: Math.max(1, Math.round((swapped ? width : height) * scale)),
      fontSize,
      renderScale: scale,
      brightness,
      contrast,
      crop: { ...crop },
      rotation: p.rotation,
      backdrop: "blur",
    },
    source,
    resources.memoryBudgetBytes,
  );
  const [columns, rows] = gridSize(settings);
  const atlasBytes = [
    ...new Set([c.masks.buffer, c.coverage.buffer, c.shapes.buffer]),
  ].reduce((sum, b) => sum + b.byteLength, 0);
  // Complete context reserves 48 bytes/pixel, rather than the glyph-only 8.
  // Existing jobs/stages/capacity surplus remain authoritative worker checks.
  const peak =
    source.width * source.height * 4 +
    atlasBytes +
    settings.frameWidth * settings.frameHeight * 48 +
    columns * rows * 28 +
    4096;
  if (
    peak >
    number(
      resources.memoryBudgetBytes,
      1,
      DEFAULT_MEMORY_BUDGET_BYTES,
      "complete frame budget",
      true,
    )
  )
    fail("complete frame budget");
  const binding = initialCatalogRegistry.getStyle("characters")?.binding;
  if (!binding || binding.dispatchId !== 1 || binding.backend !== "rust-cpu")
    fail("catalog binding");
  return {
    source: { ...source },
    sourceId: source.id,
    sourceRevision: source.revision,
    calibrationId: c.id,
    settings,
    context: REFERENCE_CHARACTERS_CONTEXT_V1,
    binding: { ...binding, backend: "rust-cpu" },
  };
}
