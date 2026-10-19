"use client";
import { useEffect, useRef, useState } from "react";
import { Artwork, ArtworkActions } from "./artwork";
import {
  audioArtwork,
  audioFeatures,
  releaseAudio,
  type AudioMode,
  type AudioResources,
} from "@/creative/audio";
import { recordStream, recordingMime } from "@/creative/recording";
import { downloadBlob } from "@/core/exports";
import { paint } from "@/core/render";
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
    [mode, setMode] = useState<AudioMode>("bars"),
    [color, setColor] = useState("#e9b86e"),
    [gain, setGain] = useState(1),
    [smoothing, setSmoothing] = useState(0.8),
    [sensitivity, setSensitivity] = useState(1),
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
      session.current?.element?.pause();
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
        const next = audioArtwork(
          audioFeatures(time, frequency),
          mode,
          color,
          sensitivity,
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
  }, [running, mode, color, sensitivity]);
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
        const element = new Audio(),
          url = URL.createObjectURL(file);
        resource.element = element;
        resource.url = url;
        element.preload = "metadata";
        element.src = url;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            element.onloadedmetadata = null;
            element.onerror = null;
            reject(new Error("Audio metadata timed out."));
          }, 10000);
          element.onloadedmetadata = () => {
            clearTimeout(timer);
            element.onloadedmetadata = null;
            element.onerror = null;
            if (
              !Number.isFinite(element.duration) ||
              element.duration > 600 ||
              element.duration <= 0
            )
              reject(new Error("Choose audio up to 10 minutes long."));
            else resolve();
          };
          element.onerror = () => {
            clearTimeout(timer);
            element.onloadedmetadata = null;
            element.onerror = null;
            reject(new Error("This audio file could not be decoded."));
          };
        });
        if (id !== generation.current || !mounted.current) {
          releaseAudio(resource);
          return;
        }
        const node = context.createMediaElementSource(element);
        node.connect(gainNode);
        analyser.connect(context.destination);
        resource.nodes.push(node);
        element.onended = () => {
          if (id === generation.current) {
            setRunning(false);
            void context.suspend();
          }
        };
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
        s.element?.pause();
        await s.context.suspend();
        setRunning(false);
      } else {
        await s.context.resume();
        await s.element?.play();
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
