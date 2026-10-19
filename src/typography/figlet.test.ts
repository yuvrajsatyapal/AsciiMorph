import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFiglet, renderTypography, typographyDocument } from "./figlet";
import { documentText } from "@/core/render";
import { validateDocument } from "@/core/document";
const source = readFileSync("public/fonts/figlet/morph-grid.flf", "utf8");
describe("licensed FIGlet typography", () => {
  it("reads actual glyphs and hardblanks from the bundled font", () => {
    const font = parseFiglet(source);
    expect(font.height).toBe(5);
    expect(font.glyphs.get("A")).toEqual([
      " ### ",
      "#   #",
      "#####",
      "#   #",
      "#   #",
    ]);
    expect(font.glyphs.get(" ")?.[0]).toBe("   ");
  });
  it("lays out multiple lines with spacing and center/right alignment", () => {
    const font = parseFiglet(source);
    const left = renderTypography(font, "AA\nA", {
      alignment: "left",
      spacing: 2,
    });
    expect(left[0].length).toBe(12);
    expect(left[6]).toBe(" ###        ");
    const right = renderTypography(font, "AA\nA", {
      alignment: "right",
      spacing: 2,
    });
    expect(right[6]).toBe("        ### ");
    const center = renderTypography(font, "AA\nA", {
      alignment: "center",
      spacing: 2,
    });
    expect(center[6]).toBe("    ###     ");
  });
  it("produces a validated colored document compatible with Studio and exports", () => {
    const font = parseFiglet(source);
    const doc = typographyDocument(font, "MORPH", {
      foreground: "#ffffff",
      background: "#111111",
      spacing: 1,
    });
    expect(validateDocument(doc)).toEqual(doc);
    expect(doc.layers[0].cells.every((cell) => cell.fg === "#ffffff")).toBe(
      true,
    );
    expect(documentText(doc)).toContain("#");
  });
  it("rejects broken fonts, unsupported characters and oversized layouts", () => {
    expect(() => parseFiglet("garbage")).toThrow(/FIGlet/);
    expect(() => parseFiglet(source.slice(0, 100))).toThrow();
    const font = parseFiglet(source);
    expect(() => renderTypography(font, "🦊")).toThrow(/Unsupported/);
    expect(() => renderTypography(font, "A".repeat(100))).toThrow(/300/);
    expect(() => renderTypography(font, "A", { spacing: NaN })).toThrow();
  });
});
