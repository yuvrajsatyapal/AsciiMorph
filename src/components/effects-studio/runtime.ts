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
  prepareCharactersProject,
  type ReferenceCharacterAtlasV1,
  type ReferenceCharactersFrameV1,
} from "@/render/reference-characters";
import {
  createRenderService,
  type RenderService,
  type CharactersRenderRequest,
} from "@/render/service";
import {
  createStudioController,
  type StudioRequest,
  type AtlasIdentity,
  type PaintedIdentity,
} from "./controller";

export type AcceptedStudioFrame = Readonly<{
  identity: PaintedIdentity;
  frame: ReferenceCharactersFrameV1;
}>;
export type StudioRuntimeOptions = {
  project?: unknown;
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
  let currentAtlas: AtlasIdentity | null = null;
  let measured: { key: string; atlas: ReferenceCharacterAtlasV1 } | undefined;
  let prepared:
    | {
        jobId: number;
        atlas: ReferenceCharacterAtlasV1;
        identity: AtlasIdentity;
        service: RenderService;
        serviceGeneration: number;
      }
    | undefined;
  let original: SourceUpload | null = null;
  let uploaded: SourceUpload | null = null;
  let accepted: AcceptedStudioFrame | null = null;
  let staged:
    | (AcceptedStudioFrame & { jobId: number; release(): void })
    | null = null;
  let captureActive = false;
  let captureRelease: Promise<void> | undefined;
  const captures = new Set<ReferenceCharactersFrameV1>();
  const canvases = new Set<{ width: number; height: number }>();
  const listeners = new Set<() => void>();
  const check = (signal?: AbortSignal) => {
    if (disposed || signal?.aborted) throw cancelled();
  };
  function heldFrameBytes() {
    const backings = new Set<ArrayBufferLike>();
    for (const value of [accepted?.frame, staged?.frame, ...captures]) {
      if (!value) continue;
      backings.add(value.rgba.buffer);
      if (value.grid)
        for (const a of [
          value.grid.glyphIndices,
          value.grid.foreground,
          value.grid.background,
          value.grid.alpha,
        ])
          backings.add(a.buffer);
    }
    return (
      [...backings].reduce((sum, b) => sum + b.byteLength, 0) +
      [...canvases].reduce((sum, c) => sum + c.width * c.height * 4, 0)
    );
  }
  function discardStage() {
    staged?.release();
    staged = null;
  }
  async function reset() {
    serviceGeneration++;
    latestPrepare++;
    currentAtlas = null;
    prepared = undefined;
    uploaded = null;
    discardStage();
    const old = service;
    await closeService(old);
    if (!disposed) service = createService();
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
    const ramp = request.project.style.parameters.charSet as string;
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
          currentAtlas = identity;
          return identity;
        },
        isCurrentAtlas(identity) {
          return (
            !disposed &&
            currentAtlas?.generation === identity.generation &&
            currentAtlas.calibrationId === identity.calibrationId
          );
        },
        async preview(request, signal) {
          check(signal);
          const p = prepared,
            sequence = ++latestPreview;
          if (
            !p ||
            p.jobId !== request.jobId ||
            p.identity.generation !== request.atlas.generation ||
            p.service !== service ||
            p.serviceGeneration !== serviceGeneration
          )
            throw new Error("Prepared Characters atlas expired");
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
      dispose: async () => {
        await source.dispose();
      },
    },
  });
  // Registered before any consumer: publication and identity acceptance form one
  // synchronous notification boundary. Stale/export results never enter staging.
  const unsubscribe = controller.subscribe(() => {
    const snapshot = controller.getSnapshot();
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
  return {
    controller,
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
    ) {
      check(signal);
      if (captureActive) throw new Error("A captured output is already owned");
      captureActive = true;
      try {
        const current = service,
          epoch = serviceGeneration;
        await current.initialize();
        const atlas = await measure(request, scale, signal);
        check(signal);
        if (current !== service || epoch !== serviceGeneration)
          throw cancelled();
        const bound = bind(request, scale, atlas, current),
          r = job(request, bound);
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
            captureActive = false;
            finishRelease();
            captureRelease = undefined;
          },
        };
      } catch (reason) {
        captureActive = false;
        throw reason;
      }
    },
    dispose(): Promise<void> {
      if (disposal) return disposal;
      disposed = true;
      latestPrepare++;
      latestPreview++;
      currentAtlas = null;
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
}
export type StudioRuntime = ReturnType<typeof createStudioRuntime>;
