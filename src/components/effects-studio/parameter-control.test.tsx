import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ParameterControl } from "./parameter-control";

it("validates number boundaries and groups keyboard edits", () => {
  const change = vi.fn(),
    begin = vi.fn(),
    commit = vi.fn();
  render(
    <ParameterControl
      descriptor={{
        key: "fontSize",
        label: "Cell Size",
        type: "number",
        default: 11,
        min: 3,
        max: 80,
        step: 1,
      }}
      value={11}
      onChange={change}
      onBeginEdit={begin}
      onCommitEdit={commit}
    />,
  );
  const input = screen.getByRole("slider", { name: "Cell Size" });
  fireEvent.keyDown(input, { key: "ArrowRight" });
  fireEvent.change(input, { target: { value: "12" } });
  fireEvent.keyUp(input, { key: "ArrowRight" });
  expect(begin).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenCalledWith(12);
  expect(commit).toHaveBeenCalledTimes(1);
});

it("validates select and boolean controls", () => {
  const change = vi.fn();
  const { rerender } = render(
    <ParameterControl
      descriptor={{
        key: "mosaicShape",
        label: "Tile Shape",
        type: "select",
        default: "square",
        options: [
          { value: "square", label: "Square" },
          { value: "wide", label: "Wide" },
        ],
      }}
      value="square"
      onChange={change}
      onBeginEdit={() => {}}
      onCommitEdit={() => {}}
    />,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Tile Shape" }), {
    target: { value: "wide" },
  });
  expect(change).toHaveBeenCalledWith("wide");
  rerender(
    <ParameterControl
      descriptor={{
        key: "invert",
        label: "Invert Mapping",
        type: "boolean",
        default: false,
      }}
      value={false}
      onChange={change}
      onBeginEdit={() => {}}
      onCommitEdit={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Invert Mapping" }));
  expect(change).toHaveBeenCalledWith(true);
});

it("explains unsupported palette controls accessibly", () => {
  render(
    <ParameterControl
      descriptor={{
        key: "palette",
        label: "Palette",
        type: "palette",
        default: [],
      }}
      value={[]}
      onChange={() => {}}
      onBeginEdit={() => {}}
      onCommitEdit={() => {}}
    />,
  );
  expect(screen.getByText(/unavailable/i)).toBeVisible();
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
});

it("rejects an invalid number step instead of exposing an inert slider", () => {
  render(
    <ParameterControl
      descriptor={{
        key: "bad",
        label: "Bad range",
        type: "number",
        default: 5,
        min: 0,
        max: 10,
        step: 0,
      }}
      value={5}
      onChange={() => {}}
      onBeginEdit={() => {}}
      onCommitEdit={() => {}}
    />,
  );
  expect(
    screen.queryByRole("slider", { name: "Bad range" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Bad range is unavailable",
  );
});

it("validates color value and groups its edit", () => {
  const change = vi.fn(),
    begin = vi.fn(),
    commit = vi.fn();
  const descriptor = {
    key: "ink",
    label: "Ink",
    type: "color" as const,
    default: "#102030",
  };
  const { rerender } = render(
    <ParameterControl
      descriptor={descriptor}
      value="#102030"
      onChange={change}
      onBeginEdit={begin}
      onCommitEdit={commit}
    />,
  );
  const input = document.querySelector<HTMLInputElement>(
    'input[type="color"]',
  )!;
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "#abcdef" } });
  fireEvent.blur(input);
  expect(change).toHaveBeenCalledWith("#abcdef");
  expect(begin).toHaveBeenCalledTimes(1);
  expect(commit).toHaveBeenCalledTimes(1);
  rerender(
    <ParameterControl
      descriptor={descriptor}
      value="not-a-color"
      onChange={change}
      onBeginEdit={begin}
      onCommitEdit={commit}
    />,
  );
  expect(document.querySelector('input[type="color"]')).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Ink is unavailable");
});

it("groups pointer range edits until release", () => {
  const change = vi.fn(),
    begin = vi.fn(),
    commit = vi.fn();
  render(
    <ParameterControl
      descriptor={{
        key: "opacity",
        label: "Opacity",
        type: "number",
        default: 100,
        min: 0,
        max: 100,
      }}
      value={100}
      onChange={change}
      onBeginEdit={begin}
      onCommitEdit={commit}
    />,
  );
  const input = screen.getByRole("slider", { name: "Opacity" });
  fireEvent.pointerDown(input);
  fireEvent.change(input, { target: { value: "50" } });
  fireEvent.pointerUp(input);
  expect(begin).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenCalledWith(50);
  expect(commit).toHaveBeenCalledTimes(1);
});
