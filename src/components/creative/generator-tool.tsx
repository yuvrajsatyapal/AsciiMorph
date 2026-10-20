"use client";
import { useState, useEffect, useMemo } from "react";
import {
  generate,
  DEFAULT_GENERATOR,
  type GeneratorSettings,
} from "@/creative/generators";
import { usePersistentState } from "@/workspace/preferences";
import { CreativeShell } from "./shell";
import { Artwork, ArtworkActions } from "./artwork";
import { MotionActions } from "./motion-actions";
import { generatorTimeline } from "@/creative/generator-timeline";
export function GeneratorTool() {
  const [settings, setSettings] = usePersistentState<GeneratorSettings>(
      "generator.settings",
      DEFAULT_GENERATOR,
    ),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [presets, setPresets] = usePersistentState<
      { name: string; settings: GeneratorSettings }[]
    >("generator.presets", []),
    [presetName, setPresetName] = useState("My preset");
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
            Saved presets
            <select
              aria-label="Saved generator preset"
              value=""
              onChange={(e) => {
                const preset = presets[Number(e.target.value)];
                if (preset) {
                  setSettings(preset.settings);
                  setTime(0);
                }
              }}
            >
              <option value="">Choose a preset</option>
              {presets.map((p, i) => (
                <option key={i} value={i}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Preset name
            <input
              maxLength={60}
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
          </label>
          <button
            disabled={!presetName.trim() || presets.length >= 50}
            onClick={() =>
              setPresets((p) => [
                ...p.filter((v) => v.name !== presetName.trim()),
                { name: presetName.trim(), settings: { ...settings } },
              ])
            }
          >
            Save generator preset
          </button>
          {settings.mode === "waves" && (
            <label>
              Wave frequency
              <input
                type="range"
                min={1}
                max={30}
                value={settings.frequency ?? 9}
                onChange={(e) => set("frequency", +e.target.value)}
              />
            </label>
          )}
          {settings.mode === "particles" && (
            <label>
              Particle count
              <input
                type="range"
                min={1}
                max={128}
                value={settings.density ?? 32}
                onChange={(e) => set("density", +e.target.value)}
              />
            </label>
          )}
          {settings.mode === "fractal" && (
            <label>
              Fractal iterations
              <input
                type="range"
                min={5}
                max={100}
                value={settings.iterations ?? 40}
                onChange={(e) => set("iterations", +e.target.value)}
              />
            </label>
          )}
          <label>
            Combine generator
            <select
              value={settings.combine ?? "none"}
              onChange={(e) =>
                set("combine", e.target.value as GeneratorSettings["combine"])
              }
            >
              {["none", "noise", "waves", "particles", "fractal"].map(
                (mode) => (
                  <option key={mode}>{mode}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Combination mix
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.mix ?? 0.5}
              onChange={(e) => set("mix", +e.target.value)}
            />
          </label>
          <label>
            Seamless loop seconds (0 disables)
            <input
              type="number"
              min={0}
              max={30}
              value={settings.loopSeconds ?? 0}
              onChange={(e) =>
                set("loopSeconds", Math.max(0, Math.min(30, +e.target.value)))
              }
            />
          </label>
          <label>
            Animate scale
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.animateScale ?? 0}
              onChange={(e) => set("animateScale", +e.target.value)}
            />
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
            Playback begins only when you press Play. Motion export captures the
            chosen loop, or 3 seconds when looping is disabled.
          </p>
        </aside>
        <section>
          <Artwork doc={doc} />
          <ArtworkActions doc={doc} />
          <MotionActions
            build={() =>
              generatorTimeline(settings.loopSeconds, time).map(
                ({ time: frameTime, duration }) => ({
                  doc: generate(settings, frameTime),
                  duration,
                }),
              )
            }
          />
        </section>
      </div>
    </CreativeShell>
  );
}
