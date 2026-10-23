import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useSyncExternalStore } from "react";
import type { StudioAdapters } from "./controller";
import { createStudioController } from "./controller";
import type { StudioRuntime } from "./runtime";
import { ExportDialogContent } from "./export-dialog";
function setup() {
  let finish!: () => void;
  const pending = new Promise<void>((r) => {
    finish = r;
  });
  const exportStill = vi.fn<NonNullable<StudioAdapters["exportStill"]>>(
    async () => pending,
  );
  const controller = createStudioController({
    project: {
      version: 1,
      id: "p",
      name: "test",
      source: { id: "s", revision: 1, width: 13, height: 7 },
      crop: { x: 0, y: 0, width: 1, height: 1 },
      rotation: 0,
      style: {
        id: "characters",
        parameters: {
          fontSize: 11,
          charSet: " .:-=+*#%@",
          brightness: 0,
          contrast: 0,
        },
      },
      effects: [],
      masks: [],
      text: [],
      seed: 0,
      timeUs: 0,
      export: {
        format: "png",
        scale: 1,
        fps: 30,
        durationUs: 0,
        quality: 1,
        audio: false,
      },
    },
    adapters: { exportStill },
  });
  const runtime = {
    controller,
    exportAvailability: ({ scale }: { scale: number }) =>
      scale > 2
        ? {
            available: false,
            reason: "Export exceeds the 256 MiB session budget",
          }
        : { available: true, reason: "", width: 13 * scale, height: 7 * scale },
  } as unknown as StudioRuntime;
  function Host() {
    const snapshot = useSyncExternalStore(
      controller.subscribe,
      controller.getSnapshot,
    );
    return <ExportDialogContent runtime={runtime} snapshot={snapshot} />;
  }
  return { controller, exportStill, finish, ...render(<Host />) };
}
it("offers real PNG/JPEG and full-frame scale reasons while animated formats remain unavailable", () => {
  setup();
  expect(screen.getByLabelText("Format")).toHaveValue("png");
  expect(screen.getByRole("option", { name: /3×.*budget/ })).toBeDisabled();
  expect(screen.getByText(/13 × 7 pixels/)).toBeVisible();
  expect(screen.getByText(/Animated formats.*unavailable/)).toBeVisible();
  fireEvent.change(screen.getByLabelText("Format"), {
    target: { value: "jpeg" },
  });
  expect(screen.getByText(/black matte/)).toBeVisible();
});
it("starts captured export, exposes cancellation settling and re-enables retry only after settlement", async () => {
  const h = setup();
  fireEvent.change(screen.getByLabelText("Scale"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Export PNG" }));
  expect(h.exportStill.mock.calls[0][0].options).toEqual({
    format: "png",
    scale: 2,
  });
  expect(screen.getByRole("status")).toHaveTextContent("Rendering full image");
  expect(screen.getByLabelText("Scale")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel export" }));
  expect(screen.getByRole("status")).toHaveTextContent(/Canceling.*finishing/);
  expect(screen.getByRole("button", { name: "Export PNG" })).toBeDisabled();
  await act(async () => {
    h.finish();
    await pendingTick();
  });
  expect(screen.getByRole("button", { name: "Export PNG" })).toBeEnabled();
});
it("shows failures and retries the selected settings", async () => {
  const h = setup();
  h.exportStill.mockRejectedValueOnce(new Error("Encoder returned wrong MIME"));
  fireEvent.click(screen.getByRole("button", { name: "Export PNG" }));
  await act(pendingTick);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Encoder returned wrong MIME",
  );
  expect(screen.getByRole("button", { name: "Retry export" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry export" }));
  await act(async () => {
    h.finish();
    await pendingTick();
  });
  expect(screen.getByRole("status")).toHaveTextContent("Download started");
});
async function pendingTick() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}
