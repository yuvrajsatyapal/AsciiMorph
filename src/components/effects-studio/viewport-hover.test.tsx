import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createStudioController } from "./controller";
import type { StudioRuntime } from "./runtime";
import { StudioViewport } from "./viewport";

it("shows exactly one stage canvas for accepted, translucent hover, and Compare states", () => {
  const snapshot = createStudioController().getSnapshot();
  let hovered = false;
  const runtime = {
    subscribe: () => () => {},
    getHoverRevision: () => 0,
    getHoverFrame: () => hovered ? { version: 1, width: 1, height: 1,
      rgba: new Uint8Array([255, 0, 0, 128]) } : null,
  } as unknown as StudioRuntime;
  function visibility(compare: boolean) {
    const markup = renderToStaticMarkup(<StudioViewport runtime={runtime}
      snapshot={{ ...snapshot, view: { ...snapshot.view, compare } }} />);
    const root = new DOMParser().parseFromString(markup, "text/html");
    return ["Rendered Characters preview", "Transient style hover preview", "Original source comparison"]
      .map((label) => root.querySelector(`canvas[aria-label="${label}"]`)?.getAttribute("style")?.match(/visibility:(visible|hidden)/)?.[1]);
  }
  expect(visibility(false)).toEqual(["visible", "hidden", "hidden"]);
  hovered = true;
  expect(visibility(false)).toEqual(["hidden", "visible", "hidden"]);
  expect(visibility(true)).toEqual(["hidden", "hidden", "visible"]);
  hovered = false;
  expect(visibility(false)).toEqual(["visible", "hidden", "hidden"]);
});
