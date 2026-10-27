import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CropDialogContent, fitCropRatio } from "./crop-dialog";
import { createStudioController } from "./controller";

describe("crop draft", () => {
  it("fits source-space ratios and preserves bounds", () => {
    expect(fitCropRatio(400, 200, 1)).toEqual({
      x: 0.25,
      y: 0,
      width: 0.5,
      height: 1,
    });
    expect(fitCropRatio(200, 400, 1)).toEqual({
      x: 0,
      y: 0.25,
      width: 1,
      height: 0.5,
    });
  });
  it("keeps edits local on cancel, validates and applies once", () => {
    const controller = createStudioController();
    const before = controller.getSnapshot().project;
    const close = vi.fn();
    const apply = vi.spyOn(controller, "setGeometry");
    render(
      <CropDialogContent
        controller={controller}
        snapshot={controller.getSnapshot()}
        close={close}
      />,
    );
    fireEvent.change(screen.getByLabelText("Width (%)"), {
      target: { value: "0" },
    });
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(controller.getSnapshot().project).toBe(before);
    expect(apply).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Width (%)"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rotate clockwise" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().project.rotation).toBe(90);
    controller.undo();
    expect(controller.getSnapshot().project.crop).toEqual(before.crop);
    expect(controller.getSnapshot().project.rotation).toBe(0);
  });
  it("closes when applying unchanged valid geometry", () => {
    const c = createStudioController(),
      close = vi.fn();
    render(
      <CropDialogContent
        controller={c}
        snapshot={c.getSnapshot()}
        close={close}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(close).toHaveBeenCalledOnce();
    expect(c.getSnapshot().history.undoCount).toBe(0);
  });
  it("refuses invalid geometry without changing project", () => {
    const c = createStudioController();
    const before = c.getSnapshot().project;
    expect(c.setGeometry({ x: 0.9, y: 0, width: 0.5, height: 1 }, 90)).toBe(
      false,
    );
    expect(c.getSnapshot().project).toBe(before);
    expect(c.getSnapshot().error?.stage).toBe("parameter");
  });
});
