import type { SourceRef, SourceUpload } from "@/render/character-contract";
import {
  checkStillAbort,
  decodeOwnedDefault,
  decodeStillFile,
  type DecodeOptions,
  type DecodedStill,
} from "./still-source";

export type SourceCandidate = Readonly<{
  source: Readonly<SourceRef>;
  projectId: string;
  /** Synchronous: no callbacks/await between validation and controller commit. */
  accept(): boolean;
  /** Settles only once restoration/reset has completed; failures are observable. */
  rollback(): Promise<void>;
}>;
export interface StudioSourceAdapter {
  loadFile(file: File, signal: AbortSignal): Promise<SourceCandidate>;
  loadOwnedDefault(signal: AbortSignal): Promise<SourceCandidate>;
  /** Preview/export may resume only when worker and controller identities agree. */
  isReady(source: SourceRef | null): boolean;
}
type SourceOperations = {
  upload(source: SourceUpload): Promise<void>;
  /** Recreate an empty service and invalidate atlas generation before any
   * rollback upload. Must defeat same-identity service deduplication; Task 3
   * owns the real service bridge. Also used for empty-source rollback/dispose. */
  resetUploadedSource(): Promise<void>;
  decodeFile?: (file: File, options: DecodeOptions) => Promise<DecodedStill>;
  decodeDefault?: (options: DecodeOptions) => Promise<DecodedStill>;
  /** Actual frame/backing bytes retained by the caller, outside source copies. */
  heldFrameBytes?: () => number;
  createId?: () => string;
};
type Job = {
  file?: File;
  signal: AbortSignal;
  abort: AbortController;
  resolve(candidate: SourceCandidate): void;
  reject(reason: unknown): void;
  settled: Promise<void>;
  finish(): void;
  cleanup(): void;
  decide?: (accept: boolean) => void;
  obsolete: boolean;
  accepted?: boolean;
  recoveryError?: unknown;
};
const aborted = () =>
  new DOMException("Source operation aborted", "AbortError");

/** One active decode/upload/acceptance/rollback reservation; one latest pending
 * file reference. Pixels remain private and are never put into project JSON. */
