import { renderMesh, type Mesh, type MeshRenderOptions } from "./mesh";
import type { AsciiDocument } from "@/core/document";
export function renderMeshAsync(
  mesh: Mesh,
  yaw: number,
  pitch: number,
  zoom: number,
  light: number,
  color: string,
  options: MeshRenderOptions = {},
  signal?: AbortSignal,
): Promise<AsciiDocument> {
  if (signal?.aborted)
    return Promise.reject(new DOMException("Render cancelled", "AbortError"));
  if (typeof Worker === "undefined")
    return Promise.resolve().then(() =>
      renderMesh(mesh, yaw, pitch, zoom, light, color, options),
    );
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./mesh.worker.ts", import.meta.url), {
      type: "module",
    });
    const cleanup = () => {
      clearTimeout(timer);
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Render cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Mesh rendering timed out. Reduce mesh complexity."));
    }, 30000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (
      event: MessageEvent<{ doc?: AsciiDocument; error?: string }>,
    ) => {
      cleanup();
      if (event.data.doc) resolve(event.data.doc);
      else reject(new Error(event.data.error || "Mesh render failed"));
    };
    worker.onerror = () => {
      cleanup();
      reject(
        new Error(
          "Mesh rendering worker failed. Try a smaller mesh or reload.",
        ),
      );
    };
    worker.onmessageerror = () => {
      cleanup();
      reject(new Error("Could not read mesh worker output."));
    };
    try {
      worker.postMessage({ mesh, yaw, pitch, zoom, light, color, options });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
