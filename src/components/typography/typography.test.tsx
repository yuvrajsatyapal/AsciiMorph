import { readFileSync } from "node:fs";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Typography from "./typography";
import Gallery from "@/components/gallery/gallery";
const { push, open, exportFile } = vi.hoisted(() => ({
  push: vi.fn(),
  open: vi.fn(async (...args: unknown[]) => args[0]),
  exportFile: vi.fn(async (...args: unknown[]) => new Blob([String(args[1])])),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/converter/handoff", () => ({ openInStudio: open }));
vi.mock("@/editor/persistence", () => ({
  listProjects: vi.fn(async () => []),
}));
vi.mock("@/core/exports", () => ({
  exportDocument: exportFile,
  downloadBlob: vi.fn(),
}));
vi.mock("@/core/render", async (original) => ({
  ...(await original<typeof import("@/core/render")>()),
  paint: vi.fn(),
  ensureArtworkFont: vi.fn(async () => {}),
}));
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      text: async () =>
        readFileSync("public/fonts/figlet/morph-grid.flf", "utf8"),
    })),
  );
});
describe("typography route", () => {
  it("renders local lettering, updates layout, exports, and saves before opening Studio", async () => {
    render(<Typography />);
    await screen.findByRole("button", { name: "Open in Studio" });
    fireEvent.change(screen.getByLabelText("Your text"), {
      target: { value: "A\nAA" },
    });
    fireEvent.change(screen.getByLabelText("Alignment"), {
      target: { value: "right" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(exportFile).toHaveBeenCalled());
    expect(exportFile.mock.calls[0]?.[1]).toBe("png");
    fireEvent.click(screen.getByRole("button", { name: "Open in Studio" }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith("/studio");
  });
  it("shows unsupported characters and prevents an invalid handoff", async () => {
    render(<Typography />);
    await screen.findByRole("button", { name: "Open in Studio" });
    fireEvent.change(screen.getByLabelText("Your text"), {
      target: { value: "🦊" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Unsupported");
    expect(
      screen.queryByRole("button", { name: "Open in Studio" }),
    ).not.toBeInTheDocument();
  });
});
describe("gallery route", () => {
  it("searches and persists a favorite, filters results, and previews a selected template", async () => {
    render(<Gallery />);
    const favorite = screen.getByRole("button", {
      name: "Favorite Orbital study",
    });
    await waitFor(() => expect(favorite).not.toBeDisabled());
    fireEvent.click(favorite);
    expect(
      screen.getByRole("button", { name: "Unfavorite Orbital study" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("asciimorph.gallery.favorites.v1")).toContain(
      "template:orbital",
    );
    fireEvent.click(screen.getByRole("button", { name: /Favorites/ }));
    expect(screen.getAllByRole("button", { name: /^Preview / })).toHaveLength(
      1,
    );
    fireEvent.change(screen.getByLabelText("Search gallery"), {
      target: { value: "no match" },
    });
    expect(screen.getByText("No matching creations.")).toBeInTheDocument();
  });
});
