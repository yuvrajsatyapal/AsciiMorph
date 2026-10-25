import { render, screen, waitFor } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { expect, it } from "vitest";
import { createRenderService } from "@/render/service";
import { createStudioRuntime } from "./runtime";

class CapabilityWorker {
  listeners = new Map<string, Set<(event: { data?: unknown }) => void>>();
  addEventListener(
    type: string,
    callback: (event: { data?: unknown }) => void,
  ) {
    const group = this.listeners.get(type) ?? new Set();
    group.add(callback);
    this.listeners.set(type, group);
  }
  removeEventListener(
    type: string,
    callback: (event: { data?: unknown }) => void,
  ) {
    this.listeners.get(type)?.delete(callback);
  }
  emit(type: string, data?: unknown) {
    for (const callback of this.listeners.get(type) ?? []) callback({ data });
  }
  postMessage(message: unknown) {
    const request = message as { type: string; requestId: string };
    if (request.type === "initialize")
      queueMicrotask(() =>
        this.emit("message", {
          version: 1,
          requestId: request.requestId,
          type: "ready",
          styleProfileVersion: 1,
          supportedStyleIds: ["pixel", "mosaic"],
          charactersProfileVersion: 1,
          charactersContextVersion: 1,
          charactersAtlasRetentionVersion: 1,
        }),
      );
  }
  terminate() {}
}

it("updates the subscribed Studio snapshot on idle capability loss and recovery", async () => {
  const workers: CapabilityWorker[] = [];
  const service = createRenderService({
    workerFactory: () => {
      const worker = new CapabilityWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
  });
  const runtime = createStudioRuntime({ createService: () => service });
  function Probe() {
    const snapshot = useSyncExternalStore(
      runtime.subscribe,
      runtime.getSnapshot,
    );
    return (
      <p>
        {runtime.getAvailableStyleIds().join(",")}|{snapshot.capabilityRevision}
      </p>
    );
  }
  const view = render(<Probe />);
  try {
    await service.initialize();
    await waitFor(() =>
      expect(screen.getByText(/characters,pixel,mosaic/)).toBeVisible(),
    );
    workers[0].emit("error");
    await waitFor(() => expect(screen.getByText(/^\|/)).toBeVisible());
    await service.initialize();
    await waitFor(() =>
      expect(screen.getByText(/characters,pixel,mosaic/)).toBeVisible(),
    );
    expect(workers).toHaveLength(2);
  } finally {
    view.unmount();
    await runtime.dispose();
  }
});
