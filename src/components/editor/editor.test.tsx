import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createDocument } from "@/core/document";
import { workspace } from "@/editor/store";
import * as persistence from "@/editor/persistence";
import Editor from "./editor";
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./canvas", () => ({ EditorCanvas: () => <div>Drawing surface</div> }));
beforeEach(() => {
  window.history.replaceState({}, "", "/studio");
  workspace.setState({ documents: {}, activeId: null, past: [], future: [] });
});
afterEach(() => vi.restoreAllMocks());
it("keeps the recovery download dialog open if saving before restore fails", async () => {
  const d = createDocument(3, 2);
  await persistence.saveProject(d);
  workspace.getState().open(d);
  render(<Editor />);
  await screen.findByRole("button", { name: "Recovery & projects" });
  fireEvent.click(screen.getByRole("button", { name: "Recovery & projects" }));
  const restore = await screen.findByRole("button", { name: /^Restore / });
  vi.spyOn(persistence, "saveProject").mockRejectedValueOnce(
    new Error("Quota exceeded"),
  );
  fireEvent.click(restore);
  await waitFor(() =>
    expect(
      screen.getByRole("dialog", { name: "Keep your current work" }),
    ).toBeInTheDocument(),
  );
  expect(
    screen.getByRole("button", { name: "Download current project" }),
  ).toBeInTheDocument();
  expect(workspace.getState().activeId).toBe(d.id);
});
it("does not replace unsaved artwork with the stale saved copy of the current project", async () => {
  const old = createDocument(3, 2);
  const edited = {
    ...old,
    layers: [
      {
        ...old.layers[0],
        cells: old.layers[0].cells.map((c, i) =>
          i === 0 ? { ...c, char: "#" } : c,
        ),
      },
    ],
  };
  workspace.getState().open(edited);
  vi.spyOn(persistence, "listProjects").mockResolvedValue([old]);
  render(<Editor />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Recovery & projects" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: /Open .*saved project/ }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No other saved projects",
    ),
  );
  expect(workspace.getState().documents[old.id].layers[0].cells[0].char).toBe(
    "#",
  );
});

it("flushes the pending draft before converter navigation and stays on save failure", async () => {
  const d = createDocument(3, 2);
  workspace.getState().open(d);
  render(<Editor />);
  const button = await screen.findByRole("button", { name: "Convert image" });
  vi.spyOn(persistence, "saveProject").mockRejectedValueOnce(
    new Error("Quota exceeded"),
  );
  fireEvent.click(button);
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Quota exceeded"),
  );
  expect(push).not.toHaveBeenCalled();
  fireEvent.click(button);
  await waitFor(() => expect(push).toHaveBeenCalledWith("/convert"));
  expect(await persistence.readProject(d.id)).toEqual(d);
});
