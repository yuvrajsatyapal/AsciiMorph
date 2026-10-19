import { describe, it, expect } from "vitest";
import {
  blankCell,
  createDocument,
  graphemes,
  parseDocument,
  serializeDocument,
  validateDocument,
} from "./document";

describe("versioned documents", () => {
  it("creates independent blank cells with the agreed dimensions and metrics", () => {
    const doc = createDocument();
    expect(doc).toMatchObject({
      version: 1,
      width: 80,
      height: 40,
      cellWidth: 9,
      cellHeight: 18,
      fontSize: 14,
      background: null,
    });
    expect(doc.layers).toHaveLength(1);
    expect(doc.layers[0].cells).toHaveLength(3200);
    expect(doc.layers[0].cells[0]).toEqual(blankCell());
    expect(doc.layers[0].cells[0]).not.toBe(doc.layers[0].cells[1]);
    expect(createDocument().id).not.toBe(doc.id);
  });
  it("round trips colored Unicode and backgrounds", () => {
    const doc = createDocument(2, 1, "My drawing");
    doc.layers[0].cells[0] = {
      char: "👩🏽‍💻",
      fg: "#abcdef",
      bg: "#010203",
      alpha: 0.3,
    };
    expect(parseDocument(serializeDocument(doc))).toEqual(doc);
    expect(graphemes("a👩🏽‍💻é")).toEqual(["a", "👩🏽‍💻", "é"]);
  });
  it("normalizes empty glyphs and strips unrecognized properties", () => {
    const doc = createDocument(1, 1);
    doc.layers[0].cells[0].char = "";
    expect(
      validateDocument({ ...doc, untrusted: "no" }).layers[0].cells[0].char,
    ).toBe(" ");
    expect(validateDocument({ ...doc, untrusted: "no" })).not.toHaveProperty(
      "untrusted",
    );
  });
  it.each([
    [0, 40],
    [301, 1],
    [300, 300],
    [1.1, 2],
    [NaN, 3],
  ])("rejects unsafe dimensions %s × %s", (w, h) => {
    expect(() => createDocument(w, h)).toThrow();
  });
  it("rejects malformed cells, layers and metadata", () => {
    const doc = createDocument(1, 1);
    for (const patch of [
      { version: 2 },
      { layers: [] },
      { name: "x".repeat(121) },
      { cellWidth: 0 },
      { updatedAt: "bad" },
      { background: "url(x)" },
    ]) {
      expect(() => validateDocument({ ...doc, ...patch })).toThrow();
    }
    for (const patch of [
      { char: "ab" },
      { fg: "red" },
      { alpha: 2 },
      { alpha: NaN },
      { bg: "<script>" },
    ]) {
      expect(() =>
        validateDocument({
          ...doc,
          layers: [{ ...doc.layers[0], cells: [{ ...blankCell(), ...patch }] }],
        }),
      ).toThrow();
    }
    expect(() =>
      validateDocument({ ...doc, layers: [{ ...doc.layers[0], cells: [] }] }),
    ).toThrow();
    expect(() => parseDocument("{")).toThrow();
    expect(() => validateDocument(null)).toThrow();
  });
});
