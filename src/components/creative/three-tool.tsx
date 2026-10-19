"use client";
import { useMemo, useState, useRef } from "react";
import {
  parseObj,
  parseGlb,
  renderMesh,
  CUBE,
  type Mesh,
} from "@/creative/mesh";
import { CreativeShell } from "./shell";
import { Artwork, ArtworkActions } from "./artwork";
import { MotionActions } from "./motion-actions";
export function ThreeTool() {
  const [mesh, setMesh] = useState<Mesh>(CUBE),
    [name, setName] = useState("Original cube"),
    [yaw, setYaw] = useState(0.6),
    [pitch, setPitch] = useState(0.4),
    [zoom, setZoom] = useState(1),
    [light, setLight] = useState(1),
    [color, setColor] = useState("#e9b86e"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(
      null,
    ),
    generation = useRef(0);
  const result = useMemo(() => {
    try {
      return {
        doc: renderMesh(mesh, yaw, pitch, zoom, light, color),
        error: "",
      };
    } catch (error) {
      return {
        doc: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [mesh, yaw, pitch, zoom, light, color]);
  const doc = result.doc;
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
          {result.error && <p role="alert">{result.error}</p>}
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
                      doc: renderMesh(
                        mesh,
                        yaw + (i * Math.PI * 2) / 36,
                        pitch,
                        zoom,
                        light,
                        color,
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
