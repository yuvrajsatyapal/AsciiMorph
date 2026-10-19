import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Settings } from "./settings";
import { DEFAULT_SETTINGS } from "@/converter/settings";
it("shows the actual aspect-corrected grid height and wires real settings", () => {
  const update = vi.fn();
  render(
    <Settings
      s={DEFAULT_SETTINGS}
      update={update}
      busy={false}
      dimensions={{ width: 80, height: 20 }}
    />,
  );
  expect(screen.getByLabelText("Output height")).toHaveValue(20);
  expect(screen.getByLabelText("Output height")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Brightness"), {
    target: { value: "25" },
  });
  expect(update).toHaveBeenLastCalledWith({ brightness: 25 });
  fireEvent.change(screen.getByLabelText("Character set"), {
    target: { value: "braille" },
  });
  expect(update).toHaveBeenLastCalledWith({ charset: "braille" });
});
