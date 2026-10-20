"use client";
import { useEffect, useRef, useState } from "react";
import { Artwork, ArtworkActions } from "./artwork";
import {
  audioArtwork,
  AudioFilePlayback,
  audioFeatures,
  beatResponse,
  releaseAudio,
  type AudioMode,
  type AudioResources,
} from "@/creative/audio";
import { recordStream, recordingMime } from "@/creative/recording";
import { downloadBlob } from "@/core/exports";
import { paint } from "@/core/render";
import { usePersistentState } from "@/workspace/preferences";
import type { AsciiDocument } from "@/core/document";
interface Session extends AudioResources {
  analyser: AnalyserNode;
  gain: GainNode;
  destination: MediaStreamAudioDestinationNode;
}
const silence = {
  volume: 0,
  bands: Array(32).fill(0),
  wave: Array(128).fill(0),
};
export function AudioTool() {
  const [doc, setDoc] = useState(() =>
      audioArtwork(silence, "bars", "#e9b86e", 1),
    ),
    [snapshot, setSnapshot] = useState<AsciiDocument | null>(null),
    [mode, setMode] = usePersistentState<AudioMode>("audio.mode", "bars"),
    [color, setColor] = usePersistentState("audio.color", "#e9b86e"),
    [gain, setGain] = usePersistentState("audio.gain", 1),
    [smoothing, setSmoothing] = usePersistentState("audio.smoothing", 0.8),
    [sensitivity, setSensitivity] = usePersistentState("audio.sensitivity", 1),
    [running, setRunning] = useState(false),
    [source, setSource] = useState("No audio source"),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [recording, setRecording] = useState(false),
    [format, setFormat] = useState<"webm" | "mp4">("webm"),
    [mix, setMix] = useState(true),
    [duration, setDuration] = useState(5),
    [reduce, setReduce] = useState(false),
    [motion, setMotion] = useState(false);
  const [minHz, setMinHz] = usePersistentState("audio.minHz", 20),
    [maxHz, setMaxHz] = usePersistentState("audio.maxHz", 8000),
    [beat, setBeat] = usePersistentState("audio.beat", false),
    [playbackTime, setPlaybackTime] = useState(0),
    [audioDuration, setAudioDuration] = useState(0),
    [cues, setCues] = usePersistentState<{ time: number; mode: AudioMode }[]>(
      "audio.cues",
      [],
    );
  const energy = useRef(0);
  const session = useRef<Session | null>(null),
    pending = useRef<Session | null>(null),
    generation = useRef(0),
    mounted = useRef(true),
    capture = useRef<AbortController | null>(null),
    current = useRef(doc),
    recordCanvas = useRef<HTMLCanvasElement | null>(null);
  current.current = doc;
  function reset() {
    generation.current++;
    capture.current?.abort();
    if (session.current) releaseAudio(session.current);
    if (pending.current) releaseAudio(pending.current);
    session.current = null;
    pending.current = null;
    setRunning(false);
    setReady(false);
    setBusy(false);
    setSource("No audio source");
    setAudioDuration(0);
    setPlaybackTime(0);
  }
  useEffect(() => {
    mounted.current = true;
    // Keep the ref object: cleanup invalidates every in-flight source request.
    const lifecycleGeneration = generation;
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(query.matches);
    update();
    query.addEventListener("change", update);
    return () => {
      mounted.current = false;
      lifecycleGeneration.current++;
      capture.current?.abort();
      if (session.current) releaseAudio(session.current);
      if (pending.current) releaseAudio(pending.current);
      session.current = null;
      pending.current = null;
      query.removeEventListener("change", update);
    };
  }, []);
  useEffect(() => {
    const s = session.current;
    if (s) {
      s.gain.gain.value = gain;
      s.analyser.smoothingTimeConstant = smoothing;
    }
  }, [gain, smoothing, ready]);
  useEffect(() => {
    if (reduce && !motion) {
      capture.current?.abort();
      setRunning(false);
      session.current?.playback?.pause();
      void session.current?.context.suspend();
    }
  }, [reduce, motion]);
  useEffect(() => {
    if (!running) return;
    let frame = 0,
      last = 0;
    const tick = (now: number) => {
      const s = session.current;
      if (!s) return;
      if (now - last >= 80) {
        last = now;
        const time = new Uint8Array(s.analyser.fftSize),
          frequency = new Uint8Array(s.analyser.frequencyBinCount);
        s.analyser.getByteTimeDomainData(time);
        s.analyser.getByteFrequencyData(frequency);
        const position = s.playback?.position ?? s.context.currentTime;
        setPlaybackTime(position);
        const features = audioFeatures(time, frequency, {
          sampleRate: s.context.sampleRate,
          minHz: Math.min(minHz, s.context.sampleRate / 2 - 1),
          maxHz: Math.min(Math.max(minHz + 1, maxHz), s.context.sampleRate / 2),
        });
        const level =
          features.bands.reduce((sum, v) => sum + v, 0) / features.bands.length;
        const pulse = beatResponse(level, energy.current, 1);
        energy.current = energy.current * 0.85 + level * 0.15;
        const cue = [...cues]
          .sort((a, b) => a.time - b.time)
          .filter((c) => c.time <= position)
          .at(-1);
        const next = audioArtwork(
          features,
          cue?.mode ?? mode,
          color,
          Math.min(4, sensitivity * (beat ? 1 + pulse : 1)),
        );
        setDoc(next);
        current.current = next;
        if (recordCanvas.current)
          paint(recordCanvas.current, next, { pixelRatio: 1 });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, mode, color, sensitivity, minHz, maxHz, beat, cues]);
  async function connect(file?: File) {
    reset();
    const id = generation.current;
    setBusy(true);
    setError("");
    let resource: Session | undefined;
    try {
      if (
        file &&
        (!file.type.startsWith("audio/") ||
          file.size > 50 * 1024 * 1024 ||
          !file.size)
      )
        throw new Error("Choose an audio file smaller than 50 MB.");
      if (!file && !navigator.mediaDevices?.getUserMedia)
        throw new Error("Microphone capture is unavailable.");
      const context = new AudioContext(),
        analyser = context.createAnalyser(),
        gainNode = context.createGain(),
        destination = context.createMediaStreamDestination();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = smoothing;
      gainNode.gain.value = gain;
      gainNode.connect(analyser);
      analyser.connect(destination);
      resource = {
        context,
        analyser,
        gain: gainNode,
        destination,
        nodes: [gainNode, analyser, destination],
      };
      pending.current = resource;
      if (file) {
        const buffer = await context.decodeAudioData(await file.arrayBuffer());
        if (
          !Number.isFinite(buffer.duration) ||
          buffer.duration > 600 ||
          buffer.duration <= 0
        )
          throw new Error("Choose audio up to 10 minutes long.");
        if (id !== generation.current || !mounted.current) {
          releaseAudio(resource);
          return;
        }
        analyser.connect(context.destination);
        resource.playback = new AudioFilePlayback(
          context,
          buffer,
          gainNode,
          () => {
            if (id === generation.current) {
              setPlaybackTime(buffer.duration);
              setRunning(false);
              void context.suspend();
            }
          },
        );
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        resource.stream = stream;
        if (id !== generation.current || !mounted.current) {
          releaseAudio(resource);
          return;
        }
        const node = context.createMediaStreamSource(stream);
        node.connect(gainNode);
        resource.nodes.push(node);
      }
      await context.suspend();
      if (id !== generation.current || !mounted.current) {
        releaseAudio(resource);
        return;
      }
      session.current = resource;
      if (pending.current === resource) pending.current = null;
      setReady(true);
      setSource(file ? file.name : "Microphone enabled");
      setAudioDuration(resource.playback?.buffer.duration ?? 0);
      setPlaybackTime(0);
      energy.current = 0;
    } catch (e) {
      if (resource) releaseAudio(resource);
      if (pending.current === resource) pending.current = null;
      if (mounted.current && id === generation.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current && id === generation.current) setBusy(false);
    }
  }
  async function toggle() {
    const s = session.current;
    if (!s) return;
    setError("");
    try {
      if (running) {
        s.playback?.pause();
        await s.context.suspend();
        setRunning(false);
      } else {
        await s.context.resume();
        s.playback?.play();
        setRunning(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function record() {
    const s = session.current;
    if (!s || !running) return;
    setError("");
    let stream: MediaStream | undefined;
    const ac = new AbortController();
    capture.current = ac;
    setRecording(true);
    try {
      recordingMime(format);
      const canvas = document.createElement("canvas");
      paint(canvas, current.current, { pixelRatio: 1 });
      if (!canvas.captureStream)
        throw new Error("Canvas recording is unavailable.");
      recordCanvas.current = canvas;
      stream = canvas.captureStream(15);
      if (mix)
        for (const track of s.destination.stream.getAudioTracks())
          stream.addTrack(track.clone());
      const blob = await recordStream(
        stream,
        format,
        duration * 1000,
        ac.signal,
      );
      if (!ac.signal.aborted && mounted.current)
        downloadBlob(blob, `audio-response.${format}`);
    } catch (e) {
      if (!ac.signal.aborted && mounted.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      recordCanvas.current = null;
      stream?.getTracks().forEach((t) => t.stop());
      if (mounted.current) setRecording(false);
      if (capture.current === ac) capture.current = null;
    }
  }
  return (
    <div className="creative-layout">
      <section className="creative-controls">
        <h2>Audio source</h2>
        <label>
          Local audio
          <input
            type="file"
            accept="audio/*"
            disabled={busy || recording}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void connect(f);
            }}
          />
        </label>
        <button disabled={busy || recording} onClick={() => void connect()}>
          Enable microphone
        </button>
        <p role="status">{source}</p>
        <p>
          Files stay local. Microphone audio is never played through your
          speakers. Sources start paused.
        </p>
        {reduce && (
          <label>
            <input
              type="checkbox"
              checked={motion}
              onChange={(e) => setMotion(e.target.checked)}
            />
            Enable live motion despite reduced motion preference
          </label>
        )}
        <button
          disabled={!ready || busy || recording || (reduce && !motion)}
          onClick={() => void toggle()}
        >
          {running ? "Pause audio and motion" : "Play audio and motion"}
        </button>
        <button disabled={(!ready && !busy) || recording} onClick={reset}>
          {busy ? "Cancel loading" : "Stop and release source"}
        </button>
        <h2>Response</h2>
        <label>
          Visual preset
          <select
            defaultValue=""
            onChange={(e) => {
              const p = e.target.value;
              if (p === "bass") {
                setMode("rings");
                setMinHz(20);
                setMaxHz(250);
                setBeat(true);
                setColor("#e9b86e");
              } else if (p === "vocal") {
                setMode("wave");
                setMinHz(250);
                setMaxHz(4000);
                setBeat(false);
                setColor("#9fcba7");
              } else if (p === "spectrum") {
                setMode("bars");
                setMinHz(20);
                setMaxHz(16000);
                setBeat(false);
                setColor("#8bb9de");
              }
            }}
          >
            <option value="">Choose preset</option>
            <option value="bass">Bass pulse</option>
            <option value="vocal">Vocal ribbon</option>
            <option value="spectrum">Full spectrum</option>
          </select>
        </label>
        <label>
          Minimum frequency (Hz)
          <input
            type="number"
            min={0}
            max={19000}
            value={minHz}
            onChange={(e) => {
              const v = Math.max(0, Math.min(19000, +e.target.value));
              setMinHz(v);
              setMaxHz(Math.max(v + 1, maxHz));
            }}
          />
        </label>
        <label>
          Maximum frequency (Hz)
          <input
            type="number"
            min={minHz + 1}
            max={20000}
            value={maxHz}
            onChange={(e) =>
              setMaxHz(Math.max(minHz + 1, Math.min(20000, +e.target.value)))
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={beat}
            onChange={(e) => setBeat(e.target.checked)}
          />
          Accent energy transients (beat response)
        </label>
        <label>
          Audio timeline · {playbackTime.toFixed(1)}s
          <input
            aria-label="Audio timeline"
            type="range"
            min={0}
            max={audioDuration || 1}
            step={0.1}
            value={Math.min(playbackTime, audioDuration || 1)}
            disabled={!audioDuration || recording}
            onChange={(e) => {
              const value = +e.target.value;
              if (session.current?.playback) {
                session.current.playback.seek(value);
                setPlaybackTime(value);
              }
            }}
          />
        </label>
        <button
          disabled={!ready || cues.length >= 100}
          onClick={() =>
            setCues((previous) => [...previous, { time: playbackTime, mode }])
          }
        >
          Add current visualization cue
        </button>
        <ol aria-label="Effect timeline">
          {cues.map((cue, i) => (
            <li key={i}>
              {cue.time.toFixed(1)}s · {cue.mode}{" "}
              <button
                aria-label={`Remove cue ${i + 1}`}
                onClick={() =>
                  setCues((previous) =>
                    previous.filter((_, index) => index !== i),
                  )
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
        <p>
          Timeline cues switch visualization at the source timestamp. Frequency
          controls select FFT bins; beat response accents rising energy.
        </p>
        <label>
          Visualization
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as AudioMode)}
          >
            <option value="bars">Frequency bars</option>
            <option value="rings">Volume rings</option>
            <option value="wave">Waveform</option>
          </select>
        </label>
        <label>
          Color
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <label>
          Audio gain {gain}
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={gain}
            onChange={(e) => setGain(+e.target.value)}
          />
        </label>
        <label>
          Visual sensitivity {sensitivity}
          <input
            type="range"
            min="0.25"
            max="4"
            step="0.05"
            value={sensitivity}
            onChange={(e) => setSensitivity(+e.target.value)}
          />
        </label>
        <label>
          Frequency smoothing {smoothing}
          <input
            type="range"
            min="0"
            max="0.95"
            step="0.05"
            value={smoothing}
            onChange={(e) => setSmoothing(+e.target.value)}
          />
        </label>
        <button onClick={() => setSnapshot(current.current)}>
          Capture still
        </button>
        <h2>Record response</h2>
        <label>
          Recording format
          <select
            disabled={recording}
            value={format}
            onChange={(e) => setFormat(e.target.value as "webm" | "mp4")}
          >
            <option value="webm">WebM</option>
            <option value="mp4">MP4 (browser support required)</option>
          </select>
        </label>
        <label>
          Seconds
          <input
            type="number"
            min="1"
            max="30"
            value={duration}
            disabled={recording}
            onChange={(e) =>
              setDuration(Math.max(1, Math.min(30, +e.target.value || 1)))
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={mix}
            disabled={recording}
            onChange={(e) => setMix(e.target.checked)}
          />
          Include source audio
        </label>
        <button disabled={!running || recording} onClick={() => void record()}>
          Record live response
        </button>
        {recording && (
          <button onClick={() => capture.current?.abort()}>
            Cancel recording
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
      <section>
        <Artwork doc={doc} />
        {snapshot && (
          <>
            <h2>Captured still</h2>
            <Artwork doc={snapshot} />
            <ArtworkActions doc={snapshot} />
          </>
        )}
      </section>
    </div>
  );
}
