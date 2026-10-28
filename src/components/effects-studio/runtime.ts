import {
  createStillImageExporter,
  encoderReservationBytes,
  type StillImageBoundaries,
} from "@/render/export/still-image";
import { initialCatalogRegistry } from "@/render/catalog/initial-schemas";
import {
  DEFAULT_MEMORY_BUDGET_BYTES,
  type SourceUpload,
} from "@/render/character-contract";
import {
  calibrateReferenceCharacters,
  REFERENCE_MONOSPACE_STACK,
  type ReferenceCharacterCalibrationInput,
} from "@/render/glyph-calibration";
import {
  createSourceTransaction,
  type SourceCandidate,
} from "@/render/media/source-transaction";
import {
  decodeOwnedDefault,
  decodeStillFile,
  type DecodeOptions,
  type DecodedStill,
} from "@/render/media/still-source";
import {
  prepareCharactersGeometry,
  validateReferenceCharactersSettings,
  type ReferenceCharactersSettingsV1,
  prepareCharactersProject,
  type ReferenceCharacterAtlasV1,
  type ReferenceCharactersFrameV1,
} from "@/render/reference-characters";
import {
  createRenderService,
  type RenderService,
  type CharactersRenderRequest,
  type StyleRenderRequest,
} from "@/render/service";
import type { RgbaFrameV1, StyleSettingsV1 } from "@/render/style-contract";
import type { ThumbnailRenderRequest } from "@/render/protocol";
import type { RenderProjectV1 } from "@/render/project";
import {
  createThumbnailScheduler,
  type ThumbnailKey,
} from "@/render/thumbnail-scheduler";
import { bindStyleProject } from "./style-adapter";
import {
  createStudioController,
  type StudioRequest,
  type PreparedResources,
  type PaintedIdentity,
  type StillExportOptions,
} from "./controller";

export type AcceptedStudioFrame = Readonly<{
  identity: PaintedIdentity;
  frame: RgbaFrameV1;
}>;
export type StudioRuntimeOptions = {
  project?: unknown;
  /** Injectable browser encoder boundary; production uses native canvas/URL APIs. */
  encoder?: Partial<Omit<StillImageBoundaries, "reserve">>;
  createService?: () => RenderService;
  calibrate?: (
    input: ReferenceCharacterCalibrationInput,
    signal?: AbortSignal,
  ) => Promise<ReferenceCharacterAtlasV1>;
  decodeFile?: (file: File, options: DecodeOptions) => Promise<DecodedStill>;
  decodeDefault?: (options: DecodeOptions) => Promise<DecodedStill>;
  createId?: () => string;
  /** Retired mount cleanup must settle before another source decode allocates. */
  sourceAdmission?: Promise<void>;
};
const FONT_REVISION = "studio-reference-system-v1";
const cancelled = () =>
  new DOMException("Studio operation aborted", "AbortError");
/** Construct in a committed mount. The service defaults to the real module
 * worker; only browser/native boundaries are injectable for unit tests. */
