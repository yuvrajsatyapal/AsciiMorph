import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import StudioShell from "./studio-shell";
afterEach(() => window.history.replaceState({}, "", "/"));
describe("studio foundation", () => {
  it("opens a blank canvas and restores settings focus", async () => {
    render(<StudioShell />);
    expect(
      screen.getByLabelText("Blank canvas, 80 by 40 characters"),
    ).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Canvas settings" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "Canvas settings" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it("materializes demo query settings into a real document preview", async () => {
    window.history.replaceState(
      {},
      "",
      "/studio?demo=orbit&char=%2B&color=91D3BD",
    );
    render(<StudioShell />);
    const art = await screen.findByLabelText(
      "Orbit artwork, 65 by 26 characters",
    );
    expect(art.textContent).toContain("+");
    expect(art).toHaveStyle({ color: "#91D3BD" });
    expect(screen.getByTestId("document-name")).toHaveTextContent("Orbit");
  });
  it("provides library and canvas panels from compact navigation", () => {
    render(<StudioShell />);
    fireEvent.click(screen.getByRole("button", { name: "Open library" }));
    expect(screen.getByRole("dialog", { name: "Library" })).toHaveTextContent(
      "characters",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Open canvas panel" }));
    expect(
      screen.getByRole("dialog", { name: "Canvas settings" }),
    ).toHaveTextContent("80 × 40");
  });
});