export function createSourceTransaction(operations: SourceOperations) {
  let active: Job | undefined;
  let pending: Job | undefined;
  let committed: SourceUpload | undefined;
  let dirty = false;
  let disposed = false;
  let disposal: Promise<void> | undefined;
  let recovery: Promise<void> | undefined;
  const createId = operations.createId ?? (() => crypto.randomUUID());
  function obsolete(job: Job) {
    job.obsolete = true;
    job.abort.abort();
    job.decide?.(false);
  }
  const current = (job: Job) =>
    !disposed && !job.obsolete && !job.signal.aborted;
  class RecoveryFailure extends Error {}
  async function restore() {
    if (!dirty) return;
    try {
      // Failed acknowledgement may leave native pixels changed while the
      // service still retains the old identity. Reset defeats its same-source
      // shortcut before replaying the last controller-accepted pixels.
      await operations.resetUploadedSource();
      if (committed && !disposed) await operations.upload(committed);
      dirty = false;
    } catch (cause) {
      throw new RecoveryFailure(
        `Source restoration/reset failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
  }
  function pump() {
    if (active || recovery || !pending || disposed) return;
    const job = pending;
    pending = undefined;
    active = job;
    void run(job);
  }
  async function run(job: Job) {
    let upload: SourceUpload | undefined;
    try {
      // A failed restoration poisons readiness/admission until this succeeds.
      await restore();
      checkStillAbort(job.abort.signal);
      const options: DecodeOptions = {
        signal: job.abort.signal,
        // Manager, service recovery and worker retained source copies. New
        // copies/backings are charged by the decoder's five-RGBA allowance.
        heldBytes:
          (committed?.rgba.byteLength ?? 0) * 3 +
          (operations.heldFrameBytes?.() ?? 0),
      };
      const decoded = job.file
        ? await (operations.decodeFile ?? decodeStillFile)(job.file, options)
        : await (operations.decodeDefault ?? decodeOwnedDefault)(options);
      job.file = undefined;
      checkStillAbort(job.abort.signal);
      const source = Object.freeze({
        id: createId(),
        revision: 1,
        width: decoded.width,
        height: decoded.height,
      });
      // Descriptors derive exclusively from owned decoded geometry, never from
      // caller-supplied SourceRefs. The decoder owns this full-resolution buffer.
      upload = { ...source, rgba: decoded.rgba };
      dirty = true;
      await operations.upload(upload);
      checkStillAbort(job.abort.signal);
      const decision = new Promise<boolean>((resolve) => {
        job.decide = resolve;
      });
      let accepted = false;
      job.resolve(
        Object.freeze({
          source,
          projectId: createId(),
          accept() {
            if (
              accepted ||
              !upload ||
              !current(job) ||
              active !== job ||
              !job.decide
            )
              return false;
            accepted = true;
            job.accepted = true;
            committed = upload;
            dirty = false;
            job.decide(true);
            job.decide = undefined;
            return true;
          },
          async rollback() {
            if (!accepted) obsolete(job);
            await job.settled;
            // Restoration failures also remain observable after candidate resolve.
            if (job.recoveryError) throw job.recoveryError;
          },
        }),
      );
      if (!(await decision)) await restore();
    } catch (reason) {
      if (reason instanceof RecoveryFailure) {
        job.recoveryError = reason;
        job.reject(reason);
      } else {
        try {
          await restore();
          job.reject(reason);
        } catch (failure) {
          job.recoveryError = failure;
          job.reject(failure);
        }
      }
    } finally {
      // Candidate method closures must not retain obsolete decoded pixels.
      upload = undefined;
      job.file = undefined;
      job.decide = undefined;
      job.cleanup();
      job.finish();
      active = undefined;
      pump();
    }
  }
  function load(
    file: File | undefined,
    signal: AbortSignal,
  ): Promise<SourceCandidate> {
    if (disposed || signal.aborted) return Promise.reject(aborted());
    if (active) obsolete(active);
    if (pending) {
      obsolete(pending);
      pending.file = undefined;
      pending.cleanup();
      pending.reject(aborted());
      pending.finish();
    }
    let finish!: () => void;
    const settled = new Promise<void>((resolve) => {
      finish = resolve;
    });
    return new Promise<SourceCandidate>((resolve, reject) => {
      const job: Job = {
        file,
        signal,
        abort: new AbortController(),
        resolve,
        reject,
        settled,
        finish,
        obsolete: false,
        cleanup: () => {},
      };
      const cancel = () => {
        obsolete(job);
        if (pending === job) {
          pending = undefined;
          job.file = undefined;
          job.cleanup();
          reject(aborted());
          finish();
        }
      };
      signal.addEventListener("abort", cancel, { once: true });
      job.cleanup = () => signal.removeEventListener("abort", cancel);
      pending = job;
      pump();
    });
  }
  return {
    /** Current committed backing owned by this manager only, excluding active
     * candidates, native/service copies, frames, atlas and output. For external
     * session budgets; decoder heldBytes already charges three source copies. */
    get retainedSourceBytes() {
      return committed?.rgba.buffer.byteLength ?? 0;
    },
    loadFile: (file: File, signal: AbortSignal) => load(file, signal),
    loadOwnedDefault: (signal: AbortSignal) => load(undefined, signal),
    isReady(source: SourceRef | null) {
      return (
        !disposed &&
        !recovery &&
        (!active || active.accepted === true) &&
        !pending &&
        !dirty &&
        (source === null
          ? !committed
          : !!committed &&
            source.id === committed.id &&
            source.revision === committed.revision &&
            source.width === committed.width &&
            source.height === committed.height)
      );
    },
    recover(): Promise<void> {
      if (disposed) return Promise.reject(aborted());
      if (recovery) return recovery;
      recovery = Promise.resolve()
        .then(async () => {
          await active?.settled;
          if (disposed) throw aborted();
          await restore();
        })
        .finally(() => {
          recovery = undefined;
          pump();
        });
      return recovery;
    },
    dispose(): Promise<void> {
      if (disposal) return disposal;
      disposed = true;
      if (active) obsolete(active);
      if (pending) {
        obsolete(pending);
        pending.file = undefined;
        pending.cleanup();
        pending.reject(aborted());
        pending.finish();
        pending = undefined;
      }
      disposal = (async () => {
        await active?.settled;
        await recovery?.catch(() => {});
        // Release even committed pixels on route change; actual service owner
        // provides an idempotent empty-service reset/disposal operation.
        try {
          await operations.resetUploadedSource();
        } finally {
          // Local ownership ends even if external service cleanup rejects.
          committed = undefined;
          dirty = false;
        }
      })();
      return disposal;
    },
  } satisfies StudioSourceAdapter & {
    recover(): Promise<void>;
    readonly retainedSourceBytes: number;
    dispose(): Promise<void>;
  };
}
