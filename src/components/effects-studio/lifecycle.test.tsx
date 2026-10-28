import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { act, render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useStudio } from "./use-studio";
import type { StudioRuntime } from "./runtime";
import type { RenderService } from "@/render/service";
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function boundaries() {
  const services: RenderService[] = [];
  const createService = vi.fn(() => {
    const value = {
      initialize: vi.fn(async () => {}),
      setSource: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    } as unknown as RenderService;
    services.push(value);
    return value;
  });
  return { createService, services };
}
it("server rendering allocates no runtime service and exposes a stable empty snapshot", () => {
  const h = boundaries();
  function Consumer() {
    const studio = useStudio({ createService: h.createService });
    return <span>{studio.snapshot?.status ?? "empty"}</span>;
  }
  expect(renderToString(<Consumer />)).toBe("<span>empty</span>");
  expect(h.createService).not.toHaveBeenCalled();
});
it("StrictMode creates fresh instances and old cleanup cannot clear the next mount", async () => {
  const h = boundaries();
  let current: StudioRuntime | null = null;
  function Consumer() {
    const studio = useStudio({ createService: h.createService });
    current = studio.runtime;
    return <span>{studio.snapshot?.status ?? "empty"}</span>;
  }
  const view = render(
    <StrictMode>
      <Consumer />
    </StrictMode>,
  );
  await waitFor(() => expect(h.services).toHaveLength(2));
  const live = current!;
  expect(h.services[0].dispose).toHaveBeenCalledTimes(1);
  expect(live.getSnapshot().status).toBe("idle");
  view.unmount();
  await waitFor(() => expect(h.services[1].dispose).toHaveBeenCalledTimes(1));
  expect(h.services).toHaveLength(2);
});
it("holds new source allocation behind a retired noncancellable decode and reports old cleanup errors", async () => {
  const h = boundaries(),
    old = deferred<{
      width: number;
      height: number;
      rgba: Uint8ClampedArray;
    }>();
  const firstDecode = vi.fn(() => old.promise),
    secondDecode = vi.fn(async () => ({
      width: 1,
      height: 1,
      rgba: new Uint8ClampedArray(4),
    }));
  const cleanup = vi.fn();
  let runtime: StudioRuntime | null = null;
  function Consumer({ first }: { first: boolean }) {
    const studio = useStudio({
      createService: h.createService,
      decodeDefault: first ? firstDecode : secondDecode,
      onCleanupError: cleanup,
    });
    runtime = studio.runtime;
    return null;
  }
  const a = render(<Consumer first />);
  await waitFor(() => expect(runtime).not.toBeNull());
  let firstLoad!: Promise<boolean>;
  act(() => {
    firstLoad = runtime!.controller.loadOwnedDefault();
  });
  await waitFor(() => expect(firstDecode).toHaveBeenCalledTimes(1));
  a.unmount();
  const b = render(<Consumer first={false} />);
  await waitFor(() => expect(runtime).not.toBeNull());
  let secondLoad!: Promise<boolean>;
  act(() => {
    secondLoad = runtime!.controller.loadOwnedDefault();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(secondDecode).not.toHaveBeenCalled();
  await act(async () => {
    old.resolve({ width: 1, height: 1, rgba: new Uint8ClampedArray(4) });
    await firstLoad;
    await secondLoad;
  });
  await expect(firstLoad).resolves.toBe(false);
  expect(secondDecode).toHaveBeenCalledTimes(1);
  expect(h.services).toHaveLength(2);
  expect(cleanup).not.toHaveBeenCalled();
  b.unmount();
});
it("handles asynchronous disposal failure without mutating an unmounted component", async () => {
  const h = boundaries(),
    error = new Error("cleanup failed"),
    report = vi.fn();
  function Consumer() {
    useStudio({ createService: h.createService, onCleanupError: report });
    return null;
  }
  const view = render(<Consumer />);
  (h.services[0].dispose as ReturnType<typeof vi.fn>).mockRejectedValue(error);
  view.unmount();
  await waitFor(() => expect(report).toHaveBeenCalledWith(error));
});

it("keeps retirement admission closed until a decoder settles even when service cleanup fails early", async () => {
  const h = boundaries(),
    gate = deferred<{
      width: number;
      height: number;
      rgba: Uint8ClampedArray;
    }>(),
    error = new Error("close early"),
    report = vi.fn();
  const second = vi.fn(async () => ({
    width: 1,
    height: 1,
    rgba: new Uint8ClampedArray(4),
  }));
  let runtime: StudioRuntime | null = null;
  function Consumer({ first }: { first: boolean }) {
    const studio = useStudio({
      createService: h.createService,
      decodeDefault: first ? () => gate.promise : second,
      onCleanupError: report,
    });
    runtime = studio.runtime;
    return null;
  }
  const a = render(<Consumer first />);
  await waitFor(() => expect(runtime).not.toBeNull());
  let first!: Promise<boolean>;
  act(() => {
    first = runtime!.controller.loadOwnedDefault();
  });
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  (h.services[0].dispose as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
    error,
  );
  a.unmount();
  const b = render(<Consumer first={false} />);
  let next!: Promise<boolean>;
  act(() => {
    next = runtime!.controller.loadOwnedDefault();
  });
  await act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
  expect(second).not.toHaveBeenCalled();
  await act(async () => {
    gate.resolve({ width: 1, height: 1, rgba: new Uint8ClampedArray(4) });
    await first;
    await next;
  });
  expect(second).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith(error);
  b.unmount();
});

it("keeps StrictMode remount source admission behind retired encoding even after service cleanup fails", async () => {
  const { measuredAtlasFixture } = await import("./runtime-fixtures");
  const services: RenderService[] = [];
  const createService = () => {
    const service = {
      state: "ready",
      charactersProfileVersion: 1,
      charactersContextVersion: 1,
      charactersAtlasRetentionVersion: 1,
      initialize: vi.fn(async () => {}),
      setSource: vi.fn(async () => {}),
      setAtlas: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
      renderCharactersPreview: vi.fn(
        async (request: import("@/render/service").CharactersRenderRequest) =>
          rendered(request),
      ),
      renderCharactersExport: vi.fn(
        async (request: import("@/render/service").CharactersRenderRequest) =>
          rendered(request),
      ),
    } as unknown as RenderService;
    services.push(service);
    return service;
  };
  function rendered(
    request: import("@/render/service").CharactersRenderRequest,
  ) {
    return {
      jobId: request.jobId,
      revision: request.revision,
      sourceId: request.sourceId,
      sourceRevision: request.sourceRevision,
      calibrationId: request.calibrationId,
      frame: {
        version: 1,
        width: 3,
        height: 2,
        rgba: new Uint8Array(24),
        grid: null,
      },
      backend: "rust-cpu",
      timings: { queueMs: 0, computeMs: 0, readbackMs: 0, totalMs: 0 },
    };
  }
  let nativeCallback: BlobCallback | undefined;
  const encoder = {
    createCanvas: () =>
      ({
        width: 0,
        height: 0,
        getContext: () => ({
          putImageData: vi.fn(),
          fillRect: vi.fn(),
          drawImage: vi.fn(),
        }),
        toBlob: (cb: BlobCallback) => {
          nativeCallback = cb;
        },
      }) as unknown as HTMLCanvasElement,
    createImageData: () =>
      ({ data: new Uint8ClampedArray(24), width: 3, height: 2 }) as ImageData,
  };
  const decode = () => ({
    width: 3,
    height: 2,
    rgba: new Uint8ClampedArray(24),
  });
  const nextDecode = vi.fn(async () => decode()),
    report = vi.fn();
  let runtime: StudioRuntime | null = null;
  function Consumer({ first }: { first: boolean }) {
    const studio = useStudio({
      createService,
      calibrate: async (input) => measuredAtlasFixture(input),
      decodeDefault: first ? async () => decode() : nextDecode,
      encoder,
      onCleanupError: report,
    });
    runtime = studio.runtime;
    return null;
  }
  const firstView = render(
    <StrictMode>
      <Consumer first />
    </StrictMode>,
  );
  await waitFor(() => expect(runtime).not.toBeNull());
  await act(async () => {
    await runtime!.controller.loadOwnedDefault();
  });
  await waitFor(() => expect(runtime!.getSnapshot().status).toBe("ready"));
  const retired = runtime!;
  let exporting!: Promise<boolean>;
  act(() => {
    exporting = retired.controller.exportStill({ format: "jpeg", scale: 1 });
  });
  await waitFor(() => expect(nativeCallback).toBeDefined());
  const failure = new Error("retired service cleanup failed");
  (services.at(-1)!.dispose as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
    failure,
  );
  firstView.unmount();
  const nextView = render(
    <StrictMode>
      <Consumer first={false} />
    </StrictMode>,
  );
  await waitFor(() => expect(runtime).not.toBeNull());
  let next!: Promise<boolean>;
  act(() => {
    next = runtime!.controller.loadOwnedDefault();
  });
  await act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });
  expect(nextDecode).not.toHaveBeenCalled();
  expect(retired.heldFrameBytes).toBeGreaterThan(1_114_112);
  await act(async () => {
    nativeCallback!(null);
    await exporting;
    await next;
  });
  expect(await exporting).toBe(false);
  expect(nextDecode).toHaveBeenCalledOnce();
  expect(retired.heldFrameBytes).toBe(0);
  expect(report).toHaveBeenCalledWith(failure);
  nextView.unmount();
});
