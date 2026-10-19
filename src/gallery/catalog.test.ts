import { describe, expect, it } from "vitest";
import {
  templates,
  templateDocument,
  searchGallery,
  readFavorites,
  writeFavorites,
  galleryEntries,
} from "./catalog";
import { createDocument, validateDocument } from "@/core/document";
describe("local original gallery", () => {
  it("has original categorized templates that are valid editable projects", () => {
    expect(templates.length).toBeGreaterThanOrEqual(8);
    for (const template of templates)
      expect(validateDocument(templateDocument(template))).toBeTruthy();
    expect(
      new Set(templates.map((t) => t.category)).size,
    ).toBeGreaterThanOrEqual(3);
  });
  it("searches template and saved project names and categories", () => {
    const doc = createDocument(4, 4, "Personal moon");
    const entries = galleryEntries([doc]);
    expect(searchGallery(entries, "PERSONAL", "All")).toHaveLength(1);
    expect(searchGallery(entries, "", "My creations")[0].id).toBe(
      `project:${doc.id}`,
    );
    expect(searchGallery(entries, "orbital", "All").length).toBeGreaterThan(0);
  });
  it("validates persisted favorites and handles unavailable storage", () => {
    const storage = {
      getItem: () =>
        JSON.stringify([
          "template:orbital",
          14,
          "bad",
          "template:orbital",
          "project:hello",
        ]),
    };
    expect(readFavorites(storage)).toEqual([
      "template:orbital",
      "project:hello",
    ]);
    expect(readFavorites({ getItem: () => "broken" })).toEqual([]);
    expect(
      readFavorites({
        getItem: () => {
          throw Error("denied");
        },
      }),
    ).toEqual([]);
    let data = "";
    writeFavorites(["template:orbital"], {
      setItem: (_key, value) => {
        data = value;
      },
    });
    expect(JSON.parse(data)).toEqual(["template:orbital"]);
    expect(() => writeFavorites(["bad"], { setItem: () => {} })).toThrow();
  });
});
