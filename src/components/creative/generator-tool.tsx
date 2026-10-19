"use client";
import { useState, useEffect, useMemo } from "react";
import {
  generate,
  DEFAULT_GENERATOR,
  type GeneratorSettings,
} from "@/creative/generators";
import { CreativeShell } from "./shell";
import { Artwork, ArtworkActions } from "./artwork";
import { MotionActions } from "./motion-actions";
export function GeneratorTool() {
  const [settings, setSettings] = useState(DEFAULT_GENERATOR),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    let raf = 0,
      last = 0;
    const tick = (now: number) => {
      if (now - last >= 100) {
        setTime((t) => t + 0.1);
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const doc = useMemo(() => generate(settings, time), [settings, time]);
  const set = <K extends keyof GeneratorSettings>(
    key: K,
    value: GeneratorSettings[K],
  ) => setSettings((s) => ({ ...s, [key]: value }));
  return (
    <CreativeShell
      title="Generative ASCII"
      description="Explore deterministic fields of characters. Keep a seed, find a frame, then make it your own."
    >
      <div className="creative-layout">
        <aside className="creative-controls">
          <label>
            Generator
            <select
              aria-label="Generator"
              value={settings.mode}
              onChange={(e) => {
                setPlaying(false);
                set("mode", e.target.value as GeneratorSettings["mode"]);
                setTime(0);
              }}
            >
              {["noise", "waves", "particles", "fractal"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            Seed
            <input
              type="number"
              min={0}
              max={999999}
              value={settings.seed}
              onChange={(e) =>
                set(
                  "seed",
                  Math.min(999999, Math.max(0, Math.floor(+e.target.value))),
                )
              }
            />
          </label>
          <label>
            Scale · {settings.scale.toFixed(1)}
            <input
              type="range"
              min={0.2}
              max={5}
              step={0.1}
              value={settings.scale}
              onChange={(e) => set("scale", +e.target.value)}
            />
          </label>
          <label>
            Speed · {settings.speed.toFixed(1)}
            <input
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={settings.speed}
              onChange={(e) => set("speed", +e.target.value)}
            />
          </label>
          <label>
            Color
            <input
              type="color"
              value={settings.color}
              onChange={(e) => set("color", e.target.value)}
            />
          </label>
          <label>
            Time · {time.toFixed(1)}s
            <input
              type="range"
              min={0}
              max={30}
              step={0.1}
              value={Math.min(30, time)}
              onChange={(e) => {
                setPlaying(false);
                setTime(+e.target.value);
              }}
            />
          </label>
          <button aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>
            {playing ? "Pause" : "Play"}
          </button>
          <button
            onClick={() => {
              setPlaying(false);
              setTime(0);
            }}
          >
            Reset time
          </button>
          <p>
            Playback begins only when you press Play. Motion export captures 30
            frames over 3 seconds from the current time.
          </p>
        </aside>
        <section>
          <Artwork doc={doc} />
          <ArtworkActions doc={doc} />
          <MotionActions
            build={() =>
              Array.from({ length: 30 }, (_, i) => ({
                doc: generate(settings, time + i / 10),
                duration: 100,
              }))
            }
          />
        </section>
      </div>
    </CreativeShell>
  );
}
