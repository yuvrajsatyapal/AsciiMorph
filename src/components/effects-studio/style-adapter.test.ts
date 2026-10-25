import { describe, expect, it } from "vitest";
import { createStudioController } from "./controller";
import { bindStyleProject, switchStyle } from "./style-adapter";

describe("accepted Studio styles", () => {
  it("retains only equal-domain shared controls and uses versioned target defaults", () => {
    const base = createStudioController().getSnapshot().project;
    const next = switchStyle(
      {
        ...base.style,
        parameters: { ...base.style.parameters, brightness: 7 },
      },
      "mosaic",
    );
    expect(next).toEqual({
      id: "mosaic",
      parameters: {
        fontSize: 11,
        brightness: 7,
        contrast: 20,
        invert: false,
        charOpacity: 100,
        mosaicShape: "square",
      },
    });
    expect(switchStyle(next, "characters").parameters).toEqual({
      fontSize: 11,
      charSet: "@#S08Xx+=-;:. ",
      brightness: 7,
      contrast: 20,
    });
    expect(() => switchStyle(next, "braille")).toThrow(/unavailable/i);
  });

  it("binds exact raster settings and refuses unsupported active operations", () => {
    const base = createStudioController().getSnapshot().project;
    const project = {
      ...base,
      source: { id: "s", revision: 1, width: 3, height: 2 },
      style: switchStyle(base.style, "pixel"),
    };
    expect(bindStyleProject(project, 2)).toMatchObject({
      styleId: "pixel",
      frameWidth: 6,
      frameHeight: 4,
      renderScale: 2,
      parameters: project.style.parameters,
    });
    expect(() =>
      bindStyleProject({ ...project, text: [{ enabled: true }] } as never, 1),
    ).toThrow(/unsupported/i);
  });
});
