import { afterEach, describe, it, expect, vi } from "vitest";
import { renderMeshAsync } from "./mesh-runner";
import { CUBE, renderMesh } from "./mesh";
afterEach(() => vi.unstubAllGlobals());
describe("mesh worker lifecycle", () => {
  it("cancels pending off-thread work and releases its worker", async () => {
    const terminate = vi.fn(),
      postMessage = vi.fn();
    vi.stubGlobal(
      "Worker",
      class {
        terminate = terminate;
        postMessage = postMessage;
      },
    );
    const ac = new AbortController();
    const promise = renderMeshAsync(CUBE, 0, 0, 1, 1, "#ffffff", {}, ac.signal);
    ac.abort();
    await expect(promise).rejects.toHaveProperty("name", "AbortError");
    expect(terminate).toHaveBeenCalledTimes(1);
  });
  it("releases the worker if the browser cannot clone the mesh message", async () => {
    const terminate = vi.fn();
    vi.stubGlobal(
      "Worker",
      class {
        terminate = terminate;
        postMessage() {
          throw new Error("clone failed");
        }
      },
    );
    await expect(renderMeshAsync(CUBE, 0, 0, 1, 1, "#ffffff")).rejects.toThrow(
      "clone failed",
    );
    expect(terminate).toHaveBeenCalledTimes(1);
  });
  it("renders a matching fallback when workers are unavailable", async () => {
    vi.stubGlobal("Worker", undefined);
    expect(
      (await renderMeshAsync(CUBE, 0.6, 0.4, 1, 1, "#ffffff")).layers[0].cells,
    ).toEqual(renderMesh(CUBE, 0.6, 0.4, 1, 1, "#ffffff").layers[0].cells);
  });
});
