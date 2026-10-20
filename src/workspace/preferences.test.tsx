import { renderHook, act } from "@testing-library/react";
import { expect, it } from "vitest";
import { usePersistentState } from "./preferences";
it("restores tool settings when a workspace remounts", () => {
  localStorage.clear();
  const first = renderHook(() => usePersistentState("test", { width: 80 }));
  act(() => first.result.current[1]({ width: 100 }));
  first.unmount();
  const next = renderHook(() => usePersistentState("test", { width: 80 }));
  expect(next.result.current[0]).toEqual({ width: 100 });
});
it("recovers malformed tool preference types to their defaults", () => {
  localStorage.setItem("asciimorph-workspace:broken", '{"width":"invalid"}');
  const hook = renderHook(() => usePersistentState("broken", { width: 80 }));
  expect(hook.result.current[0]).toEqual({ width: 80 });
});
it("rejects damaged audio timeline entries before rendering a tool", () => {
  localStorage.setItem("asciimorph-workspace:audio.cues", "[null]");
  const hook = renderHook(() =>
    usePersistentState<{ time: number; mode: string }[]>("audio.cues", []),
  );
  expect(hook.result.current[0]).toEqual([]);
});
