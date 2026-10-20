"use client";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { validateBackupPreference } from "./backup-preferences";
const PREFIX = "asciimorph-workspace:";
function compatible(value: unknown, initial: unknown): boolean {
  if (initial === null) return value === null || typeof value === "string";
  if (Array.isArray(initial)) return Array.isArray(value);
  if (typeof initial === "object")
    return (
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.entries(initial).every(
        ([key, entry]) =>
          key in value &&
          compatible((value as Record<string, unknown>)[key], entry),
      )
    );
  return (
    typeof value === typeof initial &&
    (typeof value !== "number" || Number.isFinite(value))
  );
}
function storageError(detail: string) {
  window.dispatchEvent(new CustomEvent("asciimorph-storage-error", { detail }));
}
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial),
    [loaded, setLoaded] = useState(false);
  const fallback = useRef(initial),
    last = useRef<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw !== null) {
        validateBackupPreference(PREFIX + key, raw);
        const parsed: unknown = JSON.parse(raw);
        if (!compatible(parsed, fallback.current))
          throw new Error("Invalid settings");
        last.current = raw;
        setValue(parsed as T);
      }
    } catch {
      storageError(
        "Workspace settings could not be restored. Export a backup before clearing browser storage.",
      );
    }
    setLoaded(true);
  }, [key]);
  useEffect(() => {
    if (!loaded) return;
    const serialized = JSON.stringify(value);
    if (serialized === last.current) return;
    try {
      localStorage.setItem(PREFIX + key, serialized);
      last.current = serialized;
    } catch {
      storageError(
        "Settings were not saved. Browser storage is full or unavailable.",
      );
    }
  }, [key, value, loaded]);
  return [value, setValue];
}
