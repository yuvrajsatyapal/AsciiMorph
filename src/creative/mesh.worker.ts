/// <reference lib="webworker" />
import { renderMesh, type Mesh, type MeshRenderOptions } from "./mesh";
self.onmessage = (
  event: MessageEvent<{
    mesh: Mesh;
    yaw: number;
    pitch: number;
    zoom: number;
    light: number;
    color: string;
    options: MeshRenderOptions;
  }>,
) => {
  try {
    const p = event.data;
    self.postMessage({
      doc: renderMesh(
        p.mesh,
        p.yaw,
        p.pitch,
        p.zoom,
        p.light,
        p.color,
        p.options,
      ),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
