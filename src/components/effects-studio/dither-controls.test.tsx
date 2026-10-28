import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { createStudioController } from "./controller";
import { Properties } from "./properties";
import { bindStyleProject } from "./style-adapter";
it("exposes all 15 algorithms and the independent Dither controls", () => {
  const c = createStudioController();
  c.selectStyle("dither");
  render(
    <Properties
      controller={c}
      snapshot={c.getSnapshot()}
      close={() => {}}
      collapse={() => {}}
    />,
  );
  const algorithms = screen.getByRole("combobox", { name: "Algorithm" });
  expect(algorithms.querySelectorAll("option")).toHaveLength(15);
  expect(algorithms).toHaveValue("floyd");
  for (const name of [
    "Pixel Size",
    "Strength",
    "Contrast",
    "Threshold",
    "Angle",
  ])
    expect(screen.getByRole("slider", { name })).toBeVisible();
  expect(
    screen.queryByRole("slider", { name: "Cell Size" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/animation.*unavailable/i)).toBeVisible();
});
it("keeps malformed palette drafts local, preserves order and restores the whole look on undo", () => {
  const c = createStudioController();
  c.selectStyle("dither");
  c.patchParameter("ditherPalette", "custom");
  const view = () => (
    <Properties
      controller={c}
      snapshot={c.getSnapshot()}
      close={() => {}}
      collapse={() => {}}
    />
  );
  const r = render(view());
  const input = screen.getByRole("textbox", { name: "Custom Palette" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "#ff0000, broken" } });
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(c.getSnapshot().project.style.parameters.ditherCustomPalette).toEqual([
    "#000000",
    "#ffffff",
  ]);
  fireEvent.change(input, { target: { value: "#ff0000, #0000ff, #00ff00" } });
  fireEvent.blur(input);
  expect(c.getSnapshot().project.style.parameters.ditherCustomPalette).toEqual([
    "#ff0000",
    "#0000ff",
    "#00ff00",
  ]);
  c.undo();
  r.rerender(view());
  expect(input).toHaveValue("#000000, #ffffff");
  const p = c.getSnapshot().project;
  expect(
    bindStyleProject(
      { ...p, source: { id: "s", revision: 1, width: 2, height: 3 } },
      1,
    ).parameters.dither,
  ).toMatchObject({ algorithm: "floyd", contrast: 110, palette: "custom" });
});
