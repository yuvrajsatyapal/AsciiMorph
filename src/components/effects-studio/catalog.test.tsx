import { render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Catalog } from "./catalog";
import { createStudioController, type StudioSnapshot } from "./controller";
import type { StudioRuntime } from "./runtime";
it("paints a value-matched accepted frame thumbnail without starting a render", async () => {
  const controller = createStudioController();
  const identity = {
    sourceId: "source",
    sourceRevision: 1,
    projectId: "project",
    revision: 1,
    calibrationId: "atlas",
  };
  const snapshot = {
    ...controller.getSnapshot(),
    frame: { ...identity },
  } as StudioSnapshot;
  const accepted = {
    identity,
    frame: { width: 1, height: 1, rgba: new Uint8Array([10, 20, 30, 255]) },
  };
  const paint = vi.fn();
  const context = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({
      putImageData: paint,
    } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal(
    "ImageData",
    class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number,
      ) {}
    },
  );
  const runtime = {
    getFrame: () => accepted,
    getSnapshot: () => snapshot,
    retainCanvas: () => () => {},
  } as unknown as StudioRuntime;
  const view = render(
    <Catalog
      runtime={runtime}
      controller={controller}
      snapshot={snapshot}
      collapse={() => {}}
    />,
  );
  await waitFor(() => expect(paint).toHaveBeenCalledTimes(2));
  expect(
    screen.getAllByLabelText("Accepted Characters thumbnail")[0],
  ).toHaveAttribute("width", "1");
  view.unmount();
  context.mockRestore();
  vi.unstubAllGlobals();
});
it("discards a scheduled thumbnail when its accepted frame is replaced", async () => {
  const controller = createStudioController();
  const identity = {
    sourceId: "old",
    sourceRevision: 1,
    projectId: "project",
    revision: 1,
    calibrationId: "atlas",
  };
  const snapshot = {
    ...controller.getSnapshot(),
    frame: { ...identity },
  } as StudioSnapshot;
  const accepted = {
    identity,
    frame: { width: 1, height: 1, rgba: new Uint8Array(4) },
  };
  let current: typeof accepted | null = accepted;
  const paint = vi.fn();
  const context = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({
      putImageData: paint,
    } as unknown as CanvasRenderingContext2D);
  const idle: (() => void)[] = [];
  vi.stubGlobal("requestIdleCallback", (callback: () => void) => {
    idle.push(callback);
    return idle.length;
  });
  vi.stubGlobal("cancelIdleCallback", vi.fn());
  const runtime = {
    getFrame: () => current,
    getSnapshot: () => snapshot,
    retainCanvas: () => () => {},
  } as unknown as StudioRuntime;
  const view = render(
    <Catalog
      runtime={runtime}
      controller={controller}
      snapshot={snapshot}
      collapse={() => {}}
    />,
  );
  current = null;
  for (const callback of idle) callback();
  expect(paint).not.toHaveBeenCalled();
  view.unmount();
  context.mockRestore();
  vi.unstubAllGlobals();
});
