import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { createStudioController } from "./controller";
import { Properties } from "./properties";

it("shows only applicable Mosaic controls", () => {
  const controller = createStudioController();
  controller.selectStyle("mosaic");
  render(
    <Properties
      controller={controller}
      snapshot={controller.getSnapshot()}
      close={() => {}}
      collapse={() => {}}
    />,
  );
  expect(screen.getByRole("slider", { name: "Cell Size" })).toBeVisible();
  expect(screen.getByRole("combobox", { name: "Tile Shape" })).toBeVisible();
  expect(
    screen.getByRole("checkbox", { name: "Invert Mapping" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("textbox", { name: "Character Set" }),
  ).not.toBeInTheDocument();
});

it("exposes Braille cell, invert, opacity and threshold controls", () => {
  const controller = createStudioController();
  controller.selectStyle("braille");
  render(
    <Properties
      controller={controller}
      snapshot={controller.getSnapshot()}
      close={() => {}}
      collapse={() => {}}
    />,
  );
  for (const name of ["Cell Size", "Opacity", "Local profile threshold"])
    expect(screen.getByRole("slider", { name })).toBeVisible();
  expect(
    screen.getByRole("checkbox", { name: "Invert Mapping" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("textbox", { name: "Character Set" }),
  ).not.toBeInTheDocument();
});
