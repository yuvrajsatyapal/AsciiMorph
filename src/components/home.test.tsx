import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Home from "./home";
describe("homepage demo", () => {
  it("introduces the product and links to the rebuilt effects Studio", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: "Your Imagination. In Characters." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Launch Studio" })).toHaveAttribute(
      "href",
      "/app",
    );
    expect(screen.getByRole("link", { name: "Open Studio" })).toHaveAttribute(
      "href",
      "/app",
    );
  });
  it("changes the real preview and carries choices to the studio", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Use + character" }));
    expect(screen.getByTestId("ascii-demo").textContent).toContain("+");
    fireEvent.click(screen.getByRole("button", { name: "Use mint color" }));
    expect(
      screen.getByRole("link", { name: /Edit this artwork/ }),
    ).toHaveAttribute("href", "/studio?demo=orbit&char=%2B&color=91D3BD");
  });
});
