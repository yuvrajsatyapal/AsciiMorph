"use client";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, type ConversionSettings } from "./settings";
import { decodeImage, DEFAULT_LIMITS, type ImageLimits } from "./image";
import type { Pixels } from "./engine";
import { calibrate } from "./presets";
import { runConversion } from "./runner";
import type { AsciiDocument } from "@/core/document";
export interface Source {
  pixels: Pixels;
  url: string;
  name: string;
}
export function useConverter() {
  const [settings, setSettings] =
    useState<ConversionSettings>(DEFAULT_SETTINGS);
  const [source, setSource] = useState<Source | null>(null),
    [loading, setLoading] = useState(false),
    [processing, setProcessing] = useState(false),
    [error, setError] = useState("");
  const [output, setOutput] = useState<{
    doc: AsciiDocument;
    source: Source;
    settings: ConversionSettings;
  } | null>(null);
  const [retry, setRetry] = useState(0),
    [cancelled, setCancelled] = useState(false);
  const uploadId = useRef(0),
    controller = useRef<AbortController | null>(null),
    url = useRef<string | null>(null),
    mounted = useRef(true);
  const result =
    output?.source === source &&
    output?.settings === settings &&
    !loading &&
    !cancelled
      ? output.doc
      : null;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);
  const remove = () => {
    uploadId.current++;
    controller.current?.abort();
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setSource(null);
    setOutput(null);
    setLoading(false);
    setError("");
    setProcessing(false);
    setCancelled(false);
  };
  const upload = async (file: File, limits: ImageLimits = DEFAULT_LIMITS) => {
    if (loading) return;
    const id = ++uploadId.current;
    controller.current?.abort();
    setOutput(null);
    setLoading(true);
    setError("");
    setSource(null);
    setCancelled(false);
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    try {
      const pixels = await decodeImage(file, limits);
      if (!mounted.current || id !== uploadId.current) return;
      const nextURL = URL.createObjectURL(file);
      url.current = nextURL;
      setSource({
        pixels,
        url: nextURL,
        name:
          file.name
            .replace(/\.[^.]+$/, "")
            .trim()
            .slice(0, 100) || "Converted image",
      });
    } catch (e) {
      if (mounted.current && id === uploadId.current)
        setError(e instanceof Error ? e.message : "Image decoding failed");
    } finally {
      if (mounted.current && id === uploadId.current) setLoading(false);
    }
  };
  useEffect(() => {
    controller.current?.abort();
    setProcessing(false);
    if (!source || cancelled) return;
    const ac = new AbortController();
    controller.current = ac;
    setProcessing(true);
    setError("");
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const coverage = await calibrate(settings.charset, settings.custom);
          if (ac.signal.aborted) return;
          const doc = await runConversion(
            source.pixels,
            settings,
            ac.signal,
            coverage,
          );
          if (!ac.signal.aborted) {
            doc.name = source.name;
            setOutput({ doc, source, settings });
            setProcessing(false);
          }
        } catch (e) {
          if (!ac.signal.aborted) {
            setError(e instanceof Error ? e.message : "Conversion failed");
            setProcessing(false);
          }
        }
      })();
    }, 180);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [source, settings, retry, cancelled]);
  const update = (patch: Partial<ConversionSettings>) => {
    setCancelled(false);
    setSettings((s) => ({ ...s, ...patch }));
  };
  const cancel = () => {
    uploadId.current++;
    controller.current?.abort();
    setCancelled(true);
    setLoading(false);
    setProcessing(false);
    setOutput(null);
  };
  const resume = () => {
    setCancelled(false);
    setRetry((v) => v + 1);
  };
  return {
    settings,
    update,
    source,
    loading,
    processing,
    error,
    result,
    upload,
    remove,
    cancel,
    resume,
    cancelled,
    reset: () => {
      setCancelled(false);
      setSettings({ ...DEFAULT_SETTINGS });
    },
  };
}
