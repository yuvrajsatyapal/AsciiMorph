import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { createStudioController } from "./controller";
import {
  StudioShell,
  readStudioPreferences,
  writeStudioPreferences,
} from "./studio";
import { CATALOG, CATEGORIES } from "./catalog-data";
import type { StudioRuntime } from "./runtime";

function setup(frameFailure = false) {
  const controller = createStudioController();
  const accepted = {
    identity: {},
    frame: { width: 1, height: 1, rgba: new Uint8Array(4) },
  };
  const runtime = {
    controller,
    getSnapshot: controller.getSnapshot,
    getFrame: () => (frameFailure ? accepted : null),
    getOriginal: () => null,
    retainCanvas: () => () => {},
  } as unknown as StudioRuntime;
  function Host() {
    const snapshot = useSyncExternalStore(
      controller.subscribe,
      controller.getSnapshot,
    );
    return <StudioShell runtime={runtime} snapshot={snapshot} />;
  }
  return { controller, ...render(<Host />) };
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
it("publishes 105 canonical tiles in 96 modes and ten categories", () => {
  expect(CATALOG).toHaveLength(105);
  expect(new Set(CATALOG.map((t) => t.mode)).size).toBe(96);
  expect(CATEGORIES).toHaveLength(10);
  expect(CATALOG[0]).toMatchObject({
    id: "characters",
    label: "Characters",
    available: true,
  });
  expect(CATALOG.filter((t) => t.available)).toHaveLength(1);
});
it("filters category, search and favorites independently from selecting", () => {
  const { controller } = setup();
  fireEvent.change(screen.getByLabelText("Search styles"), {
    target: { value: "Cyanotype" },
  });
  expect(
    screen.getByRole("button", { name: "Cyanotype — unavailable" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Favorite Cyanotype" }));
  expect(controller.getSnapshot().project.style.id).toBe("characters");
  fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
  expect(
    screen.getByRole("button", { name: "Unfavorite Cyanotype" }),
  ).toHaveAttribute("aria-pressed", "true");
  fireEvent.change(screen.getByLabelText("Category"), {
    target: { value: "ascii" },
  });
  expect(
    screen.getByText(
      "No styles match. Try another category or clear your search.",
    ),
  ).toBeVisible();
});
it("binds exactly four parameters, groups range edits, preserves invalid drafts and trailing space", () => {
  const { controller } = setup();
  const size = screen.getByRole("slider", { name: "Font Size" });
  fireEvent.pointerDown(size);
  fireEvent.change(size, { target: { value: 12 } });
  fireEvent.change(size, { target: { value: 13 } });
  fireEvent.pointerUp(size);
  expect(controller.getSnapshot().history.undoCount).toBe(1);
  const ramp = screen.getByLabelText("Character Set");
  fireEvent.focus(ramp);
  fireEvent.change(ramp, { target: { value: "a" } });
  expect(controller.getSnapshot().project.style.parameters.charSet).toBe(
    "@#S08Xx+=-;:. ",
  );
  expect(ramp).toHaveAttribute("aria-invalid", "true");
  fireEvent.change(ramp, { target: { value: "á🙂 " } });
  fireEvent.blur(ramp);
  expect(controller.getSnapshot().project.style.parameters.charSet).toBe(
    "á🙂 ",
  );
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(ramp).toHaveValue("@#S08Xx+=-;:. ");
  fireEvent.click(screen.getByRole("button", { name: "Color controls" }));
  expect(screen.getByRole("slider", { name: "Brightness" })).toHaveValue("0");
  expect(screen.getByRole("slider", { name: "Contrast" })).toHaveValue("20");
});
it("keeps a closed dock mounted inert and restores focus; resizes with arrow keys", () => {
  const { controller } = setup();
  fireEvent.keyDown(
    screen.getByRole("separator", { name: "Resize style catalog" }),
    { key: "ArrowRight" },
  );
  expect(controller.getSnapshot().view.catalogWidth).toBe(330);
  fireEvent.click(screen.getByRole("button", { name: "Close controls" }));
  const dock = screen.getByTestId("properties-dock");
  expect(dock).toHaveAttribute("inert");
  expect(dock).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByRole("button", { name: "Open controls" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Open controls" }));
  expect(dock).not.toHaveAttribute("inert");
});
it("releases hold compare without click reenabling and keeps a separate toggle", () => {
  const { controller } = setup();
  const hold = screen.getByRole("button", { name: "Hold to compare" });
  fireEvent.pointerDown(hold);
  expect(controller.getSnapshot().view.compare).toBe(true);
  fireEvent.pointerUp(hold);
  fireEvent.click(hold);
  expect(controller.getSnapshot().view.compare).toBe(false);
  fireEvent.click(
    screen.getByRole("button", { name: "Toggle original comparison" }),
  );
  expect(controller.getSnapshot().view.compare).toBe(true);
  fireEvent.blur(window);
  expect(controller.getSnapshot().view.compare).toBe(false);
});
it("offers working help/menu and honest unavailable export", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Help" }));
  expect(screen.getByRole("dialog", { name: "Studio help" })).toBeVisible();
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  expect(
    screen.getByRole("link", { name: "Open legacy Studio" }),
  ).toHaveAttribute("href", "/studio");
  expect(screen.getByText(/Leaving this page loses/)).toBeVisible();
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Export" }));
  expect(
    within(screen.getByRole("dialog", { name: "Export image" })).getByText(
      /encoding is not available/,
    ),
  ).toBeVisible();
});
it("validates preferences and ignores unavailable storage without storing source bytes", () => {
  localStorage.setItem(
    "asciimorph:studio:ui:v1",
    JSON.stringify({
      version: 1,
      favorites: ["characters", "bogus"],
      catalogWidth: 999,
    }),
  );
  expect(readStudioPreferences()).toEqual({});
  const { controller } = setup();
  act(() =>
    controller.setView({ favorites: ["characters"], catalogWidth: 360 }),
  );
  writeStudioPreferences(controller.getSnapshot().view);
  const stored = localStorage.getItem("asciimorph:studio:ui:v1")!;
  expect(stored).not.toMatch(/source|rgba|project/);
  expect(readStudioPreferences()).toMatchObject({
    favorites: ["characters"],
    catalogWidth: 360,
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("quota");
  });
  expect(() =>
    writeStudioPreferences(controller.getSnapshot().view),
  ).not.toThrow();
});
it("coarse sheets are exclusive, trap focus, escape and restore scroll and trigger", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const { controller } = setup();
  document.body.style.overflow = "auto";
  const trigger = screen.getByRole("button", { name: "Styles" });
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog", { name: "Styles sheet" })).toBeVisible();
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(controller.getSnapshot().view.mobileSheet).toBeNull();
  expect(document.body.style.overflow).toBe("auto");
  expect(trigger).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Controls" }));
  expect(screen.getByRole("dialog", { name: "Controls sheet" })).toBeVisible();
  expect(screen.queryByRole("dialog", { name: "Styles sheet" })).toBeNull();
});

it("undo synchronizes an invalid ramp draft even when the ramp value itself was unchanged", () => {
  const { controller } = setup();
  act(() => controller.patchParameter("fontSize", 12));
  const ramp = screen.getByLabelText("Character Set");
  fireEvent.focus(ramp);
  fireEvent.change(ramp, { target: { value: "x" } });
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(ramp).toHaveValue("@#S08Xx+=-;:. ");
});
it("commits a pointer range edit released outside the input", () => {
  const { controller } = setup();
  const size = screen.getByRole("slider", { name: "Font Size" });
  fireEvent.pointerDown(size);
  fireEvent.change(size, { target: { value: 12 } });
  fireEvent.pointerUp(window);
  expect(controller.getSnapshot().history.editing).toBe(false);
  expect(controller.getSnapshot().history.undoCount).toBe(1);
});
it("shows an actual canvas paint failure with a retry action", () => {
  const context = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(null);
  setup(true);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Preview could not be painted",
  );
  expect(screen.getByRole("button", { name: "Retry preview" })).toBeEnabled();
  context.mockRestore();
});
it("a persistent comparison toggle can turn off after a complete pointer gesture", () => {
  const { controller } = setup();
  const toggle = screen.getByRole("button", {
    name: "Toggle original comparison",
  });
  fireEvent.pointerDown(toggle);
  fireEvent.pointerUp(toggle);
  fireEvent.click(toggle);
  expect(controller.getSnapshot().view.compare).toBe(true);
  fireEvent.pointerDown(toggle);
  fireEvent.pointerUp(toggle);
  fireEvent.click(toggle);
  expect(controller.getSnapshot().view.compare).toBe(false);
});
it("releases keyboard compare when keyup occurs outside its button", () => {
  const { controller } = setup();
  fireEvent.keyDown(screen.getByRole("button", { name: "Hold to compare" }), {
    key: " ",
  });
  expect(controller.getSnapshot().view.compare).toBe(true);
  fireEvent.keyUp(window, { key: " " });
  expect(controller.getSnapshot().view.compare).toBe(false);
});
it("does not end a text edit when the pointer that focused the ramp is released", () => {
  const { controller } = setup();
  const ramp = screen.getByLabelText("Character Set");
  fireEvent.focus(ramp);
  fireEvent.pointerUp(window);
  fireEvent.change(ramp, { target: { value: "@# " } });
  fireEvent.change(ramp, { target: { value: "@#x " } });
  expect(controller.getSnapshot().history.undoCount).toBe(0);
  fireEvent.blur(ramp);
  expect(controller.getSnapshot().history.undoCount).toBe(1);
});
it("keeps native text-entry undo separate while toolbar commits an active edit", () => {
  const { controller } = setup();
  const ramp = screen.getByLabelText("Character Set");
  fireEvent.focus(ramp);
  fireEvent.change(ramp, { target: { value: "@#x " } });
  const revision = controller.getSnapshot().revision;
  const native = new KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  ramp.dispatchEvent(native);
  expect(native.defaultPrevented).toBe(false);
  expect(controller.getSnapshot().revision).toBe(revision);
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(controller.getSnapshot().project.style.parameters.charSet).toBe(
    "@#S08Xx+=-;:. ",
  );
});
it("traps sheet Tab, closes on scrim and retains the selected control group", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const { controller, container } = setup();
  const trigger = screen.getByRole("button", { name: "Controls" });
  fireEvent.click(trigger);
  const sheet = screen.getByRole("dialog", { name: "Controls sheet" });
  const close = within(sheet).getByRole("button", { name: "Close panel" });
  close.focus();
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(within(sheet).getByLabelText("Character Set")).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(close).toHaveFocus();
  fireEvent.click(
    within(sheet).getByRole("button", { name: "Color controls" }),
  );
  expect(controller.getSnapshot().view.activeGroup).toBe("color");
  fireEvent.pointerDown(container.querySelector(".studio-sheet-layer")!);
  expect(controller.getSnapshot().view.mobileSheet).toBeNull();
  expect(trigger).toHaveFocus();
});
it("constrains keyboard resizing and retains dock group after collapse and reopen", () => {
  const { controller } = setup();
  const separator = screen.getByRole("separator", {
    name: "Resize style catalog",
  });
  fireEvent.keyDown(separator, { key: "End" });
  fireEvent.keyDown(separator, { key: "ArrowRight" });
  expect(controller.getSnapshot().view.catalogWidth).toBe(420);
  fireEvent.keyDown(separator, { key: "Home" });
  fireEvent.keyDown(separator, { key: "ArrowLeft" });
  expect(controller.getSnapshot().view.catalogWidth).toBe(240);
  fireEvent.click(screen.getByRole("button", { name: "Color controls" }));
  fireEvent.click(screen.getByRole("button", { name: "Collapse controls" }));
  expect(screen.getByRole("button", { name: "Open controls" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Open controls" }));
  expect(screen.getByRole("slider", { name: "Contrast" })).toHaveValue("20");
});
it("uses the smaller viewport dimension to open sheets for a coarse landscape phone", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches:
        query.includes("(pointer: coarse)") &&
        query.includes("(max-height: 800px)"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  setup();
  expect(screen.getByRole("button", { name: "Controls" })).toBeVisible();
});

it.each(["Styles", "Controls"])(
  "replaces the %s sheet with one Menu focus owner and restores scroll and its trigger",
  async (sheetName) => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const user = userEvent.setup();
    const { controller } = setup();
    document.body.style.overflow = "auto";
    await user.click(screen.getByRole("button", { name: sheetName }));
    expect(document.body.style.overflow).toBe("hidden");
    const menu = screen.getByRole("button", { name: "Menu" });
    await user.click(menu);
    await user.tab();
    expect(
      screen.getByRole("link", { name: "Open legacy Studio" }),
    ).toHaveFocus();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(controller.getSnapshot().view.mobileSheet).toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(menu).toHaveFocus();
    expect(document.body.style.overflow).toBe("auto");
  },
);