export function createStudioRuntime(options: StudioRuntimeOptions = {}) {
  const createService = options.createService ?? createRenderService;
  let service = createService();
  let unsubscribeCapability = () => {};
  let disposed = false;
  let disposal: Promise<void> | undefined;
  const serviceDisposals = new WeakMap<RenderService, Promise<void>>();
  function closeService(current: RenderService): Promise<void> {
    const prior = serviceDisposals.get(current);
    if (prior) return prior;
    const closing = Promise.resolve().then(() => current.dispose());
    serviceDisposals.set(current, closing);
    return closing;
  }
  let serviceGeneration = 0;
  let atlasGeneration = 0;
  let latestPrepare = 0;
  let latestPreview = 0;
  let currentResources: PreparedResources | null = null;
  let measured: { key: string; atlas: ReferenceCharacterAtlasV1 } | undefined;
  let prepared:
    | {
        jobId: number;
        atlas?: ReferenceCharacterAtlasV1;
        identity: PreparedResources;
        service: RenderService;
        serviceGeneration: number;
      }
    | undefined;
  let original: SourceUpload | null = null;
  let uploaded: SourceUpload | null = null;
  let accepted: AcceptedStudioFrame | null = null;
  let hoverFrame: RgbaFrameV1 | null = null;
  let hoverStyleId: string | null = null;
  let hoverSequence = 0;
  let hoverAbort: AbortController | undefined;
  let hoverRevision = 0;
  let thumbnailSequence = 0;
  let lastThumbnailSignature = "";
  let thumbnailReservation = 0;
  const thumbnailInputs = new Map<
    string,
    {
      request: ThumbnailRenderRequest;
      atlas?: ReferenceCharacterAtlasV1;
      live: number;
      retired: boolean;
      started: boolean;
    }
  >();
  let staged:
    | (AcceptedStudioFrame & { jobId: number; release(): void })
    | null = null;
  let encoderBytes = 0;
  let downloadBytes = 0,
    downloadCount = 0;
  let captureAdmission: (() => void) | undefined;
  // One captured Characters atlas can outlive preview selection through a
  // noncancellable encoder. This slot follows the existing single capture lease.
  let capturedAtlas: ReferenceCharacterAtlasV1 | undefined;
  let captureActive = false;
  let captureRelease: Promise<void> | undefined;
  const captures = new Set<RgbaFrameV1>();
  const canvases = new Set<{ width: number; height: number }>();
  const listeners = new Set<() => void>();
  const check = (signal?: AbortSignal) => {
    if (disposed || signal?.aborted) throw cancelled();
  };
  function heldFrameBytes() {
    const backings = new Set<ArrayBufferLike>();
    for (const value of [
      accepted?.frame,
      staged?.frame,
      hoverFrame,
      ...captures,
    ]) {
      if (!value) continue;
      backings.add(value.rgba.buffer);
      if ("grid" in value && value.grid)
        for (const a of [
          (value.grid as NonNullable<ReferenceCharactersFrameV1["grid"]>)
            .glyphIndices,
          (value.grid as NonNullable<ReferenceCharactersFrameV1["grid"]>)
            .foreground,
          (value.grid as NonNullable<ReferenceCharactersFrameV1["grid"]>)
            .background,
          (value.grid as NonNullable<ReferenceCharactersFrameV1["grid"]>).alpha,
        ])
          backings.add(a.buffer);
    }
    return (
      encoderBytes +
      downloadBytes +
      thumbnailReservation +
      (thumbnailScheduler?.usage().cachedBytes ?? 0) +
      [...backings].reduce((sum, b) => sum + b.byteLength, 0) +
      [...canvases].reduce((sum, c) => sum + c.width * c.height * 4, 0)
    );
  }
  function atlasResourceBytes(extra?: ReferenceCharacterAtlasV1) {
    const locals = [
      ...new Set(
        [
          measured?.atlas,
          capturedAtlas,
          extra,
          ...[...thumbnailInputs.values()].map((entry) => entry.atlas),
        ].filter((a): a is ReferenceCharacterAtlasV1 => !!a),
      ),
    ];
    const originalBackings = new Set<ArrayBufferLike>();
    const localSnapshots = new Map<string, number>();
    for (const atlas of locals) {
      const backings = new Set([
        atlas.calibration.masks.buffer,
        atlas.calibration.coverage.buffer,
        atlas.calibration.shapes.buffer,
      ]);
      for (const backing of backings) originalBackings.add(backing);
      // The service WeakMap owns a detached snapshot while this original key
      // remains live. Same atlas identity shares one service snapshot.
      localSnapshots.set(
        atlas.calibration.id,
        [...backings].reduce((sum, backing) => sum + backing.byteLength, 0),
      );
    }
    const usage = service.atlasResourceUsage;
    const selected = usage?.selected;
    // Selected copy owners: service snapshot, worker transfer, wasm JS upload
    // snapshot, native calibration. In-flight jobs can retain a previous atlas
    // after a newer selection, even if their local waiter was aborted.
    const selectedBytes = selected ? selected.backingBytes * 4 : 0;
    const pendingBytes = (usage?.inFlight ?? []).reduce(
      (sum, entry) => sum + entry.backingBytes * 4,
      0,
    );
    const originalBytes = [...originalBackings].reduce(
      (sum, backing) => sum + backing.byteLength,
      0,
    );
    const unselectedSnapshotBytes = [...localSnapshots].reduce(
      (sum, [id, bytes]) => sum + (selected?.calibrationId === id ? 0 : bytes),
      0,
    );
    // Test adapters without the service accounting accessor have no independent
    // ownership metadata. Charge the measured resource as all five owners.
    const fallback =
      !usage && localSnapshots.size
        ? [...localSnapshots.values()].reduce(
            (sum, bytes) => sum + bytes * 4,
            0,
          )
        : 0;
    return (
      originalBytes +
      unselectedSnapshotBytes +
      selectedBytes +
      pendingBytes +
      fallback
    );
  }
  function discardStage() {
    staged?.release();
    staged = null;
  }
  async function reset() {
    clearHover();
    thumbnailScheduler?.invalidateAll();
    unsubscribeCapability();
    serviceGeneration++;
    latestPrepare++;
    currentResources = null;
    prepared = undefined;
    uploaded = null;
    discardStage();
    const old = service;
    await closeService(old);
    if (!disposed) {
      service = createService();
      unsubscribeCapability =
        service.subscribeStatus?.(() => {
          if (service.thumbnailProfileVersion !== 1) {
            clearHover();
            thumbnailScheduler.invalidateAll();
          }
          controller.refreshAvailability();
          thumbnailScheduler?.resume();
        }) ?? (() => {});
      controller.refreshAvailability();
    }
  }
  const source = createSourceTransaction({
    decodeFile: async (file, decodeOptions) => {
      await options.sourceAdmission;
      check(decodeOptions.signal);
      return (options.decodeFile ?? decodeStillFile)(file, decodeOptions);
    },
    decodeDefault: async (decodeOptions) => {
      await options.sourceAdmission;
      check(decodeOptions.signal);
      return (options.decodeDefault ?? decodeOwnedDefault)(decodeOptions);
    },
    createId: options.createId,
    heldFrameBytes,
    async upload(value) {
      check();
      const current = service;
      await current.setSource(value);
      check();
      if (current !== service) throw cancelled();
      uploaded = value;
    },
    resetUploadedSource: reset,
  });
  function publishHover() {
    hoverRevision++;
    for (const listener of listeners) listener();
  }
  function clearHover() {
    hoverSequence++;
    hoverAbort?.abort();
    hoverAbort = undefined;
    if (hoverFrame || hoverStyleId) {
      hoverFrame = null;
      hoverStyleId = null;
      publishHover();
    }
  }
  const thumbnailId = (key: ThumbnailKey) => JSON.stringify(key);
  const thumbnailMaxBytes = 192 * 192 * 4;
  const thumbnailScheduler = createThumbnailScheduler({
    maxBytes: 4 * 1024 * 1024,
    maxFrames: 24,
    maxPending: 6,
    release: () => {},
    canStart: () =>
      !disposed &&
      !service.highPriorityBusy &&
      !controller.getSnapshot().loading &&
      controller.getSnapshot().status === "ready" &&
      !controller.getSnapshot().exportBusy,
    async render(key, signal) {
      const input = thumbnailInputs.get(thumbnailId(key));
      if (!input || signal.aborted) throw cancelled();
      const pixels = key.width * key.height;
      const thumbWidth = Math.max(
        1,
        Math.round(
          key.width * Math.min(1, 192 / Math.max(key.width, key.height)),
        ),
      );
      const thumbHeight = Math.max(
        1,
        Math.round(
          key.height * Math.min(1, 192 / Math.max(key.width, key.height)),
        ),
      );
      const thumbPixels = thumbWidth * thumbHeight;
      // Full native profile + retained wire, conversion accumulator/generic wire,
      // detached readback and one pending canvas. Existing source/atlas/outputs
      // are charged separately by the shared ownership ledger.
      const geometry =
        input.request.profile.kind === "characters"
          ? prepareCharactersGeometry(
              input.request.profile.settings.fontSize,
              1,
            )
          : null;
      const cells = geometry
        ? Math.floor(key.width / geometry.cellWidth) *
          Math.floor(key.height / geometry.cellHeight)
        : 0;
      const reservation = pixels * 52 + cells * 28 + thumbPixels * 44 + 4096;
      if (
        source.retainedSourceBytes * 3 +
          atlasResourceBytes(input.atlas) +
          heldFrameBytes() +
          reservation >
        DEFAULT_MEMORY_BUDGET_BYTES
      )
        throw new Error("Thumbnail exceeds the 256 MiB session budget");
      thumbnailReservation = reservation;
      input.started = true;
      try {
        const result = await service.renderThumbnail(
          input.request,
          signal,
          input.atlas,
        );
        if (
          signal.aborted ||
          result.styleId !== key.styleId ||
          result.sourceId !== key.sourceId ||
          result.sourceRevision !== key.sourceRevision ||
          result.revision !== input.request.revision ||
          result.calibrationId !== input.request.calibrationId ||
          !source.isReady(input.request.source)
        )
          throw cancelled();
        return result.frame;
      } finally {
        thumbnailReservation = 0;
        if (thumbnailInputs.get(thumbnailId(key)) === input)
          thumbnailInputs.delete(thumbnailId(key));
      }
    },
  });
  function acceptCandidate(candidate: SourceCandidate): SourceCandidate {
    return {
      ...candidate,
      accept() {
        if (!candidate.accept()) return false;
        original = uploaded;
        return true;
      },
    };
  }
  async function measure(
    request: StudioRequest,
    scale: 1 | 2 | 3 | 4,
    signal: AbortSignal,
  ) {
    const fontSize = request.project.style.parameters.fontSize as number;
    const ramp =
      request.project.style.id === "braille"
        ? Array.from({ length: 256 }, (_, i) =>
            String.fromCodePoint(0x2800 + i),
          ).join("")
        : (request.project.style.parameters.charSet as string);
    const geometry = prepareCharactersGeometry(fontSize, scale);
    const key = JSON.stringify([geometry, ramp]);
    if (measured?.key === key) return measured.atlas;
    const atlas = await (options.calibrate ?? calibrateReferenceCharacters)(
      {
        fontFamily: REFERENCE_MONOSPACE_STACK,
        fontRevision: FONT_REVISION,
        fontPolicy: "reference-system-monospace",
        fontSize: geometry.fontPixelSize,
        cellWidth: geometry.cellWidth,
        cellHeight: geometry.cellHeight,
        ramp,
      },
      signal,
    );
    check(signal);
    return atlas;
  }
  function bind(
    request: StudioRequest,
    scale: 1 | 2 | 3 | 4,
    atlas: ReferenceCharacterAtlasV1,
    current: RenderService,
  ) {
    if (current.charactersAtlasRetentionVersion !== 1)
      throw new Error(
        "Independent Characters atlas retention version1 is unavailable",
      );
    return prepareCharactersProject(request.project, scale, atlas, {
      source: source.isReady(request.project.source)
        ? request.project.source
        : null,
      calibrationId: atlas.calibration.id,
      fontFamily: REFERENCE_MONOSPACE_STACK,
      fontRevision: FONT_REVISION,
      charactersProfileVersion: current.charactersProfileVersion,
      charactersContextVersion: current.charactersContextVersion,
      memoryBudgetBytes: DEFAULT_MEMORY_BUDGET_BYTES,
    });
  }
  function job(
    request: StudioRequest,
    bound: ReturnType<typeof bind>,
  ): CharactersRenderRequest {
    return {
      jobId: `studio-${request.generation}-${request.jobId}`,
      revision: request.revision,
      sourceId: bound.sourceId,
      sourceRevision: bound.sourceRevision,
      calibrationId: bound.calibrationId,
      source: bound.source,
      settings: bound.settings,
      timeUs: request.project.timeUs,
    };
  }
  function styleJob(
    request: StudioRequest,
    settings: StyleSettingsV1,
    atlas?: ReferenceCharacterAtlasV1,
  ): StyleRenderRequest {
    const ref = request.project.source;
    if (!ref) throw new Error("A committed source is required");
    return {
      jobId: `studio-${request.generation}-${request.jobId}`,
      revision: request.revision,
      sourceId: ref.id,
      sourceRevision: ref.revision,
      calibrationId: atlas?.calibration.id ?? "",
      source: ref,
      styleId: settings.styleId as StyleRenderRequest["styleId"],
      settings,
      timeUs: request.project.timeUs,
    };
  }
  function admitStyleExport(
    request: StudioRequest,
    format: StillExportOptions["format"],
    settings: StyleSettingsV1,
    atlas?: ReferenceCharacterAtlasV1,
  ) {
    if (
      service.styleProfileVersion !== 1 ||
      !service.supportedStyleIds.includes(settings.styleId)
    )
      throw new Error("Style export capability unavailable");
    if (!service.atlasResourceUsage)
      throw new Error("Style export resource accounting unavailable");
    if (!source.isReady(request.project.source))
      throw new Error("Source is not ready");
    const pixels = settings.frameWidth * settings.frameHeight;
    // Retained source copies, native raster scratch/output, captured frames,
    // ImageData/canvas/codec reservation and retained downloads share 256 MiB.
    const peak =
      source.retainedSourceBytes * 3 +
      pixels * 52 +
      atlasResourceBytes(atlas) +
      heldFrameBytes() +
      encoderReservationBytes(
        settings.frameWidth,
        settings.frameHeight,
        format,
      );
    if (peak > DEFAULT_MEMORY_BUDGET_BYTES)
      throw new Error(
        "Export exceeds the 256 MiB session budget; choose a smaller scale or source",
      );
  }
  function exportSettings(
    request: StudioRequest,
    settings: StillExportOptions,
  ) {
    const p = request.project,
      ref = p.source;
    if (!ref) throw new Error("A committed source is required");
    const crop = p.crop;
    const width =
      Math.min(ref.width, Math.ceil((crop.x + crop.width) * ref.width)) -
      Math.floor(crop.x * ref.width);
    const height =
      Math.min(ref.height, Math.ceil((crop.y + crop.height) * ref.height)) -
      Math.floor(crop.y * ref.height);
    const swapped = p.rotation === 90 || p.rotation === 270;
    return validateReferenceCharactersSettings(
      {
        version: 1,
        frameWidth: Math.max(
          1,
          Math.round((swapped ? height : width) * settings.scale),
        ),
        frameHeight: Math.max(
          1,
          Math.round((swapped ? width : height) * settings.scale),
        ),
        fontSize: p.style.parameters.fontSize,
        renderScale: settings.scale,
        brightness: p.style.parameters.brightness,
        contrast: p.style.parameters.contrast,
        crop: { ...crop },
        rotation: p.rotation,
        backdrop: "blur",
      },
      ref,
    );
  }
  function admitExport(
    request: StudioRequest,
    format: StillExportOptions["format"],
    settings: ReferenceCharactersSettingsV1,
    atlas?: ReferenceCharacterAtlasV1,
  ) {
    if (
      service.charactersProfileVersion !== 1 ||
      service.charactersContextVersion !== 1 ||
      service.charactersAtlasRetentionVersion !== 1
    )
      throw new Error("Characters export capabilities are unavailable");
    if (!source.isReady(request.project.source))
      throw new Error("Source is not ready");
    const geometry = prepareCharactersGeometry(
      settings.fontSize,
      settings.renderScale,
    );
    const cells =
      Math.floor(settings.frameWidth / geometry.cellWidth) *
      Math.floor(settings.frameHeight / geometry.cellHeight);
    // Native complete profile (48 B/px), three retained source copies,
    // packed output grid/serialization (28 B/cell), actual atlas backings,
    // detached output frame (4 B/px), held previews/viewports and encoder policy.
    const pixels = settings.frameWidth * settings.frameHeight;
    const peak =
      source.retainedSourceBytes * 3 +
      atlasResourceBytes(atlas) +
      pixels * 52 +
      cells * 28 +
      4096 +
      heldFrameBytes() +
      encoderReservationBytes(
        settings.frameWidth,
        settings.frameHeight,
        format,
      );
    if (peak > DEFAULT_MEMORY_BUDGET_BYTES)
      throw new Error(
        "Export exceeds the 256 MiB session budget; choose a smaller scale or source",
      );
  }
  const encoder = createStillImageExporter({
    ...options.encoder,
    retainDownload(bytes) {
      if (
        downloadCount >= 32 ||
        heldFrameBytes() +
          atlasResourceBytes(capturedAtlas) +
          source.retainedSourceBytes * 3 +
          bytes >
          DEFAULT_MEMORY_BUDGET_BYTES
      )
        throw new Error("Wait for previous downloads to finish");
      downloadBytes += bytes;
      downloadCount++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          downloadBytes -= bytes;
          downloadCount--;
          controller.refreshExportAvailability();
        }
      };
    },
    reserve(bytes) {
      check();
      captureAdmission?.();
      if (encoderBytes) throw new Error("Still encoder busy");
      // Actual result backing capacities are now held; preflight against them
      // before allocating any ImageData/canvas/opaque codec buffer.
      if (
        heldFrameBytes() +
          atlasResourceBytes(capturedAtlas) +
          source.retainedSourceBytes * 3 +
          bytes >
        DEFAULT_MEMORY_BUDGET_BYTES
      )
        throw new Error("Encoder exceeds the 256 MiB session budget");
      encoderBytes = bytes;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          encoderBytes = 0;
        }
      };
    },
  });
  const controller = createStudioController({
    project: options.project,
    adapters: {
      source: {
        loadFile: async (file, signal) =>
          acceptCandidate(await source.loadFile(file, signal)),
        loadOwnedDefault: async (signal) =>
          acceptCandidate(await source.loadOwnedDefault(signal)),
        isReady: source.isReady,
      },
      renderer: {
        async prepare(request, signal) {
          check(signal);
          const sequence = ++latestPrepare,
            current = service,
            epoch = serviceGeneration;
          await current.initialize();
          check(signal);
          if (request.project.style.id !== "characters") {
            const settings = bindStyleProject(request.project, 1);
            if (
              current.styleProfileVersion !== 1 ||
              !current.supportedStyleIds.includes(settings.styleId)
            )
              throw new Error("Studio raster style capability unavailable");
            if (
              current !== service ||
              epoch !== serviceGeneration ||
              sequence !== latestPrepare
            )
              throw cancelled();
            const atlas =
              settings.styleId === "braille"
                ? await measure(request, 1, signal)
                : undefined;
            check(signal);
            if (
              current !== service ||
              epoch !== serviceGeneration ||
              sequence !== latestPrepare
            )
              throw cancelled();
            if (atlas) {
              if (
                source.retainedSourceBytes * 3 +
                  atlasResourceBytes(atlas) +
                  heldFrameBytes() +
                  settings.frameWidth * settings.frameHeight * 52 >
                DEFAULT_MEMORY_BUDGET_BYTES
              )
                throw new Error(
                  "Style preview exceeds the 256 MiB session budget",
                );
              await current.setAtlas(atlas);
              check(signal);
              if (
                current !== service ||
                epoch !== serviceGeneration ||
                sequence !== latestPrepare
              )
                throw cancelled();
              measured = {
                key: JSON.stringify([
                  prepareCharactersGeometry(
                    request.project.style.parameters.fontSize as number,
                    1,
                  ),
                  Array.from({ length: 256 }, (_, i) =>
                    String.fromCodePoint(0x2800 + i),
                  ).join(""),
                ]),
                atlas,
              };
            }
            const identity: PreparedResources = atlas
              ? {
                  kind: "atlas",
                  calibrationId: atlas.calibration.id,
                  generation: ++atlasGeneration,
                }
              : {
                  kind: "none",
                  calibrationId: "",
                  generation: ++atlasGeneration,
                };
            prepared = {
              jobId: request.jobId,
              atlas,
              identity,
              service: current,
              serviceGeneration: epoch,
            };
            currentResources = identity;
            return identity;
          }
          const atlas = await measure(request, 1, signal);
          check(signal);
          if (
            current !== service ||
            epoch !== serviceGeneration ||
            sequence !== latestPrepare
          )
            throw cancelled();
          await current.setAtlas(atlas);
          check(signal);
          if (
            current !== service ||
            epoch !== serviceGeneration ||
            sequence !== latestPrepare
          )
            throw cancelled();
          bind(request, 1, atlas, current);
          const geometry = prepareCharactersGeometry(
            request.project.style.parameters.fontSize as number,
            1,
          );
          measured = {
            key: JSON.stringify([
              geometry,
              request.project.style.parameters.charSet,
            ]),
            atlas,
          };
          const identity = {
            kind: "atlas" as const,
            calibrationId: atlas.calibration.id,
            generation: ++atlasGeneration,
          };
          prepared = {
            jobId: request.jobId,
            atlas,
            identity,
            service: current,
            serviceGeneration: epoch,
          };
          currentResources = identity;
          return identity;
        },
        isCurrentResources(identity) {
          return (
            !disposed &&
            currentResources?.generation === identity.generation &&
            currentResources.kind === identity.kind &&
            currentResources.calibrationId === identity.calibrationId
          );
        },
        async preview(request, signal) {
          check(signal);
          const p = prepared,
            sequence = ++latestPreview;
          if (
            !p ||
            p.jobId !== request.jobId ||
            p.identity.generation !== request.resources.generation ||
            p.identity.kind !== request.resources.kind ||
            p.identity.calibrationId !== request.resources.calibrationId ||
            p.service !== service ||
            p.serviceGeneration !== serviceGeneration
          )
            throw new Error("Prepared Studio resources expired");
          if (request.project.style.id !== "characters") {
            if (
              (request.project.style.id === "braille") !==
                (p.identity.kind === "atlas") ||
              (p.identity.kind === "atlas" &&
                p.atlas?.calibration.id !== p.identity.calibrationId)
            )
              throw new Error("Style resource identity mismatch");
            const settings = bindStyleProject(request.project, 1);
            const r = styleJob(request, settings, p.atlas);
            const result = await p.service.renderStylePreview(
              r,
              signal,
              p.atlas,
            );
            check(signal);
            if (
              sequence !== latestPreview ||
              p.service !== service ||
              p.serviceGeneration !== serviceGeneration
            )
              throw cancelled();
            if (
              result.jobId !== r.jobId ||
              result.revision !== r.revision ||
              result.sourceId !== r.sourceId ||
              result.sourceRevision !== r.sourceRevision ||
              result.styleId !== r.styleId ||
              result.calibrationId !== r.calibrationId
            )
              throw new Error("Raster result identity mismatch");
            const identity: PaintedIdentity = {
              styleId: result.styleId,
              sourceId: result.sourceId,
              sourceRevision: result.sourceRevision,
              projectId: request.project.id,
              revision: result.revision,
              calibrationId: result.calibrationId,
            };
            discardStage();
            const release = () => signal.removeEventListener("abort", abort);
            const abort = () => {
              if (staged?.jobId === request.jobId) discardStage();
            };
            staged = {
              identity,
              frame: result.frame,
              jobId: request.jobId,
              release,
            };
            signal.addEventListener("abort", abort, { once: true });
            return identity;
          }
          if (p.identity.kind !== "atlas" || !p.atlas)
            throw new Error("Characters atlas identity mismatch");
          const bound = bind(request, 1, p.atlas, p.service);
          const requestJob = job(request, bound);
          const result = await p.service.renderCharactersPreview(
            requestJob,
            signal,
            p.atlas,
          );
          check(signal);
          if (
            sequence !== latestPreview ||
            p.service !== service ||
            p.serviceGeneration !== serviceGeneration
          )
            throw cancelled();
          if (
            result.jobId !== requestJob.jobId ||
            result.revision !== request.revision ||
            result.sourceId !== bound.sourceId ||
            result.sourceRevision !== bound.sourceRevision ||
            result.calibrationId !== bound.calibrationId
          )
            throw new Error("Characters result identity mismatch");
          const identity: PaintedIdentity = {
            styleId: "characters",
            sourceId: result.sourceId,
            sourceRevision: result.sourceRevision,
            projectId: request.project.id,
            revision: result.revision,
            calibrationId: result.calibrationId,
          };
          discardStage();
          const release = () => signal.removeEventListener("abort", abort);
          const abort = () => {
            if (staged?.jobId === request.jobId) discardStage();
          };
          staged = {
            identity,
            frame: result.frame,
            jobId: request.jobId,
            release,
          };
          signal.addEventListener("abort", abort, { once: true });
          return identity;
        },
      },
      exportStill: async (request, signal, progress) => {
        if (request.project.style.id === "characters")
          admitExport(
            request,
            request.options.format,
            exportSettings(request, request.options),
          );
        else
          admitStyleExport(
            request,
            request.options.format,
            bindStyleProject(request.project, request.options.scale),
          );
        const captured = await runtime.renderCaptured(
          request,
          request.options.scale,
          signal,
          request.options.format,
        );
        await encoder.export(
          { frame: captured.result.frame, release: captured.release },
          request.options.format,
          request.project.name,
          signal,
          progress,
        );
      },
      dispose: async () => {
        await source.dispose();
      },
    },
  });
  unsubscribeCapability =
    service.subscribeStatus?.(() => {
      if (service.thumbnailProfileVersion !== 1) {
        clearHover();
        thumbnailScheduler.invalidateAll();
      }
      controller.refreshAvailability();
      thumbnailScheduler?.resume();
    }) ?? (() => {});
  async function requestThumbnail(
    styleId: string,
    signal?: AbortSignal,
  ): Promise<RgbaFrameV1 | null> {
    check();
    if (signal?.aborted) throw cancelled();
    const snapshot = controller.getSnapshot();
    const ref = snapshot.project.source;
    if (
      !ref ||
      !source.isReady(ref) ||
      service.thumbnailProfileVersion !== 1 ||
      !runtime.getAvailableStyleIds().includes(styleId)
    )
      return null;
    const project: RenderProjectV1 = {
      ...snapshot.project,
      style:
        styleId === snapshot.project.style.id
          ? snapshot.project.style
          : {
              id: styleId,
              parameters: initialCatalogRegistry.styleDefaults(styleId),
            },
    };
    let atlas: ReferenceCharacterAtlasV1 | undefined;
    let profile: ThumbnailRenderRequest["profile"];
    let resourceId = "none";
    if (styleId === "characters") {
      const request: StudioRequest = {
        project,
        revision: snapshot.revision,
        jobId: 0,
        generation: 0,
      };
      atlas = await measure(request, 1, new AbortController().signal);
      check();
      if (signal?.aborted) throw cancelled();
      if (
        controller.getSnapshot().project.source !== ref &&
        JSON.stringify(controller.getSnapshot().project.source) !==
          JSON.stringify(ref)
      )
        return null;
      const bound = prepareCharactersProject(project, 1, atlas, {
        source: ref,
        calibrationId: atlas.calibration.id,
        fontFamily: REFERENCE_MONOSPACE_STACK,
        fontRevision: FONT_REVISION,
        charactersProfileVersion: service.charactersProfileVersion,
        charactersContextVersion: service.charactersContextVersion,
        memoryBudgetBytes: DEFAULT_MEMORY_BUDGET_BYTES,
      });
      profile = { kind: "characters", settings: bound.settings };
      resourceId = atlas.calibration.id;
    } else {
      if (styleId === "braille") {
        atlas = await measure(
          { project, revision: snapshot.revision, jobId: 0, generation: 0 },
          1,
          signal ?? new AbortController().signal,
        );
        check(signal);
        resourceId = atlas.calibration.id;
      }
      profile = { kind: "style", settings: bindStyleProject(project, 1) };
    }
    if (
      snapshot.project.source?.id !==
        controller.getSnapshot().project.source?.id ||
      snapshot.project.source?.revision !==
        controller.getSnapshot().project.source?.revision
    )
      return null;
    const settings = profile.settings;
    const key: ThumbnailKey = {
      sourceId: ref.id,
      sourceRevision: ref.revision,
      styleId,
      parameterKey: JSON.stringify([settings, project.seed, project.timeUs]),
      seed: project.seed,
      timeUs: project.timeUs,
      width: settings.frameWidth,
      height: settings.frameHeight,
      resourceId,
    };
    const input: ThumbnailRenderRequest = {
      jobId: `thumbnail-${++thumbnailSequence}`,
      revision: snapshot.revision,
      sourceId: ref.id,
      sourceRevision: ref.revision,
      calibrationId: atlas?.calibration.id ?? "",
      source: ref,
      profile,
      timeUs: project.timeUs,
      maxSide: 192,
    };
    const id = thumbnailId(key);
    let holder = thumbnailInputs.get(id);
    if (!holder || holder.retired) {
      holder = {
        request: input,
        atlas,
        live: 0,
        retired: false,
        started: false,
      };
      thumbnailInputs.set(id, holder);
    }
    holder.live++;
    const owner = holder;
    return new Promise<RgbaFrameV1>((resolve, reject) => {
      let settled = false;
      const settle = (outcome: () => void, aborted: boolean) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        owner.live--;
        if (aborted && owner.live === 0 && !owner.retired) {
          owner.retired = true;
          thumbnailScheduler.cancel(key);
        }
        // An active native request keeps its input/atlas owner through terminal.
        if (
          owner.live === 0 &&
          !owner.started &&
          thumbnailInputs.get(id) === owner
        )
          thumbnailInputs.delete(id);
        outcome();
      };
      const onAbort = () => settle(() => reject(cancelled()), true);
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
        return;
      }
      thumbnailScheduler.request(key).then(
        (frame) => settle(() => resolve(frame), false),
        (reason) => settle(() => reject(reason), false),
      );
    });
  }
  async function hoverStyle(styleId: string) {
    clearHover();
    const sequence = hoverSequence;
    const abort = new AbortController();
    hoverAbort = abort;
    hoverStyleId = styleId;
    try {
      const frame = await requestThumbnail(styleId, abort.signal);
      if (sequence !== hoverSequence || !frame || !hoverStyleId || disposed)
        return;
      hoverFrame = frame;
      publishHover();
    } catch {
      if (sequence === hoverSequence) clearHover();
    }
  }
  // Registered before any consumer: publication and identity acceptance form one
  // synchronous notification boundary. Stale/export results never enter staging.
  const unsubscribe = controller.subscribe(() => {
    const snapshot = controller.getSnapshot();
    const signature = JSON.stringify([
      snapshot.project.source,
      snapshot.project.style,
      snapshot.project.crop,
      snapshot.project.rotation,
      snapshot.project.seed,
      snapshot.project.timeUs,
    ]);
    if (signature !== lastThumbnailSignature) {
      lastThumbnailSignature = signature;
      clearHover();
      thumbnailScheduler?.invalidateAll();
      thumbnailInputs.clear();
    }
    thumbnailScheduler?.resume();
    if (
      snapshot.frame &&
      staged &&
      Object.entries(snapshot.frame).every(
        ([k, v]) => staged!.identity[k as keyof PaintedIdentity] === v,
      )
    ) {
      staged.release();
      accepted = { identity: staged.identity, frame: staged.frame };
      staged = null;
    } else if (!snapshot.frame) {
      accepted = null;
      discardStage();
    }
    for (const listener of listeners) listener();
  });
  const runtime = {
    controller,
    canRenderThumbnail: () =>
      service.thumbnailProfileVersion === 1 && !disposed,
    requestThumbnail,
    hoverStyle,
    clearHover,
    getHoverFrame: () => hoverFrame,
    getHoverRevision: () => hoverRevision,
    get thumbnailUsage() {
      return thumbnailScheduler?.usage();
    },
    /** Current negotiated worker capability intersected with reviewed bindings. */
    getAvailableStyleIds(): readonly string[] {
      const ids: string[] = [];
      const characters = initialCatalogRegistry.getStyle("characters");
      if (
        characters?.binding &&
        service.charactersProfileVersion === 1 &&
        service.charactersContextVersion === 1 &&
        service.charactersAtlasRetentionVersion === 1
      )
        ids.push("characters");
      if (service.styleProfileVersion === 1)
        for (const id of ["pixel", "mosaic", "braille", "dither"] as const) {
          const schema = initialCatalogRegistry.getStyle(id);
          if (schema?.binding && service.supportedStyleIds.includes(id))
            ids.push(id);
        }
      return ids;
    },
    exportAvailability(settings: StillExportOptions): {
      available: boolean;
      reason: string;
      width?: number;
      height?: number;
    } {
      try {
        check();
        const snapshot = controller.getSnapshot();
        if (snapshot.loading || snapshot.status !== "ready")
          throw new Error("Wait for a ready Studio source");
        if (snapshot.exportBusy) throw new Error("An export is still settling");
        if (downloadCount >= 32)
          throw new Error("Wait for previous downloads to finish");
        const request = {
          project: snapshot.project,
          revision: snapshot.revision,
          jobId: 0,
          generation: 0,
        };
        const bound =
          snapshot.project.style.id === "characters"
            ? exportSettings(request, settings)
            : bindStyleProject(request.project, settings.scale);
        if (snapshot.project.style.id === "characters")
          admitExport(
            request,
            settings.format,
            bound as ReferenceCharactersSettingsV1,
          );
        else
          admitStyleExport(request, settings.format, bound as StyleSettingsV1);
        return {
          available: true,
          reason: "",
          width: bound.frameWidth,
          height: bound.frameHeight,
        };
      } catch (reason) {
        return {
          available: false,
          reason: reason instanceof Error ? reason.message : String(reason),
        };
      }
    },
    getSnapshot: controller.getSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getFrame: () => accepted,
    getOriginal: () => original,
    get heldFrameBytes() {
      return heldFrameBytes();
    },
    /** Viewport canvases only: disposal resets these immediately. Task5 must
     * retain encoder canvases with its output lease until encoding settles. */
    retainCanvas(canvas: { width: number; height: number }) {
      canvases.add(canvas);
      return () => {
        canvases.delete(canvas);
      };
    },
    admitThumbnailPaint(
      canvas: { width: number; height: number },
      frame: RgbaFrameV1,
    ) {
      const next = frame.width * frame.height * 4;
      if (
        Math.max(frame.width, frame.height) > 192 ||
        !Number.isSafeInteger(next) ||
        next > thumbnailMaxBytes ||
        frame.rgba.byteLength !== next
      )
        throw new Error("Invalid thumbnail canvas frame");
      const prior = canvases.has(canvas) ? canvas.width * canvas.height * 4 : 0;
      if (
        source.retainedSourceBytes * 3 +
          atlasResourceBytes() +
          heldFrameBytes() -
          prior +
          next >
        DEFAULT_MEMORY_BUDGET_BYTES
      )
        throw new Error("Thumbnail canvas exceeds the 256 MiB session budget");
    },
    async retry() {
      check();
      await source.recover();
      check();
      await service.initialize();
      check();
      return controller.retryRenderer();
    },
    /** Task5 owns encoding/download. This captures Rust pixels without any
     * preview publication; the caller owns/releases the returned frame. */
    async renderCaptured(
      request: StudioRequest,
      scale: 1 | 2 | 3 | 4,
      signal: AbortSignal,
      format?: StillExportOptions["format"],
    ) {
      check(signal);
      if (captureActive) throw new Error("A captured output is already owned");
      captureActive = true;
      try {
        const current = service,
          epoch = serviceGeneration;
        await current.initialize();
        if (request.project.style.id !== "characters") {
          const settings = bindStyleProject(request.project, scale);
          if (
            current.styleProfileVersion !== 1 ||
            !current.supportedStyleIds.includes(settings.styleId)
          )
            throw new Error("Studio raster style capability unavailable");
          const atlas =
            settings.styleId === "braille"
              ? await measure(request, scale, signal)
              : undefined;
          check(signal);
          if (current !== service || epoch !== serviceGeneration)
            throw cancelled();
          if (atlas) capturedAtlas = atlas;
          // Include the newly captured atlas before native work even for callers without an encoder.
          if (
            source.retainedSourceBytes * 3 +
              atlasResourceBytes(atlas) +
              heldFrameBytes() +
              settings.frameWidth * settings.frameHeight * 52 >
            DEFAULT_MEMORY_BUDGET_BYTES
          )
            throw new Error("Style export exceeds the 256 MiB session budget");
          if (format) admitStyleExport(request, format, settings, atlas);
          const r = styleJob(request, settings, atlas);
          const result = await current.renderStyleExport(
            {
              ...r,
              outputWidth: settings.frameWidth,
              outputHeight: settings.frameHeight,
            },
            signal,
            atlas,
          );
          check(signal);
          if (
            current !== service ||
            epoch !== serviceGeneration ||
            !source.isReady(request.project.source) ||
            result.styleId !== r.styleId ||
            result.sourceId !== r.sourceId ||
            result.sourceRevision !== r.sourceRevision ||
            result.revision !== r.revision ||
            result.jobId !== r.jobId ||
            result.calibrationId !== r.calibrationId
          )
            throw cancelled();
          captures.add(result.frame);
          if (format) {
            captureAdmission = () =>
              admitStyleExport(request, format, settings, atlas);
            try {
              captureAdmission();
            } catch (reason) {
              captures.delete(result.frame);
              captureAdmission = undefined;
              throw reason;
            }
          }
          let finishRelease!: () => void;
          captureRelease = new Promise<void>((resolve) => {
            finishRelease = resolve;
          });
          let released = false;
          return {
            result,
            release() {
              if (released) return;
              released = true;
              captures.delete(result.frame);
              captureAdmission = undefined;
              capturedAtlas = undefined;
              captureActive = false;
              finishRelease();
              captureRelease = undefined;
            },
          };
        }
        const atlas = await measure(request, scale, signal);
        check(signal);
        if (current !== service || epoch !== serviceGeneration)
          throw cancelled();
        const bound = bind(request, scale, atlas, current),
          r = job(request, bound);
        if (format) admitExport(request, format, bound.settings, atlas);
        const result = await current.renderCharactersExport(
          {
            ...r,
            outputWidth: bound.settings.frameWidth,
            outputHeight: bound.settings.frameHeight,
          },
          signal,
          atlas,
        );
        check(signal);
        if (
          current !== service ||
          epoch !== serviceGeneration ||
          !source.isReady(request.project.source)
        )
          throw cancelled();
        captures.add(result.frame);
        if (format) {
          captureAdmission = () =>
            admitExport(request, format, bound.settings, atlas);
          try {
            captureAdmission();
          } catch (reason) {
            captures.delete(result.frame);
            captureAdmission = undefined;
            throw reason;
          }
        }
        capturedAtlas = atlas;
        let finishRelease!: () => void;
        captureRelease = new Promise<void>((resolve) => {
          finishRelease = resolve;
        });
        let released = false;
        return {
          result,
          release() {
            if (released) return;
            released = true;
            captures.delete(result.frame);
            captureAdmission = undefined;
            capturedAtlas = undefined;
            captureActive = false;
            finishRelease();
            captureRelease = undefined;
          },
        };
      } catch (reason) {
        capturedAtlas = undefined;
        captureActive = false;
        throw reason;
      }
    },
    dispose(): Promise<void> {
      if (disposal) return disposal;
      disposed = true;
      clearHover();
      thumbnailScheduler?.dispose();
      thumbnailInputs.clear();
      encoder.dispose();
      latestPrepare++;
      latestPreview++;
      currentResources = null;
      prepared = undefined;
      measured = undefined;
      discardStage();
      accepted = null;
      original = null;
      uploaded = null;
      // A returned output lease may still be read by noncancellable encoding.
      // Its owner must release only after that work settles, even after abort.
      for (const canvas of canvases) {
        canvas.width = canvas.height = 0;
      }
      canvases.clear();
      unsubscribeCapability();
      unsubscribe();
      listeners.clear();
      // Settle unacknowledged worker uploads before joining the transaction's
      // noncancellable reservation. Decoder work still holds retirement until
      // settlement; its rollback can only close this already-closed service.
      const serviceClosed = closeService(service);
      disposal = Promise.allSettled([
        serviceClosed,
        controller.dispose(),
        captureRelease,
      ]).then((results) => {
        const failed = results.find((result) => result.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
      });
      return disposal;
    },
  };
  return runtime;
}
export type StudioRuntime = ReturnType<typeof createStudioRuntime>;
