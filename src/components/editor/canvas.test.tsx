import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createRef } from "react";
import { EditorCanvas } from "./canvas";
import { createDocument } from "@/core/document";
vi.mock("@/core/render", () => ({
  paint: vi.fn(),
  documentText: () => "",
  ensureArtworkFont: async () => {},
  backingSize: () => ({ width: 18, height: 18 }),
  previewPixelRatio: () => 1,
}));
it("cancels drawing for two-finger pinch and does not commit a partial stroke", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const onZoom = vi.fn(),
    onDown = vi.fn(),
    onUp = vi.fn(),
    onMove = vi.fn(),
    onCancel = vi.fn();
  render(
    <EditorCanvas
      doc={createDocument(2, 1)}
      caret={{ x: 0, y: 0 }}
      selection={null}
      zoom={1}
      grid={false}
      monochrome={false}
      viewportRef={createRef()}
      onZoom={onZoom}
      onDown={onDown}
      onMove={onMove}
      onUp={onUp}
      onCancel={onCancel}
      onKey={() => {}}
      onError={() => {}}
    />,
  );
  const input = screen.getByTestId("canvas-input");
  input.setPointerCapture = vi.fn();
  const pointer = (type: string, id: number, x: number) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: 10,
    });
    Object.defineProperties(event, {
      pointerId: { value: id },
      pointerType: { value: "touch" },
    });
    fireEvent(input, event);
  };
  pointer("pointerdown", 1, 10);
  pointer("pointerdown", 2, 30);
  pointer("pointermove", 2, 50);
  expect(onDown).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onZoom).toHaveBeenLastCalledWith(2);
  expect(onMove).not.toHaveBeenCalled();
  pointer("pointerup", 1, 10);
  pointer("pointermove", 2, 60);
  pointer("pointerup", 2, 60);
  expect(onUp).not.toHaveBeenCalled();
});
