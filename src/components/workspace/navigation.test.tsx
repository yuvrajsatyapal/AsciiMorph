import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { WorkspaceNavigation } from "./navigation";
let path = "/studio";
vi.mock("next/navigation", () => ({
  usePathname: () => path,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/workspace/preferences", () => ({
  usePersistentState: () => [true, vi.fn()],
}));
it("removes legacy shortcuts and open dialogs on app and restores shortcuts after returning", () => {
  const view = render(<WorkspaceNavigation />);
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  path = "/app";
  view.rerender(<WorkspaceNavigation />);
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  expect(screen.queryByRole("dialog")).toBeNull();
  path = "/studio";
  view.rerender(<WorkspaceNavigation />);
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
