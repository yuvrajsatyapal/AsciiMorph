import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { useEditor } from "./use-editor";
import { workspace } from "./store";
import { createDocument } from "@/core/document";
import * as persistence from "./persistence";
beforeEach(() => {
  workspace.setState({ documents: {}, activeId: null, past: [], future: [] });
  window.history.replaceState({}, "", "/studio?demo=orbit");
});
afterEach(() => vi.restoreAllMocks());
it("does not trap Tab or Shift Tab in Text mode and Escape leaves Text mode", async () => {
  const { result } = renderHook(() => useEditor());
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => result.current.setTool("text"));
  const preventDefault = vi.fn();
  act(() =>
    result.current.onKey({
      key: "Tab",
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
      target: document.createElement("div"),
      preventDefault,
    } as never),
  );
  expect(preventDefault).not.toHaveBeenCalled();
  act(() =>
    result.current.onKey({
      key: "Escape",
      ctrlKey: false,
      metaKey: false,
      target: document.createElement("div"),
      preventDefault,
    } as never),
  );
  expect(result.current.tool).toBe("pencil");
});
it("retains unsaved artwork and offers download when a project switch save fails", async () => {
  const { result } = renderHook(() => useEditor());
  await waitFor(() => expect(result.current.ready).toBe(true));
  const id = result.current.doc!.id;
  vi.spyOn(persistence, "saveProject").mockRejectedValueOnce(
    new Error("Quota exceeded"),
  );
  const next = createDocument();
  await act(async () => result.current.switchDoc(next));
  expect(result.current.doc!.id).toBe(id);
  expect(result.current.pendingDoc?.id).toBe(next.id);
  expect(result.current.panel).toBe("switch");
});
