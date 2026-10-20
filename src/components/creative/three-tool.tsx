"use client";
import { useEffect, useState, useRef } from "react";
import {
  parseObj,
  parseGlb,
  renderMesh,
  CUBE,
  type Mesh,
} from "@/creative/mesh";
import { renderMeshAsync } from "@/creative/mesh-runner";
import type { AsciiDocument } from "@/core/document";
import { usePersistentState } from "@/workspace/preferences";
import { CreativeShell } from "./shell";
import { Artwork, ArtworkActions } from "./artwork";
import { MotionActions } from "./motion-actions";
export function ThreeTool() {
  const [mesh, setMesh] = useState<Mesh>(CUBE),
    [name, setName] = useState("Original cube"),
    [yaw, setYaw] = usePersistentState("mesh.yaw", 0.6),
    [pitch, setPitch] = usePersistentState("mesh.pitch", 0.4),
    [zoom, setZoom] = usePersistentState("mesh.zoom", 1),
    [light, setLight] = usePersistentState("mesh.light", 1),
    [color, setColor] = usePersistentState("mesh.color", "#e9b86e"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(
      null,
    ),
    generation = useRef(0);
  const [perspective, setPerspective] = usePersistentState(
    "mesh.perspective",
    0,
  );
  const [wireframe, setWireframe] = usePersistentState("mesh.wireframe", false);
  const [lightAngle, setLightAngle] = usePersistentState(
    "mesh.lightAngle",
    -0.35,
  );
  const [doc, setDoc] = useState<AsciiDocument>(() =>
    renderMesh(CUBE, 0.6, 0.4, 1, 1),
  );
  const [renderError, setRenderError] = useState("");
  useEffect(() => {
    const ac = new AbortController();
    setRenderError("");
    void renderMeshAsync(
      mesh,
      yaw,
      pitch,
      zoom,
      light,
      color,
      {
        perspective,
        wireframe,
        lightDirection: [Math.sin(lightAngle), 0.5, Math.cos(lightAngle)],
      },
      ac.signal,
    )
      .then(setDoc)
      .catch((e) => {
        if (!ac.signal.aborted) setRenderError(String(e));
      });
    return () => ac.abort();
  }, [
    mesh,
    yaw,
    pitch,
    zoom,
    light,
    color,
    perspective,
    wireframe,
    lightAngle,
  ]);
  async function load(file: File) {
    const token = ++generation.current;
    setBusy(true);
    setError("");
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Model exceeds 20 MiB");
      const next = /\.obj$/i.test(file.name)
        ? parseObj(await file.text())
        : /\.glb$/i.test(file.name)
          ? parseGlb(await file.arrayBuffer())
          : (() => {
              throw new Error("Choose a local OBJ or GLB file");
            })();
      if (token === generation.current) {
        setMesh(next);
        setName(file.name);
      }
    } catch (e) {
      if (token === generation.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  return (
    <CreativeShell
      title="3D, rendered in characters."
      description="Load a local mesh, orbit its faces and turn light into ASCII. Files are parsed on this device; external resources are never fetched."
    >
      <div className="creative-layout">
        <aside className="creative-controls">
          <label>
            Model
            <input
              type="file"
              accept=".obj,.glb"
              aria-label="Choose OBJ or GLB model"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void load(f);
                e.target.value = "";
              }}
            />
          </label>
          <p>
            {name} · {mesh.vertices.length.toLocaleString()} vertices ·{" "}
            {mesh.faces.length.toLocaleString()} triangles
          </p>
          <label>
            Camera preset
            <select
              defaultValue="orbit"
              onChange={(e) => {
                const views: Record<string, [number, number]> = {
                  orbit: [0.6, 0.4],
                  front: [0, 0],
                  side: [Math.PI / 2, 0],
                  top: [0, 1.5],
                };
                const v = views[e.target.value];
                setYaw(v[0]);
                setPitch(v[1]);
              }}
            >
              <option value="orbit">Isometric</option>
              <option value="front">Front</option>
              <option value="side">Side</option>
              <option value="top">Top</option>
            </select>
          </label>
          <label>
            Perspective
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={perspective}
              onChange={(e) => setPerspective(+e.target.value)}
            />
          </label>
          <label>
            Light direction
            <input
              type="range"
              min={-3.14}
              max={3.14}
              step={0.05}
              value={lightAngle}
              onChange={(e) => setLightAngle(+e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={wireframe}
              onChange={(e) => setWireframe(e.target.checked)}
            />
            Wireframe
          </label>
          <label>
            Orbit · {Math.round((yaw * 180) / Math.PI)}°
            <input
              type="range"
              min={-3.14}
              max={3.14}
              step={0.02}
              value={yaw}
              onChange={(e) => setYaw(+e.target.value)}
            />
          </label>
          <label>
            Tilt
            <input
              type="range"
              min={-1.5}
              max={1.5}
              step={0.02}
              value={pitch}
              onChange={(e) => setPitch(+e.target.value)}
            />
          </label>
          <label>
            Zoom
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(+e.target.value)}
            />
          </label>
          <label>
            Light intensity
            <input
              type="range"
              min={0.1}
              max={2}
              step={0.1}
              value={light}
              onChange={(e) => setLight(+e.target.value)}
            />
          </label>
          <label>
            Color
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <button
            onClick={() => {
              setYaw(0.6);
              setPitch(0.4);
              setZoom(1);
              setLight(1);
            }}
          >
            Reset view
          </button>
          <p>
            Drag the preview to orbit, or use the labeled controls. Supports
            triangle GLB 2.0 meshes with embedded buffers and OBJ polygons, up
            to 50,000 triangles. Materials, textures, skins and external
            resources are excluded.
          </p>
          {busy && <p role="status">Reading mesh…</p>}
          {error && <p role="alert">{error}</p>}
        </aside>
        <section>
          {renderError && <p role="alert">{renderError}</p>}
          {doc && (
            <>
              <div
                style={{ touchAction: "none" }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = { x: e.clientX, y: e.clientY, yaw, pitch };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (d) {
                    setYaw(
                      Math.atan2(
                        Math.sin(d.yaw + (e.clientX - d.x) * 0.01),
                        Math.cos(d.yaw + (e.clientX - d.x) * 0.01),
                      ),
                    );
                    setPitch(
                      Math.min(
                        1.5,
                        Math.max(-1.5, d.pitch + (e.clientY - d.y) * 0.01),
                      ),
                    );
                  }
                }}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
                onLostPointerCapture={() => {
                  drag.current = null;
                }}
              >
                <Artwork doc={doc} />
              </div>
              <ArtworkActions doc={doc} />
              <MotionActions
                build={async (signal) => {
                  const frames = [];
                  for (let i = 0; i < 36; i++) {
                    if (signal.aborted)
                      throw new DOMException(
                        "Animation cancelled",
                        "AbortError",
                      );
                    frames.push({
                      doc: await renderMeshAsync(
                        mesh,
                        yaw + (i * Math.PI * 2) / 36,
                        pitch,
                        zoom,
                        light,
                        color,
                        {
                          perspective,
                          wireframe,
                          lightDirection: [
                            Math.sin(lightAngle),
                            0.5,
                            Math.cos(lightAngle),
                          ],
                        },
                        signal,
                      ),
                      duration: 100,
                    });
                    await new Promise((resolve) => setTimeout(resolve, 0));
                  }
                  return frames;
                }}
              />
            </>
          )}
        </section>
      </div>
    </CreativeShell>
  );
}
