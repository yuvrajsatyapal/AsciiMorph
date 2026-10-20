import { beforeEach, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createAnimation } from "@/animation/project";
import { createDocument } from "@/core/document";
import Animation from "./animation";
import { loadAnimation, saveAnimation } from "@/animation/persistence";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/animation/persistence", () => ({
  loadAnimation: vi.fn(),
  saveAnimation: vi.fn().mockResolvedValue(undefined),
  listAnimations: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/animation/handoff", () => ({
  consumeAnimation: () => null,
  editAnimationFrame: vi.fn(),
}));
vi.mock("@/core/render", () => ({
  ensureArtworkFont: () => Promise.resolve(),
  paint: vi.fn(),
  previewPixelRatio: () => 1,
  documentText: () => "",
}));
vi.mock("@/components/creative/media-import", () => ({
  MediaImport: () => null,
}));
beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadAnimation).mockResolvedValue(
    createAnimation(
      [0, 1, 2].map((i) => ({
        doc: createDocument(2, 2, `Frame ${i}`),
        duration: 100,
      })),
    ),
  );
  vi.mocked(saveAnimation).mockClear();
});
it("supports multiselect deletion, undo and keyboard range extension", async () => {
  render(<Animation />);
  const timeline = await screen.findByRole("list", {
    name: "Animation frames",
  });
  fireEvent.click(within(timeline).getByRole("button", { name: /Frame 1/ }));
  fireEvent.keyDown(timeline, { key: "ArrowRight", shiftKey: true });
  fireEvent.keyDown(timeline, { key: "ArrowRight", shiftKey: true });
  expect(screen.getByText(/3 selected\./)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(within(timeline).getAllByRole("button")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(within(timeline).getAllByRole("button")).toHaveLength(3);
  expect(screen.getByText(/3 selected\./)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Redo" }));
  expect(within(timeline).getAllByRole("button")).toHaveLength(1);
});
it("surfaces save failures and blocks global navigation", async () => {
  const { prepareNavigation } = await import("@/workspace/navigation");
  vi.mocked(saveAnimation).mockRejectedValueOnce(
    new Error("Storage quota exceeded"),
  );
  render(<Animation />);
  await screen.findByRole("list", { name: "Animation frames" });
  fireEvent.click(screen.getByRole("button", { name: "Save locally" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Storage quota exceeded",
    ),
  );
  vi.mocked(saveAnimation).mockRejectedValueOnce(
    new Error("Storage quota exceeded"),
  );
  await expect(prepareNavigation()).rejects.toThrow("Storage quota exceeded");
});
